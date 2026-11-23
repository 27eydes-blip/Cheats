// Jericho server: serves the web page and the small JSON API it talks to.
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { Brain } from "./brain.js";
import { publicConfig, ROOT, secrets, settings } from "./config.js";
import { logAction, logPath } from "./logger.js";
import * as memory from "./memory.js";
import { callAudio, handleTwilio, publicCalls, validTwilioSignature } from "./calls/manager.js";
import { callSettings } from "./calls/policy.js";
import { errorDetails, setWarm } from "./net.js";
import { jobEvents } from "./tools/claudeCode.js";
import { selfTest } from "./selftest.js";
import { controlInfo } from "./tools/pc.js";
import { streamSpeech } from "./tts.js";

const PUBLIC_DIR = path.join(ROOT, "public");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8" };

if (!secrets.anthropicKey) console.warn("⚠️  ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add it.");
if (!secrets.elevenLabsKey) console.warn("⚠️  ELEVENLABS_API_KEY is not set. Jericho will use the browser's built-in voice.");

const brain = new Brain();
const listeners = new Set(); // open /api/events streams
jobEvents.on("announce", (text) => {
  for (const res of listeners) res.write(`data: ${JSON.stringify({ type: "announce", text })}\n\n`);
});

function authorized(req, url) {
  if (!secrets.accessToken) return true;
  const given = req.headers["x-jericho-token"] || url.searchParams.get("token") || "";
  const a = Buffer.from(String(given));
  const b = Buffer.from(secrets.accessToken);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
}

async function readBody(req, limit = 20_000) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit) throw new Error("Request too large");
  }
  return body;
}

async function readJson(req) {
  return JSON.parse((await readBody(req)) || "{}");
}

/** Twilio webhooks: no access token (Twilio can't send one), but every request must carry Twilio's signature. */
async function twilioRoute(req, res, url) {
  try {
    if (req.method === "GET" && url.pathname.startsWith("/twilio/audio/")) {
      const id = url.pathname.split("/").pop();
      const buf = /^[0-9a-f]{32}$/.test(id) ? await callAudio(id) : null;
      if (!buf) return res.writeHead(404).end();
      return res.writeHead(200, { "content-type": "audio/mpeg", "content-length": buf.length }).end(buf);
    }
    const params = Object.fromEntries(new URLSearchParams(await readBody(req, 50_000)));
    const fullUrl = callSettings().publicUrl + req.url;
    if (!validTwilioSignature(req.headers["x-twilio-signature"], fullUrl, params)) {
      logAction("twilio_rejected", { path: url.pathname, reason: "bad signature" });
      return res.writeHead(403).end("Forbidden");
    }
    const kind = { "/twilio/voice": "voice", "/twilio/gather": "gather", "/twilio/status": "status" }[url.pathname];
    if (!kind) return res.writeHead(404).end();
    const xml = await handleTwilio(kind, url.searchParams.get("call"), params);
    res.writeHead(200, { "content-type": xml ? "text/xml" : "text/plain" }).end(xml);
  } catch (err) {
    logAction("error", { where: url.pathname, error: err.message, cause: errorDetails(err) });
    res.writeHead(200, { "content-type": "text/xml" }).end('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>');
  }
}

/** /api/ask and /api/confirm stream one JSON line per sentence, so speaking can start early. */
async function streamTurn(req, res, url) {
  const { sessionId, text, speechMs, typed, interrupted } = await readJson(req);
  // how it was said (speaking time from the page), so Jericho can read pace
  const meta = { speechMs: Number.isFinite(Number(speechMs)) ? Math.max(0, Math.min(120_000, Number(speechMs))) : undefined, typed: Boolean(typed), interrupted: Boolean(interrupted) };
  if (!sessionId || typeof text !== "string" || !text.trim()) return sendJson(res, 400, { error: "sessionId and text are required" });
  res.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" });
  const send = (obj) => res.write(`${JSON.stringify(obj)}\n`);
  const hooks = {
    onSentence: (sentence) => send({ type: "sentence", text: sentence }),
    onCard: (card) => send({ type: "card", card }), // e.g. the Briefing card
  };
  try {
    const result =
      url.pathname === "/api/ask"
        ? await brain.handle(String(sessionId), text.trim(), hooks, meta)
        : await brain.confirm(String(sessionId), text.trim(), hooks, meta);
    send({ type: "done", ...result });
  } catch (err) {
    logAction("error", { where: url.pathname, error: err.message, cause: errorDetails(err) });
    send({ type: "sentence", text: "Sorry, something went wrong on my end." });
    send({ type: "done", reply: "", awaitingConfirmation: false });
  }
  res.end();
}

/** The last few actions from logs/actions.log (already redacted), newest first. */
const ACTION_TYPES = new Set(["pc_action", "tool_call", "confirmation_requested", "confirmed", "declined", "action_blocked", "kill_switch", "claude_code_started", "claude_code_finished", "call_started", "call_ended", "call_blocked"]);
function recentActions(n) {
  let text = "";
  try {
    const size = fs.statSync(logPath).size;
    const fd = fs.openSync(logPath, "r");
    const len = Math.min(size, 400_000);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    fs.closeSync(fd);
    text = buf.toString("utf8");
  } catch {
    return [];
  }
  const out = [];
  for (const line of text.split("\n").reverse()) {
    if (out.length >= n) break;
    try {
      const e = JSON.parse(line);
      if (!ACTION_TYPES.has(e.type)) continue;
      if (e.type === "tool_call" && e.tool === "lights") continue;
      const { time, type, sessionId: _s, ...rest } = e;
      out.push({ time, type, detail: JSON.stringify(rest).slice(0, 220) });
    } catch {
      /* partial line */
    }
  }
  return out;
}

const num = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : undefined);

// Three.js is served from node_modules (only its build and examples/jsm folders).
const THREE_DIR = path.join(ROOT, "node_modules", "three");
function serveVendor(url, res) {
  const rel = decodeURIComponent(url.pathname.slice("/vendor/three/".length));
  const file = path.resolve(THREE_DIR, rel);
  const allowed = [path.join(THREE_DIR, "build") + path.sep, path.join(THREE_DIR, "examples", "jsm") + path.sep];
  if (!allowed.some((dir) => file.startsWith(dir)) || !file.endsWith(".js") || !fs.existsSync(file)) {
    res.writeHead(404).end("Not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[".js"], "cache-control": "public, max-age=86400" });
  fs.createReadStream(file).pipe(res);
}

function serveStatic(url, res) {
  if (url.pathname.startsWith("/vendor/three/")) return serveVendor(url, res);
  const pages = { "/": "index.html", "/memory": "memory.html", "/calls": "calls.html" };
  const rel = pages[url.pathname] || decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end("Not found");
    return;
  }
  const ext = path.extname(file);
  // Fonts never change: let the browser keep them (they're also why the page works offline).
  const cache = ext === ".woff2" ? { "cache-control": "public, max-age=31536000, immutable" } : {};
  res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream", ...cache });
  fs.createReadStream(file).pipe(res);
}

async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/twilio/")) return twilioRoute(req, res, url);
  if (!url.pathname.startsWith("/api/")) return serveStatic(url, res);
  if (!authorized(req, url)) return sendJson(res, 401, { error: "Wrong or missing access token" });

  try {
    if (req.method === "GET" && url.pathname === "/api/config") return sendJson(res, 200, publicConfig());

    if (req.method === "POST" && (url.pathname === "/api/ask" || url.pathname === "/api/confirm")) {
      return await streamTurn(req, res, url);
    }

    // The kill switch: "Jericho, stop" / "cancel everything" / the Stop button.
    // Barge-in: stop the reply being spoken, nothing else (tools and jobs keep running).
    if (req.method === "POST" && url.pathname === "/api/interrupt") {
      const { sessionId } = await readJson(req);
      return sendJson(res, 200, { ok: true, ...brain.interrupt(String(sessionId || "")) });
    }

    if (req.method === "POST" && url.pathname === "/api/stop") {
      const { sessionId } = await readJson(req);
      return sendJson(res, 200, { ok: true, ...brain.stopAll(String(sessionId || "")) });
    }

    // The Control section of the Memory page: allowed folders, tiers and the last 20 actions.
    if (req.method === "GET" && url.pathname === "/api/control") {
      return sendJson(res, 200, { ...controlInfo(), recent: recentActions(20) });
    }

    // The wake word was heard: get Claude's prompt cache ready before the request arrives.
    if (req.method === "POST" && url.pathname === "/api/warm") {
      const { sessionId } = await readJson(req);
      brain.prewarm(String(sessionId || "")).catch(() => {});
      return sendJson(res, 200, { ok: true });
    }

    // How long each step took, measured by the page (plus the server's own numbers).
    if (req.method === "POST" && url.pathname === "/api/timing") {
      const b = await readJson(req);
      logAction("timing", {
        sessionId: String(b.sessionId || ""),
        listeningMs: num(b.listeningMs),
        stoppedTalkingToFinalMs: num(b.stoppedTalkingToFinalMs),
        thinkingMs: num(b.thinkingMs),
        firstAudioMs: num(b.firstAudioMs),
        stoppedTalkingToAudioMs: num(b.stoppedTalkingToAudioMs),
        totalMs: num(b.totalMs),
        voice: ["elevenlabs", "browser", "mixed"].includes(b.voice) ? b.voice : undefined,
        server: b.server && {
          firstTokenMs: num(b.server.firstTokenMs),
          firstSentenceMs: num(b.server.firstSentenceMs),
          totalMs: num(b.server.totalMs),
          rounds: num(b.server.rounds),
          models: Array.isArray(b.server.models) ? b.server.models.map(String).slice(0, 4) : undefined,
        },
      });
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/api/calls") {
      const cfg = callSettings();
      return sendJson(res, 200, { testMode: cfg.testMode, calls: publicCalls() });
    }

    // ---- memory page + conversation learning ----
    if (req.method === "GET" && url.pathname === "/api/memory") {
      return sendJson(res, 200, {
        memories: memory.listMemories(),
        style: memory.getStyle(),
        profile: memory.getProfile(),
        lessons: memory.listLessons(),
        categories: memory.PROFILE_CATEGORIES,
      });
    }
    if (req.method === "POST" && url.pathname === "/api/profile/delete") {
      const { id } = await readJson(req);
      return sendJson(res, 200, memory.deleteProfileItem(String(id), "memory-page"));
    }
    if (req.method === "POST" && url.pathname === "/api/profile/recent/delete") {
      const { index } = await readJson(req);
      return sendJson(res, 200, memory.deleteRecentSummary(Number(index), "memory-page"));
    }
    if (req.method === "POST" && url.pathname === "/api/lessons/delete") {
      const { id } = await readJson(req);
      return sendJson(res, 200, memory.deleteLesson(String(id), "memory-page"));
    }
    if (req.method === "POST" && url.pathname === "/api/memory/delete") {
      const { id } = await readJson(req);
      return sendJson(res, 200, memory.deleteMemory(String(id), "memory-page"));
    }
    if (req.method === "POST" && url.pathname === "/api/style/delete") {
      const { section, index } = await readJson(req);
      return sendJson(res, 200, memory.deleteStyleItem(String(section), Number(index), "memory-page"));
    }
    if (req.method === "POST" && url.pathname === "/api/memory/wipe") {
      return sendJson(res, 200, memory.wipeAll("memory-page"));
    }
    if (req.method === "POST" && url.pathname === "/api/conversation-end") {
      const { sessionId } = await readJson(req);
      return sendJson(res, 200, { learning: brain.conversationEnded(String(sessionId || "")) });
    }

    if (req.method === "GET" && url.pathname === "/api/tts") {
      const text = url.searchParams.get("text") || "";
      if (!text.trim()) return sendJson(res, 400, { error: "text is required" });
      return streamSpeech(text, res);
    }

    if (req.method === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      res.write(": connected\n\n");
      listeners.add(res);
      setWarm(true); // keep connections to Claude and ElevenLabs open while a page is open
      const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
      req.on("close", () => {
        clearInterval(ping);
        listeners.delete(res);
        if (listeners.size === 0) setWarm(false);
      });
      return;
    }

    sendJson(res, 404, { error: "Unknown endpoint" });
  } catch (err) {
    logAction("error", { where: url.pathname, error: err.message, cause: errorDetails(err) });
    sendJson(res, 500, { error: "Server error" });
  }
}

const keyFile = path.join(ROOT, "certs/key.pem");
const certFile = path.join(ROOT, "certs/cert.pem");
const useHttps = fs.existsSync(keyFile) && fs.existsSync(certFile);
const server = useHttps
  ? https.createServer({ key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }, handler)
  : http.createServer(handler);

const port = Number(process.env.PORT || settings.port || 3000);
server.listen(port, settings.host || "0.0.0.0", () => {
  const scheme = useHttps ? "https" : "http";
  console.log(`\n🤖 ${settings.assistantName || "Jericho"} is running.`);
  console.log(`   Laptop:  ${scheme}://localhost:${port}`);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === "IPv4" && !a.internal) console.log(`   Phone:   ${scheme}://${a.address}:${port}${useHttps ? "" : "   (needs HTTPS for the mic, see README)"}`);
    }
  }
  console.log(`   Actions are logged to ${logPath}`);
  const calls = callSettings();
  console.log(`   Phone calls: ${calls.testMode ? "TEST MODE (simulated, nothing is dialed)" : `LIVE via Twilio, webhooks at ${calls.publicUrl || "(calls.publicUrl not set!)"}`}`);
  if (!secrets.accessToken) console.log("   Tip: set JERICHO_ACCESS_TOKEN in .env before opening Jericho from other devices.");
  console.log("");
  // One tiny request to Claude and one to ElevenLabs, so a broken connection or key shows up now.
  if (process.env.JERICHO_SKIP_SELFTEST !== "1") selfTest(brain.client).then(() => console.log(""));
});

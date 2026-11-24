// Jericho server: serves the web page and the small JSON API it talks to.
import crypto from "node:crypto";
import zlib from "node:zlib";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { Brain } from "./brain.js";
import { publicConfig, ROOT, secrets, settings } from "./config.js";
import { logAction, logPath, scrubEnvValues } from "./logger.js";
import * as memory from "./memory.js";
import { callAudio, handleTwilio, publicCalls, validTwilioSignature } from "./calls/manager.js";
import { callSettings } from "./calls/policy.js";
import { errorDetails, setWarm, startIdleWarm } from "./net.js";
import { jobEvents } from "./tools/claudeCode.js";
import { formatResults, selfTestIsolated } from "./selftest.js";
import { installCrashLog } from "./crashlog.js";
import { getCalendar, getNextEvent } from "./briefing/calendar.js";
import { checkApiRequest } from "./guard.js";
import { alarms } from "./alarms/manager.js";
import { getForecast, getWeather } from "./briefing/weather.js";
import { cleanLatency } from "../public/latency.js";
import { controlInfo } from "./tools/pc.js";
import { streamSpeech } from "./tts.js";
import { acceptsGzip, sendStatic } from "./static.js";

const PUBLIC_DIR = path.join(ROOT, "public");

if (!secrets.anthropicKey) console.warn("⚠️  ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add it.");
if (!secrets.elevenLabsKey) console.warn("⚠️  ELEVENLABS_API_KEY is not set. Jericho will use the browser's built-in voice.");

const brain = new Brain();
const listeners = new Set(); // open /api/events streams
jobEvents.on("announce", (text) => {
  for (const res of listeners) res.write(`data: ${JSON.stringify({ type: "announce", text })}\n\n`);
});
// Alarms: tell every open page when one rings, stops or the list changes.
const pushEvent = (obj) => {
  for (const res of listeners) res.write(`data: ${JSON.stringify(obj)}\n\n`);
};
alarms.on("ring", (alarm) => pushEvent({ type: "alarm", alarm }));
alarms.on("stopped", (info) => pushEvent({ type: "alarm-stopped", ...info }));
alarms.on("changed", () => pushEvent({ type: "alarms-changed" }));

function authorized(req, url) {
  if (!secrets.accessToken) return true;
  const given = req.headers["x-jericho-token"] || url.searchParams.get("token") || "";
  const a = Buffer.from(String(given));
  const b = Buffer.from(secrets.accessToken);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Responses are gzipped when the browser accepts it and they're big enough to be worth it.
let currentReq = null; // set by handler() for sendJson's accept-encoding check
function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  if (body.length > 1400 && acceptsGzip(res.req || currentReq)) {
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "content-encoding": "gzip", vary: "accept-encoding" });
    return res.end(zlib.gzipSync(body, { level: 5 }));
  }
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(body);
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
  const { sessionId, text, speechMs, typed, interrupted, route } = await readJson(req);
  // how it was said (speaking time from the page), so Jericho can read pace
  const meta = {
    speechMs: Number.isFinite(Number(speechMs)) ? Math.max(0, Math.min(120_000, Number(speechMs))) : undefined,
    typed: Boolean(typed),
    interrupted: Boolean(interrupted),
    route: ["auto", "always-strong"].includes(route) ? route : undefined, // the sun panel's Brain setting
  };
  if (!sessionId || typeof text !== "string" || !text.trim()) return sendJson(res, 400, { error: "sessionId and text are required" });
  res.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" });
  res.flushHeaders?.();
  let closed = false;
  res.on("close", () => (closed = true));
  const send = (obj) => !closed && res.write(`${JSON.stringify(obj)}\n`);
  const hooks = {
    onSentence: (sentence) => send({ type: "sentence", text: sentence }),
    onCard: (card) => send({ type: "card", card }), // e.g. the Briefing card
    // progress marks for the latency readout: the first Claude token, and which brain answered
    onMark: (stage, value) => send({ type: "mark", stage, ...(value ? { value } : {}) }),
  };
  // A heartbeat while tools run, so the page can tell "slow" from "gone" and never hangs.
  const beat = setInterval(() => send({ type: "tick" }), 10_000);
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
  } finally {
    clearInterval(beat);
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
/** decodeURIComponent that answers 400 instead of throwing on a broken %-sequence. */
function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

function serveVendor(url, res, req) {
  const rel = safeDecode(url.pathname.slice("/vendor/three/".length));
  if (rel === null) return res.writeHead(400).end("Bad request");
  const file = path.resolve(THREE_DIR, rel);
  const allowed = [path.join(THREE_DIR, "build") + path.sep, path.join(THREE_DIR, "examples", "jsm") + path.sep];
  if (!allowed.some((dir) => file.startsWith(dir)) || !file.endsWith(".js") || !fs.existsSync(file)) {
    res.writeHead(404).end("Not found");
    return;
  }
  // a library build: changes only when Jericho's packages are updated
  sendStatic(req, res, file, { cacheControl: "public, max-age=604800, stale-while-revalidate=86400" });
}

function serveStatic(url, res, req) {
  if (url.pathname.startsWith("/vendor/three/")) return serveVendor(url, res, req);
  const pages = { "/": "index.html", "/memory": "memory.html", "/calls": "calls.html" };
  const decoded = pages[url.pathname] ? null : safeDecode(url.pathname);
  if (!pages[url.pathname] && decoded === null) return res.writeHead(400).end("Bad request");
  const rel = pages[url.pathname] || decoded.replace(/^\/+/, "");
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end("Not found");
    return;
  }
  const ext = path.extname(file);
  // Fonts never change: the browser keeps them for a year (they're also why the page works
  // offline). The page's own files are kept too, but checked with the ETag on each load, so an
  // update to Jericho shows up at once (a 304 "not changed" answer is tiny and instant).
  const cacheControl = ext === ".woff2" ? "public, max-age=31536000, immutable" : "no-cache";
  sendStatic(req, res, file, { cacheControl });
}

async function handler(req, res) {
  currentReq = req;
  try {
    await route(req, res);
  } catch (err) {
    // nothing may leave a request hanging
    logAction("error", { where: "request", error: err.message });
    if (!res.headersSent) sendJson(res, 500, { error: "Server error" });
    else res.end();
  }
}

async function route(req, res) {
  let url;
  try {
    url = new URL(req.url, "http://localhost");
  } catch {
    return res.writeHead(400).end("Bad request");
  }
  if (url.pathname.startsWith("/twilio/")) return twilioRoute(req, res, url);
  if (!url.pathname.startsWith("/api/")) return serveStatic(url, res, req);
  // other websites, DNS tricks, and (without a token) other devices are refused first
  const refused = checkApiRequest({ headers: req.headers, remoteAddress: req.socket?.remoteAddress, hasToken: Boolean(secrets.accessToken), extraHosts: settings.allowedHosts || [] });
  if (refused) return sendJson(res, refused.status, { error: refused.error });
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

    // Alarms: the list (and anything ringing), stop, snooze, cancel, and the page saying it's ringing
    if (req.method === "GET" && url.pathname === "/api/alarms") {
      return sendJson(res, 200, { alarms: alarms.list(), ringing: alarms.list().filter((a) => a.state === "ringing"), snoozeMinutes: alarms.snoozeMinutes });
    }
    if (req.method === "POST" && url.pathname.startsWith("/api/alarm/")) {
      const body = await readJson(req).catch(() => ({}));
      const id = Number.isInteger(Number(body.id)) && body.id != null ? Number(body.id) : null;
      const action = url.pathname.slice("/api/alarm/".length);
      if (action === "stop") return sendJson(res, 200, await alarms.stop(id, "stopped from the page"));
      if (action === "snooze") return sendJson(res, 200, await alarms.snooze(id, body.minutes));
      if (action === "cancel" && id != null) {
        const a = alarms.store.get(id);
        if (!a) return sendJson(res, 404, { error: "No such alarm" });
        const n = alarms.list().findIndex((x) => x.id === id) + 1;
        return sendJson(res, 200, { ok: true, cancelled: await alarms.cancel(String(n), "cancelled from the page") });
      }
      if (action === "ack") return sendJson(res, 200, alarms.ack(id));
      if (action === "blocked") return sendJson(res, 200, alarms.blocked());
      return sendJson(res, 404, { error: "Unknown alarm action" });
    }

    // The page's corner readouts: current weather and the next calendar event (each may be missing).
    if (req.method === "GET" && url.pathname === "/api/hud") {
      const [w, next] = await Promise.all([getWeather().catch(() => ({ ok: false })), getNextEvent().catch(() => ({ ok: false }))]);
      const weather = w.ok ? { ok: true, place: w.place, now: w.now, units: w.units, sky: w.sky, high: w.high, low: w.low } : { ok: false };
      const event = next.ok ? { ok: true, title: String(next.title).slice(0, 80), day: next.day, time: next.time } : { ok: false };
      return sendJson(res, 200, { weather, event });
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
      return streamSpeech(text, res, { model: url.searchParams.get("model") || undefined });
    }

    // One turn's latency (numbers only: see public/latency.js), appended to logs/latency.log.
    if (req.method === "POST" && url.pathname === "/api/latency") {
      const entry = cleanLatency(await readJson(req));
      fs.promises.appendFile(latencyLog, `${JSON.stringify({ time: new Date().toISOString(), ...entry })}\n`).catch(() => {});
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      res.write(": connected\n\n");
      listeners.add(res);
      setWarm(true); // keep connections to Claude and ElevenLabs open while a page is open
      startPrefetch();
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

const latencyLog = path.join(path.dirname(logPath), "latency.log");

// Cheap data that's often asked for (weather, calendar) is fetched in the background while a
// page is open, so those tools answer from memory instantly. The caches last 5 minutes; this
// refreshes them every 4, before they run out.
let prefetchTimer = null;
function prefetchNow() {
  Promise.allSettled([getWeather(), getForecast(), getCalendar()]).catch(() => {});
}
function startPrefetch() {
  if (prefetchTimer) return;
  prefetchNow();
  prefetchTimer = setInterval(() => {
    if (listeners.size === 0) {
      clearInterval(prefetchTimer);
      prefetchTimer = null;
      return;
    }
    prefetchNow();
  }, 4 * 60_000);
  prefetchTimer.unref();
}

const keyFile = path.join(ROOT, "certs/key.pem");
const certFile = path.join(ROOT, "certs/cert.pem");
const useHttps = fs.existsSync(keyFile) && fs.existsSync(certFile);
const server = useHttps
  ? https.createServer({ key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }, handler)
  : http.createServer(handler);

const port = Number(process.env.PORT || settings.port || 3000);
// Why Jericho stopped (if it ever does): every exit, error and stop signal goes to logs/crash.log,
// and a stray background error is logged instead of crashing the server.
installCrashLog({
  file: path.join(path.dirname(logPath), "crash.log"),
  scrub: (t) => scrubEnvValues(String(t)),
});
alarms.start(); // reload saved alarms and keep checking them
startIdleWarm(); // DNS + TLS to Claude and ElevenLabs ready before the first request
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
  // In its own process: the server is already answering, and nothing the checks do can stop it.
  if (process.env.JERICHO_SKIP_SELFTEST !== "1") {
    selfTestIsolated()
      .then((r) => console.log(`${formatResults(r)}\n`))
      .catch((err) => console.warn("Self-test couldn't run:", err.message));
  }
});

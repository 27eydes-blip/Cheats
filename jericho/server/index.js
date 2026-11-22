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
import { jobEvents } from "./tools/claudeCode.js";
import { streamSpeech } from "./tts.js";

const PUBLIC_DIR = path.join(ROOT, "public");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json" };

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

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 20_000) throw new Error("Request too large");
  }
  return JSON.parse(body || "{}");
}

function serveStatic(url, res) {
  const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end("Not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

async function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith("/api/")) return serveStatic(url, res);
  if (!authorized(req, url)) return sendJson(res, 401, { error: "Wrong or missing access token" });

  try {
    if (req.method === "GET" && url.pathname === "/api/config") return sendJson(res, 200, publicConfig());

    if (req.method === "POST" && (url.pathname === "/api/ask" || url.pathname === "/api/confirm")) {
      const { sessionId, text } = await readJson(req);
      if (!sessionId || typeof text !== "string" || !text.trim()) return sendJson(res, 400, { error: "sessionId and text are required" });
      const result =
        url.pathname === "/api/ask" ? await brain.handle(String(sessionId), text.trim()) : await brain.confirm(String(sessionId), text.trim());
      return sendJson(res, 200, result);
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
      const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
      req.on("close", () => {
        clearInterval(ping);
        listeners.delete(res);
      });
      return;
    }

    sendJson(res, 404, { error: "Unknown endpoint" });
  } catch (err) {
    logAction("error", { where: url.pathname, error: err.message });
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
  if (!secrets.accessToken) console.log("   Tip: set JERICHO_ACCESS_TOKEN in .env before opening Jericho from other devices.");
  console.log("");
});

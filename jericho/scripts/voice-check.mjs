#!/usr/bin/env node
// npm run voice:check — the last 20 voice turns: which model answered, Claude tokens, how long
// until the first word was heard, and echo drops. Numbers and labels only: never what was said,
// never keys. Reads logs/latency.log (written by the page) and logs/actions.log (turn_stats).
import fs from "node:fs";
import path from "node:path";
import { ROOT, settings } from "../server/config.js";
import { cleanLatency } from "../public/latency.js";

const N = 20;
const logDir = path.dirname(path.resolve(ROOT, settings.logFile || "logs/actions.log"));

/** The last `n` JSON lines of a file (reads only the tail). */
export function tailJson(file, n = N, maxBytes = 400_000) {
  let text = "";
  try {
    const size = fs.statSync(file).size;
    const fd = fs.openSync(file, "r");
    const len = Math.min(size, maxBytes);
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
      out.push(JSON.parse(line));
    } catch {
      /* a partial first line */
    }
  }
  return out.reverse();
}

const short = (m) => String(m || "").replace(/^claude-/, "");
const num = (v) => (v == null ? "-" : String(v));

/** One row per turn, from the page's latency entries (preferred) or the server's turn_stats. */
export function rows({ latency = [], stats = [] } = {}) {
  if (latency.length) {
    return latency.map((raw) => {
      const e = cleanLatency(raw); // only known numbers and labels survive
      return { time: String(raw.time || "").slice(0, 19).replace("T", " "), route: e.route || "-", models: (e.models || []).map(short).join("+") || "-", tokensIn: e.tokens ? (e.tokens.in || 0) + (e.tokens.cacheRead || 0) + (e.tokens.cacheWrite || 0) : null, tokensOut: e.tokens?.out ?? null, cacheRead: e.tokens?.cacheRead ?? null, firstWordMs: e.playing ?? e.audioByte ?? null, echoes: e.echoes ?? 0 };
    });
  }
  return stats
    .filter((s) => s.type === "turn_stats")
    .map((s) => ({ time: String(s.time || "").slice(0, 19).replace("T", " "), route: ["fast", "strong", "local"].includes(s.route) ? s.route : "-", models: (Array.isArray(s.models) ? s.models : []).filter((m) => /^claude-[a-z0-9.-]+$/.test(m)).map(short).join("+") || "-", tokensIn: s.tokens ? (s.tokens.in || 0) + (s.tokens.cacheRead || 0) + (s.tokens.cacheWrite || 0) : null, tokensOut: s.tokens?.out ?? null, cacheRead: s.tokens?.cacheRead ?? null, firstWordMs: Number.isFinite(s.firstSentenceMs) ? s.firstSentenceMs : null, echoes: null }));
}

export function report(list) {
  if (!list.length) return "No voice turns logged yet. Talk to Jericho a few times, then run this again.";
  const lines = ["time                 route   model                    tok in  tok out  cached   1st word  echo"];
  for (const r of list) lines.push(`${r.time.padEnd(20)} ${r.route.padEnd(7)} ${r.models.slice(0, 24).padEnd(24)} ${num(r.tokensIn).padStart(6)}  ${num(r.tokensOut).padStart(7)}  ${num(r.cacheRead).padStart(6)}  ${(r.firstWordMs == null ? "-" : `${r.firstWordMs} ms`).padStart(8)}  ${num(r.echoes).padStart(4)}`);
  const words = list.map((r) => r.firstWordMs).filter((v) => v != null).sort((a, b) => a - b);
  const routes = list.reduce((a, r) => ((a[r.route] = (a[r.route] || 0) + 1), a), {});
  const tokOut = list.reduce((a, r) => a + (r.tokensOut || 0), 0);
  const echoes = list.reduce((a, r) => a + (r.echoes || 0), 0);
  lines.push("");
  lines.push(`Turns: ${list.length} (${Object.entries(routes).map(([k, v]) => `${k} ${v}`).join(", ")})`);
  if (words.length) lines.push(`First word: median ${words[Math.floor(words.length / 2)]} ms, slowest ${words.at(-1)} ms`);
  lines.push(`Output tokens: ${tokOut} in total · echo drops: ${echoes}`);
  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("voice-check.mjs")) {
  const latency = tailJson(path.join(logDir, "latency.log"));
  const stats = latency.length ? [] : tailJson(path.join(logDir, "actions.log"), 2000).filter((e) => e.type === "turn_stats").slice(-N);
  console.log(report(rows({ latency, stats })));
}

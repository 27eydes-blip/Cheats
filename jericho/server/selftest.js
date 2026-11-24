// Startup self-test: one tiny request to Claude and one to ElevenLabs, with a clear
// PASS or FAIL and the real reason. Runs when the server starts, or on its own with:
//   npm run selftest
import Anthropic from "@anthropic-ai/sdk";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadSettings, secrets } from "./config.js";
import { logAction } from "./logger.js";
import { connectionMode, errorDetails, errorSummary, keepAliveFetch } from "./net.js";
import { checkCalendar } from "./briefing/calendar.js";
import { CLAUDE_FIX, claudeVersion, findClaude } from "./tools/claudePath.js";

function claudeReason(err) {
  if (err instanceof Anthropic.AuthenticationError) return "the API key was rejected (401). Check ANTHROPIC_API_KEY in .env";
  if (err instanceof Anthropic.PermissionDeniedError) return "the API key isn't allowed to do this (403)";
  if (err instanceof Anthropic.RateLimitError) return "rate limited (429), try again in a minute";
  if (err instanceof Anthropic.APIConnectionError) return `couldn't connect: ${errorSummary(err.cause || err)}`;
  if (err instanceof Anthropic.APIError) return `HTTP ${err.status}: ${err.message}`;
  return errorSummary(err);
}

async function testClaude(client) {
  if (!secrets.anthropicKey && !process.env.ANTHROPIC_AUTH_TOKEN) return { status: "FAIL", reason: "ANTHROPIC_API_KEY isn't set in .env" };
  const t0 = Date.now();
  try {
    await client.models.list({ limit: 1 }, { timeout: 10_000, maxRetries: 0 }); // free: checks the key and the connection
    return { status: "PASS", reason: `${Date.now() - t0} ms` };
  } catch (err) {
    return { status: "FAIL", reason: claudeReason(err), cause: errorDetails(err) };
  }
}

async function testElevenLabs() {
  if (!secrets.elevenLabsKey) return { status: "SKIP", reason: "no ELEVENLABS_API_KEY in .env, so the browser voice will be used" };
  const el = loadSettings().elevenlabs || {};
  const t0 = Date.now();
  try {
    // Three characters of speech: checks the key, the voice ID and the connection together.
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(el.voiceId)}?output_format=mp3_22050_32`;
    const res = await keepAliveFetch(url, {
      method: "POST",
      headers: { "xi-api-key": secrets.elevenLabsKey, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text: "Hi.", model_id: el.modelId || "eleven_flash_v2_5" }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = Buffer.from(await res.arrayBuffer());
    if (res.ok) return { status: "PASS", reason: `${Date.now() - t0} ms, voice ${el.voiceId}` };
    let detail = body.toString("utf8").slice(0, 300);
    try {
      const j = JSON.parse(detail);
      detail = j.detail?.message || j.detail?.status || JSON.stringify(j.detail || j);
    } catch {
      /* not JSON */
    }
    const hint =
      res.status === 401 ? " Check ELEVENLABS_API_KEY in .env, and that the key has text-to-speech access."
        : res.status === 404 || /voice/i.test(detail) ? ` Check elevenlabs.voiceId (${el.voiceId}) in settings.json.`
        : "";
    return { status: "FAIL", reason: `HTTP ${res.status}: ${detail}.${hint}` };
  } catch (err) {
    return { status: "FAIL", reason: `couldn't connect: ${errorSummary(err)}`, cause: errorDetails(err) };
  }
}

/**
 * Is Claude Code signed in? Its login lives in ~/.claude/.credentials.json (Windows, Linux) or
 * ~/.claude.json ("oauthAccount"); an ANTHROPIC_API_KEY also works. Checked without running it.
 */
export function claudeSignedIn({ home = os.homedir(), env = process.env, exists = fs.existsSync, read = (f) => fs.readFileSync(f, "utf8") } = {}) {
  if (env.ANTHROPIC_API_KEY) return true;
  if (exists(path.join(home, ".claude", ".credentials.json"))) return true;
  try {
    return /"oauthAccount"\s*:\s*\{/.test(read(path.join(home, ".claude.json")));
  } catch {
    return false;
  }
}

/** Where Claude Code's `claude` command is, and its version (run once, never retried). */
export async function testClaudeCode(cfg = loadSettings().claudeCode || {}, { signedIn = claudeSignedIn } = {}) {
  const found = findClaude({ setting: cfg.path, command: cfg.command || "claude" });
  if (!found.found) return { status: "FAIL", reason: `${found.reason}. ${CLAUDE_FIX}` };
  if (!signedIn()) return { status: "SKIP", reason: `found ${found.path}, but it isn't signed in yet: run "claude" once in a terminal to log in` };
  try {
    const version = await claudeVersion(found);
    return { status: "PASS", reason: `${found.path} (found via ${found.via}), ${version}` };
  } catch (err) {
    return { status: "FAIL", reason: `found ${found.path}, but it didn't run: ${errorSummary(err)}. ${CLAUDE_FIX}` };
  }
}

/** The calendar link: PASS with today's count, or FAIL with a plain reason. Never prints the link. */
export async function testCalendar() {
  try {
    const r = await checkCalendar();
    return { status: r.status, reason: r.reason };
  } catch (err) {
    return { status: "FAIL", reason: "the check itself failed" };
  }
}

/** A check that takes too long is reported as FAIL instead of holding up the rest. */
export function limit(promise, ms = 15_000) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).catch((err) => ({ status: "FAIL", reason: errorSummary(err) })),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve({ status: "FAIL", reason: `no answer within ${Math.round(ms / 1000)} seconds` }), ms);
      timer.unref?.();
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Runs the checks side by side (each with a time limit). */
export async function runChecks(client = new Anthropic({ fetch: (url, init) => keepAliveFetch(url, init) })) {
  const [claude, eleven, calendar, claudeCode] = await Promise.all([limit(testClaude(client)), limit(testElevenLabs()), limit(testCalendar()), limit(testClaudeCode(), 20_000)]);
  return { node: process.version, connections: connectionMode(), claude, elevenlabs: eleven, calendar, claudeCode };
}

const MARK = { PASS: "✅ PASS", FAIL: "❌ FAIL", SKIP: "➖ SKIP" };
const line = (r) => (r ? `${MARK[r.status] || r.status}  ${r.reason}` : "❌ FAIL  no result");
/** The self-test lines for the console. */
export function formatResults(r) {
  return [
    `   Self-test (Node ${r.node || process.version}, connections: ${r.connections || connectionMode()}):`,
    `     Claude      ${line(r.claude)}`,
    `     ElevenLabs  ${line(r.elevenlabs)}`,
    `     Calendar    ${line(r.calendar)}`,
    `     Claude Code ${line(r.claudeCode)}`,
  ].join("\n");
}

/** `npm run selftest`: runs the checks here and prints them. Returns true if Claude and ElevenLabs didn't fail. */
export async function selfTest(client) {
  const r = await runChecks(client);
  console.log(formatResults(r));
  logAction("selftest", r);
  return r.claude.status !== "FAIL" && r.elevenlabs.status !== "FAIL";
}

const SELF = fileURLToPath(import.meta.url);

/**
 * The server's self-test, fully isolated: the checks run in their own Node process, detached from
 * the server's console and process group (on Windows a child sharing the console can deliver
 * Ctrl+C/Ctrl+Break to it, which silently stops the server). Whatever happens there (a hang, a
 * crash, a stray signal) can't stop or slow the server. After `timeoutMs` the whole process tree
 * is ended. Never rejects; never retries.
 */
export function selfTestIsolated({ timeoutMs = 40_000, spawnFn = spawn, script = SELF, args = ["--json"], kill = killTree } = {}) {
  return new Promise((resolve) => {
    let out = "";
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(r);
    };
    const failAll = (reason) => {
      const f = { status: "FAIL", reason };
      return { isolatedError: reason, claude: f, elevenlabs: f, calendar: f, claudeCode: f };
    };
    let child;
    try {
      child = spawnFn(process.execPath, [script, ...args], {
        cwd: path.dirname(path.dirname(SELF)),
        env: process.env,
        detached: true, // its own process group (and no console on Windows)
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch (err) {
      resolve(failAll(`the self-test couldn't start: ${err.message}`));
      return;
    }
    const timer = setTimeout(() => {
      kill(child);
      finish(failAll(`the self-test didn't finish within ${Math.round(timeoutMs / 1000)} seconds`));
    }, timeoutMs);
    timer.unref?.();
    child.stdout?.on("data", (d) => (out += d));
    child.on("error", (err) => finish(failAll(`the self-test couldn't start: ${err.message}`)));
    child.on("exit", (code) => {
      try {
        finish(JSON.parse(out.trim().split("\n").pop()));
      } catch {
        finish(failAll(`the self-test stopped unexpectedly (exit code ${code})`));
      }
    });
  });
}

/** End a process and everything it started. */
export function killTree(child) {
  if (!child?.pid) return;
  try {
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore", detached: true });
    else process.kill(-child.pid, "SIGKILL");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

// `npm run selftest` (prints), or `--json` when the server runs it in its own process
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  if (process.argv.includes("--json")) {
    const r = await runChecks();
    logAction("selftest", r);
    process.stdout.write(`${JSON.stringify(r)}\n`);
    process.exit(0);
  }
  const ok = await selfTest();
  process.exit(ok ? 0 : 1);
}

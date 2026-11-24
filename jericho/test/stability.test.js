// Stability on weak Windows laptops: the crash/exit log, the safe-start wrapper, the isolated
// self-test, the pre-rendered alarm buffers, Auto alarm performance, and weak-GPU detection.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-stab-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
fs.writeFileSync(path.join(tmp, "settings.json"), JSON.stringify({ ...base, logFile: path.join(tmp, "actions.log") }));
process.env.JERICHO_SETTINGS = path.join(tmp, "settings.json");
process.env.JERICHO_DATA_DIR = path.join(tmp, "data");
globalThis.window = {};

const { installCrashLog } = await import("../server/crashlog.js");
const { decide, runSafe, MAX_RESTARTS } = await import("../scripts/start-safe.mjs");
const { selfTestIsolated, claudeSignedIn, testClaudeCode, formatResults } = await import("../server/selftest.js");
const A = await import("../public/alarm.js");
const { gpuClass, isWeakGpu } = await import("../public/presence/gpu.js");

// ---- the crash / exit log -----------------------------------------------------------------------
function fakeProc() {
  const p = new EventEmitter();
  Object.assign(p, { pid: 4242, version: "v26.1.0", platform: "win32", uptime: () => 12.3 });
  return p;
}
const quiet = { warn() {}, error() {} };

test("crash log: every signal, exit, uncaught error and rejection is written with the reason and code; secrets scrubbed", () => {
  const file = path.join(tmp, "crash-a.log");
  const proc = fakeProc();
  const exits = [];
  const said = [];
  installCrashLog({ file, proc, exit: (c) => exits.push(c), log: { warn: (m) => said.push(m), error: (m) => said.push(m) }, scrub: (t) => t.replaceAll("sk-secret-123", "[private]") });
  proc.emit("SIGINT");
  proc.emit("SIGBREAK");
  proc.emit("SIGTERM");
  proc.emit("unhandledRejection", new Error("fetch failed with sk-secret-123"));
  proc.emit("uncaughtException", new Error("boom"), "uncaughtException");
  proc.emit("beforeExit", 0);
  proc.emit("exit", 1);
  assert.deepEqual(exits, [130, 149, 143, 1], "Ctrl+C 130, Ctrl+Break 149, terminate 143, crash 1; a rejection doesn't exit");
  const lines = fs.readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => l.type), ["start", "signal", "signal", "signal", "unhandled_rejection", "uncaught_exception", "before_exit", "exit"]);
  assert.equal(lines[1].signal, "SIGINT");
  assert.equal(lines[1].meaning, "Ctrl+C");
  assert.equal(lines.at(-1).code, 1);
  assert.ok(lines.at(-1).reason, "the reason for the exit");
  assert.ok(lines.every((l) => l.pid === 4242 && l.time));
  const raw = fs.readFileSync(file, "utf8");
  assert.doesNotMatch(raw, /sk-secret-123/);
  assert.ok(said.some((m) => /Jericho is stopping: it received SIGINT \(Ctrl\+C\)/.test(m)), "a clear console message");
});

test("crash log: an exit nobody explained still says why", () => {
  const file = path.join(tmp, "crash-b.log");
  const proc = fakeProc();
  const said = [];
  installCrashLog({ file, proc, exit: () => {}, log: { warn: (m) => said.push(m), error() {} } });
  proc.emit("exit", 7);
  const last = JSON.parse(fs.readFileSync(file, "utf8").trim().split("\n").at(-1));
  assert.deepEqual([last.type, last.code, last.reason], ["exit", 7, "exit code 7"]);
  assert.match(said[0], /Jericho is stopping \(exit code 7\)/);
});

// ---- npm run start:safe ---------------------------------------------------------------------------
test("safe start: decides restart, stop or give up", () => {
  assert.equal(decide({ code: 1, signal: null, restarts: 0, stopping: false }), "restart");
  assert.equal(decide({ code: null, signal: "SIGKILL", restarts: 2, stopping: false }), "restart");
  assert.equal(decide({ code: 130, signal: null, restarts: 0, stopping: false }), "restart", "a stray Ctrl+C that only reached the server");
  assert.equal(decide({ code: 130, signal: null, restarts: 0, stopping: true }), "stop", "your Ctrl+C");
  assert.equal(decide({ code: 0, signal: null, restarts: 0, stopping: false }), "stop", "a normal exit");
  assert.equal(decide({ code: 1, signal: null, restarts: MAX_RESTARTS, stopping: false }), "give-up");
  assert.equal(MAX_RESTARTS, 5);
});

test("safe start: restarts up to 5 times, logging each, then gives up; Ctrl+C stops it for good", async () => {
  const spawned = [];
  const logs = [];
  const fakeSpawn = () => {
    const c = new EventEmitter();
    c.kill = () => setTimeout(() => c.emit("exit", 130, null), 1);
    spawned.push(c);
    setTimeout(() => c.emit("exit", 1, null), 2); // crashes straight away
    return c;
  };
  const proc = Object.assign(new EventEmitter(), { execPath: process.execPath, env: {} });
  const { result } = runSafe({ spawnFn: fakeSpawn, log: (e) => logs.push(e), print: () => {}, proc, delayMs: 1, graceMs: 1 });
  assert.equal(await result, 1);
  assert.equal(spawned.length, 1 + MAX_RESTARTS, "first run + 5 restarts");
  assert.deepEqual(logs.filter((l) => l.type === "safe_start_restart").map((l) => l.restart), [1, 2, 3, 4, 5]);
  assert.ok(logs.some((l) => l.type === "safe_start_gave_up"));

  // a running server and your Ctrl+C: no restart
  const spawned2 = [];
  const fakeSpawn2 = () => {
    const c = new EventEmitter();
    c.kill = () => setTimeout(() => c.emit("exit", 130, null), 1);
    spawned2.push(c);
    return c;
  };
  const proc2 = Object.assign(new EventEmitter(), { execPath: process.execPath, env: {} });
  const run2 = runSafe({ spawnFn: fakeSpawn2, log: () => {}, print: () => {}, proc: proc2, delayMs: 1, graceMs: 5 });
  proc2.emit("SIGINT");
  assert.equal(await run2.result, 130);
  assert.equal(spawned2.length, 1, "not restarted");
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.scripts["start:safe"], "node scripts/start-safe.mjs");
});

// ---- the isolated self-test -------------------------------------------------------------------------
const fixture = (name) => new URL(`./fixtures/${name}`, import.meta.url).pathname;

test("self-test isolation: a hanging check is ended in time and can't stop or slow the server", async () => {
  const t0 = Date.now();
  let beat = 0;
  const heartbeat = setInterval(() => beat++, 20); // the "server" keeps running meanwhile
  const r = await selfTestIsolated({ script: fixture("hang.mjs"), args: [], timeoutMs: 600 });
  clearInterval(heartbeat);
  assert.ok(Date.now() - t0 < 3000);
  assert.match(r.claudeCode.reason, /didn't finish within 1 seconds|didn't finish within 0 seconds|didn't finish within/);
  assert.ok(beat >= 10, "the server's own work carried on");
  assert.match(formatResults(r), /Claude Code ❌ FAIL/);
});

test("self-test isolation: a crash in the checks is reported, and real results come through", async () => {
  const crashed = await selfTestIsolated({ script: fixture("crash.mjs"), args: [], timeoutMs: 5000 });
  assert.match(crashed.claude.reason, /stopped unexpectedly \(exit code 3\)/);
  const ok = await selfTestIsolated({ script: fixture("answer.mjs"), args: [], timeoutMs: 5000 });
  assert.equal(ok.claude.status, "PASS");
  assert.equal(ok.claudeCode.status, "SKIP");
  // detached from the server's console and process group, and the server uses it
  const src = fs.readFileSync(new URL("../server/selftest.js", import.meta.url), "utf8");
  assert.match(src, /detached: true, \/\/ its own process group/);
  const claudePathSrc = fs.readFileSync(new URL("../server/tools/claudePath.js", import.meta.url), "utf8");
  assert.match(claudePathSrc, /windowsHide: true, detached: true/, "claude --version can't share or signal the console");
});

test("self-test: Claude Code is skipped (not run) when it isn't signed in, and never retried", async () => {
  const home = path.join(tmp, "home");
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  assert.equal(claudeSignedIn({ home, env: {} }), false);
  fs.writeFileSync(path.join(home, ".claude.json"), JSON.stringify({ oauthAccount: { emailAddress: "x" } }));
  assert.equal(claudeSignedIn({ home, env: {} }), true);
  assert.equal(claudeSignedIn({ home: path.join(tmp, "nobody"), env: { ANTHROPIC_API_KEY: "k" } }), true);
  fs.rmSync(path.join(home, ".claude.json"));
  fs.writeFileSync(path.join(home, ".claude", ".credentials.json"), "{}");
  assert.equal(claudeSignedIn({ home, env: {} }), true);
  let ran = 0;
  const r = await testClaudeCode({ command: process.execPath }, { signedIn: () => (ran++, false) });
  assert.equal(r.status, "SKIP");
  assert.match(r.reason, /isn't signed in/);
  assert.equal(ran, 1, "asked once");
});

// ---- pre-rendered alarm buffers -----------------------------------------------------------------------
function mockOffline() {
  const made = [];
  const factory = (channels, length, rate) => {
    const nodes = [];
    const param = (value = 0) => {
      const p = { value };
      for (const m of ["setValueAtTime", "linearRampToValueAtTime", "exponentialRampToValueAtTime", "setTargetAtTime", "cancelScheduledValues"]) p[m] = () => p;
      return p;
    };
    const node = (kind, extra = {}) => {
      const n = { kind, ...extra, connect: (to) => to, disconnect() {} };
      nodes.push(n);
      return n;
    };
    const ctx = {
      sampleRate: rate,
      currentTime: 0,
      destination: { kind: "destination" },
      createGain: () => node("gain", { gain: param(1) }),
      createOscillator: () => node("osc", { frequency: param(440), detune: param(0), start() {}, stop() {} }),
      createBiquadFilter: () => node("filter", { frequency: param(350), Q: param(1), gain: param(0) }),
      createStereoPanner: () => node("pan", { pan: param(0) }),
      createDelay: () => node("delay", { delayTime: param(0) }),
      createWaveShaper: () => node("shaper", {}),
      createDynamicsCompressor: () => node("comp", { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
      createConvolver: () => node("conv", {}),
      createBuffer: (ch, len, r) => ({ length: len, sampleRate: r, duration: len / r, getChannelData: () => new Float32Array(Math.min(len, 64)) }),
      createBufferSource: () => node("buffer", { start() {}, stop() {} }),
      startRendering: async () => ({ length, sampleRate: rate, duration: length / rate }),
    };
    made.push({ ctx, nodes, length, rate });
    return ctx;
  };
  return { factory, made };
}

test("alarm buffers: each cycle is rendered once and reused; the next variant renders separately", async () => {
  const off = mockOffline();
  let clock = 0;
  const cache = new A.AlarmBufferCache({ sampleRate: 44100, makeOffline: off.factory, now: () => (clock += 500) });
  const a = cache.get("strike", "full", 0);
  const b = cache.get("strike", "full", 0);
  assert.equal(a, b, "the same render is shared");
  const item = await a;
  assert.equal(off.made.length, 1);
  assert.equal(item.buffer.length, Math.ceil(A.RENDER_SECONDS.strike * 44100));
  assert.ok(item.length > 15 && item.length <= A.RENDER_SECONDS.strike);
  assert.equal(cache.peek("strike", "full", 0), item);
  await cache.get("strike", "full", 0);
  assert.equal(off.made.length, 1, "not rendered again");
  await cache.get("strike", "full", 7);
  assert.equal(cache.peek("strike", "full", 9), cache.peek("strike", "full", A.VARIANTS - 1), "later cycles reuse the last variant");
  await cache.get("strike", "smooth", 0);
  assert.equal(off.made.length, 3);
  assert.ok(cache.lastRatio > 0, "how long the render took is recorded (for Auto)");
  cache.keepOnly("siren");
  assert.equal(cache.peek("strike", "full", 0), null, "a changed sound frees the old buffers");
});

test("alarm buffers: the city reverb and noise are generated once and shared by every render", async () => {
  const off = mockOffline();
  const cache = new A.AlarmBufferCache({ sampleRate: 22050, makeOffline: off.factory });
  await cache.get("strike", "full", 0);
  const after1 = A.generatedBuffers();
  await cache.get("strike", "full", 1);
  await cache.get("strike", "full", 2);
  assert.deepEqual(A.generatedBuffers(), after1, "no new impulse responses or noise for later renders");
});

test("Smooth: fewer simultaneous layers, no convolution, same timing", async () => {
  const off = mockOffline();
  const cache = new A.AlarmBufferCache({ sampleRate: 8000, makeOffline: off.factory });
  const full = await cache.get("strike", "full", 0);
  const smooth = await cache.get("strike", "smooth", 0);
  const [fullCtx, smoothCtx] = off.made;
  assert.ok(fullCtx.nodes.filter((n) => n.kind === "conv").length >= 5, "Full: convolution reverb");
  assert.equal(smoothCtx.nodes.filter((n) => n.kind === "conv").length, 0, "Smooth: none");
  assert.ok(smoothCtx.nodes.length < fullCtx.nodes.length * 0.8, `fewer nodes (${smoothCtx.nodes.length} vs ${fullCtx.nodes.length})`);
  assert.equal(smooth.length, full.length, "the same timing");
});

test("Auto alarm performance: Smooth on a slow page, audio underruns or a slow render", () => {
  const c = A.chooseAlarmPerformance;
  assert.equal(c({ setting: "auto", fps: 60, underruns: 0, renderRatio: 0.2 }), "full");
  assert.equal(c({ setting: "auto", fps: 0 }), "full", "no frame rate measured yet");
  assert.equal(c({ setting: "auto", fps: 18 }), "smooth");
  assert.equal(c({ setting: "auto", fps: 55, underruns: 2 }), "smooth");
  assert.equal(c({ setting: "auto", fps: 55, renderRatio: 0.9 }), "smooth");
  assert.equal(c({ setting: "full", fps: 5, underruns: 9 }), "full", "a fixed choice is kept");
  assert.equal(c({ setting: "smooth", fps: 60 }), "smooth");
  assert.deepEqual(A.ALARM_PERFORMANCE, ["auto", "smooth", "full"]);
});

test("a ringing alarm on a slow page plays the Smooth version", async () => {
  const off = mockOffline();
  const cache = new A.AlarmBufferCache({ sampleRate: 8000, makeOffline: off.factory });
  const live = off.factory(2, 8000, 8000); // a stand-in for the live context
  live.state = "running";
  live.resume = async () => {};
  live.currentTime = 1;
  const ringer = A.createAlarmRinger({ getCtx: () => live, ttsUrl: () => "", cache, getFps: () => 14 });
  await ringer.start({ id: 1, time: "7:00 AM", label: "" }, { sound: "strike", performance: "auto" });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(ringer.mode, "smooth");
  assert.ok(cache.peek("strike", "smooth", 0), "the Smooth render was used");
  ringer.stop();
});

test("the page: alarm screen, 3D scene and health line stay light", () => {
  const scene = fs.readFileSync(new URL("../public/presence/scene.js", import.meta.url), "utf8");
  assert.match(scene, /tierBeforeAlarm = tierIdx;\s*if \(tierIdx !== 0\) setTier\(0\);/, "Low quality while an alarm rings");
  assert.match(scene, /if \(back !== tierIdx\) setTier\(back\);/, "and back afterwards");
  assert.match(scene, /if \(alarmOn\) return; \/\/ never change quality while an alarm rings/);
  assert.match(scene, /if \(quality === "auto" && isWeakGpu\(gpu\)\) tierIdx = 0;/, "weak GPUs start at Low");
  assert.match(scene, /if \(alarmSlow && now - last < 1000\) return;/, "a GPU that can't keep up draws one frame a second while it rings");
  assert.match(scene, /alarmGap > 70/, "measured from the real time between drawn frames");
  const loop = scene.slice(scene.indexOf("function frame(now)"), scene.indexOf("// ---- input")).replace("lookKeys.set(target, Object.keys(target))", "cached once");
  assert.doesNotMatch(loop, /Object\.keys\(|\.forEach\(|const ease = /, "no per-frame allocations in the loop");
  const css = fs.readFileSync(new URL("../public/egypt.css", import.meta.url), "utf8");
  assert.match(css, /\.alarm-panel::before \{[^}]*will-change: opacity;[^}]*animation: alarm-flash/, "the flash is a compositor-only opacity pulse");
  assert.doesNotMatch(css, /@keyframes alarm-flash \{ 50% \{ background-color/);
  const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  for (const id of ["alarm-perf", "health", "copy-diag"]) assert.match(html, new RegExp(`id="${id}"`));
  const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const diag = app.slice(app.indexOf("function diagnostics()"), app.indexOf('$("copy-diag")'));
  assert.doesNotMatch(diag, /token|ttsUrl|label|transcript|lastSpoken|apiKey/i, "diagnostics never include the token, labels or what you said");
});

test("weak GPU detection", () => {
  assert.equal(gpuClass("ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)"), "integrated");
  assert.equal(gpuClass("ANGLE (Intel, Intel(R) HD Graphics 520 Direct3D11 vs_5_0 ps_5_0)"), "integrated");
  assert.equal(gpuClass("ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)"), "software");
  assert.equal(gpuClass("ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11)"), "software");
  assert.equal(gpuClass("ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Direct3D11 vs_5_0 ps_5_0)"), "dedicated");
  assert.equal(gpuClass("ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11)"), "integrated");
  assert.equal(gpuClass(""), "unknown");
  assert.equal(isWeakGpu("Intel(R) UHD Graphics 620"), true);
  assert.equal(isWeakGpu("NVIDIA GeForce RTX 3060"), false);
});

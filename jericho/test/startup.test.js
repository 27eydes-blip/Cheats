// The startup sound: timing, check results, the sequence on a fake AudioContext, the
// once-per-load / per-server-start rules, the settings, and /api/startup on a real server (a free
// port, stopped with an AbortSignal). No real audio, no network beyond 127.0.0.1.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { BEEP_FREQS, CHECKS, clampHum, createStartupController, outcome, playStartup, timeline, verdict } from "../public/startup.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-startup-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
fs.writeFileSync(path.join(tmp, "settings.json"), JSON.stringify({ ...base, logFile: path.join(tmp, "actions.log") }));
Object.assign(process.env, { JERICHO_SETTINGS: path.join(tmp, "settings.json"), JERICHO_DATA_DIR: path.join(tmp, "data"), JERICHO_NO_ENV_FILE: "1" });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** A fake AudioContext that records every oscillator (type, first frequency, start time). */
function fakeAudio() {
  const oscs = [];
  const param = (v = 0) => ({ value: v, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} });
  const node = (extra = {}) => ({ connect: (n) => n || node(), ...extra });
  const ctx = {
    currentTime: 0,
    state: "running",
    destination: node(),
    createGain: () => node({ gain: param(1) }),
    createBiquadFilter: () => node({ frequency: param(350), Q: param(1), type: "" }),
    createDynamicsCompressor: () => node({ threshold: param(), ratio: param() }),
    createOscillator() {
      const o = node({ type: "sine", frequency: param(440), start(t) { o.at = t; }, stop() {} });
      const set = o.frequency.setValueAtTime;
      o.frequency.setValueAtTime = (v, t) => (o.first ??= v, set(v, t));
      oscs.push(o);
      return o;
    },
  };
  return { ctx, oscs, freqs: () => oscs.map((o) => o.first ?? o.frequency.value) };
}
const noSleep = async () => {};

test("settings: startup.sound on and a 3.5 second hum by default, passed to the page", async () => {
  assert.deepEqual(base.startup, { sound: true, humSeconds: 3.5 });
  const { publicConfig } = await import("../server/config.js");
  assert.deepEqual(publicConfig().startup, { sound: true, humSeconds: 3.5 });
  assert.equal(clampHum(20), 8);
  assert.equal(clampHum("nope"), 3.5);
});

test("the timeline: a 3.5 s hum, then three rising beeps 80 ms long and 150 ms apart, in the 1800-2400 Hz range", () => {
  const t = timeline(3.5);
  assert.equal(t.hum, 3.5);
  assert.deepEqual(t.beeps.map((b) => b.freq), [1800, 2100, 2400]);
  assert.deepEqual(t.beeps.map((b) => b.check), ["claude", "voice", "calendar"]);
  assert.deepEqual(t.beeps.map((b) => Math.round(b.at * 1000)), [3500, 3730, 3960], "80 ms beep + 150 ms gap");
  assert.ok(BEEP_FREQS.every((f, i) => f >= 1800 && f <= 2400 && (i === 0 || f > BEEP_FREQS[i - 1])), "rising");
  assert.deepEqual(CHECKS.map((c) => c.label), ["Claude", "Voice", "Calendar"]);
});

test("check results: PASS and SKIP are fine, FAIL needs attention, nothing known yet counts as passed", () => {
  assert.equal(outcome({ status: "PASS" }), "ok");
  assert.equal(outcome("SKIP"), "ok");
  assert.equal(outcome({ status: "FAIL" }), "fail");
  assert.equal(outcome(undefined), "unknown");
  assert.equal(verdict(["ok", "ok", "unknown"]), "pass");
  assert.equal(verdict(["ok", "fail", "ok"]), "attention");
});

test("all checks pass: hum, three beeps, then the rising two-note chime", async () => {
  const a = fakeAudio();
  const beeps = [];
  let resolved = null;
  const r = await playStartup(a.ctx, { outcomeOf: async () => "ok", onBeep: (i, res) => beeps.push([i, res]), onResolve: (v) => (resolved = v), sleep: noSleep });
  assert.equal(r.verdict, "pass");
  assert.equal(resolved, "pass");
  assert.deepEqual(beeps, [[0, "ok"], [1, "ok"], [2, "ok"]]);
  const f = a.freqs();
  const hum = f.slice(0, 4);
  assert.ok(hum.every((x) => x < 120), `deep hum layers: ${hum}`);
  assert.deepEqual(f.filter((x) => x >= 1800 && x <= 2400), [1800, 2100, 2400]);
  assert.ok(f.includes(880) && f.includes(1318.5), "the two-note chime: A5 then E6");
  assert.ok(!f.includes(392), "no attention tone");
});

test("a failed check: the quiet low attention tone instead of the chime, and no glow", async () => {
  const a = fakeAudio();
  let resolved = null;
  const r = await playStartup(a.ctx, { outcomeOf: async (k) => (k === "voice" ? "fail" : "ok"), onResolve: (v) => (resolved = v), sleep: noSleep });
  assert.equal(r.verdict, "attention");
  assert.equal(resolved, "attention");
  const f = a.freqs();
  assert.ok(f.includes(392) && f.includes(311.1), "two low falling notes");
  assert.ok(!f.includes(880), "no passed chime");
});

test("each beep waits for its check (up to a limit), then plays anyway", async () => {
  const a = fakeAudio();
  let release;
  const late = new Promise((r) => (release = r));
  const order = [];
  const playing = playStartup(a.ctx, { outcomeOf: (k) => (k === "claude" ? late : Promise.resolve("ok")), onBeep: (i) => order.push(`beep${i}`), sleep: noSleep, maxWaitMs: 2000 });
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(order, [], "the first beep waits for the Claude check");
  release("ok");
  await playing;
  assert.deepEqual(order, ["beep0", "beep1", "beep2"]);
  const b = fakeAudio();
  const r = await playStartup(b.ctx, { outcomeOf: () => new Promise(() => {}), sleep: noSleep, maxWaitMs: 20 });
  assert.deepEqual(r.outcomes, ["unknown", "unknown", "unknown"], "no answer: beeps on a timer");
  assert.equal(r.verdict, "pass");
});

test("once per page load; blocked audio waits for the first tap or key; a server restart plays once more", async () => {
  let played = 0;
  let audioAllowed = false;
  let state = { startedAt: 111 };
  let gesture = null;
  const c = createStartupController({
    enabled: () => true,
    makeContext: () => ({ state: audioAllowed ? "running" : "suspended", resume: async () => {}, close: async () => {} }),
    getState: async () => state,
    listenForGesture: (cb) => ((gesture = cb), { fire: cb, cancel: () => (gesture = null) }),
    play: async () => void played++,
  });
  assert.equal(await c.start(), "waiting", "autoplay blocked");
  assert.equal(c.claimsSound(), true, "the power-up skips its own chime on that tap");
  assert.equal(played, 0);
  audioAllowed = true;
  gesture(); // the first click
  await new Promise((r) => setImmediate(r));
  assert.equal(played, 1);
  assert.equal(await c.start(), "already", "never twice for the same load");
  assert.equal(await c.serverMaybeRestarted(), "same", "reconnected to the same server: nothing");
  state = { startedAt: 222 };
  assert.equal(await c.serverMaybeRestarted(), "played", "a new server start");
  assert.equal(played, 2);
  assert.equal(await c.serverMaybeRestarted(), "same");
});

test("the startup sound respects the setting and the sound being off", async () => {
  let played = 0;
  const c = createStartupController({ enabled: () => false, makeContext: () => ({ state: "running" }), getState: async () => ({ startedAt: 1 }), listenForGesture: () => ({}), play: async () => void played++ });
  assert.equal(await c.start(), "skipped");
  assert.equal(played, 0);
  assert.equal(c.claimsSound(), false);
  const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(app, /enabled: \(\) => config\.startup\?\.sound !== false && \(viz\.sound\?\.\(\)\?\.power \?\? true\) && \(viz\.sound\?\.\(\)\?\.volume \?\? 0\.6\) > 0 && !document\.body\.classList\.contains\("muted"\)/);
  assert.match(app, /viz\.powerOn\?\.\(\{ powerSound: !startupHere \}\)/, "the power-up doesn't play its chime on top");
  assert.match(app, /startupSound\.gesture\(\); \/\/ the mic was allowed/);
});

const freePort = () =>
  new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

test("/api/startup gives the server's start time and the self-test verdicts, behind the access token", async () => {
  const port = await freePort();
  const stop = new AbortController();
  const server = spawn(process.execPath, ["server/index.js"], {
    cwd: new URL("..", import.meta.url).pathname,
    env: { ...process.env, PORT: String(port), JERICHO_SKIP_SELFTEST: "1", JERICHO_ACCESS_TOKEN: "startup-test-token", ANTHROPIC_API_KEY: "", ELEVENLABS_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"],
    signal: stop.signal,
  });
  server.on("error", () => {});
  const exited = new Promise((r) => server.once("exit", r));
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("server didn't start")), 15_000);
      server.stdout.on("data", (d) => /is running/.test(d) && (clearTimeout(timer), resolve()));
      server.once("exit", (c) => (clearTimeout(timer), reject(new Error(`server exited ${c}`))));
    });
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/startup`)).status, 401);
    const r = await (await fetch(`http://127.0.0.1:${port}/api/startup`, { headers: { "x-jericho-token": "startup-test-token" } })).json();
    assert.ok(Number.isFinite(r.startedAt) && Math.abs(Date.now() - r.startedAt) < 60_000);
    assert.deepEqual(r.selfTest, { skipped: true });
    const cfg = await (await fetch(`http://127.0.0.1:${port}/api/config`, { headers: { "x-jericho-token": "startup-test-token" } })).json();
    assert.deepEqual(cfg.startup, { sound: true, humSeconds: 3.5 });
  } finally {
    stop.abort();
    await exited;
  }
});

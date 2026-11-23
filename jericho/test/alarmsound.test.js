// The alarm sound: settings, the loudness ceiling, the 20-second escalation, and that every
// layer of every sound reaches the speakers only through the limiter (nothing bypasses it).
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

globalThis.window = {}; // alarm.js checks for speechSynthesis on window
const A = await import("../public/alarm.js");

// ---- a recording stand-in for the Web Audio API ----------------------------------------------
function param(value = 0) {
  const p = { value, calls: [] };
  for (const m of ["setValueAtTime", "linearRampToValueAtTime", "exponentialRampToValueAtTime", "setTargetAtTime", "cancelScheduledValues"]) {
    p[m] = (...args) => {
      p.calls.push([m, ...args]);
      if (m === "setValueAtTime") p.value = args[0];
      return p;
    };
  }
  return p;
}
function mockCtx() {
  const edges = []; // [from, to]
  const nodes = [];
  const node = (kind, extra = {}) => {
    const n = { kind, ...extra, connect(to) { edges.push([n, to]); return to; }, disconnect() { for (let i = edges.length - 1; i >= 0; i--) if (edges[i][0] === n) edges.splice(i, 1); } };
    nodes.push(n);
    return n;
  };
  const destination = { kind: "destination" };
  const ctx = {
    currentTime: 10,
    sampleRate: 8000,
    state: "running",
    destination,
    resume: async () => {},
    createGain: () => node("gain", { gain: param(1) }),
    createOscillator: () => node("osc", { type: "sine", frequency: param(440), detune: param(0), start() {}, stop() {} }),
    createBiquadFilter: () => node("filter", { type: "lowpass", frequency: param(350), Q: param(1) }),
    createStereoPanner: () => node("pan", { pan: param(0) }),
    createDelay: () => node("delay", { delayTime: param(0) }),
    createWaveShaper: () => node("shaper", { curve: null, oversample: "none" }),
    createDynamicsCompressor: () => node("comp", { threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) }),
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
    createBufferSource: () => node("buffer", { buffer: null, loop: false, start() {}, stop() {} }),
  };
  return { ctx, edges, nodes, destination };
}
/** Every path from a sound source to the speakers, as lists of node kinds. */
function pathsToSpeakers({ edges, nodes, destination }) {
  const out = new Map();
  for (const [a, b] of edges) out.set(a, [...(out.get(a) || []), b]);
  const paths = [];
  const walk = (n, trail, seen) => {
    if (n === destination) return paths.push(trail);
    if (seen.has(n)) return; // feedback loops (echo)
    for (const next of out.get(n) || []) walk(next, [...trail, next], new Set([...seen, n]));
  };
  for (const src of nodes.filter((n) => n.kind === "osc" || n.kind === "buffer")) walk(src, [src], new Set());
  return paths;
}

test("settings: the four sounds, Missile alert by default, unknown names fall back", () => {
  assert.deepEqual(A.ALARM_SOUNDS, ["missile", "siren", "sonar", "classic"]);
  assert.equal(A.DEFAULT_ALARM_SOUND, "missile");
  assert.equal(A.normalizeSound("sonar"), "sonar");
  assert.equal(A.normalizeSound("<script>"), "missile");
  const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  for (const [v, label] of [["missile", "Missile alert"], ["siren", "Air raid siren"], ["sonar", "Sonar ping"], ["classic", "Classic beeps"]]) assert.match(html, new RegExp(`<option value="${v}">${label}</option>`));
  assert.match(html, /id="alarm-max-loud"/);
  assert.match(html, /id="alarm-preview"[^>]*>Preview \(3 seconds\)/);
});

test("the loudness ceiling: the volume setting, a slightly higher cap with Max loud, never past the hard ceiling", () => {
  assert.equal(A.alarmGain({ volume: 0.5 }), 0.5);
  assert.equal(A.alarmGain({ volume: 1 }), A.ALARM_SAFE_MAX);
  assert.equal(A.alarmGain({ volume: 1, maxLoud: true }), A.ALARM_MAX_LOUD_CAP);
  assert.ok(A.ALARM_MAX_LOUD_CAP > A.ALARM_SAFE_MAX, "Max loud is louder");
  assert.ok(A.ALARM_MAX_LOUD_CAP - A.ALARM_SAFE_MAX <= 0.15, "but only slightly");
  assert.ok(A.ALARM_MAX_LOUD_CAP <= A.HARD_CEILING && A.HARD_CEILING <= 1);
  for (const v of [5, 1e9, Infinity]) assert.ok(A.alarmGain({ volume: v, maxLoud: true }) <= A.HARD_CEILING, String(v));
  assert.equal(A.alarmGain({ volume: -3 }), 0.2, "never silent by mistake");
  assert.equal(A.alarmGain({ volume: "loud" }), A.DEFAULT_ALARM_VOLUME);
  // the last stage physically can't output more than SAFETY_MAX, so the speakers never get more than this
  const curve = A.safetyCurve();
  const maxOut = Math.max(...curve.map(Math.abs));
  assert.ok(maxOut <= A.SAFETY_MAX + 1e-6, `curve peak ${maxOut}`);
  assert.ok(A.SAFETY_MAX * A.OUTPUT_CEILING < 0.9, "hard ceiling below digital full scale");
  for (const x of [0.1, 0.5, 0.79]) {
    const i = Math.round(((x + 1) / 2) * (curve.length - 1));
    assert.ok(Math.abs(curve[i] - x) < 0.002, `clean below the knee at ${x}`);
  }
  assert.ok(A.MAX_LOUD_MAKEUP > 1 && A.MAX_LOUD_MAKEUP <= 1.5, "Max loud drives the limiter only a little harder");
  // the limiter really is a brick wall, and the final ceiling leaves headroom
  assert.ok(A.LIMITER.threshold <= -1 && A.LIMITER.ratio >= 20 && A.LIMITER.attack <= 0.003);
  assert.ok(A.OUTPUT_CEILING < 1);
});

test("escalation: 60% at first, full after 20 seconds; more intense the longer it rings", () => {
  assert.equal(A.escalation(0), 0.6);
  assert.ok(Math.abs(A.escalation(10) - 0.8) < 1e-9);
  assert.equal(A.escalation(20), 1);
  assert.equal(A.escalation(600), 1);
  let prev = -1;
  for (let s = 0; s <= 120; s += 10) {
    assert.ok(A.intensity(s) >= prev);
    prev = A.intensity(s);
  }
  assert.equal(A.intensity(0), 0);
  assert.equal(A.intensity(300), 1);
});

test("every layer of every sound reaches the speakers only through the limiter", () => {
  for (const sound of A.ALARM_SOUNDS) {
    for (const heat of [0, 1]) {
      const m = mockCtx();
      const bus = A.buildOutput(m.ctx, A.alarmGain({ volume: 1, maxLoud: true }));
      A.scheduleCycle(m.ctx, bus, sound, 10, { n: 1, heat });
      const paths = pathsToSpeakers(m);
      assert.ok(paths.length > 3, `${sound}: makes sound`);
      // the only thing connected to the speakers is the final ceiling, fed by the limiter
      const intoSpeakers = m.edges.filter(([, b]) => b === m.destination).map(([a]) => a);
      assert.deepEqual(intoSpeakers, [bus.nodes.ceiling], `${sound}: one way out`);
      for (const p of paths) {
        const kinds = p.map((n) => n);
        assert.equal(kinds.at(-2), bus.nodes.ceiling);
        assert.equal(kinds.at(-3), bus.nodes.safety, `${sound}: through the final hard stop`);
        assert.equal(kinds.at(-4), bus.nodes.limiter, `${sound}: through the limiter`);
        assert.ok(kinds.includes(bus.master) && kinds.includes(bus.ramp) && kinds.includes(bus.duck), `${sound}: volume, escalation and duck apply`);
      }
      assert.equal(bus.nodes.limiter.threshold.value, A.LIMITER.threshold);
      assert.equal(bus.nodes.limiter.ratio.value, A.LIMITER.ratio);
      assert.equal(bus.nodes.ceiling.gain.value, A.OUTPUT_CEILING);
      assert.ok(bus.master.gain.value <= A.HARD_CEILING);
    }
  }
});

test("the missile alert has its layers: siren pair 400-1200 Hz, beeps, pings, rumble, and the whoosh-thud", () => {
  const m = mockCtx();
  const bus = A.buildOutput(m.ctx, 0.8);
  A.scheduleCycle(m.ctx, bus, "missile", 10, { n: 1, heat: 0 });
  const oscs = m.nodes.filter((n) => n.kind === "osc");
  const sirenOscs = oscs.filter((o) => o.frequency.calls.some(([fn, v]) => fn === "exponentialRampToValueAtTime" && v === 1200));
  assert.ok(sirenOscs.some((o) => o.type === "sawtooth") && sirenOscs.some((o) => o.type === "square"), "sawtooth/square pair");
  assert.ok(sirenOscs.some((o) => o.detune.value !== 0), "slight detune");
  assert.ok(sirenOscs.every((o) => o.frequency.calls.some(([fn, v]) => fn === "setValueAtTime" && v === 400)), "from 400 Hz");
  assert.ok(oscs.filter((o) => o.type === "square" && o.frequency.value === 2700).length >= 3, "three quick beeps");
  assert.ok(m.nodes.some((n) => n.kind === "delay"), "sonar echo");
  assert.ok(m.nodes.some((n) => n.kind === "buffer" && n.loop), "rumble bed");
  assert.ok(oscs.some((o) => o.frequency.calls.some(([fn, v]) => fn === "exponentialRampToValueAtTime" && v === 32)), "the low impact thud");
  assert.ok(m.nodes.some((n) => n.kind === "pan" && n.pan.value !== 0), "stereo width");
  assert.ok(bus.nodes.shaper.curve instanceof Float32Array && bus.nodes.shaper.oversample === "4x", "a little smooth distortion");
});

test("ringing: starts at 60% and ramps to full over 20 s at the capped volume; the preview uses the same chain", async () => {
  const m = mockCtx();
  const ringer = A.createAlarmRinger({ getCtx: () => m.ctx, ttsUrl: () => "" });
  const r = await ringer.start({ id: 1, time: "7:00 AM", label: "" }, { volume: 1, sound: "missile", maxLoud: false });
  assert.equal(r.audible, true);
  const ramp = m.nodes.find((n) => n.kind === "gain" && n.gain.calls.some(([fn]) => fn === "linearRampToValueAtTime"));
  assert.deepEqual(ramp.gain.calls.slice(0, 2), [["setValueAtTime", 0.6, 10], ["linearRampToValueAtTime", 1, 30]]);
  const master = m.nodes.filter((n) => n.kind === "gain").find((n) => n.gain.value === A.ALARM_SAFE_MAX);
  assert.ok(master, "volume 100% is held at the normal cap");
  ringer.stop();
  const p = mockCtx();
  A.previewAlarm(p.ctx, { sound: "siren", volume: 1, maxLoud: true });
  assert.deepEqual(p.edges.filter(([, b]) => b === p.destination).length, 1, "preview: one way out, through the limiter");
  assert.ok(p.nodes.some((n) => n.kind === "gain" && n.gain.value === A.ALARM_MAX_LOUD_CAP));
});

test("the Windows backup sound is more urgent but takes no outside input and never touches the system volume", async () => {
  const { NATIVE_SCRIPT } = await import("../server/alarms/manager.js");
  assert.match(NATIVE_SCRIPT, /PlayLooping/);
  assert.match(NATIVE_SCRIPT, /\[console\]::Beep\(2600, 70\)/, "rapid triple beeps");
  assert.doesNotMatch(NATIVE_SCRIPT, /\$env:JERICHO_ARG|\$args|SendKeys|AudioEndpoint|nircmd|SoundVolume/i);
});

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
    createOscillator: () => node("osc", { type: "sine", frequency: param(440), detune: param(0), start(t) { this.startAt = t; }, stop() {} }),
    createBiquadFilter: () => node("filter", { type: "lowpass", frequency: param(350), Q: param(1), gain: param(0) }),
    createConvolver: () => node("conv", { buffer: null, normalize: true }),
    createStereoPanner: () => node("pan", { pan: param(0) }),
    createDelay: () => node("delay", { delayTime: param(0) }),
    createWaveShaper: () => node("shaper", { curve: null, oversample: "none" }),
    createDynamicsCompressor: () => node("comp", { threshold: param(-24), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) }),
    createBuffer: (ch, len, rate) => {
      const data = Array.from({ length: ch }, () => new Float32Array(len));
      return { length: len, sampleRate: rate, numberOfChannels: ch, duration: len / rate, getChannelData: (c) => data[c] };
    },
    createBufferSource: () => node("buffer", { buffer: null, loop: false, start(t) { this.startAt = t; }, stop() {} }),
  };
  return { ctx, edges, nodes, destination };
}
/** An offline-render stand-in: a mock context whose render returns an empty buffer of the right size. */
const offlines = [];
function makeOffline(channels, length, rate) {
  const m = mockCtx();
  m.ctx.sampleRate = rate;
  m.ctx.currentTime = 0;
  m.ctx.startRendering = async () => m.ctx.createBuffer(channels, length, rate);
  offlines.push(m);
  return m.ctx;
}
const testCache = () => new A.AlarmBufferCache({ sampleRate: 48000, makeOffline });

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

test("settings: the four sounds, Missile strike by default, unknown names fall back", () => {
  assert.deepEqual(A.ALARM_SOUNDS, ["strike", "siren", "sonar", "classic"]);
  assert.equal(A.DEFAULT_ALARM_SOUND, "strike");
  assert.equal(A.normalizeSound("sonar"), "sonar");
  assert.equal(A.normalizeSound("<script>"), "strike");
  assert.equal(A.normalizeSound("missile"), "strike", "the previous default carries over");
  const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  for (const [v, label] of [["strike", "Missile strike"], ["siren", "Air raid siren"], ["sonar", "Sonar ping"], ["classic", "Classic beeps \\(the old tone\\)"]]) assert.match(html, new RegExp(`<option value="${v}">${label}</option>`));
  assert.match(html, /id="alarm-max-loud"/);
  assert.match(html, /id="alarm-preview"[^>]*>Preview \(one full cycle\)/);
  assert.match(html, /id="alarm-preview-stop"[^>]*hidden>Stop preview/);
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

// ---- "Missile strike" ----------------------------------------------------------------------------
const startsBetween = (m, from, to) => m.nodes.filter((n) => (n.kind === "osc" || n.kind === "buffer") && n.startAt > from + 1e-9 && n.startAt < to - 1e-9);
/** The siren's oscillators: they follow many frequency points (missiles and hits use a few). */
const sirenOscsOf = (m) => m.nodes.filter((n) => n.kind === "osc" && n.frequency.calls.filter(([fn]) => fn === "linearRampToValueAtTime").length >= 5);
const strikeAt = (cycle = 0, at = 10) => {
  const m = mockCtx();
  const bus = A.buildOutput(m.ctx, 0.8);
  const len = A.scheduleCycle(m.ctx, bus, "strike", at, { n: cycle });
  return { m, bus, len, tl: A.strikeTimeline(cycle) };
};

test("missile strike timing: 5 missiles 1.35 s apart, each with a half-second silence before its impact", () => {
  const tl = A.strikeTimeline(0);
  assert.equal(tl.streaks.length, 5);
  for (let i = 1; i < 5; i++) assert.ok(Math.abs(tl.streaks[i].impact - tl.streaks[i - 1].impact - 1.35) < 1e-9, "impacts 1.35 s apart");
  for (const [i, s] of tl.streaks.entries()) {
    assert.ok(Math.abs(s.impact - s.silenceStart - 0.5) < 1e-9, "half a second of silence before each hit");
    assert.ok(s.silenceStart > s.start, "the scream comes first");
    // the next missile only starts screaming after this one has hit: nothing breaks the silence
    if (tl.streaks[i + 1]) assert.ok(tl.streaks[i + 1].start >= s.impact, "no overlap with the next");
  }
  // heavier every time; the 5th almost double the 1st
  for (let i = 1; i < 5; i++) assert.ok(tl.streaks[i].weight > tl.streaks[i - 1].weight);
  const ratio = tl.streaks[4].weight / tl.streaks[0].weight;
  assert.ok(ratio >= 1.8 && ratio < 2);
  // the echo grows longer on later hits
  for (let i = 1; i < 5; i++) assert.ok(tl.streaks[i].reverb > tl.streaks[i - 1].reverb);
  // the siren: only from the 3rd impact; higher and louder at the 4th and 5th; then the hold
  assert.equal(tl.sirenStart, tl.streaks[2].impact);
  assert.deepEqual(tl.stages.map((st) => st.at), tl.streaks.slice(2).map((s) => s.impact));
  for (let i = 1; i < 3; i++) assert.ok(tl.stages[i].peak > tl.stages[i - 1].peak && tl.stages[i].level > tl.stages[i - 1].level);
  assert.ok(tl.stages[2].peak >= 1100 && tl.stages[2].peak <= 1250, "up to ~1200 Hz");
  // ringing ears and the concussion muffle after hits 3, 4 and 5 only, at 4-8 kHz
  assert.deepEqual(tl.ringing.map((r) => r.at), tl.streaks.slice(2).map((s) => s.impact));
  for (const r of tl.ringing) assert.ok(r.freq >= 4000 && r.freq <= 8000 && r.seconds >= 2 && r.seconds <= 3);
  assert.deepEqual(tl.muffles.map((m) => m.at), tl.ringing.map((r) => r.at));
  for (const m of tl.muffles) assert.ok(m.until - m.at >= 0.8 && m.until - m.at <= 1.3, "about a second");
  // the hold and the closing silence
  assert.equal(tl.holdStart, tl.streaks[4].impact);
  assert.ok(tl.holdEnd - tl.holdStart >= 6 && tl.holdEnd - tl.holdStart <= 8);
  assert.ok(tl.end - tl.holdEnd >= 1 && tl.end - tl.holdEnd <= 2.5, "a short, tense silence");
  assert.ok(A.strikeTimeline(3).power > A.strikeTimeline(0).power, "later cycles hit harder");
});

test("every missile is different: pitch, stereo path and distance (and the next cycle differs again)", () => {
  const key = (s) => `${s.pitch.toFixed(0)}|${s.pan.map((p) => p.toFixed(2)).join(">")}|${s.distance.toFixed(2)}`;
  const all = new Set();
  for (const c of [0, 1, 2]) {
    const tl = A.strikeTimeline(c);
    for (const field of ["pitch", "distance"]) assert.equal(new Set(tl.streaks.map((s) => s[field].toFixed(3))).size, 5, `${field} differs in cycle ${c + 1}`);
    assert.equal(new Set(tl.streaks.map((s) => s.pan.join())).size, 5, "stereo paths differ");
    for (const s of tl.streaks) {
      assert.ok(Math.sign(s.pan[0]) !== Math.sign(s.pan[1]), "it crosses the stereo field");
      assert.ok(s.pitch > 2000 && s.pitch < 4200 && s.drop > 0.35 && s.drop < 0.7, "a high scream that drops as it passes");
      all.add(key(s));
    }
  }
  assert.equal(all.size, 15, "never two identical missiles");
  assert.deepEqual(A.strikeTimeline(1), A.strikeTimeline(1), "a given cycle is repeatable");
});

for (const cycle of [0, 1, 4]) {
  test(`the silence before each hit is real, and no siren sound before the 3rd impact (cycle ${cycle + 1})`, () => {
    const { m, tl } = strikeAt(cycle);
    const ducked = m.nodes.filter((n) => n.kind === "gain" && n.gain.calls.filter(([fn, v]) => fn === "linearRampToValueAtTime" && v < 0.05).length === 5);
    assert.equal(ducked.length, 2, "the world bus and the hits bus both drop in every silence");
    const world = ducked.find((n) => n.gain.calls[0][1] === A.STRIKE.bedLevel);
    const hits = ducked.find((n) => n !== world);
    const reaches = (from, target, seen = new Set()) => from === target || (!seen.has(from) && (seen.add(from), m.edges.filter(([a]) => a === from).some(([, b]) => reaches(b, target, seen))));
    for (const s of tl.streaks) {
      // the only sound that starts in the silence unducked is the "air sucked out" rush;
      // the next missile waits for the hit; anything else lingering is pulled down to near-silence
      const inside = startsBetween(m, 10 + s.silenceStart - 1e-6, 10 + s.impact);
      const loose = inside.filter((n) => !ducked.some((b) => reaches(n, b)));
      assert.ok(loose.length === 1 && loose[0].kind === "buffer" && Math.abs(loose[0].startAt - (10 + s.silenceStart)) < 1e-9, `before the hit at ${s.impact}: ${loose.length} unducked sounds`);
      assert.ok(!inside.some((n) => n.kind === "osc" && n.frequency.calls.some(([, v]) => v > 2000 && v < 4300) && n.type === "sine" && n.frequency.calls.length === 3), "no missile scream starts in the silence");
      // the hits bus is back at full exactly on the hit
      const back = hits.gain.calls.find(([fn, v, t]) => fn === "linearRampToValueAtTime" && v === 1 && Math.abs(t - (10 + s.impact)) < 1e-9);
      assert.ok(back, "full on the hit");
    }
    for (const s of tl.streaks) {
      const drop = world.gain.calls.find(([fn, v, t]) => fn === "linearRampToValueAtTime" && v === A.STRIKE.silenceLevel * A.STRIKE.bedLevel && Math.abs(t - (10 + s.silenceStart + 0.04)) < 1e-9);
      assert.ok(drop, "drops right at the start of the silence");
      assert.ok(A.STRIKE.silenceLevel <= 0.05, "near-silence");
    }
    // the siren: nothing before the 3rd impact, not even a pitch change
    const third = 10 + tl.streaks[2].impact;
    const sirens = sirenOscsOf(m);
    assert.equal(sirens.length, 4, "stacked sawtooth/square tones with an octave");
    assert.ok(sirens.some((o) => o.type === "sawtooth") && sirens.some((o) => o.type === "square") && sirens.some((o) => o.detune.value > 1100));
    for (const o of sirens) {
      assert.ok(o.startAt >= third - 1e-9, `starts at ${o.startAt}, 3rd impact ${third}`);
      for (const [, , t] of o.frequency.calls) assert.ok(t >= third - 1e-9);
      assert.ok(o.frequency.calls[0][1] < 150, "spins up from a low growl");
    }
  });
}

test("the preview follows the same rules (it plays the pre-rendered cycle)", async () => {
  const m = mockCtx();
  offlines.length = 0;
  const pv = A.previewAlarm(m.ctx, { sound: "strike", volume: 0.8 }, () => {}, { cache: testCache() });
  const length = await pv.ready;
  const tl = A.strikeTimeline(1);
  assert.ok(Math.abs(length - (tl.end + 0.02)) < 1e-9, "one whole cycle");
  const rendered = offlines.at(-1);
  for (const o of sirenOscsOf(rendered)) assert.ok(o.startAt >= 0.02 + tl.streaks[2].impact - 1e-9, "no siren before the 3rd impact in the render either");
  assert.equal(m.nodes.filter((n) => n.kind === "osc").length, 0, "nothing is built live: one buffer plays");
  assert.equal(m.nodes.filter((n) => n.kind === "buffer").length, 1);
  pv.stop();
});

test("impacts: layered, heavier each time, echoing longer, never ducked; ringing ears only after hits 3-5", () => {
  const { m, bus, tl } = strikeAt(3);
  const oscs = m.nodes.filter((n) => n.kind === "osc");
  // sub thud 50 -> 30 Hz at each impact, heavier each time
  const subs = oscs.filter((o) => o.frequency.calls[0]?.[1] === 50);
  assert.deepEqual(subs.map((o) => o.startAt), tl.streaks.map((s) => 10 + s.impact));
  assert.ok(subs.every((o) => o.frequency.calls.some(([fn, v]) => fn === "exponentialRampToValueAtTime" && v === 30)));
  const peakOf = (o) => Math.max(...m.edges.filter(([a]) => a === o).map(([, g]) => Math.max(...g.gain.calls.map(([, v]) => v))));
  const subPeaks = subs.map(peakOf);
  for (let i = 1; i < 5; i++) assert.ok(subPeaks[i] > subPeaks[i - 1]);
  assert.ok(subPeaks[4] / subPeaks[0] > 1.8, "the 5th about double the 1st");
  // the other layers: mid boom, whump, crack, debris, falling-debris crackle
  assert.equal(oscs.filter((o) => o.type === "triangle" && o.frequency.calls[0]?.[1] === 140).length, 5, "mid booms");
  assert.equal(oscs.filter((o) => o.frequency.calls[0]?.[1] === 78).length, 5, "whumps");
  const filters = m.nodes.filter((n) => n.kind === "filter");
  assert.equal(filters.filter((f) => f.type === "highpass" && f.frequency.value === 1200).length, 5, "a crack at each hit");
  assert.ok(filters.filter((f) => f.type === "bandpass" && f.Q.value === 2.5).length >= 30, "debris bursts");
  assert.ok(filters.filter((f) => f.type === "highpass" && f.frequency.value >= 2200 && f.frequency.value !== 1200).length >= 5 * 14, "falling-debris crackle");
  // the city echo: a generated impulse response that decays, longer for later hits
  const convs = m.nodes.filter((n) => n.kind === "conv");
  const lengths = [...new Set(convs.map((c) => +c.buffer.duration.toFixed(2)))].sort((a, b) => a - b);
  assert.ok(lengths.length >= 5, `impulse lengths ${lengths}`);
  const ir = A.cityImpulse(m.ctx, 3);
  const d = ir.getChannelData(0);
  const energy = (a, b) => d.slice(Math.floor(a * d.length), Math.floor(b * d.length)).reduce((x, v) => x + v * v, 0);
  assert.ok(energy(0, 0.1) > 50 * energy(0.9, 1), "it decays");
  // the hits are never ducked: no path from a sub thud goes through the world bus
  const world = m.nodes.find((n) => n.kind === "gain" && n.gain.calls.filter(([fn, v]) => fn === "linearRampToValueAtTime" && v < 0.05).length === 5);
  const reaches = (from, target, seen = new Set()) => from === target || (!seen.has(from) && (seen.add(from), m.edges.filter(([a]) => a === from).some(([, b]) => reaches(b, target, seen))));
  for (const sub of subs) assert.ok(!reaches(sub, world));
  // the concussion: everything else muffled at hits 3-5, clearing over about a second
  const muffle = m.nodes.find((n) => n.kind === "filter" && n.frequency.calls.some(([, v]) => v === A.STRIKE.muffle.to));
  assert.deepEqual(muffle.frequency.calls.filter(([, v]) => v === A.STRIKE.muffle.to).map(([, , t]) => t), tl.muffles.map((x) => 10 + x.at));
  assert.ok(reaches(world, muffle), "the world goes through the muffle");
  // ringing ears: soft high tones at hits 3-5 only, easing in, never a harsh peak
  const rings = oscs.filter((o) => o.type === "sine" && o.frequency.value >= 4000 && o.frequency.value <= 8100);
  assert.deepEqual([...new Set(rings.map((o) => o.startAt))], tl.ringing.map((r) => 10 + r.at));
  for (const o of rings) {
    const g = m.edges.find(([a]) => a === o)[1];
    const attack = g.gain.calls.find(([fn]) => fn === "exponentialRampToValueAtTime");
    assert.ok(attack[1] <= A.STRIKE.ringPeak && attack[1] <= 0.05, "gentle");
    assert.ok(attack[2] - o.startAt >= 0.1, "eases in");
  }
  // the hold: triple beeps, sonar pings, and distant explosions under the siren
  assert.ok(oscs.filter((o) => o.type === "square" && o.frequency.value === 2700).length >= 3 * 8);
  assert.ok(m.nodes.filter((n) => n.kind === "delay").length >= 4);
  assert.ok(bus.nodes.shaper.curve instanceof Float32Array, "a little smooth distortion");
});

test("ringing: starts at 60% and ramps to full over 20 s at the capped volume; the preview uses the same chain", async () => {
  const m = mockCtx();
  const cache = testCache();
  const ringer = A.createAlarmRinger({ getCtx: () => m.ctx, ttsUrl: () => "", cache });
  const r = await ringer.start({ id: 1, time: "7:00 AM", label: "" }, { volume: 1, sound: "strike", maxLoud: false });
  assert.equal(r.audible, true);
  const ramp = m.nodes.find((n) => n.kind === "gain" && n.gain.calls.some(([fn]) => fn === "linearRampToValueAtTime"));
  assert.deepEqual(ramp.gain.calls.slice(0, 2), [["setValueAtTime", 0.6, 10], ["linearRampToValueAtTime", 1, 30]]);
  const master = m.nodes.filter((n) => n.kind === "gain").find((n) => n.gain.value === A.ALARM_SAFE_MAX);
  assert.ok(master, "volume 100% is held at the normal cap");
  // once the first cycle is rendered it plays as a single buffer, through the limiter
  await new Promise((res) => setTimeout(res, 30));
  const played = m.nodes.filter((n) => n.kind === "buffer" && n.buffer?.length === Math.ceil(A.RENDER_SECONDS.strike * 48000));
  assert.equal(played.length, 1, "the rendered cycle is playing");
  assert.ok(pathsToSpeakers(m).every((p) => p.includes(m.nodes.find((n) => n.kind === "comp" && n.ratio.value === A.LIMITER.ratio))), "everything through the limiter");
  // Stop: silent within a few milliseconds
  ringer.stop();
  const stopCall = master.gain.calls.find(([fn, v]) => fn === "setTargetAtTime" && v === 0);
  assert.ok(stopCall && stopCall[3] <= 0.03, "fades out in ~20 ms");
  const full = mockCtx();
  let ended = false;
  const pv = A.previewAlarm(full.ctx, { sound: "strike", volume: 0.7 }, () => (ended = true), { cache });
  await pv.ready;
  pv.stop();
  assert.equal(ended, true, "Stop preview ends it");
  const p = mockCtx();
  A.previewAlarm(p.ctx, { sound: "siren", volume: 1, maxLoud: true }, () => {}, { cache });
  assert.deepEqual(p.edges.filter(([, b]) => b === p.destination).length, 1, "preview: one way out, through the limiter");
  assert.ok(p.nodes.some((n) => n.kind === "gain" && n.gain.value === A.ALARM_MAX_LOUD_CAP));
});

test("the Windows backup sound is more urgent but takes no outside input and never touches the system volume", async () => {
  const { NATIVE_SCRIPT } = await import("../server/alarms/manager.js");
  assert.match(NATIVE_SCRIPT, /PlayLooping/);
  assert.match(NATIVE_SCRIPT, /\[console\]::Beep\(2600, 70\)/, "rapid triple beeps");
  assert.doesNotMatch(NATIVE_SCRIPT, /\$env:JERICHO_ARG|\$args|SendKeys|AudioEndpoint|nircmd|SoundVolume/i);
});

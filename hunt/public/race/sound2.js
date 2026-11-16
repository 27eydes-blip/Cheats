// Engine voices for the 8 unlockable cars, plus a garage rev and an unlock jingle per rarity. All
// synthesized live with Web Audio on the shared AudioContext (no samples), like sound.js. Each voice
// is one small graph built once; a frame only moves its params with setTargetAtTime.
//
// A voice: two oscillators (a, b at ratio rb, detuned), an optional sub, an optional FM modulator,
// an amplitude LFO whose rate follows speed (throb, burble, hover wub), an optional noise layer
// (roar, ice shimmer, turbine whine, breath) and a filter that opens with speed. Drift screech and
// boost whoosh as in sound.js.
import { SETTINGS } from '../settings.js';
import { audioCtx } from '../audio.js';

export const ENGINE_VOICES = {
  // VOIDRUNNER: a dark resonant hum with a slow throb
  void: { label: 'dark hum', a: 'sawtooth', b: 'sine', rb: 0.5, det: 12, sub: 0.5, base: 34, span: 96, boostF: 18, filt: 'lowpass', cut: 260, cutSpan: 900, q: 7, lfo: [5, 14, 0.28], fm: null, noise: null, gain: 0.07, gainSpan: 0.05 },
  // SOLAR FANG: a raw roar that burbles and crackles
  fang: { label: 'flame roar', a: 'sawtooth', b: 'sawtooth', rb: 1.5, det: 18, sub: 0.5, base: 52, span: 136, boostF: 30, filt: 'lowpass', cut: 520, cutSpan: 1800, q: 2, lfo: [14, 40, 0.45], fm: null, noise: { f: 900, fSpan: 1200, q: 1.4, v: 0.5 }, gain: 0.05, gainSpan: 0.06 },
  // FROSTBYTE: a glassy metallic whine with an icy shimmer on top
  frost: { label: 'ice whine', a: 'square', b: 'triangle', rb: 3, det: 4, sub: 0, base: 70, span: 170, boostF: 40, filt: 'bandpass', cut: 1100, cutSpan: 2600, q: 3.5, lfo: [22, 30, 0.12], fm: { r: 3.5, d: 0.45 }, noise: { f: 6000, fSpan: 2500, q: 6, v: 0.35 }, gain: 0.17, gainSpan: 0.15 },
  // GRAVITON: no engine at all, an anti-gravity thrum that wubs as it hovers
  grav: { label: 'hover thrum', a: 'sine', b: 'sine', rb: 1.012, det: 0, sub: 0.5, base: 88, span: 160, boostF: 50, filt: 'lowpass', cut: 900, cutSpan: 1500, q: 1, lfo: [3, 7, 0.55], fm: { r: 0.5, d: 0.12 }, noise: null, gain: 0.1, gainSpan: 0.05 },
  // PHANTOM VX: a soft, airy, chorused whisper
  vx: { label: 'ghost whisper', a: 'triangle', b: 'triangle', rb: 2.006, det: 25, sub: 0, base: 64, span: 150, boostF: 36, filt: 'lowpass', cut: 700, cutSpan: 1600, q: 0.8, lfo: [0.8, 2, 0.3], fm: null, noise: { f: 2400, fSpan: 1800, q: 0.7, v: 0.6 }, gain: 0.06, gainSpan: 0.04 },
  // REDLINE ZERO: a screaming high-rev engine with a turbine whine
  redline: { label: 'turbine scream', a: 'sawtooth', b: 'square', rb: 2, det: 5, sub: 0, base: 70, span: 235, boostF: 45, filt: 'lowpass', cut: 800, cutSpan: 3600, q: 5, lfo: [30, 60, 0.08], fm: null, noise: { f: 3000, fSpan: 5000, q: 9, v: 0.3 }, gain: 0.045, gainSpan: 0.05 },
  // HELIX: twin cores a fifth apart, pulsing as they spin
  helix: { label: 'twin-core pulse', a: 'square', b: 'square', rb: 1.5, det: 0, sub: 0, base: 58, span: 140, boostF: 30, filt: 'bandpass', cut: 600, cutSpan: 2000, q: 2, lfo: [6, 18, 0.5], fm: { r: 2, d: 0.2 }, noise: null, gain: 0.17, gainSpan: 0.14 },
  // OBLIVION PRIME: a huge inharmonic growl with a slow resonant sweep and a low rumble
  prime: { label: 'event horizon', a: 'sawtooth', b: 'sawtooth', rb: 0.5, det: 9, sub: 0.25, base: 40, span: 112, boostF: 22, filt: 'lowpass', cut: 300, cutSpan: 1600, q: 9, lfo: [2, 8, 0.35], fm: { r: 1.414, d: 0.3 }, noise: { f: 200, fSpan: 300, q: 1, v: 0.45 }, gain: 0.07, gainSpan: 0.05 },
};
export const VOICE_IDS = Object.keys(ENGINE_VOICES);

// the voice's target values at a speed (0..1+) and boost: pure, so tests can tell voices apart
export function voiceTargets(id, speed, boost) {
  const V = ENGINE_VOICES[id] || ENGINE_VOICES.void, s = Math.max(0, speed);
  return {
    f: V.base + s * V.span + (boost ? V.boostF : 0),
    cut: V.cut + s * V.cutSpan + (boost ? 600 : 0),
    lfo: V.lfo[0] + s * V.lfo[1],
    gain: V.gain + s * V.gainSpan,
    noiseF: V.noise ? V.noise.f + s * V.noise.fSpan : 0,
  };
}

let nb = null;
function noiseOf(ac) {
  if (nb && nb.ac === ac) return nb.buf;
  const buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  nb = { ac, buf };
  return buf;
}

// build one voice on ac into dest; returns {id, set(time, speed, drift, tier, boost, vol), stop(at)}
export function makeEngineVoice(ac, dest, id) {
  const V = ENGINE_VOICES[id] || ENGINE_VOICES.void, nodes = [];
  const osc = (type) => { const o = ac.createOscillator(); o.type = type; nodes.push(o); return o; };
  const amp = ac.createGain(); amp.gain.value = 0; amp.connect(dest);
  const trem = ac.createGain(); trem.gain.value = 1 - V.lfo[2]; trem.connect(amp); // LFO swings this around 1 - depth
  const filt = ac.createBiquadFilter(); filt.type = V.filt; filt.frequency.value = V.cut; filt.Q.value = V.q; filt.connect(trem);
  const a = osc(V.a), b = osc(V.b);
  b.detune.value = V.det;
  const bg = ac.createGain(); bg.gain.value = 0.7;
  a.connect(filt); b.connect(bg); bg.connect(filt);
  let sub = null;
  if (V.sub) { sub = osc('sine'); const sg = ac.createGain(); sg.gain.value = 0.8; sub.connect(sg); sg.connect(trem); }
  let fm = null, fmg = null;
  if (V.fm) { fm = osc('sine'); fmg = ac.createGain(); fmg.gain.value = 0; fm.connect(fmg); fmg.connect(a.frequency); }
  const lfo = osc('sine'), lg = ac.createGain(); lg.gain.value = V.lfo[2]; lfo.frequency.value = V.lfo[0]; lfo.connect(lg); lg.connect(trem.gain);
  let nf = null, ng = null;
  if (V.noise) {
    const n = ac.createBufferSource(); n.buffer = noiseOf(ac); n.loop = true; nodes.push(n);
    nf = ac.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = V.noise.f; nf.Q.value = V.noise.q;
    ng = ac.createGain(); ng.gain.value = 0; n.connect(nf); nf.connect(ng); ng.connect(amp);
  }
  // drift screech and boost whoosh (per voice, so the garage rev has them too)
  const sc = ac.createBufferSource(), bp = ac.createBiquadFilter(), sg2 = ac.createGain();
  sc.buffer = noiseOf(ac); sc.loop = true; bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 7; sg2.gain.value = 0; sc.connect(bp); bp.connect(sg2); sg2.connect(dest); nodes.push(sc);
  const wh = ac.createBufferSource(), wf = ac.createBiquadFilter(), wg = ac.createGain();
  wh.buffer = noiseOf(ac); wh.loop = true; wf.type = 'bandpass'; wf.frequency.value = 1500; wf.Q.value = 0.8; wg.gain.value = 0; wh.connect(wf); wf.connect(wg); wg.connect(dest); nodes.push(wh);
  for (const n of nodes) n.start();
  return {
    id: ENGINE_VOICES[id] ? id : 'void',
    set(t, speed, drift, tier, boost, v) {
      const s = Math.max(0, speed), f = V.base + s * V.span + (boost ? V.boostF : 0);
      a.frequency.setTargetAtTime(f, t, 0.06); b.frequency.setTargetAtTime(f * V.rb, t, 0.06);
      if (sub) sub.frequency.setTargetAtTime(f * V.sub, t, 0.06);
      if (fm) { fm.frequency.setTargetAtTime(f * V.fm.r, t, 0.06); fmg.gain.setTargetAtTime(f * V.fm.d, t, 0.08); }
      lfo.frequency.setTargetAtTime(V.lfo[0] + s * V.lfo[1], t, 0.1);
      filt.frequency.setTargetAtTime(V.cut + s * V.cutSpan + (boost ? 600 : 0), t, 0.08);
      amp.gain.setTargetAtTime(v * (V.gain + s * V.gainSpan), t, 0.08);
      if (ng) { ng.gain.setTargetAtTime(V.noise.v * (0.3 + s * 0.7), t, 0.1); nf.frequency.setTargetAtTime(V.noise.f + s * V.noise.fSpan, t, 0.1); }
      sg2.gain.setTargetAtTime(drift ? v * 0.07 : 0, t, 0.05); bp.frequency.setTargetAtTime(1900 + tier * 450, t, 0.05);
      wg.gain.setTargetAtTime(boost ? v * 0.09 : 0, t, 0.1); wf.frequency.setTargetAtTime(1200 + s * 1600, t, 0.1);
    },
    stop(at = 0) {
      for (const n of nodes) { try { n.stop(at); } catch {} }
      if (!at) { try { amp.disconnect(); sg2.disconnect(); wg.disconnect(); } catch {} }
    },
  };
}

// ---- the shared context: own output gain, so this never touches sound.js' graph
let ac = null, out = null, eng = null;
function ready() {
  const a = audioCtx();
  if (!a || a.state !== 'running') return null;
  if (ac !== a) { ac = a; out = ac.createGain(); out.gain.value = 0.45; out.connect(ac.destination); eng = null; }
  return ac;
}
const vol = () => (SETTINGS.sound ? SETTINGS.sfxVol ?? 0.9 : 0);

// engine2(voiceId, speed, drift, tier, boost, on): as sound.js engine(), in the car's own voice
export function engine2(id, speed, drift, tier, boost, on) {
  if (!ready()) return;
  if (eng && eng.id !== id) { eng.stop(); eng = null; }
  if (!eng) eng = makeEngineVoice(ac, out, id);
  eng.set(ac.currentTime, speed, drift, tier, boost, vol() * (on ? 1 : 0));
}
export function stopEngine2() { if (eng) { eng.stop(); eng = null; } }

// a short garage rev in the car's voice: idle, blip, settle, full rev with boost, fade
export function revVoice(id, v = 1) {
  v *= vol();
  if (v <= 0.02 || !ready()) return false;
  const t = ac.currentTime + 0.02, voice = makeEngineVoice(ac, out, id);
  const steps = [[0, 0.08, 0], [0.25, 0.85, 0], [0.7, 0.3, 0], [1.05, 1.05, 1], [1.7, 0.2, 0]];
  for (const [dt, s, b] of steps) voice.set(t + dt, s, 0, 0, b, v);
  voice.set(t + 1.9, 0, 0, 0, 0, 0);
  voice.stop(t + 2.6);
  return true;
}

// the unlock jingle: rare a bright rising triad, epic a longer run with shimmer, legendary a
// swelling chord, a run and sparkles on top
function tone(t0, type, f0, f1, dur, v, attack = 0.01) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + dur + 0.02);
}
export const JINGLES = {
  rare: [[0, 587, 0.14], [0.09, 740, 0.14], [0.18, 880, 0.4]],
  epic: [[0, 523, 0.12], [0.08, 659, 0.12], [0.16, 784, 0.12], [0.24, 988, 0.12], [0.32, 1175, 0.55]],
  legendary: [[0, 392, 0.9, 'pad'], [0, 494, 0.9, 'pad'], [0, 587, 0.9, 'pad'], [0.12, 784, 0.12], [0.2, 988, 0.12], [0.28, 1175, 0.12], [0.36, 1568, 0.7]],
};
export function unlockJingle(rarity, v = 1) {
  v *= vol();
  if (v <= 0.02 || !ready()) return false;
  const t = ac.currentTime + 0.02, J = JINGLES[rarity] || JINGLES.rare;
  for (const [dt, f, d, kind] of J) {
    if (kind === 'pad') tone(t + dt, 'sawtooth', f / 2, f / 2, d, 0.05 * v, 0.25);
    else { tone(t + dt, 'square', f, f, d, 0.1 * v); tone(t + dt, 'triangle', f * 2, f * 2, d, 0.05 * v); }
  }
  if (rarity !== 'rare') for (let i = 0; i < (rarity === 'legendary' ? 8 : 4); i++) tone(t + 0.4 + i * 0.07, 'sine', 2093 + i * 170, 2093 + i * 170, 0.12, 0.04 * v);
  return true;
}

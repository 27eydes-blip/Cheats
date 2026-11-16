// Hunt Racers sound: an engine voice whose pitch follows speed, a drift screech, boost whoosh, and
// one-shot item / weapon / race sounds. All synthesized live with Web Audio (no sample files), in
// the same style as audio.js, on the shared AudioContext. Respects the Sound and SFX settings.
import { SETTINGS } from '../settings.js';
import { audioCtx } from '../audio.js';

let ac = null, out = null, noiseBuf = null, eng = null, last = {};
function ready() {
  const a = audioCtx();
  if (!a || a.state !== 'running') return null;
  if (ac !== a) {
    ac = a; out = ac.createGain(); out.gain.value = 0.45; out.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    eng = null;
  }
  return ac;
}
const vol = () => (SETTINGS.sound ? SETTINGS.sfxVol ?? 0.9 : 0);

function tone(t0, type, f0, f1, dur, v, attack = 0.005) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(t0, dur, v, f0, f1, q = 1, type = 'bandpass') {
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
  g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(out); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.02);
}

const S = {
  count: (t, v) => tone(t, 'square', 660, 660, 0.16, 0.16 * v),
  go: (t, v) => { tone(t, 'square', 990, 990, 0.35, 0.18 * v); tone(t, 'triangle', 1320, 1320, 0.35, 0.12 * v); },
  boost: (t, v) => { noise(t, 0.45, 0.35 * v, 500, 3200, 1.2); tone(t, 'sawtooth', 180, 520, 0.4, 0.08 * v, 0.03); },
  pad: (t, v) => { noise(t, 0.3, 0.25 * v, 800, 4000, 2); tone(t, 'triangle', 700, 1400, 0.18, 0.1 * v); },
  mt1: (t, v) => { noise(t, 0.25, 0.25 * v, 900, 2600, 2); tone(t, 'square', 520, 780, 0.12, 0.08 * v); },
  mt2: (t, v) => { noise(t, 0.32, 0.3 * v, 800, 3200, 2); tone(t, 'square', 600, 1000, 0.15, 0.09 * v); },
  mt3: (t, v) => { noise(t, 0.4, 0.35 * v, 700, 4200, 2); tone(t, 'square', 700, 1400, 0.2, 0.1 * v); tone(t + 0.06, 'triangle', 1400, 2100, 0.2, 0.07 * v); },
  tier: (t, v) => tone(t, 'triangle', 1500, 1900, 0.06, 0.08 * v),
  box: (t, v) => { [880, 1175, 1568].forEach((f, i) => tone(t + i * 0.05, 'triangle', f, f, 0.09, 0.14 * v)); },
  roll: (t, v) => { for (let i = 0; i < 6; i++) tone(t + i * 0.05, 'square', 700 + i * 90, 700 + i * 90, 0.03, 0.05 * v); },
  missile: (t, v) => { noise(t, 0.7, 0.3 * v, 400, 1800, 1); tone(t, 'sawtooth', 220, 90, 0.5, 0.1 * v); },
  rockets: (t, v) => { for (let i = 0; i < 3; i++) { noise(t + i * 0.06, 0.18, 0.3 * v, 1800, 300, 1, 'lowpass'); tone(t + i * 0.06, 'square', 300, 120, 0.1, 0.08 * v); } },
  oil: (t, v) => { noise(t, 0.35, 0.3 * v, 300, 120, 2, 'lowpass'); tone(t, 'sine', 180, 90, 0.3, 0.2 * v); },
  spikes: (t, v) => { for (let i = 0; i < 4; i++) tone(t + i * 0.03, 'square', 2400 - i * 200, 1800, 0.03, 0.06 * v); noise(t, 0.2, 0.2 * v, 4000, 2000, 3); },
  shield: (t, v) => { tone(t, 'sine', 400, 900, 0.35, 0.16 * v, 0.05); tone(t, 'triangle', 600, 1200, 0.3, 0.06 * v, 0.05); },
  shieldpop: (t, v) => { tone(t, 'sine', 1200, 300, 0.2, 0.16 * v); noise(t, 0.15, 0.2 * v, 6000, 2000, 2); },
  emp: (t, v) => { tone(t, 'sawtooth', 1400, 60, 0.6, 0.16 * v); noise(t, 0.5, 0.3 * v, 5000, 300, 3); },
  turbo: (t, v) => { noise(t, 0.7, 0.4 * v, 400, 5000, 1.2); tone(t, 'sawtooth', 150, 600, 0.6, 0.12 * v, 0.04); },
  arc: (t, v) => { noise(t, 0.28, 0.3 * v, 7000, 2500, 6); tone(t, 'square', 1900, 700, 0.18, 0.06 * v); tone(t + 0.07, 'square', 1500, 900, 0.12, 0.05 * v); },
  pulse: (t, v) => { tone(t, 'sine', 110, 35, 0.45, 0.5 * v); noise(t, 0.35, 0.35 * v, 900, 80, 1, 'lowpass'); },
  rail: (t, v) => { tone(t, 'sawtooth', 2600, 200, 0.3, 0.14 * v); noise(t, 0.3, 0.2 * v, 7000, 1500, 2); },
  mine: (t, v) => { tone(t, 'triangle', 300, 200, 0.1, 0.18 * v); noise(t, 0.2, 0.2 * v, 1200, 300, 2); },
  turret: (t, v) => { tone(t, 'square', 500, 800, 0.08, 0.12 * v); tone(t + 0.1, 'square', 800, 500, 0.08, 0.12 * v); },
  bolt: (t, v) => tone(t, 'square', 1300, 600, 0.05, 0.06 * v),
  blink: (t, v) => { tone(t, 'sine', 2000, 300, 0.12, 0.16 * v); noise(t, 0.15, 0.25 * v, 3000, 9000, 2, 'highpass'); },
  boom: (t, v) => { tone(t, 'sine', 130, 35, 0.5, 0.5 * v); noise(t, 0.5, 0.45 * v, 1800, 90, 1, 'lowpass'); },
  wreck: (t, v) => { tone(t, 'sine', 90, 28, 0.8, 0.6 * v); noise(t, 0.8, 0.55 * v, 2200, 60, 0.8, 'lowpass'); for (let i = 0; i < 4; i++) tone(t + 0.1 + i * 0.07, 'square', 600 - i * 90, 200, 0.06, 0.05 * v); },
  respawn: (t, v) => { [523, 784, 1047].forEach((f, i) => tone(t + i * 0.06, 'triangle', f, f, 0.12, 0.14 * v)); },
  hit: (t, v) => { tone(t, 'square', 260, 120, 0.08, 0.16 * v); noise(t, 0.08, 0.2 * v, 2500, 800, 1); },
  bump: (t, v) => { tone(t, 'sine', 120, 60, 0.12, 0.3 * v); noise(t, 0.08, 0.2 * v, 800, 200, 1, 'lowpass'); },
  wall: (t, v) => { noise(t, 0.12, 0.3 * v, 600, 150, 1, 'lowpass'); tone(t, 'sine', 90, 50, 0.1, 0.25 * v); },
  jump: (t, v) => { tone(t, 'sine', 240, 520, 0.25, 0.12 * v, 0.02); noise(t, 0.3, 0.15 * v, 600, 1600, 1); },
  land: (t, v) => { tone(t, 'sine', 100, 45, 0.15, 0.35 * v); noise(t, 0.12, 0.2 * v, 700, 150, 1, 'lowpass'); },
  spin: (t, v) => { for (let i = 0; i < 5; i++) noise(t + i * 0.07, 0.07, 0.2 * v, 1400, 700, 3); },
  steal: (t, v) => [880, 1109, 1319, 1760].forEach((f, i) => tone(t + i * 0.06, 'triangle', f, f, 0.12, 0.2 * v)),
  lap: (t, v) => { tone(t, 'square', 784, 784, 0.1, 0.14 * v); tone(t + 0.12, 'square', 1047, 1047, 0.18, 0.14 * v); },
  final: (t, v) => [659, 784, 988, 1319].forEach((f, i) => tone(t + i * 0.09, 'square', f, f, 0.12, 0.14 * v)),
  finish: (t, v) => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(t + i * 0.1, 'square', f, f, i === 4 ? 0.5 : 0.12, 0.16 * v)),
  out: (t, v) => [392, 330, 262].forEach((f, i) => tone(t + i * 0.16, 'triangle', f, f, 0.2, 0.18 * v)),
  lock: (t, v) => tone(t, 'square', 1760, 1760, 0.05, 0.08 * v),
  // the five newer pickups and the weapon moments (all synthesized here, original)
  lightning: (t, v) => { for (let i = 0; i < 3; i++) { noise(t + i * 0.05, 0.12, 0.3 * v, 8000, 2000, 5); tone(t + i * 0.05, 'sawtooth', 2400 - i * 500, 400, 0.1, 0.07 * v); } },
  gravity: (t, v) => { tone(t, 'sine', 220, 40, 0.9, 0.3 * v, 0.08); tone(t, 'triangle', 330, 60, 0.8, 0.08 * v, 0.1); noise(t, 0.8, 0.12 * v, 600, 90, 2, 'lowpass'); },
  ghost: (t, v) => { tone(t, 'sine', 520, 780, 0.5, 0.12 * v, 0.1); tone(t + 0.05, 'sine', 780, 1170, 0.45, 0.07 * v, 0.1); },
  sticky: (t, v) => { noise(t, 0.12, 0.3 * v, 500, 200, 2, 'lowpass'); tone(t, 'sine', 160, 90, 0.12, 0.25 * v); tone(t + 0.12, 'square', 1200, 1200, 0.03, 0.05 * v); },
  drone: (t, v) => { tone(t, 'sawtooth', 300, 420, 0.5, 0.05 * v, 0.05); noise(t, 0.5, 0.12 * v, 2500, 3500, 6); },
  dodge: (t, v) => { noise(t, 0.25, 0.3 * v, 900, 5000, 1.5, 'highpass'); tone(t, 'triangle', 900, 1600, 0.15, 0.1 * v); },
  combo: (t, v) => { [784, 1047, 1568].forEach((f, i) => tone(t + i * 0.05, 'square', f, f, 0.1, 0.12 * v)); noise(t, 0.3, 0.2 * v, 3000, 800, 2); },
  pass: (t, v) => { tone(t, 'sine', 600, 300, 0.12, 0.16 * v); tone(t + 0.05, 'square', 900, 900, 0.03, 0.05 * v); },
  swat: (t, v) => { noise(t, 0.15, 0.35 * v, 3000, 600, 2); tone(t, 'square', 700, 200, 0.12, 0.1 * v); },
  levelup: (t, v) => [880, 1109, 1319, 1760].forEach((f, i) => tone(t + i * 0.045, 'triangle', f, f, i === 3 ? 0.2 : 0.07, 0.15 * v)),
  click: (t, v) => tone(t, 'triangle', 900, 1300, 0.05, 0.1 * v),
  // a tutorial step done; RESET put you back on the road
  tut: (t, v) => [784, 988, 1319].forEach((f, i) => tone(t + i * 0.07, 'triangle', f, f, i === 2 ? 0.3 : 0.1, 0.16 * v)),
  reset: (t, v) => { tone(t, 'sine', 300, 900, 0.22, 0.16 * v, 0.02); noise(t, 0.25, 0.15 * v, 1200, 5000, 2, 'highpass'); },
};

// a one-shot; vol 0..1 (distance falloff applied by the caller)
export function play(id, v = 1) {
  v *= vol();
  if (v <= 0.02 || !ready() || !S[id]) return;
  const now = ac.currentTime;
  if (last[id] && now - last[id] < 0.05) return;
  last[id] = now;
  S[id](now + 0.005, Math.min(1, v));
}

// ENGINE + SCREECH: persistent voices, updated each frame with setTargetAtTime (no allocation)
function buildEngine() {
  const o1 = ac.createOscillator(), o2 = ac.createOscillator(), lp = ac.createBiquadFilter(), g = ac.createGain();
  o1.type = 'sawtooth'; o2.type = 'square'; o2.detune.value = -1200 + 7;
  lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 3;
  g.gain.value = 0;
  o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(out);
  const sc = ac.createBufferSource(), bp = ac.createBiquadFilter(), sg = ac.createGain();
  sc.buffer = noiseBuf; sc.loop = true; bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 7; sg.gain.value = 0;
  sc.connect(bp); bp.connect(sg); sg.connect(out);
  const wh = ac.createBufferSource(), wf = ac.createBiquadFilter(), wg = ac.createGain();
  wh.buffer = noiseBuf; wh.loop = true; wf.type = 'bandpass'; wf.frequency.value = 1500; wf.Q.value = 0.8; wg.gain.value = 0;
  wh.connect(wf); wf.connect(wg); wg.connect(out);
  o1.start(); o2.start(); sc.start(); wh.start();
  eng = { o1, o2, lp, g, sc, bp, sg, wg, wf, nodes: [o1, o2, sc, wh] };
}
// speed 0..1+ of top, drift 0|1, tier 0..3, boost 0|1, on: the car is ours and alive
export function engine(speed, drift, tier, boost, on) {
  if (!ready()) return;
  if (!eng) buildEngine();
  const t = ac.currentTime, v = vol() * (on ? 1 : 0);
  const f = 46 + speed * 120 + (boost ? 24 : 0);
  eng.o1.frequency.setTargetAtTime(f, t, 0.06); eng.o2.frequency.setTargetAtTime(f * 2, t, 0.06);
  eng.lp.frequency.setTargetAtTime(380 + speed * 1300 + (boost ? 600 : 0), t, 0.08);
  eng.g.gain.setTargetAtTime(v * (0.05 + speed * 0.06), t, 0.08);
  eng.sg.gain.setTargetAtTime(drift ? v * 0.07 : 0, t, 0.05);
  eng.bp.frequency.setTargetAtTime(1900 + tier * 450, t, 0.05);
  eng.wg.gain.setTargetAtTime(boost ? v * 0.09 : 0, t, 0.1);
  eng.wf.frequency.setTargetAtTime(1200 + speed * 1600, t, 0.1);
}
export function stopEngine() {
  if (!eng) return;
  for (const n of eng.nodes) { try { n.stop(); } catch {} }
  try { eng.g.disconnect(); eng.sg.disconnect(); eng.wg.disconnect(); } catch {}
  eng = null;
}

// HORN: a store horn ({wave, notes: [[Hz, s], ...]}, Hz 0 = a rest) or the stock double toot.
// Played for your own horn at once, for others' from the 'horn' event, quieter with distance.
const STOCK_HORN = { wave: 'square', notes: [[440, 0.09], [0, 0.04], [440, 0.12]] };
export function horn(opt, v = 1) {
  v *= vol();
  const h = opt && Array.isArray(opt.notes) ? opt : STOCK_HORN;
  if (v <= 0.02 || !ready()) return;
  let t = ac.currentTime + 0.005;
  for (const [f, d] of h.notes) {
    if (f > 0) { tone(t, h.wave || 'square', f, f, d, 0.12 * v, 0.01); tone(t, 'triangle', f * 2, f * 2, d, 0.04 * v, 0.01); }
    t += d;
  }
}

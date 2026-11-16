// Original UI chimes for the space lobby, synthesized live (no sample files): soft glassy
// sine/triangle tones with a short shimmer. Follows the Sound and SFX volume settings.
//   chime(id) with id in CHIME_IDS
import { SETTINGS } from '../../settings.js';
import { audioCtx } from '../../audio.js';

let out = null, ctxOf = null;
function bus(ac) {
  if (out && ctxOf === ac) return out;
  ctxOf = ac; out = ac.createGain(); out.gain.value = 0.55; out.connect(ac.destination);
  return out;
}
function tone(ac, t, f0, f1, dur, vol, type = 'sine', attack = 0.006) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(bus(ac)); o.start(t); o.stop(t + dur + 0.03);
}
// a bell-ish ping: a sine and a quieter inharmonic partial
const glass = (ac, t, f, dur, v) => { tone(ac, t, f, f, dur, 0.16 * v); tone(ac, t, f * 2.76, f * 2.76, dur * 0.5, 0.035 * v); };
const CHIMES = {
  tap: (ac, t, v) => glass(ac, t, 1320, 0.14, v),
  select: (ac, t, v) => { glass(ac, t, 990, 0.16, v); glass(ac, t + 0.06, 1480, 0.22, v); },
  back: (ac, t, v) => { glass(ac, t, 1180, 0.12, v * 0.8); glass(ac, t + 0.05, 880, 0.18, v * 0.8); },
  swipe: (ac, t, v) => tone(ac, t, 520, 1040, 0.16, 0.06 * v, 'triangle', 0.03),
  on: (ac, t, v) => { tone(ac, t, 660, 660, 0.08, 0.1 * v, 'triangle'); tone(ac, t + 0.07, 990, 990, 0.12, 0.1 * v, 'triangle'); },
  off: (ac, t, v) => { tone(ac, t, 880, 880, 0.08, 0.09 * v, 'triangle'); tone(ac, t + 0.07, 587, 587, 0.12, 0.09 * v, 'triangle'); },
  ready: (ac, t, v) => [784, 1046, 1318].forEach((f, i) => glass(ac, t + i * 0.07, f, 0.3, v * 0.8)),
  launch: (ac, t, v) => { tone(ac, t, 180, 1400, 0.55, 0.12 * v, 'sawtooth', 0.04); tone(ac, t, 90, 360, 0.6, 0.18 * v, 'sine', 0.03); [659, 988, 1319].forEach((f, i) => glass(ac, t + 0.32 + i * 0.05, f, 0.5, v)); },
  error: (ac, t, v) => { tone(ac, t, 330, 300, 0.12, 0.1 * v, 'triangle'); tone(ac, t + 0.13, 247, 220, 0.18, 0.1 * v, 'triangle'); },
};
export const CHIME_IDS = Object.keys(CHIMES);
const last = {};
export function chime(id, vol = 1) {
  const v = vol * (SETTINGS.sfxVol ?? 1);
  if (!SETTINGS.sound || v <= 0.02 || !CHIMES[id]) return false;
  const ac = audioCtx();
  if (!ac || ac.state !== 'running') return false;
  const now = ac.currentTime;
  if (last[id] && now - last[id] < 0.05) return false; // a double tap never doubles the sound
  last[id] = now;
  CHIMES[id](ac, now + 0.005, Math.min(1, v));
  return true;
}

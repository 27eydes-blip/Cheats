// Original sound effects, synthesized at runtime with Web Audio (no sample files).
// Respects the Sound setting; unlocked on the first user gesture (mobile requirement).
import { SETTINGS } from './settings.js';

let ac = null, master = null, noiseBuf = null;
function ctx() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return ac;
}
export function unlockAudio() { const a = ctx(); if (a && a.state === 'suspended') a.resume(); }
for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, unlockAudio, { once: false, passive: true });

// tiny building blocks
function tone(t0, { type = 'square', f0 = 440, f1 = f0, dur = 0.12, vol = 0.3, attack = 0.005 }) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(t0, { dur = 0.15, vol = 0.3, f0 = 2000, f1 = 400, q = 1, type = 'bandpass' }) {
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t0); s.stop(t0 + dur + 0.02);
}

const SOUNDS = {
  // shots, one voice per brawler
  shoot_volt: (t, v) => tone(t, { type: 'square', f0: 1400, f1: 500, dur: 0.07, vol: 0.18 * v }),
  shoot_brick: (t, v) => { noise(t, { dur: 0.18, vol: 0.5 * v, f0: 900, f1: 120, type: 'lowpass' }); tone(t, { type: 'sine', f0: 140, f1: 50, dur: 0.15, vol: 0.4 * v }); },
  shoot_wisp: (t, v) => { tone(t, { type: 'sawtooth', f0: 2200, f1: 300, dur: 0.22, vol: 0.2 * v }); noise(t, { dur: 0.08, vol: 0.2 * v, f0: 6000, f1: 2000 }); },
  shoot_dune: (t, v) => noise(t, { dur: 0.35, vol: 0.35 * v, f0: 400, f1: 1800, q: 2 }),
  shoot_rook: (t, v) => { tone(t, { type: 'sine', f0: 220, f1: 120, dur: 0.12, vol: 0.4 * v }); tone(t + 0.05, { type: 'triangle', f0: 600, f1: 900, dur: 0.08, vol: 0.12 * v }); },
  shoot_flicker: (t, v) => noise(t, { dur: 0.09, vol: 0.35 * v, f0: 3000, f1: 8000, q: 3, type: 'highpass' }),
  hit: (t, v) => { tone(t, { type: 'square', f0: 320, f1: 160, dur: 0.06, vol: 0.18 * v }); noise(t, { dur: 0.05, vol: 0.15 * v, f0: 3000, f1: 1500 }); },
  hurt: (t, v) => tone(t, { type: 'sawtooth', f0: 180, f1: 90, dur: 0.14, vol: 0.25 * v }),
  super: (t, v) => { tone(t, { type: 'sawtooth', f0: 200, f1: 900, dur: 0.25, vol: 0.2 * v }); tone(t + 0.08, { type: 'square', f0: 600, f1: 1400, dur: 0.18, vol: 0.12 * v }); },
  slam: (t, v) => { tone(t, { type: 'sine', f0: 90, f1: 30, dur: 0.45, vol: 0.6 * v }); noise(t, { dur: 0.4, vol: 0.4 * v, f0: 600, f1: 60, type: 'lowpass' }); },
  boom: (t, v) => { tone(t, { type: 'sine', f0: 120, f1: 40, dur: 0.35, vol: 0.5 * v }); noise(t, { dur: 0.35, vol: 0.45 * v, f0: 1500, f1: 100, type: 'lowpass' }); },
  worm: (t, v) => { noise(t, { dur: 0.6, vol: 0.4 * v, f0: 200, f1: 900, q: 4 }); tone(t + 0.1, { type: 'triangle', f0: 70, f1: 140, dur: 0.4, vol: 0.4 * v }); },
  blink: (t, v) => { tone(t, { type: 'sine', f0: 1800, f1: 300, dur: 0.12, vol: 0.2 * v }); tone(t + 0.1, { type: 'sine', f0: 300, f1: 1800, dur: 0.12, vol: 0.2 * v }); },
  cloak: (t, v) => tone(t, { type: 'sine', f0: 900, f1: 200, dur: 0.4, vol: 0.18 * v }),
  elim: (t, v) => { tone(t, { type: 'square', f0: 660, f1: 660, dur: 0.08, vol: 0.2 * v }); tone(t + 0.09, { type: 'square', f0: 990, f1: 990, dur: 0.14, vol: 0.2 * v }); noise(t, { dur: 0.3, vol: 0.25 * v, f0: 4000, f1: 500 }); },
  // bounty steal: a little rising coin arpeggio
  bounty: (t, v) => [880, 1109, 1319, 1760].forEach((f, i) => tone(t + i * 0.06, { type: 'triangle', f0: f, dur: 0.12, vol: 0.22 * v })),
  pickup: (t, v) => tone(t, { type: 'triangle', f0: 700, f1: 1400, dur: 0.12, vol: 0.2 * v }),
  event_warn: (t, v) => { for (let i = 0; i < 2; i++) tone(t + i * 0.32, { type: 'sawtooth', f0: 420, f1: 300, dur: 0.26, vol: 0.18 * v }); },
  event_on: (t, v) => { tone(t, { type: 'square', f0: 330, f1: 660, dur: 0.3, vol: 0.18 * v }); noise(t, { dur: 0.5, vol: 0.2 * v, f0: 500, f1: 3000 }); },
  victory: (t, v) => [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.13, { type: 'square', f0: f, dur: i === 3 ? 0.45 : 0.14, vol: 0.2 * v })),
  defeat: (t, v) => [392, 330, 262].forEach((f, i) => tone(t + i * 0.18, { type: 'triangle', f0: f, dur: 0.22, vol: 0.2 * v })),
};
export const SOUND_IDS = Object.keys(SOUNDS);

let lastPlay = {};
// vol 0..1; caps how often one sound can retrigger so busy fights don't get harsh
export function sfx(id, vol = 1) {
  if (!SETTINGS.sound || vol <= 0.02) return;
  const a = ctx();
  if (!a || a.state !== 'running' || !SOUNDS[id]) return;
  const now = a.currentTime;
  if (lastPlay[id] && now - lastPlay[id] < 0.045) return;
  lastPlay[id] = now;
  SOUNDS[id](now + 0.005, Math.min(1, vol));
}
// distance falloff for world sounds
export const falloff = (d) => Math.max(0, 1 - d / 1100);

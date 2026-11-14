// Original lobby music: an upbeat 4-bar loop synthesized live (no audio files).
// 116 BPM, F major. Bass bounce + plucky lead + soft pad + drums. Ducks when popups open.
import { SETTINGS } from '../settings.js';
import { audioCtx } from '../audio.js';

const BPM = 116, STEP = 60 / BPM / 4; // 16th notes
const n = (m) => 440 * 2 ** ((m - 69) / 12);
// chords per bar (MIDI roots / triads): F, C, Dm, Bb
const CHORDS = [[53, 57, 60], [48, 52, 55], [50, 53, 57], [46, 50, 53]];
const BASS = [41, 36, 38, 34];
// lead melody, 16 steps per bar (0 = rest) — written for this game
const LEAD = [
  [77, 0, 76, 77, 0, 72, 0, 74, 76, 0, 77, 0, 79, 0, 77, 0],
  [76, 0, 74, 72, 0, 67, 0, 72, 74, 0, 76, 0, 74, 72, 0, 0],
  [74, 0, 72, 74, 0, 77, 0, 76, 74, 0, 72, 0, 69, 0, 72, 0],
  [70, 0, 72, 74, 0, 72, 70, 0, 69, 0, 70, 72, 0, 74, 76, 0],
];
const KICK = [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0];
const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1];

let ac, bus, duckGain, timer = null, nextT = 0, step = 0, noise;
function voice(t, type, f, dur, vol, out, attack = 0.005) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
}
function drum(t, kind) {
  if (kind === 'kick') { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.2); return; }
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noise; f.type = kind === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'hat' ? 7000 : 1800;
  g.gain.setValueAtTime(kind === 'hat' ? 0.08 : 0.28, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'hat' ? 0.04 : 0.14));
  s.connect(f); f.connect(g); g.connect(bus); s.start(t); s.stop(t + 0.2);
}
function schedule() {
  while (nextT < ac.currentTime + 0.15) {
    const bar = Math.floor(step / 16) % 4, s = step % 16, t = nextT;
    if (s % 2 === 0) voice(t, 'triangle', n(BASS[bar] + (s % 8 === 6 ? 12 : 0)), STEP * 1.6, 0.32, bus);
    if (s === 0 || s === 8) for (const m of CHORDS[bar]) voice(t, 'sine', n(m + 12), STEP * 7, 0.05, bus, 0.04);
    if (s % 4 === 2) for (const m of CHORDS[bar]) voice(t, 'square', n(m + 12), STEP * 0.6, 0.025, bus);
    const L = LEAD[bar][s];
    if (L) voice(t, 'square', n(L), STEP * 1.4, 0.06, bus);
    if (KICK[s]) drum(t, 'kick');
    if (SNARE[s]) drum(t, 'snare');
    if (s % 2 === 1) drum(t, 'hat');
    nextT += STEP; step++;
  }
}
function vol() { return SETTINGS.sound === false ? 0 : (SETTINGS.musicVol ?? 0.6) * 0.5; }
export function startMusic() {
  ac = audioCtx(); if (!ac || timer) return;
  if (!noise) { noise = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  duckGain = ac.createGain(); bus = ac.createGain();
  bus.gain.value = vol(); duckGain.gain.value = 1;
  bus.connect(duckGain); duckGain.connect(ac.destination);
  bus.gain.setValueAtTime(0.0001, ac.currentTime); bus.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol()), ac.currentTime + 1.2);
  nextT = ac.currentTime + 0.05; step = 0;
  timer = setInterval(schedule, 25);
}
export function stopMusic() {
  if (!timer) return;
  clearInterval(timer); timer = null;
  const b = bus, d = duckGain;
  b.gain.cancelScheduledValues(ac.currentTime); b.gain.setValueAtTime(b.gain.value, ac.currentTime); b.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.5);
  setTimeout(() => { try { d.disconnect(); } catch {} }, 700);
}
export function duck(on) { ducked = on; if (duckGain) duckGain.gain.setTargetAtTime(on ? 0.3 : 1, ac.currentTime, 0.12); }
export function setMusicVolume() { if (bus && timer) bus.gain.setTargetAtTime(Math.max(0.0001, vol()), ac.currentTime, 0.1); }
export const musicPlaying = () => !!timer;
let ducked = false;
export const isDucked = () => ducked;

// Oblivion GP race audio mix: the race music (an original 4-bar loop at 128 BPM, synthesized live
// in three layers), how it intensifies on the final lap and ducks under a crash. (The pass-by
// whoosh and grid-rev helpers are pure maths in moments.js.)
// Sound off or Music at 0 = the music never starts (and stops if it was playing): fully off.
import { SETTINGS } from '../settings.js';
import { audioCtx } from '../audio.js';

const BPM = 128, STEP = 60 / BPM / 4;
const n = (m) => 440 * 2 ** ((m - 69) / 12);
// A minor: Am, F, C, G (roots / triads), written for this game
const CH = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const BASS = [45, 41, 48, 43];
const ARP = [0, 2, 1, 2, 0, 2, 1, 2, 0, 1, 2, 1, 0, 2, 1, 2]; // chord tone per 16th (peak layer)
const LEAD = [[76, 0, 0, 74, 76, 0, 79, 0, 76, 0, 74, 0, 72, 0, 74, 0], [72, 0, 0, 72, 74, 0, 72, 0, 69, 0, 72, 0, 74, 0, 0, 0],
  [72, 0, 0, 74, 76, 0, 79, 0, 81, 0, 79, 0, 76, 0, 74, 0], [74, 0, 0, 74, 79, 0, 78, 0, 74, 0, 71, 0, 74, 0, 79, 0]];
const KICK = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0];
const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];

export const musicVol = () => (SETTINGS.sound === false ? 0 : (SETTINGS.musicVol ?? 0.6) * 0.42);
let M = null; // { ac, bus, duck, peak, drive, timer, nextT, step, noise, intensity, duckUntil }
function voice(t, type, f, dur, v, out, attack = 0.005) {
  const o = M.ac.createOscillator(), g = M.ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
}
function hit(t, kind, out) {
  const ac = M.ac;
  if (kind === 'kick') { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.11); g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.2); return; }
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), hat = kind === 'hat';
  s.buffer = M.noise; f.type = hat ? 'highpass' : 'bandpass'; f.frequency.value = hat ? 7500 : 1700;
  g.gain.setValueAtTime(hat ? 0.07 : 0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (hat ? 0.035 : 0.13));
  s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + 0.2);
}
function schedule() {
  const ac = M.ac;
  if (!musicVol()) { stopRaceMusic(); return; }
  if (ac.state !== 'running') { M.nextT = ac.currentTime + 0.05; return; }
  if (M.nextT < ac.currentTime) M.nextT = ac.currentTime + 0.02; // throttled timer: skip ahead, never burst
  const hot = M.intensity >= 1;
  while (M.nextT < ac.currentTime + 0.15) {
    const bar = Math.floor(M.step / 16) % 4, s = M.step % 16, t = M.nextT, ch = CH[bar];
    // base layer: bass + kick + offbeat hats (always)
    if (s % 2 === 0) voice(t, 'triangle', n(BASS[bar] + (s % 4 === 2 ? 12 : 0)), STEP * 1.5, 0.3, M.bus);
    if (KICK[s]) hit(t, 'kick', M.bus);
    if (s % 4 === 2 || (hot && s % 2 === 1)) hit(t, 'hat', M.bus);
    // drive layer: chord stabs + snare
    if (s % 4 === 3 || s === 0) for (const m of ch) voice(t, 'square', n(m), STEP * 0.7, 0.022, M.drive);
    if (SNARE[s] || (hot && bar === 3 && s >= 13)) hit(t, 'snare', M.drive);
    // peak layer (final lap): arpeggio + lead, an octave up
    if (hot) {
      voice(t, 'sawtooth', n(ch[ARP[s]] + 12), STEP * 0.9, 0.028, M.peak);
      const L = LEAD[bar][s]; if (L) voice(t, 'square', n(L), STEP * 1.6, 0.05, M.peak);
    }
    M.nextT += STEP; M.step++;
  }
  // duck back up after a crash
  if (M.duckUntil && ac.currentTime > M.duckUntil) { M.duckUntil = 0; M.duck.gain.setTargetAtTime(1, ac.currentTime, 0.35); }
}
export function startRaceMusic() {
  if (M || !musicVol()) return false;
  const ac = audioCtx(); if (!ac) return false;
  const noise = ac.createBuffer(1, Math.round(ac.sampleRate * 0.3), ac.sampleRate), d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const bus = ac.createGain(), duck = ac.createGain(), drive = ac.createGain(), peak = ac.createGain();
  drive.connect(bus); peak.connect(bus); bus.connect(duck); duck.connect(ac.destination);
  bus.gain.value = 0.0001; drive.gain.value = 0.8; peak.gain.value = 0.0001; duck.gain.value = 1;
  M = { ac, bus, duck, drive, peak, noise, nextT: ac.currentTime + 0.05, step: 0, intensity: 0, duckUntil: 0, timer: 0 };
  bus.gain.setTargetAtTime(musicVol(), ac.currentTime, 0.6);
  M.timer = setInterval(schedule, 25);
  return true;
}
export function stopRaceMusic() {
  if (!M) return;
  const m = M; M = null;
  clearInterval(m.timer);
  try { m.bus.gain.cancelScheduledValues(m.ac.currentTime); m.bus.gain.setTargetAtTime(0.0001, m.ac.currentTime, 0.25); } catch {}
  setTimeout(() => { try { m.duck.disconnect(); } catch {} }, 1200);
}
// 0 = racing, 1 = final lap (the peak layer comes in, hats double, a little louder)
export function setMusicIntensity(k) {
  if (!M || M.intensity === k) return;
  M.intensity = k;
  const t = M.ac.currentTime;
  M.peak.gain.setTargetAtTime(k >= 1 ? 1 : 0.0001, t, 0.4);
  M.bus.gain.setTargetAtTime(musicVol() * (k >= 1 ? 1.15 : 1), t, 0.5);
}
// a crash: the music dips for a moment (seconds), then comes back
export function duckRaceMusic(sec = 1.2, level = 0.22) {
  if (!M) return;
  const t = M.ac.currentTime;
  M.duck.gain.setTargetAtTime(level, t, 0.04);
  M.duckUntil = Math.max(M.duckUntil, t + sec);
}
export const raceMusicState = () => (M ? { playing: true, intensity: M.intensity, ducked: !!M.duckUntil, level: M.bus.gain.value } : { playing: false, intensity: 0, ducked: false, level: 0 });

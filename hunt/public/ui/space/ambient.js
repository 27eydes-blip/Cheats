// Original ambient synth menu track for the space lobby, synthesized live (no audio files), in
// the same style as ui/music.js. 72 BPM in D minor: slow detuned pads through a breathing low-pass
// filter, a sub bass, a sparse glassy arpeggio into a dotted-eighth echo, and a far bell now and then.
// Written for this game. Ducks under popups like the old menu music.
//   startAmbient(), stopAmbient(), duckAmbient(on), setAmbientVolume(), ambientPlaying(),
//   ambientDucked(), ambientLevel() (tests)
import { SETTINGS } from '../../settings.js';
import { audioCtx } from '../../audio.js';

const BPM = 72, STEP = 60 / BPM / 2; // eighth notes, 8 per bar
const n = (m) => 440 * 2 ** ((m - 69) / 12);
// one chord per bar (MIDI): Dm9, Bbmaj7(#11), Gm9, A7sus4 -> back to D
export const AMBIENT_CHORDS = [[50, 53, 57, 60, 64], [46, 50, 53, 57, 64], [43, 46, 50, 53, 57], [45, 50, 52, 55, 57]];
const BASS = [38, 34, 31, 33];
// arpeggio: indexes into the chord (+5 = an octave up), -1 = rest; two bars, written for this track
const ARP = [[0, -1, 2, 4, -1, 3, -1, 1], [5, -1, 4, -1, 2, 3, -1, -1]];
export const DUCK_LEVEL = 0.28;

let ac = null, bus, duckGain, filt, lfo, lfoAmt, delay, fb, wet, timer = null, nextT = 0, step = 0, ducked = false;
const vol = () => (SETTINGS.sound === false ? 0 : (SETTINGS.musicVol ?? 0.6) * 0.45);

function pad(t, f, dur) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 1.4); g.gain.setValueAtTime(0.035, t + dur - 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.8);
  g.connect(filt);
  for (const d of [-6, 6]) { // two saws a few cents apart: the slow chorus shimmer
    const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d;
    o.connect(g); o.start(t); o.stop(t + dur + 0.9);
  }
}
function pluck(t, f, v) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'triangle'; o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  o.connect(g); g.connect(bus); g.connect(delay); o.start(t); o.stop(t + 1);
}
function sub(t, f, dur) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine'; o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.6); g.gain.setValueAtTime(0.16, t + dur - 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.2);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.3);
}
function bell(t, f) {
  for (const [k, v, d] of [[1, 0.05, 3], [2.4, 0.015, 1.6]]) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.value = f * k;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(bus); g.connect(delay); o.start(t); o.stop(t + d + 0.05);
  }
}
function schedule() {
  if (nextT < ac.currentTime) nextT = ac.currentTime + 0.05; // timer was throttled: skip ahead, never burst
  while (nextT < ac.currentTime + 0.3) {
    const bar = Math.floor(step / 8) % 4, s = step % 8, t = nextT, ch = AMBIENT_CHORDS[bar];
    if (s === 0) {
      for (const m of ch.slice(0, 4)) pad(t, n(m + 12), STEP * 8);
      sub(t, n(BASS[bar]), STEP * 8);
      if (bar === 1 || bar === 3) bell(t + STEP * 3, n(ch[4] + 24));
    }
    const a = ARP[Math.floor(step / 8) % 2][s];
    if (a >= 0) pluck(t, n(ch[a % 5] + 24 + (a >= 5 ? 12 : 0)), 0.05);
    nextT += STEP; step++;
  }
}
export function startAmbient() {
  ac = audioCtx(); if (!ac || timer) return false;
  bus = ac.createGain(); duckGain = ac.createGain(); duckGain.gain.value = ducked ? DUCK_LEVEL : 1;
  filt = ac.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 900; filt.Q.value = 0.7; filt.connect(bus);
  lfo = ac.createOscillator(); lfo.frequency.value = 0.07; lfoAmt = ac.createGain(); lfoAmt.gain.value = 450; lfo.connect(lfoAmt); lfoAmt.connect(filt.frequency); lfo.start();
  delay = ac.createDelay(1.5); delay.delayTime.value = STEP * 1.5; fb = ac.createGain(); fb.gain.value = 0.38; wet = ac.createGain(); wet.gain.value = 0.32;
  delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(bus);
  bus.connect(duckGain); duckGain.connect(ac.destination);
  bus.gain.setValueAtTime(0.0001, ac.currentTime); bus.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol()), ac.currentTime + 2.5);
  nextT = ac.currentTime + 0.1; step = 0;
  timer = setInterval(schedule, 50);
  return true;
}
export function stopAmbient() {
  if (!timer) return;
  clearInterval(timer); timer = null;
  const b = bus, d = duckGain, l = lfo, a = ac;
  b.gain.cancelScheduledValues(a.currentTime); b.gain.setValueAtTime(Math.max(0.0001, b.gain.value), a.currentTime); b.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 1);
  setTimeout(() => { try { l.stop(); } catch {} try { d.disconnect(); } catch {} }, 1300);
}
export function duckAmbient(on) { ducked = !!on; if (duckGain && ac) duckGain.gain.setTargetAtTime(on ? DUCK_LEVEL : 1, ac.currentTime, 0.15); }
export function setAmbientVolume() { if (bus && timer) bus.gain.setTargetAtTime(Math.max(0.0001, vol()), ac.currentTime, 0.1); }
export const ambientPlaying = () => !!timer;
export const ambientDucked = () => ducked;
export const ambientLevel = () => (bus && timer ? bus.gain.value * (duckGain ? duckGain.gain.value : 1) : 0);

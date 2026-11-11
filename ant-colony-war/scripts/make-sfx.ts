// Synthesises every sound effect into public/sfx/*.wav (royalty-free by construction).
import fs from 'node:fs';
import path from 'node:path';

const SR = 44100;
const OUT = path.join(__dirname, '..', 'public', 'sfx');
fs.mkdirSync(OUT, { recursive: true });

let seed = 12345;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const white = () => rnd() * 2 - 1;
const buf = (sec: number) => new Float32Array(Math.round(sec * SR));
const TAU = Math.PI * 2;

function writeWav(name: string, data: Float32Array, gain = 1) {
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  const k = peak > 0 ? (0.89 / peak) * gain : 1;
  const b = Buffer.alloc(44 + data.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + data.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(data.length * 2, 40);
  data.forEach((v, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v * k)) * 32767), 44 + i * 2));
  fs.writeFileSync(path.join(OUT, name), b);
  console.log('sfx', name, (data.length / SR).toFixed(2) + 's');
}

const lowpass = (x: Float32Array, fc: number) => { const a = 1 - Math.exp((-TAU * fc) / SR); let y = 0; return x.map((v) => (y += a * (v - y))); };
const highpass = (x: Float32Array, fc: number) => { const l = lowpass(x, fc); return x.map((v, i) => v - l[i]); };
function bandpass(x: Float32Array, f: number | ((i: number) => number), q: number) {
  const out = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const fc = typeof f === 'number' ? f : f(i);
    const w = (TAU * fc) / SR, al = Math.sin(w) / (2 * q), a0 = 1 + al;
    const b0 = al / a0, b2 = -al / a0, a1 = (-2 * Math.cos(w)) / a0, a2 = (1 - al) / a0;
    const y = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y; out[i] = y;
  }
  return out;
}
function reverb(x: Float32Array, tail = 1.5, mix = 0.35) {
  const out = new Float32Array(x.length + Math.round(tail * SR));
  out.set(x);
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => ({ d, g: Math.pow(0.001, d / SR / tail) }));
  const wet = new Float32Array(out.length);
  for (const c of combs) { const line = new Float32Array(out.length); for (let i = 0; i < out.length; i++) { line[i] = out[i] + (i >= c.d ? line[i - c.d] * c.g : 0); wet[i] += line[i] / combs.length; } }
  const lp = lowpass(wet, 4000);
  return out.map((v, i) => v * (1 - mix) + lp[i] * mix * 2);
}
const brown = (n: number) => { let y = 0; const o = new Float32Array(n); for (let i = 0; i < n; i++) { y = (y + white() * 0.02) * 0.998; o[i] = y; } return o; };
/** Crossfade the end into the start so a buffer loops seamlessly. */
function loopable(x: Float32Array, fade = 0.5) {
  const f = Math.round(fade * SR), out = x.slice(0, x.length - f);
  for (let i = 0; i < f; i++) { const k = i / f; out[i] = out[i] * k + x[x.length - f + i] * (1 - k); }
  return out;
}
const env = (i: number, at: number, dec: number) => (i < at ? 0 : Math.exp(-(i - at) / SR / dec));

// --- drone: deep, slowly breathing, seamless loop
{
  const L = 24, x = buf(L + 1), n = brown(x.length), nl = lowpass(n, 180);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR, lfo = 0.6 + 0.4 * Math.sin((TAU * t) / 8), lfo2 = 0.5 + 0.5 * Math.sin((TAU * t) / 12 + 1);
    x[i] = 0.5 * Math.sin(TAU * 41.25 * t) * lfo + 0.3 * Math.sin(TAU * 55 * t + Math.sin(TAU * 0.25 * t)) * lfo2 + 0.18 * Math.sin(TAU * 61.75 * t) + 0.08 * Math.sin(TAU * 110 * t) * lfo2 + nl[i] * 6;
  }
  writeWav('drone.wav', loopable(x, 1), 0.9);
}
// --- heartbeat at 72 bpm
{
  const L = 60 / 72, x = buf(L);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    for (const [at, a] of [[0.02, 1], [0.3, 0.7]]) if (t > at) { const d = t - at; x[i] += a * Math.sin(TAU * (48 + 30 * Math.exp(-d * 30)) * d) * Math.exp(-d / 0.09); }
  }
  writeWav('heartbeat.wav', lowpass(x, 220));
}
// --- swarm: thousands of tiny feet
{
  const L = 7, x = buf(L);
  for (let k = 0; k < 9000; k++) { const at = Math.floor(rnd() * x.length), a = 0.2 + rnd() * 0.8, f = 2500 + rnd() * 4500; for (let j = 0; j < 220 && at + j < x.length; j++) x[at + j] += a * Math.sin((TAU * f * j) / SR) * Math.exp(-j / 40); }
  const rustle = highpass(Float32Array.from({ length: x.length }, white), 3000).map((v, i) => v * 0.25 * (0.6 + 0.4 * Math.sin((TAU * i) / SR * 0.7)));
  const mixed = x.map((v, i) => v * 0.6 + rustle[i]);
  writeWav('swarm.wav', loopable(lowpass(mixed, 9000), 0.6), 0.8);
}
// --- fire crackle
{
  const L = 7, x = buf(L), r = lowpass(brown(x.length), 300);
  for (let i = 0; i < x.length; i++) x[i] = r[i] * 8 + white() * 0.04;
  for (let k = 0; k < 420; k++) { const at = Math.floor(rnd() * x.length), a = rnd() * rnd(); for (let j = 0; j < 1600 && at + j < x.length; j++) x[at + j] += a * white() * Math.exp(-j / (60 + rnd() * 200)); }
  writeWav('fire.wav', loopable(lowpass(x, 7000), 0.6), 0.8);
}
// --- rain
{
  const L = 7, x = buf(L), hiss = bandpass(Float32Array.from({ length: x.length }, white), 2500, 0.4);
  for (let i = 0; i < x.length; i++) x[i] = hiss[i] * 0.6;
  for (let k = 0; k < 1800; k++) { const at = Math.floor(rnd() * x.length), a = rnd() * 0.5, f = 900 + rnd() * 2600; for (let j = 0; j < 500 && at + j < x.length; j++) x[at + j] += a * Math.sin((TAU * f * j) / SR) * Math.exp(-j / 70); }
  writeWav('rain.wav', loopable(x, 0.6), 0.7);
}
// --- senses: sub pulse + sonar ping + shimmer
{
  const L = 4.4, x = buf(L);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    x[i] = 0.35 * Math.sin(TAU * 36 * t) * (0.5 + 0.5 * Math.sin((TAU * t) / 2.2)) + 0.05 * Math.sin(TAU * 1760 * t) * (0.5 + 0.5 * Math.sin(TAU * 6 * t));
    for (const at of [0, 2.2]) if (t >= at) x[i] += 0.5 * Math.sin(TAU * 880 * (t - at)) * Math.exp(-(t - at) / 0.5);
  }
  writeWav('senses.wav', reverb(x, 1.2, 0.4).slice(0, x.length), 0.7);
}
// --- the trap-jaw SNAP: a vicious crack with a metallic ring and a room tail
{
  const x = buf(0.6);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    x[i] = white() * env(i, 0, 0.004) * 1.2 + Math.sin(TAU * 3200 * t) * env(i, 0, 0.012) * 0.8 + Math.sin(TAU * 1830 * t) * env(i, 0, 0.09) * 0.25 + Math.sin(TAU * (90 * Math.exp(-t * 8) + 50) * t) * env(i, 0, 0.12) * 0.9;
  }
  writeWav('snap.wav', reverb(highpass(x, 40), 1.4, 0.3));
}
// --- impact: low boom
{
  const x = buf(1.6), n = lowpass(Float32Array.from({ length: x.length }, white), 500);
  for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = Math.tanh(1.8 * (Math.sin(TAU * (28 + 50 * Math.exp(-t * 6)) * t) * env(i, 0, 0.45) + n[i] * env(i, 0, 0.08) * 3)); }
  writeWav('impact.wav', reverb(x, 1.2, 0.25));
}
// --- whoosh
{
  const L = 1.3, x = Float32Array.from({ length: Math.round(L * SR) }, white);
  const y = bandpass(x, (i) => 200 + 2800 * Math.sin((Math.PI * i) / x.length) ** 2, 1.2).map((v, i) => v * Math.sin((Math.PI * i) / x.length) ** 1.5);
  writeWav('whoosh.wav', y, 0.8);
}
// --- digital glitch for the title
{
  const x = buf(0.55);
  let i = 0;
  while (i < x.length) { const len = Math.floor(SR * (0.01 + rnd() * 0.05)), f = 80 + rnd() * 1800, a = rnd() > 0.3 ? 0.7 : 0; for (let j = 0; j < len && i < x.length; j++, i++) x[i] = a * (Math.sin((TAU * f * j) / SR) > 0 ? 1 : -1) * (0.6 + 0.4 * white()); }
  writeWav('glitch.wav', lowpass(x.map((v) => Math.round(v * 6) / 6), 6000), 0.6);
}
// --- thunder
{
  const L = 4, x = buf(L), b = lowpass(brown(x.length), 260);
  for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = white() * env(i, 0, 0.03) * 0.6 + b[i] * 14 * (Math.min(1, t * 6)) * Math.exp(-t / 1.4) * (0.6 + 0.4 * Math.sin(TAU * 3 * t + Math.sin(TAU * 0.7 * t) * 3)); }
  writeWav('thunder.wav', x);
}

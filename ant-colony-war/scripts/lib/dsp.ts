// Small audio effects for the narration (pure TypeScript, no extra tools needed).
import type { GreenTone } from '../../script/types';

const SR = 44100;
const toF = (x: Int16Array) => Float32Array.from(x, (v) => v / 32768);
const toI = (x: Float32Array) => Int16Array.from(x, (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767))));

function biquad(x: Float32Array, type: 'lp' | 'hp' | 'bp', f: number, q = 0.707) {
  const w = (2 * Math.PI * f) / SR, cw = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0: number, b1: number, b2: number;
  if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; }
  else if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; }
  else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al, a1 = -2 * cw, a2 = 1 - al;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

function echo(x: Float32Array, amount: number, taps: [number, number][]) {
  const tail = Math.round(Math.max(...taps.map(([ms]) => ms)) * SR / 1000) * 3;
  const y = new Float32Array(x.length + tail);
  y.set(x);
  for (const [ms, g] of taps) {
    const d = Math.round((ms * SR) / 1000);
    for (let i = d; i < y.length; i++) y[i] += y[i - d] * g * amount * (i - d < x.length ? 1 : 0.6);
  }
  return y;
}

/**
 * The Green: pitched down (which also slows it slightly), a breathy whisper layer and an echo, so it sounds
 * like it comes from inside his head. Returns the new audio and the time-stretch factor (to rescale word timings).
 */
export function greenVoice(pcm: Int16Array, tone: GreenTone): { pcm: Int16Array; stretch: number } {
  const x = toF(pcm);
  const r = Math.pow(2, Math.max(0, -tone.semitones) / 12); // e.g. -4 semitones -> 1.26x longer, lower
  const n = Math.round(x.length * r);
  const low = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i / r, k = Math.floor(p), f = p - k;
    low[i] = (x[k] ?? 0) * (1 - f) + (x[k + 1] ?? 0) * f;
  }
  // whisper: band-limited noise that follows the voice's loudness
  let env = 0;
  const air = biquad(biquad(Float32Array.from({ length: n }, () => Math.random() * 2 - 1), 'hp', 2200), 'lp', 7000);
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    env += (Math.abs(low[i]) - env) * 0.004;
    w[i] = air[i] * env * 2.4 * tone.whisper;
  }
  const mixed = Float32Array.from(low, (v, i) => v + w[Math.max(0, i - 900)]);
  const out = echo(mixed, tone.echo, [[95, 0.55], [210, 0.4], [370, 0.25]]);
  // keep the level comparable to the narration
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  let srcPeak = 0;
  for (const v of x) srcPeak = Math.max(srcPeak, Math.abs(v));
  const g = peak > 0 ? Math.min(1.2, srcPeak / peak) : 1;
  return { pcm: toI(out.map((v) => v * g)), stretch: r };
}

/** Someone else's words, remembered: a faint band-limited, slightly echoing filter over [from, to) seconds. */
export function memoryFilter(pcm: Int16Array, from: number, to: number): Int16Array {
  const x = toF(pcm);
  const wet = echo(biquad(biquad(x, 'hp', 320), 'lp', 3200), 0.6, [[70, 0.35]]);
  const a = Math.round(from * SR), b = Math.round(to * SR), fade = Math.round(0.03 * SR);
  for (let i = Math.max(0, a - fade); i < Math.min(x.length, b + fade); i++) {
    const k = Math.min(1, (i - (a - fade)) / fade, (b + fade - i) / fade);
    x[i] = x[i] * (1 - 0.7 * k) + wet[i] * 0.85 * k;
  }
  return toI(x);
}

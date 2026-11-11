// Deterministic randomness: every frame must render identically on every machine.
export const hash = (n: number): number => {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
};
export const hash2 = (a: number, b: number) => hash(Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663));
export const rng = (seed: number) => {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};
const smooth = (t: number) => t * t * (3 - 2 * t);
/** 1D value noise in [-1, 1]. */
export const noise1 = (x: number, seed = 0) => {
  const i = Math.floor(x), f = x - i;
  const a = hash2(i, seed) * 2 - 1, b = hash2(i + 1, seed) * 2 - 1;
  return a + (b - a) * smooth(f);
};
/** Fractal 1D noise in roughly [-1, 1]. */
export const fbm = (x: number, seed = 0, oct = 3) => {
  let v = 0, amp = 1, sum = 0, fr = 1;
  for (let o = 0; o < oct; o++) {
    v += noise1(x * fr, seed + o * 101) * amp;
    sum += amp;
    amp *= 0.5;
    fr *= 2.03;
  }
  return v / sum;
};
export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = (t: number) => smooth(clamp(t));
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
export const range = (n: number) => Array.from({ length: n }, (_, i) => i);

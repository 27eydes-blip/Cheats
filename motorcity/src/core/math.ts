export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeIn = (a: number, b: number, t: number) => a + (b - a) * t * t;
export const easeInOut = (a: number, b: number, t: number) => a + (b - a) * (-Math.cos(t * Math.PI) / 2 + 0.5);
export const approach = (v: number, target: number, step: number) =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);
export const wrap = (v: number, max: number) => ((v % max) + max) % max;
export const sign = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0);
/** Shortest forward distance from a to b on a loop of length len. */
export const loopDist = (a: number, b: number, len: number) => wrap(b - a, len);

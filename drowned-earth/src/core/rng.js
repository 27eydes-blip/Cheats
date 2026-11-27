// Deterministic randomness + noise. Everything procedural derives from (worldSeed, coordinates)
// so the same chunk is always rebuilt identically, no matter the load order.

export function hashInt(...ints) {
  let h = 2166136261 >>> 0;
  for (const v of ints) {
    let x = (v | 0) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
    x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
    x ^= x >>> 16;
    h = Math.imul(h ^ x, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

export class RNG {
  constructor(seed = 1) { this.s = (seed >>> 0) || 1; }
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length) % arr.length]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  weighted(entries) { // [{w, v}]
    let total = 0; for (const e of entries) total += e.w;
    let r = this.next() * total;
    for (const e of entries) { if ((r -= e.w) <= 0) return e.v; }
    return entries[entries.length - 1].v;
  }
  fork(...salt) { return new RNG(hashInt(this.s, ...salt)); }
}

// ---- value noise ----
function lerp(a, b, t) { return a + (b - a) * t; }
function fade(t) { return t * t * (3 - 2 * t); }
function rand2(ix, iz, seed) { return hashInt(ix, iz, seed) / 4294967296; }

export function valueNoise2(x, z, seed = 0) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = fade(x - ix), fz = fade(z - iz);
  const a = rand2(ix, iz, seed), b = rand2(ix + 1, iz, seed);
  const c = rand2(ix, iz + 1, seed), d = rand2(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
}

export function fbm2(x, z, seed = 0, oct = 4) {
  let amp = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * valueNoise2(x * f, z * f, seed + i * 101);
    norm += amp; amp *= 0.5; f *= 2.03;
  }
  return sum / norm;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const lerpN = lerp;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

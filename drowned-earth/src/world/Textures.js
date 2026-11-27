import * as THREE from 'three';
import { RNG, valueNoise2 } from '../core/rng.js';

// Procedural textures, generated once at boot on small canvases. No image files.
const cache = new Map();

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

// Tileable fbm on a torus so textures repeat seamlessly.
function tileNoise(x, y, size, period, seed, oct = 4) {
  let sum = 0, amp = 0.5, norm = 0, p = period;
  for (let o = 0; o < oct; o++) {
    const fx = (x / size) * p, fy = (y / size) * p;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const h = (a, b) => valueNoise2(((a % p) + p) % p, ((b % p) + p) % p, seed + o * 31);
    const v00 = h(ix, iy), v10 = h(ix + 1, iy), v01 = h(ix, iy + 1), v11 = h(ix + 1, iy + 1);
    const v = (v00 * (1 - sx) + v10 * sx) * (1 - sy) + (v01 * (1 - sx) + v11 * sx) * sy;
    sum += v * amp; norm += amp; amp *= 0.5; p *= 2;
  }
  return sum / norm;
}

function makeTexture(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

function paint(size, fn, opts) {
  const c = canvas(size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [r, gg, b] = fn(x, y);
    const i = (y * size + x) * 4;
    d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { c, g, tex: () => makeTexture(c, opts) };
}

// Height → tangent-space normal map
function normalFromHeight(hfn, size, strength = 2) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = hfn(x, y);
  return paint(size, (x, y) => {
    const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
    const u = h[((y - 1 + size) % size) * size + x], dn = h[((y + 1) % size) * size + x];
    let nx = (l - r) * strength, ny = (u - dn) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    return [(nx * 0.5 + 0.5) * 255, (ny * 0.5 + 0.5) * 255, (nz * 0.5 + 0.5) * 255];
  }, { srgb: false });
}

const defs = {
  // cast concrete: blotchy cure marks, aggregate speckle, formwork lines, pitting
  concrete: () => paint(512, (x, y) => {
    const n = tileNoise(x, y, 512, 6, 11, 6), s = tileNoise(x, y, 512, 40, 12, 3);
    const speck = valueNoise2(x * 0.9, y * 0.9, 5) > 0.93 ? -28 : valueNoise2(x * 0.7, y * 0.7, 6) > 0.95 ? 18 : 0;
    const form = (y % 128 < 2 ? -18 : 0) + (x % 256 < 1 ? -10 : 0);
    const pit = tileNoise(x, y, 512, 64, 14, 2) > 0.78 ? -22 : 0;
    const v = 142 + n * 78 - s * 22 + speck + form + pit;
    return [v, v * 0.985, v * 0.95];
  }).tex(),
  concreteN: () => normalFromHeight((x, y) => tileNoise(x, y, 512, 24, 13, 5) + (valueNoise2(x * 0.9, y * 0.9, 5) > 0.93 ? -0.15 : 0) + (y % 128 < 2 ? -0.2 : 0), 512, 4).tex(),
  rust: () => paint(256, (x, y) => {
    const n = tileNoise(x, y, 256, 6, 21, 5), m = tileNoise(x, y, 256, 24, 22, 3);
    const t = Math.min(1, Math.max(0, (n - 0.35) * 2.2));
    return [90 + 90 * t + m * 30, 70 + 35 * t + m * 15, 60 + 10 * t];
  }).tex(),
  wood: () => paint(512, (x, y) => {
    const plank = Math.floor(y / 64);
    const grain = Math.sin((x / 512) * 70 + tileNoise(x, y, 512, 4, 31 + plank) * 14) * 0.5 + 0.5;
    const seam = y % 64 < 3 ? 0.4 : 1;
    const base = 0.55 + 0.25 * valueNoise2(plank, 3, 7);
    const v = (0.7 + grain * 0.3) * base * seam;
    return [150 * v + 20, 112 * v + 12, 80 * v + 8];
  }).tex(),
  corrugated: () => paint(256, (x, y) => {
    const rib = Math.sin((x / 256) * Math.PI * 2 * 16) * 0.5 + 0.5;
    const n = tileNoise(x, y, 256, 8, 41, 4);
    const rust = Math.max(0, tileNoise(x, y, 256, 5, 42, 4) - 0.55) * 3;
    const v = 170 + rib * 50 - n * 40;
    return [v - rust * 30 + rust * 40, v - rust * 70, v - rust * 90];
  }).tex(),
  corrugatedN: () => normalFromHeight((x) => Math.sin((x / 256) * Math.PI * 2 * 16), 256, 1.5).tex(),
  fabric: () => paint(128, (x, y) => {
    const w = ((x % 4 < 2) !== (y % 4 < 2)) ? 1 : 0.95;
    const n = tileNoise(x, y, 128, 8, 51, 3);
    const v = (180 + n * 50) * w;
    return [v, v, v];
  }).tex(),
  mud: () => paint(256, (x, y) => {
    const n = tileNoise(x, y, 256, 6, 61, 5), r = tileNoise(x, y, 256, 40, 62, 2);
    const v = 70 + n * 60 + r * 20;
    return [v * 0.82, v * 0.85, v * 0.7];
  }).tex(),
  asphalt: () => paint(512, (x, y) => {
    const n = tileNoise(x, y, 512, 64, 71, 3), c = tileNoise(x, y, 512, 6, 72, 5);
    const crack = Math.abs(tileNoise(x, y, 512, 4, 73, 4) - 0.5) < 0.006 ? 0.55 : 1;
    const v = (60 + n * 40 + c * 25) * crack;
    return [v, v, v * 1.02];
  }).tex(),
  tile: () => paint(256, (x, y) => {
    const grout = (x % 32 < 2 || y % 32 < 2) ? 0.55 : 1;
    const n = tileNoise(x, y, 256, 8, 81, 3);
    const stain = tileNoise(x, y, 256, 3, 82, 4);
    const v = (205 - stain * 70 + n * 20) * grout;
    return [v * 0.95, v, v * 0.97];
  }).tex(),
  foliage: () => paint(128, (x, y) => {
    const n = tileNoise(x, y, 128, 8, 91, 4), m = tileNoise(x, y, 128, 32, 92, 2);
    return [40 + n * 40, 70 + n * 70 + m * 20, 30 + n * 25];
  }).tex(),
  noise: () => paint(256, (x, y) => {
    const v = tileNoise(x, y, 256, 8, 101, 5) * 255; return [v, tileNoise(x, y, 256, 16, 102, 4) * 255, tileNoise(x, y, 256, 4, 103, 4) * 255];
  }, { srgb: false }).tex(),
  // Detail normal for the water surface: two octaves of tileable ripples.
  waterN: () => normalFromHeight((x, y) => tileNoise(x, y, 256, 8, 111, 5) * 0.7 + tileNoise(x, y, 256, 24, 112, 3) * 0.3, 256, 6).tex(),
};

export function getTexture(name) {
  if (!cache.has(name)) {
    const f = defs[name];
    if (!f) throw new Error('unknown texture ' + name);
    cache.set(name, f());
  }
  return cache.get(name);
}

// Sign / poster / graffiti texture with text. Returns a CanvasTexture.
export function signTexture({ lines, bg = '#d9d2c3', fg = '#1d1d1d', w = 512, h = 256, font = 'bold 48px sans-serif',
  border = null, age = 0.5, seed = 1, stencil = false, spray = false }) {
  const key = JSON.stringify(arguments[0]);
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const rng = new RNG(seed);
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  if (border) { g.strokeStyle = border; g.lineWidth = 14; g.strokeRect(10, 10, w - 20, h - 20); }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const lh = h / (lines.length + 1);
  lines.forEach((line, i) => {
    let f = font;
    if (typeof line === 'object') { f = line.font || font; line = line.text; }
    g.font = f;
    if (spray) {
      g.shadowColor = fg; g.shadowBlur = 6;
    }
    g.fillText(line, w / 2 + (spray ? rng.range(-6, 6) : 0), lh * (i + 1));
  });
  g.shadowBlur = 0;
  if (stencil) { // stencil gaps
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 18; i++) g.fillRect(rng.range(0, w), 0, 3, h);
    g.globalCompositeOperation = 'source-over';
  }
  // weathering: stains, fading, peeling
  for (let i = 0; i < 60 * age; i++) {
    g.fillStyle = `rgba(${rng.int(40, 90)},${rng.int(40, 80)},${rng.int(30, 60)},${rng.range(0.05, 0.25) * age})`;
    const r = rng.range(4, 40);
    g.beginPath(); g.arc(rng.range(0, w), rng.range(0, h), r, 0, Math.PI * 2); g.fill();
  }
  // vertical drip streaks
  for (let i = 0; i < 20 * age; i++) {
    g.fillStyle = `rgba(50,40,30,${rng.range(0.05, 0.18) * age})`;
    g.fillRect(rng.range(0, w), rng.range(0, h * 0.5), rng.range(1, 4), rng.range(20, h));
  }
  const t = makeTexture(c, { repeat: false });
  cache.set(key, t);
  return t;
}

// Paints the space lobby sky (original art, all procedural) and saves it as WebP layers in
// public/ui/space/sky/. The runtime (ui/space/background.js) only composites these images, so
// all the expensive work (domain-warped fractal noise, thousands of stars, a ray-traced planet)
// happens here once instead of on the player's phone.
//   sky-{l,p}-{s,l}.webp     deep space + nebula + galactic band + far stars, opaque
//                            (l = landscape, p = portrait; s = phone set, l = large set for iPad / desktop)
//   planet-{s,l}.webp        the ringed gas giant, lit by the nebula's light, with alpha
// Run from hunt/: node scripts/space-sky.mjs [--preview <dir>]  (Playwright Chromium encodes the WebP)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../public/ui/space/sky/', import.meta.url));
mkdirSync(out, { recursive: true });
const pv = process.argv.indexOf('--preview') > 0 ? process.argv[process.argv.indexOf('--preview') + 1] : null;
if (pv) mkdirSync(pv, { recursive: true });

// Composition, in fractions of the image (x across, y down). The nebula sits up and to the left,
// away from the carousel / LAUNCH column; the galactic band crosses the top corner; the planet
// is placed at runtime (see background.js), lit from the nebula's side.
export const COMP = {
  l: {
    cores: [ // [x, y, size, stretch, angle, strength, teal?]
      [0.22, 0.27, 0.15, 2.2, -0.45, 1.0, 0], [0.4, 0.17, 0.11, 2.0, -0.3, 0.95, 1], [0.07, 0.52, 0.1, 1.6, -1.1, 0.75, 1],
      [0.56, 0.05, 0.09, 2.2, -0.2, 0.4, 0], [0.92, 0.8, 0.1, 2.0, 0.5, 0.2, 1],
    ],
    hot: [[0.2, 0.28, 0.06], [0.27, 0.2, 0.04]],
    band: [0.5, 0.2, -0.38, 0.17], // through (x, y), angle, half width (short-side units)
    galaxy: [0.71, 0.32, 0.6],
    hero: [[0.13, 0.13, 14, 0], [0.585, 0.07, 9, 1], [0.93, 0.33, 10, 2], [0.06, 0.78, 8, 3], [0.47, 0.42, 6, 0], [0.77, 0.12, 7, 4], [0.36, 0.86, 6, 2]],
  },
  p: {
    cores: [
      [0.28, 0.18, 0.12, 2.0, -0.95, 1.0, 0], [0.6, 0.09, 0.09, 2.0, -0.6, 0.9, 1], [0.1, 0.34, 0.08, 1.6, -1.3, 0.7, 1],
      [0.85, 0.03, 0.09, 2.0, -0.3, 0.4, 0], [0.85, 0.82, 0.1, 2.0, 0.6, 0.2, 1],
    ],
    hot: [[0.27, 0.22, 0.06], [0.36, 0.15, 0.04]],
    band: [0.5, 0.25, -1.0, 0.2],
    galaxy: [0.74, 0.43, 0.6],
    hero: [[0.12, 0.08, 14, 0], [0.82, 0.05, 9, 1], [0.9, 0.36, 10, 2], [0.07, 0.62, 8, 3], [0.6, 0.55, 6, 0], [0.4, 0.93, 7, 4]],
  },
};
// Short-side pixels per set: phone (s) and iPad / desktop (l)
const SETS = { s: 900, l: 1440 };
const ASPECT = 16 / 9;
const PLANET_R = { s: 230, l: 420 };

// ------------------------------------------------------------------ in-page renderers
// (serialised into the page: no closures over module scope)
function lib() {
  const rng = (seed) => { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const noise = (seed) => { // 2D gradient noise, about -1..1
    const R = rng(seed), p = new Uint16Array(512), gx = new Float32Array(256), gy = new Float32Array(256), a = [...Array(256).keys()];
    for (let i = 255; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    for (let i = 0; i < 512; i++) p[i] = a[i & 255];
    for (let i = 0; i < 256; i++) { const t = R() * Math.PI * 2; gx[i] = Math.cos(t); gy[i] = Math.sin(t); }
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, X = xi & 255, Y = yi & 255;
      const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
      const h00 = p[p[X] + Y], h10 = p[p[X + 1] + Y], h01 = p[p[X] + Y + 1], h11 = p[p[X + 1] + Y + 1];
      const n00 = gx[h00] * xf + gy[h00] * yf, n10 = gx[h10] * (xf - 1) + gy[h10] * yf, n01 = gx[h01] * xf + gy[h01] * (yf - 1), n11 = gx[h11] * (xf - 1) + gy[h11] * (yf - 1);
      const a0 = n00 + (n10 - n00) * u, a1 = n01 + (n11 - n01) * u;
      return (a0 + (a1 - a0) * v) * 1.414;
    };
  };
  const fbmOf = (n) => (x, y, oct = 6, g = 0.5) => { let s = 0, a = 1, t = 0; for (let i = 0; i < oct; i++) { s += a * n(x, y); t += a; a *= g; const nx = x * 1.97 + y * 0.31 + 17.1, ny = y * 1.97 - x * 0.31 + 3.7; x = nx; y = ny; } return s / t; };
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const tone = (x) => Math.pow(1 - Math.exp(-Math.max(0, x)), 1 / 2.2); // filmic-ish shoulder + display gamma
  return { rng, noise, fbmOf, sstep, tone };
}

function renderSky({ w, h, comp, seed, q }) {
  const { rng, noise, fbmOf, sstep, tone } = window.__lib();
  const S = Math.min(w, h), sc = S / 900;
  const N1 = fbmOf(noise(seed)), N2 = fbmOf(noise(seed + 11)), N3 = fbmOf(noise(seed + 23)), N4 = fbmOf(noise(seed + 37));
  const acc = new Float32Array(w * h * 3), absorb = new Float32Array(w * h);
  const cores = comp.cores.map(([x, y, s, st, an, k, hue]) => ({ x: x * w / S, y: y * h / S, s, st, c: Math.cos(an), sn: Math.sin(an), k, hue }));
  const hot = comp.hot.map(([x, y, s]) => ({ x: x * w / S, y: y * h / S, s }));
  const [bx, by, ba, bw] = comp.band, bX = bx * w / S, bY = by * h / S, bc = Math.cos(ba), bs = Math.sin(ba);
  // palette (linear light)
  const TEAL = [0.0, 0.3, 0.4], CYAN = [0.04, 0.6, 0.75], VIOLET = [0.26, 0.05, 0.62], MAGENTA = [0.75, 0.04, 0.42], PINK = [1.0, 0.22, 0.6];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  for (let y = 0; y < h; y++) {
    const v = y / S;
    for (let x = 0; x < w; x++) {
      const u = x / S, i = y * w + x;
      // emission mask: soft stretched gaussians around the cores
      let m = 0, mt = 0;
      for (const c of cores) { const dx = u - c.x, dy = v - c.y, a = (dx * c.c + dy * c.sn) / c.st, b = -dx * c.sn + dy * c.c, k = c.k * Math.exp(-(a * a + b * b) / (2 * c.s * c.s)); if (c.hue) mt += k; else m += k; }
      let ht = 0;
      for (const c of hot) { const dx = u - c.x, dy = v - c.y; ht += Math.exp(-(dx * dx + dy * dy) / (2 * c.s * c.s)); }
      // galactic band (distance across it, position along it)
      const px = u - bX, py = v - bY, along = px * bc + py * bs, across = -px * bs + py * bc;
      const band = Math.exp(-(across * across) / (2 * bw * bw)) * (0.65 + 0.35 * N4(along * 1.3 + 5, across * 1.3, 4));
      let r = [0, 0, 0], ab = 0;
      // domain-warped fbm: smooth low-octave warp, detailed log-normal density (bright knots, dark gaps)
      const f = 1.3, q1 = N1(u * f, v * f, 4), q2 = N1(u * f + 5.2, v * f + 1.3, 4);
      const w1 = u * f + 1.1 * q1, w2 = v * f + 1.1 * q2;
      const n = N3(w1 * 2.1 + 0.4 * q2, w2 * 2.1, 8, 0.54), r1 = N2(w1 * 1.9 + 3, w2 * 1.9, 5), r2 = N2(w1 * 1.2 + 9, w2 * 1.2 + 4, 4);
      const M = m + mt;
      if (M > 0.002) {
        const edge = 0.55 + 0.9 * sstep(-0.5, 0.5, q1 + 0.4 * r2); // ragged outline
        const mm = M * edge;
        const cloud = Math.exp(3.5 * n - 1.25);
        const fil = Math.pow(1 - Math.abs(r1), 7) * 0.8 + Math.pow(1 - Math.abs(N2(w1 * 5.5 + 1, w2 * 5.5, 4)), 12) * 0.45; // wisps, two scales
        const dens = mm * mm * (cloud * 0.5 + fil * 0.3) * 1.1 + mm * 0.05 * Math.exp(1.4 * r2);
        // colour: magenta cores grading to violet, teal / cyan where the teal clouds dominate
        const mk = Math.min(1, m * edge);
        let col = mix(VIOLET, MAGENTA, sstep(0.35, 0.9, mk + 0.15 * q2));
        col = mix(col, mix(TEAL, CYAN, sstep(0.3, 0.9, mt)), mt / (M + 1e-6));
        const hotT = ht * sstep(0.3, 1.4, cloud);
        col = mix(col, PINK, Math.min(1, hotT * 0.8));
        const e = dens * (1 + 2.2 * hotT) * 0.9;
        r = [col[0] * e, col[1] * e, col[2] * e];
      }
      // dark dust lanes: ridged noise following the same warp, thick in the clouds and the band
      const dl = N4(u * 3.0 + 2.1 * r2 + 11, v * 3.0 + 2.1 * r1 + 4, 6);
      const lane = (sstep(0.08, 0.5, dl) * 0.8 + Math.pow(1 - Math.abs(dl), 5) * 0.25) * Math.min(1, (m + mt) * 2.2 + band * 0.9);
      const lane2 = sstep(0.45, 0.8, 1 - Math.abs(N2(along * 2.2 + 30, across * 9 + 1.2 * r1, 5))) * band;
      ab = Math.min(0.94, lane * 0.85 + lane2 * 0.75);
      // band glow: unresolved stars, warm-white toward its spine
      const bg = band * band * 0.11 * (0.45 + 0.55 * sstep(-0.5, 0.7, N3(along * 4 + 7, across * 4, 6)));
      // deep space base: near-black navy, a touch lighter toward the top
      const base = (0.6 + 0.4 * (1 - v * S / h)) * (0.65 + 0.7 * sstep(-0.6, 0.6, N4(u * 0.7 + 40, v * 0.7, 3)));
      const o = i * 3;
      acc[o] = (r[0] + bg * 0.8) * (1 - ab) + 0.0009 * base;
      acc[o + 1] = (r[1] + bg * 0.85) * (1 - ab) + 0.0014 * base;
      acc[o + 2] = (r[2] + bg * 0.9) * (1 - ab) + 0.0072 * base;
      absorb[i] = ab;
    }
  }
  // stars: power-law brightness, colour temperatures from blue-white to deep orange, denser in the band
  const R = rng(seed + 101);
  const TEMPS = [[0.62, 0.74, 1.0], [0.78, 0.86, 1.0], [1, 1, 1], [1, 0.95, 0.84], [1, 0.84, 0.62], [1, 0.68, 0.46]];
  const pickT = () => { const t = R(); return TEMPS[t < 0.18 ? 0 : t < 0.42 ? 1 : t < 0.66 ? 2 : t < 0.84 ? 3 : t < 0.96 ? 4 : 5]; };
  const splat = (cx, cy, amp, sig, col) => {
    const rad = Math.ceil(sig * 3.2), x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(w - 1, Math.ceil(cx + rad)), y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(h - 1, Math.ceil(cy + rad));
    const k = 1 / (2 * sig * sig);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, g = amp * Math.exp(-(dx * dx + dy * dy) * k);
      if (g < 1e-4) continue;
      const o = (y * w + x) * 3; acc[o] += g * col[0]; acc[o + 1] += g * col[1]; acc[o + 2] += g * col[2];
    }
  };
  const bandAt = (u, v) => { const px = u - bX, py = v - bY, ac = -px * bs + py * bc; return Math.exp(-(ac * ac) / (2 * bw * bw)); };
  const area = (w / S) * (h / S), want = Math.round(14000 * area);
  // a few loose clusters
  const clusters = [...hot.map((c) => ({ u: c.x, v: c.y, s: c.s * 0.7, young: true })), ...Array.from({ length: 2 }, () => ({ u: R() * w / S, v: R() * h / S, s: 0.03 + R() * 0.04 }))];
  let made = 0, guard = 0;
  while (made < want && guard++ < want * 20) {
    let u, v;
    let young = false;
    if (R() < 0.03) { const c = clusters[Math.floor(R() * clusters.length)]; young = !!c.young; const a = R() * 6.283, d = Math.sqrt(-2 * Math.log(1 - R() * 0.999)) * c.s; u = c.u + Math.cos(a) * d; v = c.v + Math.sin(a) * d; }
    else { u = R() * w / S; v = R() * h / S; if (R() > 0.3 + 0.7 * bandAt(u, v)) continue; }
    const x = u * S, y = v * S;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    made++;
    const b = Math.min(5, 0.014 * Math.pow(1 - R() * 0.99995, -1 / 1.55)); // power law
    const vis = 1 - absorb[Math.floor(y) * w + Math.floor(x)] * 0.9;
    const col = young ? TEMPS[R() < 0.7 ? 0 : 1] : pickT();
    const sig = (0.42 + 0.22 * Math.min(1, Math.log2(1 + b / 0.05) / 4)) * Math.pow(sc, 0.75);
    splat(x, y, b * vis * 1.4, sig, col);
    if (b > 0.5) splat(x, y, b * vis * 0.025, sig * 4, col); // soft halo on the brighter ones
  }
  // hero stars: bloom + four thin diffraction spikes (all at the same telescope angle)
  const SP = 0.21, cs = Math.cos(SP), sn = Math.sin(SP);
  const HERO = [[0.75, 0.86, 1.0], [1, 0.93, 0.8], [0.85, 0.95, 1], [1, 0.78, 0.6], [0.95, 0.85, 1.0]];
  for (const [hx, hy, b, ci] of comp.hero) {
    const cx = hx * w, cy = hy * h, col = HERO[ci], L = (9 + b * 2.2) * sc;
    splat(cx, cy, b * 0.9, 0.9 * sc, col);
    splat(cx, cy, b * 0.06, 4.5 * sc, col);
    splat(cx, cy, b * 0.012, 14 * sc, col);
    const rad = Math.ceil(L * 2.4), x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(w - 1, Math.ceil(cx + rad)), y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(h - 1, Math.ceil(cy + rad));
    const wsp = 0.55 * sc;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, a = dx * cs + dy * sn, c = -dx * sn + dy * cs;
      const s1 = Math.exp(-Math.abs(a) / (L * 0.38)) * Math.exp(-(c * c) / (2 * wsp * wsp)), s2 = Math.exp(-Math.abs(c) / (L * 0.38)) * Math.exp(-(a * a) / (2 * wsp * wsp));
      const g = (s1 + s2) * b * 0.06;
      if (g < 1e-4) continue;
      const o = (y * w + x) * 3; acc[o] += g * col[0]; acc[o + 1] += g * col[1]; acc[o + 2] += g * col[2];
    }
  }
  // a faint far galaxy: a tilted disc with a warm core and two loose arms
  {
    const [gxf, gyf, ga] = comp.galaxy, gx = gxf * w, gy = gyf * h, gs = 0.028 * S, c = Math.cos(ga), s = Math.sin(ga);
    const rad = Math.ceil(gs * 4);
    for (let y = Math.max(0, gy - rad | 0); y < Math.min(h, gy + rad); y++) for (let x = Math.max(0, gx - rad | 0); x < Math.min(w, gx + rad); x++) {
      const dx = x - gx, dy = y - gy, a = (dx * c + dy * s) / gs, b = (-dx * s + dy * c) / (gs * 0.38), rr = Math.hypot(a, b), th = Math.atan2(b, a);
      const arms = 0.5 + 0.5 * Math.cos(2 * th - 5.5 * Math.log(rr + 0.15));
      const core = Math.exp(-rr * 9) * 0.5, disc = Math.exp(-rr * 2.4) * (0.35 + 0.65 * arms) * 0.07;
      const o = (y * w + x) * 3; acc[o] += core * 1.0 + disc * 0.75; acc[o + 1] += core * 0.86 + disc * 0.8; acc[o + 2] += core * 0.7 + disc * 1.0;
    }
  }
  // tone map, film grain, dither
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'), id = g.createImageData(w, h), d = id.data, GR = rng(seed + 202);
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    const gr = (GR() - 0.5) * 0.012, o = i * 3;
    d[j] = Math.max(0, Math.min(255, (tone(acc[o] * 1.6) + gr) * 255 + GR() - 0.5));
    d[j + 1] = Math.max(0, Math.min(255, (tone(acc[o + 1] * 1.6) + gr) * 255 + GR() - 0.5));
    d[j + 2] = Math.max(0, Math.min(255, (tone(acc[o + 2] * 1.6) + gr) * 255 + GR() - 0.5));
    d[j + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  return { webp: cv.toDataURL('image/webp', q), jpg: cv.toDataURL('image/jpeg', 0.9) };
}

function renderPlanet({ R: PR, seed, q }) {
  const { noise, fbmOf, sstep, tone } = window.__lib();
  // image in planet radii: x -2.5..2.5, y -1.25..1.25 (y up)
  const W = Math.round(PR * 5.0), H = Math.round(PR * 2.5), CX = W * 0.5, CY = H * 0.5;
  const NB = fbmOf(noise(seed)), NR = fbmOf(noise(seed + 5));
  const norm = (v) => { const l = Math.hypot(...v); return v.map((a) => a / l); };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const L = norm([-0.84, 0.3, 0.4]); // light from the nebula, up-left and a little in front
  const el = 0.27, roll = 0.32;
  let n = [0, Math.cos(el), Math.sin(el)];
  n = [n[0] * Math.cos(roll) - n[1] * Math.sin(roll), n[0] * Math.sin(roll) + n[1] * Math.cos(roll), n[2]];
  const e1 = norm(cross(n, [0, 0, 1])), e2 = cross(n, e1);
  const nl = dot(n, L), litSide = Math.sign(n[2]) === Math.sign(nl);
  // ring opacity by radius: faint inner ring, dense main ring, a dark gap, outer ring with a thin gap, a narrow outer ringlet
  const ringOp = (r) => {
    if (r < 1.28 || r > 2.24) return 0;
    let o = 0;
    o += sstep(1.28, 1.34, r) * (1 - sstep(1.44, 1.47, r)) * 0.16;
    o += sstep(1.46, 1.50, r) * (1 - sstep(1.76, 1.79, r)) * (0.62 + 0.3 * sstep(1.55, 1.7, r));
    o += sstep(1.84, 1.87, r) * (1 - sstep(2.07, 2.09, r)) * 0.5 * (1 - 0.9 * Math.exp(-((r - 2.0) ** 2) / 0.00004));
    o += Math.exp(-((r - 2.17) ** 2) / 0.00012) * 0.32;
    return Math.min(0.95, o * (0.72 + 0.28 * (0.5 + 0.5 * NR(r * 60, 0.5, 3)) + 0.12 * Math.sin(r * 420)));
  };
  const ringCol = (r) => { const t = sstep(1.3, 2.2, r), v = 0.85 + 0.15 * NR(r * 25, 3.3, 2); return [(0.62 + 0.14 * t) * v, (0.52 + 0.06 * t) * v, (0.68 - 0.1 * t) * v]; };
  // band colours (linear): deep indigo, violet, lavender, dusty rose, pale cream, teal haze
  const PAL = [[0.06, 0.03, 0.16], [0.16, 0.07, 0.32], [0.34, 0.16, 0.44], [0.52, 0.22, 0.38], [0.66, 0.46, 0.52], [0.24, 0.12, 0.40], [0.06, 0.18, 0.30], [0.30, 0.16, 0.42], [0.46, 0.30, 0.48], [0.12, 0.06, 0.26]];
  const pal = (t) => { t = ((t % 1) + 1) % 1 * PAL.length; const i = Math.floor(t), f = t - i, a = PAL[i], b = PAL[(i + 1) % PAL.length], s = f * f * (3 - 2 * f); return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s]; };
  const ATM = [0.25, 0.55, 1.0];
  const shade = (x, y) => { // one sample: premultiplied [r, g, b, a] in linear light
    let col = [0, 0, 0], a = 0;
    const over = (c, al) => { col = [c[0] * al + col[0] * (1 - al), c[1] * al + col[1] * (1 - al), c[2] * al + col[2] * (1 - al)]; a = al + a * (1 - al); };
    const add = (c) => { col = [col[0] + c[0], col[1] + c[1], col[2] + c[2]]; a = Math.min(1, a + Math.max(c[0], c[1], c[2])); };
    const d2 = x * x + y * y, ringT = -(n[0] * x + n[1] * y) / n[2], Q = [x, y, ringT], rr = Math.hypot(...Q);
    let rOp = ringOp(rr), rC = null;
    if (rOp > 0) {
      const c = ringCol(rr);
      let lit = litSide ? 0.08 + 0.62 * Math.abs(nl) : 0.06 + 0.3 * rOp * Math.abs(nl); // the unlit face only glows through
      // planet's shadow on the ring
      const t = -dot(Q, L); if (t > 0) { const s = [Q[0] + L[0] * t, Q[1] + L[1] * t, Q[2] + L[2] * t]; if (Math.hypot(...s) < 1) lit *= 0.035; else lit *= 1 - 0.95 * (1 - sstep(1, 1.03, Math.hypot(...s))); }
      rC = [c[0] * lit, c[1] * lit, c[2] * lit];
    }
    if (d2 < 1) {
      const z = Math.sqrt(1 - d2), P = [x, y, z];
      if (rOp > 0 && ringT < z) rOp = 0; // the ring part behind the planet is hidden
      const sl = dot(P, n), lon = Math.atan2(dot(P, e2), dot(P, e1));
      const lx = Math.cos(lon) * 1.6, ly = Math.sin(lon) * 1.6;
      const turb = NB(lx + sl * 3, ly + sl * 9, 6) * 0.05 + NB(lx * 3 + 7, ly * 3 + sl * 40, 4) * 0.018;
      const lat = sl + turb;
      let alb = pal(lat * 2.2 + 0.15 + 0.06 * Math.sin(lat * 31) + 0.03 * NB(sl * 90, lx, 2));
      const fine = 0.84 + 0.16 * NB(lx * 4, sl * 110, 3);
      alb = alb.map((c) => c * fine);
      const pole = sstep(0.68, 0.95, Math.abs(sl)); alb = alb.map((c, i) => c * (1 - pole * 0.55) + [0.08, 0.2, 0.3][i] * pole * 0.55);
      // a storm oval in the southern belt
      { const so = Math.hypot((lon - 0.5) / 0.22, (sl + 0.36) / 0.05); if (so < 1.4) { const k = Math.exp(-so * so * 1.4); alb = alb.map((c, i) => c * (1 - k * 0.6) + [0.82, 0.55, 0.66][i] * k * 0.6); } }
      const ndl = dot(P, L), term = sstep(-0.1, 0.28, ndl), diff = Math.max(0, ndl);
      let lum = term * (0.22 + 0.9 * Math.pow(diff, 0.85)) * (0.42 + 0.58 * Math.pow(z, 0.6)); // limb darkening
      // the rings' shadow on the planet
      const nt = -dot(P, n) / nl; if (nt > 0) { const s = [P[0] + L[0] * nt, P[1] + L[1] * nt, P[2] + L[2] * nt]; lum *= 1 - 0.88 * ringOp(Math.hypot(...s)); }
      let c = alb.map((v) => v * lum + v * 0.012); // night side: almost black
      const rim = Math.pow(1 - z, 3.2) * sstep(-0.05, 0.5, ndl);
      c = c.map((v, i) => v + ATM[i] * rim * 0.75);
      over(c, 1);
      if (rOp > 0 && ringT >= z) over(rC, rOp);
    } else {
      // atmosphere: a thin glow beyond the lit limb
      const d = Math.sqrt(d2), hgt = d - 1, lim = sstep(-0.3, 0.6, (x * L[0] + y * L[1]) / d);
      const gl = Math.exp(-hgt / 0.022) * 0.55 * lim + Math.exp(-hgt / 0.09) * 0.07 * lim;
      if (rOp > 0 && ringT < 0) { over(rC, rOp); add(ATM.map((v) => v * gl)); }
      else { add(ATM.map((v) => v * gl)); if (rOp > 0) over(rC, rOp); }
    }
    return [col[0], col[1], col[2], a];
  };
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), id = g.createImageData(W, H), dd = id.data;
  const SS = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    let r = 0, gg = 0, b = 0, al = 0;
    for (const [ox, oy] of SS) { const s = shade((px + ox - CX) / PR, -(py + oy - CY) / PR); r += s[0]; gg += s[1]; b += s[2]; al += s[3]; }
    r /= 4; gg /= 4; b /= 4; al /= 4;
    const j = (py * W + px) * 4;
    if (al < 0.002) { dd[j + 3] = 0; continue; }
    // tone map the premultiplied colour, then un-premultiply for the canvas
    const tr = tone(r * 1.1), tg = tone(gg * 1.1), tb = tone(b * 1.1), A = Math.min(1, Math.max(al, Math.max(tr, tg, tb) * 0.0));
    dd[j] = Math.min(255, (tr / A) * 255); dd[j + 1] = Math.min(255, (tg / A) * 255); dd[j + 2] = Math.min(255, (tb / A) * 255); dd[j + 3] = Math.round(A * 255);
  }
  g.putImageData(id, 0, 0);
  return { webp: cv.toDataURL('image/webp', q), w: W, h: H };
}

// ------------------------------------------------------------------ run
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<!doctype html><body></body>');
await page.evaluate(`window.__lib = ${lib.toString()}`);
await page.evaluate(`window.__sky = ${renderSky.toString()}; window.__planet = ${renderPlanet.toString()};`);
const save = (name, url) => { const buf = Buffer.from(url.split(',')[1], 'base64'); writeFileSync(out + name, buf); return buf.length; };
const sizes = {};
const only = process.env.SKY_ONLY || '';
const SEED = Number(process.env.SKY_SEED) || 11;
for (const [set, S] of Object.entries(SETS)) {
  if (only && !only.includes(set)) continue;
  for (const o of ['l', 'p']) {
    const w = o === 'l' ? Math.round(S * ASPECT) : S, h = o === 'l' ? S : Math.round(S * ASPECT);
    const t0 = Date.now();
    const r = await page.evaluate((a) => window.__sky(a), { w, h, comp: COMP[o], seed: SEED, q: 0.9 });
    sizes[`sky-${o}-${set}.webp`] = save(`sky-${o}-${set}.webp`, r.webp);
    if (pv) writeFileSync(`${pv}/sky-${o}-${set}.jpg`, Buffer.from(r.jpg.split(',')[1], 'base64'));
    console.log(`sky-${o}-${set} ${w}x${h} ${Date.now() - t0} ms`);
  }
  const r = await page.evaluate((a) => window.__planet(a), { R: PLANET_R[set], seed: 3, q: 0.85 });
  sizes[`planet-${set}.webp`] = save(`planet-${set}.webp`, r.webp);
  console.log(`planet-${set} ${r.w}x${r.h}`);
}
console.log(Object.entries(sizes).map(([k, v]) => `${k} ${(v / 1024).toFixed(0)} KB`).join('\n'));
await browser.close();

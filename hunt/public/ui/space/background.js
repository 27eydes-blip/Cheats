// Deep-space lobby background on ONE canvas. The art is painted ahead of time by
// scripts/space-sky.mjs (domain-warped nebula, galactic band, thousands of stars, a ray-traced
// ringed gas giant) into a few WebP layers in ui/space/sky/; a frame here just
// composites them: the far sky (slow drift + parallax), a near star layer, a few dust motes, the
// planet, some twinkling stars and the odd shooting star. Nothing is allocated per frame and the
// sky redraws at 30 Hz (60 while a shooting star crosses).
//   Until the images arrive the canvas shows a painted navy sky with near stars (never black);
//   the phone set (< 600 KB) loads first, the large set only on big / high-density screens.
//   Low Graphics: one still composite image, no parallax, motes or shooting stars.
//   Reduce Flashing / motion: one still frame (no drift, twinkle or shooting stars).
// The loop pauses with the page (see loop.js) and when stop() is called.
import { onFrame } from './loop.js';
import { quality } from './quality.js';

const TAU = Math.PI * 2;
// small seeded random so the sky is the same every visit (and in screenshots)
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const layer = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

export const SKY = { top: '#0b1030', mid: '#060920', bottom: '#03040c' };
// sky/<name>.webp: sky-{l,p}-{s,l} (landscape / portrait, phone / large), planet-{s,l}
export const skyUrl = (name) => new URL(`sky/${name}.webp`, import.meta.url).href;
// which images a screen needs: orientation by aspect, the large set once the canvas is big
export function skySet(pw, ph) {
  const o = pw >= ph ? 'l' : 'p', big = Math.max(pw, ph) > 1800;
  return { sky: `sky-${o}-${big ? 'l' : 's'}`, skySmall: `sky-${o}-s`, planet: big ? 'planet-l' : 'planet-s', planetSmall: 'planet-s', o };
}
// planet centre (fractions of the screen) and radius (fraction of the short side): low and to
// the right, partly off screen, clear of the STORE button, the ticker and the LAUNCH column
export const PLANET = { l: { x: 0.95, y: 0.93, r: 0.36 }, p: { x: 1.04, y: 0.79, r: 0.27 } };

const cache = new Map(); // url -> Promise<HTMLImageElement> (shared by every SpaceBackground)
export function loadSkyImage(name) {
  const url = skyUrl(name);
  if (!cache.has(url)) {
    cache.set(url, new Promise((res, rej) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => res(img));
      img.onerror = () => { cache.delete(url); rej(new Error('sky image ' + name)); };
      img.src = url;
    }));
  }
  return cache.get(url);
}

export class SpaceBackground {
  // opts: {dprCap, maxPx, low, calm, planet: {x, y, r}}
  constructor(canvas, opts = {}) {
    this.cv = canvas; this.g = canvas.getContext('2d', { alpha: false });
    this.opts = opts;
    this.dprCap = opts.dprCap || 2;
    this.maxPx = opts.maxPx || 2.4e6; // canvas pixel budget: big screens draw a little under native density
    this.px = 0; this.py = 0; this.tx = 0; this.ty = 0; // parallax (smoothed toward the target)
    this.drift = 0; this.shoot = null; this.nextShoot = 3; this.frames = 0;
    this.twk = null; this.W = 0; this.H = 0; this.dpr = 1; this.off = null;
    this.img = { sky: null, planet: null }; this.ready = false; this.fade = 1; this.want = null;
    this.setQuality(opts.low != null || opts.calm != null ? { low: !!opts.low, calm: !!opts.calm } : quality());
  }
  setQuality(q) {
    this.q = q;
    this.still = q.low || q.calm;
    if (this.W) { this.build(); this.draw(this.t || 0, 0); }
    if (this.off && this.still) { this.off(); this.off = null; }
    else if (!this.off && !this.still && this.running) this.off = onFrame((t, dt) => this.draw(t, dt));
  }
  // CSS size of the canvas box; call on resize
  resize(w, h, dpr = window.devicePixelRatio || 1) {
    let d = Math.min(this.dprCap, dpr);
    if (w * h * d * d > this.maxPx) d = Math.max(1, Math.sqrt(this.maxPx / (w * h)));
    if (w === this.W && h === this.H && d === this.dpr && this.base) return;
    this.W = w; this.H = h; this.dpr = d;
    this.cv.width = Math.max(1, Math.round(w * d)); this.cv.height = Math.max(1, Math.round(h * d));
    this.load();
    this.build();
    this.draw(this.t || 0, 0);
  }
  // fetch the layers this size needs: the phone set first (fast), then the large set if wanted
  load() {
    const set = skySet(this.cv.width, this.cv.height);
    if (this.want && this.want.sky === set.sky && this.want.planet === set.planet) return;
    this.want = set;
    const apply = (sky, planet) => {
      if (this.want !== set) return;
      if (!this.ready && !this.still) this.fade = 0; // ease in over the painted sky
      this.img = { sky, planet }; this.ready = true; this.src = sky.src;
      this.build(); this.draw(this.t || 0, 0);
    };
    const pair = (a, b) => Promise.all([loadSkyImage(a), loadSkyImage(b)]);
    pair(set.skySmall, set.planetSmall).then(([s, p]) => {
      apply(s, p);
      if (set.sky !== set.skySmall || set.planet !== set.planetSmall) return pair(set.sky, set.planet).then(([S, P]) => apply(S, P));
    }).catch(() => {}); // offline / missing: the painted sky stays
  }
  start() { this.running = true; if (!this.still && !this.off) this.off = onFrame((t, dt) => this.draw(t, dt)); else this.draw(this.t || 0, 0); }
  stop() { this.running = false; if (this.off) { this.off(); this.off = null; } }
  destroy() { this.stop(); this.base = this.near = this.neb = this.comp = null; this.img = { sky: null, planet: null }; }
  // -1..1 each way (pointer, tilt); ignored on Low Graphics / Reduce Flashing
  setParallax(x, y) { this.tx = Math.max(-1, Math.min(1, x)); this.ty = Math.max(-1, Math.min(1, y)); }
  setPlanet(p) { this.opts.planet = p; if (this.W) { this.build(); this.draw(this.t || 0, 0); } }

  build() {
    const { dpr, q } = this, R = rng(7);
    const pw = this.cv.width, ph = this.cv.height;
    // the painted sky: what shows before (or without) the images
    const base = this.base = layer(pw, ph), g = base.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, ph);
    gr.addColorStop(0, SKY.top); gr.addColorStop(0.55, SKY.mid); gr.addColorStop(1, SKY.bottom);
    g.fillStyle = gr; g.fillRect(0, 0, pw, ph);
    // near stars: a sparse layer of brighter stars (power-law brightness, warm to blue-white),
    // each a tiny sprite from one atlas; they wrap round a field a bit larger than the screen.
    // (A full-screen transparent tile cost a phone GPU a whole extra screen of blending.)
    const TINT = ['190,215,255', '225,236,255', '255,255,255', '255,240,214', '255,214,170'];
    const n = Math.round(30 * (pw * ph) / (420 * 420 * dpr * dpr)), cell = Math.ceil(8 * dpr), atlas = this.atlas = layer(cell * n, cell), ag = atlas.getContext('2d');
    this.fw = pw + 60 * dpr; this.fh = ph + 60 * dpr;
    this.near = [];
    for (let i = 0; i < n; i++) {
      const b = Math.min(1, 0.22 * Math.pow(1 - R() * 0.995, -1 / 1.6)), c = TINT[Math.floor(R() * TINT.length)], r = (0.45 + b * 0.75) * dpr, cx = i * cell + cell / 2, cy = cell / 2;
      const rg = ag.createRadialGradient(cx, cy, 0, cx, cy, Math.min(cell / 2, r * 2.6));
      rg.addColorStop(0, `rgba(${c},${b.toFixed(2)})`); rg.addColorStop(0.35, `rgba(${c},${(b * 0.45).toFixed(2)})`); rg.addColorStop(1, `rgba(${c},0)`);
      ag.fillStyle = rg; ag.fillRect(i * cell, 0, cell, cell);
      this.near.push({ x: R() * this.fw, y: R() * this.fh, sx: i * cell });
    }
    this.cell = cell;
    // twinkling stars: fixed positions, alpha animated per frame (sprite drawn once)
    const sp = this.spark = layer(40 * dpr, 40 * dpr), sg = sp.getContext('2d'), m = 20 * dpr;
    const glow = sg.createRadialGradient(m, m, 0, m, m, m * 0.5);
    glow.addColorStop(0, 'rgba(255,255,255,1)'); glow.addColorStop(0.12, 'rgba(225,238,255,0.7)'); glow.addColorStop(0.4, 'rgba(170,200,255,0.12)'); glow.addColorStop(1, 'rgba(170,200,255,0)');
    sg.fillStyle = glow; sg.fillRect(0, 0, m * 2, m * 2);
    for (const ax of [1, 0]) {
      const lg = ax ? sg.createLinearGradient(0, m, m * 2, m) : sg.createLinearGradient(m, 0, m, m * 2);
      lg.addColorStop(0, 'rgba(210,228,255,0)'); lg.addColorStop(0.5, 'rgba(235,244,255,0.8)'); lg.addColorStop(1, 'rgba(210,228,255,0)');
      sg.fillStyle = lg; if (ax) sg.fillRect(0, m - 0.5 * dpr, m * 2, dpr); else sg.fillRect(m - 0.5 * dpr, 0, dpr, m * 2);
    }
    this.twk = Array.from({ length: q.low ? 0 : 9 }, () => ({ x: R(), y: R() * 0.85, s: 0.16 + R() * 0.2, sp: 0.5 + R() * 1.4, ph: R() * TAU }));
    // dust motes: a few big, soft, out-of-focus specks in the foreground
    this.motes = q.low ? [] : Array.from({ length: 5 }, (_, i) => ({ x: R(), y: R(), r: (18 + R() * 40) * dpr, a: 0.035 + R() * 0.04, vx: (R() - 0.5) * 4, vy: (R() - 0.5) * 2, i }));
    if (!this.mote) {
      const mt = this.mote = layer(64, 64), mg = mt.getContext('2d'), rg = mg.createRadialGradient(32, 32, 0, 32, 32, 32);
      rg.addColorStop(0, 'rgba(200,180,255,1)'); rg.addColorStop(0.6, 'rgba(170,200,255,0.35)'); rg.addColorStop(1, 'rgba(170,200,255,0)');
      mg.fillStyle = rg; mg.fillRect(0, 0, 64, 64);
    }
    // planet placement
    const P = this.opts.planet || PLANET[pw >= ph ? 'l' : 'p'];
    this.pl = { x: P.x * pw, y: P.y * ph, r: P.r * Math.min(pw, ph) };
    // sky + planet pre-composited once at canvas resolution, 6% larger for drift and parallax:
    // a frame then blits one opaque image 1:1 (scaling the planet's alpha layer every frame cost
    // a phone GPU far more)
    this.comp = null;
    if (this.ready) {
      const cw = Math.round(pw * 1.06), ch = Math.round(ph * 1.06), c = this.comp = layer(cw, ch), cg = c.getContext('2d', { alpha: false });
      const im = this.img.sky, k = Math.max(cw / im.width, ch / im.height), w = im.width * k, h = im.height * k;
      cg.drawImage(im, (cw - w) / 2, (ch - h) / 2, w, h);
      const pi = this.img.planet, { x, y, r } = this.pl, kp = r / (pi.width / 5); // the planet's radius is a fifth of its image width
      cg.drawImage(pi, x + (cw - pw) / 2 - pi.width * kp / 2, y + (ch - ph) / 2 - pi.height * kp / 2, pi.width * kp, pi.height * kp);
    }
    // the moving sky layer (none on Low Graphics: the whole sky is one still image there)
    this.neb = q.low ? null : this.comp;
    if (this.still) { // bake everything that never moves into the base
      this.paintSky(g, 0, 0, 1);
      this.nearDraw(g, 0, 0);
      if (!q.low) for (const s of this.twk) this.paintSpark(g, s, 0.75);
    }
  }
  // the far sky (with the planet), centred on the canvas plus a drift / parallax offset
  paintSky(g, ox, oy, a) {
    const c = this.comp; if (!c) return;
    g.globalAlpha = a; g.drawImage(c, Math.round((this.cv.width - c.width) / 2 + ox), Math.round((this.cv.height - c.height) / 2 + oy)); g.globalAlpha = 1;
  }
  paintSpark(g, s, a) {
    const sz = this.spark.width * s.s * 2;
    g.globalAlpha = a; g.drawImage(this.spark, s.x * this.cv.width - sz / 2, s.y * this.cv.height - sz / 2, sz, sz); g.globalAlpha = 1;
  }
  nearDraw(g, ox, oy) {
    const { fw, fh, cell, atlas } = this, h = cell / 2, m = 30 * this.dpr;
    for (const s of this.near) {
      const x = (((s.x - ox) % fw) + fw) % fw - m, y = (((s.y - oy) % fh) + fh) % fh - m;
      g.drawImage(atlas, s.sx, 0, cell, cell, x - h, y - h, cell, cell);
    }
  }
  draw(t, dt) {
    if (!this.base) return;
    // the sky drifts slowly: 30 redraws a second is plenty (half the canvas uploads), except
    // while a shooting star is crossing or the images fade in
    this.acc = (this.acc || 0) + dt;
    if (!this.still && !this.shoot && this.fade >= 1 && this.nextShoot > 0.05 && (this.tick = (this.tick || 0) + 1) % 2) return;
    dt = this.acc; this.acc = 0;
    this.t = t;
    const g = this.g, { dpr } = this, pw = this.cv.width, ph = this.cv.height;
    // the far sky is opaque and overscanned: once it has faded in, the painted base under it is never seen
    if (this.still || !this.neb || this.fade < 1) g.drawImage(this.base, 0, 0);
    if (this.still) return;
    this.frames++;
    // parallax eases toward the pointer/tilt target
    const k = Math.min(1, dt * 3);
    this.px += (this.tx - this.px) * k; this.py += (this.ty - this.py) * k;
    this.drift += dt;
    if (this.fade < 1) this.fade = Math.min(1, this.fade + dt * 2.2);
    const d = this.drift, P = 14 * dpr, f = this.fade;
    if (this.neb) this.paintSky(g, Math.sin(d * 0.021) * pw * 0.016 - this.px * P * 0.5, Math.cos(d * 0.017) * ph * 0.012 - this.py * P * 0.5, f);
    this.nearDraw(g, d * 5 * dpr + this.px * P * 1.2, this.py * P * 1.2);
    // dust motes drift through the foreground
    for (const m of this.motes) {
      const sw = pw + m.r * 2, sh = ph + m.r * 2;
      const x = (((m.x * pw + d * m.vx * dpr - this.px * P * 2.2) % sw) + sw) % sw - m.r, y = (((m.y * ph + d * m.vy * dpr - this.py * P * 2.2) % sh) + sh) % sh - m.r;
      g.globalAlpha = m.a * f; g.drawImage(this.mote, x - m.r, y - m.r, m.r * 2, m.r * 2);
    }
    for (const s of this.twk) this.paintSpark(g, s, f * (0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph)) ** 2));
    // shooting star: one at a time, every few seconds
    this.nextShoot -= dt;
    if (!this.shoot && this.nextShoot <= 0) {
      const R = Math.random;
      this.shoot = { x: (0.2 + R() * 0.7) * pw, y: R() * ph * 0.35, a: Math.PI * (0.78 + R() * 0.12), life: 0, dur: 0.75 + R() * 0.4, len: (90 + R() * 70) * dpr, sp: (520 + R() * 260) * dpr };
      this.nextShoot = 4 + Math.random() * 6;
    }
    const s = this.shoot;
    if (s) {
      s.life += dt;
      const fr = s.life / s.dur;
      if (fr >= 1) this.shoot = null;
      else {
        const cx = Math.cos(s.a), cy = Math.sin(s.a), hx = s.x + cx * s.sp * s.life, hy = s.y + cy * s.sp * s.life;
        g.globalAlpha = Math.sin(fr * Math.PI);
        g.strokeStyle = '#bff6ff'; g.lineWidth = 1.4 * dpr; g.lineCap = 'round';
        g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx - cx * s.len, hy - cy * s.len); g.stroke();
        g.globalAlpha = 1;
      }
    }
  }
}

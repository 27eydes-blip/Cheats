// Deep-space lobby background on ONE canvas: a navy-to-black sky, slow nebula clouds (violet,
// teal, magenta), two parallax star layers, a few twinkling stars, a distant ringed planet and
// the odd shooting star. Every layer is painted once into an offscreen canvas when the size
// changes; a frame is a handful of drawImage blits, nothing allocated, at 30 Hz (60 for a shooting star).
//   Low Graphics: no nebula, no shooting stars, no parallax or drift: one still frame.
//   Reduce Flashing / motion: no drift, twinkle or shooting stars: one still frame (nebula kept).
// The loop pauses with the page (see loop.js) and when stop() is called.
import { onFrame } from './loop.js';
import { quality } from './quality.js';

const TAU = Math.PI * 2;
// small seeded random so the sky is the same every visit (and in screenshots)
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const layer = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

export const SKY = { top: '#0a1033', mid: '#070a1f', bottom: '#03040c' };
const NEB = ['rgba(122,44,255,A)', 'rgba(17,201,181,A)', 'rgba(255,47,160,A)'];

export class SpaceBackground {
  // opts: {dprCap, low, calm, planet: {x, y, r} as fractions of the screen}
  constructor(canvas, opts = {}) {
    this.cv = canvas; this.g = canvas.getContext('2d', { alpha: false });
    this.opts = opts;
    this.dprCap = opts.dprCap || 1.5;
    this.px = 0; this.py = 0; this.tx = 0; this.ty = 0; // parallax (smoothed toward the target)
    this.drift = 0; this.shoot = null; this.nextShoot = 3; this.frames = 0;
    this.twk = null; this.W = 0; this.H = 0; this.dpr = 1; this.off = null;
    this.setQuality(opts.low != null || opts.calm != null ? { low: !!opts.low, calm: !!opts.calm } : quality());
  }
  setQuality(q) {
    this.q = q;
    this.still = q.low || q.calm;
    if (this.W) { this.build(); this.draw(0, 0); }
    if (this.off && this.still) { this.off(); this.off = null; }
    else if (!this.off && !this.still && this.running) this.off = onFrame((t, dt) => this.draw(t, dt));
  }
  // CSS size of the canvas box; call on resize
  resize(w, h, dpr = window.devicePixelRatio || 1) {
    const d = Math.min(this.dprCap, dpr);
    if (w === this.W && h === this.H && d === this.dpr && this.base) return;
    this.W = w; this.H = h; this.dpr = d;
    this.cv.width = Math.max(1, Math.round(w * d)); this.cv.height = Math.max(1, Math.round(h * d));
    this.build();
    this.draw(this.t || 0, 0);
  }
  start() { this.running = true; if (!this.still && !this.off) this.off = onFrame((t, dt) => this.draw(t, dt)); else this.draw(0, 0); }
  stop() { this.running = false; if (this.off) { this.off(); this.off = null; } }
  destroy() { this.stop(); this.base = this.far = this.near = this.planet = this.neb = null; }
  // -1..1 each way (pointer, tilt); ignored on Low Graphics / Reduce Flashing
  setParallax(x, y) { this.tx = Math.max(-1, Math.min(1, x)); this.ty = Math.max(-1, Math.min(1, y)); }

  build() {
    const { W, H, dpr, q } = this, R = rng(7);
    const pw = W * dpr, ph = H * dpr;
    // sky gradient (+ stars baked in when nothing moves)
    const base = this.base = layer(pw, ph), g = base.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, ph);
    gr.addColorStop(0, SKY.top); gr.addColorStop(0.55, SKY.mid); gr.addColorStop(1, SKY.bottom);
    g.fillStyle = gr; g.fillRect(0, 0, pw, ph);
    // nebula: painted small and scaled up (the scale-up is the blur), larger than the screen so it can drift
    this.neb = null;
    if (!q.low) {
      const s = 0.22, nw = pw * 1.15 * s, nh = ph * 1.15 * s, n = this.neb = layer(nw, nh), ng = n.getContext('2d');
      ng.globalCompositeOperation = 'lighter';
      const blobs = [[0.18, 0.35, 0.42, 0, 0.30], [0.32, 0.62, 0.30, 1, 0.22], [0.72, 0.28, 0.36, 2, 0.20], [0.86, 0.72, 0.34, 0, 0.24], [0.52, 0.48, 0.5, 1, 0.12], [0.08, 0.85, 0.26, 2, 0.16], [0.62, 0.86, 0.28, 0, 0.14]];
      for (const [x, y, r, c, a] of blobs) {
        for (let k = 0; k < 3; k++) { // three offset puffs per cloud: lumpy, not round
          const cx = (x + (R() - 0.5) * 0.12) * nw, cy = (y + (R() - 0.5) * 0.12) * nh, rr = r * Math.max(nw, nh) * (0.6 + R() * 0.5);
          const rg = ng.createRadialGradient(cx, cy, 0, cx, cy, rr);
          rg.addColorStop(0, NEB[c].replace('A', String(a))); rg.addColorStop(0.5, NEB[c].replace('A', String(a * 0.45))); rg.addColorStop(1, NEB[c].replace('A', '0'));
          ng.fillStyle = rg; ng.fillRect(0, 0, nw, nh);
        }
      }
      ng.globalCompositeOperation = 'source-over'; // dark dust lanes across the glow
      for (let i = 0; i < 6; i++) {
        const cx = R() * nw, cy = R() * nh, rr = (0.08 + R() * 0.14) * nw, rg = ng.createRadialGradient(cx, cy, 0, cx, cy, rr);
        rg.addColorStop(0, 'rgba(4,6,18,0.55)'); rg.addColorStop(1, 'rgba(4,6,18,0)'); ng.fillStyle = rg; ng.fillRect(0, 0, nw, nh);
      }
    }
    // star tiles: far (many, faint, small) and near (fewer, brighter, a little colour)
    const tile = (size, count, rMin, rMax, aMin, tint) => {
      const t = layer(size * dpr, size * dpr), tg = t.getContext('2d');
      for (let i = 0; i < count; i++) {
        const x = R() * size * dpr, y = R() * size * dpr, r = (rMin + R() * (rMax - rMin)) * dpr, a = aMin + R() * (1 - aMin);
        const c = tint && R() < 0.3 ? (R() < 0.5 ? '160,240,255' : '255,190,240') : '235,242,255';
        tg.fillStyle = `rgba(${c},${a.toFixed(2)})`; tg.beginPath(); tg.arc(x, y, r, 0, TAU); tg.fill();
        if (r > 1.2 * dpr) { tg.fillStyle = `rgba(${c},${(a * 0.18).toFixed(2)})`; tg.beginPath(); tg.arc(x, y, r * 3, 0, TAU); tg.fill(); }
      }
      return t;
    };
    this.far = tile(256, 70, 0.35, 0.8, 0.25, false);
    this.near = tile(384, 22, 0.7, 1.6, 0.5, true);
    // twinkling stars: fixed positions, alpha animated per frame
    this.twk = Array.from({ length: q.low ? 0 : 14 }, () => ({ x: R() * pw, y: R() * ph * 0.8, r: (0.9 + R() * 1.1) * dpr, sp: 0.6 + R() * 1.6, ph: R() * TAU }));
    // planet with a ring, top right
    const P = this.opts.planet || { x: 0.8, y: 0.2, r: 0.11 };
    const pr = Math.max(18, Math.min(W, H) * P.r * 1.6) * dpr;
    this.pr = pr; this.planet = this.paintPlanet(pr);
    this.pxy = [P.x * pw, P.y * ph];
    if (this.still) { // bake everything that never moves into the base
      if (this.neb) g.drawImage(this.neb, 0, 0, this.neb.width, this.neb.height, -pw * 0.075, -ph * 0.075, pw * 1.15, ph * 1.15);
      this.tileDraw(g, this.far, 0, 0, pw, ph); this.tileDraw(g, this.near, 0, 0, pw, ph);
      g.drawImage(this.planet, this.pxy[0] - this.planet.width / 2, this.pxy[1] - this.planet.height / 2);
      for (const s of this.twk) { g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(s.x, s.y, s.r, 0, TAU); g.fill(); }
    }
  }
  paintPlanet(r) {
    const s = r * 3.2, c = layer(s, s), g = c.getContext('2d'), m = s / 2, tilt = -0.32;
    const ring = (front) => {
      g.save(); g.translate(m, m); g.rotate(tilt);
      g.beginPath(); // the half of the ring in front of / behind the planet
      if (front) g.rect(-s, 0, s * 2, s); else g.rect(-s, -s, s * 2, s);
      g.clip();
      for (const [k, w, a] of [[1.55, 0.09, 0.55], [1.38, 0.05, 0.35], [1.75, 0.035, 0.3]]) {
        g.strokeStyle = `rgba(150,220,255,${a})`; g.lineWidth = r * w;
        g.beginPath(); g.ellipse(0, 0, r * k, r * k * 0.28, 0, 0, TAU); g.stroke();
      }
      g.restore();
    };
    // atmosphere glow
    const glow = g.createRadialGradient(m, m, r * 0.9, m, m, r * 1.45);
    glow.addColorStop(0, 'rgba(120,90,255,0.35)'); glow.addColorStop(1, 'rgba(120,90,255,0)');
    g.fillStyle = glow; g.fillRect(0, 0, s, s);
    ring(false);
    g.save(); g.beginPath(); g.arc(m, m, r, 0, TAU); g.clip();
    const body = g.createLinearGradient(m - r, m - r, m + r, m + r);
    body.addColorStop(0, '#5a7dff'); body.addColorStop(0.45, '#6a3fc9'); body.addColorStop(1, '#2a0f55');
    g.fillStyle = body; g.fillRect(m - r, m - r, r * 2, r * 2);
    g.translate(m, m); g.rotate(tilt);
    for (let i = -4; i <= 4; i++) { g.fillStyle = i % 2 ? 'rgba(40,230,220,0.13)' : 'rgba(255,90,200,0.10)'; g.fillRect(-r, i * r * 0.2 - r * 0.06, r * 2, r * (0.07 + (i & 1) * 0.05)); }
    g.rotate(-tilt); g.translate(-m, -m);
    const shade = g.createRadialGradient(m - r * 0.45, m - r * 0.45, r * 0.2, m, m, r * 1.05); // lit from the top left
    shade.addColorStop(0, 'rgba(255,255,255,0.18)'); shade.addColorStop(0.55, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(3,4,12,0.75)');
    g.fillStyle = shade; g.fillRect(m - r, m - r, r * 2, r * 2);
    g.restore();
    g.strokeStyle = 'rgba(140,240,255,0.55)'; g.lineWidth = Math.max(1, r * 0.03); g.beginPath(); g.arc(m, m, r, Math.PI * 0.9, Math.PI * 1.6); g.stroke();
    ring(true);
    return c;
  }
  tileDraw(g, t, ox, oy, pw, ph) {
    const tw = t.width, th = t.height;
    let x0 = -(((ox % tw) + tw) % tw), y0 = -(((oy % th) + th) % th);
    for (let y = y0; y < ph; y += th) for (let x = x0; x < pw; x += tw) g.drawImage(t, x, y);
  }
  draw(t, dt) {
    if (!this.base) return;
    // the sky drifts slowly: 30 redraws a second is plenty (half the canvas uploads), except
    // while a shooting star is crossing
    this.acc = (this.acc || 0) + dt;
    if (!this.still && !this.shoot && this.nextShoot > 0.05 && (this.tick = (this.tick || 0) + 1) % 2) return;
    dt = this.acc; this.acc = 0;
    this.t = t;
    const g = this.g, { dpr } = this, pw = this.cv.width, ph = this.cv.height;
    g.drawImage(this.base, 0, 0);
    if (this.still) return;
    this.frames++;
    // parallax eases toward the pointer/tilt target
    const k = Math.min(1, dt * 3);
    this.px += (this.tx - this.px) * k; this.py += (this.ty - this.py) * k;
    this.drift += dt;
    const d = this.drift, P = 14 * dpr;
    if (this.neb) {
      const nx = -pw * 0.075 + Math.sin(d * 0.03) * pw * 0.05 - this.px * P * 0.4, ny = -ph * 0.075 + Math.cos(d * 0.025) * ph * 0.04 - this.py * P * 0.4;
      g.drawImage(this.neb, 0, 0, this.neb.width, this.neb.height, nx, ny, pw * 1.15, ph * 1.15);
    }
    this.tileDraw(g, this.far, d * 3 * dpr + this.px * P * 0.5, this.py * P * 0.5, pw, ph);
    this.tileDraw(g, this.near, d * 8 * dpr + this.px * P * 1.2, this.py * P * 1.2, pw, ph);
    g.drawImage(this.planet, this.pxy[0] - this.planet.width / 2 - this.px * P * 0.8, this.pxy[1] - this.planet.height / 2 - this.py * P * 0.8);
    g.fillStyle = '#fff';
    for (const s of this.twk) { g.globalAlpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph)); g.fillRect(s.x - s.r, s.y - s.r * 0.25, s.r * 2, s.r * 0.5); g.fillRect(s.x - s.r * 0.25, s.y - s.r, s.r * 0.5, s.r * 2); }
    g.globalAlpha = 1;
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
      const f = s.life / s.dur;
      if (f >= 1) this.shoot = null;
      else {
        const cx = Math.cos(s.a), cy = Math.sin(s.a), hx = s.x + cx * s.sp * s.life, hy = s.y + cy * s.sp * s.life;
        g.globalAlpha = Math.sin(f * Math.PI);
        g.strokeStyle = '#bff6ff'; g.lineWidth = 1.6 * dpr; g.lineCap = 'round';
        g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx - cx * s.len, hy - cy * s.len); g.stroke();
        g.globalAlpha = 1;
      }
    }
  }
}

// Hunt Racers effects: one pooled particle system (typed arrays, no per-frame allocation), tire
// marks in a ring buffer, and timed world effects (rings, beams, arcs, flashes) in a fixed pool.
import { SETTINGS } from '../settings.js';

// particle kinds (drawn in this order, so additive ones batch together)
export const PK = { SMOKE: 0, DUST: 1, DEBRIS: 2, SPARK: 3, FLAME: 4, EMBER: 5, GLINT: 6, SNOW: 7 };
const ADDITIVE = [false, false, false, true, true, true, true, false];
// colour table (index into it from emit); strings built once
export const PC = ['#3a86ff', '#ff9f1c', '#c04dff', '#ffffff', '#ffd23f', '#ff5a1f', '#b0a8a0', '#6a5f5a', '#5ff4ff', '#e8c47f', '#f4f8ff', '#12091e', '#ff3fa4', '#7fa34a', '#ffb347', '#2a2024'];
export const C = { BLUE: 0, ORANGE: 1, PURPLE: 2, WHITE: 3, GOLD: 4, LAVA: 5, SMOKE: 6, DARK: 7, CYAN: 8, SAND: 9, SNOW: 10, INK: 11, PINK: 12, GREEN: 13, AMBER: 14, ASH: 15 };
export const TIER_C = [C.WHITE, C.BLUE, C.ORANGE, C.PURPLE];

export class Particles {
  constructor(max = 700) {
    this.max = max; this.n = 0;
    const F = (k) => new Float32Array(max);
    this.x = F(); this.y = F(); this.vx = F(); this.vy = F(); this.life = F(); this.max0 = F(); this.size = F(); this.grow = F(); this.drag = F(); this.rot = F();
    this.kind = new Uint8Array(max); this.col = new Uint8Array(max);
  }
  // add one particle (silently dropped when full)
  emit(kind, x, y, vx, vy, life, size, col, grow = 0, drag = 2) {
    if (SETTINGS.lowGfx && this.n > this.max * 0.45) return;
    if (this.n >= this.max) return;
    const i = this.n++;
    this.kind[i] = kind; this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.life[i] = life; this.max0[i] = life; this.size[i] = size; this.col[i] = col; this.grow[i] = grow; this.drag[i] = drag; this.rot[i] = Math.random() * 6.28;
  }
  update(dt) {
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { // swap-remove
        n--;
        this.kind[i] = this.kind[n]; this.x[i] = this.x[n]; this.y[i] = this.y[n]; this.vx[i] = this.vx[n]; this.vy[i] = this.vy[n];
        this.life[i] = this.life[n]; this.max0[i] = this.max0[n]; this.size[i] = this.size[n]; this.col[i] = this.col[n]; this.grow[i] = this.grow[n]; this.drag[i] = this.drag[n]; this.rot[i] = this.rot[n];
        i--; continue;
      }
      const k = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= k; this.vy[i] *= k;
      this.x[i] += this.vx[i] * dt; this.y[i] += this.vy[i] * dt;
      this.size[i] += this.grow[i] * dt;
      this.rot[i] += dt * 6;
    }
    this.n = n;
  }
  // draw every particle inside the view box (world coordinates; the context holds the camera)
  draw(g, x0, y0, x1, y1) {
    const n = this.n;
    for (let kind = 0; kind <= 7; kind++) {
      g.globalCompositeOperation = ADDITIVE[kind] ? 'lighter' : 'source-over';
      let lastC = -1;
      for (let i = 0; i < n; i++) {
        if (this.kind[i] !== kind) continue;
        const x = this.x[i], y = this.y[i], s = this.size[i];
        if (x + s < x0 || x - s > x1 || y + s < y0 || y - s > y1) continue;
        const f = this.life[i] / this.max0[i];
        if (this.col[i] !== lastC) { lastC = this.col[i]; g.fillStyle = PC[lastC]; g.strokeStyle = PC[lastC]; }
        if (kind === PK.SPARK || kind === PK.GLINT) {
          g.globalAlpha = Math.min(1, f * 1.6);
          g.lineWidth = s;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x - this.vx[i] * 0.03, y - this.vy[i] * 0.03); g.stroke();
        } else if (kind === PK.DEBRIS) {
          g.globalAlpha = Math.min(1, f * 2);
          const c = Math.cos(this.rot[i]) * s, sn = Math.sin(this.rot[i]) * s;
          g.beginPath(); g.moveTo(x + c, y + sn); g.lineTo(x - sn, y + c); g.lineTo(x - c, y - sn); g.closePath(); g.fill();
        } else {
          g.globalAlpha = kind === PK.SMOKE || kind === PK.DUST ? f * 0.55 : kind === PK.SNOW ? 0.9 : f;
          g.beginPath(); g.arc(x, y, s, 0, 6.2832); g.fill();
        }
      }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
}

// TIRE MARKS: dark segments that fade out over ~7 s
export class Skids {
  constructor(max = 900) {
    this.max = max; this.head = 0; this.count = 0;
    this.d = new Float32Array(max * 5); // x0 y0 x1 y1 born
  }
  add(x0, y0, x1, y1, t) {
    const i = this.head * 5;
    this.d[i] = x0; this.d[i + 1] = y0; this.d[i + 2] = x1; this.d[i + 3] = y1; this.d[i + 4] = t;
    this.head = (this.head + 1) % this.max; if (this.count < this.max) this.count++;
  }
  draw(g, t, x0, y0, x1, y1, col) {
    const d = this.d, LIFE = 7;
    g.strokeStyle = col; g.lineCap = 'round'; g.lineWidth = 6;
    // 4 alpha bands, one path each
    for (let band = 0; band < 4; band++) {
      const lo = (band / 4) * LIFE, hi = ((band + 1) / 4) * LIFE;
      g.globalAlpha = 0.34 * (1 - band / 4);
      g.beginPath();
      let any = false;
      for (let k = 0; k < this.count; k++) {
        const i = k * 5, age = t - d[i + 4];
        if (age < lo || age >= hi) continue;
        const ax = d[i], ay = d[i + 1];
        if (ax < x0 || ax > x1 || ay < y0 || ay > y1) continue;
        g.moveTo(ax, ay); g.lineTo(d[i + 2], d[i + 3]); any = true;
      }
      if (any) g.stroke();
    }
    g.globalAlpha = 1;
  }
}

// TIMED WORLD EFFECTS: rings, beams, lightning arcs, blink trails, flashes. Fixed pool of objects.
export const FK = { RING: 0, BEAM: 1, ARC: 2, BLINK: 3, FLASH: 4, SLASH: 5 };
export class Effects {
  constructor(max = 48) {
    this.list = Array.from({ length: max }, () => ({ on: false, k: 0, x: 0, y: 0, x1: 0, y1: 0, r: 0, t: 0, life: 1, col: '#fff', a: 0, id: 0, id2: 0, w: 0 }));
  }
  add(k, x, y, o) {
    let e = null, oldest = null;
    for (const f of this.list) { if (!f.on) { e = f; break; } if (!oldest || f.t / f.life > oldest.t / oldest.life) oldest = f; }
    e = e || oldest;
    e.on = true; e.k = k; e.x = x; e.y = y; e.t = 0;
    e.x1 = o.x1 ?? x; e.y1 = o.y1 ?? y; e.r = o.r ?? 100; e.life = o.life ?? 0.5; e.col = o.col ?? '#fff'; e.a = o.a ?? 0; e.id = o.id ?? 0; e.id2 = o.id2 ?? 0; e.w = o.w ?? 6;
    return e;
  }
  update(dt) { for (const f of this.list) if (f.on && (f.t += dt) >= f.life) f.on = false; }
}

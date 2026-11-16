/** Parallax skyline silhouettes with period landmarks, plus cloud bands. */
import { canvas, rect, px, hline, vline, S, mix, type Ctx } from './pixel';
import { Rng } from '../core/rng';

export type SkylineKind = 'detroit' | 'ny' | 'river' | 'ford';
export interface Skyline { far: HTMLCanvasElement; near: HTMLCanvasElement; clouds: HTMLCanvasElement }

const LW = 960, LH = 150;

function windows(ctx: Ctx, x: number, y: number, w: number, h: number, col: string, rng: Rng, dx = 3, dy = 4) {
  for (let yy = y + 3; yy < y + h - 2; yy += dy) for (let xx = x + 2; xx < x + w - 1; xx += dx) if (rng.chance(0.6)) px(ctx, xx, yy, col);
}

function block(ctx: Ctx, x: number, w: number, h: number, col: string, win: string, rng: Rng) {
  rect(ctx, x, LH - h, w, h, col);
  windows(ctx, x, LH - h, w, h, win, rng);
  if (rng.chance(0.5)) rect(ctx, x - 1, LH - h, w + 2, 2, col); // cornice
  if (rng.chance(0.3)) { rect(ctx, x + 2, LH - h - 6, 5, 6, col); vline(ctx, x + 4, LH - h - 10, 4, col); } // water tank
}

function spire(ctx: Ctx, x: number, baseH: number, spireH: number, w: number, col: string) {
  rect(ctx, x - w / 2, LH - baseH, w, baseH, col);
  for (let i = 0; i < spireH; i++) { const ww = Math.max(1, Math.round(w * (1 - i / spireH))); hline(ctx, x - ww / 2, LH - baseH - i, ww, col); }
}

function woolworth(ctx: Ctx, x: number, col: string, win: string, rng: Rng) {
  rect(ctx, x - 20, LH - 70, 40, 70, col);
  rect(ctx, x - 12, LH - 108, 24, 40, col);
  rect(ctx, x - 8, LH - 124, 16, 18, col);
  for (let i = 0; i < 18; i++) hline(ctx, x - 8 + i * 0.45, LH - 124 - i, 16 - i * 0.9, col);
  vline(ctx, x, LH - 146, 6, col);
  for (const dx of [-8, 8]) for (const dy of [70, 108]) vline(ctx, x + dx, LH - dy - 6, 6, col); // pinnacles
  windows(ctx, x - 20, LH - 70, 40, 70, win, rng, 3, 3);
  windows(ctx, x - 12, LH - 108, 24, 38, win, rng, 3, 3);
}

function metLife(ctx: Ctx, x: number, col: string, win: string, rng: Rng) {
  rect(ctx, x - 9, LH - 120, 18, 120, col);
  for (let i = 0; i < 12; i++) hline(ctx, x - 9 + i * 0.75, LH - 120 - i, 18 - i * 1.5, col);
  rect(ctx, x - 2, LH - 136, 4, 4, col); vline(ctx, x, LH - 142, 6, col);
  rect(ctx, x - 6, LH - 100, 12, 10, mix(col, '#ffffff', 0.25)); // clock face
  windows(ctx, x - 9, LH - 90, 18, 90, win, rng, 3, 3);
}

function singer(ctx: Ctx, x: number, col: string, win: string, rng: Rng) {
  rect(ctx, x - 26, LH - 50, 52, 50, col);
  rect(ctx, x - 8, LH - 112, 16, 62, col);
  for (let i = 0; i < 10; i++) hline(ctx, x - 9 + i * 0.4, LH - 112 - i, 18 - i * 0.8, col);
  rect(ctx, x - 3, LH - 128, 6, 6, col); vline(ctx, x, LH - 134, 6, col);
  windows(ctx, x - 8, LH - 110, 16, 60, win, rng, 3, 3);
}

function bridgeTowers(ctx: Ctx, x: number, col: string) {
  for (const tx of [x, x + 190]) {
    rect(ctx, tx - 9, LH - 70, 18, 70, col);
    rect(ctx, tx - 6, LH - 54, 4, 18, mix(col, '#ffffff', 0.35)); rect(ctx, tx + 2, LH - 54, 4, 18, mix(col, '#ffffff', 0.35));
  }
  // cables: catenary between towers and down to anchorages
  ctx.fillStyle = col;
  for (let i = 0; i <= 190; i++) { const f = i / 190; const y = LH - 70 + Math.sin(f * Math.PI) * 44; ctx.fillRect(x + i, Math.round(y), 1, 1); if (i % 8 === 0) ctx.fillRect(x + i, Math.round(y), 1, Math.round(LH - 26 - y)); }
  for (let i = 0; i < 80; i++) { ctx.fillRect(x - i, Math.round(LH - 70 + i * 0.55), 1, 1); ctx.fillRect(x + 190 + i, Math.round(LH - 70 + i * 0.55), 1, 1); }
  rect(ctx, x - 90, LH - 28, 370, 3, col);
}

function depotTower(ctx: Ctx, x: number, col: string, win: string, rng: Rng) {
  rect(ctx, x - 40, LH - 34, 80, 34, col);
  rect(ctx, x - 22, LH - 100, 44, 70, col);
  for (let i = 0; i < 3; i++) { const ax = x - 30 + i * 20; for (let k = -6; k <= 6; k++) vline(ctx, ax + k, LH - 30 + Math.round(Math.abs(k) ** 1.4 / 3), 20, mix(col, '#ffffff', 0.18)); }
  windows(ctx, x - 22, LH - 100, 44, 70, win, rng, 3, 3);
  rect(ctx, x - 24, LH - 102, 48, 3, col);
}

function cityHall(ctx: Ctx, x: number, col: string, win: string, rng: Rng) {
  rect(ctx, x - 30, LH - 40, 60, 40, col);
  rect(ctx, x - 8, LH - 78, 16, 40, col);
  rect(ctx, x - 5, LH - 90, 10, 12, col);
  for (let i = 0; i < 8; i++) hline(ctx, x - 5 + i * 0.6, LH - 90 - i, 10 - i * 1.2, col);
  rect(ctx, x - 4, LH - 70, 8, 8, mix(col, '#ffffff', 0.3));
  windows(ctx, x - 30, LH - 40, 60, 40, win, rng, 4, 5);
}

function smokestacks(ctx: Ctx, x: number, n: number, col: string) {
  for (let i = 0; i < n; i++) { rect(ctx, x + i * 9, LH - 60 - (i % 2) * 14, 5, 60 + (i % 2) * 14, col); }
}

function freighter(ctx: Ctx, x: number, col: string) {
  rect(ctx, x, LH - 14, 120, 8, col);
  for (let i = 0; i < 6; i++) hline(ctx, x - i, LH - 14 + i, 4, col);
  rect(ctx, x + 4, LH - 22, 16, 8, col); rect(ctx, x + 96, LH - 24, 18, 10, col); rect(ctx, x + 104, LH - 34, 5, 10, col);
}

function layer(kind: SkylineKind, near: boolean): HTMLCanvasElement {
  const rng = new Rng((near ? 7 : 3) + kind.length * 101);
  const [c, ctx] = canvas(LW, LH);
  const col = near ? S[5] : mix(S[8], S[10], 0.4);
  const win = near ? S[3] : S[8];
  const filler = (from: number, to: number, hmin: number, hmax: number) => {
    let x = from;
    while (x < to) { const w = rng.int(14, 34); block(ctx, x, w, rng.int(hmin, hmax), col, win, rng); x += w + rng.int(-2, 4); }
  };
  if (kind === 'ny') {
    filler(0, LW, near ? 30 : 40, near ? 70 : 90);
    if (!near) { woolworth(ctx, 200, col, win, rng); metLife(ctx, 520, col, win, rng); singer(ctx, 760, col, win, rng); spire(ctx, 380, 30, 50, 10, col); }
    else { bridgeTowers(ctx, 330, col); spire(ctx, 120, 26, 38, 8, col); }
  } else if (kind === 'detroit') {
    filler(0, LW, near ? 18 : 24, near ? 50 : 64);
    if (!near) { depotTower(ctx, 260, col, win, rng); cityHall(ctx, 620, col, win, rng); spire(ctx, 470, 36, 46, 10, col); spire(ctx, 820, 30, 40, 8, col); }
    else { smokestacks(ctx, 90, 4, col); spire(ctx, 560, 30, 34, 8, col); smokestacks(ctx, 760, 3, col); }
  } else if (kind === 'ford') {
    filler(0, LW, 14, 34);
    smokestacks(ctx, near ? 120 : 300, near ? 5 : 3, col);
    smokestacks(ctx, near ? 600 : 700, 4, col);
  } else {
    // river: low far shoreline with Detroit across the water, lake freighters
    if (!near) { let x = 0; while (x < LW) { const w = rng.int(10, 26); block(ctx, x, w, rng.int(10, 40), col, win, rng); x += w + rng.int(0, 10); } cityHall(ctx, 500, col, win, rng); }
    else { freighter(ctx, 160, col); freighter(ctx, 640, col); rect(ctx, 0, LH - 6, LW, 6, col); }
  }
  return c;
}

function clouds(seed: number): HTMLCanvasElement {
  const rng = new Rng(seed);
  const [c, ctx] = canvas(LW, 90);
  for (let i = 0; i < 26; i++) {
    const x = rng.int(0, LW), y = rng.int(10, 70), w = rng.int(40, 140), h = rng.int(6, 16);
    for (let k = 0; k < 8; k++) {
      const bx = x + rng.range(0, w), by = y + rng.range(-h / 2, h / 2), r = rng.range(h * 0.6, h * 1.2);
      for (let yy = -r; yy <= r; yy++) for (let xx = -r * 1.8; xx <= r * 1.8; xx++) {
        if ((xx / 1.8) ** 2 + yy * yy > r * r) continue;
        ctx.globalAlpha = yy < 0 ? 0.28 : 0.16;
        px(ctx, (bx + xx + LW) % LW, by + yy, yy < -r / 3 ? S[12] : S[10]);
      }
    }
  }
  ctx.globalAlpha = 1;
  return c;
}

const cache = new Map<SkylineKind, Skyline>();
export function skyline(kind: SkylineKind): Skyline {
  let s = cache.get(kind);
  if (!s) { s = { far: layer(kind, false), near: layer(kind, true), clouds: clouds(kind.length) }; cache.set(kind, s); }
  return s;
}
export const SKY_LW = LW, SKY_LH = LH;

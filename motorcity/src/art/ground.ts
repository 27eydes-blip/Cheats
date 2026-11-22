import { canvas, rect, px, hline, vline, S, STONE, BRICK, shade, halve, type Ctx } from './pixel';
import { Rng } from '../core/rng';
import { FACADE_X, ROAD_W, type Ground } from '../track/types';

/** Cross-section textures: 256 px span ±FACADE_X road half-widths; 64 px repeat along z. */
export const GTEX_W = 256;
export const GTEX_H = 64;
export const GTEX_LEN = 800; // world units per texture repeat
const U = (u: number) => Math.round(((u + FACADE_X) / (FACADE_X * 2)) * GTEX_W);

export interface GroundTex { mips: HTMLCanvasElement[] }

function cobbles(ctx: Ctx, x0: number, x1: number, rng: Rng, base: string[], sz = 3) {
  rect(ctx, x0, 0, x1 - x0, GTEX_H, base[0]);
  for (let y = 0; y < GTEX_H; y += 3) {
    const off = (y / 3) % 2 ? Math.floor(sz / 2) + 1 : 0;
    for (let x = x0 - off; x < x1; x += sz + 1) {
      const v = rng.next();
      const c = v < 0.2 ? base[1] : v < 0.75 ? base[2] : base[3];
      const xs = Math.max(x0, x), xe = Math.min(x1, x + sz);
      if (xe <= xs) continue;
      rect(ctx, xs, y, xe - xs, 2, c);
      px(ctx, xs, y, shade(c, 1.18));
      hline(ctx, xs, y + 2, xe - xs, base[0]);
    }
  }
}

function flags(ctx: Ctx, x0: number, x1: number, rng: Rng, base: string[]) {
  rect(ctx, x0, 0, x1 - x0, GTEX_H, base[1]);
  for (let y = 0; y < GTEX_H; y += 16) {
    hline(ctx, x0, y, x1 - x0, base[0]);
    for (let x = x0 + rng.int(0, 10); x < x1; x += rng.int(10, 18)) vline(ctx, x, y, 16, base[0]);
  }
  for (let i = 0; i < (x1 - x0) * 3; i++) px(ctx, x0 + rng.int(0, x1 - x0 - 1), rng.int(0, GTEX_H - 1), rng.chance(0.5) ? base[2] : shade(base[1], 0.9));
}

function kerb(ctx: Ctx, u: number, dir: number) {
  const a = U(u), b = U(u + dir * 0.07);
  const xs = Math.min(a, b), w = Math.abs(b - a);
  rect(ctx, xs, 0, w, GTEX_H, STONE[6]);
  vline(ctx, dir > 0 ? xs : xs + w - 1, 0, GTEX_H, STONE[3]);
  for (let y = 0; y < GTEX_H; y += 12) hline(ctx, xs, y, w, STONE[4]);
  // gutter
  const g = U(u - dir * 0.04);
  rect(ctx, Math.min(g, a), 0, Math.abs(a - g), GTEX_H, S[2]);
}

function rails(ctx: Ctx) {
  for (const r of [-0.2, 0.2]) {
    const x = U(r);
    rect(ctx, x - 1, 0, 3, GTEX_H, S[2]);
    vline(ctx, x, 0, GTEX_H, STONE[8]);
    vline(ctx, x + 1, 0, GTEX_H, S[1]);
  }
}

function paint(kind: Ground | 'cobbleRails', seed: number): HTMLCanvasElement {
  const rng = new Rng(seed);
  const [c, ctx] = canvas(GTEX_W, GTEX_H);
  const cob = [S[3], S[5], S[6], S[7]];
  switch (kind) {
    case 'cobble': case 'cobbleRails': case 'finish': {
      flags(ctx, 0, U(-1.04), rng, [STONE[3], STONE[5], STONE[6]]);
      flags(ctx, U(1.04), GTEX_W, rng, [STONE[3], STONE[5], STONE[6]]);
      cobbles(ctx, U(-1), U(1), rng, cob);
      kerb(ctx, -1, -1); kerb(ctx, 1, 1);
      if (kind === 'cobbleRails') rails(ctx);
      if (kind === 'finish') {
        const sq = 8;
        for (let y = 0; y < GTEX_H; y += sq) for (let x = U(-1); x < U(1); x += sq) rect(ctx, x, y, sq, sq, ((x - U(-1)) / sq + y / sq) % 2 ? S[12] : S[0]);
      }
      // horse droppings & oil stains for life
      for (let i = 0; i < 4; i++) { ctx.globalAlpha = 0.3; rect(ctx, U(rng.range(-0.8, 0.8)), rng.int(0, GTEX_H - 4), rng.int(2, 5), rng.int(2, 4), S[0]); }
      ctx.globalAlpha = 1;
      break;
    }
    case 'brick': {
      flags(ctx, 0, U(-1.04), rng, [STONE[4], STONE[6], STONE[7]]);
      flags(ctx, U(1.04), GTEX_W, rng, [STONE[4], STONE[6], STONE[7]]);
      const x0 = U(-1), x1 = U(1);
      rect(ctx, x0, 0, x1 - x0, GTEX_H, BRICK[1]);
      for (let y = 0; y < GTEX_H; y += 2) {
        const off = (y / 2) % 2 ? 3 : 0;
        for (let x = x0 - off; x < x1; x += 6) { const xs = Math.max(x0, x); rect(ctx, xs, y, Math.min(5, x1 - xs), 1, rng.chance(0.25) ? BRICK[3] : BRICK[4]); }
      }
      kerb(ctx, -1, -1); kerb(ctx, 1, 1);
      break;
    }
    case 'park': {
      rect(ctx, 0, 0, GTEX_W, GTEX_H, S[4]);
      for (let i = 0; i < 1800; i++) px(ctx, rng.int(0, GTEX_W - 1), rng.int(0, GTEX_H - 1), rng.chance(0.5) ? S[3] : S[5]);
      const x0 = U(-1.02), x1 = U(1.02);
      rect(ctx, x0, 0, x1 - x0, GTEX_H, S[7]);
      for (let i = 0; i < 2600; i++) px(ctx, rng.int(x0, x1 - 1), rng.int(0, GTEX_H - 1), rng.pick([S[6], S[8], S[9], S[5]]));
      // ruts
      for (const r of [-0.55, -0.35, 0.35, 0.55]) { const x = U(r); rect(ctx, x, 0, 3, GTEX_H, S[6]); vline(ctx, x + 1, 0, GTEX_H, S[5]); }
      // grassy verge tufts
      for (let y = 0; y < GTEX_H; y += 2) { px(ctx, x0 + rng.int(0, 2), y, S[3]); px(ctx, x1 - 1 - rng.int(0, 2), y, S[3]); }
      // footpaths
      for (const [a, b] of [[-1.85, -1.35], [1.35, 1.85]]) { const xa = U(a), xb = U(b); rect(ctx, xa, 0, xb - xa, GTEX_H, S[8]); for (let i = 0; i < 300; i++) px(ctx, rng.int(xa, xb - 1), rng.int(0, GTEX_H - 1), S[7]); }
      break;
    }
    case 'bridge': {
      rect(ctx, 0, 0, GTEX_W, GTEX_H, S[3]);
      const x0 = U(-1.0), x1 = U(1.0);
      for (let y = 0; y < GTEX_H; y += 3) {
        rect(ctx, x0, y, x1 - x0, 2, rng.chance(0.3) ? S[5] : S[6]);
        hline(ctx, x0, y + 2, x1 - x0, S[2]);
        for (let x = x0 + rng.int(0, 30); x < x1; x += rng.int(30, 60)) vline(ctx, x, y, 2, S[3]);
      }
      // steel edge girders & promenade planks
      for (const [a, b] of [[-FACADE_X, -1.05], [1.05, FACADE_X]]) {
        const xa = U(a), xb = U(b);
        for (let y = 0; y < GTEX_H; y += 4) { rect(ctx, xa, y, xb - xa, 3, S[7]); hline(ctx, xa, y + 3, xb - xa, S[4]); }
      }
      for (const u of [-1.05, 1.0]) { const x = U(u); rect(ctx, x, 0, U(u + 0.05) - x, GTEX_H, STONE[2]); }
      break;
    }
    case 'tunnel': {
      rect(ctx, 0, 0, GTEX_W, GTEX_H, S[2]);
      cobbles(ctx, U(-1), U(1), rng, [S[1], S[3], S[4], S[5]]);
      kerb(ctx, -1, -1); kerb(ctx, 1, 1);
      break;
    }
  }
  return c;
}

export function wetten(src: HTMLCanvasElement, seed: number): HTMLCanvasElement {
  const rng = new Rng(seed);
  const [c, ctx] = canvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalAlpha = 0.35; rect(ctx, 0, 0, c.width, c.height, '#0c0a08'); ctx.globalAlpha = 1;
  // puddles: smooth, slightly bright sheen
  for (let i = 0; i < 9; i++) {
    const x = rng.int(U(-0.95), U(0.95) - 20), y = rng.int(0, GTEX_H - 6), w = rng.int(8, 28), h = rng.int(3, 7);
    ctx.globalAlpha = 0.55; rect(ctx, x, y, w, h, S[3]);
    ctx.globalAlpha = 0.3; hline(ctx, x + 2, y + 1, w - 4, S[9]);
  }
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 600; i++) px(ctx, rng.int(0, c.width - 1), rng.int(0, c.height - 1), S[10]);
  ctx.globalAlpha = 1;
  return c;
}

const cache = new Map<string, GroundTex>();
export function groundTex(kind: Ground, railsOn: boolean, wet: boolean): GroundTex {
  const k = (railsOn && kind === 'cobble' ? 'cobbleRails' : kind) as Ground | 'cobbleRails';
  const key = `${k}|${wet}`;
  let t = cache.get(key);
  if (!t) {
    let base = paint(k, 77 + k.length * 13);
    if (wet) base = wetten(base, 99);
    const m1 = halve(base), m2 = halve(m1);
    // mip levels keep full width so the drawImage source rect math stays simple
    const up = (m: HTMLCanvasElement) => { const [c, ctx] = canvas(GTEX_W, m.height); ctx.imageSmoothingEnabled = true; ctx.drawImage(m, 0, 0, GTEX_W, m.height); return c; };
    t = { mips: [base, up(m1), up(m2)] };
    cache.set(key, t);
  }
  return t;
}
export const groundColor: Record<Ground, string> = {
  cobble: S[3], finish: S[3], brick: S[3], park: S[4], bridge: '#3a3d3a', tunnel: S[1],
};
export const WATER = ['#2a2e2c', '#3a403d', '#4f5651', '#6a716b'];
void ROAD_W;

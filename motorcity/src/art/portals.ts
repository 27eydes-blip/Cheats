/** Structures spanning the road: tunnel mouth, Brooklyn Bridge tower, finish banner, memorial arch, railway trestle. */
import { canvas, rect, px, hline, vline, S, STONE, textCentered, textWidth, speckle, type Ctx } from './pixel';
import { Rng } from '../core/rng';
import { FPX } from './facades';

export interface Portal { img: HTMLCanvasElement; night: HTMLCanvasElement; halfW: number; h: number; open: number; openH: number }

const PX = (world: number) => Math.round(world / FPX);

function masonry(ctx: Ctx, x: number, y: number, w: number, h: number, base: string[], rng: Rng, bw = 10, bh = 6) {
  rect(ctx, x, y, w, h, base[1]);
  for (let yy = 0; yy < h; yy += bh) {
    hline(ctx, x, y + yy, w, base[0]);
    const off = (yy / bh) % 2 ? bw / 2 : 0;
    for (let xx = off; xx < w; xx += bw) {
      vline(ctx, x + xx, y + yy, bh, base[0]);
      if (rng.chance(0.3)) rect(ctx, x + xx + 1, y + yy + 1, bw - 2, bh - 2, base[2]);
      else if (rng.chance(0.2)) rect(ctx, x + xx + 1, y + yy + 1, bw - 2, bh - 2, base[0]);
      px(ctx, x + xx + 1, y + yy + 1, base[3] ?? base[2]);
    }
  }
  speckle(ctx, x, y, w, h, rng.int(1, 1e9), 0.08);
}

function cutArch(ctx: Ctx, cx: number, bottom: number, half: number, h: number, pointed: boolean) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  const spring = bottom - h + (pointed ? half * 1.2 : half);
  ctx.fillRect(cx - half, spring, half * 2, bottom - spring);
  for (let i = -half; i <= half; i++) {
    const f = i / half;
    const rise = pointed ? (1 - Math.abs(f)) ** 0.7 * half * 1.2 : Math.sqrt(Math.max(0, 1 - f * f)) * half;
    ctx.fillRect(cx + i, spring - rise, 1, rise + 1);
  }
  ctx.restore();
  return spring;
}

function voussoirs(ctx: Ctx, cx: number, bottom: number, half: number, h: number, pointed: boolean, col: string, dark: string) {
  const spring = bottom - h + (pointed ? half * 1.2 : half);
  for (let i = -half - 4; i <= half + 4; i++) {
    const f = i / (half + 4);
    const rise = pointed ? (1 - Math.abs(f)) ** 0.7 * (half + 4) * 1.2 : Math.sqrt(Math.max(0, 1 - f * f)) * (half + 4);
    for (let k = 0; k < 4; k++) px(ctx, cx + i, spring - rise + k, (i + 40) % 6 === 0 ? dark : col);
  }
}

function nightOf(src: HTMLCanvasElement) {
  const [c, ctx] = canvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = 0.55; ctx.fillStyle = '#0a0806'; ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

function tunnel(rng: Rng): Portal {
  const halfW = 7, h = 7200, open = 1.36, openH = 2600;
  const W = PX(halfW * 2000), H = PX(h);
  const [c, ctx] = canvas(W, H);
  const cx = W / 2;
  masonry(ctx, 0, PX(1800), W, H - PX(1800), STONE.slice(1), rng, 14, 7);
  // railway parapet on top + a little steam train silhouette
  rect(ctx, 0, PX(1800) - 8, W, 8, STONE[3]);
  for (let x = 0; x < W; x += 10) rect(ctx, x, PX(1800) - 14, 6, 6, STONE[4]);
  const trainX = Math.floor(W * 0.62);
  rect(ctx, trainX, PX(1800) - 30, 46, 16, S[1]); rect(ctx, trainX + 46, PX(1800) - 24, 60, 10, S[2]);
  rect(ctx, trainX + 6, PX(1800) - 40, 6, 10, S[1]); rect(ctx, trainX + 30, PX(1800) - 36, 14, 6, S[1]);
  for (let i = 0; i < 6; i++) { ctx.globalAlpha = 0.5 - i * 0.07; rect(ctx, trainX + 4 - i * 9, PX(1800) - 48 - i * 4, 10 + i * 2, 7, S[10]); }
  ctx.globalAlpha = 1;
  // inscription
  const ow = PX(open * 1000);
  rect(ctx, cx - ow - 10, H - PX(openH) - 34, ow * 2 + 20, 12, STONE[5]);
  textCentered(ctx, 'DETROIT RIVER TUNNEL 1910', cx, H - PX(openH) - 31, S[1]);
  voussoirs(ctx, cx, H, ow, PX(openH), false, STONE[6], STONE[3]);
  cutArch(ctx, cx, H, ow, PX(openH), false);
  // pilasters
  for (const s of [-1, 1]) rect(ctx, cx + s * (ow + 6) - (s < 0 ? 10 : 0), H - PX(openH) + 10, 10, PX(openH) - 10, STONE[4]);
  return { img: c, night: nightOf(c), halfW, h, open, openH };
}

function tower(rng: Rng): Portal {
  const halfW = 2.7, h = 10500, open = 1.25, openH = 5600;
  const W = PX(halfW * 2000), H = PX(h);
  const [c, ctx] = canvas(W, H);
  const cx = W / 2;
  masonry(ctx, 0, 0, W, H, STONE.slice(3), rng, 12, 6);
  // buttress shading
  for (const x of [0, W - 14]) { ctx.globalAlpha = 0.3; rect(ctx, x, 0, 14, H, S[0]); ctx.globalAlpha = 1; }
  // cornice + top
  rect(ctx, 0, 0, W, 10, STONE[6]); hline(ctx, 0, 10, W, STONE[2]);
  for (let x = 2; x < W; x += 6) rect(ctx, x, 10, 3, 3, STONE[5]);
  // blind gothic arches up high
  for (const dx of [-0.6, 0.6]) {
    const ax = cx + dx * W * 0.32;
    voussoirs(ctx, ax, PX(h - 1400), 14, 80, true, STONE[7], STONE[4]);
    ctx.globalAlpha = 0.7; ctx.fillStyle = S[1];
    for (let i = -12; i <= 12; i++) { const r = (1 - Math.abs(i / 12)) ** 0.7 * 16; ctx.fillRect(ax + i, PX(h - 1400) - 80 + 16 - r, 1, 64 + r); }
    ctx.globalAlpha = 1;
  }
  const ow = PX(open * 1000);
  voussoirs(ctx, cx, H, ow, PX(openH), true, STONE[7], STONE[3]);
  cutArch(ctx, cx, H, ow, PX(openH), true);
  // suspension cable saddles
  for (const s of [-1, 1]) rect(ctx, cx + s * W * 0.4 - 4, 4, 8, 6, S[1]);
  return { img: c, night: nightOf(c), halfW, h, open, openH };
}

function banner(rng: Rng, label: string): Portal {
  const halfW = 1.32, h = 4200, open = 1.3, openH = 4200;
  const W = PX(halfW * 2000), H = PX(h);
  const [c, ctx] = canvas(W, H);
  // poles
  for (const x of [1, W - 4]) { rect(ctx, x, 0, 3, H, S[2]); vline(ctx, x + 1, 0, H, S[5]); px(ctx, x + 1, 0, S[11]); }
  // cloth
  const by = PX(600), bh = PX(800);
  rect(ctx, 4, by, W - 8, bh, S[11]);
  for (let x = 4; x < W - 4; x += 4) { rect(ctx, x, by, 4, 3, ((x >> 2) % 2) ? S[0] : S[12]); rect(ctx, x, by + bh - 3, 4, 3, ((x >> 2) % 2) ? S[12] : S[0]); }
  const sc = textWidth(label, 2) < W - 16 ? 2 : 1;
  textCentered(ctx, label, W / 2, by + bh / 2 - (sc * 5) / 2, S[1], sc);
  // guy ropes + pennants
  for (let x = 4; x < W - 4; x += 6) for (let i = 0; i < 4; i++) hline(ctx, x + i, by - 8 + i, 5 - i * 2 > 0 ? 5 - i * 2 : 1, ((x / 6) | 0) % 2 ? S[3] : S[10]);
  hline(ctx, 4, by - 9, W - 8, S[1]);
  void rng;
  return { img: c, night: nightOf(c), halfW, h, open, openH };
}

function memorialArch(rng: Rng): Portal {
  const halfW = 2.3, h = 6800, open = 1.25, openH = 4400;
  const W = PX(halfW * 2000), H = PX(h);
  const [c, ctx] = canvas(W, H);
  const cx = W / 2;
  masonry(ctx, 0, 0, W, H, STONE.slice(5), rng, 16, 8);
  rect(ctx, 0, 0, W, 14, STONE[7]); hline(ctx, 0, 14, W, STONE[3]);
  textCentered(ctx, 'WASHINGTON', cx, PX(900), S[2], 2);
  for (const s of [-1, 1]) { rect(ctx, cx + s * W * 0.36 - 6, PX(1600), 12, PX(2600), STONE[8]); rect(ctx, cx + s * W * 0.36 - 4, PX(2000), 8, 24, STONE[4]); }
  const ow = PX(open * 1000);
  voussoirs(ctx, cx, H, ow, PX(openH), false, STONE[8], STONE[5]);
  cutArch(ctx, cx, H, ow, PX(openH), false);
  return { img: c, night: nightOf(c), halfW, h, open, openH };
}

function trestle(rng: Rng): Portal {
  const halfW = 3.2, h = 4000, open = 1.48, openH = 2900;
  const W = PX(halfW * 2000), H = PX(h);
  const [c, ctx] = canvas(W, H);
  // girder
  const gTop = 0, gH = PX(h - openH);
  rect(ctx, 0, gTop, W, gH, S[2]);
  hline(ctx, 0, gTop, W, S[4]); hline(ctx, 0, gTop + gH - 1, W, S[1]);
  for (let x = 0; x < W; x += 12) {
    for (let i = 0; i < gH - 4; i++) { px(ctx, x + Math.round((i / (gH - 4)) * 12), gTop + 2 + i, S[4]); px(ctx, x + 12 - Math.round((i / (gH - 4)) * 12), gTop + 2 + i, S[4]); }
    vline(ctx, x, gTop, gH, S[1]);
  }
  for (let x = 4; x < W; x += 8) px(ctx, x, gTop + 2, S[6]); // rivets
  rect(ctx, 0, gTop + 1, W, 2, S[1]);
  textCentered(ctx, 'MICHIGAN CENTRAL R.R.', W / 2, gTop + gH / 2 - 2, S[10]);
  // columns
  const ow = PX(open * 1000);
  for (const s of [-1, 1]) {
    const x = W / 2 + s * ow - (s < 0 ? 8 : 0);
    rect(ctx, x, gH, 8, H - gH, S[2]); vline(ctx, x + 1, gH, H - gH, S[4]);
    for (let y = gH; y < H; y += 8) hline(ctx, x, y, 8, S[1]);
  }
  ctx.save(); ctx.globalCompositeOperation = 'destination-out';
  ctx.fillRect(0, gH, W / 2 - ow - 8, H - gH); ctx.fillRect(W / 2 + ow + 8, gH, W, H - gH);
  ctx.fillRect(W / 2 - ow, gH, ow * 2, H - gH);
  ctx.restore();
  void rng;
  return { img: c, night: nightOf(c), halfW, h, open, openH };
}

let built: Record<string, Portal> | null = null;
export function portals(): Record<string, Portal> {
  if (!built) {
    const rng = new Rng(4242);
    built = { tunnel: tunnel(rng), tower: tower(rng), banner: banner(rng, 'FINISH'), arch: memorialArch(rng), trestle: trestle(rng) };
  }
  return built;
}

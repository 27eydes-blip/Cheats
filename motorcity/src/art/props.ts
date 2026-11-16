/** Roadside props: lamps, poles, trees, railings, stands, flags, hydrants... (procedural pixel art). */
import { canvas, rect, px, hline, vline, S, STONE, shade, flipH, text, textCentered, type Ctx } from './pixel';
import { register } from './registry';
import { Rng } from '../core/rng';

const reg = (id: string, c: HTMLCanvasElement, upp: number, extra: Partial<{ topY: number; topX: number[] }> = {}) =>
  ({ img: c, upp, flip: flipH(c), ...extra });

function castIronLamp(): HTMLCanvasElement {
  // ornate cast-iron street lamp: fluted post, scrolled arms, acorn lantern
  const W = 21, H = 64;
  const [c, ctx] = canvas(W, H);
  const iron = S[1], hi = S[4], mid = S[2];
  const cx = 10;
  // base plinth
  rect(ctx, cx - 4, H - 6, 9, 6, iron); hline(ctx, cx - 4, H - 6, 9, hi);
  rect(ctx, cx - 3, H - 10, 7, 4, mid); hline(ctx, cx - 3, H - 10, 7, hi);
  // fluted post
  rect(ctx, cx - 1, 18, 3, H - 28, iron);
  vline(ctx, cx, 18, H - 28, hi);
  for (let y = 26; y < H - 12; y += 9) { hline(ctx, cx - 2, y, 5, mid); }
  // scrolled arms + two lanterns
  for (const d of [-1, 1]) {
    for (let i = 0; i < 7; i++) px(ctx, cx + d * (1 + i), 18 - Math.round(Math.sin((i / 6) * Math.PI) * 3), iron);
    px(ctx, cx + d * 3, 20, iron); px(ctx, cx + d * 4, 21, iron);
    const lx = cx + d * 7;
    rect(ctx, lx - 2, 6, 5, 9, '#efe3c0');
    rect(ctx, lx - 1, 7, 3, 7, '#fff6dc');
    vline(ctx, lx, 6, 9, S[6]);
    rect(ctx, lx - 3, 4, 7, 2, iron); px(ctx, lx, 2, iron); px(ctx, lx, 3, iron);
    rect(ctx, lx - 2, 15, 5, 1, iron);
  }
  // finial
  rect(ctx, cx - 1, 9, 3, 9, iron); px(ctx, cx, 7, iron); px(ctx, cx, 8, hi);
  return c;
}

function parkLamp(): HTMLCanvasElement {
  const W = 11, H = 52;
  const [c, ctx] = canvas(W, H);
  rect(ctx, 3, H - 5, 5, 5, S[1]);
  rect(ctx, 4, 12, 3, H - 16, S[1]); vline(ctx, 5, 12, H - 16, S[3]);
  // globe
  rect(ctx, 2, 2, 7, 9, '#efe3c0'); rect(ctx, 3, 1, 5, 11, '#efe3c0'); rect(ctx, 4, 3, 3, 6, '#fff6dc');
  rect(ctx, 3, 11, 5, 1, S[1]);
  return c;
}

function bridgeLamp(): HTMLCanvasElement {
  const W = 9, H = 56;
  const [c, ctx] = canvas(W, H);
  rect(ctx, 3, 8, 3, H - 8, S[1]); vline(ctx, 4, 8, H - 8, S[3]);
  rect(ctx, 1, 0, 7, 8, S[1]); rect(ctx, 2, 1, 5, 6, '#efe3c0'); vline(ctx, 4, 1, 6, S[6]);
  return c;
}

function tunnelLamp(): HTMLCanvasElement {
  const [c, ctx] = canvas(7, 8);
  rect(ctx, 0, 0, 7, 2, S[1]); rect(ctx, 1, 2, 5, 5, '#efe3c0'); rect(ctx, 2, 3, 3, 3, '#fff6dc');
  return c;
}

function telePole(): HTMLCanvasElement {
  const W = 25, H = 110;
  const [c, ctx] = canvas(W, H);
  const cx = 12;
  rect(ctx, cx - 1, 0, 3, H, S[3]); vline(ctx, cx - 1, 0, H, S[2]); vline(ctx, cx + 1, 0, H, S[5]);
  for (let y = 10; y < H; y += 7) px(ctx, cx, y, S[2]); // grain
  for (const y of [6, 14]) {
    rect(ctx, 0, y, W, 2, S[3]); hline(ctx, 0, y, W, S[5]);
    for (const x of [1, 6, 18, 23]) { rect(ctx, x, y - 3, 1, 3, S[2]); px(ctx, x, y - 3, S[9]); }
  }
  // climbing pegs
  for (let y = 30; y < H - 20; y += 8) px(ctx, cx + ((y / 8) % 2 ? 2 : -2), y, S[1]);
  return c;
}

function trolleyPole(): HTMLCanvasElement {
  const W = 7, H = 104;
  const [c, ctx] = canvas(W, H);
  rect(ctx, 2, 4, 3, H - 4, S[1]); vline(ctx, 3, 4, H - 4, S[4]);
  rect(ctx, 1, H - 10, 5, 10, S[2]);
  rect(ctx, 1, 0, 5, 4, S[2]); px(ctx, 3, 0, S[6]);
  for (let y = 20; y < H - 12; y += 16) hline(ctx, 1, y, 5, S[2]);
  return c;
}

function tree(seed: number, kind: 'elm' | 'oak' | 'poplar'): HTMLCanvasElement {
  const rng = new Rng(seed * 31 + 7);
  const W = kind === 'poplar' ? 30 : 58, H = kind === 'poplar' ? 92 : 80;
  const [c, ctx] = canvas(W, H);
  const cx = W / 2;
  // trunk
  const tw = kind === 'oak' ? 6 : 4;
  rect(ctx, cx - tw / 2, H - 34, tw, 34, S[2]);
  vline(ctx, cx - tw / 2, H - 34, 34, S[1]);
  vline(ctx, cx + tw / 2 - 1, H - 34, 34, S[4]);
  // branches (elm: vase shape)
  if (kind === 'elm') for (const d of [-1, 1]) for (let i = 0; i < 14; i++) px(ctx, cx + d * Math.round(i * 0.8), H - 34 - i, S[2]);
  // canopy blobs
  const blobs = kind === 'poplar' ? 10 : 22;
  for (let i = 0; i < blobs; i++) {
    const bx = cx + rng.range(-1, 1) * (kind === 'poplar' ? 8 : 22);
    const by = (kind === 'poplar' ? rng.range(6, 66) : rng.range(8, 46));
    const r = kind === 'poplar' ? rng.range(5, 8) : rng.range(7, 12);
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r) continue;
      const lit = (-x - y) / (r * 1.4);
      const n = rng.next();
      const tone = lit > 0.4 ? (n < 0.5 ? S[7] : S[6]) : lit > -0.2 ? (n < 0.5 ? S[5] : S[4]) : n < 0.5 ? S[3] : S[2];
      if (n < 0.08) continue; // leafy holes
      px(ctx, bx + x, by + y, tone);
    }
  }
  return c;
}

function railing(): HTMLCanvasElement {
  const W = 34, H = 14;
  const [c, ctx] = canvas(W, H);
  rect(ctx, 0, 0, W, 2, S[1]); hline(ctx, 0, 0, W, S[4]);
  rect(ctx, 0, H - 2, W, 2, S[1]);
  for (let x = 1; x < W; x += 3) vline(ctx, x, 2, H - 4, S[2]);
  for (let x = 0; x < W; x += 6) { px(ctx, x + 1, 4, S[3]); px(ctx, x + 2, 5, S[3]); }
  rect(ctx, 0, 0, 2, H, S[1]);
  return c;
}

function stands(seed: number): HTMLCanvasElement {
  // grandstand with tiers of spectators and a bunting-trimmed roof
  const rng = new Rng(seed + 11);
  const W = 64, H = 60;
  const [c, ctx] = canvas(W, H);
  // roof
  rect(ctx, 0, 0, W, 5, S[2]); hline(ctx, 0, 0, W, S[5]);
  for (let x = 0; x < W; x += 8) for (let i = 0; i < 4; i++) hline(ctx, x + i, 5 + i, 8 - i * 2, (x / 8) % 2 ? S[11] : S[4]);
  rect(ctx, 1, 5, 2, H - 5, S[1]); rect(ctx, W - 3, 5, 2, H - 5, S[1]);
  // tiers
  for (let t = 0; t < 6; t++) {
    const y = 14 + t * 7;
    rect(ctx, 3, y + 5, W - 6, 2, S[4]);
    for (let x = 4; x < W - 4; x += 3) {
      const tone = rng.pick([S[1], S[2], S[3], S[8], S[10]]);
      rect(ctx, x, y + 1, 2, 4, tone); // body
      px(ctx, x, y, S[9]); px(ctx, x + 1, y, S[9]); // face
      if (rng.chance(0.45)) { hline(ctx, x - 1, y - 1, 4, S[1]); } // hat brim
      if (rng.chance(0.15)) { px(ctx, x + 1, y - 2, S[11]); px(ctx, x + 1, y - 3, S[11]); } // pennant/hand
    }
  }
  rect(ctx, 0, H - 4, W, 4, S[2]);
  return c;
}

function flagpole(seed: number): HTMLCanvasElement {
  const W = 26, H = 90;
  const [c, ctx] = canvas(W, H);
  vline(ctx, 2, 0, H, S[2]); vline(ctx, 3, 0, H, S[5]);
  px(ctx, 2, 0, S[9]); px(ctx, 3, 0, S[9]);
  // 48-star flag: stripes + canton
  const fx = 4, fy = 3, fw = 20;
  for (let i = 0; i < 13; i++) hline(ctx, fx, fy + i, fw, i % 2 ? S[11] : S[4]);
  rect(ctx, fx, fy, 9, 7, S[2]);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) px(ctx, fx + 1 + x * 2, fy + 1 + y * 2, S[11]);
  void seed;
  return c;
}

function simple(w: number, h: number, draw: (ctx: Ctx) => void) { const [c, ctx] = canvas(w, h); draw(ctx); return c; }

function smokestack(): HTMLCanvasElement {
  return simple(18, 200, (ctx) => {
    for (let y = 0; y < 200; y++) {
      const w = 8 + Math.round((y / 200) * 6);
      rect(ctx, 9 - w / 2, y, w, 1, (y >> 1) % 2 ? S[3] : S[4]);
      px(ctx, 9 - w / 2, y, S[2]);
    }
    rect(ctx, 3, 0, 12, 4, S[2]);
    hline(ctx, 3, 0, 12, S[5]);
    for (let y = 30; y < 190; y += 40) hline(ctx, 2, y, 14, S[2]);
  });
}

function waterTower(): HTMLCanvasElement {
  return simple(40, 90, (ctx) => {
    for (const x of [6, 33]) { vline(ctx, x, 40, 50, S[2]); }
    for (let y = 44; y < 88; y += 10) { for (let i = 0; i < 27; i++) px(ctx, 6 + i, y + Math.round((i / 27) * 9), S[3]); }
    rect(ctx, 4, 10, 32, 30, S[4]);
    for (let x = 4; x < 36; x += 3) vline(ctx, x, 10, 30, S[3]);
    hline(ctx, 4, 18, 32, S[2]); hline(ctx, 4, 30, 32, S[2]);
    for (let i = 0; i < 12; i++) hline(ctx, 20 - i * 1.4, 10 - i * 0.8, i * 2.8, S[2]);
  });
}

function fountain(): HTMLCanvasElement {
  return simple(80, 50, (ctx) => {
    rect(ctx, 4, 36, 72, 12, STONE[5]); hline(ctx, 4, 36, 72, STONE[7]);
    rect(ctx, 6, 38, 68, 5, '#4a5450');
    rect(ctx, 34, 18, 12, 18, STONE[6]);
    rect(ctx, 24, 16, 32, 4, STONE[7]);
    rect(ctx, 37, 6, 6, 10, STONE[6]);
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < 20; i++) { px(ctx, 40 + Math.sin(i) * (i * 0.9), 4 + i * 1.2, '#e8e8e0'); px(ctx, 40 - Math.sin(i) * (i * 0.9), 4 + i * 1.2, '#e8e8e0'); }
    ctx.globalAlpha = 1;
  });
}

export function buildProps() {
  register('lamp', reg('lamp', castIronLamp(), 24, { topY: 10, topX: [3, 17] }));
  register('parkLamp', reg('parkLamp', parkLamp(), 24, { topY: 6 }));
  register('bridgeLamp', reg('bridgeLamp', bridgeLamp(), 26, { topY: 4 }));
  register('tunnelLamp', reg('tunnelLamp', tunnelLamp(), 30, { topY: 4 }));
  register('telePole', reg('telePole', telePole(), 26, { topY: 6, topX: [1, 6, 18, 23] }));
  register('trolleyPole', reg('trolleyPole', trolleyPole(), 30, { topY: 2 }));
  register('elm', [0, 1, 2].map((i) => reg('elm', tree(i, 'elm'), 52)));
  register('oak', [0, 1, 2].map((i) => reg('oak', tree(i + 5, 'oak'), 50)));
  register('poplar', [0, 1].map((i) => reg('poplar', tree(i + 9, 'poplar'), 54)));
  register('railing', reg('railing', railing(), 26));
  register('stands', [0, 1, 2].map((i) => reg('stands', stands(i), 30)));
  register('flagpole', [0, 1].map((i) => reg('flagpole', flagpole(i), 32)));
  register('smokestack', reg('smokestack', smokestack(), 60));
  register('waterTower', reg('waterTower', waterTower(), 60));
  register('fountain', reg('fountain', fountain(), 40));
  register('hydrant', reg('hydrant', simple(7, 12, (ctx) => { rect(ctx, 1, 3, 5, 9, S[2]); rect(ctx, 0, 5, 7, 2, S[2]); rect(ctx, 2, 1, 3, 2, S[2]); vline(ctx, 2, 3, 8, S[5]); }), 26));
  register('barrel', reg('barrel', simple(10, 14, (ctx) => { rect(ctx, 1, 0, 8, 14, S[4]); rect(ctx, 0, 2, 10, 10, S[4]); for (const y of [2, 7, 11]) hline(ctx, 0, y, 10, S[1]); vline(ctx, 3, 0, 14, S[6]); }), 26));
  register('crates', reg('crates', simple(18, 16, (ctx) => { for (const [x, y, w] of [[0, 6, 10], [8, 6, 10], [3, 0, 10]]) { rect(ctx, x, y, w, w, S[6]); rect(ctx, x, y, w, 1, S[8]); rect(ctx, x, y + w - 1, w, 1, S[3]); vline(ctx, x, y, w, S[3]); px(ctx, x + w / 2, y + w / 2, S[3]); } }), 26));
  register('mailbox', reg('mailbox', simple(8, 16, (ctx) => { vline(ctx, 3, 8, 8, S[1]); vline(ctx, 4, 8, 8, S[1]); rect(ctx, 0, 0, 8, 9, S[2]); rect(ctx, 1, 2, 6, 1, S[6]); text(ctx, '', 0, 0, S[1]); }), 26));
  register('bench', reg('bench', simple(24, 11, (ctx) => { rect(ctx, 0, 0, 24, 2, S[5]); rect(ctx, 0, 4, 24, 2, S[5]); rect(ctx, 0, 6, 24, 1, S[3]); for (const x of [1, 21]) rect(ctx, x, 0, 2, 11, S[1]); }), 26));
  register('flagman', reg('flagman', simple(16, 26, (ctx) => {
    // starter with checkered flag
    rect(ctx, 5, 8, 5, 10, S[1]); rect(ctx, 6, 3, 3, 4, S[9]); rect(ctx, 4, 1, 7, 2, S[1]); rect(ctx, 5, 0, 5, 2, S[1]);
    rect(ctx, 5, 18, 2, 8, S[1]); rect(ctx, 8, 18, 2, 8, S[1]);
    vline(ctx, 11, 0, 9, S[2]);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 2; x++) rect(ctx, 12 + x * 2, y * 2, 2, 2, (x + y) % 2 ? S[12] : S[0]);
  }), 24));
  void shade; void textCentered;
}

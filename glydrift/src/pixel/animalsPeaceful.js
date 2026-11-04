// PEACEFUL animals — cheap starters (and Bao, from a login streak).
import { PixelCanvas } from "./px.js";
import { eye, finish, limb, lightEdges, shadeEdges, shut } from "./animalKit.js";

// ------------------------------------------------------------------ BUNBUN — floppy-eared bunny
export function bunbun(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0xfff4ec;
  const IN = 0xffa8c4;
  // ears: up, swept back, then flapped down like wings
  const ears = [
    [
      [15, 9, 12, 2],
      [17, 9, 18, 2],
    ],
    [
      [15, 9, 10, 3],
      [17, 9, 15, 2],
    ],
    [
      [15, 10, 6, 13],
      [16, 9, 7, 8],
    ],
  ][f];
  for (const [x0, y0, x1, y1] of ears) {
    limb(pc, x0, y0, x1, y1, 1.4, B);
    limb(pc, (x0 * 2 + x1) / 3, (y0 * 2 + y1) / 3, (x0 + x1 * 2) / 3, (y0 + y1 * 2) / 3, 0.5, IN);
  }
  pc.ellipse(11, 15.5, 6, 4.4, B); // body
  pc.circle(4.6, 14, 1.8, 0xffffff); // cotton tail
  pc.circle(16.5, 12, 4.2, B); // head
  pc.ellipse(18.5, 14, 2.4, 1.6, 0xffe4ec); // muzzle
  eye(pc, 17, 10, 0x3a1a2a);
  pc.set(21, 13, 0xff6a9a); // nose
  pc.set(19, 13, 0xffb0c8); // blush
  pc.rect(9, 19, 2, 2, B).rect(14, 19, 2, 2, B); // paws
  pc.rect(16, 19, 2, 1, B);
  shadeEdges(pc, B, 0xe8cfc0);
  return finish(pc, 0x5a2a3a);
}

// ------------------------------------------------------------------ PUDDLES — duckling in a pond float
export function puddles(f) {
  const pc = new PixelCanvas(24, 24);
  const Y = 0xffd84a;
  const bob = f === 1 ? 1 : 0;
  // the float ring: red & white stripes
  pc.ellipse(11.5, 17 + bob, 8.5, 3.2, 0xffffff);
  for (let x = 3; x <= 20; x++)
    if (Math.floor((x - 3) / 3) % 2 === 0) pc.vline(x, 14 + bob, 21 + bob, null);
  pc.ellipse(11.5, 17 + bob, 8.5, 3.2, null);
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      const dx = (x - 11.5) / 8.6;
      const dy = (y - 17 - bob) / 3.3;
      const r = dx * dx + dy * dy;
      if (r <= 1) pc.set(x, y, Math.floor((x + 1) / 3) % 2 ? 0xff4a5a : 0xffffff);
    }
  pc.ellipse(11.5, 16.4 + bob, 5.2, 1.4, 0x3aa8e0); // water in the hole
  // duckling
  pc.ellipse(11, 13 + bob, 5, 3.6, Y);
  pc.circle(15, 8 + bob, 3.6, Y);
  pc.set(14, 4 + bob, Y)
    .set(15, 4 + bob, Y)
    .set(15, 3 + bob, Y); // fluff tuft
  pc.rect(18, 8 + bob, 3, 2, 0xff9a1a).set(20, 9 + bob, 0xe07a10); // beak
  eye(pc, 15, 7 + bob, 0x1a1006);
  pc.set(17, 10 + bob, 0xffa8a8);
  // little wing: tucked, then flapping up
  if (f === 2) limb(pc, 9, 12, 4, 6, 1.2, 0xffc828);
  else pc.ellipse(9, 13 + bob, 2.6, 1.6, 0xffc828);
  pc.set(5, 12 + bob, Y).set(6, 11 + bob, Y); // tail
  lightEdges(pc, Y, 0xfff0a0);
  return finish(pc, 0x4a2a06);
}

// ------------------------------------------------------------------ SNOOZY — sloth on a leaf glider
export function snoozy(f) {
  const pc = new PixelCanvas(24, 24);
  const L = 0x5ad84a;
  const BR = 0x9a7a5a;
  const tilt = [0, 1, 0, 0][f];
  // the leaf glider (curls its edges up on a flap)
  pc.ellipse(12, 6 + tilt * 0.5, 10.5, 2.4, L);
  if (f === 2) {
    pc.rect(1, 3, 2, 2, L).rect(21, 3, 2, 2, L);
    pc.ellipse(12, 6, 10.5, 1.4, L);
  }
  pc.hline(3, 21, 6 + Math.round(tilt * 0.5), 0x2a8a2a); // midrib
  for (const x of [6, 10, 14, 18]) pc.set(x, 5, 0x2a8a2a);
  pc.set(22, 6, 0x2a8a2a).set(23, 6, 0x2a8a2a); // stem
  // long arms up to the leaf
  limb(pc, 9, 13, 8, 7, 1.1, BR);
  limb(pc, 15, 12, 15, 7, 1.1, BR);
  pc.set(7, 7, 0x4a3a2a).set(8, 7, 0x4a3a2a).set(14, 7, 0x4a3a2a).set(16, 7, 0x4a3a2a); // claws
  // body hanging below, round head with the classic sloth mask
  pc.ellipse(10, 17, 5.4, 3.8, BR);
  pc.circle(14, 13.5, 4.6, BR);
  pc.ellipse(14.5, 14, 3.8, 3, 0xf0dcc0); // pale face
  // dark eye stripes sweeping down and back
  pc.line(11, 12, 13, 14, 0x5a3a24).line(11, 13, 12, 14, 0x5a3a24);
  pc.line(18, 12, 16, 14, 0x5a3a24).line(18, 13, 17, 14, 0x5a3a24);
  if (f === 3) {
    shut(pc, 12, 13, 0x1a0a04);
    shut(pc, 16, 13, 0x1a0a04);
    pc.rect(14, 15, 2, 2, 0x6a1a1a).set(14, 15, 0x9a3a3a); // big yawn
  } else {
    shut(pc, 12, 13, 0x1a0a04);
    shut(pc, 16, 13, 0x1a0a04);
    pc.set(14, 16, 0x7a4a3a).set(15, 16, 0x7a4a3a); // sleepy smile
  }
  pc.rect(14, 14, 2, 1, 0x2a1a10); // nose
  pc.rect(7, 20, 2, 1, BR).rect(12, 20, 2, 1, BR);
  shadeEdges(pc, BR, 0x7a5a3a);
  return finish(pc, 0x2a1a08);
}
snoozy.frames = 4;

// ------------------------------------------------------------------ KAI THE KOI — sky koi
export function kai(f) {
  const pc = new PixelCanvas(24, 24);
  const W = 0xfff6ee;
  const O = 0xff7a2a;
  const R = 0xe0302a;
  const sway = [0, 1, 0][f];
  // tail fin (big swish on the flap)
  if (f === 2) {
    pc.poly(
      [
        [6, 12],
        [0, 5],
        [2, 12],
        [0, 19],
      ],
      O,
    );
  } else {
    pc.poly(
      [
        [6, 12],
        [1, 8 + sway],
        [2, 12 + sway],
        [1, 16 + sway],
      ],
      O,
    );
  }
  pc.ellipse(12.5, 12, 8, 3.8, W); // body
  pc.circle(18.5, 11.6, 3.3, W);
  // patches
  pc.ellipse(10, 10.5, 2.6, 1.6, O);
  pc.ellipse(15, 13, 2, 1.3, R);
  pc.ellipse(18.5, 9.5, 1.8, 1, O);
  pc.set(7, 13, R).set(8, 13, R);
  // fins
  const up = f === 2 ? -2 : 0;
  pc.poly(
    [
      [11, 8],
      [8, 4 + up],
      [14, 8],
    ],
    O,
  );
  pc.poly(
    [
      [14, 15],
      [11, 19 - up],
      [16, 15],
    ],
    0xffb070,
  );
  pc.rect(19, 10, 2, 2, 0x1a0606).set(19, 10, 0xffffff); // eye
  pc.set(21, 13, 0xff9a9a).set(22, 12, W); // mouth + barbel
  pc.set(22, 14, 0xffd0a0).set(23, 15, 0xffd0a0);
  // scales sparkle
  for (const [x, y] of [
    [9, 13],
    [12, 11],
    [13, 14],
  ])
    pc.set(x, y, 0xffffff);
  shadeEdges(pc, W, 0xe8d8cc);
  return finish(pc, 0x3a0a06);
}

// ------------------------------------------------------------------ BAO — zen panda on a giant leaf
export function bao(f) {
  const pc = new PixelCanvas(24, 24);
  const W = 0xfafaf4;
  const K = 0x1a1a22;
  const L = 0x4ac84a;
  const bob = f === 1 ? 1 : 0;
  // the giant leaf (edges ripple up on a flap)
  pc.ellipse(12, 19.5, 10.6, 2.4, L);
  if (f === 2) pc.rect(0, 17, 2, 2, L).rect(22, 17, 2, 2, L);
  pc.hline(2, 21, 19, 0x2a8a2a);
  pc.set(23, 20, 0x2a8a2a);
  for (const x of [5, 9, 13, 17]) pc.set(x, 20, 0x2a8a2a);
  // panda, sitting cross-legged, eyes closed, paws together
  const y = -bob;
  pc.ellipse(12, 17.2 + y * 0.3, 6, 2, K); // crossed legs
  pc.ellipse(12, 13.5 + y, 4.8, 3.6, W); // body
  pc.hline(8, 16, 11 + y, K).hline(9, 15, 10 + y, K); // shoulder band
  limb(pc, 8.5, 11 + y, 11, 15 + y, 1, K); // arms meeting in front
  limb(pc, 15.5, 11 + y, 13, 15 + y, 1, K);
  pc.circle(12, 6 + y, 4.6, W); // head
  pc.circle(8.2, 2.6 + y, 1.3, K).circle(15.8, 2.6 + y, 1.3, K); // ears
  pc.ellipse(10, 6.4 + y, 1.5, 1.3, K).ellipse(14, 6.4 + y, 1.5, 1.3, K); // eye patches
  shut(pc, 9, 6 + y, 0xffffff);
  shut(pc, 14, 6 + y, 0xffffff);
  pc.set(12, 8 + y, K); // nose
  pc.set(11, 9 + y, 0xd88a9a).set(13, 9 + y, 0xd88a9a); // smile
  shadeEdges(pc, W, 0xd8d8e4);
  return finish(pc, 0x2a2a52);
}

export const PEACEFUL_DRAW = { bunbun, puddles, snoozy, kai, bao };

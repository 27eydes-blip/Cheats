// © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE. Not open source.
// PRISM animals — crystal creatures unlocked by discovering and surviving the Prism Rift.
import { PixelCanvas } from "./px.js";
import { finish, limb, lightEdges, shadeEdges, wing } from "./animalKit.js";

const RAINBOW = [0xff6a8a, 0xffb04a, 0xfff06a, 0x6aff9a, 0x6ad8ff, 0xb48aff];
const rb = (i) => RAINBOW[((i % 6) + 6) % 6];

/** Sparkle facets: diagonal white glints over a crystal colour. */
function facets(pc, col, glint = 0xffffff, step = 4) {
  for (let y = 0; y < pc.h; y++)
    for (let x = 0; x < pc.w; x++)
      if (pc.get(x, y) === col && (x + y) % step === 0 && (x - y + 40) % 7 < 2) pc.set(x, y, glint);
  return pc;
}

// ------------------------------------------------------------------ GLASSFROG — see-through crystal frog
export function glassfrog(f) {
  const pc = new PixelCanvas(24, 24);
  const G = 0xc8f6ff;
  const M = 0x8ad8f0;
  const hop = f === 2;
  // back legs: tucked, or kicked out behind on the flap
  if (hop) {
    limb(pc, 8, 15, 2, 19, 1.1, M);
    limb(pc, 2, 19, 1, 21, 0.9, M);
  } else {
    pc.ellipse(7, 16, 3.2, 2.2, M);
    pc.hline(5, 9, 18, M);
  }
  pc.ellipse(12, 13.5, 6.4, 4.4, G); // body
  pc.circle(15.5, 9.5, 3.4, G); // head
  pc.circle(13.5, 6.5, 2.4, G).circle(18.5, 6.8, 2.4, G); // big eye bulges
  pc.circle(13.5, 6.5, 1.5, 0x1a3a5a).circle(18.5, 6.8, 1.5, 0x1a3a5a); // eyes
  pc.set(13, 6, 0xffffff).set(18, 6, 0xffffff);
  // you can see right through it: faint inner shapes
  pc.ellipse(11, 14, 2.4, 1.6, 0xa8e4f4);
  pc.set(13, 13, 0xff9ab8).set(12, 15, 0xb8e8ff);
  pc.hline(15, 20, 11, 0x4a98c8); // wide smile
  // front legs
  pc.rect(15, 17, 2, 2, M).rect(17, 19, 2, 1, M);
  facets(pc, G);
  // rainbow glint that walks across the frames
  pc.set(9 + f * 2, 11, rb(f * 2)).set(10 + f * 2, 12, rb(f * 2 + 1));
  lightEdges(pc, G, 0xffffff);
  return finish(pc, 0x1a4a6a);
}

// ------------------------------------------------------------------ SHARDCRAB — crab with a crystal shell
export function shardcrab(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0xff7a5a;
  const D = 0xc84a3a;
  // legs
  for (const x of [6, 9, 14, 17]) {
    const k = (x + f) % 2;
    pc.line(x, 16, x - 1 - k, 20, D);
  }
  pc.ellipse(12, 15, 7, 3.4, B); // body
  // the crystal shell: faceted shards in prism colours
  const shards = [
    [6, 13, 9, 6, 11, 13],
    [9, 13, 12, 4, 15, 13],
    [13, 13, 16, 6, 18, 13],
  ];
  shards.forEach(([x0, y0, x1, y1, x2, y2], i) => {
    pc.poly(
      [
        [x0, y0],
        [x1, y1],
        [x2, y2],
      ],
      [0xd28aff, 0x8ae8ff, 0xff9ad8][i],
    );
    pc.line(x1, y1 + 1, x1, y0 - 1, 0xffffff);
  });
  // eye stalks
  pc.vline(17, 9, 12, D).vline(19, 9, 12, D);
  pc.rect(16, 8, 2, 2, 0x1a0a0a).set(16, 8, 0xffffff);
  pc.rect(19, 8, 2, 2, 0x1a0a0a).set(19, 8, 0xffffff);
  // claws: closed, then clacked wide open on the flap
  const open = f === 2;
  for (const [x, y] of [
    [4, 12],
    [21, 12],
  ]) {
    pc.circle(x, y, 2, B);
    if (open)
      pc.rect(x - 1, y - 3, 1, 2, B)
        .rect(x + 1, y - 3, 1, 2, B)
        .set(x, y - 1, null);
    else pc.set(x, y - 2, B);
  }
  limb(pc, 5, 14, 4, 13, 0.8, B);
  limb(pc, 19, 14, 20, 13, 0.8, B);
  shadeEdges(pc, B, D);
  return finish(pc, 0x3a0a14);
}

// ------------------------------------------------------------------ FLICKER — glass hummingbird
export function flicker(f) {
  const pc = new PixelCanvas(24, 24);
  const G = 0xe0f8ff;
  // rapid wings: three blur positions, rainbow edged
  wing(pc, [0, 2, 1][f], 11, 11, 0xbfe8ff, rb(f * 2), 0.95);
  pc.poly(
    [
      [6, 14],
      [1, 18],
      [3, 14],
      [0, 13],
      [6, 12],
    ],
    0xa8d8f8,
  ); // forked tail
  pc.ellipse(10.5, 13.5, 5, 3.2, G); // body
  pc.circle(15, 10.5, 3, G); // head
  pc.ellipse(13, 14, 2.2, 1.3, rb(f + 4)); // prism throat
  pc.hline(18, 23, 10, 0x6a8aa8); // needle beak
  pc.rect(15, 9, 2, 2, 0x1a2a4a).set(15, 9, 0xffffff);
  facets(pc, G, 0xffffff, 3);
  pc.set(8, 12, rb(f)).set(10, 15, rb(f + 2));
  lightEdges(pc, G, 0xffffff);
  return finish(pc, 0x1a3a5a);
}

// ------------------------------------------------------------------ SPECTRA — rainbow crystal peacock
export function spectra(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x2a6aff;
  const fan = f === 3;
  if (fan) {
    // the tail fans open into a rainbow crystal wheel
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.45 + (i / 8) * 1.1);
      const x = 9 + Math.cos(a) * 8.5;
      const y = 13 + Math.sin(a) * 9;
      limb(pc, 9, 13, x, y, 1, rb(i));
      pc.circle(x, y, 1.6, rb(i + 1));
      pc.set(Math.round(x), Math.round(y), 0xffffff);
    }
  } else {
    // long trailing tail of crystal plumes
    const sway = f === 1 ? 1 : f === 2 ? -1 : 0;
    for (let i = 0; i < 4; i++) {
      limb(pc, 8, 14, 1, 13 + i * 2 + sway, 0.8, rb(i * 2));
      pc.set(1, 13 + i * 2 + sway, 0xffffff);
    }
  }
  pc.ellipse(11.5, 14, 4.6, 3.8, B); // body
  pc.ellipse(12, 15.5, 2.6, 1.8, 0x3ad8c8); // teal breast
  limb(pc, 14, 12, 16, 7, 1.2, B); // neck
  pc.circle(16.5, 6.5, 2.4, B); // head
  pc.set(16, 3, 0xffd23f).set(17, 2, 0x6ad8ff).set(18, 3, 0xff9ad8); // crown
  pc.vline(17, 3, 4, B);
  pc.rect(17, 6, 2, 2, 0x0a0a2a).set(17, 6, 0xffffff);
  pc.poly(
    [
      [19, 7],
      [21, 8],
      [19, 9],
    ],
    0xffd23f,
  );
  // wing: tucked, raised on the flap
  if (f === 2) wing(pc, 0, 12, 13, 0x1a4ad8, 0x6ad8ff, 0.8);
  else pc.ellipse(11, 13.5, 3, 2, 0x1a4ad8);
  pc.set(10, 18, 0x6a6a8a).set(13, 18, 0x6a6a8a); // feet
  shadeEdges(pc, B, 0x1a3ac0);
  return finish(pc, 0x0a0a3a);
}
spectra.frames = 4;

// ------------------------------------------------------------------ PRISMARA — crystal phoenix
export function prismara(f) {
  const pc = new PixelCanvas(24, 24);
  const C = 0xf0e8ff;
  const M = 0xc8a8ff;
  // flame-crystal wings
  wing(pc, f === 2 ? 2 : f, 11, 11, M, 0xffffff, 1.05);
  // sparkling streamer tail
  for (let i = 0; i < 3; i++) {
    limb(pc, 7, 14, 1, 11 + i * 3 + (f === 1 ? 1 : 0), 0.7, rb(i * 2 + f));
  }
  pc.ellipse(11, 13.5, 5, 3.6, C); // body
  pc.circle(16, 9.5, 3.4, C); // head
  // crest of crystal flames
  pc.poly(
    [
      [14, 7],
      [13, 2],
      [16, 6],
      [17, 1],
      [18, 7],
    ],
    0xd8b8ff,
  );
  pc.set(13, 2, 0xffffff).set(17, 1, 0xffffff);
  pc.poly(
    [
      [19, 9],
      [23, 10],
      [19, 11],
    ],
    0xffd23f,
  ); // beak
  pc.rect(16, 8, 2, 2, 0x5a1aa8).set(16, 8, 0xffffff);
  // inner rainbow core
  pc.ellipse(11, 14, 2.2, 1.6, rb(f + 3));
  pc.set(10, 13, 0xffffff);
  facets(pc, C, 0xffffff, 3);
  lightEdges(pc, C, 0xffffff);
  return finish(pc, 0x2a0a5a);
}

export const PRISM_DRAW = { glassfrog, shardcrab, flicker, spectra, prismara };

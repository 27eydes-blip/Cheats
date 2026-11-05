// © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE. Not open source.
// The ten Lucky Spin heroes — original 24x24 pixel creatures, 3 animation frames each.
// Flappers: frame 0 wings up, 1 mid, 2 down. Idle heroes: a gentle 3-step loop.
import { PixelCanvas } from "./px.js";

/** Recolour the bottom/right edge of a body colour darker for a little volume. */
export function shadeEdges(pc, col, dark) {
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++)
      if (pc.get(x, y) === col && (pc.get(x, y + 1) === null || pc.get(x + 1, y + 1) === null))
        pc.set(x, y, dark);
}
/** Three wing poses hinged near (hx, hy), drawn behind the body. */
export function wing(pc, frame, hx, hy, col, tip, span = 1) {
  const s = span;
  const poses = [
    [
      [hx, hy],
      [hx - 5 * s, hy - 9 * s],
      [hx - 1, hy - 6 * s],
      [hx + 2, hy - 10 * s],
      [hx + 4, hy - 2],
    ],
    [
      [hx, hy],
      [hx - 9 * s, hy - 4 * s],
      [hx - 5 * s, hy - 2],
      [hx - 7 * s, hy + 1],
      [hx + 4, hy + 1],
    ],
    [
      [hx, hy + 1],
      [hx - 5 * s, hy + 8 * s],
      [hx - 1, hy + 6 * s],
      [hx + 2, hy + 9 * s],
      [hx + 4, hy + 2],
    ],
  ];
  pc.poly(poses[frame], col);
  const p = poses[frame][1];
  pc.set(p[0] + (frame === 1 ? 1 : 0), p[1] + (frame === 0 ? 1 : frame === 2 ? -1 : 0), tip);
}
export function eye(pc, x, y, iris = 0x1a0636) {
  pc.rect(x, y, 2, 2, 0xffffff).set(x + 1, y + 1, iris);
}

// ------------------------------------------------------------------ ZEPHYR — wind wyvern
export function zephyr(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x4fe0c8;
  wing(pc, f, 10, 11, 0xbff8ee, 0xffffff);
  pc.poly(
    [
      [6, 14],
      [0, 16],
      [3, 14],
      [0, 11],
      [6, 12],
    ],
    B,
  ); // tail
  pc.set(0, 11, 0xffffff).set(0, 16, 0xffffff);
  pc.ellipse(10.5, 14, 5.5, 4, B);
  pc.circle(16.5, 10, 4, B);
  pc.rect(19, 10, 4, 2, B); // snout
  pc.ellipse(11, 15.5, 3.5, 1.6, 0xeafff8); // belly
  pc.set(14, 5, 0xffffff).set(15, 6, 0xffffff).set(17, 5, 0xffffff); // crest
  eye(pc, 17, 8);
  // wind swirl
  pc.set(3, 7 + f, 0xbff8ee)
    .set(4, 6 + f, 0xbff8ee)
    .set(5, 6 + f, 0xbff8ee);
  shadeEdges(pc, B, 0x24a08e);
  return pc.outline(0x062a28, 1, true);
}

// ------------------------------------------------------------------ CINDER — lava drake
export function cinder(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x4a2a30;
  wing(pc, f, 10, 11, 0xa8301a, 0xffd23f);
  pc.poly(
    [
      [6, 14],
      [0, 17],
      [2, 14],
      [1, 12],
      [6, 12],
    ],
    B,
  );
  pc.set(0, 17, 0xffd23f);
  pc.ellipse(10.5, 14, 6, 4.4, B);
  pc.circle(16.5, 9.5, 4.2, B);
  pc.rect(19, 9, 4, 3, B);
  // glowing lava cracks + a molten belly
  pc.ellipse(11, 16, 3.5, 1.4, 0xff6a1a);
  for (const [x, y] of [
    [7, 13],
    [8, 12],
    [12, 13],
    [13, 12],
    [15, 11],
    [16, 12],
  ])
    pc.set(x, y, 0xffa21a);
  pc.set(10, 16, 0xffd23f).set(12, 16, 0xffd23f);
  pc.set(14, 4, 0xffd23f).set(17, 4, 0xffd23f).set(14, 5, 0xffa21a).set(18, 5, 0xffa21a); // horns
  pc.rect(17, 8, 2, 2, 0xffffff).set(18, 9, 0xff3d1a); // eye
  pc.set(22, 10, 0xff6a1a); // nostril glow
  const sm = [
    [23, 8],
    [22, 7],
    [23, 6],
  ][f];
  pc.set(sm[0], sm[1], 0xb8a8a8);
  shadeEdges(pc, B, 0x2a1418);
  return pc.outline(0xff5a1a, 1, true);
}

// ------------------------------------------------------------------ HOOT — arcane owl
export function hoot(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x8a5cff;
  wing(pc, f, 9, 13, 0x5f3ac8, 0xd8c0ff);
  pc.ellipse(13, 13.5, 6.5, 7, B);
  pc.ellipse(13, 15.5, 4, 4, 0xd8c0ff); // chest
  for (const [x, y] of [
    [12, 14],
    [14, 15],
    [12, 17],
    [14, 18],
  ])
    pc.set(x, y, 0xb090ff);
  // ear tufts
  pc.poly(
    [
      [8, 8],
      [7, 3],
      [11, 7],
    ],
    B,
  ).poly(
    [
      [18, 8],
      [19, 3],
      [15, 7],
    ],
    B,
  );
  // big eyes with gold rings
  pc.circle(10.5, 10.5, 2.4, 0xffd23f).circle(15.5, 10.5, 2.4, 0xffd23f);
  pc.circle(10.5, 10.5, 1.4, 0xffffff).circle(15.5, 10.5, 1.4, 0xffffff);
  const look = f === 1 ? 1 : 0;
  pc.set(11 + look, 11, 0x1a0636).set(16 + look, 11, 0x1a0636);
  pc.set(13, 12, 0xffa21a).set(13, 13, 0xff7a1a); // beak
  pc.set(10, 21, 0xffa21a).set(15, 21, 0xffa21a); // feet
  // sparkle of magic
  const sp = [
    [21, 5],
    [22, 9],
    [20, 3],
  ][f];
  pc.set(sp[0], sp[1], 0xffffff)
    .set(sp[0] - 1, sp[1], 0xd8c0ff)
    .set(sp[0], sp[1] + 1, 0xd8c0ff);
  shadeEdges(pc, B, 0x5f3ac8);
  return pc.outline(0x1a0636, 1, true);
}

// ------------------------------------------------------------------ NYX — vampire bat
export function nyx(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x3a1a4a;
  const W = 0x5a2a6a;
  const spans = [
    [
      [12, 12],
      [1, 3],
      [4, 8],
      [2, 10],
      [7, 11],
      [12, 14],
      [17, 11],
      [22, 10],
      [20, 8],
      [23, 3],
    ],
    [
      [12, 12],
      [0, 9],
      [3, 11],
      [2, 14],
      [7, 13],
      [12, 14],
      [17, 13],
      [22, 14],
      [21, 11],
      [24, 9],
    ],
    [
      [12, 12],
      [3, 20],
      [5, 16],
      [2, 15],
      [7, 14],
      [12, 14],
      [17, 14],
      [22, 15],
      [19, 16],
      [21, 20],
    ],
  ][f];
  pc.poly(spans, W);
  pc.ellipse(12, 13, 4, 4.6, B);
  pc.poly(
    [
      [9, 9],
      [8, 5],
      [11, 8],
    ],
    B,
  ).poly(
    [
      [15, 9],
      [16, 5],
      [13, 8],
    ],
    B,
  ); // ears
  pc.rect(10, 11, 2, 2, 0xff2a3d).rect(13, 11, 2, 2, 0xff2a3d);
  pc.set(10, 11, 0xffd0d8).set(13, 11, 0xffd0d8);
  pc.set(11, 15, 0xffffff).set(13, 15, 0xffffff); // fangs
  return pc.outline(0xd0a8ff, 1, true); // light rim so the dark bat reads anywhere
}

// ------------------------------------------------------------------ LUMEN — glow moth
export function lumen(f) {
  const pc = new PixelCanvas(24, 24);
  const Wg = 0xfff1a8;
  const lift = [-2, 0, 2][f];
  pc.poly(
    [
      [12, 11],
      [3, 4 + lift],
      [1, 10 + lift],
      [6, 14],
      [12, 13],
    ],
    Wg,
  ); // upper wings
  pc.poly(
    [
      [12, 11],
      [21, 4 + lift],
      [23, 10 + lift],
      [18, 14],
      [12, 13],
    ],
    Wg,
  );
  pc.poly(
    [
      [12, 13],
      [5, 16],
      [7, 20],
      [12, 15],
    ],
    0xffd23f,
  ); // lower wings
  pc.poly(
    [
      [12, 13],
      [19, 16],
      [17, 20],
      [12, 15],
    ],
    0xffd23f,
  );
  // glowing eye-spots
  pc.circle(5, 9 + lift, 1.4, 0x7ad8ff).circle(19, 9 + lift, 1.4, 0x7ad8ff);
  pc.set(5, 9 + lift, 0xffffff).set(19, 9 + lift, 0xffffff);
  pc.ellipse(12, 14, 1.6, 5, 0xc8a070); // fuzzy body
  pc.circle(12, 9, 1.8, 0xe8d0a0);
  eye(pc, 12, 8, 0x2a1a00);
  pc.line(11, 7, 9, 4, 0xc8a070).line(13, 7, 15, 4, 0xc8a070); // antennae
  pc.set(9, 4, 0xfff1a8).set(15, 4, 0xfff1a8);
  return pc.outline(0x4a3a10, 1, true);
}

// ------------------------------------------------------------------ KOI — sky koi
export function koi(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0xfff4ec;
  const sway = [-1, 0, 1][f];
  // tail fin (waves)
  pc.poly(
    [
      [5, 12],
      [0, 7 + sway],
      [2, 12],
      [0, 17 - sway],
      [5, 13],
    ],
    0xff7a3a,
  );
  pc.ellipse(12, 12.5, 7.5, 4.6, B);
  // orange patches
  pc.ellipse(10, 11, 2.6, 2, 0xff7a3a).ellipse(15, 14, 2, 1.6, 0xff7a3a).set(7, 14, 0xff7a3a);
  // fins
  pc.poly(
    [
      [11, 8],
      [13, 4 + sway],
      [15, 8],
    ],
    0xff9a5a,
  );
  pc.poly(
    [
      [12, 16],
      [10, 20 - sway],
      [14, 17],
    ],
    0xff9a5a,
  );
  eye(pc, 17, 11, 0x1a0a00);
  // whiskers
  pc.set(20, 14, 0xffd23f).set(21, 15, 0xffd23f).set(22, 15, 0xffd23f);
  // bubble
  const bub = [
    [22, 8],
    [21, 6],
    [22, 4],
  ][f];
  pc.set(bub[0], bub[1], 0xbff4ff);
  shadeEdges(pc, B, 0xe0d0c8);
  return pc.outline(0x4a1a0a, 1, true);
}

// ------------------------------------------------------------------ KITSU — fox spirit
export function kitsu(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0xff8a3a;
  // three spirit-flame tails (sway)
  const s = [-1, 0, 1][f];
  for (const [ang, col] of [
    [-1, 0x7ad8ff],
    [0, 0xb45cff],
    [1, 0x7ad8ff],
  ]) {
    const tx = 1 + s;
    const ty = 12 + ang * 5;
    pc.poly(
      [
        [9, 13],
        [tx, ty - 2],
        [tx - 1, ty],
        [tx + 1, ty + 2],
        [9, 15],
      ],
      col,
    );
    pc.set(tx, ty, 0xffffff);
  }
  pc.ellipse(12, 14, 4.6, 3.6, B); // body
  pc.circle(16, 10, 3.6, B); // head
  pc.poly(
    [
      [13, 8],
      [13, 3],
      [16, 7],
    ],
    B,
  ).poly(
    [
      [17, 7],
      [19, 3],
      [19, 8],
    ],
    B,
  ); // ears
  pc.set(14, 5, 0xffd0b0).set(18, 5, 0xffd0b0);
  pc.ellipse(16.5, 12, 2.4, 1.4, 0xfff4ec); // muzzle
  pc.set(19, 11, 0x2a0a00); // nose
  pc.rect(15, 9, 2, 1, 0x2a0a00); // closed happy eye
  pc.set(11, 17, 0xfff4ec).set(14, 17, 0xfff4ec); // paws
  // forehead spirit mark
  pc.set(16, 7, 0xb45cff);
  shadeEdges(pc, B, 0xc8501a);
  return pc.outline(0x2a0a1a, 1, true);
}

// ------------------------------------------------------------------ GRIFFO — baby griffin
export function griffo(f) {
  const pc = new PixelCanvas(24, 24);
  const G = 0xe8b040;
  wing(pc, f, 10, 11, 0xfff4ec, 0xd8c0a0);
  pc.poly(
    [
      [5, 15],
      [1, 18],
      [0, 16],
      [4, 14],
    ],
    G,
  ); // lion tail
  pc.rect(0, 17, 2, 2, 0x8a5a20);
  pc.ellipse(10, 15, 5.5, 3.8, G); // lion body
  pc.rect(7, 18, 2, 2, G).rect(12, 18, 2, 2, G);
  pc.circle(16, 10, 3.8, 0xfff4ec); // eagle head
  pc.poly(
    [
      [19, 9],
      [23, 10],
      [20, 12],
    ],
    0xffc83d,
  ); // beak
  pc.set(22, 11, 0xc8801a);
  eye(pc, 16, 9);
  pc.set(14, 6, 0xd8c0a0).set(15, 6, 0xd8c0a0); // feather tuft
  shadeEdges(pc, G, 0xb07a20);
  return pc.outline(0x3a2408, 1, true);
}

// ------------------------------------------------------------------ BUZZ — clockwork bee
export function buzz(f) {
  const pc = new PixelCanvas(24, 24);
  // wings blur (fast flutter frames)
  const wy = [3, 5, 4][f];
  pc.ellipse(10, wy + 3, 4, 2.4, 0xd8f4ff).ellipse(15, wy + 2, 4, 2.4, 0xbfe8ff);
  pc.ellipse(12, 14, 7, 5, 0xffd23f); // body
  for (const x of [8, 11, 14]) pc.vline(x, 10, 18, 0x2a2a3a); // stripes
  pc.circle(18.5, 12, 3.4, 0x2a2a3a); // head
  eye(pc, 19, 11, 0x2bffef);
  pc.set(21, 12, 0x2bffef);
  // brass gear on the back + stinger
  pc.circle(9, 9, 1.8, 0xc8a050).set(9, 9, 0x6a5020);
  pc.poly(
    [
      [5, 13],
      [2, 14],
      [5, 15],
    ],
    0x8a8a9a,
  );
  pc.line(19, 9, 20, 6, 0x2a2a3a).set(20, 5, 0xffd23f); // antenna
  return pc.outline(0x1a1408, 1, true);
}

// ------------------------------------------------------------------ AURORA — star whale
export function aurora(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x2a3a8a;
  const t = [-1, 0, 1][f];
  pc.poly(
    [
      [4, 12],
      [0, 8 + t],
      [1, 12],
      [0, 16 - t],
      [4, 13],
    ],
    0x3a5ac8,
  ); // tail fluke
  pc.ellipse(12.5, 12.5, 8.5, 5.6, B);
  pc.ellipse(13, 15, 6.5, 2.4, 0x7ad8ff); // glowing belly
  for (const x of [9, 12, 15]) pc.hline(x - 1, x, 16, 0xbff4ff);
  // stars on the back (twinkle)
  const stars = [
    [9, 9],
    [13, 8],
    [17, 10],
    [11, 11],
  ];
  stars.forEach(([x, y], i) => pc.set(x, y, (i + f) % 3 === 0 ? 0xffffff : 0xfff1a8));
  // aurora fin
  pc.poly(
    [
      [12, 8],
      [10, 3 + t],
      [15, 7],
    ],
    0x39ff88,
  );
  pc.set(11, 5 + t, 0xff7ad9);
  eye(pc, 18, 12, 0x0a0a2a);
  pc.set(16, 14, 0xff9ac8); // blush
  shadeEdges(pc, B, 0x1a2460);
  return pc.outline(0x060a2a, 1, true);
}

export const LOTTERY_DRAW = { zephyr, cinder, hoot, nyx, lumen, koi, kitsu, griffo, buzz, aurora };

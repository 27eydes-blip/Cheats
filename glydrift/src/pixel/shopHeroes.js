// Ten more shop heroes — original 24x24 pixel creatures, 3 animation frames each, facing right.
// Bought with coins (plus shards or a challenge for the pricier ones), like the core roster.
import { eye, shadeEdges, wing } from "./lotteryHeroes.js";
import { PixelCanvas } from "./px.js";

// ------------------------------------------------------------------ PIP — pocket sparrow
export function pip(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0xc87a3a;
  wing(pc, f, 10, 12, 0x8a4a1a, 0xffd8a0, 0.9);
  pc.poly(
    [
      [6, 15],
      [1, 18],
      [0, 14],
      [6, 12],
    ],
    0x8a4a1a,
  ); // tail
  pc.ellipse(11, 14, 5.5, 4.4, B);
  pc.circle(16, 10, 4, B);
  pc.ellipse(12, 16, 3.6, 2, 0xfff0d8); // belly
  pc.rect(14, 6, 4, 2, 0x8a4a1a); // little cap
  pc.poly(
    [
      [19, 10],
      [23, 11],
      [19, 12],
    ],
    0xffb020,
  ); // beak
  eye(pc, 16, 9);
  pc.set(10, 19, 0xffb020).set(13, 19, 0xffb020); // feet
  shadeEdges(pc, B, 0x9a5420);
  return pc.outline(0x2a1004, 1, true);
}

// ------------------------------------------------------------------ CORAL — reef puffer (puffs up)
export function coral(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0xffc83d;
  const r = [5.6, 6.4, 7.2][f];
  pc.poly(
    [
      [6, 12],
      [1, 8],
      [2, 12],
      [1, 16],
    ],
    0xff7a3a,
  ); // tail fin
  // spikes stick out further as it puffs
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    pc.set(12.5 + Math.cos(a) * (r + 1.4), 12 + Math.sin(a) * (r + 1.4), 0xfff4ec);
  }
  pc.circle(12.5, 12, r, B);
  pc.ellipse(12.5, 14.5, r - 1.5, r * 0.45, 0xfff4ec); // belly
  for (const [x, y] of [
    [9, 9],
    [12, 8],
    [10, 12],
  ])
    pc.set(x, y, 0xff7a3a); // spots
  eye(pc, 15, 9, 0x1a0a00);
  pc.set(18, 13, 0xff4f6a).set(19, 13, 0xff4f6a); // pout
  pc.poly(
    [
      [12, 14],
      [9, 17],
      [13, 16],
    ],
    0xff9a5a,
  ); // side fin
  shadeEdges(pc, B, 0xe0901a);
  return pc.outline(0x3a1a04, 1, true);
}

// ------------------------------------------------------------------ SPROUT — leaf-copter sprite
export function sprout(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x7ad84a;
  const L = 0x39b84a;
  // spinning leaf rotor: wide, then foreshortened both ways
  const span = [9, 4, 6][f];
  pc.ellipse(12 - span / 2, 5, span / 2 + 0.5, 1.4, L);
  pc.ellipse(12 + span / 2, 5, span / 2 + 0.5, 1.4, f === 1 ? 0x5ad86a : L);
  pc.vline(12, 5, 8, 0x2a7a2a); // stem
  pc.circle(12, 13.5, 5.6, B);
  pc.ellipse(12, 16, 3.6, 2.2, 0xd8ffb0); // tummy
  eye(pc, 10, 11, 0x0a2a0a);
  eye(pc, 14, 11, 0x0a2a0a);
  pc.set(9, 14, 0xff9ac8).set(16, 14, 0xff9ac8); // blush
  pc.set(12, 14, 0x2a7a2a); // smile
  pc.set(9, 19, 0x2a7a2a).set(15, 19, 0x2a7a2a); // root feet
  shadeEdges(pc, B, 0x4aa83a);
  return pc.outline(0x0a2a0a, 1, true);
}

// ------------------------------------------------------------------ RUBY — hummingbird
export function ruby(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x2ad8a0;
  // fast wing blur
  wing(pc, f, 10, 11, 0xbff8ff, 0xffffff, 0.85);
  pc.poly(
    [
      [6, 14],
      [1, 19],
      [3, 15],
      [0, 15],
      [6, 12],
    ],
    0x1a8a6a,
  ); // forked tail
  pc.ellipse(10.5, 14, 5, 3.4, B);
  pc.circle(15, 10.5, 3.2, B);
  pc.ellipse(13.5, 13.5, 2.6, 1.6, 0xff2a5a); // ruby throat
  pc.set(14, 12, 0xff8aa8);
  pc.hline(18, 23, 10, 0x2a2a3a); // long beak
  eye(pc, 15, 9);
  shadeEdges(pc, B, 0x14a07a);
  return pc.outline(0x04201a, 1, true);
}

// ------------------------------------------------------------------ PENGU — jetpack penguin
export function pengu(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x2a2a44;
  // jetpack flame flickers
  const fl = [3, 5, 4][f];
  pc.rect(4, 17, 3, fl, 0xffa21a);
  pc.rect(5, 17, 1, fl - 1, 0xffffff);
  pc.rect(3, 8, 4, 9, 0x8a8aa8); // jetpack
  pc.rect(4, 9, 2, 2, 0xff4f6a);
  pc.ellipse(12.5, 13, 5.4, 6.6, B);
  pc.ellipse(13.5, 14.5, 3.4, 4.6, 0xfff4ec); // belly
  pc.poly(
    [
      [8, 12],
      [6, 17],
      [9, 16],
    ],
    0x3a3a5a,
  ); // flipper
  eye(pc, 14, 9);
  pc.poly(
    [
      [17, 10],
      [21, 11],
      [17, 12],
    ],
    0xffa21a,
  ); // beak
  pc.rect(10, 19, 2, 1, 0xffa21a).rect(14, 19, 2, 1, 0xffa21a); // feet
  pc.hline(9, 16, 7, 0x7ad8ff); // goggles strap
  return pc.outline(0x9ad8ff, 1, true); // icy rim so the dark bird reads anywhere
}

// ------------------------------------------------------------------ JELLY — neon jellyfish
export function jelly(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0xff7ad9;
  // wavy tentacles
  const cols = [0x7ad8ff, 0xb45cff, 0x7ad8ff, 0xb45cff];
  [7, 10, 14, 17].forEach((x, i) => {
    for (let y = 11; y <= 21; y++) {
      const w = Math.round(Math.sin(y * 0.8 + f * 2.1 + i) * 1.1);
      pc.set(x + w, y, cols[i]);
    }
  });
  // bell (top half of an ellipse) with a frilled rim
  for (let y = 3; y <= 11; y++)
    for (let x = 4; x <= 20; x++)
      if (((x - 12) / 8) ** 2 + ((y - 11) / 8) ** 2 <= 1) pc.set(x, y, B);
  for (let x = 5; x <= 19; x += 2) pc.set(x, 12, 0xffb0ec);
  pc.ellipse(10, 6, 2.2, 1.2, 0xffd0f4); // gloss
  pc.set(9, 5, 0xffffff);
  eye(pc, 9, 8, 0x3a0636);
  eye(pc, 14, 8, 0x3a0636);
  pc.set(12, 10, 0x3a0636);
  shadeEdges(pc, B, 0xd04ab0);
  return pc.outline(0x3a0636, 1, true);
}

// ------------------------------------------------------------------ COMET — star rocket (cat pilot)
export function comet(f) {
  const pc = new PixelCanvas(24, 24);
  // exhaust
  const len = [4, 6, 5][f];
  pc.poly(
    [
      [6, 10],
      [6 - len, 12],
      [6, 14],
    ],
    0xffa21a,
  );
  pc.poly(
    [
      [6, 11],
      [7 - len / 2, 12],
      [6, 13],
    ],
    0xfff1a0,
  );
  // fins
  pc.poly(
    [
      [6, 9],
      [4, 5],
      [10, 9],
    ],
    0xff3d5a,
  ).poly(
    [
      [6, 15],
      [4, 19],
      [10, 15],
    ],
    0xff3d5a,
  );
  pc.rect(6, 9, 12, 7, 0xeef0ff); // hull
  pc.poly(
    [
      [17, 9],
      [23, 12],
      [17, 16],
    ],
    0xff3d5a,
  ); // nose cone
  pc.hline(6, 17, 15, 0xb8bcd8);
  // porthole with a little cat pilot
  pc.circle(12, 12, 2.6, 0x2a3a8a);
  pc.set(11, 11, 0xffc83d).set(13, 11, 0xffc83d).set(11, 10, 0xffc83d).set(13, 10, 0xffc83d);
  pc.rect(11, 12, 3, 2, 0xffc83d);
  pc.set(11, 12, 0x1a0a00).set(13, 12, 0x1a0a00);
  // sparkle behind
  const sp = [
    [1, 6],
    [2, 18],
    [0, 9],
  ][f];
  pc.set(sp[0], sp[1], 0xffffff);
  return pc.outline(0x1a0a2a, 1, true);
}

// ------------------------------------------------------------------ RONIN — ninja crow
export function ronin(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x2a2a3a;
  wing(pc, f, 10, 12, 0x3a3a5a, 0xc8c8e0);
  pc.poly(
    [
      [6, 15],
      [0, 18],
      [2, 15],
      [0, 13],
      [6, 13],
    ],
    B,
  ); // tail
  pc.ellipse(11, 14.5, 5.4, 4, B);
  pc.circle(16, 10, 4, B);
  // red headband with two ribbon ends fluttering behind the head
  const w = [-1, 0, 1][f];
  pc.hline(13, 19, 7, 0xff2a3d).hline(14, 18, 6, 0xff2a3d);
  pc.line(12, 7, 8, 5 + w, 0xff2a3d).line(12, 8, 9, 9 - w, 0xc81a2a);
  pc.rect(16, 9, 3, 2, 0xffffff).set(18, 10, 0xff2a3d); // fierce eye
  pc.poly(
    [
      [19, 10],
      [23, 11],
      [19, 13],
    ],
    0xb8b8d0,
  ); // beak
  pc.set(8, 18, 0xffd23f).set(12, 18, 0xffd23f); // talons
  return pc.outline(0xd0d0f0, 1, true); // pale rim so the black crow reads anywhere
}

// ------------------------------------------------------------------ SERAPH — haloed dove
export function seraph(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0xfff8f0;
  // second (rear) wing pair, offset pose
  wing(pc, (f + 1) % 3, 8, 13, 0xffe7a8, 0xffd23f, 0.8);
  wing(pc, f, 11, 12, 0xffffff, 0xffd23f);
  pc.poly(
    [
      [6, 14],
      [0, 17],
      [1, 13],
      [6, 12],
    ],
    B,
  );
  pc.ellipse(11.5, 14, 5.4, 4, B);
  pc.circle(16.5, 10, 3.6, B);
  pc.set(19, 10, 0xffc0a0).set(20, 11, 0xffa21a).set(21, 11, 0xffa21a); // beak
  eye(pc, 16, 9, 0x2a3a8a);
  // golden halo floating above the head (bobs)
  const hy = [3, 2, 3][f];
  pc.hline(14, 19, hy - 1, 0xffd23f).hline(14, 19, hy + 1, 0xffd23f);
  pc.set(13, hy, 0xffd23f).set(20, hy, 0xffd23f);
  shadeEdges(pc, B, 0xe0d8d0);
  return pc.outline(0x6a4a10, 1, true);
}

// ------------------------------------------------------------------ LEVIATHAN — sea serpent
export function leviathan(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x1a6ac8;
  const ph = f * 2.1;
  // undulating body: a chain of discs along a sine wave, tail on the left
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const x = 2 + i;
    const y = 13 + Math.sin(i * 0.55 + ph) * 3;
    pts.push([x, y]);
    pc.circle(x, y, 1.2 + i * 0.12, B);
  }
  // fin ridge
  for (let i = 3; i <= 13; i += 3) pc.set(pts[i][0], pts[i][1] - 2.4 - i * 0.1, 0x2bffef);
  // glowing belly spots
  for (let i = 4; i <= 13; i += 3) pc.set(pts[i][0], pts[i][1] + 1, 0x7af8ff);
  // head
  const [hx, hy] = pts[14];
  const Hd = 0x3a9aff;
  pc.circle(hx + 2, hy - 1, 3.6, Hd);
  pc.rect(hx + 3, hy - 1, 4, 3, Hd); // snout
  pc.hline(hx + 3, hx + 6, hy + 2, 0x0a3a8a); // jaw line
  pc.set(hx + 1, hy - 5, 0xffd23f)
    .set(hx, hy - 6, 0xffd23f)
    .set(hx + 3, hy - 5, 0xffd23f); // horns
  pc.rect(hx + 2, hy - 3, 2, 2, 0xffffff).set(hx + 3, hy - 2, 0x0a8a8a); // eye
  pc.set(hx + 6, hy + 1, 0xffffff); // fang
  shadeEdges(pc, B, 0x0a3a8a);
  return pc.outline(0x02102a, 1, true);
}

// ------------------------------------------------------------------ SMASH — mantis shrimp
// Limited-time MEGA LEGENDARY. Frames: 0 / 1 swim (legs paddle), 2 = the punch (club fully
// extended with an impact spark). Rainbow armour: green shell with orange segment bands, blue
// tail fan with red tips, pink clubs and stalked "trinocular" eyes.
export function smash(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x2ad86a;
  const BAND = 0xff8a1a;
  const FAN = 0x2a8aff;
  // tail fan (spread on the left)
  pc.poly(
    [
      [5, 13],
      [0, 9],
      [1, 13],
      [0, 18],
      [5, 15],
    ],
    FAN,
  );
  pc.set(0, 9, 0xff2a5a).set(0, 18, 0xff2a5a).set(1, 13, 0xff2a5a);
  pc.set(2, 11, 0xffe14d).set(2, 16, 0xffe14d); // eye-spots on the fan
  // segmented abdomen, slightly arched
  for (let i = 0; i < 5; i++) {
    const x = 5 + i * 2.2;
    pc.ellipse(x, 13.5 - (i === 2 ? 0.5 : 0), 1.8, 3 + i * 0.12, B);
  }
  for (let i = 1; i < 5; i++) pc.vline(Math.round(4.6 + i * 2.2), 11, 15, BAND); // bands
  // carapace + head
  pc.ellipse(16.5, 12.5, 4, 3.4, 0x1ac0a0);
  pc.hline(14, 19, 10, 0x7affd8); // shell shine
  pc.ellipse(10, 15.5, 5.5, 1.2, 0xbfffd8); // pale belly
  // swimmerets paddle under the body
  for (let i = 0; i < 4; i++) {
    const down = (i + f) % 2 === 0 ? 1 : 0;
    pc.set(7 + i * 2, 17 + down, BAND);
  }
  // antennal scales — orange paddles fanned forward
  pc.poly(
    [
      [19, 10],
      [23, 7],
      [23, 9],
      [20, 11],
    ],
    BAND,
  );
  pc.set(23, 7, 0xffe14d);
  // stalked eyes with the mid-band stripe
  for (const [ex, ey] of [
    [17, 4],
    [20, 5],
  ]) {
    pc.vline(ex, ey + 2, 9, 0x1ac0a0);
    pc.rect(ex - 1, ey, 3, 3, 0x39ffe0);
    pc.hline(ex - 1, ex + 1, ey + 1, 0x0a2a4a);
    pc.set(ex - 1, ey, 0xffffff);
  }
  // raptorial clubs: folded under the head, or the PUNCH
  const CLUB = 0xff3a8a;
  if (f === 2) {
    pc.hline(17, 21, 15, 0xd02a6a);
    pc.rect(21, 14, 3, 3, CLUB);
    pc.set(23, 14, 0xffd0e8);
  } else {
    pc.poly(
      [
        [16, 14],
        [20, 15],
        [19, 18],
        [16, 17],
      ],
      CLUB,
    );
    pc.set(19, 15 + f, 0xffd0e8);
  }
  shadeEdges(pc, B, 0x168a48);
  const out = pc.outline(0x04201a, 1, true);
  if (f === 2) {
    // impact spark in front of the club (drawn after the outline so it stays bright)
    out.set(23, 12, 0xffffff).set(22, 13, 0xffffff).set(23, 18, 0xffffff);
  }
  return out;
}

export const SHOP_DRAW = {
  pip,
  coral,
  sprout,
  ruby,
  pengu,
  jelly,
  comet,
  ronin,
  seraph,
  leviathan,
  smash,
};

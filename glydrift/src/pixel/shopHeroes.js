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

// ------------------------------------------------------------------ MILZZZ — red-eyed tree frog
// Frames: 0 / 1 sitting (throat pulses), 2 = the leap (legs flung back, eyes wide).
export function milzzz(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x39d84a;
  const TOE = 0xff8a1a;
  const leap = f === 2;
  // back leg: folded under the body, or kicked straight back on the leap
  if (leap) {
    pc.poly(
      [
        [8, 13],
        [1, 15],
        [1, 17],
        [8, 16],
      ],
      B,
    );
    pc.set(0, 14, TOE).set(0, 16, TOE).set(0, 18, TOE);
  } else {
    pc.ellipse(7, 15, 3.4, 2.6, B);
    pc.hline(4, 9, 18, B);
    pc.set(3, 18, TOE).set(4, 19, TOE).set(10, 19, TOE).set(9, 19, TOE);
  }
  // body + head
  pc.ellipse(11.5, 13, 6, 4.2, B);
  pc.circle(17, 11, 4, B);
  pc.ellipse(12.5, 16.2, 3.8, 1.1, 0xfff4c8); // cream belly
  // thin blue flank stripe with yellow bars along the lower side
  for (let x = 7; x <= 14; x++) pc.set(x, 15, x % 2 ? 0x2a6aff : 0xffe14d);
  // throat sac pulses while sitting
  if (f === 1) pc.ellipse(18.5, 14, 2, 1.4, 0xfff4c8);
  // snarl: mouth slants down toward the front, with a fang
  pc.hline(17, 19, 13, 0x0a3a12).hline(20, 21, 14, 0x0a3a12);
  pc.set(20, 15, 0xffffff);
  // spiky ridge down the back
  for (const x of [7, 10, 13]) pc.set(x, 8, B).set(x + 1, 9, B);
  // front arm with orange toe pads
  const ay = leap ? 15 : 17;
  pc.vline(18, 14, ay, B);
  pc.set(19, ay + 1, TOE)
    .set(17, ay + 1, TOE)
    .set(18, ay + 1, TOE);
  // the famous red eyes: a small far eye and the big near one, vertical black pupils
  // skin bulge over the eyes so the brow reads against green, not the outline
  pc.ellipse(16.5, 5.5, 4.2, 2.2, B);
  pc.circle(13.5, 8.5, 1.6, 0xd81a1a); // far eye
  pc.circle(17.5, 8.5, leap ? 2.9 : 2.6, 0xff2a2a);
  pc.vline(18, 8, 10, 0x0a0a0a); // thin slit pupil, glaring forward
  // heavy angry brow slanting DOWN toward the snout, chopping the top off the eye
  for (let x = 12; x <= 21; x++) {
    const y = 5 + Math.round((x - 12) * 0.25);
    pc.set(x, y, 0x0a3a12);
    if (x < 17) pc.set(x, y - 1, 0x0a3a12); // thicker over the back of the eye
  }
  // battle scar over the cheek
  pc.set(15, 10, 0xd81a1a).set(16, 11, 0xd81a1a).set(17, 12, 0xd81a1a);
  shadeEdges(pc, B, 0x1f9a34);
  return pc.outline(0x062a0a, 1, true);
}

// ------------------------------------------------------------------ MANNY — black bear, gold nose
// Frames: 0 / 1 standing (chest breathes), 2 = the leap (paws flung forward and back).
export function manny(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x2a2a38; // black fur (lifted a touch so it reads on dark skies)
  const HI = 0x4a4a60;
  const leap = f === 2;
  // legs
  if (leap) {
    pc.poly(
      [
        [6, 15],
        [0, 17],
        [1, 19],
        [7, 18],
      ],
      B,
    ); // back legs kicked out
    pc.poly(
      [
        [15, 15],
        [21, 17],
        [20, 19],
        [14, 18],
      ],
      B,
    ); // front paws reaching
    pc.set(21, 18, 0xd8d0c0).set(0, 18, 0xd8d0c0); // claws
  } else {
    pc.rect(6, 17, 3, 3, B).rect(13, 17, 3, 3, B);
    pc.set(8, 19, 0xd8d0c0).set(15, 19, 0xd8d0c0);
  }
  // body + tail stub
  pc.ellipse(10.5, 13.5, 6.5, f === 1 ? 5.2 : 4.9, B);
  pc.circle(3.6, 11.5, 1.4, B);
  pc.hline(7, 13, 10, HI); // back sheen
  // head + round ears standing clear of it
  pc.circle(16.5, 10.5, 4, B);
  for (const ex of [13, 19]) {
    pc.circle(ex, 4.6, 1.8, B);
    pc.set(ex, 5, 0x9a7262); // pink-brown inner ear
    pc.set(ex - 1, 3, HI).set(ex, 3, HI); // light catching the ear tops
  }
  for (let x = 15; x <= 17; x++) for (let y = 2; y <= 5; y++) pc.set(x, y, null); // gap
  pc.hline(15, 18, 6, HI); // crown of the head catches the light
  // tan muzzle with the famous GOLD nose (and a glint)
  pc.ellipse(20, 11.8, 2.3, 1.7, 0xc8a070);
  pc.rect(21, 10, 2, 2, 0xffd23f);
  pc.set(22, 11, 0xc8901a).set(21, 10, 0xfff6c0);
  pc.set(20, 13, 0x6a4a3a); // little mouth
  eye(pc, 16, 8, 0x1a0a00);
  shadeEdges(pc, B, 0x16161e);
  return pc.outline(0x05050a, 1, true);
}

// ------------------------------------------------------------------ WALLRUNNER — leprechaun
// Very red hair and beard, ink tattoos on the face, buckled green hat. Frames: 0 / 1 standing
// (beard bobs), 2 = the leap (legs kicked back, arm thrown forward).
export function wallrunner(f) {
  const pc = new PixelCanvas(24, 24);
  const COAT = 0x2aa83a;
  const COAT_D = 0x16702a;
  const SKIN = 0xffc8a0;
  const RED = 0xff2a10; // very red hair
  const RED_HI = 0xff7a3a;
  const INK = 0x1a2a6a; // face tattoos
  const leap = f === 2;
  // legs + buckled shoes
  if (leap) {
    pc.poly(
      [
        [8, 16],
        [2, 18],
        [2, 20],
        [9, 18],
      ],
      COAT_D,
    );
    pc.rect(0, 18, 3, 2, 0x161616).set(1, 18, 0xffd23f);
  } else {
    pc.rect(8, 18, 2, 3, COAT_D).rect(12, 18, 2, 3, COAT_D);
    pc.rect(7, 20, 3, 2, 0x161616).rect(12, 20, 3, 2, 0x161616);
    pc.set(8, 20, 0xffd23f).set(13, 20, 0xffd23f);
  }
  // coat + belt with a gold buckle
  pc.ellipse(10.5, 14.5, 5, 4, COAT);
  pc.hline(6, 15, 16, 0x161616);
  pc.rect(10, 15, 2, 2, 0xffd23f);
  // arm (thrown forward on the leap)
  if (leap) {
    pc.hline(14, 19, 13, COAT);
    pc.set(20, 13, SKIN).set(20, 12, SKIN);
  } else {
    pc.vline(14, 13, 16, COAT_D);
    pc.set(14, 17, SKIN);
  }
  // head: red hair at the back, face, big very red beard
  pc.ellipse(13, 9, 2.2, 2.6, RED); // hair behind the ear
  pc.ellipse(17, 8.5, 3, 2.6, SKIN);
  const by = f === 1 ? 12.4 : 12;
  pc.ellipse(17, by, 3.4, 2.4, RED);
  pc.set(16, Math.round(by) - 1, RED_HI).set(18, Math.round(by), RED_HI);
  pc.set(20, 8, SKIN).set(21, 9, 0xf0a080); // nose
  pc.rect(18, 7, 2, 1, 0xffffff).set(19, 7, 0x161616); // eye (white + pupil)
  pc.hline(18, 19, 6, 0xc81a08); // fiery red brow
  // face tattoos: a teardrop under the eye, cheek stripes, a forehead mark
  pc.set(19, 9, INK);
  pc.set(16, 8, INK).set(16, 9, INK);
  pc.set(17, 6, INK);
  // hat: brim, tall green crown, black band, gold buckle, a little clover
  pc.hline(12, 21, 5, COAT_D);
  pc.rect(14, 0, 6, 5, COAT);
  pc.hline(14, 19, 4, 0x161616);
  pc.rect(16, 3, 2, 2, 0xffd23f).set(16, 3, 0xfff6c0);
  pc.set(18, 1, 0x8aff7a);
  shadeEdges(pc, COAT, COAT_D);
  return pc.outline(0x08200c, 1, true);
}

// ------------------------------------------------------------------ SPRINGER — hockey player
// Orange-and-black jersey, black helmet with an orange stripe and a visor. Frames: 0 / 1
// skating strides, 2 = the slap shot (stick wound up, skates together).
export function springer(f) {
  const pc = new PixelCanvas(24, 24);
  const OR = 0xff7a1a;
  const BK = 0x161616;
  const SK = 0xffc8a0;
  const ICE = 0xd8e8f4;
  const shot = f === 2;
  // legs + skates
  const legs = shot
    ? [
        [11, 13],
        [13, 15],
      ]
    : f === 0
      ? [
          [9, 11],
          [14, 16],
        ]
      : [
          [11, 12],
          [12, 13],
        ];
  for (const [x0, x1] of legs) {
    pc.rect(x0, 18, 2, 2, BK);
    pc.rect(x0, 20, 2, 1, BK).set(x1, 20, BK);
    pc.hline(x0 - 1, x1 + 1, 21, ICE); // blade
  }
  // pants + jersey with black stripes and yoke
  pc.rect(10, 16, 7, 2, BK);
  pc.rect(10, 10, 7, 6, OR);
  pc.hline(10, 16, 10, BK).hline(10, 16, 14, BK);
  pc.set(12, 12, BK).set(13, 12, BK).set(13, 11, BK); // number "7"
  // arm, glove and the stick
  pc.rect(16, 11, 3, 2, OR).set(18, 12, BK);
  pc.rect(19, 11, 2, 2, BK); // glove
  if (shot) {
    pc.line(19, 11, 22, 4, 0x5a3a1a); // wound-up stick
    pc.hline(21, 23, 3, 0xffffff);
  } else {
    pc.line(20, 12, 21, 20, 0x5a3a1a);
    pc.hline(21, 23, 21, BK).set(22, 21, 0xffffff); // blade with tape
  }
  // head: face, black helmet with an orange stripe, visor
  pc.rect(15, 6, 4, 4, SK);
  pc.ellipse(16, 5, 3.6, 2.6, BK);
  pc.hline(13, 18, 4, OR);
  pc.hline(17, 20, 6, 0x9fe8ff).set(20, 7, 0x9fe8ff); // visor
  pc.set(18, 7, 0x161616); // eye behind the visor
  pc.rect(15, 8, 1, 2, BK); // chin strap
  shadeEdges(pc, OR, 0xd85a0a);
  return pc.outline(0x0a0604, 1, true);
}

// ------------------------------------------------------------------ DZR — matte blue velociraptor
// Flat (matte) blue scales, darker stripes, yellow eye, sickle claw. Frames: 0 / 1 running,
// 2 = the pounce (legs tucked, jaws open).
export function dzr(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x3a5a8a; // matte blue
  const D = 0x2a4068;
  const BELLY = 0x6a86b0;
  const CLAW = 0xd8d0c0;
  const pounce = f === 2;
  // tail (long, tapering to the left)
  pc.poly(
    [
      [0, 8],
      [10, 10],
      [10, 13],
      [0, 9],
    ],
    B,
  );
  // legs
  if (pounce) {
    pc.ellipse(11, 15, 2.4, 1.8, B);
    pc.hline(9, 14, 16, D);
    pc.set(14, 17, CLAW).set(9, 17, CLAW);
  } else {
    const fwd = f === 0;
    pc.ellipse(11, 14, 2.2, 2, B);
    pc.line(11, 15, fwd ? 13 : 9, 18, D).line(fwd ? 13 : 9, 18, fwd ? 14 : 10, 20, D);
    pc.hline(fwd ? 13 : 9, fwd ? 15 : 11, 20, D).set(fwd ? 15 : 11, 19, CLAW); // sickle claw
    pc.line(10, 15, fwd ? 8 : 12, 18, D).line(fwd ? 8 : 12, 18, fwd ? 7 : 12, 20, D);
    pc.hline(fwd ? 6 : 12, fwd ? 8 : 14, 20, D);
  }
  // body, belly, back stripes
  pc.ellipse(12.5, 12, 4.6, 3.2, B);
  pc.ellipse(13, 13.6, 3.4, 1.3, BELLY);
  for (const x of [9, 11, 13, 15]) pc.set(x, 9, D).set(x, 10, D);
  // little arms with claws
  pc.line(16, 13, 18, 15, D).set(19, 15, CLAW);
  // neck + head
  pc.poly(
    [
      [15, 11],
      [17, 6],
      [19, 6],
      [18, 11],
    ],
    B,
  );
  pc.ellipse(19.5, 6.5, 2.8, 2, B);
  pc.rect(20, 6, 4, 2, B); // snout
  if (pounce) {
    pc.hline(19, 23, 9, B).set(23, 8, null); // lower jaw dropped
    pc.set(21, 8, 0xffffff).set(23, 9, 0xffffff); // teeth
  } else {
    pc.hline(20, 23, 8, D); // closed jaw line
    pc.set(22, 8, 0xffffff);
  }
  pc.set(19, 5, 0xffd23f).set(20, 5, 0x161616); // yellow eye, slit pupil
  pc.hline(16, 19, 4, D); // brow ridge
  shadeEdges(pc, B, D);
  return pc.outline(0x0a1426, 1, true);
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
  milzzz,
  manny,
  wallrunner,
  springer,
  dzr,
};

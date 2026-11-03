// CHRISTMAS animals — a limited December event (shop + Drift Pass), back every year.
import { PixelCanvas } from "./px.js";
import { eye, finish, limb, lightEdges, shadeEdges, wing } from "./animalKit.js";

const RED = 0xe0303a;
const GOLD = 0xffd23f;
const BULBS = [0xff3a5a, 0x3aff7a, 0xffd23f, 0x3ab8ff, 0xff7ad9];

/** A Santa hat whose tip flops back (x, y = middle of the brim). */
function santaHat(pc, x, y, flop = 0) {
  pc.poly(
    [
      [x - 3, y],
      [x + 3, y],
      [x - 1, y - 4],
      [x - 4 - flop, y - 3 + flop],
    ],
    RED,
  );
  pc.hline(x - 3, x + 3, y, 0xffffff).hline(x - 3, x + 3, y + 1, 0xf0f0f0);
  pc.circle(x - 4 - flop, y - 3 + flop, 1, 0xffffff);
}

// ------------------------------------------------------------------ MITTENS — kitten in a scarf and mittens
export function mittens(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0xffa04a;
  const ST = 0xd8782a;
  // the scarf end streams back (whips up on the flap)
  const sy = f === 2 ? -2 : f === 1 ? 1 : 0;
  pc.poly(
    [
      [12, 11],
      [4, 9 + sy],
      [3, 12 + sy],
      [11, 13],
    ],
    RED,
  );
  for (const x of [5, 8]) pc.vline(x, 10 + sy, 11 + sy, 0xffffff);
  pc.set(3, 13 + sy, 0xffffff).set(4, 13 + sy, RED); // fringe
  limb(pc, 6, 15, 2, 17 - (f === 2 ? 3 : 0), 1, B); // tail
  pc.ellipse(11, 15, 5.2, 3.6, B); // body
  for (const x of [9, 11]) pc.vline(x, 12, 14, ST); // tabby stripes
  pc.circle(15.5, 9.5, 3.8, B); // head
  pc.poly(
    [
      [12, 7],
      [13, 3],
      [15, 6],
    ],
    B,
  ).poly(
    [
      [16, 6],
      [18, 3],
      [19, 7],
    ],
    B,
  ); // ears
  pc.set(13, 5, 0xffb0b0).set(18, 5, 0xffb0b0);
  pc.hline(14, 16, 7, ST);
  eye(pc, 16, 9, 0x1a3a1a);
  pc.set(19, 11, 0xff7a9a); // nose
  pc.set(20, 10, 0xffffff).set(20, 12, 0xffffff); // whiskers
  // scarf round the neck
  pc.hline(12, 18, 12, RED).hline(12, 18, 13, RED);
  pc.set(14, 12, 0xffffff).set(17, 13, 0xffffff);
  // green mittens, paddling
  const p = [
    [9, 19, 14, 18],
    [10, 18, 13, 19],
    [8, 17, 15, 17],
  ][f];
  pc.rect(p[0], p[1], 2, 2, 0x2ab84a).rect(p[2], p[3], 2, 2, 0x2ab84a);
  pc.set(p[0], p[1], 0xffffff).set(p[2], p[3], 0xffffff);
  shadeEdges(pc, B, 0xd8782a);
  return finish(pc, 0x3a1a06);
}

// ------------------------------------------------------------------ PENGO — penguin in a Santa hat
export function pengo(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x22223a;
  // frantic flippers: out, half, up
  const fl = [
    [8, 12, 3, 15],
    [8, 12, 3, 9],
    [8, 11, 5, 5],
  ][f];
  limb(pc, fl[0], fl[1], fl[2], fl[3], 1, B);
  limb(pc, 16, 12, 21 - (f === 2 ? 1 : 0), [15, 9, 5][f], 1, B);
  pc.ellipse(12, 14, 5.4, 6.4, B); // body
  pc.ellipse(12.8, 15.4, 3.6, 4.6, 0xfff4ec); // belly
  pc.circle(13, 7.8, 3.6, B); // head
  pc.ellipse(14, 8.5, 2.2, 2, 0xfff4ec); // face
  eye(pc, 14, 7, 0x0a0a1a);
  pc.poly(
    [
      [16, 8],
      [19, 9],
      [16, 10],
    ],
    0xffa21a,
  ); // beak
  santaHat(pc, 13, 4, f === 2 ? 1 : 0);
  pc.rect(10, 20, 2, 1, 0xffa21a).rect(14, 20, 2, 1, 0xffa21a); // feet
  lightEdges(pc, B, 0x3a3a5a);
  return finish(pc, 0x05050f);
}

// ------------------------------------------------------------------ HOLLYHOG — hedgehog with holly on its spikes
export function hollyhog(f) {
  const pc = new PixelCanvas(24, 24);
  const SP = 0x7a4a2a;
  const FACE = 0xf0d8b0;
  // spiky back (spikes ruffle up on the flap)
  const up = f === 2 ? 1 : 0;
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.95 + i * 0.1);
    const x = 11 + Math.cos(a) * 7;
    const y = 13 + Math.sin(a) * (6 + up);
    pc.line(
      11 + Math.cos(a) * 3,
      13 + Math.sin(a) * 3,
      x + Math.cos(a) * 2,
      y + Math.sin(a) * 2,
      SP,
    );
  }
  pc.ellipse(11, 13.5, 6.4, 5.2, SP); // body
  for (let y = 9; y < 18; y += 2)
    for (let x = 6 + (y % 4 === 1 ? 1 : 0); x < 16; x += 3) pc.set(x, y, 0x5a3418);
  // holly leaves + berries on the spikes
  for (const [x, y] of [
    [7, 7],
    [12, 6],
  ]) {
    pc.rect(x, y, 3, 1, 0x2a9a3a).rect(x + 1, y - 1, 1, 3, 0x2a9a3a);
  }
  pc.rect(8 + (f === 1 ? 1 : 0), 6, 2, 2, RED).set(8 + (f === 1 ? 1 : 0), 6, 0xff8a8a);
  pc.rect(13, 5, 2, 2, RED).set(13, 5, 0xff8a8a);
  pc.rect(4, 11, 2, 2, RED);
  // face
  pc.ellipse(16.5, 14, 3.4, 3, FACE);
  pc.poly(
    [
      [18, 13],
      [22, 14],
      [18, 16],
    ],
    FACE,
  );
  pc.set(22, 14, 0x1a0a0a); // nose
  eye(pc, 17, 12, 0x1a0a0a);
  pc.set(19, 15, 0xff9a9a);
  // little feet
  const k = f % 2;
  pc.rect(9 + k, 18, 2, 2, FACE).rect(14 - k, 18, 2, 2, FACE);
  return finish(pc, 0x2a1406);
}

// ------------------------------------------------------------------ FROSTFOX — arctic fox with a frosted tail
export function frostfox(f) {
  const pc = new PixelCanvas(24, 24);
  const W = 0xf4f8ff;
  // big fluffy tail with glowing frosted tip
  const ty = [0, 1, -2][f];
  limb(pc, 7, 14, 2, 9 + ty, 2.2, W);
  pc.circle(1.6, 8.5 + ty, 1.6, 0xbff4ff);
  pc.set(1, 8 + ty, 0xffffff).set(3, 10 + ty, 0x9ae8ff);
  pc.ellipse(11.5, 14, 5.4, 3.6, W); // body
  const k = f % 2;
  pc.rect(8 + k, 17, 2, 3, W).rect(13 - k, 17, 2, 3, W); // legs
  pc.circle(16, 10, 3.4, W); // head
  pc.rect(18, 11, 4, 2, W); // snout
  pc.poly(
    [
      [13, 8],
      [14, 4],
      [16, 7],
    ],
    W,
  ).poly(
    [
      [16, 7],
      [18, 3],
      [19, 8],
    ],
    W,
  ); // ears
  pc.set(14, 6, 0xffb8c8).set(18, 5, 0xffb8c8).set(14, 5, 0xffb8c8); // pink inner ears
  pc.rect(16, 9, 2, 2, 0x1a1a2a).set(16, 9, 0xffffff); // eye
  pc.set(19, 10, 0xd8e4f4); // cheek line
  pc.rect(21, 11, 2, 1, 0x1a1a2a); // nose
  shadeEdges(pc, W, 0xc8dcf4);
  return finish(pc, 0x1a3a6a);
}

// ------------------------------------------------------------------ JINGLEMOOSE — baby moose with bells on its antlers
export function jinglemoose(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x8a5a3a;
  const AN = 0xe8d0a0;
  pc.ellipse(10.5, 15, 5.6, 3.8, B); // body
  const k = f % 2;
  pc.rect(6 + k, 18, 2, 3, B).rect(13 - k, 18, 2, 3, B); // legs
  pc.set(5, 13, B).set(4, 12, B); // tail stub
  // head with a big soft muzzle
  pc.circle(15.5, 10.5, 3.4, B);
  pc.ellipse(19, 12, 2.8, 2, 0xa87a5a);
  pc.set(21, 11, 0x3a1a0a);
  eye(pc, 15, 9, 0x1a0a06);
  // little flat antlers with golden bells that swing
  pc.hline(11, 19, 6, AN).hline(12, 18, 5, AN);
  pc.set(11, 4, AN).set(13, 3, AN).set(15, 3, AN).set(17, 3, AN).set(19, 4, AN);
  pc.vline(13, 3, 4, AN).vline(17, 3, 4, AN);
  const sw = [0, 1, -1][f];
  for (const [x, y] of [
    [12 + sw, 7],
    [19 + sw, 7],
  ]) {
    pc.rect(x - 1, y, 2, 2, GOLD).set(x - 1, y, 0xfff6c0);
    pc.set(x - 1, y + 2, 0xb88a10);
  }
  pc.hline(13, 18, 13, RED); // red collar
  pc.rect(15, 14, 2, 2, GOLD); // collar bell
  shadeEdges(pc, B, 0x6a3a22);
  return finish(pc, 0x2a1206);
}

// ------------------------------------------------------------------ COCOA CUB — polar bear cub hugging a cocoa mug
export function cocoacub(f) {
  const pc = new PixelCanvas(24, 24);
  const W = 0xfaf8f0;
  const bob = f === 1 ? 1 : 0;
  pc.circle(11, 14 + bob, 5.6, W); // round body
  pc.circle(14, 8 + bob, 4, W); // head
  pc.circle(11, 4.6 + bob, 1.4, W).circle(17, 5 + bob, 1.4, W); // ears
  pc.set(11, 5 + bob, 0xd8c8c0).set(17, 5 + bob, 0xd8c8c0);
  pc.ellipse(16, 9.5 + bob, 2, 1.4, 0xece4d8); // muzzle
  pc.set(17, 9 + bob, 0x1a1a1a);
  eye(pc, 13, 7 + bob, 0x1a1a1a);
  pc.set(15, 10 + bob, 0x8a5a4a); // smile
  // the cocoa mug, hugged in both paws (steam rises on the flap)
  pc.rect(12, 12 + bob, 6, 6, RED);
  pc.rect(12, 12 + bob, 6, 1, 0x6a3a1a); // cocoa
  pc.rect(13, 11 + bob, 2, 1, 0xffffff).set(16, 11 + bob, 0xffffff); // marshmallows
  pc.vline(18, 13 + bob, 16 + bob, 0xa81a2a)
    .set(19, 14 + bob, 0xa81a2a)
    .set(19, 15 + bob, 0xa81a2a);
  pc.hline(12, 17, 15 + bob, 0xffffff); // white stripe
  if (f === 2) pc.set(14, 9, 0xffffff).set(15, 8, 0xffffff).set(14, 7, 0xffffff); // steam
  pc.ellipse(11.5, 15 + bob, 1.6, 2.4, W); // paws round the mug
  pc.set(18, 17 + bob, W).set(17, 18 + bob, W);
  pc.rect(8, 19, 2, 2, W).rect(12, 19, 2, 2, W); // feet
  shadeEdges(pc, W, 0xd8dce8);
  return finish(pc, 0x2a3a5a);
}

// ------------------------------------------------------------------ SNOWL — snowy owl with icicle feathers
export function snowl(f) {
  const pc = new PixelCanvas(24, 24);
  const W = 0xf8fbff;
  wing(pc, f === 2 ? 2 : f === 1 ? 1 : 0, 10, 12, 0xe8f0ff, 0x9ae8ff, 1.05);
  // icicle wing tips
  const tips =
    f === 2
      ? [
          [5, 19],
          [7, 20],
        ]
      : f === 1
        ? [
            [2, 9],
            [3, 11],
          ]
        : [
            [5, 4],
            [8, 3],
          ];
  for (const [x, y] of tips) pc.set(x, y, 0x9ae8ff).set(x, y + (f === 2 ? 1 : -1), 0xffffff);
  pc.ellipse(12, 14, 5, 5, W); // round body
  pc.circle(15, 8.5, 3.8, W); // head
  // flecks
  for (const [x, y] of [
    [9, 12],
    [11, 15],
    [13, 13],
    [10, 17],
    [14, 16],
  ])
    pc.set(x, y, 0x5a6a7a);
  // big yellow eyes + beak
  pc.rect(13, 7, 2, 2, GOLD).set(14, 8, 0x1a1a1a);
  pc.rect(16, 7, 2, 2, GOLD).set(17, 8, 0x1a1a1a);
  pc.set(15, 10, 0x3a3a4a);
  pc.set(11, 19, 0x6a6a7a).set(14, 19, 0x6a6a7a); // talons
  shadeEdges(pc, W, 0xd8e4f4);
  return finish(pc, 0x1a2a4a);
}

// ------------------------------------------------------------------ GLOW OTTER — otter tangled in Christmas lights
export function glowotter(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x8a5a3a;
  limb(pc, 6, 14, 1, 13 + (f === 1 ? 1 : f === 2 ? -2 : 0), 1.2, B); // tail
  pc.ellipse(11.5, 14, 6, 3.6, B); // long body
  pc.ellipse(12, 15.5, 4, 1.8, 0xc89a6a); // belly
  pc.circle(17, 11, 3.4, B); // head
  pc.ellipse(19, 12.5, 2.4, 1.6, 0xd8b88a); // muzzle
  pc.set(21, 12, 0x1a0a06); // nose
  pc.set(20, 13, 0xffffff).set(21, 14, 0xffffff); // whiskers
  eye(pc, 17, 10, 0x1a0a06);
  pc.set(15, 8, B).set(16, 8, B); // ear
  // paws paddling
  const k = f % 2;
  pc.rect(9 + k, 17, 2, 2, B).rect(14 - k, 17, 2, 2, B);
  // the tangled string of lights (bulbs change colour each frame: it blinks in game)
  pc.line(6, 11, 10, 17, 0x1a3a1a).line(10, 17, 14, 11, 0x1a3a1a).line(14, 11, 18, 15, 0x1a3a1a);
  [
    [7, 12],
    [9, 15],
    [12, 14],
    [14, 11],
    [17, 14],
  ].forEach(([x, y], i) => {
    pc.rect(x, y, 2, 2, BULBS[(i + f) % 5]).set(x, y, 0xffffff);
  });
  return finish(pc, 0x2a1206);
}

// ------------------------------------------------------------------ CAPTAIN ACORN — toy-soldier squirrel
export function captainacorn(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0xc8723a;
  // propeller tail: spins through three blade positions
  const blades = [
    [
      [1, 8],
      [9, 16],
    ],
    [
      [5, 6],
      [5, 18],
    ],
    [
      [9, 8],
      [1, 16],
    ],
  ][f];
  for (const [x, y] of blades) limb(pc, 5, 12, x, y, 1.4, 0xe8955a);
  pc.circle(5, 12, 1.4, 0x8a4a1a);
  // red soldier jacket body
  pc.ellipse(12.5, 14.5, 4.2, 4, RED);
  pc.line(10, 11, 15, 18, 0xffffff).line(15, 11, 10, 18, 0xffffff); // cross belts
  pc.set(12, 14, GOLD).set(13, 14, GOLD); // buckle
  pc.rect(10, 18, 2, 3, 0x1a1a3a).rect(14, 18, 2, 3, 0x1a1a3a); // trousers
  // head
  pc.circle(16, 9, 3, B);
  pc.ellipse(18.5, 10.2, 2, 1.4, 0xf0c89a);
  pc.set(20, 10, 0x1a0a06);
  eye(pc, 16, 8, 0x1a0a06);
  pc.set(15, 11, 0xff9a9a); // rosy cheek
  // tall black shako with a gold badge and plume
  pc.rect(14, 2, 5, 5, 0x1a1a2a);
  pc.hline(13, 19, 6, 0x2a2a3a);
  pc.rect(15, 3, 2, 2, GOLD);
  pc.vline(18, 0, 2, 0xffffff).set(18, 0, RED);
  shadeEdges(pc, RED, 0xa81a2a);
  return finish(pc, 0x1a0606);
}
captainacorn.head = { x: 4, y: -10, w: 26, h: 26 }; // hats sit on top of the shako

// ------------------------------------------------------------------ AURORA STAG — reindeer with northern-light antlers
export function aurorastag(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x9a6a4a;
  const AUR = [0x6affb8, 0x3ef4d8, 0x6ab8ff, 0xb48aff];
  pc.ellipse(10.5, 15, 5.8, 3.6, B); // body
  pc.ellipse(10.5, 16.5, 3.8, 1.6, 0xd8b898); // belly
  const k = f % 2;
  const leap = f === 2 ? 1 : 0;
  pc.line(7, 17, 6 - k - leap, 21, B).line(9, 18, 10 + k, 21, B); // legs
  pc.line(13, 17, 13 - k + leap, 21, B).line(15, 17, 16 + k + leap, 21, B);
  pc.set(4, 13, 0xfff4ec).set(4, 14, 0xfff4ec); // white tail
  limb(pc, 14, 13, 16, 10, 1.4, B); // neck
  pc.ellipse(17.5, 9.5, 2.6, 2.2, B); // head
  pc.ellipse(20, 10.5, 2, 1.4, 0xb88a6a); // muzzle
  pc.set(21, 10, 0x3a1a0a);
  eye(pc, 17, 8, 0x1a0a06);
  // antlers made of northern lights (colours ripple between frames)
  const branches = [
    [16, 7, 14, 3],
    [14, 3, 12, 2],
    [15, 5, 17, 2],
    [18, 7, 20, 3],
    [20, 3, 22, 2],
    [19, 5, 18, 1],
  ];
  branches.forEach(([x0, y0, x1, y1], i) => pc.line(x0, y0, x1, y1, AUR[(i + f) % 4]));
  pc.set(12, 2, 0xffffff).set(22, 2, 0xffffff).set(17, 2, 0xffffff);
  shadeEdges(pc, B, 0x7a4a2e);
  return finish(pc, 0x2a1408);
}
aurorastag.head = { x: 5, y: -5, w: 26, h: 26 }; // hats sit between the antlers

export const XMAS_DRAW = {
  mittens,
  pengo,
  hollyhog,
  frostfox,
  jinglemoose,
  cocoacub,
  snowl,
  glowotter,
  captainacorn,
  aurorastag,
};

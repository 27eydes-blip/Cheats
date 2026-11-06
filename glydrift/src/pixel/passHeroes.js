// DRIFT PASS+ · Season 1 heroes: ten shadowy animals, only from the paid pass track.
//
// They're drawn in finer, more detailed pixel art than the standard heroes: a 32x32 canvas
// (standard heroes are 24x24) packed at 3 texture px per art px instead of 4, so a frame is the
// same texture size as a standard hero's but has ~1.8x the pixels. Every surface is lit with a
// five-tone ramp (light from the top left), details glow, and each hero has 7 frames:
//   0-3  idle loop (tails sway, stars twinkle, flames flicker…)
//   4-5  flap (stroke, recover)
//   6    special pose (bark, slash, rune flash, fire breath…)
// Bold dark outline as usual; the white rim is added by rim() when the atlas is built.
// In play they're drawn ~10% smaller than other heroes (def.visualScale) with exactly the
// standard hitbox: pass heroes are cosmetic only.
import { PixelCanvas, shade, mix } from "./px.js";

export const PASS_ART = 32; // art px per side
export const PASS_TEX = 3; // texture px per art px (standard heroes: 4)
export const PASS_FRAMES = 7;

const OUT = 0x06030c;

// ------------------------------------------------------------------ lighting helpers
/** Five tones of a colour: highlight, light, base, shadow, deep shadow. */
const ramp = (c, hi = 0.5) => [shade(c, hi), shade(c, hi * 0.45), c, shade(c, -0.32), shade(c, -0.58)];
const L = [-0.48, -0.62, 0.62];
function level(nx, ny) {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  const d = nx * L[0] + ny * L[1] + nz * L[2];
  return d > 0.92 ? 0 : d > 0.7 ? 1 : d > 0.36 ? 2 : d > 0.04 ? 3 : 4;
}
/** A lit ellipse. `pick(x, y)` may swap the ramp per pixel (patterns, nebulae). */
function orb(pc, cx, cy, rx, ry, R, pick) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx;
      const ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny > 1.04) continue;
      const r = pick ? pick(x, y) || R : R;
      pc.set(x, y, r[level(nx * 0.95, ny * 0.95)]);
    }
  return pc;
}
/** A lit tube: a chain of shaded circles (tails, tentacles, necks). */
function tube(pc, pts, r0, r1, R, pick) {
  const segs = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) * 1.5));
    for (let k = 0; k < n; k++) segs.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  segs.push(pts[pts.length - 1]);
  segs.forEach(([x, y], i) => {
    const r = r0 + ((r1 - r0) * i) / Math.max(1, segs.length - 1);
    orb(pc, x, y, Math.max(0.6, r), Math.max(0.6, r), R, pick);
  });
  return pc;
}
/** A flat shape (wings, fins) shaded by its own edges: light top/left rim, dark bottom/right. */
function flat(pc, draw, R) {
  const t = new PixelCanvas(pc.w, pc.h);
  draw(t);
  const on = (x, y) => t.get(x, y) !== null;
  for (let y = 0; y < pc.h; y++)
    for (let x = 0; x < pc.w; x++) {
      if (!on(x, y)) continue;
      let c = R[2];
      if (!on(x, y - 1) || !on(x - 1, y)) c = R[1];
      else if (!on(x, y + 1) || !on(x + 1, y)) c = R[3];
      else if (!on(x, y + 2) || !on(x + 2, y)) c = mix(R[2], R[3], 0.5);
      pc.set(x, y, c);
    }
  return pc;
}
/** A glowing detail: bright core with a softer halo of the glow colour (art px). */
function glowDot(pc, x, y, c, big = false) {
  if (big) {
    pc.set(x - 1, y, shade(c, -0.15)).set(x + 1, y, shade(c, -0.15));
    pc.set(x, y - 1, shade(c, -0.15)).set(x, y + 1, shade(c, -0.15));
  }
  pc.set(x, y, shade(c, 0.55));
  return pc;
}
const hash = (x, y, s = 0) => {
  const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return h - Math.floor(h);
};
const done = (pc) => pc.outline(OUT, 1, true);
const idleP = (f) => (f < 4 ? f : 0);
const wave = (f, k = 1) => Math.sin(((idleP(f) / 4) * Math.PI * 2) * k);

// ------------------------------------------------------------------ 1 · VOIDCAT (rare)
// A cat with a galaxy inside it: nebula swirls and twinkling stars in a deep night body.
export function voidcat(f) {
  const pc = new PixelCanvas(32, 32);
  const BODY = ramp(0x2a1a5a, 0.4);
  const NEB1 = ramp(0x6a2ab8, 0.45);
  const NEB2 = ramp(0xc04ae0, 0.5);
  const NEB3 = ramp(0x1a4ab0, 0.45);
  const neb = (x, y) => {
    const n =
      Math.sin(x * 0.55 + y * 0.25 + 0.6) + Math.sin(y * 0.7 - x * 0.35) * 0.8 + hash(x, y) * 0.5;
    return n > 1.45 ? NEB2 : n > 0.85 ? NEB1 : n < -1.15 ? NEB3 : BODY;
  };
  const flap = f === 4 || f === 5;
  const sway = wave(f);
  // tail: a long curl behind, swaying
  tube(
    pc,
    [
      [9, 19],
      [5, 17],
      [3, 13],
      [3 + sway, 9],
      [5 + sway * 1.5, 6],
      [8 + sway, 6],
    ],
    2.2,
    1.3,
    BODY,
    neb,
  );
  // back legs + body
  const kick = f === 4 ? 2 : f === 5 ? 1 : 0;
  tube(pc, [[11, 22], [9 - kick, 26 + (kick ? 0 : 0)]], 1.8, 1.4, BODY, neb);
  orb(pc, 15, 19, 8.5, 5.6, BODY, neb);
  // front legs: tucked while gliding, stretched out on a flap (stars spill from the paws)
  if (flap) {
    tube(pc, [[19, 22], [23, 26 + (f === 4 ? 1 : 0)]], 1.7, 1.3, BODY, neb);
    tube(pc, [[16, 23], [18, 27]], 1.6, 1.2, BODY, neb);
  } else {
    tube(pc, [[19, 22], [21, 25]], 1.7, 1.3, BODY, neb);
    tube(pc, [[16, 23], [16, 26]], 1.6, 1.2, BODY, neb);
  }
  // head + ears
  orb(pc, 23, 12.5, 5.6, 5, BODY, neb);
  flat(
    pc,
    (t) =>
      t
        .poly(
          [
            [18, 10],
            [19, 2.5],
            [23, 8],
          ],
          1,
        )
        .poly(
          [
            [23.5, 8],
            [27, 3],
            [28.5, 11],
          ],
          1,
        ),
    BODY,
  );
  pc.set(20, 6, 0xc04ae0).set(26, 7, 0xc04ae0).set(20, 7, 0x8a3ad0); // inner ears
  // stars: a different set twinkles each frame
  const stars = [
    [12, 17],
    [16, 16],
    [14, 21],
    [19, 19],
    [10, 20],
    [21, 14],
    [24, 16],
    [5, 13],
    [4, 9],
    [17, 20],
    [8, 18],
    [13, 14],
  ];
  stars.forEach(([x, y], i) => {
    if (pc.get(x, y) === null) return;
    const on = (i + f) % 3 !== 0;
    pc.set(x, y, on ? 0xffffff : 0xb8c8ff);
    if (on && i % 4 === f % 4) {
      pc.set(x + 1, y, 0x9ab0ff).set(x - 1, y, 0x9ab0ff);
      pc.set(x, y - 1, 0x9ab0ff).set(x, y + 1, 0x9ab0ff);
    }
  });
  // glowing cyan eyes (wide on the special pose), pink nose, whiskers
  const wide = f === 6;
  for (const ex of [21, 25]) {
    pc.rect(ex, 11, 2, wide ? 3 : 2, 0x3ae8ff);
    pc.set(ex, 11, 0xe8ffff);
    pc.set(ex + 1, 12, 0x0a2a5a);
  }
  pc.set(27, 14, 0xff8ad8);
  pc.set(29, 13, 0x9ab0ff).set(29, 15, 0x9ab0ff);
  // paw pads glow while flapping
  if (flap) glowDot(pc, 23, 27, 0xb8c8ff).set(18, 28, 0xe8f0ff);
  return done(pc);
}
voidcat.frames = PASS_FRAMES;

// ------------------------------------------------------------------ 5 · HEXOWL (rare)
// A charcoal owl with red rune eyes; the runes on its wings flash on near-misses.
export function hexowl(f) {
  const pc = new PixelCanvas(32, 32);
  const FEA = ramp(0x3a3450, 0.4);
  const DISC = ramp(0x6a6080, 0.4);
  const WING = ramp(0x2a2440, 0.35);
  const lit = f === 6;
  // ear tufts
  flat(
    pc,
    (t) =>
      t
        .poly(
          [
            [13, 8],
            [12, 1.5],
            [17, 6],
          ],
          1,
        )
        .poly(
          [
            [22, 6],
            [27, 1.5],
            [26, 9],
          ],
          1,
        ),
    FEA,
  );
  // body: a soft egg
  orb(pc, 18, 17.5, 8.5, 10, FEA, (x, y) =>
    y > 16 && (x + y) % 4 === 0 && hash(x, y) > 0.4 ? DISC : null,
  );
  // chest feather chevrons
  for (const [x, y] of [
    [16, 20],
    [20, 20],
    [18, 23],
    [15, 25],
    [21, 25],
  ])
    pc.set(x, y, 0x8a80a0).set(x + 1, y + 1, 0x8a80a0).set(x - 1, y + 1, 0x8a80a0);
  // facial disc
  orb(pc, 18.5, 11, 7, 5.2, DISC);
  // the wing (folded, raised on the stroke, swept down after)
  const wingPts =
    f === 4
      ? [
          [11, 14],
          [2, 3],
          [5, 10],
          [1, 12],
          [6, 16],
          [12, 20],
        ]
      : f === 5
        ? [
            [11, 14],
            [3, 26],
            [6, 22],
            [3, 29],
            [10, 25],
            [14, 21],
          ]
        : [
            [11, 12],
            [8, 18],
            [9, 25],
            [13, 28],
            [15, 22],
            [14, 14],
          ];
  flat(pc, (t) => t.poly(wingPts, 1), WING);
  // wing feather tips
  const [, tip] = wingPts;
  pc.set(tip[0], tip[1], 0x8a80a0);
  // wing runes (dim, or blazing on the special pose)
  const runeC = lit ? 0xff5a6a : 0x7a1a2a;
  const cx = (wingPts[0][0] + wingPts[3][0] + wingPts[4][0]) / 3;
  const cy = (wingPts[0][1] + wingPts[3][1] + wingPts[4][1]) / 3;
  for (const [dx, dy] of [
    [0, -2],
    [-1, -1],
    [1, -1],
    [0, 0],
    [0, 1],
    [-1, 2],
    [1, 2],
  ])
    if (pc.get(Math.round(cx + dx), Math.round(cy + dy)) !== null)
      pc.set(Math.round(cx + dx), Math.round(cy + dy), runeC);
  if (lit) glowDot(pc, Math.round(cx), Math.round(cy), 0xff3a4a);
  // chest rune
  pc.set(18, 18, runeC).set(17, 19, runeC).set(19, 19, runeC).set(18, 20, lit ? 0xffc0c8 : runeC);
  // rune eyes: black ring, red rune, white glint (the rune turns each idle frame)
  for (const ex of [15.5, 21.5]) {
    orb(pc, ex, 11, 2.7, 2.7, [0x1a1020, 0x120a16, 0x0a050c, 0x0a050c, 0x0a050c]);
    const x = Math.round(ex - 0.5);
    const runes = [
      [
        [0, -1],
        [-1, 1],
        [1, 1],
      ],
      [
        [-1, -1],
        [1, -1],
        [0, 1],
      ],
      [
        [-1, 0],
        [1, 0],
        [0, -1],
      ],
      [
        [-1, 0],
        [1, 0],
        [0, 1],
      ],
    ][idleP(f)];
    pc.set(x, 10, lit ? 0xffffff : 0xff3a4a);
    for (const [dx, dy] of runes) pc.set(x + dx, 10 + dy, lit ? 0xff8a9a : 0xd01a2e);
  }
  // beak + talons
  pc.rect(18, 13, 2, 2, 0xd0a050).set(18, 13, 0xffe0a0).set(19, 15, 0x8a6020);
  for (const tx of [15, 20]) pc.rect(tx, 27, 2, 1, 0xd0a050).set(tx, 28, 0x8a6020).set(tx + 2, 28, 0x8a6020);
  return done(pc);
}
hexowl.frames = PASS_FRAMES;

// ------------------------------------------------------------------ 10 · WRAITH MOTH (rare)
// A pale moth with torn, glowing ghost wings; it sheds ash and embers.
export function wraithmoth(f) {
  const pc = new PixelCanvas(32, 32);
  const BODY = ramp(0xb8b0c8, 0.45);
  const DARK = ramp(0x5a5470, 0.35);
  const WING = ramp(0x2a6a78, 0.5);
  const WING2 = ramp(0x1e4a5a, 0.45);
  const p = idleP(f);
  // wing poses: idle flutters gently, the flap is a big stroke
  const up = f === 4 ? -6 : f === 5 ? 5 : [0, -1, 0, 1][p];
  const upper = [
    [16, 13],
    [10, 1 + up],
    [3, 1 + up],
    [1, 6 + up * 0.6],
    [7, 12],
  ];
  const lower = [
    [15, 16],
    [8, 27 - up * 0.4],
    [3, 25 - up * 0.3],
    [5, 19],
  ];
  flat(pc, (t) => t.poly(lower, 1), WING2);
  flat(pc, (t) => t.poly(upper, 1), WING);
  // glowing veins
  pc.line(16, 13, upper[1][0], upper[1][1] + 1, 0x7affe0);
  pc.line(15, 13, upper[3][0] + 1, upper[3][1], 0x4ad8c0);
  pc.line(15, 16, lower[1][0] + 1, lower[1][1] - 1, 0x4ad8c0);
  // tears and holes (the same rips every frame so the wings don't shimmer)
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 15; x++) {
      const c = pc.get(x, y);
      if (c === null) continue;
      const edge = pc.get(x - 1, y) === null || pc.get(x, y - 1) === null || pc.get(x, y + 1) === null;
      const h = hash(x, Math.round(y - (y < 15 ? up : -up * 0.4)), 3);
      if ((edge && h > 0.72) || (!edge && h > 0.94)) pc.set(x, y, null);
      else if (edge && h > 0.45) pc.set(x, y, 0x9affea); // glowing torn edge
    }
  // eye spots on the wings
  glowDot(pc, 8, 6 + Math.round(up * 0.7), 0xd0fff4, true);
  // abdomen (segmented), thorax, head
  orb(pc, 11.5, 17, 6, 3.4, BODY, (x) => (x % 3 === 0 ? DARK : null));
  orb(pc, 17.5, 15, 3.6, 3.6, BODY);
  for (let x = 15; x <= 20; x++) if (hash(x, 1) > 0.5) pc.set(x, 12, 0xe8e0f0); // fuzz
  orb(pc, 21.5, 13.5, 2.6, 2.6, BODY);
  pc.set(22, 13, 0xaaffee).set(23, 13, 0x5af0d0).set(23, 14, 0x2a8a7a); // glowing eye
  // feathery antennae
  const aw = [0, 1, 0, -1][p];
  pc.line(22, 11, 26, 5 + aw, 0xb8b0c8).line(21, 11, 23, 4 + aw, 0x8a84a0);
  for (let i = 0; i < 3; i++) pc.set(24 + i, 9 - i * 2 + aw, 0xd8d0e8).set(23 + i, 6 - i + aw, 0xd8d0e8);
  // legs
  pc.line(17, 18, 19, 21, 0x5a5470).line(19, 18, 22, 20, 0x5a5470);
  // embers at the abdomen tip
  glowDot(pc, 5, 17 + (p % 2), 0xff8a2a);
  if (f === 6) glowDot(pc, 7, 20, 0xffc04a);
  return done(pc);
}
wraithmoth.frames = PASS_FRAMES;

// ------------------------------------------------------------------ 15 · TRIPHOUND (epic)
// A three-headed shadow puppy; on each flap the next head barks.
export function triphound(f) {
  const pc = new PixelCanvas(32, 32);
  const FUR = ramp(0x2e2640, 0.4);
  const FUR2 = ramp(0x403456, 0.4);
  const HEAD = ramp(0x6e5c92, 0.45);
  const HEAD2 = ramp(0x5e4e80, 0.45);
  const p = idleP(f);
  // smoky tail, wagging
  const wag = [0, 2, 0, -2][p];
  tube(
    pc,
    [
      [7, 20],
      [3, 17 - wag * 0.5],
      [2, 12 - wag],
    ],
    1.8,
    1,
    FUR,
  );
  pc.set(2, 10 - wag, 0x6a5a8a).set(1, 11 - wag, 0x5a4a7a);
  // body + legs (paddling)
  const lp = f >= 4 ? 1 : p % 2;
  tube(pc, [[9, 22], [7 + lp, 27]], 1.6, 1.3, FUR);
  tube(pc, [[17, 22], [19 - lp, 27]], 1.6, 1.3, FUR);
  orb(pc, 13, 19.5, 7.5, 5, FUR);
  tube(pc, [[11, 23], [11 - lp, 27]], 1.5, 1.2, FUR2);
  tube(pc, [[19, 23], [21 + lp, 27]], 1.5, 1.2, FUR2);
  // smoke wisps under the belly
  for (const [x, y] of [
    [8, 25],
    [12, 25],
    [15, 25],
  ])
    if (hash(x, y, p) > 0.3) pc.set(x, y + (p % 2), 0x6a5a8a);
  // the three heads: back (top), middle, front. bark = which head has its mouth open
  const bark = f === 4 ? 0 : f === 5 ? 1 : f === 6 ? 2 : -1;
  const heads = [
    { x: 15, y: 6.5, R: HEAD },
    { x: 21, y: 11.5, R: HEAD2 },
    { x: 25.5, y: 17.5, R: HEAD },
  ];
  heads.forEach((h, i) => {
    const open = bark === i;
    const hx = h.x + (open ? 0.5 : 0);
    const hy = h.y - (open ? 1 : 0);
    tube(pc, [[13 + i * 2, 17], [hx - 1, hy + 1]], 2.2, 2, FUR2); // neck
    orb(pc, hx, hy, 4.4, 4, [OUT, OUT, OUT, OUT, OUT]); // a dark ring keeps the heads apart
    orb(pc, hx, hy, 3.6, 3.2, h.R);
    // floppy ear
    flat(
      pc,
      (t) =>
        t.poly(
          [
            [hx - 3, hy - 2],
            [hx - 1, hy - 4],
            [hx, hy - 1],
            [hx - 3, hy + 2],
          ],
          1,
        ),
      FUR,
    );
    // snout
    orb(pc, hx + 3, hy + 0.8, 2.2, 1.6, h.R);
    pc.set(Math.round(hx + 5), Math.round(hy), 0x0a0610); // nose
    // red eye
    pc.set(Math.round(hx + 1), Math.round(hy - 1), 0xff3a4a).set(Math.round(hx + 1), Math.round(hy - 2), 0xffb0b8);
    if (open) {
      // mouth open: red mouth + a little fang
      const mx = Math.round(hx + 2);
      const my = Math.round(hy + 2);
      pc.rect(mx, my, 3, 2, 0xd02040).set(mx + 2, my + 1, 0x7a0a1a).set(mx, my, 0xffffff);
    } else {
      pc.set(Math.round(hx + 3), Math.round(hy + 2), 0x1a1020);
    }
  });
  // spiked collar
  for (const x of [16, 18, 20]) pc.set(x, 16, 0xd02040).set(x, 15, 0xff6a7a);
  return done(pc);
}
triphound.frames = PASS_FRAMES;

// ------------------------------------------------------------------ 20 · PHANTOM RAY (epic)
// A manta of shadow and smoke seen from above; it ripples instead of flapping.
export function phantomray(f) {
  const pc = new PixelCanvas(32, 32);
  const BODY = ramp(0x2a2838, 0.45);
  const WING = ramp(0x342e4a, 0.45);
  const SMOKE = 0x8a86a0;
  // ripple phase: idle = slow wave, flap frames = a big ripple running down the wings
  const ph = f === 4 ? 0.25 : f === 5 ? 0.75 : idleP(f) / 4;
  const amp = f === 4 || f === 5 ? 3.4 : 1.6;
  const w = (x) => Math.sin((ph + (24 - x) / 18) * Math.PI * 2) * amp;
  // wings: outline points along the leading and trailing edges, each bent by the wave
  const top = [];
  const bot = [];
  for (let x = 25; x >= 7; x -= 2) {
    const s = Math.sin(((25 - x) / 18) * Math.PI); // span profile (widest mid-wing)
    const span = 3 + s * 12;
    top.push([x, 16 - span + w(x)]);
    bot.push([x, 16 + span - w(x)]);
  }
  flat(pc, (t) => t.poly([...top, ...bot.reverse()], 1), WING);
  // smoky trailing edge: dithered pale wisps
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++)
      if (pc.get(x, y) !== null && pc.get(x - 1, y) === null && hash(x, y, ph * 4) > 0.45)
        pc.set(x, y, SMOKE);
  // tail: a thin whip with a wave
  for (let x = 1; x <= 8; x++) pc.set(x, Math.round(16 + Math.sin(ph * 6.28 + x * 0.6) * 1.2), 0x4a4460);
  // body + cephalic fins
  for (let y = 0; y < 32; y++)
    for (let x = 8; x < 26; x++)
      if (pc.get(x, y) !== null && hash(x, y, 7) > 0.88) pc.set(x, y, 0x4a3a6a); // violet mottling
  orb(pc, 19, 16, 6, 3.2, ramp(0x1e1c2a, 0.35));
  pc.hline(15, 22, 16, 0x3a2a5a);
  flat(
    pc,
    (t) =>
      t
        .poly(
          [
            [24, 13],
            [28, 11],
            [27, 14],
          ],
          1,
        )
        .poly(
          [
            [24, 19],
            [28, 21],
            [27, 18],
          ],
          1,
        ),
    BODY,
  );
  // glowing violet marks along the spine and wing roots
  for (const [x, y] of [
    [14, 16],
    [17, 16],
    [20, 16],
  ])
    pc.set(x, y, 0x9a6aff);
  glowDot(pc, 12, Math.round(12 + w(12) * 0.5), 0xb48aff);
  glowDot(pc, 12, Math.round(20 - w(12) * 0.5), 0xb48aff);
  // eyes
  glowDot(pc, 24, 14, 0xd0a0ff).set(24, 18, 0xe8d0ff).set(23, 18, 0x9a6aff);
  return done(pc);
}
phantomray.frames = PASS_FRAMES;

// ------------------------------------------------------------------ 25 · SCORPYRE (epic)
// An obsidian scorpion with magma cracks and a flaming stinger.
export function scorpyre(f) {
  const pc = new PixelCanvas(32, 32);
  const OBS = ramp(0x1e1830, 0.55);
  const p = idleP(f);
  const strike = f === 4 ? 2 : f === 5 ? 1 : 0;
  // legs
  for (let i = 0; i < 4; i++) {
    const x = 10 + i * 3;
    const k = (i + p) % 2;
    pc.line(x, 21, x - 2 + k, 26, 0x2a2440).line(x - 2 + k, 26, x - 3 + k, 27, 0x4a4060);
  }
  // body segments
  for (let i = 0; i < 4; i++) orb(pc, 9 + i * 3.6, 20 - i * 0.3, 3.2, 2.8, OBS);
  // tail arching over the back to the stinger
  const tail = [
    [7, 19],
    [4, 15],
    [4, 10],
    [7, 6 + strike],
    [12, 4 + strike],
    [16 + strike, 6 + strike],
  ];
  tail.forEach(([x, y], i) => orb(pc, x, y, 2.3 - i * 0.15, 2.3 - i * 0.15, OBS));
  // claws
  tube(pc, [[21, 19], [25, 17]], 1.6, 1.4, OBS);
  orb(pc, 27, 16, 2.6, 2, OBS);
  pc.set(29, 14, OBS[1]).set(30, 15, OBS[2]).set(29, 18, OBS[3]).set(30, 17, OBS[2]);
  tube(pc, [[21, 21], [24, 24]], 1.4, 1.2, OBS);
  orb(pc, 26, 24.5, 2.2, 1.7, OBS);
  // magma cracks
  const crack = 0xff6a1a;
  for (const [x, y] of [
    [8, 20],
    [9, 19],
    [12, 21],
    [13, 20],
    [16, 19],
    [5, 13],
    [6, 8],
    [11, 5 + strike],
    [27, 15],
  ])
    pc.set(x, y, hash(x, y, p) > 0.5 ? crack : 0xffb04a);
  // eyes
  pc.set(21, 17, 0xffd04a).set(22, 17, 0xff6a1a);
  // the flaming stinger
  const sx = 17 + strike;
  const sy = 7 + strike;
  pc.set(sx, sy, 0xffe0a0).set(sx + 1, sy + 1, 0xffb04a);
  const flame = [
    [0, -1],
    [0, -2],
    [1, -2],
    [-1, -3],
    [0, -3],
    [1, -4],
    [0, -5],
  ];
  flame.forEach(([dx, dy], i) => {
    const wob = Math.round(Math.sin(p * 1.6 + i) * 0.7);
    if (i > 4 + (p % 2)) return;
    pc.set(sx + dx + wob, sy + dy, i < 2 ? 0xffe8a0 : i < 4 ? 0xffa02a : 0xff4a1a);
  });
  return done(pc);
}
scorpyre.frames = PASS_FRAMES;

// ------------------------------------------------------------------ 30 · KRAKKIE (epic)
// A baby shadow kraken: big eyes, glowing suckers, tentacles swirling behind.
export function krakkie(f) {
  const pc = new PixelCanvas(32, 32);
  const SKIN = ramp(0x3a1a5a, 0.45);
  const SKIN2 = ramp(0x2a1446, 0.4);
  const p = idleP(f);
  const bunch = f === 4 ? 0.45 : f === 5 ? 0.75 : 1; // tentacles pull in for the jet stroke
  // tentacles: five curls trailing left, each waving on its own phase
  const suckers = [];
  for (let i = 0; i < 5; i++) {
    const y0 = 14 + i * 1.8;
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      const x = 13 - t * 12 * bunch;
      const y = y0 + (i - 2) * t * 4 * bunch + Math.sin(p * 1.57 + i * 1.3 + t * 4) * 2 * t;
      pts.push([x, y]);
    }
    // curl the tip
    const [lx, ly] = pts[pts.length - 1];
    pts.push([lx - 1, ly + (i % 2 ? 2 : -2)]);
    tube(pc, pts, 1.9, 0.7, i % 2 ? SKIN : SKIN2);
    suckers.push(pts[2], pts[4]);
  }
  for (const [x, y] of suckers) glowDot(pc, Math.round(x), Math.round(y + 1), 0x4affd8);
  // mantle (head)
  orb(pc, 19, 13, 8, 8.5 - (f === 4 ? 1 : 0), SKIN, (x, y) => (hash(x, y) > 0.86 ? SKIN2 : null));
  // spots on the mantle
  for (const [x, y] of [
    [15, 7],
    [19, 6],
    [14, 11],
  ])
    pc.set(x, y, 0x6a3a9a);
  // big cute eyes
  for (const ex of [20, 25]) {
    orb(pc, ex, 14.5, 2.3, 2.6, [0xffffff, 0xf4f4ff, 0xe0e0f4, 0xb8b8d8, 0x9090b8]);
    pc.rect(ex - 1, 14, 2, 3, 0x0a0618); // big round pupil with a glint
    pc.set(ex - 1, 14, 0xffffff).set(ex, 16, 0x2a1a4a);
  }
  pc.set(22, 18, 0x1a0a2a).set(23, 19, 0x1a0a2a); // little smile
  glowDot(pc, 26, 9, 0x4affd8); // a sucker-light on its brow
  return done(pc);
}
krakkie.frames = PASS_FRAMES;

// ------------------------------------------------------------------ 35 · CRIMSON MANTIS (epic)
// A crimson praying mantis with gold eyes; it slashes the air on near-misses.
export function crimsonmantis(f) {
  const pc = new PixelCanvas(32, 32);
  const RED = ramp(0xb0182a, 0.5);
  const RED2 = ramp(0x7a0e1e, 0.45);
  const WING = ramp(0x5a1020, 0.4);
  const p = idleP(f);
  const slash = f === 6;
  // wings over the abdomen (open on the flap)
  const wa = f === 4 ? -7 : f === 5 ? -3 : 0;
  flat(
    pc,
    (t) =>
      t.poly(
        [
          [16, 15],
          [3, 13 + wa],
          [2, 17 + wa * 0.6],
          [12, 19],
        ],
        1,
      ),
    WING,
  );
  for (let x = 5; x < 14; x += 3) pc.set(x, Math.round(16 + wa * 0.5 * ((14 - x) / 9)), 0xd84a5a);
  // abdomen + legs
  orb(pc, 10, 19.5, 7, 3.2, RED2, (x) => (x % 3 === 1 ? RED : null));
  pc.line(14, 21, 12, 27, 0x7a0e1e).line(12, 27, 10, 28, 0x7a0e1e);
  pc.line(16, 21, 18 - (p % 2), 27, 0x7a0e1e).line(18 - (p % 2), 27, 20, 28, 0x7a0e1e);
  // thorax rising to the head
  tube(pc, [[15, 18], [19, 12]], 2, 1.6, RED);
  // head: a triangle with big gold eyes
  flat(
    pc,
    (t) =>
      t.poly(
        [
          [18, 9],
          [26, 8],
          [22, 14],
        ],
        1,
      ),
    RED,
  );
  orb(pc, 19.5, 9, 1.8, 1.8, [0xfff0a0, 0xffd84a, 0xffb020, 0xc07010, 0x804008]);
  orb(pc, 25, 8.5, 1.6, 1.6, [0xfff0a0, 0xffd84a, 0xffb020, 0xc07010, 0x804008]);
  pc.set(19, 9, 0x1a0a00).set(25, 8, 0x1a0a00);
  // antennae
  const aw = [0, 1, 0, -1][p];
  pc.line(21, 8, 24, 2 + aw, 0xd8304a).line(22, 8, 28, 4 + aw, 0xd8304a);
  // raptorial arms: folded in prayer, or flung out in a slash
  if (slash) {
    tube(pc, [[19, 13], [24, 13], [30, 11]], 1.4, 1.1, RED);
    for (let i = 0; i < 4; i++) pc.set(26 + i, 12 - Math.floor(i / 2), 0xffc0c8);
    tube(pc, [[19, 15], [25, 18], [30, 20]], 1.3, 1, RED2);
    pc.set(29, 21, 0xffc0c8).set(30, 21, 0xffffff);
  } else {
    const k = f === 4 ? 1 : 0;
    tube(pc, [[19, 13], [24, 15 + k], [23, 20 + k]], 1.4, 1.1, RED);
    pc.set(24, 18 + k, 0xffc0c8).set(24, 19 + k, 0xffc0c8).set(23, 21 + k, 0xffffff);
  }
  return done(pc);
}
crimsonmantis.frames = PASS_FRAMES;

// ------------------------------------------------------------------ 40 · GLOOMELEON (legendary)
// A chameleon whose skin takes on each realm's colour (a tinted overlay at runtime: these
// frames carry the fixed parts, gloomeleon.skin(f) the recolourable skin).
const GLOOM_SKIN = ramp(0x3aa86a, 0.5);
function gloomBody(pc, f, skinOnly) {
  const p = idleP(f);
  const SK = skinOnly ? ramp(0xffffff, 0) : GLOOM_SKIN;
  const R2 = skinOnly ? ramp(0xc0c0c0, 0.25) : ramp(0x2a6a4a, 0.45);
  const kick = f === 4 ? 1 : 0;
  // spiral tail
  const tail = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2.2 + 0.4;
    const r = 5.5 - i * 0.28;
    tail.push([7 - Math.cos(a) * r * 0.9, 22 + Math.sin(a) * r * 0.8 + (i < 3 ? -1 : 0)]);
  }
  tail.unshift([11, 19]);
  tube(pc, tail, 2, 0.8, R2);
  // legs (gripping pose)
  tube(pc, [[11, 21], [9 - kick, 26]], 1.4, 1.2, R2);
  tube(pc, [[19, 21], [21 + kick, 26]], 1.4, 1.2, R2);
  // body with a striped pattern
  orb(pc, 15, 17, 8, 5.4, SK, (x) => (x % 4 === 0 ? R2 : null));
  // spiky crest along the back
  for (let x = 9; x <= 20; x += 2) pc.set(x, 11 + Math.round(Math.abs(x - 15) * 0.15), SK[1]);
  // head with a casque
  orb(pc, 23, 13.5, 5, 4.2, SK);
  flat(
    pc,
    (t) =>
      t.poly(
        [
          [19, 11],
          [21, 6.5 - (p % 2) * 0.5],
          [25, 10],
        ],
        1,
      ),
    SK,
  );
  tube(pc, [[17, 22], [17, 26]], 1.3, 1.1, R2);
}
export function gloomeleon(f) {
  const pc = new PixelCanvas(32, 32);
  gloomBody(pc, f, false);
  // the turret eye: a cone with a pupil that roams each frame (fixed colours, stays readable)
  const p = idleP(f);
  orb(pc, 24, 13, 2.8, 2.8, ramp(0x3a3a50, 0.3));
  const [dx, dy] = f === 6 ? [1, -1] : [
    [1, 0],
    [0, -1],
    [-1, 0],
    [0, 1],
  ][p];
  pc.rect(24, 12, 2, 2, 0xffffff);
  pc.set(24 + Math.max(0, dx), 12 + Math.max(0, dy), 0x0a0a14);
  // mouth line + curled tongue tip on the special pose
  pc.line(26, 15, 28, 15, 0x3a3a50);
  if (f === 6) pc.line(28, 15, 31, 14, 0xff5a8a).set(31, 13, 0xff8ab0);
  return done(pc);
}
gloomeleon.frames = PASS_FRAMES;
/** The recolourable skin layer (white tones, tinted to the realm at runtime). */
gloomeleon.skin = (f) => {
  const pc = new PixelCanvas(32, 32);
  gloomBody(pc, f, true);
  // only where the finished sprite shows skin: the eye, mouth and tongue stay uncovered
  const base = gloomeleon(f);
  const skinCols = new Set([...GLOOM_SKIN, ...ramp(0x2a6a4a, 0.45)]);
  for (let i = 0; i < pc.d.length; i++) if (!skinCols.has(base.d[i])) pc.d[i] = null;
  return pc;
};

// ------------------------------------------------------------------ 50 · UMBRA DRAKE (legendary)
// A baby shadow dragon with a crimson flame heart; breathes dark fire on a new best.
export function umbradrake(f) {
  const pc = new PixelCanvas(32, 32);
  const SCALE = ramp(0x2a1a3e, 0.45);
  const BELLY = ramp(0x5a3050, 0.4);
  const MEM = ramp(0x3a1430, 0.4);
  const p = idleP(f);
  const breathe = f === 6;
  // tail with a spade tip
  tube(
    pc,
    [
      [9, 21],
      [5, 23],
      [2, 22 + wave(f) * 1.2],
    ],
    2,
    1,
    SCALE,
  );
  flat(
    pc,
    (t) =>
      t.poly(
        [
          [2, 19 + wave(f)],
          [0, 23 + wave(f)],
          [3, 25 + wave(f)],
        ],
        1,
      ),
    SCALE,
  );
  // far wing (behind), near wing poses
  const wp =
    f === 4
      ? [
          [13, 15],
          [5, 26],
          [9, 24],
          [10, 29],
          [14, 25],
          [17, 18],
        ]
      : f === 5
        ? [
            [13, 14],
            [1, 12],
            [5, 15],
            [3, 18],
            [10, 18],
            [17, 16],
          ]
        : [
            [13, 13],
            [6, 2 + (p % 2)],
            [9, 7],
            [10, 2 + (p % 2)],
            [13, 7],
            [17, 13],
          ];
  // legs + body
  tube(pc, [[11, 22], [10, 26]], 1.6, 1.4, SCALE);
  orb(pc, 15, 18.5, 7.2, 5.4, SCALE, (x, y) => (y > 19 && x > 10 && x < 20 ? BELLY : null));
  for (let x = 11; x <= 19; x += 2) pc.set(x, 22, BELLY[3]); // belly plates
  tube(pc, [[18, 22], [19, 26]], 1.6, 1.4, SCALE);
  pc.set(10, 27, 0xd8c0d0).set(19, 27, 0xd8c0d0); // claws
  // neck + head
  tube(pc, [[19, 16], [22, 12.5]], 2.8, 2.5, SCALE);
  orb(pc, 23.5, 11.5, 4.2, 3.6, SCALE);
  orb(pc, 27, 12.5 + (breathe ? -0.5 : 0), 2.6, 2, SCALE); // snout
  if (breathe) {
    // jaw drops open: a dark-fire glow inside
    pc.rect(26, 14, 4, 2, 0x5a0a2a).set(29, 14, 0xff3a6a).set(28, 15, 0xff7a9a);
    tube(pc, [[24, 15], [28, 17]], 1, 0.8, SCALE);
  }
  pc.set(29, 11, 0x0a0410); // nostril
  // horns
  flat(
    pc,
    (t) =>
      t
        .poly(
          [
            [20, 9],
            [17, 3],
            [22, 8],
          ],
          1,
        )
        .poly(
          [
            [22, 8],
            [21, 3],
            [24, 8],
          ],
          1,
        ),
    ramp(0x8a7a9a, 0.45),
  );
  // back spines
  for (const [x, y] of [
    [12, 12],
    [15, 12],
    [18, 12],
  ])
    pc.set(x, y, 0x6a3a7a);
  // crimson eye
  pc.rect(23, 10, 2, 2, 0xff2a4a).set(23, 10, 0xffc0c8).set(24, 11, 0x8a0a1a);
  // the near wing with crimson veins (drawn over the body)
  flat(pc, (t) => t.poly(wp, 1), MEM);
  pc.line(wp[0][0], wp[0][1], wp[1][0], wp[1][1], 0x9a1a3a);
  pc.line(wp[0][0], wp[0][1], wp[3][0], wp[3][1], 0x9a1a3a);
  pc.set(wp[1][0], wp[1][1], 0xff4a6a); // ember at the wing tip
  // the flame heart: glows through the chest, beating with the idle loop
  const beat = p % 2 === 0 || breathe;
  pc.rect(16, 18, 3, 3, 0xc0102a);
  pc.set(17, 19, beat ? 0xffd0d8 : 0xff5a7a);
  if (beat) pc.set(16, 19, 0xff3a5a).set(18, 19, 0xff3a5a).set(17, 18, 0xff3a5a).set(17, 20, 0xff3a5a);
  return done(pc);
}
umbradrake.frames = PASS_FRAMES;


// ------------------------------------------------------------------ RIFTLING (evolving)
// Season 1's evolving Drift Pass+ hero: a one-eyed rift imp with bat wings and a crystal tail.
// It grows up through the paid track — base form (tier 1), ARMORED (15: crimson plate with gold
// rivets), AWAKENED (30: the armor's runes and its eye burn with abyss light) and the legendary
// RIFT SOVEREIGN (50: a gold horn-crown, great flame-edged wings, a cape of night). The
// sovereign has its own idle (crown gems twinkle in turn, wing tips flicker like flame) and
// its own flap (wings thrown wide with blazing edges).
function riftlingArt(f, stage) {
  const pc = new PixelCanvas(32, 32);
  const sov = stage >= 3;
  const BODY = ramp(sov ? 0x241040 : 0x3a1a6a, 0.42);
  const BELLY = ramp(sov ? 0x4a2a7a : 0x6a3aa8, 0.45);
  const WING = ramp(sov ? 0x1a0a30 : 0x2a1450, 0.4);
  const ARMOR = ramp(0xc8102e, 0.45);
  const GOLD = 0xffd23f;
  const EYE = stage >= 2 ? 0xff5a3a : 0x3ef4ff;
  const flap = f === 4 || f === 5;
  const sway = wave(f);
  // ---- tail: a curl behind with a rift crystal on the tip
  const tip = [3 + sway, 20 - sway];
  tube(pc, [[10, 20], [6, 22], [4, 24 + sway * 0.5], tip], 1.6, 0.8, BODY);
  pc.set(Math.round(tip[0]) - 1, Math.round(tip[1]) - 1, 0x9af4ff).set(Math.round(tip[0]), Math.round(tip[1]) - 2, 0xe8ffff);
  pc.set(Math.round(tip[0]) - 2, Math.round(tip[1]), 0x3ec8ff);
  // ---- wings (behind the body). Gliding: folded and swaying; flap: down (4) / up (5).
  // The sovereign's are bigger, and on a flap they're thrown wide with blazing edges.
  const span = sov ? 1.35 : 1;
  const wingPts =
    f === 4
      ? [[13, 15], [4, 21 * 1], [2, 26], [7, 24], [10, 27], [14, 21]]
      : f === 5
        ? [[13, 15], [3, 4], [1, 9], [6, 9], [7, 13], [14, 17]]
        : [[13, 15], [5, 9 + sway], [3, 13 + sway], [7, 14], [8, 17], [14, 18]];
  const wp = wingPts.map(([x, y]) => [13 + (x - 13) * span, 15 + (y - 15) * span]);
  flat(pc, (t) => t.poly(wp, 1), WING);
  // wing membrane veins
  pc.line(Math.round(wp[0][0]), Math.round(wp[0][1]), Math.round(wp[1][0]), Math.round(wp[1][1]), WING[0]);
  if (sov) {
    // blazing edge on the wing tips: on a flap all along the edge; while gliding it flickers
    const edge = [wp[1], wp[2], wp[3]];
    edge.forEach(([x, y], i) => {
      const on = flap || (i + idleP(f)) % 3 !== 0;
      if (!on) return;
      pc.set(Math.round(x), Math.round(y), i === 1 ? 0xfff0a0 : GOLD);
      pc.set(Math.round(x) + 1, Math.round(y), 0xff8a1a);
    });
    // a cape of night behind the body, with a gold hem
    flat(pc, (t) => t.poly([[12, 13], [8, 24 - sway], [12, 26], [16, 22]], 1), ramp(0x14081e, 0.3));
    pc.line(8, 24 - Math.round(sway), 12, 26, GOLD);
  }
  // ---- body + belly
  orb(pc, 16, 18, 8, 7, BODY);
  orb(pc, 17.5, 21, 4.6, 3.4, BELLY);
  // feet
  tube(pc, [[13, 24], [12, 27]], 1.3, 1.1, BODY);
  tube(pc, [[18, 24], [19, flap ? 28 : 27]], 1.3, 1.1, BODY);
  // ---- armor (ARMORED and up): a crimson chest plate and a helmet band with gold rivets
  if (stage >= 1) {
    orb(pc, 18, 20.5, 4.4, 3.4, ARMOR);
    pc.hline(14, 21, 17, ARMOR[3]);
    for (const x of [15, 18, 21]) pc.set(x, 20, GOLD);
    // shoulder plate
    orb(pc, 12.5, 16, 2.6, 2.2, ARMOR);
    pc.set(12, 15, GOLD);
    // helmet band across the brow
    pc.hline(13, 22, 11, ARMOR[2]).hline(14, 21, 10, ARMOR[1]);
    pc.set(15, 11, GOLD).set(20, 11, GOLD);
  }
  // ---- AWAKENED and up: runes on the armor glow with abyss light
  if (stage >= 2) {
    const runes = [[17, 21], [19, 21], [13, 17]];
    runes.forEach(([x, y], i) => {
      const lit = sov || (i + idleP(f)) % 3 !== 2 || flap;
      pc.set(x, y, lit ? 0xffb0a0 : 0xff3a4a);
    });
  }
  // ---- horns: little stubs → sharper (armored) → a gold crown of horns (sovereign)
  if (sov) {
    const crown = [[13, 9, 12, 4], [16, 8, 16, 2], [19, 8, 20, 3], [22, 9, 24, 5]];
    crown.forEach(([x0, y0, x1, y1]) => {
      pc.line(x0, y0, x1, y1, GOLD);
      pc.set(x1, y1, 0xfff6c0);
    });
    pc.hline(12, 23, 9, 0xd8a020).hline(13, 22, 8, GOLD);
    // crown gems twinkle one after another (the sovereign's idle)
    [[14, 8], [17, 8], [20, 8]].forEach(([x, y], i) => {
      const on = flap || i === idleP(f) % 3;
      pc.set(x, y, on ? 0xffffff : 0xff3a4a);
    });
  } else {
    const h = stage >= 1 ? 4 : 2;
    pc.line(14, 10, 13, 10 - h, BODY[1]);
    pc.line(20, 10, 21, 10 - h, BODY[1]);
    pc.set(13, 10 - h, stage >= 1 ? GOLD : BODY[0]).set(21, 10 - h, stage >= 1 ? GOLD : BODY[0]);
  }
  // ---- the one big eye (wide on the special pose); it glints on a different frame each loop
  const wide = f === 6;
  const ex = 18;
  const ey = 13;
  pc.rect(ex - 2, ey - 2, 5, wide ? 6 : 5, 0xf4f0ff);
  pc.rect(ex - 1, ey - 1, 3, wide ? 4 : 3, EYE);
  pc.set(ex, ey, OUT);
  if (idleP(f) === 1 || wide) pc.set(ex - 1, ey - 1, 0xffffff);
  // a fanged grin on the special pose
  if (wide) pc.hline(15, 20, 17, OUT).set(16, 18, 0xffffff).set(19, 18, 0xffffff);
  else pc.set(17, 17, OUT).set(18, 17, OUT);
  // the sovereign's eye burns gold at its heart
  if (sov) pc.set(ex + 1, ey, GOLD);
  return done(pc);
}
export const riftling = (f) => riftlingArt(f, 0);
export const riftling_armor = (f) => riftlingArt(f, 1);
export const riftling_aura = (f) => riftlingArt(f, 2);
export const riftsovereign = (f) => riftlingArt(f, 3);
for (const fn of [riftling, riftling_armor, riftling_aura, riftsovereign]) fn.frames = PASS_FRAMES;

export const PASS_DRAW = {
  voidcat,
  hexowl,
  wraithmoth,
  triphound,
  phantomray,
  scorpyre,
  krakkie,
  crimsonmantis,
  gloomeleon,
  umbradrake,
  riftling,
  riftling_armor,
  riftling_aura,
  riftsovereign,
};

// ------------------------------------------------------------------ particle sprites
export function passParticles() {
  const rune = new PixelCanvas(5, 5);
  rune.vline(2, 0, 4, 0xffffff).set(1, 1, 0xffffff).set(3, 1, 0xffffff).set(1, 4, 0xffffff).set(3, 4, 0xffffff);
  const ember = new PixelCanvas(3, 3);
  ember.set(1, 0, 0xffffff).rect(0, 1, 3, 1, 0xffffff).set(1, 2, 0xffffff);
  const ash = new PixelCanvas(3, 2);
  ash.rect(0, 0, 3, 1, 0xffffff).set(1, 1, 0xffffff);
  const slash = new PixelCanvas(14, 6);
  for (let x = 0; x < 14; x++) {
    const y = Math.round(4.5 - Math.sin((x / 13) * Math.PI) * 4);
    slash.set(x, y, 0xffffff);
    if (x > 2 && x < 11) slash.set(x, y + 1, 0xffffff);
  }
  const starp = new PixelCanvas(5, 5);
  starp.vline(2, 0, 4, 0xffffff).hline(0, 4, 2, 0xffffff);
  return { fx_rune: rune, fx_ember: ember, fx_ash: ash, fx_slash: slash, fx_twinkle: starp };
}

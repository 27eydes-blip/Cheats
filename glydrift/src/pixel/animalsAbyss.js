// © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE. Not open source.
// ABYSS animals — shadowy creatures unlocked by Abyss challenges. Dark bodies with bright,
// glowing details so they still read against the Abyss's black.
import { PixelCanvas } from "./px.js";
import { finish, limb, lightEdges, shadeEdges, wing } from "./animalKit.js";

const glowEye = (pc, x, y, c = 0xff3a3a) => pc.set(x, y, c);

// ------------------------------------------------------------------ GLOOMBAT — many-eyed shadow bat
export function gloombat(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x4a3a6a;
  const M = 0x6a5aa0;
  const BONE = 0x2e2248;
  const down = f === 2;
  // front-on bat: membrane wings spread both ways (up, or swept down on the flap)
  for (const side of [-1, 1]) {
    const X = (x) => 12 + side * (x - 12);
    const pts = down
      ? [
          [9, 11],
          [2, 17],
          [4, 16],
          [3, 21],
          [6, 18],
          [7, 20],
          [9, 15],
        ]
      : [
          [9, 12],
          [1, 4],
          [3, 9],
          [1, 12],
          [5, 12],
          [5, 15],
          [9, 15],
        ];
    pc.poly(
      pts.map(([x, y]) => [X(x), y]),
      M,
    );
    const tip = pts[1];
    pc.line(X(9), down ? 11 : 12, X(tip[0]), tip[1], BONE);
  }
  pc.ellipse(12, 14, 3.2, 4, B); // body
  pc.circle(12, 8.5, 3.2, B); // head
  pc.poly(
    [
      [9, 7],
      [9, 3],
      [11, 6],
    ],
    B,
  ).poly(
    [
      [13, 6],
      [15, 3],
      [15, 7],
    ],
    B,
  ); // ears
  // lots of eyes (random blinking in game: frames 0 and 1 have different ones open)
  const eyesA = [
    [10, 8],
    [14, 8],
    [12, 10],
    [11, 13],
    [5, 8],
    [19, 10],
  ];
  const eyesB = [
    [11, 8],
    [13, 9],
    [10, 10],
    [13, 15],
    [4, 11],
    [18, 7],
  ];
  for (const [x, y] of down ? eyesA : f === 1 ? eyesB : eyesA)
    glowEye(
      pc,
      x,
      down && y < 12 && (x < 8 || x > 16) ? y + 8 : y,
      (x + y) % 3 ? 0xffe14a : 0xff4a4a,
    );
  pc.set(11, 11, 0xffffff).set(13, 11, 0xffffff); // tiny fangs
  return finish(pc, 0x0a0614);
}

// ------------------------------------------------------------------ GRIMRAT — skeletal rat
export function grimrat(f) {
  const pc = new PixelCanvas(24, 24);
  const BN = 0xe8e0cc;
  const DK = 0x8a8270;
  // bony tail, curls up on the flap
  if (f === 2) limb(pc, 6, 14, 2, 8, 0.6, BN);
  else limb(pc, 6, 15, 1, 16 + (f === 1 ? 1 : 0), 0.6, BN);
  // spine + ribs
  pc.hline(6, 15, 12, BN);
  for (let x = 7; x <= 14; x += 2) pc.vline(x, 12, 16, BN).set(x, 17, DK);
  pc.hline(7, 14, 16, DK);
  // hips / shoulder blades
  pc.rect(5, 12, 2, 3, BN).rect(14, 11, 2, 3, BN);
  // legs, scurrying
  const k = f === 1 ? 1 : 0;
  pc.line(6, 15, 5 - k, 19, BN).line(8, 16, 9 + k, 19, BN);
  pc.line(14, 14, 13 + k, 19, BN).line(15, 14, 16 - k, 19, BN);
  // skull
  pc.ellipse(18, 11, 3.4, 2.8, BN);
  pc.poly(
    [
      [20, 10],
      [23, 12],
      [20, 13],
    ],
    BN,
  );
  pc.circle(16.5, 7.5, 1.6, BN); // ear
  pc.rect(17, 10, 2, 2, 0x1a0a0a);
  glowEye(pc, 18, 10, 0xff2a2a);
  pc.set(22, 12, 0x3a2a2a).set(20, 13, 0x8a8270).set(21, 13, 0xffffff); // nose + teeth
  return finish(pc, 0x1a1410);
}

// ------------------------------------------------------------------ MURKTOAD — black toad with glowing spots
export function murktoad(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x262634;
  const hop = f === 2;
  if (hop) {
    limb(pc, 8, 16, 2, 20, 1.2, B);
    limb(pc, 2, 20, 1, 21, 1, B);
  } else {
    pc.ellipse(7, 17, 3.4, 2.4, B);
    pc.hline(5, 10, 19, B);
  }
  pc.ellipse(12.5, 14.5, 6.6, 4.6, B); // body
  pc.ellipse(16, 10.5, 4.4, 3.2, B); // head
  pc.circle(14, 7.6, 1.8, B).circle(18.5, 8, 1.8, B); // eye bumps
  pc.rect(13, 7, 2, 2, 0xff9a1a).set(14, 8, 0x1a0a00);
  pc.rect(18, 7, 2, 2, 0xff9a1a).set(19, 8, 0x1a0a00);
  pc.hline(15, 20, 12, 0x0a0a12); // wide mouth
  // glowing red warts (pulse between frames)
  const spots = [
    [9, 12],
    [12, 11],
    [8, 15],
    [13, 15],
    [16, 14],
    [10, 17],
  ];
  spots.forEach(([x, y], i) => {
    pc.set(x, y, (i + f) % 2 ? 0xff3a3a : 0xff8a6a);
    if (i % 2 === 0) pc.set(x + 1, y, 0xc81a2a);
  });
  pc.rect(16, 18, 2, 2, B).rect(18, 19, 2, 1, B); // front feet
  lightEdges(pc, B, 0x3a3a50);
  return finish(pc, 0x050508);
}

// ------------------------------------------------------------------ HOLLOW CROW — crow in a cracked mask
export function hollowcrow(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x22222e;
  const pose = f === 2 ? 2 : f === 1 ? 1 : 0;
  wing(pc, pose, 11, 12, 0x181822, 0x4a4a64, 1.05);
  // ragged wing tips
  pc.set(4, pose === 0 ? 5 : pose === 2 ? 19 : 9, 0x4a4a64);
  pc.poly(
    [
      [6, 14],
      [1, 16],
      [2, 13],
      [6, 12],
    ],
    B,
  ); // tail
  pc.ellipse(11.5, 13.5, 5, 3.8, B); // body
  pc.circle(16, 9.8, 3.4, B); // head
  // the cracked white mask over the face + beak
  pc.ellipse(17.5, 9.5, 2.6, 2.2, 0xf0ece0);
  pc.poly(
    [
      [19, 9],
      [23, 11],
      [19, 12],
    ],
    0xd8d4c8,
  );
  pc.rect(17, 8, 2, 2, 0x0a0a0a);
  glowEye(pc, 17, 8, 0xb45cff);
  pc.line(18, 7, 19, 10, 0x6a6458).set(20, 11, 0x6a6458); // the crack
  pc.set(10, 18, 0x6a6a7a).set(13, 18, 0x6a6a7a); // feet
  shadeEdges(pc, B, 0x14141c);
  return finish(pc, 0x000000);
}

// ------------------------------------------------------------------ LURK EEL — long wiggling shadow eel
export function lurkeel(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x1e3a4a;
  const ph = f * 2.1;
  // body: a sine wave from tail (left) to head (right), thicker toward the head
  let prev = null;
  for (let x = 1; x <= 18; x++) {
    const y = 12 + Math.sin(x * 0.55 + ph) * 3 * (1 - x / 26);
    const r = 0.8 + (x / 18) * 1.9;
    pc.circle(x, y, r, B);
    if (prev) pc.set(x, Math.round(y - r + 0.4), 0x2e5a6e);
    prev = y;
  }
  // glowing dorsal fin line
  for (let x = 3; x <= 16; x += 2) {
    const y = 12 + Math.sin(x * 0.55 + ph) * 3 * (1 - x / 26);
    pc.set(x, Math.round(y - (0.8 + (x / 18) * 1.9)), 0x3ef4ff);
  }
  // head
  const hy = 12 + Math.sin(18 * 0.55 + ph) * 3 * (1 - 18 / 26);
  pc.ellipse(19.5, hy, 3, 2.4, B);
  pc.set(20, Math.round(hy) - 1, 0x9affff).set(21, Math.round(hy) - 1, 0x3ef4ff); // glowing eye
  pc.hline(20, 22, Math.round(hy) + 1, 0x0a1418); // jaw
  pc.set(22, Math.round(hy), 0xffffff); // fang
  return finish(pc, 0x02080c);
}

// ------------------------------------------------------------------ ASH SPIDER — ember-legged spider
export function ashspider(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x2e2222;
  const E = 0xff7a2a;
  const spread = f === 2 ? 2 : 0;
  // eight bent legs (four each side, spaced out) with glowing ember feet
  const knees = [2, 7, 16, 21];
  knees.forEach((kx, i) => {
    const k = (i + f) % 2;
    const bx = 9 + i * 2; // where the leg leaves the body
    const out = i < 2 ? -1 : 1;
    pc.line(bx, 11, kx, 4 - k - spread, B);
    pc.line(kx, 4 - k - spread, kx + out, 8 - k, E);
    pc.line(bx, 14, kx, 20 + k + spread > 21 ? 21 : 20 + k + spread, B);
    pc.line(kx, Math.min(21, 20 + k + spread), kx + out, 22, E);
  });
  pc.ellipse(10, 12.5, 3.8, 3.4, B); // abdomen
  pc.set(8, 11, 0xff4a1a).set(9, 12, 0xff9a3a).set(10, 13, 0xff4a1a); // ember markings
  pc.circle(15, 12.5, 2.8, B); // head
  for (const [x, y] of [
    [16, 11],
    [17, 12],
    [16, 13],
    [15, 11],
  ])
    glowEye(pc, x, y, 0xff3a1a);
  pc.set(18, 14, 0xffd0a0); // fang
  return pc.outline(0x0a0404, 1, false); // no diagonal fill: keeps gaps between the legs
}

// ------------------------------------------------------------------ ANGLERFIEND — anglerfish with a glowing lure
export function anglerfiend(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x34264a;
  // tail fin
  pc.poly(
    [
      [6, 13],
      [1, 8 + f],
      [2, 13],
      [1, 18 - f],
    ],
    0x241a36,
  );
  pc.circle(12.5, 13.5, 6.2, B); // round body
  pc.ellipse(16.5, 15, 4.4, 3.6, B);
  // huge jaw full of teeth
  pc.hline(14, 22, 16, 0x0a0410);
  pc.hline(14, 21, 17, 0x1a0820);
  for (let x = 15; x <= 21; x += 2) pc.set(x, 15, 0xffffff).set(x + 1, 17, 0xffffff);
  pc.rect(16, 10, 2, 2, 0xd8ffa0).set(17, 11, 0x1a2a0a); // eye
  // the lure: a stalk curving over the head to a glowing bulb
  const bob = [0, 1, 0][f];
  pc.line(13, 7, 15, 3, 0x5a4a7a).line(15, 3, 19, 3 + bob, 0x5a4a7a);
  pc.circle(20, 4.5 + bob, 1.6, 0xeaff8a);
  pc.set(20, 4 + bob, 0xffffff);
  // fins
  pc.poly(
    [
      [10, 9],
      [7, 5],
      [12, 8],
    ],
    0x241a36,
  );
  pc.poly(
    [
      [11, 18],
      [8, 21 - (f === 2 ? 2 : 0)],
      [13, 19],
    ],
    0x5a3aa8,
  );
  lightEdges(pc, B, 0x4a3a66);
  return finish(pc, 0x08040e);
}
ashspider.head = { x: 3, y: -2, w: 26, h: 26 }; // hats on the head, not a leg
anglerfiend.head = { x: 0, y: -5, w: 26, h: 26 }; // hats sit on the head, not the lure

// ------------------------------------------------------------------ RIFTWOLF — shadow wolf with smoky wings
export function riftwolf(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x2e2e48;
  const W = 0x7a4ad8;
  // smoky wings
  wing(pc, f === 2 ? 2 : f === 1 ? 1 : 0, 10, 11, W, 0xd8b8ff, 1);
  for (let i = 0; i < 3; i++) pc.set(3 + i * 2, f === 2 ? 18 - i : 6 + i, 0xb48aff);
  // bushy tail
  limb(pc, 6, 13, 2, 10 + (f === 1 ? 1 : 0), 1.3, B);
  pc.set(1, 9, 0x6a6a9a);
  pc.ellipse(11, 13.5, 5.6, 3.4, B); // body
  // legs, running
  const k = f % 2;
  pc.rect(7 + k, 16, 2, 3, B).rect(13 - k, 16, 2, 3, B);
  // head with a long snout and pointed ears
  pc.circle(16.5, 10.5, 3.2, B);
  pc.rect(18, 11, 5, 2, B);
  pc.poly(
    [
      [14, 9],
      [15, 4],
      [17, 8],
    ],
    B,
  );
  pc.poly(
    [
      [17, 8],
      [19, 4],
      [19, 9],
    ],
    B,
  );
  pc.set(15, 6, W).set(18, 6, W); // inner ears glow
  pc.set(17, 10, 0x6af8ff).set(18, 10, 0x3ef4ff); // glowing eye
  pc.set(22, 11, 0x0a0a14); // nose
  pc.set(20, 13, 0xffffff); // fang
  shadeEdges(pc, B, 0x1e1e34);
  return finish(pc, 0x04040c);
}

// ------------------------------------------------------------------ GRIMVULTURE — skeletal vulture
export function grimvulture(f) {
  const pc = new PixelCanvas(24, 24);
  const BN = 0xe8e0cc;
  const R = 0x3a2a2a;
  // ragged wings with holes
  const pose = f === 2 ? 2 : f === 1 ? 1 : 0;
  wing(pc, pose, 11, 12, R, 0x6a5a5a, 1.1);
  for (const [x, y] of pose === 0
    ? [
        [7, 7],
        [9, 5],
      ]
    : pose === 2
      ? [
          [7, 17],
          [9, 19],
        ]
      : [
          [5, 11],
          [8, 11],
        ])
    pc.set(x, y, null);
  // ribcage body
  pc.ellipse(11.5, 13.5, 4.4, 3.4, R);
  for (let x = 9; x <= 14; x += 2) pc.vline(x, 11, 16, BN);
  pc.hline(9, 14, 12, BN);
  // bare bony neck + skull
  limb(pc, 14, 12, 16, 8, 0.8, BN);
  pc.ellipse(17.5, 7.5, 2.8, 2.2, BN);
  pc.poly(
    [
      [19, 7],
      [23, 9],
      [21, 10],
      [19, 9],
    ],
    0xc8b88a,
  ); // hooked beak
  pc.rect(17, 6, 2, 2, 0x0a0a0a);
  glowEye(pc, 17, 6, 0xff6a2a);
  pc.hline(12, 16, 11, 0x6a5a5a); // ruff
  pc.set(10, 18, BN).set(13, 18, BN); // talons
  return finish(pc, 0x0a0606);
}

// ------------------------------------------------------------------ LEVIATHAN JR. — chained baby sea serpent
export function levijr(f) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x3a2a8a;
  const BL = 0x5a4ab8;
  const FIN = 0xc87aff;
  const ph = f * 1.9;
  const yAt = (x) => 16 + Math.sin(x * 0.5 + ph) * 2.2;
  // serpent body: thin tail on the left, thick toward the neck
  for (let x = 1; x <= 15; x++) pc.circle(x, yAt(x), 0.7 + (x / 15) * 2.4, B);
  // belly scales
  for (let x = 4; x <= 14; x += 2) pc.set(x, Math.round(yAt(x) + 0.7 + (x / 15) * 2.4 - 1), BL);
  // glowing fin ridge along the back
  for (let x = 3; x <= 14; x += 2) pc.set(x, Math.round(yAt(x) - (0.7 + (x / 15) * 2.4)) - 1, FIN);
  // neck rising to the head
  limb(pc, 14, yAt(14) - 1, 17, 9, 2, B);
  pc.ellipse(18.5, 8, 3.8, 2.8, B); // head
  pc.ellipse(20, 9.4, 2.4, 1.2, BL); // snout
  pc.poly(
    [
      [16, 6],
      [13, 1],
      [18, 5],
    ],
    FIN,
  ); // horn-fin
  pc.poly(
    [
      [18, 5],
      [18, 1],
      [20, 5],
    ],
    FIN,
  );
  pc.rect(19, 7, 2, 1, 0xffffff).set(20, 7, 0xd8b8ff); // glowing eye
  pc.hline(19, 22, 10, 0x0a0420);
  pc.set(21, 11, 0xffffff); // little fang
  // the chains: two bands of grey links wrapped round the body
  for (const cx of [6, 11]) {
    const cy = Math.round(yAt(cx));
    const r = Math.round(0.7 + (cx / 15) * 2.4);
    for (let y = cy - r - 1; y <= cy + r + 1; y++)
      pc.set(cx, y, (y - cy) % 2 ? 0x8a8aa0 : 0xd8d8e8);
    pc.set(cx + 1, cy + r + 2, 0x8a8aa0).set(cx + 1, cy + r + 3, 0xd8d8e8); // dangling link
  }
  lightEdges(pc, B, 0x5a4ab8);
  return finish(pc, 0x0a0420);
}

export const ABYSS_DRAW = {
  gloombat,
  grimrat,
  murktoad,
  hollowcrow,
  lurkeel,
  ashspider,
  anglerfiend,
  riftwolf,
  grimvulture,
  levijr,
};

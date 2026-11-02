// Shared pixel sprites: heroes, coins, portals, and pixel particle textures.
import { addAtlas, addTexture, PixelCanvas } from "./px.js";

const OUT = 0x07101e; // bold character outline

// ------------------------------------------------------------------ VOLT — storm bird (24x24)
function volt(frame) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x2aa8ff; // body blue
  const Bd = 0x1670d0;
  const L = 0x8fe4ff; // light blue
  const W = 0xe8fbff;
  // tail feathers (zig-zag bolt shape)
  pc.poly(
    [
      [7, 12],
      [1, 9],
      [4, 13],
      [0, 14],
      [5, 16],
      [8, 15],
    ],
    Bd,
  );
  pc.set(2, 10, L).set(1, 14, L);
  // body + head
  pc.ellipse(11.5, 13.5, 6.8, 5.2, B);
  pc.circle(16.5, 9.5, 4.3, B);
  // belly
  pc.ellipse(13, 15.5, 4, 2.2, W);
  pc.hline(10, 15, 17, L);
  // lightning crest (gold — the bird's signature)
  pc.stamp(14, 2, ["..y.", ".yy.", "yyy.", ".yyy", "..y."], { y: 0xffe14d });
  pc.set(16, 3, 0xfff6c0);
  // eye
  pc.rect(17, 7, 3, 3, 0xffffff);
  pc.rect(18, 8, 2, 2, 0x0b1830);
  pc.set(18, 8, 0xffffff);
  // beak
  pc.stamp(20, 9, ["oo..", "ooyy", "oo.."], { o: 0xffa31a, y: 0xffd23f });
  pc.set(21, 9, 0xffd23f);
  // cheek blush
  pc.set(16, 12, 0xff8fb8);
  // wing (3 frames: up, mid, down)
  const wings = [
    [
      [8, 12],
      [5, 4],
      [9, 6],
      [10, 3],
      [12, 7],
      [13, 12],
    ],
    [
      [7, 11],
      [2, 9],
      [6, 8],
      [4, 6],
      [10, 9],
      [13, 12],
    ],
    [
      [8, 13],
      [6, 20],
      [9, 18],
      [10, 21],
      [12, 17],
      [13, 13],
    ],
  ];
  pc.poly(wings[frame], L);
  // bolt mark on the wing
  const bolt = [
    [9, 7],
    [9, 9],
    [10, 9],
  ][0];
  if (frame === 0) pc.set(10, 7, 0xffe14d).set(9, 8, 0xffe14d).set(10, 9, 0xffe14d);
  if (frame === 1) pc.set(6, 9, 0xffe14d).set(7, 9, 0xffe14d).set(8, 10, 0xffe14d);
  if (frame === 2) pc.set(10, 15, 0xffe14d).set(9, 16, 0xffe14d).set(10, 17, 0xffe14d);
  void bolt;
  // soft shading then a bold outline
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      const c = pc.get(x, y);
      if (c === B && (pc.get(x, y + 1) === null || pc.get(x + 1, y + 1) === null)) pc.set(x, y, Bd);
      if (c === B && pc.get(x, y - 1) === null) pc.set(x, y, L);
    }
  pc.outline(OUT, 1, true);
  return pc;
}

// ------------------------------------------------------------------ coins (gold, 10x12, 4 spin frames)
function coin(frame) {
  const pc = new PixelCanvas(10, 12);
  const rx = [3.6, 2.4, 0.9, 2.4][frame];
  pc.ellipse(4.5, 5.5, rx + 0.4, 4.8, 0xffc83d);
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 10; x++) {
      if (pc.get(x, y) === null) continue;
      if (x < 4.5 - rx * 0.4) pc.set(x, y, 0xfff1a0);
      else if (x > 4.5 + rx * 0.5) pc.set(x, y, 0xd08a10);
    }
  if (frame === 0) pc.vline(4, 3, 7, 0xd08a10).vline(5, 3, 7, 0xfff1a0);
  pc.outline(0x3a2400, 1);
  return pc;
}

// ------------------------------------------------------------------ portals (bright ring + symbol)
const PORTAL = { ring: 0xff4fd8, ring2: 0xffb3ef, dark: 0x3a0a3c };
function portal(mode, frame) {
  const pc = new PixelCanvas(38, 38);
  const c = 18.5;
  for (let y = 0; y < 38; y++)
    for (let x = 0; x < 38; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      if (d <= 16.5 && d > 13) pc.set(x, y, PORTAL.ring);
      else if (d <= 13 && d > 12) pc.set(x, y, PORTAL.ring2);
      else if (d <= 12) pc.set(x, y, PORTAL.dark);
    }
  // rotating sparkles on the ring
  for (let k = 0; k < 4; k++) {
    const a = ((k + frame / 4) / 4) * Math.PI * 2;
    const x = Math.round(c + Math.cos(a) * 14.7 - 0.5);
    const y = Math.round(c + Math.sin(a) * 14.7 - 0.5);
    pc.rect(x, y, 2, 2, 0xffffff);
  }
  const Wt = 0xffffff;
  if (mode === "mini") {
    pc.rect(17, 17, 3, 3, Wt);
    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ]) {
      pc.rect(18 + dx * 6 - (dy ? 0 : 0), 18 + dy * 6, 1, 1, Wt);
      pc.rect(18 + dx * 7, 18 + dy * 7, 1, 1, Wt);
    }
  } else {
    const up = mode === "flip";
    const rows = [
      "...w...",
      "..www..",
      ".wwwww.",
      "wwwwwww",
      "..www..",
      "..www..",
      "..www..",
      "..www..",
    ];
    pc.stamp(15, 14, up ? rows : rows.slice().reverse(), { w: Wt });
  }
  pc.outline(0x12030f, 1);
  return pc;
}

// ------------------------------------------------------------------ pixel particles (white, tinted at runtime)
function circleTex(n, r) {
  const pc = new PixelCanvas(n, n);
  pc.circle(n / 2 - 0.5, n / 2 - 0.5, r, 0xffffff);
  return pc;
}

export function buildCommon(scene) {
  const frames = {};
  for (let f = 0; f < 3; f++) frames[`volt_${f}`] = volt(f);
  for (let f = 0; f < 4; f++) frames[`coin_${f}`] = coin(f);
  for (const m of ["flip", "restore", "mini"])
    for (let f = 0; f < 4; f++) frames[`portal_${m}_${f}`] = portal(m, f);
  addAtlas(scene, "pxc", frames);

  // particle textures (same logical size as the old smooth ones, now pixel-crisp)
  addTexture(scene, "dot", circleTex(8, 3));
  addTexture(
    scene,
    "spark",
    new PixelCanvas(12, 2).rect(0, 0, 12, 2, 0xffffff).rect(0, 0, 3, 2, 0xb0b0b0),
  );
  addTexture(scene, "pixel", new PixelCanvas(3, 3).rect(0, 0, 3, 3, 0xffffff));
  addTexture(
    scene,
    "star4",
    new PixelCanvas(12, 12)
      .rect(5, 0, 2, 12, 0xffffff)
      .rect(0, 5, 12, 2, 0xffffff)
      .rect(4, 4, 4, 4, 0xffffff),
  );
  addTexture(
    scene,
    "shard",
    new PixelCanvas(7, 7).poly(
      [
        [3.5, 0],
        [7, 7],
        [0, 6],
      ],
      0xffffff,
    ),
  );
  addTexture(
    scene,
    "flake",
    new PixelCanvas(8, 8)
      .rect(3, 0, 2, 8, 0xffffff)
      .rect(0, 3, 8, 2, 0xffffff)
      .set(1, 1, 0xffffff)
      .set(6, 6, 0xffffff)
      .set(6, 1, 0xffffff)
      .set(1, 6, 0xffffff),
  );
  const smoke = new PixelCanvas(16, 16).circle(7.5, 7.5, 6, 0xffffff);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++)
      if ((x + y) % 2 && Math.hypot(x - 7.5, y - 7.5) > 4) smoke.set(x, y, null);
  addTexture(scene, "smoke", smoke);
  const ring = new PixelCanvas(64, 64);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32);
      if (d < 27 && d >= 24.5) ring.set(x, y, 0xffffff);
    }
  addTexture(scene, "ring", ring);
  addTexture(scene, "rain", new PixelCanvas(1, 6).rect(0, 0, 1, 6, 0xffffff));
  addTexture(scene, "px1", new PixelCanvas(1, 1).set(0, 0, 0xffffff));
}

export { PORTAL };

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
  if (frame === 0) pc.set(10, 7, 0xffe14d).set(9, 8, 0xffe14d).set(10, 9, 0xffe14d);
  if (frame === 1) pc.set(6, 9, 0xffe14d).set(7, 9, 0xffe14d).set(8, 10, 0xffe14d);
  if (frame === 2) pc.set(10, 15, 0xffe14d).set(9, 16, 0xffe14d).set(10, 17, 0xffe14d);
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

// ------------------------------------------------------------------ EMBER — phoenix (wings frames)
function ember(frame) {
  const pc = new PixelCanvas(24, 24);
  const B = 0xff7a1a;
  const Bd = 0xc2410c;
  const Y = 0xffd23f;
  // flame tail plumes
  pc.poly(
    [
      [8, 12],
      [0, 8],
      [3, 12],
      [0, 15],
      [4, 15],
      [1, 19],
      [8, 15],
    ],
    0xff3d1a,
  );
  pc.set(1, 9, Y).set(1, 15, Y).set(2, 18, Y);
  pc.ellipse(11.5, 13.5, 6.6, 5, B);
  pc.circle(16.5, 9.5, 4.2, B);
  pc.ellipse(13, 15.5, 3.8, 2, Y);
  // flame crest
  pc.stamp(13, 1, ["..r.", ".ry.", "ryy.", ".ryr", "..r."], { r: 0xff3d1a, y: Y });
  pc.rect(17, 7, 3, 3, 0xffffff).rect(18, 8, 2, 2, 0x2a0500).set(18, 8, 0xffffff);
  pc.stamp(20, 9, ["ww..", "wwyy", "ww.."], { w: 0xfff4c2, y: Y });
  const wings = [
    [
      [8, 12],
      [4, 3],
      [8, 5],
      [9, 2],
      [12, 6],
      [13, 12],
    ],
    [
      [7, 11],
      [1, 8],
      [5, 8],
      [3, 5],
      [10, 9],
      [13, 12],
    ],
    [
      [8, 13],
      [5, 20],
      [9, 18],
      [10, 21],
      [12, 17],
      [13, 13],
    ],
  ];
  pc.poly(wings[frame], Y);
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++)
      if (pc.get(x, y) === Y && y < 11 && frame !== 2) pc.set(x, y, y < 7 ? 0xfff4c2 : Y);
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      const c = pc.get(x, y);
      if (c === B && (pc.get(x, y + 1) === null || pc.get(x + 1, y + 1) === null)) pc.set(x, y, Bd);
    }
  pc.outline(0x2a0802, 1, true);
  return pc;
}

// ------------------------------------------------------------------ FROST — ice crystal sprite (idle)
function frost(frame) {
  const pc = new PixelCanvas(24, 24);
  const bob = frame === 1 ? -1 : 0;
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    pts.push([12 + Math.cos(a) * 8.5, 12 + bob + Math.sin(a) * 9.5]);
  }
  pc.poly(pts, 0x7fd0ff);
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      if (pc.get(x, y) === null) continue;
      if (x < 12 && y < 12 + bob) pc.set(x, y, 0xd8f6ff);
      else if (x >= 12 && y >= 12 + bob) pc.set(x, y, 0x4a9ae0);
    }
  pc.line(12, 3 + bob, 12, 21 + bob, 0xffffff);
  // face
  pc.rect(9, 11 + bob, 2, 3, 0x0a2a55).rect(14, 11 + bob, 2, 3, 0x0a2a55);
  pc.set(9, 11 + bob, 0xffffff).set(14, 11 + bob, 0xffffff);
  pc.hline(11, 13, 15 + bob, 0x0a2a55);
  pc.set(8, 14 + bob, 0xff9ac8).set(16, 14 + bob, 0xff9ac8);
  // sparkle travels around the crystal
  const sp = [
    [4, 5],
    [19, 7],
    [18, 19],
  ][frame];
  pc.set(sp[0], sp[1], 0xffffff)
    .set(sp[0] - 1, sp[1], 0xbff4ff)
    .set(sp[0] + 1, sp[1], 0xbff4ff)
    .set(sp[0], sp[1] - 1, 0xbff4ff)
    .set(sp[0], sp[1] + 1, 0xbff4ff);
  pc.outline(0x0a2440, 1, true);
  return pc;
}

// ------------------------------------------------------------------ SHADE — shadow ninja (idle)
function shade(frame) {
  const pc = new PixelCanvas(24, 24);
  // headband tails flutter behind
  const tails = [
    [
      [6, 10],
      [0, 7],
      [2, 10],
      [0, 12],
      [6, 12],
    ],
    [
      [6, 10],
      [0, 9],
      [2, 11],
      [1, 14],
      [6, 12],
    ],
    [
      [6, 10],
      [1, 6],
      [3, 9],
      [0, 11],
      [6, 12],
    ],
  ][frame];
  pc.poly(tails, 0xb45cff);
  pc.circle(13, 12, 8.3, 0x2a1440);
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      if (pc.get(x, y) !== 0x2a1440) continue;
      const d = Math.hypot(x - 10, y - 8);
      if (d < 4) pc.set(x, y, 0x46246c);
      else if (x + y > 30) pc.set(x, y, 0x1a0a2a);
    }
  pc.hline(5, 21, 10, 0xb45cff).hline(5, 21, 11, 0x8a3ad8);
  // eye slit
  pc.rect(12, 12, 9, 3, 0x0a0412);
  pc.hline(14, 15, 13, 0xffffff).hline(18, 19, 13, 0xffffff);
  if (frame === 2)
    pc.hline(14, 15, 13, 0x0a0412)
      .hline(18, 19, 13, 0x0a0412)
      .hline(14, 15, 14, 0xd8c0ff)
      .hline(18, 19, 14, 0xd8c0ff);
  // bright violet outline so the dark ninja reads on any background
  pc.outline(0xd0a8ff, 1, true);
  return pc;
}

// ------------------------------------------------------------------ GLITCH — pixel blob creature
function glitch(frame) {
  const pc = new PixelCanvas(24, 24);
  const G = 0x39ff88;
  const Gd = 0x1a9a50;
  const squash = frame === 1 ? 1 : 0;
  pc.ellipse(12, 14 + squash * 0.5, 8 + squash, 6.5 - squash, G);
  pc.rect(6, 15, 12, 4, G);
  // little feet
  pc.rect(6, 19, 3, 2, Gd).rect(15, 19, 3, 2, Gd);
  // antenna
  pc.vline(12, 3, 7, Gd).rect(11, 1, 3, 3, 0xff5ad8).set(11, 1, 0xffb0ec);
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) if (pc.get(x, y) === G && (x > 16 || y > 17)) pc.set(x, y, Gd);
  // big eyes
  pc.rect(8, 11, 3, 4, 0xffffff).rect(14, 11, 3, 4, 0xffffff);
  pc.rect(9, 12, 2, 2, 0x062a14).rect(15, 12, 2, 2, 0x062a14);
  pc.hline(10, 14, 16, 0x0a5a2a);
  pc.outline(0x062a14, 1, true);
  if (frame === 2) {
    // RGB split + torn rows: it glitches out
    const out = new PixelCanvas(24, 24);
    for (let y = 0; y < 24; y++)
      for (let x = 0; x < 24; x++) {
        const c = pc.get(x, y);
        if (c === null) continue;
        out.set(x - 2, y, 0xff2050);
        out.set(x + 2, y, 0x20c8ff);
      }
    out.blit(pc, 0, 0);
    for (const row of [9, 10, 15]) {
      const tmp = [];
      for (let x = 0; x < 24; x++) tmp.push(out.get(x, row));
      for (let x = 0; x < 24; x++) out.set(x, row, tmp[(x + 3) % 24]);
    }
    return out;
  }
  return pc;
}

// ------------------------------------------------------------------ NOVA — living star (idle)
function nova(frame) {
  const pc = new PixelCanvas(24, 24);
  // ring behind
  for (let a = Math.PI; a < Math.PI * 2; a += 0.04)
    pc.set(12 + Math.cos(a) * 11, 13 + Math.sin(a) * 3.2, 0xff7ad9);
  const star = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 10 : 4.6;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2 + frame * 0.06;
    star.push([12 + Math.cos(a) * r, 12.5 + Math.sin(a) * r]);
  }
  pc.poly(star, 0xffd23f);
  pc.circle(12, 12.5, 4.5, 0xfff1a8);
  pc.circle(11, 11.5, 2, 0xffffff);
  // face
  pc.rect(9, 11, 2, 2, 0x5a3a00).rect(13, 11, 2, 2, 0x5a3a00);
  pc.set(9, 11, 0xffffff).set(13, 11, 0xffffff);
  pc.hline(10, 13, 14, 0x5a3a00).set(9, 13, 0x5a3a00).set(14, 13, 0x5a3a00);
  pc.set(8, 13, 0xff9ac8).set(15, 13, 0xff9ac8);
  // ring in front
  for (let a = 0; a < Math.PI; a += 0.04)
    pc.set(12 + Math.cos(a) * 11, 13 + Math.sin(a) * 3.2, 0x7ad8ff);
  // twinkles
  const tw = [
    [3, 3],
    [21, 5],
    [20, 21],
  ][frame];
  pc.set(tw[0], tw[1], 0xffffff)
    .set(tw[0] + 1, tw[1], 0xfff1a8)
    .set(tw[0], tw[1] + 1, 0xfff1a8);
  pc.outline(0x4a2a00, 1, true);
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
  for (let f = 0; f < 3; f++) {
    frames[`volt_${f}`] = volt(f);
    frames[`ember_${f}`] = ember(f);
    frames[`frost_${f}`] = frost(f);
    frames[`shade_${f}`] = shade(f);
    frames[`glitch_${f}`] = glitch(f);
    frames[`nova_${f}`] = nova(f);
  }
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

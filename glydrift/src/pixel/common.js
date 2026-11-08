// Shared pixel sprites: heroes, coins, portals, and pixel particle textures.
import { LOTTERY_DRAW } from "./lotteryHeroes.js";
import { SHOP_DRAW } from "./shopHeroes.js";
import { yarms } from "./yarmsArt.js";
import { sonjuwon, sonjuwonBoard } from "./sonjuwonArt.js";
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

// ------------------------------------------------------------------ BLOOM — sprout spirit (idle: leaves sway)
function bloom(frame) {
  const pc = new PixelCanvas(24, 24);
  const G = 0x5fe36a;
  const Gd = 0x2c9a48;
  const sway = [-1, 0, 1][frame];
  // stem + two leaves
  pc.vline(12, 4, 9, Gd);
  pc.poly(
    [
      [12, 7],
      [5 + sway, 2],
      [3 + sway, 5],
      [8, 8],
    ],
    0x8af27a,
  );
  pc.poly(
    [
      [12, 7],
      [19 + sway, 1],
      [21 + sway, 4],
      [16, 8],
    ],
    0x6ad86a,
  );
  pc.line(12, 7, 5 + sway, 3, Gd).line(12, 7, 19 + sway, 2, Gd);
  // pink bud on top
  pc.circle(12, 3, 1.6, 0xff7ac8).set(12, 2, 0xffd0ec);
  // round body
  pc.ellipse(12, 15.5, 8, 6.8, G);
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      if (pc.get(x, y) !== G) continue;
      if (x + y < 20) pc.set(x, y, 0xa8ff9a);
      else if (x - y > 6 || y > 19) pc.set(x, y, Gd);
    }
  // face
  pc.rect(8, 14, 2, 3, 0x0d2a14).rect(14, 14, 2, 3, 0x0d2a14);
  pc.set(8, 14, 0xffffff).set(14, 14, 0xffffff);
  pc.hline(11, 12, 18, 0x0d2a14);
  pc.set(6, 17, 0xff9ac8).set(17, 17, 0xff9ac8);
  // tiny feet
  pc.rect(8, 22, 2, 1, Gd).rect(14, 22, 2, 1, Gd);
  pc.outline(0x0b2410, 1, true);
  return pc;
}

// ------------------------------------------------------------------ TIDE — jellyfish (idle: tentacles wave)
function tide(frame) {
  const pc = new PixelCanvas(24, 24);
  const B = 0x6fe8ff;
  // tentacles (behind the bell)
  for (let i = 0; i < 5; i++) {
    const x0 = 6 + i * 3;
    const col = i % 2 ? 0xff8ae0 : 0x9af4ff;
    for (let y = 13; y < 22 - (i % 2); y++) {
      const off = Math.round(Math.sin((y + frame * 2 + i) * 0.9) * 0.9);
      pc.set(x0 + off, y, col);
    }
  }
  // bell
  pc.ellipse(12, 10, 9, 7.5, B);
  pc.rect(3, 10, 19, 3, B);
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      if (pc.get(x, y) !== B) continue;
      if (y < 7 && x < 12) pc.set(x, y, 0xd0fbff);
      else if (y > 10) pc.set(x, y, 0x3ab8e0);
    }
  // frilly rim
  for (let x = 3; x <= 21; x += 2) pc.set(x, 13, 0xff8ae0);
  // glowing spots + face
  pc.set(7, 5, 0xffffff).set(8, 4, 0xffffff).set(16, 6, 0xd0fbff);
  pc.rect(8, 9, 2, 2, 0x0a2a44).rect(14, 9, 2, 2, 0x0a2a44);
  pc.set(8, 9, 0xffffff).set(14, 9, 0xffffff);
  pc.hline(11, 12, 11 + (frame === 1 ? 1 : 0), 0x0a2a44);
  pc.outline(0x08223a, 1, true);
  return pc;
}

// ------------------------------------------------------------------ MECHA — robot drone (rotor spins)
function mecha(frame) {
  const pc = new PixelCanvas(24, 24);
  // rotor (3 spin frames: wide, angled, narrow)
  const span = [9, 6, 2][frame];
  pc.vline(12, 2, 5, 0x5a6470);
  pc.hline(12 - span, 12 + span, 2, frame === 2 ? 0x9aa6b4 : 0xd8e2ee);
  if (frame === 1) pc.set(12 - span - 1, 3, 0xd8e2ee).set(12 + span + 1, 1, 0xd8e2ee);
  // body
  pc.rect(4, 6, 16, 13, 0xff8a2a);
  pc.hline(4, 19, 6, 0xffc070).vline(4, 6, 18, 0xffc070);
  pc.hline(4, 19, 18, 0xb8500e).vline(19, 6, 18, 0xb8500e);
  pc.rect(6, 15, 12, 2, 0x5a6470);
  pc.set(7, 15, 0xffd23f).set(10, 15, 0x39ff88);
  // visor + eye (facing right)
  pc.rect(7, 8, 12, 6, 0x10202c);
  pc.rect(13, 9, 4, 3, 0x2bffef).set(13, 9, 0xffffff);
  pc.hline(8, 11, 12, 0x1f3a4a);
  // side antenna + thruster
  pc.set(3, 9, 0x5a6470).set(2, 8, 0xff5a7a);
  pc.rect(1, 13, 3, 4, 0x5a6470);
  pc.rect(0, 14, 1, 2, [0xffd23f, 0xff8a2a, 0xffffff][frame]);
  // feet
  pc.rect(6, 19, 3, 2, 0x5a6470).rect(15, 19, 3, 2, 0x5a6470);
  pc.outline(0x1a0e06, 1, true);
  return pc;
}

// ------------------------------------------------------------------ DRACO — baby dragon (wings frames)
function draco(frame) {
  const pc = new PixelCanvas(24, 24);
  const P = 0x9a5cff;
  const Pd = 0x5f2fc0;
  // tail
  pc.poly(
    [
      [6, 14],
      [0, 17],
      [2, 15],
      [0, 12],
      [6, 12],
    ],
    P,
  );
  pc.set(0, 12, 0x2bffd0).set(1, 12, 0x2bffd0);
  // body + head
  pc.ellipse(10.5, 14, 6, 4.6, P);
  pc.circle(16.5, 9.5, 4.4, P);
  pc.rect(19, 9, 4, 3, P); // snout
  pc.ellipse(11, 16, 4, 2, 0x5fffd8); // belly
  // horns
  pc.set(14, 4, 0xfff0c0).set(15, 5, 0xfff0c0).set(18, 4, 0xfff0c0).set(18, 5, 0xfff0c0);
  // eye + nostril
  pc.rect(17, 8, 2, 2, 0xffffff).set(18, 9, 0x1a0636);
  pc.set(22, 9, 0x3a1470);
  // wings
  const wings = [
    [
      [8, 11],
      [5, 2],
      [9, 5],
      [12, 1],
      [14, 7],
      [13, 11],
    ],
    [
      [8, 11],
      [1, 7],
      [6, 7],
      [5, 4],
      [12, 8],
      [13, 11],
    ],
    [
      [8, 13],
      [4, 21],
      [8, 18],
      [11, 21],
      [13, 15],
    ],
  ];
  pc.poly(wings[frame], 0x2bffd0);
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      const c = pc.get(x, y);
      if (c === 0x2bffd0 && (x + y) % 5 === 0) pc.set(x, y, 0x18b89a);
      if (c === P && (pc.get(x, y + 1) === null || pc.get(x + 1, y + 1) === null)) pc.set(x, y, Pd);
    }
  // feet
  pc.rect(8, 18, 2, 2, Pd).rect(12, 18, 2, 2, Pd);
  pc.outline(0x1a0636, 1, true);
  return pc;
}

/** Thin white rim around a hero sprite so the player is always the brightest, clearest shape. */
/**
 * Top of each hero's head, in art pixels from the frame centre (frame 1, after the rim), so
 * shop hats sit on any hero: the highest opaque row in the front (right) part of the sprite.
 */
export const HEAD_ANCHORS = {};

/**
 * Hero portraits (hero_<id>) are stored at 5 texture px per art pixel — they're pixel art drawn
 * with NEAREST filtering, so they look the same as the old 13x versions at a fraction of the
 * memory (older iPhones were running out). Code sizing a portrait multiplies by PORTRAIT_K.
 */
export const PORTRAIT_SCALE = 5;
export const PORTRAIT_K = 13 / PORTRAIT_SCALE;
export function headAnchor(pc) {
  const x0 = Math.floor(pc.w * 0.42);
  for (let y = 0; y < pc.h; y++) {
    const xs = [];
    for (let x = x0; x < pc.w; x++) if (pc.get(x, y) !== null) xs.push(x);
    if (xs.length) {
      const cx = (xs[0] + xs[xs.length - 1]) / 2;
      return { x: cx + 0.5 - pc.w / 2, y: y + 1 - pc.h / 2, w: pc.w, h: pc.h };
    }
  }
  return { x: 2, y: -8, w: pc.w, h: pc.h };
}

export function rim(pc) {
  const out = new PixelCanvas(pc.w + 2, pc.h + 2);
  out.blit(pc, 1, 1);
  return out.outline(0xffffff, 1, false);
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

/** Heroes whose portrait isn't frame 1 (THE HADDAD's is the big smile, not the uppercut). */
const PORTRAIT_FRAME = { haddad: 4, jamal: 6, dawson: 4, dewberry: 4 };

export function buildCommon(scene) {
  const frames = {};
  const heroes = {
    volt,
    ember,
    frost,
    shade,
    glitch,
    nova,
    bloom,
    tide,
    mecha,
    draco,
    ...SHOP_DRAW,
    ...LOTTERY_DRAW,
    yarms,
    sonjuwon,
  };
  for (let f = 0; f < 3; f++)
    for (const [id, draw] of Object.entries(heroes)) frames[`${id}_${f}`] = rim(draw(f));
  for (const id of Object.keys(heroes)) HEAD_ANCHORS[id] = headAnchor(frames[`${id}_1`]);
  // YARMS has a 4th pose (the double-bicep flex) and no head: hats sit between the shoulders
  frames.yarms_3 = rim(yarms(3));
  HEAD_ANCHORS.yarms = { x: 0, y: -8.5, w: 50, h: 34 };
  // SXE (id "splice"): dive tuck, three perched poses and the screech (frames 3-7)
  for (let f = 3; f < 8; f++) frames[`splice_${f}`] = rim(SHOP_DRAW.splice(f));
  // (his raised wing is the top of frame 1: hats take the head from the glide pose instead)
  HEAD_ANCHORS.splice = headAnchor(frames.splice_0);
  // THE HADDAD: slip, K.O., smile, knocked out and the jab (frames 3-6); hats sit on his hair
  // in the guard pose (the uppercut's glove is the top of frame 1)
  for (let f = 3; f < 7; f++) frames[`haddad_${f}`] = rim(SHOP_DRAW.haddad(f));
  HEAD_ANCHORS.haddad = headAnchor(frames.haddad_0);
  // JAMAL: tilt, sneeze, scratch, the stare, knocked out and the second glide frame (3-8);
  // hats sit on top of his head, between the two antenna tufts (not on the tuft tips)
  for (let f = 3; f < 9; f++) frames[`jamal_${f}`] = rim(SHOP_DRAW.jamal(f));
  HEAD_ANCHORS.jamal = { x: 2.5, y: -7, w: 26, h: 26 };
  // DAWSON: tail flash, the fanned display and the shattered spin (3-5); DEWBERRY: wide eyes and
  // delighted (3-4). Hats: DAWSON's on his head behind the eye (not on a raised wing tip),
  // DEWBERRY's on top of the berry beside the leaf
  for (let f = 3; f < 6; f++) frames[`dawson_${f}`] = rim(SHOP_DRAW.dawson(f));
  for (let f = 3; f < 5; f++) frames[`dewberry_${f}`] = rim(SHOP_DRAW.dewberry(f));
  HEAD_ANCHORS.dawson = { x: 5.5, y: -3, w: 26, h: 26 };
  HEAD_ANCHORS.dewberry = { x: 0.5, y: -6, w: 26, h: 26 };
  // 손주원: the roar pose, the board on its own, and hats on the tiger's head
  frames.sonjuwon_3 = rim(sonjuwon(3));
  frames.sonjuwon_board = rim(sonjuwonBoard());
  HEAD_ANCHORS.sonjuwon = { x: 7.5, y: -9, w: 32, h: 26 };
  for (let f = 0; f < 4; f++) frames[`coin_${f}`] = coin(f);
  for (const m of ["flip", "restore", "mini"])
    for (let f = 0; f < 4; f++) frames[`portal_${m}_${f}`] = portal(m, f);
  addAtlas(scene, "pxc", frames);
  // big standalone hero portraits (character cards, game over, leaderboard, share card)
  for (const id of Object.keys(heroes))
    addTexture(scene, `hero_${id}`, frames[`${id}_${PORTRAIT_FRAME[id] ?? 1}`], PORTRAIT_SCALE);
  addTexture(scene, "hero_yarms_flex", frames.yarms_3, PORTRAIT_SCALE);

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

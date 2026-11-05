// © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE. Not open source.
// Hazard art for the four dimensions (original pixel art). Lethal parts use the dimension's
// hazard colour; harmless parts (mirror panels, currents, bubble columns, time zones, rods,
// chains) never do.
//   Prism Rift  — hot white with a rainbow fringe     Tidal Sky — glowing pink
//   Chrono      — molten gold                         Mirror    — electric violet
import { addAtlas, addTexture, PixelCanvas } from "./px.js";

const WHITE = { d: 0x8a8ab8, m: 0xd8f4ff, l: 0xffffff };
const RAINBOW = [0xff6ad0, 0xffe06a, 0x6affb0, 0x6ad8ff];
const PINK = { d: 0x7a1a5a, m: 0xff3fa8, l: 0xff7ad0, h: 0xffd0f0 };
const GOLD = { d: 0x7a4a00, m: 0xff9a1a, l: 0xffd23f, h: 0xfff4c0 };
const VIOLET = { d: 0x4a1a8a, m: 0x9a3aff, l: 0xc87aff, h: 0xf0d8ff };

// ------------------------------------------------------------------ Prism Rift
function beamTile() {
  // vertical beam: white-hot core, rainbow fringe (tileable 10 x 16)
  const pc = new PixelCanvas(10, 16);
  for (let y = 0; y < 16; y++) {
    pc.set(1, y, RAINBOW[(y >> 2) % 4]).set(8, y, RAINBOW[((y >> 2) + 2) % 4]);
    pc.rect(2, y, 6, 1, WHITE.m).rect(3, y, 4, 1, WHITE.l);
  }
  return pc;
}
function dashTile(col) {
  const pc = new PixelCanvas(4, 12);
  pc.rect(1, 0, 2, 6, col);
  return pc;
}
function emitter() {
  const pc = new PixelCanvas(14, 10);
  pc.poly(
    [
      [1, 9],
      [7, 0],
      [13, 9],
    ],
    0x4a40aa,
  );
  pc.poly(
    [
      [4, 9],
      [7, 3],
      [10, 9],
    ],
    WHITE.l,
  );
  pc.set(7, 4, RAINBOW[0]).set(6, 7, RAINBOW[1]).set(8, 7, RAINBOW[3]);
  return pc.outline(0x05031a, 1);
}
function mirrorPanel(slant) {
  // a silvered panel (harmless): "/" or "\" (16 x 16)
  const pc = new PixelCanvas(16, 16);
  for (let i = 0; i < 14; i++) {
    const x = slant > 0 ? i + 1 : 14 - i;
    pc.rect(x, 14 - i, 2, 2, 0x9aa8c8).set(x, 14 - i, 0xe8f0ff);
  }
  return pc.outline(0x1a1450, 1);
}
function prism(f) {
  const pc = new PixelCanvas(18, 16);
  pc.poly(
    [
      [9, 0],
      [17, 15],
      [1, 15],
    ],
    WHITE.m,
  );
  pc.poly(
    [
      [9, 4],
      [14, 13],
      [4, 13],
    ],
    WHITE.l,
  );
  for (let i = 0; i < 4; i++) pc.set(4 + i * 3, 15, RAINBOW[(i + f) % 4]);
  return pc.outline(WHITE.d, 1);
}
function glassPane() {
  // glass tile (tileable 12 x 16): pale panes with bright hazard-white edges
  const pc = new PixelCanvas(12, 16);
  pc.rect(0, 0, 12, 16, 0x6a70c8);
  pc.rect(1, 0, 10, 16, 0x8a90e0);
  pc.vline(0, 0, 15, WHITE.l).vline(11, 0, 15, WHITE.l);
  pc.line(3, 2, 6, 5, 0xd8e0ff).line(4, 10, 7, 13, 0xd8e0ff);
  return pc;
}
function glassCap() {
  const pc = new PixelCanvas(14, 4);
  pc.rect(0, 0, 14, 4, WHITE.m).hline(0, 13, 0, WHITE.l);
  for (let x = 1; x < 14; x += 3) pc.set(x, 3, RAINBOW[x % 4]);
  return pc.outline(WHITE.d, 1);
}
function crack() {
  const pc = new PixelCanvas(12, 16);
  pc.line(6, 0, 4, 6, 0xffffff).line(4, 6, 8, 10, 0xffffff).line(8, 10, 5, 15, 0xffffff);
  pc.line(4, 6, 1, 8, 0xffffff).line(8, 10, 11, 9, 0xffffff);
  return pc;
}
function shard(f) {
  const pc = new PixelCanvas(8, 8);
  const pts = [
    [
      [1, 0],
      [6, 3],
      [2, 7],
    ],
    [
      [0, 2],
      [7, 1],
      [4, 7],
    ],
    [
      [3, 0],
      [7, 6],
      [0, 5],
    ],
  ][f];
  pc.poly(pts, WHITE.l);
  pc.set(pts[1][0], pts[1][1], RAINBOW[f]);
  return pc.outline(WHITE.d, 1);
}

// ------------------------------------------------------------------ Tidal Sky
function jelly(f) {
  const pc = new PixelCanvas(18, 12);
  const pulse = f ? 1 : 0;
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 18; x++) {
      const d = ((x - 8.5) / (8 - pulse)) ** 2 + ((y - 9) / 9) ** 2;
      if (d <= 1 && y <= 9) pc.set(x, y, d > 0.7 ? PINK.m : PINK.l);
    }
  pc.hline(1 + pulse, 16 - pulse, 9, PINK.d);
  for (let x = 2; x < 17; x += 3) pc.set(x, 10, PINK.m).set(x, 11, PINK.d);
  pc.set(6, 4, PINK.h).set(11, 3, PINK.h).set(8, 2, 0xffffff);
  return pc.outline(0x3a0a2a, 1);
}
function tentacle(lit) {
  const pc = new PixelCanvas(6, 16);
  for (let y = 0; y < 16; y++) {
    const x = 2 + Math.round(Math.sin((y / 16) * Math.PI * 2) * 1.2);
    pc.set(x, y, lit ? PINK.l : 0x8a4a7a);
    if (lit && y % 4 === 0) pc.set(x + 1, y, PINK.h);
  }
  return pc;
}
function mine(f) {
  const pc = new PixelCanvas(20, 20);
  pc.circle(9.5, 9.5, 6.5, 0x2a1a3a);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    pc.line(
      9.5 + Math.cos(a) * 6,
      9.5 + Math.sin(a) * 6,
      9.5 + Math.cos(a) * 9,
      9.5 + Math.sin(a) * 9,
      PINK.m,
    );
    pc.set(9.5 + Math.cos(a) * 9, 9.5 + Math.sin(a) * 9, PINK.l);
  }
  pc.circle(9.5, 9.5, 2.2, f ? PINK.h : PINK.d);
  pc.set(7, 7, 0x6a4a7a);
  return pc.outline(0x12060e, 1);
}
function chainTile(col) {
  const pc = new PixelCanvas(6, 12);
  pc.rect(2, 0, 2, 5, col).rect(1, 6, 4, 5, col).rect(2, 7, 2, 3, null);
  return pc;
}
function currentTile(dir) {
  // flowing streaks (harmless, lagoon colours): tileable 16 x 16, arrows point the flow
  const pc = new PixelCanvas(16, 16);
  for (const x of [2, 8, 13])
    for (let y = 0; y < 16; y += 2) if ((y + x) % 6 < 4) pc.set(x, y, 0x5af0e0);
  const ay = dir < 0 ? 4 : 11;
  pc.set(7, ay, 0xd8ffff)
    .set(6, ay - dir, 0xd8ffff)
    .set(8, ay - dir, 0xd8ffff);
  return pc;
}
function bubbleTile() {
  // round, hollow bubbles of a few sizes (small ones are solid dots) — tileable 24 x 24
  const pc = new PixelCanvas(24, 24);
  for (const [x, y, r] of [
    [6, 5, 3.6],
    [17, 12, 2.6],
    [7, 18, 2.2],
    [19, 21, 1.2],
    [13, 2, 1],
  ]) {
    pc.circle(x, y, r, 0xa8f8ff);
    if (r > 2) pc.circle(x, y, r - 1, null);
    pc.set(Math.round(x - r / 2), Math.round(y - r / 2), 0xffffff);
  }
  return pc;
}

// ------------------------------------------------------------------ Chrono Fracture
function cgear(f) {
  const N = 30;
  const pc = new PixelCanvas(N, N);
  const c = (N - 1) / 2;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - c, y - c);
      const a = Math.atan2(y - c, x - c) + f * 0.13;
      const tooth = Math.cos(a * 10) > 0.3 ? 3 : 0;
      if (d <= 10 + tooth && d > 3.5) pc.set(x, y, d > 10 ? GOLD.l : d > 8 ? GOLD.m : 0x6a4a1a);
    }
  pc.circle(c, c, 2, GOLD.h);
  return pc.outline(0x1a0e02, 1);
}
function pendBlade() {
  const pc = new PixelCanvas(24, 14);
  for (let y = 0; y < 14; y++)
    for (let x = 0; x < 24; x++) {
      const outer = ((x - 11.5) / 11.5) ** 2 + ((y - 0) / 13) ** 2 <= 1;
      const inner = ((x - 11.5) / 8) ** 2 + ((y + 2) / 10) ** 2 <= 1;
      if (outer && !inner) pc.set(x, y, y > 8 ? GOLD.h : GOLD.l);
    }
  pc.rect(10, 0, 4, 4, 0x8a6a3a);
  return pc.outline(0x1a0e02, 1);
}
function rodTile() {
  const pc = new PixelCanvas(4, 8);
  pc.rect(1, 0, 2, 8, 0x8a6a3a).set(1, 3, 0xa88a50);
  return pc;
}
function zoneTile(col, dark) {
  // diagonal time-stripes (harmless), tileable 16 x 16
  const pc = new PixelCanvas(16, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) if ((x + y) % 8 < 2) pc.set(x, y, (x + y) % 16 < 8 ? col : dark);
  return pc;
}
function rblade(f) {
  const pc = new PixelCanvas(18, 18);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + f * 0.26;
    pc.poly(
      [
        [8.5 + Math.cos(a) * 3, 8.5 + Math.sin(a) * 3],
        [8.5 + Math.cos(a + 0.35) * 8.5, 8.5 + Math.sin(a + 0.35) * 8.5],
        [8.5 + Math.cos(a + 0.8) * 4, 8.5 + Math.sin(a + 0.8) * 4],
      ],
      GOLD.l,
    );
  }
  pc.circle(8.5, 8.5, 3, GOLD.m).set(8, 8, GOLD.h);
  return pc.outline(0x1a0e02, 1);
}
function rewindIcon() {
  const pc = new PixelCanvas(13, 7);
  for (const ox of [0, 6])
    pc.poly(
      [
        [ox + 6, 0],
        [ox, 3],
        [ox + 6, 6],
      ],
      GOLD.h,
    );
  return pc;
}
function trackTile() {
  const pc = new PixelCanvas(4, 8);
  pc.set(1, 1, 0x6a5430).set(2, 5, 0x6a5430);
  return pc;
}

// ------------------------------------------------------------------ Mirror Realm
function spireBody() {
  const pc = new PixelCanvas(12, 16);
  pc.rect(2, 0, 8, 16, VIOLET.m).rect(4, 0, 3, 16, VIOLET.l).vline(2, 0, 15, VIOLET.d);
  pc.set(5, 4, VIOLET.h).set(5, 11, VIOLET.h);
  return pc;
}
function spireTip() {
  const pc = new PixelCanvas(12, 12);
  pc.poly(
    [
      [6, 0],
      [11, 11],
      [1, 11],
    ],
    VIOLET.m,
  );
  pc.poly(
    [
      [6, 3],
      [8, 11],
      [4, 11],
    ],
    VIOLET.l,
  );
  pc.set(6, 1, VIOLET.h);
  return pc.outline(0x1a0830, 1);
}
function vorb(f) {
  const pc = new PixelCanvas(16, 16);
  pc.circle(7.5, 7.5, f ? 6.5 : 6, VIOLET.m);
  pc.circle(7.5, 7.5, 4, VIOLET.l);
  pc.circle(6.5, 6.5, 1.5, VIOLET.h);
  return pc.outline(0x1a0830, 1);
}
function vbar() {
  const pc = new PixelCanvas(34, 6);
  pc.rect(0, 1, 34, 4, VIOLET.m).hline(0, 33, 2, VIOLET.l).hline(2, 31, 3, VIOLET.h);
  for (const x of [0, 33]) pc.vline(x, 0, 5, VIOLET.d);
  return pc;
}

export function buildDimensionHazards(scene) {
  addTexture(scene, "dh_beam", beamTile());
  addTexture(scene, "dh_prev", dashTile(0xd8f4ff));
  addTexture(scene, "dh_glass", glassPane());
  addTexture(scene, "dh_tent", tentacle(false));
  addTexture(scene, "dh_tent_lit", tentacle(true));
  addTexture(scene, "dh_chain", chainTile(0x2a4a58));
  addTexture(scene, "dh_cur_up", currentTile(-1));
  addTexture(scene, "dh_cur_down", currentTile(1));
  addTexture(scene, "dh_bubbles", bubbleTile());
  addTexture(scene, "dh_rod", rodTile());
  addTexture(scene, "dh_slow", zoneTile(0xc8a040, 0x8a6a20));
  addTexture(scene, "dh_fast", zoneTile(0xc8402a, 0x8a2a1a));
  addTexture(scene, "dh_track", trackTile());
  addTexture(scene, "dh_spire", spireBody());
  addTexture(scene, "dh_vtrack", dashTile(0x5a3a8a));
  const frames = {
    emitter: emitter(),
    emitter_b: emitter().flipY(),
    mirror_r: mirrorPanel(1),
    mirror_l: mirrorPanel(-1),
    glasscap: glassCap(),
    glasscap_b: glassCap().flipY(),
    crack: crack(),
    pend: pendBlade(),
    rewind: rewindIcon(),
    spiretip: spireTip(),
    spiretip_b: spireTip().flipY(),
    vbar: vbar(),
  };
  for (let f = 0; f < 4; f++) frames[`prism_${f}`] = prism(f);
  for (let f = 0; f < 3; f++) frames[`shard_${f}`] = shard(f);
  for (let f = 0; f < 2; f++) {
    frames[`jelly_${f}`] = jelly(f);
    frames[`mine_${f}`] = mine(f);
    frames[`vorb_${f}`] = vorb(f);
  }
  for (let f = 0; f < 4; f++) {
    frames[`cgear_${f}`] = cgear(f);
    frames[`rblade_${f}`] = rblade(f);
  }
  addAtlas(scene, "dh", frames);
}

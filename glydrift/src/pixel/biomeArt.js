// Pixel biome art generator. One palette + a few style switches per biome produce every tile,
// hazard, decoration and background layer. All assets are original procedural pixel art.
import { addAtlas, addTexture, mix, PixelCanvas, seeded, shade } from "./px.js";
import { EXTRA_KINDS, silhouetteExtra } from "./scenicArt.js";

export const NV = {
  O: 0x040b0d, // outline
  s0: 0x0e2a2c,
  s1: 0x1b4447,
  s2: 0x27595b,
  s3: 0x377878,
  s4: 0x55a39c,
  m: 0x09191c, // mortar
  g0: 0x2a4419, // slime (muted — never the hazard green)
  g1: 0x40622a,
  g2: 0x5a8236,
  // hazard green — used ONLY on things that kill
  k0: 0x14520a,
  k1: 0x36c414,
  k2: 0x8cff3a,
  k3: 0xe4ffc4,
  metal0: 0x23302f,
  metal1: 0x3a4f4e,
  metal2: 0x5d7877,
  metal3: 0x9ab7b4,
  crys0: 0x2f3d73,
  crys1: 0x4a5fa8,
  crys2: 0x8aa0e6,
  // background (darker + desaturated than anything in play, but never a flat black void)
  bg0: 0x06100f,
  bg1: 0x0a1b1c,
  bg2: 0x0e2527,
  bg3: 0x122d2f,
  bg4: 0x183a3b,
  rain: 0x86c0c6,
  bgDetail: 0x24504c,
  bgHang: 0x0e2224,
  bgNear: 0x132e30,
  sky: ["#050f10", "#0c2426", "#123032", "#081618"],
  // distant ruins (lighter than the near layers: atmospheric haze) + soft glow spots
  haze: 0x1c4343,
  hazeRim: 0x2c5c5a,
  hazeLit: 0x5fd0b4,
  glow: 0x2e8a78,
};

let C = NV; // palette currently being built

// ------------------------------------------------------------------ helpers
function spikeRow(pc, x0, y0, count, w, h, down = true) {
  for (let i = 0; i < count; i++) {
    const x = x0 + i * w;
    const tip = down ? y0 + h : y0 - h;
    pc.poly(
      [
        [x, y0],
        [x + w, y0],
        [x + w / 2, tip],
      ],
      C.k2,
    );
  }
  // shade: right half darker, a pale glint near each tip
  for (let y = 0; y < pc.h; y++)
    for (let x = 0; x < pc.w; x++) {
      if (pc.get(x, y) !== C.k2) continue;
      const local = (x - x0) % w;
      if (local >= w / 2 + 0.5 && (pc.get(x + 1, y) !== C.k2 || local === w - 1))
        pc.set(x, y, C.k1);
      const fromTip = down ? y0 + h - y : y - (y0 - h);
      if (fromTip < 2.5 && local < w / 2) pc.set(x, y, C.k3);
    }
}

function speckle(pc, rnd, colors, n, area = [0, 0, pc.w, pc.h], only = null) {
  for (let i = 0; i < n; i++) {
    const x = area[0] + Math.floor(rnd() * area[2]);
    const y = area[1] + Math.floor(rnd() * area[3]);
    if (only && !only.includes(pc.get(x, y))) continue;
    pc.set(x, y, colors[Math.floor(rnd() * colors.length)]);
  }
}

function crack(pc, rnd, x, y, len) {
  for (let i = 0; i < len; i++) {
    pc.set(x, y, C.s0);
    x += rnd() < 0.5 ? 1 : 0;
    y += 1;
    if (rnd() < 0.3) x -= 1;
  }
}

// ------------------------------------------------------------------ pillar tiles (16x16, tile vertically)
function pillarEdges(pc) {
  for (let y = 0; y < 16; y++) {
    pc.set(0, y, C.O).set(1, y, C.O).set(14, y, C.O).set(15, y, C.O);
    if (pc.get(2, y) !== C.m) pc.set(2, y, shade(pc.get(2, y) ?? C.s2, 0.35));
    if (pc.get(13, y) !== C.m) pc.set(13, y, C.s0);
  }
}

/** Pillar art width (art px). Tiles are authored 16 wide and widened by repeating the interior. */
export const PILLAR_W = 28;
function widen(pc, shiftY = 0) {
  const out = new PixelCanvas(PILLAR_W, pc.h);
  const extra = PILLAR_W - 16;
  for (let y = 0; y < pc.h; y++) {
    for (let x = 0; x < 14; x++) out.set(x, y, pc.get(x, y));
    for (let i = 0; i < extra; i++) out.set(14 + i, y, pc.get(3 + (i % 10), (y + shiftY) % pc.h));
    out.set(PILLAR_W - 2, y, pc.get(14, y)).set(PILLAR_W - 1, y, pc.get(15, y));
    // keep the right-hand shadow column on the new right edge
    if (out.get(PILLAR_W - 3, y) !== C.m) out.set(PILLAR_W - 3, y, C.s0);
    if (out.get(13, y) === C.s0) out.set(13, y, pc.get(12, y));
  }
  return out;
}

function pillarBrick(seed) {
  const rnd = seeded(seed);
  const pc = new PixelCanvas(16, 16).rect(0, 0, 16, 16, C.s2);
  for (const my of [3, 7, 11, 15]) pc.hline(2, 13, my, C.m);
  const joints = [[8], [5, 11], [8], [5, 11]];
  joints.forEach((xs, row) => {
    for (const jx of xs) pc.vline(jx, row * 4, row * 4 + 2, C.m);
    for (let x = 2; x < 14; x++) {
      if (pc.get(x, row * 4) !== C.m) pc.set(x, row * 4, C.s3);
      if (pc.get(x, row * 4 + 2) !== C.m) pc.set(x, row * 4 + 2, C.s1);
    }
  });
  crack(pc, rnd, 4 + Math.floor(rnd() * 7), 1 + Math.floor(rnd() * 6), 4);
  speckle(pc, rnd, [C.g1, C.g0], 5, [2, 0, 12, 16], [C.s2, C.s1]);
  pillarEdges(pc);
  return pc;
}

function pillarColumn(seed) {
  const rnd = seeded(seed);
  const pc = new PixelCanvas(16, 16).rect(0, 0, 16, 16, C.s2);
  for (const gx of [5, 10]) {
    pc.vline(gx, 0, 15, C.s0);
    pc.vline(gx - 1, 0, 15, C.s3);
  }
  pc.hline(2, 13, 0, C.s4).hline(2, 13, 1, C.s3).hline(2, 13, 2, C.s1).hline(2, 13, 3, C.m);
  crack(pc, rnd, 7, 5 + Math.floor(rnd() * 5), 5);
  speckle(pc, rnd, [C.g1, C.g2], 4, [2, 4, 12, 12], [C.s2]);
  pillarEdges(pc);
  return pc;
}

function pillarBlocks(seed) {
  const rnd = seeded(seed);
  const pc = new PixelCanvas(16, 16).rect(0, 0, 16, 16, C.s2);
  pc.hline(2, 13, 7, C.m).hline(2, 13, 15, C.m);
  pc.vline(9, 0, 6, C.m).vline(6, 8, 14, C.m);
  for (const [y0, y1] of [
    [0, 6],
    [8, 14],
  ]) {
    pc.hline(2, 13, y0, C.s4);
    pc.hline(2, 13, y0 + 1, C.s3);
    pc.hline(2, 13, y1, C.s1);
  }
  pc.vline(9, 0, 6, C.m).vline(6, 8, 14, C.m);
  crack(pc, rnd, 3 + Math.floor(rnd() * 4), 2, 4);
  crack(pc, rnd, 10, 9, 4);
  speckle(pc, rnd, [C.g0, C.g1], 4, [2, 0, 12, 16], [C.s2, C.s1]);
  pillarEdges(pc);
  return pc;
}

/** End cap facing the gap: stone lip + slime + a row of bright spikes (PILLAR_W x 12, spikes down). */
function gateCap(seed) {
  const rnd = seeded(seed);
  const W = PILLAR_W;
  const pc = new PixelCanvas(W, 12);
  pc.rect(2, 0, W - 4, 3, C.s2)
    .hline(2, W - 3, 0, C.s3)
    .hline(2, W - 3, 2, C.s1);
  pc.vline(0, 0, 3, C.O)
    .vline(1, 0, 3, C.O)
    .vline(W - 2, 0, 3, C.O)
    .vline(W - 1, 0, 3, C.O);
  pc.hline(0, W - 1, 3, C.O);
  // slime lip with a couple of drips (muted green — decor)
  pc.hline(2, W - 3, 2, C.g1);
  for (let i = 0; i < 3; i++) pc.set(3 + Math.floor(rnd() * (W - 6)), 3, C.g2);
  const n = Math.floor((W - 4) / 8);
  spikeRow(pc, (W - n * 8) / 2, 4, n, 8, 8, true); // big triangular spikes along the pillar end
  // outline only the spikes (keeps the block outline crisp)
  const sp = new PixelCanvas(W, 12);
  for (let y = 4; y < 12; y++) for (let x = 0; x < W; x++) sp.set(x, y, pc.get(x, y));
  sp.outline(C.O, 1);
  for (let y = 4; y < 12; y++)
    for (let x = 0; x < W; x++) if (sp.get(x, y) !== null) pc.set(x, y, sp.get(x, y));
  return pc;
}

// ------------------------------------------------------------------ terrain walls
function wallTile() {
  const rnd = seeded(41);
  const pc = new PixelCanvas(32, 32).rect(0, 0, 32, 32, C.s1);
  // irregular stone courses
  let y = 0;
  while (y < 32) {
    const h = 5 + Math.floor(rnd() * 3);
    let x = -Math.floor(rnd() * 6);
    while (x < 32) {
      const w = 6 + Math.floor(rnd() * 8);
      const base = rnd() < 0.5 ? C.s1 : C.s2;
      for (let j = 0; j < h - 1; j++)
        for (let i = 0; i < w - 1; i++) pc.set((x + i + 32) % 32, (y + j) % 32, base);
      for (let i = 0; i < w - 1; i++) pc.set((x + i + 32) % 32, y % 32, shade(base, 0.22));
      for (let i = 0; i < w - 1; i++) pc.set((x + i + 32) % 32, (y + h - 2) % 32, C.s0);
      for (let j = 0; j < h; j++) pc.set((x + w - 1 + 32) % 32, (y + j) % 32, C.m);
      x += w;
    }
    for (let i = 0; i < 32; i++) pc.set(i, (y + h - 1) % 32, C.m);
    y += h;
  }
  speckle(pc, rnd, [C.g0, C.g1], 22, [0, 0, 32, 32], [C.s1, C.s2]);
  speckle(pc, rnd, [C.s0], 16);
  return pc;
}

/** Wall surface: slime lip + spike row pointing down into the playfield (32x10). */
function wallEdge() {
  const rnd = seeded(77);
  const pc = new PixelCanvas(32, 11);
  pc.rect(0, 0, 32, 3, C.s1).hline(0, 31, 0, C.s2);
  pc.hline(0, 31, 2, C.g1).hline(0, 31, 3, C.O);
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(rnd() * 32);
    pc.set(x, 2, C.g2).set(x, 1, C.g1);
  }
  spikeRow(pc, 0, 4, 4, 8, 7, true);
  const sp = new PixelCanvas(32, 11);
  for (let y = 4; y < 11; y++) for (let x = 0; x < 32; x++) sp.set(x, y, pc.get(x, y));
  sp.outline(C.O, 1);
  for (let y = 4; y < 11; y++)
    for (let x = 0; x < 32; x++) if (sp.get(x, y) !== null) pc.set(x, y, sp.get(x, y));
  return pc;
}

// ------------------------------------------------------------------ hazards
function saw(r) {
  const size = r * 2 + 4;
  const c = size / 2;
  const pc = new PixelCanvas(size, size);
  const teeth = Math.max(8, Math.round((Math.PI * 2 * r) / 5));
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2) / teeth;
    const am = a0 + (a1 - a0) * 0.3;
    pc.poly(
      [
        [c + Math.cos(a0) * (r - 3), c + Math.sin(a0) * (r - 3)],
        [c + Math.cos(am) * (r + 0.6), c + Math.sin(am) * (r + 0.6)],
        [c + Math.cos(a1) * (r - 3), c + Math.sin(a1) * (r - 3)],
      ],
      C.k2,
    );
  }
  pc.circle(c - 0.5, c - 0.5, r - 3, C.metal1);
  pc.circle(c - 0.5, c - 0.5, r - 5.5, C.metal0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    pc.line(
      c - 0.5 + Math.cos(a) * 2,
      c - 0.5 + Math.sin(a) * 2,
      c - 0.5 + Math.cos(a) * (r - 5),
      c - 0.5 + Math.sin(a) * (r - 5),
      C.metal2,
    );
  }
  pc.circle(c - 0.5, c - 0.5, 2.2, C.metal3);
  pc.set(Math.floor(c - 0.5), Math.floor(c - 0.5), C.O);
  // tooth tip highlights
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (pc.get(x, y) !== C.k2) continue;
      const dx = x - c;
      const dy = y - c;
      if (dx * dx + dy * dy > (r - 0.8) ** 2) pc.set(x, y, C.k3);
      else if (dy > 0 && dx > 0) pc.set(x, y, C.k1);
    }
  // metal shading: highlight upper-left rim, shadow lower-right rim
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (pc.get(x, y) !== C.metal1) continue;
      const dx = x - c;
      const dy = y - c;
      const d = Math.hypot(dx, dy);
      if (d > r - 4.6) pc.set(x, y, dx + dy < 0 ? C.metal2 : C.metal0);
    }
  pc.outline(C.O, 1);
  return pc;
}

function axe() {
  const pc = new PixelCanvas(30, 22);
  const cx = 15;
  const cy = 11;
  for (const s of [-1, 1]) {
    const ox = cx + s * 7;
    const crescent = new PixelCanvas(30, 22).ellipse(ox, cy, 7, 9.5, C.metal2);
    const cut = new PixelCanvas(30, 22).ellipse(ox - s * 4, cy, 6, 8, 1);
    for (let y = 0; y < 22; y++)
      for (let x = 0; x < 30; x++) {
        const v = crescent.get(x, y);
        if (v === null || cut.get(x, y) !== null) continue;
        if ((s > 0 && x < cx) || (s < 0 && x > cx)) continue;
        pc.set(x, y, v);
      }
  }
  // sharp outer edge = hazard green
  const src = pc.d.slice();
  for (let y = 0; y < 22; y++)
    for (let x = 0; x < 30; x++) {
      if (src[y * 30 + x] === null) continue;
      const outer =
        (x < cx && (x === 0 || src[y * 30 + x - 1] === null)) ||
        (x > cx && (x === 29 || src[y * 30 + x + 1] === null));
      if (outer) {
        pc.set(x, y, C.k2);
        pc.set(x + (x < cx ? 1 : -1), y, C.k1);
      }
    }
  pc.rect(cx - 2, cy - 4, 5, 9, C.metal1).rect(cx - 1, cy - 3, 3, 7, C.metal2);
  pc.circle(cx, cy, 2.2, C.metal3).set(cx, cy, C.O);
  pc.autoShade(0.2, -0.3);
  pc.outline(C.O, 1);
  return pc;
}

function chainTile() {
  const pc = new PixelCanvas(6, 8);
  pc.rect(1, 0, 4, 5, C.metal2).rect(2, 1, 2, 3, null).set(2, 1, null);
  pc.vline(1, 0, 4, C.metal3);
  pc.rect(2, 5, 2, 3, C.metal1);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 6; x++)
      if (pc.get(x, y) === null && (x === 0 || x === 5)) pc.set(x, y, null);
  return pc;
}

function emitter() {
  const pc = new PixelCanvas(12, 12);
  pc.rect(1, 1, 10, 10, C.s2)
    .hline(1, 10, 1, C.s4)
    .vline(1, 1, 10, C.s3)
    .hline(1, 10, 10, C.s0)
    .vline(10, 1, 10, C.s0);
  pc.rect(4, 4, 4, 4, C.k1).rect(5, 5, 2, 2, C.k3);
  pc.outline(C.O, 1);
  return pc;
}

function beamV() {
  // hot core: hazard-colour rims around a white-hot centre, with bright sparks
  const pc = new PixelCanvas(4, 8);
  for (let y = 0; y < 8; y++)
    pc.set(0, y, C.k2).set(1, y, C.k3).set(2, y, 0xffffff).set(3, y, C.k2);
  pc.set(1, 3, 0xffffff).set(0, 5, C.k3).set(3, 1, C.k3);
  return pc;
}
function beamH() {
  const pc = new PixelCanvas(8, 4);
  for (let x = 0; x < 8; x++)
    pc.set(x, 0, C.k2).set(x, 1, C.k3).set(x, 2, 0xffffff).set(x, 3, C.k2);
  pc.set(3, 1, 0xffffff).set(5, 0, C.k3).set(1, 3, C.k3);
  return pc;
}
/** Stepped pixel glow around a beam (drawn additively): dithered outer band → solid inner band. */
function beamGlow(horizontal) {
  const N = 14;
  const pc = new PixelCanvas(horizontal ? 8 : N, horizontal ? N : 8);
  for (let a = 0; a < 8; a++)
    for (let b = 0; b < N; b++) {
      const d = Math.abs(b - (N - 1) / 2); // 0.5 … 6.5 from the centre
      let c = null;
      if (d < 2) c = C.k1;
      else if (d < 3.5) c = (a + b) % 2 === 0 ? C.k1 : C.k0;
      else if (d < 5)
        c = (a + b) % 2 === 0 ? C.k0 : null; // dither fade-out
      else if ((a + 2 * b) % 4 === 0) c = C.k0;
      if (horizontal) pc.set(a, b, c);
      else pc.set(b, a, c);
    }
  return pc;
}

// ------------------------------------------------------------------ decorations (harmless)
function torch(f) {
  const pc = new PixelCanvas(7, 14);
  // flame (warm, not hazard-green)
  const flames = [
    ["..y..", ".yoy.", "yoroy", "yorry", ".yrry", "..ro."],
    [".y...", "..yo.", ".yory", "yorry", "yoory", ".yry."],
    ["...y.", ".oy..", "yoroy", "yrory", ".yrry", "..ry."],
  ][f];
  pc.stamp(1, 0, flames, C.flame || { y: 0xfff3a0, o: 0xffb02e, r: 0xff6a1a });
  pc.rect(1, 6, 5, 2, C.metal2).hline(1, 5, 6, C.metal3);
  pc.rect(2, 8, 3, 5, C.metal1).vline(2, 8, 12, C.metal2);
  pc.rect(0, 12, 7, 2, C.s3).hline(0, 6, 12, C.s4);
  const out = new PixelCanvas(7, 14);
  for (let y = 6; y < 14; y++) for (let x = 0; x < 7; x++) out.set(x, y, pc.get(x, y));
  out.outline(C.O, 1);
  for (let y = 6; y < 14; y++)
    for (let x = 0; x < 7; x++) if (out.get(x, y) !== null) pc.set(x, y, out.get(x, y));
  return pc;
}

function eyes(f) {
  const pc = new PixelCanvas(11, 6);
  pc.ellipse(5, 3, 5, 2.6, 0x020506);
  if (f === 0) {
    pc.rect(2, 2, 2, 2, C.eye || 0xe6f2c0).rect(7, 2, 2, 2, C.eye || 0xe6f2c0);
    pc.set(3, 3, 0x1a1a1a).set(8, 3, 0x1a1a1a);
  } else if (f === 1) {
    pc.hline(2, 3, 3, C.eye || 0xe6f2c0).hline(7, 8, 3, C.eye || 0xe6f2c0);
  } else {
    pc.hline(2, 3, 3, 0x2b3e30).hline(7, 8, 3, 0x2b3e30);
  }
  return pc;
}

function crystal(seed) {
  const rnd = seeded(seed);
  const pc = new PixelCanvas(10, 13);
  const shard = (x, h, w) =>
    pc.poly(
      [
        [x - w, 12],
        [x - w, 12 - h * 0.7],
        [x, 12 - h],
        [x + w, 12 - h * 0.7],
        [x + w, 12],
      ],
      C.crys1,
    );
  shard(5, 10 + Math.floor(rnd() * 2), 2);
  shard(2.5, 6, 1.5);
  shard(7.5, 7, 1.5);
  pc.autoShade(0.35, -0.35);
  for (let y = 2; y < 9; y++) if (pc.get(5, y) !== null) pc.set(4, y, C.crys2);
  pc.outline(C.O, 1);
  return pc;
}

// ------------------------------------------------------------------ background layers (dark, soft)
function skyCanvas(scene, key) {
  // soft vertical gradient (the one non-pixel element: a backdrop should be soft)
  const cv = document.createElement("canvas");
  cv.width = 4;
  cv.height = 256;
  const ctx = cv.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  const st = C.sky || ["#020708", "#071a1d", "#0a2124", "#040b0d"];
  g.addColorStop(0, st[0]);
  g.addColorStop(0.45, st[1]);
  g.addColorStop(0.75, st[2]);
  g.addColorStop(1, st[3]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, cv);
}

function silhouette(w, h, seed, { base, rim, detail, kind }) {
  const rnd = seeded(seed);
  const pc = new PixelCanvas(w, h);
  if (kind === "cliffs") {
    let y = h * 0.45;
    for (let x = 0; x < w; x++) {
      y += (rnd() - 0.5) * 3;
      if (x % 37 === 0) y -= 6;
      y = Math.max(h * 0.15, Math.min(h * 0.7, y));
      const top = Math.round(y + Math.sin((x / w) * Math.PI * 2) * 4);
      pc.vline(x, top, h - 1, base);
      pc.set(x, top, rim);
    }
    // wrap seam: blend last columns into the first
    for (let x = w - 6; x < w; x++) {
      let top = 0;
      while (top < h && pc.get(0, top) === null) top++;
      for (let yy = 0; yy < h; yy++) pc.set(x, yy, yy >= top ? base : null);
      pc.set(x, top, rim);
    }
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(rnd() * w);
      let top = 0;
      while (top < h && pc.get(x, top) === null) top++;
      pc.rect(x, top + 4 + Math.floor(rnd() * 10), 2, 2, detail);
    }
  } else if (kind === "ruins") {
    const ground = h - 10;
    pc.rect(0, ground, w, 10, base);
    pc.hline(0, w - 1, ground, rim);
    let x = 4;
    while (x < w - 20) {
      const pw = 6 + Math.floor(rnd() * 4);
      const ph = 22 + Math.floor(rnd() * 26);
      pc.rect(x, ground - ph, pw, ph, base);
      pc.vline(x, ground - ph, ground, rim);
      pc.hline(x - 1, x + pw, ground - ph, rim);
      if (rnd() < 0.6) {
        // arch to the next column
        const span = 12 + Math.floor(rnd() * 8);
        const ay = ground - ph + 4;
        for (let i = 0; i <= span; i++) {
          const yy = ay - Math.round(Math.sin((i / span) * Math.PI) * 6);
          pc.vline(x + pw + i, yy, yy + 3, base);
          pc.set(x + pw + i, yy, rim);
        }
        pc.rect(x + pw + span, ay - 2, pw, ground - ay + 2, base);
        x += pw + span + pw + 6 + Math.floor(rnd() * 10);
      } else {
        x += pw + 8 + Math.floor(rnd() * 14);
      }
    }
    for (let i = 0; i < 6; i++)
      pc.set(Math.floor(rnd() * w), ground - 2 - Math.floor(rnd() * 30), detail);
  } else if (kind === "roots") {
    for (let x = 0; x < w; x++) pc.vline(x, 0, 2 + Math.round(Math.sin(x * 0.3) + 1), base);
    let x = 1;
    while (x < w - 2) {
      const len = 10 + Math.floor(rnd() * (h - 12));
      let cx = x;
      for (let y = 2; y < len; y++) {
        if (rnd() < 0.18) cx += rnd() < 0.5 ? -1 : 1;
        pc.set(cx, y, base);
        if (rnd() < 0.12) pc.set(cx + 1, y, rim); // leaf
      }
      if (rnd() < 0.5) pc.set(cx, len, detail).set(cx, len + 1, detail);
      x += 3 + Math.floor(rnd() * 9);
    }
  } else if (kind === "stalactites" || kind === "stalagmites") {
    const down = kind === "stalactites";
    for (let x = 0; x < w; x++) {
      const base4 = 4 + Math.round(Math.sin(x * 0.21) * 2 + Math.sin(x * 0.07) * 2);
      for (let y = 0; y < base4; y++) pc.set(x, down ? y : h - 1 - y, base);
    }
    let x = 2;
    while (x < w - 4) {
      const len = 8 + Math.floor(rnd() * (h - 12));
      const wd = 3 + Math.floor(rnd() * 4);
      for (let i = 0; i < len; i++) {
        const half = Math.max(0, Math.round(wd * (1 - i / len)));
        for (let dx = -half; dx <= half; dx++) pc.set(x + wd + dx, down ? 3 + i : h - 4 - i, base);
        pc.set(x + wd - half, down ? 3 + i : h - 4 - i, rim);
      }
      if (down && rnd() < 0.4) pc.set(x + wd, 3 + len + 1, detail); // drip
      x += wd * 2 + 2 + Math.floor(rnd() * 8);
    }
  }
  return pc;
}

// ------------------------------------------------------------------ metal style (Glitch Realm)
function pillarPlates(seed) {
  const rnd = seeded(seed);
  const pc = new PixelCanvas(16, 16).rect(0, 0, 16, 16, C.s2);
  pc.hline(2, 13, 0, C.s4)
    .hline(2, 13, 1, C.s3)
    .hline(2, 13, 7, C.m)
    .hline(2, 13, 8, C.s3)
    .hline(2, 13, 15, C.m);
  for (const [x, y] of [
    [4, 3],
    [11, 3],
    [4, 11],
    [11, 11],
  ])
    pc.set(x, y, C.s4).set(x + 1, y + 1, C.s0);
  // circuit trace (muted — decoration)
  let x = 5 + Math.floor(rnd() * 6);
  for (let y = 2; y < 15; y++) {
    if (y === 7 || y === 8) continue;
    pc.set(x, y, C.g1);
    if (rnd() < 0.25 && x < 12) {
      pc.set(x + 1, y, C.g1);
      x += 1;
    }
  }
  pc.set(x, 13, C.g2);
  pillarEdges(pc);
  return pc;
}

function pillarVents(seed) {
  const rnd = seeded(seed);
  const pc = new PixelCanvas(16, 16).rect(0, 0, 16, 16, C.s1);
  for (let y = 1; y < 16; y += 3) pc.hline(4, 11, y, C.s0).hline(4, 11, y + 1, C.s3);
  pc.vline(3, 0, 15, C.s3).vline(12, 0, 15, C.s0);
  if (rnd() < 0.7) pc.set(13, 4 + Math.floor(rnd() * 8), C.g2);
  pillarEdges(pc);
  return pc;
}

function wallPlates() {
  const rnd = seeded(91);
  const pc = new PixelCanvas(32, 32).rect(0, 0, 32, 32, C.s1);
  for (const [x0, y0, w, h] of [
    [0, 0, 16, 12],
    [16, 0, 16, 8],
    [16, 8, 16, 12],
    [0, 12, 10, 20],
    [10, 12, 6, 20],
    [16, 20, 16, 12],
  ]) {
    pc.rect(x0, y0, w - 1, h - 1, C.s2)
      .hline(x0, x0 + w - 2, y0, C.s3)
      .vline(x0, y0, y0 + h - 2, C.s3);
    pc.hline(x0, x0 + w - 1, y0 + h - 1, C.m).vline(x0 + w - 1, y0, y0 + h - 1, C.m);
    pc.set(x0 + 2, y0 + 2, C.s4).set(x0 + w - 4, y0 + h - 4, C.s0);
  }
  for (let i = 0; i < 4; i++) {
    let x = Math.floor(rnd() * 30);
    const y = Math.floor(rnd() * 30);
    for (let k = 0; k < 6; k++) pc.set((x += 1) % 32, y, C.g1);
  }
  return pc;
}

// ------------------------------------------------------------------ lamp variants (decor, 7x14 frames)
function orbLamp(f) {
  const rnd = seeded(13 + f * 7);
  const pc = new PixelCanvas(7, 14);
  pc.circle(3, 4, 2.8, C.flame?.o ?? 0x8a6ad0);
  pc.circle(3, 4, 1.5, C.flame?.y ?? 0xffffff);
  for (let i = 0; i < 3; i++)
    pc.set(Math.floor(rnd() * 7), Math.floor(rnd() * 8), C.flame?.y ?? 0xffffff);
  pc.rect(2, 8, 3, 4, C.metal1).vline(2, 8, 11, C.metal2);
  pc.rect(0, 12, 7, 2, C.s3).hline(0, 6, 12, C.s4);
  return pc;
}

function screenLamp(f) {
  const pc = new PixelCanvas(7, 14);
  pc.rect(0, 2, 7, 7, C.metal1).rect(1, 3, 5, 5, 0x05080a);
  const cols = [C.flame?.y ?? 0x2bffef, C.flame?.o ?? 0xff5ad8, C.flame?.r ?? 0xffffff];
  for (let y = 3; y < 8; y++)
    if ((y + f) % 2 === 0) pc.hline(1, 1 + ((y * 3 + f * 2) % 5), y, cols[(y + f) % 3]);
  pc.rect(3, 9, 1, 3, C.metal2);
  pc.rect(1, 12, 5, 2, C.s3);
  pc.outline(C.O, 1);
  return pc;
}

// ------------------------------------------------------------------ extra silhouette kinds
function silhouette2(w, h, seed, { base, rim, detail, kind }) {
  const rnd = seeded(seed);
  const pc = new PixelCanvas(w, h);
  if (kind === "city") {
    let x = 0;
    while (x < w) {
      const bw = 8 + Math.floor(rnd() * 14);
      const bh = 18 + Math.floor(rnd() * (h - 22));
      pc.rect(x, h - bh, Math.min(bw, w - x), bh, base);
      pc.hline(x, Math.min(x + bw, w) - 1, h - bh, rim);
      for (let wy = h - bh + 3; wy < h - 2; wy += 4)
        for (let wx = x + 2; wx < Math.min(x + bw, w) - 2; wx += 3)
          if (rnd() < 0.18) pc.set(wx, wy, detail);
      if (rnd() < 0.4) pc.vline(x + Math.floor(bw / 2), h - bh - 5, h - bh, rim);
      x += bw + Math.floor(rnd() * 3);
    }
  } else if (kind === "cables" || kind === "chains") {
    for (let x = 0; x < w; x++) pc.vline(x, 0, 2, base);
    let x = 0;
    while (x < w - 10) {
      const span = 16 + Math.floor(rnd() * 26);
      const sag = 8 + Math.floor(rnd() * (h - 16));
      for (let i = 0; i <= span; i++) {
        const t = i / span;
        const y = 2 + Math.round(Math.sin(t * Math.PI) * sag);
        if (kind === "chains") {
          if (i % 3 !== 1) pc.set(x + i, y, base);
          else pc.set(x + i, y - 1, base).set(x + i, y + 1, base);
        } else pc.set(x + i, y, base).set(x + i, y + 1, rim);
      }
      if (rnd() < 0.5) pc.set(x + Math.floor(span / 2), 2 + sag + 2, detail);
      x += Math.floor(span * (0.4 + rnd() * 0.5));
    }
  } else if (kind === "icicles") {
    for (let x = 0; x < w; x++) pc.vline(x, 0, 3 + Math.round(Math.sin(x * 0.4)), base);
    let x = 1;
    while (x < w - 2) {
      const len = 6 + Math.floor(rnd() * (h - 8));
      for (let y = 0; y < len; y++) {
        const half = Math.round(2 * (1 - y / len));
        for (let dx = -half; dx <= half; dx++) pc.set(x + dx + 2, y, base);
        pc.set(x + 2 - half, y, rim);
      }
      x += 4 + Math.floor(rnd() * 6);
    }
  }
  return pc;
}

/** Soft glow spot in pixel steps: solid core → bands → dithered fringe (drawn additively). */
function glowSpot(color) {
  const N = 32;
  const pc = new PixelCanvas(N, N);
  const c = (N - 1) / 2;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d < 5) pc.set(x, y, color);
      else if (d < 9) pc.set(x, y, shade(color, -0.35));
      else if (d < 12.5) pc.set(x, y, shade(color, -0.6));
      else if (d < 15.5 && (x + y) % 2 === 0) pc.set(x, y, shade(color, -0.72));
    }
  return pc;
}

/**
 * Build every texture + the sprite atlas for one biome.
 * cfg: { pillar: "stone"|"metal", lamp: "torch"|"orb"|"screen", far, mid, hang (silhouette kinds) }
 */
export function buildBiome(scene, prefix, palette, cfg) {
  C = palette;
  const metal = cfg.pillar === "metal";
  const p = (k) => `${prefix}_${k}`;
  if (metal) {
    addTexture(scene, p("pillar_0"), widen(pillarPlates(3)));
    addTexture(scene, p("pillar_1"), widen(pillarVents(5)));
    addTexture(scene, p("pillar_2"), widen(pillarPlates(9)));
    addTexture(scene, p("wall"), wallPlates());
  } else {
    addTexture(scene, p("pillar_0"), widen(pillarBrick(3), 4));
    addTexture(scene, p("pillar_1"), widen(pillarColumn(5)));
    addTexture(scene, p("pillar_2"), widen(pillarBlocks(9), 8));
    addTexture(scene, p("wall"), wallTile());
  }
  addTexture(scene, p("edge"), wallEdge());
  addTexture(scene, p("edge_b"), wallEdge().flipY());
  addTexture(scene, p("chain"), chainTile());
  addTexture(scene, p("beam_v"), beamV());
  addTexture(scene, p("beam_h"), beamH());
  addTexture(scene, p("glow_v"), beamGlow(false));
  addTexture(scene, p("glow_h"), beamGlow(true));
  skyCanvas(scene, p("sky"));
  const sil = (kind, w, h, seed, colors) =>
    EXTRA_KINDS.includes(kind)
      ? silhouetteExtra(w, h, seed, { ...colors, kind })
      : ["city", "cables", "chains", "icicles"].includes(kind)
        ? silhouette2(w, h, seed, { ...colors, kind })
        : silhouette(w, h, seed, { ...colors, kind });
  addTexture(
    scene,
    p("far"),
    sil(cfg.far || "cliffs", 192, 70, 11, { base: C.bg2, rim: C.bg3, detail: C.bg4 }),
  );
  addTexture(
    scene,
    p("mid"),
    sil(cfg.mid || "ruins", 176, 80, 23, { base: C.bg3, rim: C.bg4, detail: C.bgDetail }),
  );
  // distant hazy ruins in the middle of the screen, with a few lit windows
  const haze = C.haze ?? mix(C.bg4, C.s1, 0.35);
  addTexture(
    scene,
    p("distant"),
    sil(cfg.distant || "ruins", 200, 64, 71, {
      base: haze,
      rim: C.hazeRim ?? shade(haze, 0.25),
      detail: C.hazeLit ?? shade(haze, 0.6),
    }),
  );
  addTexture(scene, p("glowspot"), glowSpot(C.glow ?? mix(C.bg4, C.s4, 0.5)));
  addTexture(
    scene,
    p("roots"),
    sil(cfg.hang || "roots", 160, 90, 53, { base: C.bgHang, rim: C.bg3, detail: C.bgDetail }),
  );
  addTexture(
    scene,
    p("near_top"),
    sil(cfg.nearTop || "stalactites", 128, 40, 31, {
      base: C.bgNear,
      rim: C.bg4,
      detail: C.bgDetail,
    }),
  );
  addTexture(
    scene,
    p("near_bot"),
    sil(cfg.nearBot || "stalagmites", 128, 40, 37, {
      base: C.bgNear,
      rim: C.bg4,
      detail: C.bgDetail,
    }),
  );
  const lamp = cfg.lamp === "orb" ? orbLamp : cfg.lamp === "screen" ? screenLamp : torch;
  const frames = {
    cap_0: gateCap(1),
    cap_1: gateCap(2),
    saw_10: saw(10),
    saw_12: saw(12),
    saw_14: saw(14),
    saw_16: saw(16),
    axe: axe(),
    emitter: emitter(),
    torch_0: lamp(0),
    torch_1: lamp(1),
    torch_2: lamp(2),
    eyes_0: eyes(0),
    eyes_1: eyes(1),
    eyes_2: eyes(2),
    crystal_0: crystal(3),
    crystal_1: crystal(8),
  };
  frames.cap_0b = frames.cap_0.flipY();
  frames.cap_1b = frames.cap_1.flipY();
  addAtlas(scene, prefix, frames);
  C = NV;
}

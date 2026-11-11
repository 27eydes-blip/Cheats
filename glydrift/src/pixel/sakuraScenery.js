// Sakura Skies: a warm golden-hour daytime realm. Its palette, background layers (far peaks,
// floating islands with waterfalls and pagodas, cherry boughs, a blossom grove with a temple,
// paper-lantern strings, a koi pond under a stone bridge), the temple-roof top wall and its
// sprites (the low sun, distant birds, tumbling petals, stone lanterns). Every layer tiles
// horizontally and is original procedural pixel art.
//
// Colour rule: the scenery is soft and light (pinks, peach, gold, sage, dusty violet) and has
// no dark outlines and no deep red; deep red with a dark outline means "this kills you" here.
import { PixelCanvas, seeded } from "./px.js";

export const SAKURA = {
  O: 0x1a0c14,
  // dark slate-plum stone (pillars + walls): frames the bright sky and reads as solid
  s0: 0x2c2232,
  s1: 0x3e3246,
  s2: 0x54465a,
  s3: 0x6e5e72,
  s4: 0x94829a,
  m: 0x1c1420,
  g0: 0xb05878, // fallen petals / blossom moss (decor)
  g1: 0xd87898,
  g2: 0xffa8c4,
  // deep red: hazards only
  k0: 0x4a0012,
  k1: 0x96081e,
  k2: 0xd0102a,
  k3: 0xff8a96,
  metal0: 0x2a2228,
  metal1: 0x463a42,
  metal2: 0x6a5a62,
  metal3: 0xa8949c,
  crys0: 0x8a4a6a, // rose quartz
  crys1: 0xd88aa8,
  crys2: 0xffd0e0,
  bg0: 0xffd8b8,
  bg1: 0xf6c0b0,
  bg2: 0xb07a8c,
  bg3: 0x8a9e70,
  bg4: 0xa8b888,
  bgDetail: 0xffc4d6,
  bgHang: 0x6a3e56,
  bgNear: 0xe0789c,
  // golden hour: dusky rose at the top → peach → gold at the horizon
  sky: ["#e494b2", "#ffb29c", "#ffd59c", "#ffe9c6"],
  haze: 0xeaa8b4,
  hazeRim: 0xf8c8c4,
  hazeLit: 0xfff2e6,
  glow: 0xffd890,
  eye: 0xffe8a0,
  flame: { y: 0xfff4c8, o: 0xffc860, r: 0xff9a6a }, // paper-window glow of the stone lanterns
};

export const SAKURA_KINDS = [
  "sakurapeaks",
  "skyislands",
  "blossomboughs",
  "sakuragrove",
  "lanternfringe",
  "koipond",
];

// scenery colours (light, soft; never the hazard red)
const BRANCH = 0x6a3e56;
const BRANCH_D = 0x56304a;
const BLOOM = 0xf590b2;
const BLOOM_L = 0xffc4d6;
const BLOOM_D = 0xd8709a;
const BLOOM_W = 0xfff0f4;
const ROOF = 0x5a4e6e; // dusty violet temple roofs
const ROOF_L = 0x7a6e90;
const WALL = 0xf2dcc8; // cream plaster
const POST = 0xb07a68; // warm wood
const GOLD = 0xffd070;
const LANTERN = 0xffb060;
const LANTERN_L = 0xffdc94;
const LANTERN_RIB = 0xe8884a;
const CORD = 0x6a4a5a;
const GRASS = 0x8a9e70; // warm sage (not the Valley's green)
const GRASS_L = 0xa8b888;
const WATER = 0x6aa8b8;
const WATER_L = 0x8cc4d0;
const RIPPLE = 0xb8e4ea;
const GLINT = 0xfff0c0;
const STONE = 0xb0a2a8;
const STONE_L = 0xd0c4c8;
const STONE_D = 0x857682;

const TAU = Math.PI * 2;
/** Tileable wave: sum of sines whose periods divide w. */
function wave(x, w, parts) {
  let v = 0;
  for (const [k, amp, ph] of parts) v += Math.sin((x / w) * TAU * k + ph) * amp;
  return v;
}
const topOf = (pc, x) => {
  let y = 0;
  while (y < pc.h && pc.get(x, y) === null) y++;
  return y;
};
/** set() that wraps x around the tile (shapes near an edge continue on the other side). */
const setw = (pc, x, y, c) => pc.set(((Math.round(x) % pc.w) + pc.w) % pc.w, y, c);
function discw(pc, cx, cy, r, c) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) setw(pc, x, y, c);
}

/** A blossom cluster: a pink puff lit from the upper left, with white flecks. */
function bloom(pc, rnd, cx, cy, r) {
  discw(pc, cx, cy, r, BLOOM);
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2;
      if (d2 > r * r) continue;
      const lit = x - cx + (y - cy);
      if (lit < -r * 0.6) setw(pc, x, y, BLOOM_L);
      else if (lit > r * 0.8 && d2 > (r - 1.5) ** 2) setw(pc, x, y, BLOOM_D);
    }
  for (let i = 0; i < Math.max(1, Math.round(r)); i++)
    setw(pc, cx + (rnd() - 0.5) * r * 1.4, Math.round(cy + (rnd() - 0.5) * r * 1.4), BLOOM_W);
}

/** A curved temple roof (upturned eaves) of half-width hw with its ridge at y. */
function roof(pc, cx, y, hw, rows = 3) {
  for (let r = 0; r < rows; r++) {
    const half = Math.round(hw * (0.55 + (0.45 * (r + 1)) / rows));
    pc.hline(cx - half, cx + half, y + r, r === 0 ? ROOF_L : ROOF);
  }
  // the eaves curl up at both tips
  pc.set(cx - hw - 1, y + rows - 2, ROOF).set(cx + hw + 1, y + rows - 2, ROOF);
  pc.set(cx - hw - 1, y + rows - 3, ROOF_L).set(cx + hw + 1, y + rows - 3, ROOF_L);
  pc.hline(cx - hw + 1, cx + hw - 1, y + rows, 0x463c58); // shadow under the eaves
}

/** A small multi-tier pagoda standing on y (its base). */
function pagoda(pc, cx, y, tiers = 3) {
  let base = y;
  for (let t = 0; t < tiers; t++) {
    const bw = 4 - Math.floor(t / 2);
    pc.rect(cx - bw, base - 3, bw * 2 + 1, 3, WALL);
    pc.vline(cx - bw, base - 3, base - 1, POST).vline(cx + bw, base - 3, base - 1, POST);
    pc.set(cx, base - 2, LANTERN_L); // a lit window
    roof(pc, cx, base - 6, bw + 3 - (t === 0 ? 0 : 1), 2);
    base -= 6;
  }
  pc.vline(cx, base - 3, base, GOLD).set(cx, base - 4, GOLD); // the spire
}

/** A low temple hall: cream walls, posts, a big curved roof with gold ridge ends. */
function temple(pc, cx, y, hw) {
  pc.rect(cx - hw - 1, y - 1, hw * 2 + 3, 1, STONE_L); // platform
  pc.rect(cx - hw, y - 6, hw * 2 + 1, 5, WALL);
  for (let x = cx - hw; x <= cx + hw; x += 3) pc.vline(x, y - 6, y - 2, POST);
  pc.rect(cx - 1, y - 4, 3, 3, LANTERN_L); // a glowing doorway
  roof(pc, cx, y - 10, hw + 4, 4);
  pc.set(cx - hw - 1, y - 10, GOLD).set(cx + hw + 1, y - 10, GOLD);
}

/** A cherry tree: dark trunk, forked branches and a crown of blossom puffs. */
function cherryTree(pc, rnd, cx, ground, size) {
  const th = Math.round(size * 1.6);
  for (let i = 0; i < th; i++) {
    const x = cx + Math.round(Math.sin(i * 0.35) * 0.8);
    pc.set(x, ground - i, BRANCH).set(x + 1, ground - i, BRANCH_D);
  }
  const top = ground - th;
  for (const s of [-1, 1]) pc.line(cx, top + 3, cx + s * size * 0.9, top - 1, BRANCH);
  const puffs = [
    [0, -size * 0.55, size * 0.75],
    [-size * 0.8, -size * 0.1, size * 0.6],
    [size * 0.8, -size * 0.15, size * 0.62],
    [-size * 0.35, size * 0.25, size * 0.5],
    [size * 0.4, size * 0.3, size * 0.5],
  ];
  for (const [dx, dy, r] of puffs) bloom(pc, rnd, cx + dx, top + dy, r);
}

/** A stone lantern (tōrō) standing on y, its paper window lit gold. */
function stoneLantern(pc, cx, y) {
  pc.rect(cx - 2, y - 1, 5, 1, STONE_D);
  pc.vline(cx, y - 4, y - 2, STONE);
  pc.rect(cx - 2, y - 7, 5, 3, STONE).rect(cx - 1, y - 6, 3, 1, LANTERN_L);
  pc.hline(cx - 3, cx + 3, y - 8, STONE_L).hline(cx - 2, cx + 2, y - 9, STONE);
  pc.set(cx, y - 10, STONE_L);
}

/** A paper lantern hanging from (cx, y): dark cap, glowing ribbed body, gold tassel. */
function paperLantern(pc, cx, y) {
  pc.hline(cx - 1, cx + 1, y, CORD);
  pc.rect(cx - 2, y + 1, 5, 5, LANTERN);
  pc.hline(cx - 1, cx + 1, y + 3, LANTERN_L).set(cx - 1, y + 2, LANTERN_L);
  pc.set(cx - 2, y + 2, LANTERN_RIB).set(cx + 2, y + 4, LANTERN_RIB).hline(cx - 2, cx + 2, y + 5, LANTERN_RIB);
  pc.hline(cx - 1, cx + 1, y + 6, CORD);
  pc.set(cx, y + 7, GOLD).set(cx, y + 8, GOLD);
}

export function silhouetteSakura(w, h, seed, { base, rim, detail, kind }) {
  const rnd = seeded(seed);
  const pc = new PixelCanvas(w, h);
  if (kind === "sakurapeaks") {
    // far, hazy ranges with one tall snow-capped cone and a tiny pagoda on a ridge
    const back = 0xf2c0c4;
    for (let x = 0; x < w; x++) {
      const t = Math.round(h * 0.55 + wave(x, w, [[2, 5, 0.7], [5, 2.5, 2.1]]));
      pc.vline(x, t, h - 1, back);
    }
    const cx = Math.floor(w * 0.3);
    const peak = 6;
    const foot = h * 0.72;
    const hw = 52;
    for (let x = cx - hw; x <= cx + hw; x++) {
      const u = Math.abs(x - cx) / hw;
      const t = Math.round(peak + Math.pow(u, 0.75) * (foot - peak) + (x % 5 === 0 ? 1 : 0));
      pc.vline(x, t, h - 1, base);
      pc.set(x, t, x < cx ? rim : base); // the sun lights the left face's ridge
      // snow cap with a ragged lower edge
      const snow = 12 + ((x * 7) % 5) - 2;
      if (t < peak + snow) pc.vline(x, t, peak + snow, detail);
    }
    // a nearer, gentler range in front
    for (let x = 0; x < w; x++) {
      const t = Math.round(h * 0.78 + wave(x, w, [[3, 3, 0.2], [7, 1.2, 1.5]]));
      pc.vline(x, t, h - 1, rim);
      pc.set(x, t, 0xfbd8d0);
    }
    const px = Math.floor(w * 0.76);
    const g = topOf(pc, px);
    for (let k = 0; k < 4; k++) pc.hline(px - 3 + k * 0, px + 3, g - 2 - k * 3, base).hline(px - 1, px + 1, g - 3 - k * 3, base);
    pc.vline(px, g - 15, g - 13, base);
  } else if (kind === "skyislands") {
    // floating islands: grassy tops with blossom trees, a pagoda and a temple; rocky
    // undersides; waterfalls pouring off their edges and fading into mist below
    const islands = [
      { cx: 42, top: 26, hw: 22, build: "pagoda", fall: 14 },
      { cx: 122, top: 40, hw: 17, build: "temple", fall: -12 },
      { cx: 170, top: 16, hw: 10, build: "tree", fall: 0 },
    ];
    for (const is of islands) {
      if (is.fall) {
        // the waterfall first (the island's lip covers its top)
        const fx = is.cx + is.fall;
        for (let y = is.top + 1; y < h; y++)
          for (let i = 0; i < 3; i++) {
            const fade = y > h - 14 ? (h - y) / 14 : 1;
            if (fade < 1 && (fx + i + y) % 3 >= Math.ceil(fade * 3)) continue;
            pc.set(fx + i, y, (y + i * 2) % 5 === 0 ? 0xffffff : i === 1 ? 0xe8f8ff : 0xb8e0ee);
          }
        for (let i = -2; i <= 4; i++) if ((i + 7) % 2) pc.set(fx + i, h - 3 - (i & 1), 0xf4fbff); // mist
      }
      const depth = Math.round(is.hw * 0.95);
      for (let r = 0; r < depth; r++) {
        const u = r / depth;
        const half = Math.max(0, Math.round(is.hw * (1 - Math.pow(u, 1.4)) + Math.sin(r * 1.7 + is.cx) * 1.2));
        const y = is.top + 2 + r;
        pc.hline(is.cx - half, is.cx + half, y, 0xa87888);
        pc.set(is.cx - half, y, 0xc898a4); // lit left edge
        if (half > 2) pc.hline(is.cx + half - 1, is.cx + half, y, 0x8a6072);
        if (r % 4 === 2 && half > 4) pc.hline(is.cx - half + 3, is.cx - half + 5, y, 0x986878); // strata
      }
      pc.set(is.cx, is.top + 2 + depth, 0x8a6072); // a dangling rock tip
      pc.hline(is.cx - is.hw, is.cx + is.hw, is.top, GRASS_L).hline(is.cx - is.hw, is.cx + is.hw, is.top + 1, GRASS);
      for (let x = is.cx - is.hw + 1; x < is.cx + is.hw; x += 3) pc.set(x, is.top + 1, BLOOM_L); // petals
      if (is.build === "pagoda") {
        pagoda(pc, is.cx - 4, is.top);
        cherryTree(pc, rnd, is.cx + 11, is.top - 1, 4);
        cherryTree(pc, rnd, is.cx - 16, is.top - 1, 3);
      } else if (is.build === "temple") {
        temple(pc, is.cx + 2, is.top, 6);
        cherryTree(pc, rnd, is.cx - 11, is.top - 1, 3);
      } else {
        cherryTree(pc, rnd, is.cx, is.top - 1, 4);
      }
    }
  } else if (kind === "blossomboughs") {
    // cherry boughs reaching down from the top, heavy with blossom
    for (let x = 0; x < w; x++) {
      const d = 2 + Math.round(wave(x, w, [[4, 1.2, 0.3]]));
      for (let y = 0; y <= d; y++) pc.set(x, y, y === d ? BLOOM_D : BLOOM);
    }
    for (const [x0, dir, len] of [
      [8, 1, 46],
      [70, -1, 34],
      [104, 1, 52],
    ]) {
      let x = x0;
      let y = 1;
      for (let i = 0; i < len; i++) {
        x += dir * (0.75 + rnd() * 0.5);
        y += 0.5 + rnd() * 0.5;
        const thick = i < len * 0.5 ? 2 : 1;
        for (let k = 0; k < thick; k++) setw(pc, x, Math.round(y) + k, BRANCH);
        if (i % 7 === 3) {
          // a twig off the bough, ending in a blossom cluster
          const tx = x + dir * 4;
          const ty = y + 4 + rnd() * 4;
          for (let s = 0; s <= 4; s++) setw(pc, x + ((tx - x) * s) / 4, Math.round(y + ((ty - y) * s) / 4), BRANCH);
          bloom(pc, rnd, tx, ty + 1, 2.2 + rnd());
        }
        if (i % 4 === 1) bloom(pc, rnd, x + (rnd() - 0.5) * 3, y - 1 + rnd() * 2, 1.6 + rnd() * 0.8);
      }
      bloom(pc, rnd, x, y + 1, 3);
    }
  } else if (kind === "sakuragrove") {
    // a rolling blossom grove: cherry trees, a temple hall and a stone lantern
    for (let x = 0; x < w; x++) {
      const t = Math.round(h * 0.66 + wave(x, w, [[2, 3, 0.4], [5, 1.2, 1.7]]));
      pc.vline(x, t, h - 1, GRASS);
      pc.set(x, t, GRASS_L);
    }
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(rnd() * w);
      const y = topOf(pc, x) + 1 + Math.floor(rnd() * (h * 0.3));
      if (pc.get(x, y) === GRASS) pc.set(x, y, rnd() < 0.7 ? BLOOM_L : BLOOM); // a petal carpet
    }
    temple(pc, 60, topOf(pc, 60) + 1, 9);
    stoneLantern(pc, 128, topOf(pc, 128) + 1);
    cherryTree(pc, rnd, 22, topOf(pc, 22), 9);
    cherryTree(pc, rnd, 100, topOf(pc, 100), 7);
    cherryTree(pc, rnd, 152, topOf(pc, 152), 10);
  } else if (kind === "lanternfringe") {
    // a blossom fringe along the top with strings of glowing paper lanterns
    for (let x = 0; x < w; x++) {
      const d = 3 + Math.round(Math.abs(wave(x, w, [[4, 2.5, 0.3], [9, 1.2, 1.1]])));
      for (let y = 0; y <= d; y++) pc.set(x, y, y === d ? BLOOM_D : y === d - 1 ? BLOOM : 0xe8809e);
      if (x % 6 === 2) pc.set(x, d - 1, BLOOM_L);
    }
    for (let i = 0; i < Math.floor(w / 21); i++) bloom(pc, rnd, 6 + i * 21 + rnd() * 6, 5 + rnd() * 3, 2.5);
    // strings sagging between anchors in the fringe, a paper lantern every 32 px
    const spans = Math.max(1, Math.round(w / 64));
    const ys = [];
    for (let x = 0; x < w; x++) {
      const y = 9 + Math.round(Math.abs(Math.sin((x / w) * Math.PI * spans)) * 13);
      ys.push(y);
      pc.set(x, y, CORD);
    }
    for (let lx = 16; lx < w; lx += 32) paperLantern(pc, lx, ys[lx] + 1);
  } else if (kind === "koipond") {
    // a koi pond along the bottom: an arched stone bridge, lily pads, koi, reeds, a lantern
    // (the floor wall and its spikes cover the bottom rows: the pond sits well above them)
    const wl = h - 30; // waterline
    for (let y = wl; y < h; y++)
      for (let x = 0; x < w; x++) pc.set(x, y, y === wl ? RIPPLE : y < wl + 3 ? WATER_L : WATER);
    for (let x = 0; x < w; x++) {
      if ((x * 5) % 23 < 4) pc.set(x, wl + 4 + ((x >> 3) % 4), RIPPLE); // ripples
      if ((x * 7) % 31 < 2) pc.set(x, wl + 2, GLINT); // the sun's glints
    }
    // the stone rim of the pond
    for (let x = 0; x < w; x++) pc.set(x, wl - 1, (x >> 2) % 3 ? STONE : STONE_D);
    // arched bridge from x0 to x1
    const x0 = 46;
    const x1 = 132;
    const rise = 12;
    for (let x = x0; x <= x1; x++) {
      const u = (x - x0) / (x1 - x0);
      const y = Math.round(wl - 2 - Math.sin(u * Math.PI) * rise);
      pc.set(x, y, STONE_L).set(x, y + 1, STONE).set(x, y + 2, STONE).set(x, y + 3, STONE_D);
      if ((x - x0) % 8 === 0) pc.vline(x, y - 3, y - 1, POST); // railing posts
      pc.set(x, y - 3, 0x8a5a5a); // the rail
      // its reflection in the water (rows below the waterline mirror the arch, darker)
      const ry = wl + Math.round((wl - y) * 0.45);
      if (ry < h) pc.set(x, ry, 0x4e8a9a);
    }
    for (const ax of [x0 - 3, x1 - 2]) pc.rect(ax, wl - 6, 6, 6, STONE).hline(ax, ax + 5, wl - 6, STONE_L);
    // lily pads with pink lotus flowers
    for (const [lx, ly] of [
      [14, 3],
      [26, 6],
      [150, 4],
      [178, 7],
      [224, 3],
      [240, 6],
    ]) {
      pc.hline(lx - 2, lx + 2, wl + ly, 0x5a9a6a).hline(lx - 1, lx + 1, wl + ly - 1, 0x6aac78);
      if (lx % 3 === 0) pc.set(lx, wl + ly - 2, BLOOM).set(lx, wl + ly - 1, BLOOM_L);
    }
    // koi: orange, orange-and-white and gold
    for (const [kx, ky, a, b] of [
      [36, 6, 0xff8a3a, 0xffffff],
      [96, 8, 0xffffff, 0xff7a2a],
      [196, 5, 0xffc040, 0xff8a3a],
    ]) {
      pc.hline(kx, kx + 3, wl + ky, a).set(kx + 1, wl + ky, b).set(kx + 4, wl + ky - 1, a).set(kx + 4, wl + ky + 1, a);
      pc.set(kx - 1, wl + ky, 0x2a3a40); // eye side
    }
    // reeds
    for (const rx of [6, 9, 206, 209, 212])
      pc.vline(rx, wl - 6 - (rx % 3), wl - 1, 0x6a8a5a).set(rx, wl - 7 - (rx % 3), 0x9a7a4a);
    stoneLantern(pc, 166, wl - 1);
    // stepping stones
    for (const sx of [226, 236, 246]) pc.hline(sx, sx + 4, wl + 1, STONE_L).hline(sx + 1, sx + 3, wl + 2, STONE);
  }
  void base;
  void rim;
  void detail;
  return pc;
}

/** Top wall: dark temple-roof tiles (rounded kawara rows) with a few fallen petals. */
export function roofTile(C) {
  const pc = new PixelCanvas(32, 32);
  const col = [C.s0, C.s1, C.s3, C.s3, C.s2, C.s2, C.s1, C.s0];
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const r = y % 8;
      let c = col[x % 8];
      if (r === 7) c = C.m; // the overlap shadow of the row below
      else if (r === 0 && x % 8 >= 2 && x % 8 <= 5) c = C.s4; // rounded tile ends catch the light
      pc.set(x, y, c);
    }
  for (const [x, y] of [
    [3, 4],
    [19, 13],
    [12, 22],
    [27, 28],
  ])
    pc.set(x, y, C.g1).set(x + 1, y, C.g2);
  return pc;
}

/** Stone lantern lamp frames (7x14) for the wall decor: a soft, steady golden glow. */
export function lanternLamp(C, f) {
  const glow = [C.flame.o, C.flame.y, C.flame.o][f];
  const mid = [C.flame.y, C.flame.y, 0xffffff][f];
  const pc = new PixelCanvas(7, 14).stamp(
    0,
    0,
    [
      "...h...",
      "..hhh..",
      ".rrrrr.",
      "rrrrrrr",
      ".sGGGs.",
      ".sGWGs.",
      ".sGGGs.",
      "..sss..",
      "...s...",
      "...s...",
      "..sss..",
      ".sssss.",
      "bbbbbbb",
      "bbbbbbb",
    ],
    { h: C.s4, r: C.s3, s: C.s2, b: C.s1, G: glow, W: mid },
  );
  return pc;
}

/** Extra sprites for the Sakura Skies atlas: the sun, birds and petals. */
export function sakuraFrames() {
  const sun = new PixelCanvas(36, 36);
  for (let y = 0; y < 36; y++)
    for (let x = 0; x < 36; x++) {
      const d = Math.hypot(x - 17.5, y - 17.5);
      if (d < 11) sun.set(x, y, 0xfffbea);
      else if (d < 14) sun.set(x, y, 0xfff0bc);
      else if (d < 16.5) sun.set(x, y, 0xffe096);
      else if (d < 18 && (x + y) % 2 === 0) sun.set(x, y, 0xffd27a);
    }
  const B = 0x6a3e5a;
  const bird0 = new PixelCanvas(7, 3).stamp(0, 0, ["B.....B", ".B...B.", "..BBB.."], { B });
  const bird1 = new PixelCanvas(7, 3).stamp(0, 0, ["...B...", ".BBBBB.", "B.....B"], { B });
  const P = { P: 0xffb0c8, L: 0xffe4ec, D: 0xe88aa8 };
  const petal0 = new PixelCanvas(5, 3).stamp(0, 0, [".PPL.", "DPPPL", ".DPP."], P);
  const petal1 = new PixelCanvas(3, 3).stamp(0, 0, [".PL", "DPL", "DP."], P);
  const petal2 = new PixelCanvas(4, 1).stamp(0, 0, ["DPPL"], P);
  return { sun, bird_0: bird0, bird_1: bird1, petal_0: petal0, petal_1: petal1, petal_2: petal2 };
}

// Pixel biome themes: one palette + style switches per biome → tiles, hazards, decor, layers.
// Each biome's spike colour (k*) is used only on things that kill.
import { buildBiome, NV } from "./biomeArt.js";
import { buildCommon } from "./common.js";
import { buildHazards } from "./hazardArt.js";

const SOLAR = {
  O: 0x120403,
  s0: 0x2a0f0a,
  s1: 0x3e1810,
  s2: 0x55231a,
  s3: 0x6f3424,
  s4: 0x8f4c33,
  m: 0xa83c12, // molten seams between the lava-rock tiles
  g0: 0x3b2a24, // cooled crust (decor)
  g1: 0x5a3d30,
  g2: 0x7a5240,
  k0: 0x7a2a00,
  k1: 0xff6a00,
  k2: 0xffa21a,
  k3: 0xfff0a0,
  metal0: 0x2a2420,
  metal1: 0x473c35,
  metal2: 0x6f5f53,
  metal3: 0xa89582,
  crys0: 0x1a1018,
  crys1: 0x3a2236,
  crys2: 0x6a4a66,
  bg0: 0x070201,
  bg1: 0x120503,
  bg2: 0x1d0905,
  bg3: 0x280e08,
  bg4: 0x34140b,
  bgDetail: 0x4a1c0c,
  bgHang: 0x160604,
  bgNear: 0x220b06,
  sky: ["#050101", "#1a0603", "#2a0c05", "#080201"],
  eye: 0xffd080,
};

const FROZEN = {
  O: 0x060b1c,
  s0: 0x1d3a66,
  s1: 0x2b5590,
  s2: 0x3d72b8,
  s3: 0x5c94d6,
  s4: 0x9ccaf2,
  m: 0x163057,
  g0: 0x7f8fb8, // packed snow (decor, dimmer than the white spikes)
  g1: 0x9eaad0,
  g2: 0xb8c2e2,
  k0: 0x2a6fa0,
  k1: 0x7fd6ff,
  k2: 0xeaffff,
  k3: 0xffffff,
  metal0: 0x2a3550,
  metal1: 0x46557a,
  metal2: 0x6f80a8,
  metal3: 0xb8c6e8,
  crys0: 0x3a2470,
  crys1: 0x8a6ad0,
  crys2: 0xc8b4ff,
  bg0: 0x07041a,
  bg1: 0x0e0828,
  bg2: 0x150d36,
  bg3: 0x1d1344,
  bg4: 0x261a52,
  bgDetail: 0x3a2e78,
  bgHang: 0x120a30,
  bgNear: 0x1a1240,
  sky: ["#05021a", "#140a3a", "#22125a", "#08041c"],
  eye: 0xd8e4ff,
  flame: { y: 0xffffff, o: 0xb89cff, r: 0x7a5ad8 }, // crackling energy orbs
};

const GLITCH = {
  O: 0x05070a,
  s0: 0x1a1f26,
  s1: 0x2a313b,
  s2: 0x3b4450,
  s3: 0x535e6c,
  s4: 0x7a8796,
  m: 0x12161c,
  g0: 0x184a36, // circuitry (decor)
  g1: 0x23704f,
  g2: 0x2f9566,
  k0: 0x00606e,
  k1: 0x00b8d4,
  k2: 0x2bffef,
  k3: 0xe0ffff,
  metal0: 0x1f242b,
  metal1: 0x3a424d,
  metal2: 0x5f6b79,
  metal3: 0x9aa7b5,
  crys0: 0x3a1236,
  crys1: 0x9a2a8a,
  crys2: 0xff5ad8,
  bg0: 0x030405,
  bg1: 0x07090c,
  bg2: 0x0c1014,
  bg3: 0x11161c,
  bg4: 0x171e26,
  bgDetail: 0x24404a,
  bgHang: 0x0a0d11,
  bgNear: 0x0f1318,
  sky: ["#020304", "#080b10", "#0e131a", "#030405"],
  eye: 0x9affd0,
  flame: { y: 0x5affb0, o: 0xff5ad8, r: 0xffffff }, // flickering screens
};

const ABYSS = {
  O: 0x050000,
  s0: 0x1a0507,
  s1: 0x2a080c,
  s2: 0x3b0c12,
  s3: 0x52141b,
  s4: 0x6e1f27,
  m: 0x0d0204,
  g0: 0x3a2a2c, // bone/ash (decor)
  g1: 0x55403f,
  g2: 0x705858,
  k0: 0x6a0010,
  k1: 0xd0101e,
  k2: 0xff2a3d,
  k3: 0xffc0c6,
  metal0: 0x1c1416,
  metal1: 0x33272a,
  metal2: 0x52403f,
  metal3: 0x806a68,
  crys0: 0x2a0f2e,
  crys1: 0x4a1c52,
  crys2: 0x7a3a86,
  bg0: 0x020000,
  bg1: 0x070102,
  bg2: 0x0d0204,
  bg3: 0x140306,
  bg4: 0x1c0508,
  bgDetail: 0x3a0a10,
  bgHang: 0x0a0102,
  bgNear: 0x120204,
  sky: ["#000000", "#0a0102", "#180306", "#020000"],
  eye: 0xffd060,
  flame: { y: 0xffd0a0, o: 0xff7040, r: 0x9a1a10 },
};

const DEFS = {
  void: {
    pal: NV,
    cfg: { pillar: "stone", lamp: "torch", far: "cliffs", mid: "ruins", hang: "roots" },
    weather: { kind: "rain", color: NV.rain, rate: 70 },
  },
  solar: {
    pal: SOLAR,
    cfg: { pillar: "stone", lamp: "torch", far: "cliffs", mid: "ruins", hang: "chains" },
    weather: { kind: "embers", color: 0xff8a3a, rate: 46 },
  },
  frozen: {
    pal: FROZEN,
    cfg: { pillar: "stone", lamp: "orb", far: "cliffs", mid: "ruins", hang: "icicles" },
    weather: { kind: "snow", color: 0xdfe6ff, rate: 60 },
  },
  glitch: {
    pal: GLITCH,
    cfg: { pillar: "metal", lamp: "screen", far: "city", mid: "city", hang: "cables" },
    weather: { kind: "noise", color: 0x2bffef, rate: 40 },
  },
  abyss: {
    pal: ABYSS,
    cfg: { pillar: "stone", lamp: "torch", far: "cliffs", mid: "ruins", hang: "chains" },
    weather: { kind: "ash", color: 0x8a4a4a, rate: 40 },
  },
};

function makeTheme(id) {
  const { pal, weather } = DEFS[id];
  const p = (k) => `${id}_${k}`;
  return {
    id,
    atlas: id,
    pillars: [p("pillar_0"), p("pillar_1"), p("pillar_2")],
    caps: ["cap_0", "cap_1"],
    wall: p("wall"),
    edge: p("edge"),
    edgeB: p("edge_b"),
    chain: p("chain"),
    beamV: p("beam_v"),
    beamH: p("beam_h"),
    glowV: p("glow_v"),
    glowH: p("glow_h"),
    sky: p("sky"),
    far: p("far"),
    mid: p("mid"),
    roots: p("roots"),
    distant: p("distant"),
    glowspot: p("glowspot"),
    nearTop: p("near_top"),
    nearBot: p("near_bot"),
    weather,
    hazard: pal.k2, // spike colour: used only by hazards
    spark: pal.k3,
  };
}

export const THEMES = Object.fromEntries(Object.keys(DEFS).map((id) => [id, makeTheme(id)]));

export function themeFor(biomeId) {
  return THEMES[biomeId] || THEMES.void;
}

let built = false;
export function buildPixelArt(scene) {
  if (built) return;
  built = true;
  buildCommon(scene);
  for (const [id, d] of Object.entries(DEFS)) buildBiome(scene, id, d.pal, d.cfg);
  buildHazards(scene, { solar: SOLAR, frozen: FROZEN, glitch: GLITCH, abyss: ABYSS });
}

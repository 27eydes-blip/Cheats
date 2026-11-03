// Pixel biome themes: one palette + style switches per biome → tiles, hazards, decor, layers.
// Each biome's spike colour (k*) is used only on things that kill.
import { buildFloorStrips, buildGlowDot } from "./floorArt.js";
import { buildBiome, NV } from "./biomeArt.js";
import { buildCommon } from "./common.js";
import { buildHazards } from "./hazardArt.js";
import { buildNewHazards } from "./newHazardArt.js";
import { addAtlas } from "./px.js";
import { weatherFrames } from "./scenicArt.js";

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

// Peaceful Valley: a bright pastel day. Spikes/thorns are raspberry so they still pop.
const VALLEY = {
  O: 0x1a2a14,
  s0: 0x3c5a34,
  s1: 0x52764a,
  s2: 0x6a9460,
  s3: 0x86b07a,
  s4: 0xa8cc98,
  m: 0x2c4226,
  g0: 0x4a8a3a, // moss + clover (decor)
  g1: 0x6aaa4a,
  g2: 0x8ccc5a,
  k0: 0x7a0a3a,
  k1: 0xd0105a,
  k2: 0xff2d78,
  k3: 0xffc0d8,
  metal0: 0x5a4a3a,
  metal1: 0x7a6650,
  metal2: 0x9a8668,
  metal3: 0xc8b490,
  crys0: 0x8a3a7a,
  crys1: 0xd86ab8,
  crys2: 0xffb0e0,
  bg0: 0xbfe6ff,
  bg1: 0xa8dcc0,
  bg2: 0x9ccfb8, // far hills
  bg3: 0x6fb88a, // mid meadow
  bg4: 0xb8e8c8,
  bgDetail: 0xffe0f0, // pale blossoms (never the hazard raspberry)
  bgHang: 0x5a9a6a,
  bgNear: 0x3f8452,
  sky: ["#86c8f8", "#bfe4ff", "#d8eed8", "#9ccf9a"], // blue sky → soft meadow haze
  haze: 0xc4e6d6,
  hazeRim: 0xdcf2e6,
  hazeLit: 0xffffff,
  glow: 0xfff4c8,
  eye: 0xffffff,
  flame: { y: 0xfffbe0, o: 0xffd86a, r: 0xff9ac8 }, // glowing flower bulbs
};

// Hurricane: a dark, wet slate storm with electric-blue light; hazards are hot orange.
const HURRICANE = {
  O: 0x05080c,
  s0: 0x1c242e,
  s1: 0x283442,
  s2: 0x364658,
  s3: 0x4a5e74,
  s4: 0x6a809a,
  m: 0x10161e,
  g0: 0x24403a, // kelp + wet moss (decor)
  g1: 0x2e5a4a,
  g2: 0x3a7a5e,
  k0: 0x7a2a00,
  k1: 0xff6a00,
  k2: 0xffa21a,
  k3: 0xfff0a0,
  metal0: 0x22282e,
  metal1: 0x3a444e,
  metal2: 0x5a6774,
  metal3: 0x95a3b2,
  crys0: 0x1a3a5a,
  crys1: 0x3a7aaa,
  crys2: 0x8ad8ff,
  bg0: 0x080c10,
  bg1: 0x0c1218,
  bg2: 0x18222e,
  bg3: 0x141c26,
  bg4: 0x26364a,
  bgDetail: 0x5a7a9a,
  bgHang: 0x1a2430,
  bgNear: 0x0e141c,
  sky: ["#0a1016", "#1a2634", "#2a3a4c", "#0e151c"],
  haze: 0x2c3c4e,
  hazeRim: 0x3e546c,
  hazeLit: 0x8ad8ff,
  glow: 0x3a6a9a,
  eye: 0x8ad8ff,
  flame: { y: 0xffffff, o: 0x8ad8ff, r: 0x3a7aaa }, // storm lanterns
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
  valley: {
    pal: VALLEY,
    cfg: {
      pillar: "stone",
      lamp: "orb",
      far: "hills",
      mid: "meadow",
      hang: "blossoms",
      distant: "mountains",
      nearTop: "canopy",
      nearBot: "grass",
    },
    weather: { kind: "butterflies", color: 0xffb0d8, rate: 22 },
  },
  hurricane: {
    pal: HURRICANE,
    cfg: {
      pillar: "stone",
      lamp: "orb",
      far: "stormclouds",
      mid: "palms",
      hang: "scud",
      distant: "stormclouds",
      nearTop: "scud",
      nearBot: "surf",
    },
    weather: { kind: "storm", color: 0xa8c0d8, rate: 80 },
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
  buildFloorStrips(scene);
  buildGlowDot(scene);
  addAtlas(scene, "wx", weatherFrames());
  buildNewHazards(scene);
  for (const [id, d] of Object.entries(DEFS)) buildBiome(scene, id, d.pal, d.cfg);
  buildHazards(scene, { solar: SOLAR, frozen: FROZEN, glitch: GLITCH, abyss: ABYSS });
}

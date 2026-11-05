// Pixel biome themes: one palette + style switches per biome → tiles, hazards, decor, layers.
// Each biome's spike colour (k*) is used only on things that kill.
import { buildAnimals } from "./animalArt.js";
import { buildFloorStrips, buildGlowDot } from "./floorArt.js";
import { buildBiome, NV } from "./biomeArt.js";
import { buildCommon } from "./common.js";
import { buildHazards } from "./hazardArt.js";
import { buildDimensionHazards } from "./dimensionHazardArt.js";
import { buildCosmeticArt } from "./cosmeticArt.js";
import { buildNewHazards } from "./newHazardArt.js";
import { addAtlas, deferUploads } from "./px.js";
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
  bg0: 0x030716,
  bg1: 0x060d26,
  bg2: 0x0a1534,
  bg3: 0x0f1d44,
  bg4: 0x162852,
  bgDetail: 0x2c4a86,
  bgHang: 0x0a1432,
  bgNear: 0x0d1a40,
  sky: ["#02071a", "#081a40", "#0f2a5a", "#040a1e"],
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

// ---- dimensions (beyond the Hurricane rift). Hazard colour (k*) appears only on hazards.
const PRISM = {
  O: 0x05031a,
  s0: 0x1a1450,
  s1: 0x241a6a,
  s2: 0x342a8a,
  s3: 0x4a40aa,
  s4: 0x7a70d8,
  m: 0x120c3a,
  g0: 0x2a5a8a, // crystal veins (decor)
  g1: 0x3a7aaa,
  g2: 0x5aa0c8,
  k0: 0x8a8ab8,
  k1: 0xd8f4ff,
  k2: 0xffffff,
  k3: 0xffffff,
  metal0: 0x1a1a3a,
  metal1: 0x2e2e5a,
  metal2: 0x4a4a8a,
  metal3: 0x8a8ac8,
  crys0: 0x3a2a8a,
  crys1: 0x6a5ad8,
  crys2: 0xb0a8ff,
  bg0: 0x04021a,
  bg1: 0x080530,
  bg2: 0x0e0a3e,
  bg3: 0x0a0732,
  bg4: 0x1a1458,
  bgDetail: 0x4a6ac8,
  bgHang: 0x0c0838,
  bgNear: 0x07052a,
  sky: ["#04021a", "#0c0838", "#1a1050", "#05031a"],
  haze: 0x161050,
  hazeRim: 0x2a2a7a,
  hazeLit: 0x8ad8ff,
  glow: 0x4a3aa8,
  eye: 0xb0a8ff,
  flame: { y: 0xffffff, o: 0x8ad8ff, r: 0xff7ad9 }, // crystal lamps
};

const TIDAL = {
  O: 0x020a14,
  s0: 0x0a2a3a,
  s1: 0x0e3a4e,
  s2: 0x145064,
  s3: 0x1e6a7e,
  s4: 0x3a8e9e,
  m: 0x061c28,
  g0: 0x1a5a4a, // sea moss (decor)
  g1: 0x2a7a5e,
  g2: 0x3aa078,
  k0: 0x7a1a5a,
  k1: 0xff3fa8,
  k2: 0xff7ad0,
  k3: 0xffd0f0,
  metal0: 0x1a2a32,
  metal1: 0x2e424e,
  metal2: 0x4a6470,
  metal3: 0x8aa8b0,
  crys0: 0x0a4a5a,
  crys1: 0x1a8a9a,
  crys2: 0x5ae8e0,
  bg0: 0x020a1a,
  bg1: 0x041428,
  bg2: 0x082036,
  bg3: 0x06182c,
  bg4: 0x0e3048,
  bgDetail: 0x2ad8c8,
  bgHang: 0x072030,
  bgNear: 0x041420,
  sky: ["#031426", "#06263e", "#0a3450", "#020a16"],
  haze: 0x0a2a42,
  hazeRim: 0x14425a,
  hazeLit: 0x5af0e0,
  glow: 0x1a6a8a,
  eye: 0x5af0e0,
  flame: { y: 0xd8ffff, o: 0x5af0e0, r: 0x1a8a9a }, // glowing anemone lamps
};

const CHRONO = {
  O: 0x0a0602,
  s0: 0x2a1c0e,
  s1: 0x3e2a14,
  s2: 0x56391c,
  s3: 0x704a26,
  s4: 0x94683a,
  m: 0x1a1008,
  g0: 0x4a3a20, // tarnished brass (decor)
  g1: 0x6a5430,
  g2: 0x8a7040,
  k0: 0x7a4a00,
  k1: 0xff9a1a,
  k2: 0xffd23f,
  k3: 0xfff4c0,
  metal0: 0x2a2014,
  metal1: 0x463624,
  metal2: 0x6a5438,
  metal3: 0xa08a60,
  crys0: 0x3a2a1a,
  crys1: 0x6a4a2a,
  crys2: 0xa07a4a,
  bg0: 0x080402,
  bg1: 0x120a04,
  bg2: 0x1c1208,
  bg3: 0x160e06,
  bg4: 0x2a1c0e,
  bgDetail: 0x6a5430,
  bgHang: 0x120a04,
  bgNear: 0x0e0804,
  sky: ["#0a0604", "#1e140a", "#2e1e10", "#0a0604"],
  haze: 0x241808,
  hazeRim: 0x3a2814,
  hazeLit: 0xc8a060,
  glow: 0x6a4a1a,
  eye: 0xc8a060,
  flame: { y: 0xfff0c0, o: 0xc8a060, r: 0x8a5a20 }, // clock-lamp glow
};

const MIRROR = {
  O: 0x06020c,
  s0: 0x1a1028,
  s1: 0x26183a,
  s2: 0x34224e,
  s3: 0x483266,
  s4: 0x6a5090,
  m: 0x120a1e,
  g0: 0x2a2a4a, // silvered glass (decor)
  g1: 0x3a3a62,
  g2: 0x52527e,
  k0: 0x4a1a8a,
  k1: 0x9a3aff,
  k2: 0xc87aff,
  k3: 0xf0d8ff,
  metal0: 0x1c1626,
  metal1: 0x2e263e,
  metal2: 0x4a4062,
  metal3: 0x8a80a8,
  crys0: 0x2a2a5a,
  crys1: 0x4a5a9a,
  crys2: 0x8aa0d8,
  bg0: 0x06030c,
  bg1: 0x0c0618,
  bg2: 0x140a24,
  bg3: 0x10081e,
  bg4: 0x22163a,
  bgDetail: 0x4a7ac8,
  bgHang: 0x0e0818,
  bgNear: 0x0a0614,
  sky: ["#08040f", "#140a24", "#1e1036", "#08040f"],
  haze: 0x1a1030,
  hazeRim: 0x2a1e48,
  hazeLit: 0x7ad8ff,
  glow: 0x3a2a6a,
  eye: 0x7ad8ff,
  flame: { y: 0xe8f4ff, o: 0x7ad8ff, r: 0x4a5a9a }, // cold mirror lamps
};

const DEFS = {
  void: {
    pal: NV,
    cfg: {
      pillar: "stone",
      lamp: "torch",
      distant: "neonskyline",
      far: "monoliths",
      mid: "circuitruins",
      hang: "roots",
      nearTop: "neonwires",
      nearBot: "datarubble",
    },
    // a faint synthwave floor grid scrolls toward the viewer below the horizon
    weather: { kind: "rain", color: NV.rain, rate: 70, grid: 0x2bffd0 },
  },
  solar: {
    pal: SOLAR,
    cfg: {
      pillar: "stone",
      lamp: "torch",
      distant: "sunrise",
      far: "mesas",
      mid: "suntemples",
      hang: "chains",
      nearTop: "scorched",
      nearBot: "lavadunes",
    },
    // slow prominence arcs rise off the horizon now and then
    weather: { kind: "embers", color: 0xff8a3a, rate: 46, flares: [0xff5a1a, 0xffa02a] },
  },
  frozen: {
    pal: FROZEN,
    cfg: {
      pillar: "stone",
      lamp: "orb",
      distant: "glaciers",
      far: "icespires",
      mid: "frozentrees",
      hang: "icicles",
      nearTop: "icefangs",
      nearBot: "snowdrifts",
    },
    // aurora ribbons ripple across the sky behind everything
    weather: { kind: "snow", color: 0xdfe6ff, rate: 60, aurora: [0x39ffb0, 0x3ac8ff, 0xb07aff] },
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
  prism: {
    pal: PRISM,
    cfg: {
      pillar: "metal",
      lamp: "orb",
      far: "crystals",
      mid: "floatprisms",
      hang: "icicles",
      distant: "spires",
      nearTop: "stalactites",
      nearBot: "stalagmites",
    },
    weather: { kind: "noise", rate: 46, colors: [0xffffff, 0xff9ad8, 0x9ae8ff, 0xfff09a] },
  },
  tidal: {
    pal: TIDAL,
    cfg: {
      pillar: "stone",
      lamp: "orb",
      far: "whale",
      mid: "coral",
      hang: "kelp",
      distant: "seafloor",
      nearTop: "surface",
      nearBot: "anemones",
    },
    weather: { kind: "bubbles", color: 0xa8f8ff, rate: 34, rays: 0x8af8ff },
  },
  chrono: {
    pal: CHRONO,
    cfg: {
      pillar: "metal",
      lamp: "torch",
      far: "clockface",
      mid: "gears",
      hang: "chains",
      distant: "eclipse",
      nearTop: "cogs",
      nearBot: "cogs",
    },
    weather: { kind: "sandup", color: 0xe8c890, rate: 50 },
  },
  mirror: {
    pal: MIRROR,
    cfg: {
      pillar: "metal",
      lamp: "orb",
      far: "towers",
      mid: "towers",
      hang: "icicles",
      distant: "mountains",
      nearTop: "stalactites",
      nearBot: "stalagmites",
      mirror: true,
    },
    weather: { kind: "noise", rate: 36, colors: [0xc87aff, 0x7ad8ff, 0xffffff] },
  },
};

function makeTheme(id) {
  const { pal, weather, cfg } = DEFS[id];
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
    mirror: !!cfg.mirror, // Mirror Realm: the top half reflects the bottom
    hazard: pal.k2, // spike colour: used only by hazards
    spark: pal.k3,
  };
}

export const THEMES = Object.fromEntries(Object.keys(DEFS).map((id) => [id, makeTheme(id)]));

// Each biome's art (~5 MB) is built on first use instead of at boot: only the first biome is
// made up front, and the game builds the next one as the run approaches it. Building all of
// them at launch was crashing iPhones ("A problem repeatedly occurred").
const EAGER_BIOME = "void";
const biomeBuilt = new Set();
let artScene = null;

const pendingArt = new Map(); // biome id → texture uploads still to do (see queueBiomeArt)

const buildJobs = (id) => deferUploads(() => buildBiome(artScene, id, DEFS[id].pal, DEFS[id].cfg));

/** Build a biome's background art now if it isn't ready yet (cheap no-op afterwards). */
export function ensureBiomeArt(id) {
  if (biomeBuilt.has(id) || !DEFS[id] || !artScene) return;
  const jobs = pendingArt.get(id) || buildJobs(id);
  pendingArt.delete(id);
  for (const job of jobs) job();
  biomeBuilt.add(id);
}

/**
 * Start building a biome's art ahead of time, spread over frames by pumpBiomeArt: doing all
 * ~20 texture uploads in one frame was a visible hitch as each new biome approached.
 */
export function queueBiomeArt(id) {
  if (biomeBuilt.has(id) || pendingArt.has(id) || !DEFS[id] || !artScene) return;
  pendingArt.set(id, buildJobs(id));
}

/** Do one queued texture upload (call once per frame). Returns the biome id it finished. */
export function pumpBiomeArt() {
  for (const [id, jobs] of pendingArt) {
    jobs.shift()?.();
    if (jobs.length) return null;
    pendingArt.delete(id);
    biomeBuilt.add(id);
    return id;
  }
  return null;
}

/** True once a biome's art exists (prebuilders skip biomes the player hasn't neared yet). */
export function biomeArtReady(id) {
  return biomeBuilt.has(id);
}

export function themeFor(biomeId) {
  ensureBiomeArt(biomeId);
  return THEMES[biomeId] || THEMES.void;
}

let built = false;
export function buildPixelArt(scene) {
  if (built) return;
  built = true;
  artScene = scene;
  buildCommon(scene);
  buildAnimals(scene);
  buildFloorStrips(scene);
  buildGlowDot(scene);
  addAtlas(scene, "wx", weatherFrames());
  buildNewHazards(scene);
  buildDimensionHazards(scene);
  buildCosmeticArt(scene);
  ensureBiomeArt(EAGER_BIOME);
  buildHazards(scene, { solar: SOLAR, frozen: FROZEN, glitch: GLITCH, abyss: ABYSS });
}

// © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE. Not open source.
// Biome palettes and the smooth morph between them.
import { WORLD } from "../config.js";

export const BIOMES = [
  {
    id: "void",
    name: "NEON VOID",
    sky: [0x05010f, 0x0b0420, 0x020510],
    nebula: [0x5a20c0, 0x0090b0],
    neon: 0x3ef4ff,
    neon2: 0xc04bff,
    accent: 0xff4fd8,
    planet: 0x2a2440,
    island: 0x1e3a4a,
    particle: "mote",
    particleColor: 0x8ff7ff,
    glitch: 0,
    pulse: 0,
    embers: 0,
  },
  {
    id: "solar",
    name: "SOLAR STORM",
    sky: [0x0c0300, 0x1c0702, 0x070102],
    nebula: [0xb04a00, 0xa07a10],
    neon: 0xffb22e,
    neon2: 0xff4d1c,
    accent: 0xfff066,
    planet: 0x3a2418,
    island: 0x40281a,
    particle: "ember",
    particleColor: 0xffa53a,
    glitch: 0,
    pulse: 0,
    embers: 1,
  },
  {
    id: "frozen",
    name: "FROZEN NEBULA",
    sky: [0x010810, 0x041628, 0x01060c],
    nebula: [0x2a7ab0, 0x7aa8c0],
    neon: 0x9ff2ff,
    neon2: 0x4aa8ff,
    accent: 0xffffff,
    planet: 0x24323e,
    island: 0x2a4050,
    particle: "flake",
    particleColor: 0xe8fbff,
    glitch: 0,
    pulse: 0,
    embers: 0,
  },
  {
    id: "glitch",
    name: "GLITCH REALM",
    sky: [0x010603, 0x03120a, 0x07000c],
    nebula: [0x00a060, 0x9a1a80],
    neon: 0x39ff88,
    neon2: 0xff2bd6,
    accent: 0x2bd9ff,
    planet: 0x1c3326,
    island: 0x1a3a28,
    particle: "pixel",
    particleColor: 0x5dff9f,
    glitch: 1,
    pulse: 0,
    embers: 0,
  },
  {
    id: "abyss",
    name: "ABYSS",
    sky: [0x000000, 0x0c0002, 0x030000],
    nebula: [0x600010, 0x901020],
    neon: 0xff2a3d,
    neon2: 0xff6a3d,
    accent: 0xff0030,
    planet: 0x2a0c10,
    island: 0x3a1418,
    particle: "ash",
    particleColor: 0xff3a3a,
    glitch: 0,
    pulse: 1,
    embers: 0,
  },
  {
    id: "valley",
    name: "PEACEFUL VALLEY",
    sky: [0x8fd0ff, 0xffe0ef, 0xfff4d8],
    nebula: [0xffb0d8, 0xa8f0c8],
    neon: 0xff8ad0,
    neon2: 0x7ae8a8,
    accent: 0xfff07a,
    planet: 0xc8e8ff,
    island: 0x7ac890,
    particle: "mote",
    particleColor: 0xfff0f8,
    glitch: 0,
    pulse: 0,
    embers: 0,
  },
  {
    id: "hurricane",
    name: "HURRICANE",
    sky: [0x0c1218, 0x1c2836, 0x121a22],
    nebula: [0x2a4a6a, 0x4a3a6a],
    neon: 0x8ad8ff,
    neon2: 0xffd23f,
    accent: 0xc8e8ff,
    planet: 0x202c3a,
    island: 0x2a3a4c,
    particle: "mote",
    particleColor: 0xa8c0d8,
    glitch: 0,
    pulse: 0,
    embers: 0,
  },
];

// ---- the dimensions beyond the Hurricane rift (picked at random, never looped in order)
BIOMES.push(
  {
    id: "prism",
    name: "PRISM RIFT",
    dimension: true,
    sky: [0x05031a, 0x0d0838, 0x06041a],
    nebula: [0x3a2a9a, 0x9a3aff],
    neon: 0xe8f4ff,
    neon2: 0xff7ad9,
    accent: 0x7ae8ff,
    planet: 0x1a1250,
    island: 0x241a5a,
    particle: "mote",
    particleColor: 0xe8f4ff,
    glitch: 0,
    pulse: 0,
    embers: 0,
  },
  {
    id: "tidal",
    name: "TIDAL SKY",
    dimension: true,
    sky: [0x020a1a, 0x0a3a52, 0x03101e],
    nebula: [0x0a5a7a, 0x1a8aa8],
    neon: 0xff6ac8,
    neon2: 0x5af0e0,
    accent: 0x8af8ff,
    planet: 0x06223a,
    island: 0x0a3a52,
    particle: "mote",
    particleColor: 0xa8f8ff,
    glitch: 0,
    pulse: 0,
    embers: 0,
  },
  {
    id: "chrono",
    name: "CHRONO FRACTURE",
    dimension: true,
    sky: [0x0a0604, 0x2e1e10, 0x0a0604],
    nebula: [0x6a4a1a, 0x3a2410],
    neon: 0xffc83d,
    neon2: 0xff8a2a,
    accent: 0xfff0c0,
    planet: 0x1e140a,
    island: 0x2e1e10,
    particle: "mote",
    particleColor: 0xe8c890,
    glitch: 0,
    pulse: 0,
    embers: 0,
  },
  {
    id: "mirror",
    name: "MIRROR REALM",
    dimension: true,
    sky: [0x08040f, 0x1e1036, 0x08040f],
    nebula: [0x3a1a6a, 0x6a2aaa],
    neon: 0xb86aff,
    neon2: 0x7ad8ff,
    accent: 0xe8d0ff,
    planet: 0x140a24,
    island: 0x1e1036,
    particle: "mote",
    particleColor: 0xd8c0ff,
    glitch: 0,
    pulse: 0,
    embers: 0,
  },
);

export const N_BIOMES = BIOMES.length;
/** The classic biomes run in order (Neon Void → Hurricane); dimensions follow the rift. */
export const CLASSIC = BIOMES.filter((b) => !b.dimension).length;
export const DIMENSION_IDS = BIOMES.filter((b) => b.dimension).map((b) => b.id);
export const biomeIndex = (id) => BIOMES.findIndex((b) => b.id === id);
/** Biome id for a raw (ever-increasing) biome index. */
export const biomeIdOf = (raw) => BIOMES[((raw % N_BIOMES) + N_BIOMES) % N_BIOMES].id;

const lerp = (a, b, t) => a + (b - a) * t;

export function lerpColor(c1, c2, t) {
  const r = lerp((c1 >> 16) & 255, (c2 >> 16) & 255, t);
  const g = lerp((c1 >> 8) & 255, (c2 >> 8) & 255, t);
  const b = lerp(c1 & 255, c2 & 255, t);
  return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
}

export function colorToVec(c) {
  return { x: ((c >> 16) & 255) / 255, y: ((c >> 8) & 255) / 255, z: (c & 255) / 255 };
}

const smooth = (t) => t * t * (3 - 2 * t);

/**
 * Returns the blended palette for a distance in meters.
 * `index` is the "dominant" biome index (wraps after Abyss), `rawIndex` keeps counting.
 */
export function biomeStateAt(meters) {
  const L = WORLD.biomeLength;
  const raw = Math.floor(meters / L);
  const local = meters - raw * L;
  const a = BIOMES[raw % CLASSIC];
  const b = BIOMES[(raw + 1) % CLASSIC];
  const start = L - WORLD.biomeBlend;
  const t = local > start ? smooth((local - start) / WORLD.biomeBlend) : 0;
  return { a, b, t, rawIndex: t > 0.5 ? raw + 1 : raw };
}

/** Writes a blended palette into `out` (reused object, no allocations per frame). */
export function blendPalette(state, out) {
  const { a, b, t } = state;
  out.sky0 = lerpColor(a.sky[0], b.sky[0], t);
  out.sky1 = lerpColor(a.sky[1], b.sky[1], t);
  out.sky2 = lerpColor(a.sky[2], b.sky[2], t);
  out.neb0 = lerpColor(a.nebula[0], b.nebula[0], t);
  out.neb1 = lerpColor(a.nebula[1], b.nebula[1], t);
  out.neon = lerpColor(a.neon, b.neon, t);
  out.neon2 = lerpColor(a.neon2, b.neon2, t);
  out.accent = lerpColor(a.accent, b.accent, t);
  out.planet = lerpColor(a.planet, b.planet, t);
  out.island = lerpColor(a.island, b.island, t);
  out.particleColor = lerpColor(a.particleColor, b.particleColor, t);
  out.glitch = lerp(a.glitch, b.glitch, t);
  out.pulse = lerp(a.pulse, b.pulse, t);
  out.weights = out.weights || {};
  for (const bi of BIOMES) out.weights[bi.particle] = 0;
  out.weights[a.particle] += 1 - t;
  out.weights[b.particle] += t;
  return out;
}

/** Display name for a BIOMES index (the course never loops back, so no "II"/"III"). */
export function biomeName(index) {
  return BIOMES[((index % BIOMES.length) + BIOMES.length) % BIOMES.length].name;
}

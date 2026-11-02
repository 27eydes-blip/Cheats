// Biome palettes and the smooth morph between them.
import { WORLD } from "../config.js";

export const BIOMES = [
  {
    id: "void",
    name: "NEON VOID",
    sky: [0x12022e, 0x2a0b57, 0x061433],
    nebula: [0x7b2cff, 0x00e5ff],
    neon: 0x3ef4ff,
    neon2: 0xc04bff,
    accent: 0xff4fd8,
    planet: 0x9a7bff,
    island: 0x6ad8ff,
    particle: "mote",
    particleColor: 0x8ff7ff,
    glitch: 0,
    pulse: 0,
    embers: 0,
  },
  {
    id: "solar",
    name: "SOLAR STORM",
    sky: [0x2a0700, 0x7a2400, 0x1c0405],
    nebula: [0xff7a00, 0xffd23f],
    neon: 0xffb22e,
    neon2: 0xff4d1c,
    accent: 0xfff066,
    planet: 0xff9a4a,
    island: 0xffb860,
    particle: "ember",
    particleColor: 0xffa53a,
    glitch: 0,
    pulse: 0,
    embers: 1,
  },
  {
    id: "frozen",
    name: "FROZEN NEBULA",
    sky: [0x021a33, 0x0c4a7a, 0x02101f],
    nebula: [0x5fd0ff, 0xe6fbff],
    neon: 0x9ff2ff,
    neon2: 0x4aa8ff,
    accent: 0xffffff,
    planet: 0xbfe9ff,
    island: 0xc8f4ff,
    particle: "flake",
    particleColor: 0xe8fbff,
    glitch: 0,
    pulse: 0,
    embers: 0,
  },
  {
    id: "glitch",
    name: "GLITCH REALM",
    sky: [0x020d06, 0x0a2a1a, 0x12001f],
    nebula: [0x00ff9c, 0xff2bd6],
    neon: 0x39ff88,
    neon2: 0xff2bd6,
    accent: 0x2bd9ff,
    planet: 0x6dff9e,
    island: 0x40ffa0,
    particle: "pixel",
    particleColor: 0x5dff9f,
    glitch: 1,
    pulse: 0,
    embers: 0,
  },
  {
    id: "abyss",
    name: "ABYSS",
    sky: [0x000000, 0x1a0004, 0x050000],
    nebula: [0x8a0010, 0xff1a2e],
    neon: 0xff2a3d,
    neon2: 0xff6a3d,
    accent: 0xff0030,
    planet: 0x7a1020,
    island: 0xff3348,
    particle: "ash",
    particleColor: 0xff3a3a,
    glitch: 0,
    pulse: 1,
    embers: 0,
  },
];

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
  const a = BIOMES[raw % BIOMES.length];
  const b = BIOMES[(raw + 1) % BIOMES.length];
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

export function biomeName(rawIndex) {
  const name = BIOMES[rawIndex % BIOMES.length].name;
  const loop = Math.floor(rawIndex / BIOMES.length);
  return loop > 0 ? `${name} ${"I".repeat(Math.min(loop + 1, 3))}` : name;
}

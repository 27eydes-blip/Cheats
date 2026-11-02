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

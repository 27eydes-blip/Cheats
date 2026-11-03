// In-biome colour energy: every SHIFT_EVERY metres the backdrop wash moves to the next of
// 3–4 related colours (2.5 s blend), plus a glowing floor strip per biome.

export const SHIFT_EVERY = 150; // metres
export const SHIFT_BLEND = 2.5; // seconds

export const SHIFTS = {
  void: [0x14d8c0, 0x34ff6a, 0x22c8ff], // teal → green → cyan
  solar: [0xff7a12, 0xd81a10, 0xff2090, 0x9030ff], // orange → deep red → magenta → purple
  frozen: [0x6ad0ff, 0x9a6aff, 0x4040ff], // ice blue → violet → indigo
  glitch: [0x20f8e8, 0xb050ff, 0xa8ff20], // cyan → purple → acid green
  abyss: [0xd00c34, 0x240006, 0x8a000e], // crimson → near-black → blood red
  valley: [0xffb0d8, 0xa8f0c8, 0xfff0a0, 0xc8b0ff], // blush → mint → butter → lavender
  hurricane: [0x506478, 0x2a8a8a, 0x5a3a8a, 0x6aa0d8], // slate → storm teal → bruise → electric
  prism: [0x5a4aff, 0xff6ad0, 0x5ad8ff, 0xffe06a], // a slow rainbow refraction
  tidal: [0x1a5aa8, 0x1aa8a0, 0x3a3aa8], // deep blue → lagoon → twilight
  chrono: [0xc8901a, 0x8a3a1a, 0x6a5a2a], // brass → rust → old gold
  mirror: [0x6a2aaa, 0x2a3aaa, 0x8a2a8a], // violet → cobalt → plum
};

/** Glowing floor material per biome (main colour, hot highlight). */
export const FLOOR = {
  void: { a: 0x34ff6a, b: 0xc8ffb0, kind: "slime" },
  solar: { a: 0xff5a10, b: 0xffd23f, kind: "lava" },
  frozen: { a: 0x6ad0ff, b: 0xeaffff, kind: "ice" },
  glitch: { a: 0xff2ad8, b: 0x2bffef, kind: "data" },
  abyss: { a: 0xb0001e, b: 0xff3d5a, kind: "blood" },
  valley: { a: 0x6ad070, b: 0xfff4b0, kind: "meadow" },
  hurricane: { a: 0x3a7aaa, b: 0xeaf6ff, kind: "surf" },
  prism: { a: 0x7a70ff, b: 0xffffff, kind: "glass" },
  tidal: { a: 0x1aa8a0, b: 0x8af8ff, kind: "reef" },
  chrono: { a: 0xc8901a, b: 0xfff0c0, kind: "sand" },
  mirror: { a: 0x7a3ac8, b: 0xd8c0ff, kind: "pool" },
};

/** How strongly the additive wash / floor glow apply per biome (bright biomes need less). */
export const ENERGY = { valley: { wash: 0.45, floor: 0.35, glow: 0.3 } };

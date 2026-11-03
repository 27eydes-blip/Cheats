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
};

/** Glowing floor material per biome (main colour, hot highlight). */
export const FLOOR = {
  void: { a: 0x34ff6a, b: 0xc8ffb0, kind: "slime" },
  solar: { a: 0xff5a10, b: 0xffd23f, kind: "lava" },
  frozen: { a: 0x6ad0ff, b: 0xeaffff, kind: "ice" },
  glitch: { a: 0xff2ad8, b: 0x2bffef, kind: "data" },
  abyss: { a: 0xb0001e, b: 0xff3d5a, kind: "blood" },
};

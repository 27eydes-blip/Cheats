// Global tuning constants for Glydrift.
// All distances are in game pixels on a 720px-wide portrait playfield.

export const GAME_W = 720;

/** Height is derived from the device aspect so tall phones get more sky, not letterboxing. */
export function computeGameHeight() {
  const w = window.innerWidth || 390;
  const h = window.innerHeight || 844;
  let aspect = h / w;
  if (aspect < 1.3) aspect = 16 / 9; // desktop / landscape: show a classic portrait frame
  aspect = Math.min(Math.max(aspect, 1.5), 2.25);
  return Math.round(GAME_W * aspect);
}

export const PHYSICS = {
  gravityUp: 2300, // gravity while rising (lighter = floaty apex)
  gravityDown: 2750, // gravity while falling (heavier = snappy drop)
  flapVelocity: -790, // velocity set (not added) on tap
  terminalFall: 1080,
  terminalRise: -980,
  radius: 19,
  miniScale: 0.55,
  miniFlapMul: 0.86,
  miniGravityMul: 0.92,
  miniDuration: 6.5,
};

export const WORLD = {
  pxPerMeter: 20,
  baseSpeed: 300,
  speedGain: 270, // asymptotic extra speed
  speedRampMeters: 1500,
  maxSpeed: 580,
  playerXFrac: 0.3,
  minZoom: 0.84,
  biomeLength: 500, // meters per biome
  biomeBlend: 90, // meters of smooth morph before each boundary
};

export const NEAR_MISS = {
  threshold: 24, // clearance in px that counts as a near miss
  bonus: 25,
  slowScale: 0.32,
  slowTime: 0.22, // real seconds
};

export const RARITY = {
  common: { label: "COMMON", color: 0xbfd3e6 },
  rare: { label: "RARE", color: 0x3fa9ff },
  epic: { label: "EPIC", color: 0xb45cff },
  legendary: { label: "LEGENDARY", color: 0xffc83d },
};

export const FONT = '"Orbitron", "Avenir Next", system-ui, sans-serif';

export function speedForMeters(m) {
  const s = WORLD.baseSpeed + WORLD.speedGain * (1 - Math.exp(-m / WORLD.speedRampMeters));
  return Math.min(s, WORLD.maxSpeed);
}

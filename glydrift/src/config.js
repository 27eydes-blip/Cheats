// Global tuning constants for Glydrift.
// All distances are in game pixels on a 720px-wide portrait playfield.

export const GAME_W = 720;

/**
 * Logical view (720 x H game units) and the zoom Z that maps it onto the physical canvas.
 * The canvas is created at the device's full pixel ratio and every camera zooms by Z,
 * so vector shapes and text stay razor sharp on Retina screens.
 */
export const VIEW = { W: GAME_W, H: 1280, Z: 1, PW: 720, PH: 1280 };

export function setupView(lowGfx = false) {
  VIEW.H = computeGameHeight();
  const cssW = Math.min(window.innerWidth || 390, ((window.innerHeight || 844) * GAME_W) / VIEW.H);
  const dpr = Math.min(window.devicePixelRatio || 1, lowGfx ? 2 : 3);
  VIEW.Z = Math.max(0.5, (cssW * dpr) / GAME_W);
  VIEW.PW = Math.round(GAME_W * VIEW.Z);
  VIEW.PH = Math.round(VIEW.H * VIEW.Z);
  return VIEW;
}

/** Point every camera of a scene at the logical 720-wide view. */
export function fitCamera(scene, zoomMul = 1) {
  const cam = scene.cameras.main;
  cam.setZoom(VIEW.Z * zoomMul);
  cam.centerOn(VIEW.W / 2, VIEW.H / 2);
  return cam;
}

/**
 * Danger colours: every hazard uses one of these (with a consistent glow). Colours that
 * sit too close to the selected hero's hue are swapped out so a hazard never matches it.
 */
export const DANGER = { red: 0xff2a3d, orange: 0xff6a1a, pink: 0xff2d78 };
const hue = (c) => {
  const r = ((c >> 16) & 255) / 255;
  const g = ((c >> 8) & 255) / 255;
  const b = (c & 255) / 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx === mn) return -1;
  let h;
  if (mx === r) h = ((g - b) / (mx - mn)) % 6;
  else if (mx === g) h = (b - r) / (mx - mn) + 2;
  else h = (r - g) / (mx - mn) + 4;
  return (h * 60 + 360) % 360;
};
export function hazardColors(heroColor) {
  const hh = hue(heroColor);
  const near = (c) => {
    if (hh < 0) return false;
    const d = Math.abs(hue(c) - hh);
    return Math.min(d, 360 - d) < 28;
  };
  const pick = (pref, ...alts) => (near(pref) ? alts.find((a) => !near(a)) || pref : pref);
  return {
    saw: pick(DANGER.red, DANGER.pink),
    blade: pick(DANGER.orange, DANGER.red, DANGER.pink),
    crusher: pick(DANGER.red, DANGER.pink),
    gate: pick(DANGER.pink, DANGER.red),
    laser: pick(DANGER.pink, DANGER.red),
  };
}

export const PORTAL_COLOR = { main: 0xa45cff, light: 0xf2e6ff };
export const COIN_COLOR = 0xffc83d;

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
  radius: 21, // hitbox, matched to the drawn body of the hero
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
  playerXFrac: 0.22,
  baseZoom: 0.93, // < 1 shows a little more of the world
  minZoom: 0.8,
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
/** Numbers & body copy: Orbitron's slashed zero reads like a broken glyph at small sizes. */
export const NUM_FONT = '"Rajdhani", "Avenir Next", system-ui, sans-serif';

export function speedForMeters(m) {
  const s = WORLD.baseSpeed + WORLD.speedGain * (1 - Math.exp(-m / WORLD.speedRampMeters));
  return Math.min(s, WORLD.maxSpeed);
}
export const HERO_SCALE = 1.75; // in-game hero size (menus scale their showcase up separately)

/**
 * Supabase (leaderboard). Only the public *publishable* key belongs in the client — access
 * is enforced by Row Level Security. Never put a secret/service_role key here.
 */
export const SUPABASE = {
  url: "https://cdjcvhywrbsdryagqxqg.supabase.co",
  publishableKey: "sb_publishable_zZB05fEYY1eYhhmnzSuodg_QqpXF-dO",
};

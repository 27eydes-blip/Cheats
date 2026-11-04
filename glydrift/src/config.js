// Global tuning constants for Glydrift.
// All distances are in game pixels on a 720px-wide portrait playfield.

export const GAME_W = 720;

/**
 * Logical view (720 x H game units) and the zoom Z that maps it onto the physical canvas.
 * The canvas is created at the device's full pixel ratio and every camera zooms by Z,
 * so vector shapes and text stay razor sharp on Retina screens.
 */
export const VIEW = { W: GAME_W, H: 1280, Z: 1, PW: 720, PH: 1280 };

/**
 * The real drawable size. In an iPhone home-screen app the layout viewport can exclude the
 * home-indicator strip, which left a black bar at the bottom: use the full screen there.
 */
export function viewportSize() {
  let w = window.innerWidth || 390;
  let h = Math.max(window.innerHeight || 844, document.documentElement?.clientHeight || 0);
  const standalone =
    window.navigator.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches;
  if (standalone && window.screen?.height && h >= w) {
    w = Math.min(screen.width, screen.height);
    h = Math.max(screen.width, screen.height);
  }
  return { w, h };
}

/**
 * Pixel budget for the drawing buffer. The art is pixel-perfect at any density, so big
 * screens (iPad: ~5 M pixels at 2x) gain nothing visible from drawing every physical pixel —
 * they just burn fill-rate through the full-screen backdrop layers. Phones stay at full
 * resolution (an iPhone Pro Max is ~3.6 M); Low Graphics caps much harder.
 */
// canvas pixel budgets: a 3x-retina canvas (2.7M px on a notch iPhone) plus the texture set
// made older iPhones run out of memory ("A problem repeatedly occurred"); ~2x looks the same
// for pixel art
export const PIXEL_BUDGET = { normal: 2.3e6, low: 1.5e6 };

/** The view (logical height + zoom) that suits the window as it is right now. */
export function idealView(lowGfx = false) {
  const H = computeGameHeight();
  const vp = viewportSize();
  // phones fill edge to edge (ENVELOP), squarer screens show the whole frame (FIT)
  const cssW = wantsFit()
    ? Math.min(vp.w, (vp.h * GAME_W) / H)
    : Math.max(vp.w, (vp.h * GAME_W) / H);
  const dpr = Math.min(window.devicePixelRatio || 1, lowGfx ? 2 : 3);
  let z = Math.max(0.5, (cssW * dpr) / GAME_W);
  const budget = lowGfx ? PIXEL_BUDGET.low : PIXEL_BUDGET.normal;
  const px = GAME_W * z * (H * z);
  if (px > budget) z *= Math.sqrt(budget / px);
  const Z = Math.max(0.5, z);
  return { H, Z, PW: Math.round(GAME_W * Z), PH: Math.round(H * Z) };
}

export function setupView(lowGfx = false) {
  Object.assign(VIEW, idealView(lowGfx));
  return VIEW;
}

/**
 * After a rotation / window resize: is the canvas now far enough from the window's real
 * pixel size (or the frame shape far enough off) that it should be rebuilt to stay crisp?
 */
export function viewDrifted(lowGfx = false) {
  const v = idealView(lowGfx);
  return Math.abs(v.Z / VIEW.Z - 1) > 0.15 || Math.abs(v.H / VIEW.H - 1) > 0.08;
}

/**
 * Phones (tall screens) fill edge to edge (ENVELOP — tiny rounding crops only). Squarer
 * screens — iPad portrait/landscape, desktop — FIT the whole playfield with thin side bars:
 * enveloping them cropped the spiked top/bottom walls (and in landscape most of the field).
 */
export function wantsFit() {
  const { w, h } = viewportSize();
  return h / w < 1.5;
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
  const { w, h } = viewportSize();
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
  baseSpeed: 325,
  speedGain: 290, // asymptotic extra speed
  speedRampMeters: 1500,
  maxSpeed: 625,
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
  mega: { label: "MEGA LEGENDARY", color: 0xff3a8a },
  ultra: { label: "ULTRA LEGENDARY", color: 0x39ff6a },
};

export const FONT = '"Orbitron", "Galmuri11", "Avenir Next", system-ui, sans-serif';
/** Numbers & body copy: Orbitron's slashed zero reads like a broken glyph at small sizes. */
/** Chunky pixel font for shop headers. */
export const PIXEL_FONT = '"Silkscreen", "Galmuri11", "Orbitron", monospace';
export const NUM_FONT = '"Rajdhani", "Galmuri11", "Avenir Next", system-ui, sans-serif';

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

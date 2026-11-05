// Gameplay + feel tuning in one place. World speed, gravity and flap physics live in
// config.js (WORLD, PHYSICS, NEAR_MISS); this file holds everything layered on top:
// rewards, combo, biome pacing, The Calm / Abyss, flashes and obstacle spacing.
// Changing a number here changes the game — the values below are the shipped ones.

// ------------------------------------------------------------------ rewards & combo
export const REWARDS = {
  coinPoints: 10, // score per coin (× combo multiplier)
  perfectPoints: 15, // score for a dead-centre gap pass (× combo multiplier)
  biomeCoins: 50, // coins for reaching a new biome
  luckyChance: 0.05, // Lucky Run: about 1 normal run in 20 (golden trail, double coins)
  luckyTrail: [0xffffff, 0xfff1a0, 0xffd23f, 0xc8901a],
};

export const COMBO = {
  /** [chain length, multiplier], highest first */
  tiers: [
    [16, 10],
    [10, 5],
    [6, 3],
    [3, 2],
  ],
  window: 3.5, // seconds without a combo event before it resets
};

// ------------------------------------------------------------------ biome pacing
/** Speed multiplier per biome (1 = the normal speed curve). */
export const BIOME_SPEED = { glitch: 0.95, valley: 0.75 };

export const CALM = {
  meters: 150, // the last metres of the Glitch Realm before the Abyss
  slowdown: 0.18, // speed drops by up to this fraction during The Calm
};

export const ABYSS = {
  speedSpike: 1.06, // speed jump on entering
  speedRamp: 0.04, // extra speed gained across the biome
  darkRadius: 470, // light radius around the player
  darkAlpha: 0.55, // darkness outside the light
  graceMeters: 180, // gentle start: only simple, spaced-out obstacles
};


// ------------------------------------------------------------------ flashes
/** Safety limits (ScreenFlash enforces them for every flash). */
export const FLASH_LIMITS = { maxPerSecond: 3, peakCap: 0.55 };

/** Peak opacity + fade time of each moment's flash. */
export const FLASH = {
  runStart: { peak: 0.42, dur: 0.3 },
  nearMiss: { peak: 0.28, dur: 0.25 },
  nearMissEdge: { peak: 0.5, dur: 0.28 },
  perfect: { peak: 0.16, dur: 0.15 },
  milestone: { peak: 0.24, dur: 0.35 },
  milestoneBig: { peak: 0.32, dur: 0.35 },
  portal: { peak: 0.45, dur: 0.2 },
  death: { dur: 0.3 }, // peak comes from the hero's death effect
  biome: { peak: 0.45, dur: 0.35 },
  newBest: { peak: 0.4, dur: 0.35 },
  abyss: { peak: 0.55, dur: 0.6 },
  rift: { peak: 0.55, dur: 0.45 },
};

// ------------------------------------------------------------------ obstacle spacing
export const SPAWN = {
  /** Biome-local metres at which each signature hazard unlocks (introduced one at a time). */
  unlock: {
    // Neon Void: laser, axe, side lasers, the Neon Pulse, then the combinations
    void: [60, 200, 340, 260, 140, 240, 210, 290],
    // Glitch Realm: blink blocks, gravity zones, then the combinations
    glitch: [0, 120, 120, 200],
    default: [0, 120, 230],
    // Frozen Nebula: its three hazards, the Frost Comet, then the combination patterns
    // (a combination unlocks soon after the hazards it is made of)
    frozen: [0, 110, 210, 260, 130, 170, 240, 190],
    // Solar Storm: its three hazards, the Flare Arc, then the combination patterns
    solar: [0, 90, 170, 220, 110, 140, 200, 230],
    // Abyss: its three hazards, the Eye Beam, then a few gentle combinations
    // (the first 180 m are the grace stretch, so the Eye Beam is met just after it)
    abyss: [0, 120, 230, 190, 250, 210, 270],
    tidal: [0, 110, 220, 330],
    chrono: [0, 110, 220, 330],
  },
  /** Shared-obstacle difficulty is capped in these biomes (0..1). */
  difficultyCap: { abyss: 0.55, valley: 0.3 },
  /** Extra space between patterns per biome. */
  roomy: { abyss: 1.4, glitch: 1.12, valley: 1.6, hurricane: 1.05 },
  difficultyMeters: 2600, // distance at which shared obstacles reach full difficulty
  /**
   * Space between patterns (px): from `start` to `end` over the first `rampMeters` (gap sizes
   * and hazard speeds still follow difficultyMeters, so the path stays as open as before).
   */
  spacing: { start: 480, end: 340, rampMeters: 1600 },
};

/** Coin flow: keep a coin within reach often enough that the combo (COMBO.window) can last. */
export const COIN_FLOW = {
  maxGapSeconds: 2.3, // if the next coin would be further than this, a short coin trail bridges it
  bridgeCoins: 2, // coins per bridging trail
  pullToMiddle: 0.3, // trails drift this much toward the screen middle (keeps them catchable)
};

// ------------------------------------------------------------------ dimensions
export const DIMENSIONS = {
  riftAfter: 400, // metres into the Hurricane before the first rift opens
  length: 600, // metres per dimension before the next rift
  graceSeconds: 3, // lighter obstacles at the start of each dimension
  tearSeconds: 0.45, // the screen-tear transition
};

/** Lucky Spin: the most spins a player can hold (saves holding more are trimmed on load). */
export const SPIN_MAX = 3;

// ------------------------------------------------------------------ feel (view + sound only)
// None of these touch physics, hitboxes, spawning or scoring.
export const CAMERA_FEEL = {
  zoomOut: 0.03, // the view widens by up to 3% at top speed
  zoomEase: 0.8, // per second (slow: the zoom follows the speed ramp, never jumps)
  lead: 0.012, // px of vertical camera lead per px/s of hero speed
  leadMax: 10, // px
  leadEase: 3, // per second
};
export const TILT = {
  step: 3, // degrees the sprite's tilt snaps to (was 15: visibly steppy)
  rise: 16, // how fast the nose comes up on a flap (per second)
  fall: 7, // how gently it noses down while falling
};

// ------------------------------------------------------------------ hazards
export const HAZARD = {
  // hitbox size vs the drawn hazard (same for every hazard and every hero): 0.88 = 12% smaller
  hitbox: 0.88,
  deathSlow: 0.3, // seconds of slow-mo on a crash (was 0.5)
  retryLead: 240, // px of extra open sky before the first obstacle after a retry
};

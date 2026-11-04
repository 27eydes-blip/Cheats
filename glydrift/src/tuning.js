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
    void: [60, 200, 340],
    default: [0, 120, 230],
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

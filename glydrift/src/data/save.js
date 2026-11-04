// Local persistence. Everything lives in one JSON blob in localStorage; when wrapped with
// Capacitor this can be swapped for @capacitor/preferences without touching callers.
import { SPIN_MAX } from "../tuning.js";

const KEY = "glydrift.save.v1";

function defaults() {
  return {
    v: 1,
    coins: 0,
    xp: 0,
    level: 1,
    selected: "volt",
    unlocked: { volt: true },
    shards: {},
    spins: 1, // Lucky Spin tokens (everyone starts with one free spin)
    spinPts: 0, // points banked toward the next spin
    best: 0,
    ghost: null,
    ghostChar: "volt",
    stats: {
      runs: 0,
      totalDistance: 0,
      nearMisses: 0,
      lasers: 0,
      saws: 0,
      portals: 0,
      coins: 0,
      dailyPlayed: 0,
      maxDistance: 0,
      maxNearRun: 0,
      maxBiome: 0,
      maxLasersRun: 0,
      maxPortalsRun: 0,
    },
    missions: [],
    achievements: {},
    dimensions: {}, // dimension ids discovered (prism, tidal, chrono, mirror)
    cos: { owned: {}, equipped: {} }, // shop cosmetics: owned ids + equipped per category
    boosts: { owned: {}, armed: {} }, // (retired) one-run boosts
    boostsRefunded: false,
    dailyDrop: "", // date the free Daily Drift Drop was last claimed
    spinPity: 0, // Lucky Spin: spins since the last hero (the guarantee survives restarts)
    xpBoost: { mul: 1, runs: 0 }, // Drift Pass XP boost (runs left)
    seasons: {}, // per-season pass XP / claims, event progress, recap + new-hero flags
    pass: { xp: 0, claimed: {} }, // Drift Pass (free track) XP + claimed tiers // unused boosts were refunded as coins when boosts were removed
    login: { last: "", streak: 0, claimed: "" },
    daily: { date: "", best: 0, attempts: 0, ghost: null, ghostChar: "volt", lastPlayed: "" },
    levelRewards: {},
    profile: { username: "" },
    lbQueue: [],
    settings: {
      lowGfx: false,
      gfxChecked: false,
      gfxBoot: false, // first-launch weak-device check done
      musicVol: 0.7,
      sfxVol: 0.8,
      muted: false,
    },
  };
}

function merge(base, data) {
  if (!data || typeof data !== "object") return base;
  for (const k of Object.keys(base)) {
    if (!(k in data)) continue;
    const bv = base[k];
    const dv = data[k];
    if (bv && typeof bv === "object" && !Array.isArray(bv) && dv && typeof dv === "object") {
      base[k] = merge(bv, dv);
      // keep dynamic keys (unlocked chars, achievements…)
      for (const dk of Object.keys(dv)) if (!(dk in base[k])) base[k][dk] = dv[dk];
    } else {
      base[k] = dv;
    }
  }
  return base;
}

let cache = null;
let persists = null;

export const Save = {
  get data() {
    if (!cache) cache = Save.load();
    return cache;
  },
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      const d = merge(defaults(), raw ? JSON.parse(raw) : null);
      // spins used to be uncapped (one long run could bank dozens): trim to the cap
      if ((d.spins || 0) > SPIN_MAX) d.spins = SPIN_MAX;
      return d;
    } catch {
      return defaults();
    }
  },
  write() {
    try {
      localStorage.setItem(KEY, JSON.stringify(Save.data));
    } catch {
      // storage full / private mode: try once more without ghosts
      try {
        const slim = { ...Save.data, ghost: null, daily: { ...Save.data.daily, ghost: null } };
        localStorage.setItem(KEY, JSON.stringify(slim));
      } catch {
        /* ignore */
      }
    }
  },
  /** False when the browser refuses storage (private browsing, blocked site data). */
  canPersist() {
    if (persists === null) {
      try {
        localStorage.setItem("glydrift.probe", "1");
        localStorage.removeItem("glydrift.probe");
        persists = true;
      } catch {
        persists = false;
      }
    }
    return persists;
  },
  reset() {
    cache = defaults();
    Save.write();
  },
};

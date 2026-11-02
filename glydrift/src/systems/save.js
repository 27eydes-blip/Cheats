// Local persistence. Everything lives in one JSON blob in localStorage; when wrapped with
// Capacitor this can be swapped for @capacitor/preferences without touching callers.

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
    login: { last: "", streak: 0, claimed: "" },
    daily: { date: "", best: 0, attempts: 0, ghost: null, ghostChar: "volt", lastPlayed: "" },
    levelRewards: {},
    settings: {
      lowGfx: false,
      gfxChecked: false,
      musicVol: 0.7,
      sfxVol: 0.8,
      muted: false,
      bgStyle: "grid",
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

export const Save = {
  get data() {
    if (!cache) cache = Save.load();
    return cache;
  },
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      return merge(defaults(), raw ? JSON.parse(raw) : null);
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
  reset() {
    cache = defaults();
    Save.write();
  },
};

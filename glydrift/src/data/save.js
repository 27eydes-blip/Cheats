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
    lbReset: "", // the last leaderboard reset applied here (see online/lbReset.js)
    lbNotice: "", // that reset's notice, waiting to be shown on this device
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
      maxCombo: 0, // best combo multiplier in one run (THE HADDAD's challenge)
      maxBiome: 0,
      maxLasersRun: 0,
      maxPortalsRun: 0,
      voidDeaths: 0, // MATTOE's challenge: runs that ended in the Neon Void
    },
    missions: [],
    achievements: {},
    dimensions: {}, // dimension ids discovered (prism, tidal, chrono, mirror)
    cos: { owned: {}, equipped: {} }, // shop cosmetics: owned ids + equipped per category
    titles: { owned: {}, equipped: null }, // earned titles + the one shown under your name
    banners: { owned: {}, equipped: null }, // Drift Pass+ name-card banners
    passPlus: {}, // seasonId → server-verified Drift Pass+ purchase (restorable from the server)
    boosts: { owned: {}, armed: {} }, // (retired) one-run boosts
    boostsRefunded: false,
    dailyDrop: "", // date the free Daily Drift Drop was last claimed
    perkDaily: "", // date a hero's daily coin perk was last paid (one per day, any hero)
    moveNotice: { shown: 0, done: false }, // the glydrift.com launch pop-up: times shown, finished
    spinPity: 0, // Lucky Spin: spins since the last hero (the guarantee survives restarts)
    xpBoost: { mul: 1, runs: 0 }, // Drift Pass XP boost (runs left)
    seasons: {}, // per-season pass XP / claims, event progress, recap + new-hero flags
    pass: { xp: 0, claimed: {} }, // Drift Pass (free track) XP + claimed tiers // unused boosts were refunded as coins when boosts were removed
    login: { last: "", streak: 0, claimed: "" },
    daily: { date: "", best: 0, attempts: 0, ghost: null, ghostChar: "volt", lastPlayed: "" },
    levelRewards: {},
    lv: { p: {}, claimed: {}, played: 0 }, // LEVEL MODE progress (levels/levels.js); kept on load
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

/**
 * Lay saved data over the defaults. A value of the wrong type (an old or damaged save: null
 * where a list of heroes belongs, text where a number belongs) keeps the default instead, so
 * a damaged save loads with everything that's still good in it, never a crash.
 */
function merge(base, data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return base;
  for (const k of Object.keys(base)) {
    if (!(k in data)) continue;
    const bv = base[k];
    const dv = data[k];
    if (bv && typeof bv === "object" && !Array.isArray(bv)) {
      if (!dv || typeof dv !== "object" || Array.isArray(dv)) continue; // damaged: default
      base[k] = merge(bv, dv);
      // keep dynamic keys (unlocked chars, achievements…)
      for (const dk of Object.keys(dv)) if (!(dk in base[k])) base[k][dk] = dv[dk];
    } else if (Array.isArray(bv)) {
      if (Array.isArray(dv)) base[k] = dv;
    } else if (typeof bv === "number") {
      if (typeof dv === "number" && Number.isFinite(dv)) base[k] = dv;
    } else if (typeof bv === "string") {
      if (typeof dv === "string") base[k] = dv;
    } else if (typeof bv === "boolean") {
      if (typeof dv === "boolean") base[k] = dv;
    } else {
      base[k] = dv; // null defaults (ghosts): anything
    }
  }
  return base;
}

/** Counters that can never be negative (a damaged save, or an old bug). */
function repair(d) {
  for (const k of ["coins", "xp", "spins", "spinPts", "best", "spinPity"])
    if (!(d[k] >= 0)) d[k] = 0;
  if (!(d.level >= 1)) d.level = 1;
  d.unlocked.volt = true; // the starter hero is always there
  if (typeof d.selected !== "string" || !d.selected) d.selected = "volt";
  d.lbQueue = d.lbQueue.filter((q) => q && typeof q === "object");
  return d;
}

// ---- the device ledger: free rewards this DEVICE has already handed out. It lives outside
// the save, so logging out (or deleting the account, or signing into another account) can't
// hand the same day's daily reward, free Drift Drop, hero daily coin perk or starter spin out
// again.
const DEVICE_KEY = "glydrift.device.v1";
let ledgerCache = null;
function ledger() {
  if (!ledgerCache)
    try {
      ledgerCache = JSON.parse(localStorage.getItem(DEVICE_KEY)) || {};
    } catch {
      ledgerCache = {};
    }
  return ledgerCache;
}
const later = (a, b) => ((a || "") > (b || "") ? a : b) || "";
/** Remember what this save has claimed (called on every write; writes only on a change). */
function noteLedger(d) {
  const l = ledger();
  const next = {
    login: later(l.login, d.login?.claimed),
    drop: later(l.drop, d.dailyDrop),
    perk: later(l.perk, d.perkDaily),
    starterSpin: true, // a save has existed on this device: its free starter spin is given
  };
  if (next.login === l.login && next.drop === l.drop && next.perk === (l.perk || "") && l.starterSpin)
    return;
  ledgerCache = next;
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: nothing to protect anyway */
  }
}
/** A fresh or merged save can't re-claim what this device already claimed today. */
function applyLedger(d, fresh) {
  const l = ledger();
  d.login ||= {};
  d.login.claimed = later(d.login.claimed, l.login);
  d.dailyDrop = later(d.dailyDrop, l.drop);
  d.perkDaily = later(d.perkDaily, l.perk);
  if (fresh && l.starterSpin) d.spins = 0;
  return d;
}

let cache = null;
let persists = null;
const BACKUP = "glydrift.save.v1.bak";
const CORRUPT = "glydrift.save.v1.corrupt";
let lastBackup = 0;
let restoredFromBackup = false;
function safeGet(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k, v) {
  try {
    localStorage.setItem(k, v);
    return true;
  } catch {
    return false;
  }
}
function safeRemove(k) {
  try {
    localStorage.removeItem(k);
  } catch {}
}
const writeListeners = [];

export const Save = {
  get data() {
    if (!cache) cache = Save.load();
    return cache;
  },
  load() {
    let raw = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch {
      return defaults(); // storage blocked (private browsing)
    }
    for (const text of [raw, safeGet(BACKUP)]) {
      if (!text) continue;
      try {
        const d = repair(merge(defaults(), JSON.parse(text)));
        // spins used to be uncapped (one long run could bank dozens): trim to the cap
        if ((d.spins || 0) > SPIN_MAX) d.spins = SPIN_MAX;
        if (text !== raw) restoredFromBackup = true;
        return d;
      } catch {
        // unreadable (cut off mid-write, edited by hand): keep it aside, try the backup
        if (text === raw) safeSet(CORRUPT, raw);
      }
    }
    return defaults();
  },
  /** True when this launch's save came from the backup copy (the main copy was damaged). */
  get restoredFromBackup() {
    return restoredFromBackup;
  },
  write() {
    noteLedger(Save.data);
    for (const fn of writeListeners) {
      try {
        fn();
      } catch {
        /* a listener (cloud sync) must never break saving */
      }
    }
    const json = JSON.stringify(Save.data);
    if (!safeSet(KEY, json)) {
      // storage full: make room (local logs only), then try again without ghost replays
      for (const k of ["glydrift.analytics.v1", "glydrift.errors", CORRUPT]) safeRemove(k);
      if (!safeSet(KEY, json)) {
        const slim = { ...Save.data, ghost: null, daily: { ...Save.data.daily, ghost: null } };
        safeSet(KEY, JSON.stringify(slim));
      }
    }
    // a second copy, at most every 20 s: what's restored if the main copy is ever damaged
    const now = Date.now();
    if (now - lastBackup > 20000) {
      lastBackup = now;
      safeSet(BACKUP, JSON.stringify({ ...Save.data, ghost: null, daily: { ...Save.data.daily, ghost: null } }));
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
  /**
   * A fresh guest save on this device (log out / delete account). Device settings and today's
   * Daily Challenge attempts stay; free rewards already claimed here today aren't given again.
   */
  reset() {
    const old = cache;
    noteLedger(old || Save.data);
    cache = applyLedger(defaults(), true);
    if (old?.settings) cache.settings = { ...cache.settings, ...old.settings };
    if (old?.daily) cache.daily = { ...old.daily, ghost: null };
    Save.write();
  },
  /** Swap in a whole save (a merged cloud save); missing fields get their defaults. */
  replace(data) {
    noteLedger(Save.data);
    cache = applyLedger(repair(merge(defaults(), JSON.parse(JSON.stringify(data)))), false);
    Save.write();
  },
  /** Run fn after every write (cloud sync listens here). */
  onWrite(fn) {
    writeListeners.push(fn);
  },
};

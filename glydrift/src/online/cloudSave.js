// Cloud save: which parts of the save go to the player's account, and how two saves (this
// device and the cloud) are merged when they meet. Pure functions, no network.
//
// "Keep the most progress": the save with more progress is the base (its coins, level, XP,
// selected hero, equipped items, pass/season progress). Anything that can only be gained,
// never lost, is then combined from both: owned heroes and items, achievements, discovered
// dimensions, hero shards, claimed rewards, best scores and lifetime stats.

import { mergeLevelProgress } from "../levels/merge.js";

/** Device-only parts of the save that never go to the cloud. */
// (Drift Pass+ ownership is never taken from a save: the server's verified purchases are the
// source of truth, restored by the store)
const LOCAL_ONLY = ["settings", "lbQueue", "ghost", "daily", "passPlus", "lbNotice"];

/** The part of a save that is uploaded. */
export function cloudPayload(save) {
  const out = {};
  for (const [k, v] of Object.entries(save)) if (!LOCAL_ONLY.includes(k)) out[k] = v;
  // the daily challenge result for today still counts (its ghost replay stays local)
  if (save.daily) out.dailyBest = { date: save.daily.date, best: save.daily.best };
  return JSON.parse(JSON.stringify(out));
}

const count = (o) => (o ? Object.values(o).filter(Boolean).length : 0);

/** One number that grows with everything a player can earn. */
export function progressScore(save) {
  if (!save) return -1;
  const seasonXp = Object.values(save.seasons || {}).reduce((a, r) => a + (r?.xp || 0), 0);
  return (
    (save.level || 1) * 100000 +
    (save.xp || 0) +
    seasonXp +
    (save.pass?.xp || 0) +
    count(save.unlocked) * 5000 +
    count(save.cos?.owned) * 1500 +
    count(save.achievements) * 1000 +
    count(save.lv?.p) * 800 +
    (save.stats?.runs || 0) * 10
  );
}

/** {a, b} → every key true in either */
function union(a, b) {
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b || {})) if (v) out[k] = out[k] || v;
  return out;
}
/** {a, b} of numbers → the larger of each */
function maxEach(a, b) {
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b || {}))
    if (typeof v === "number") out[k] = Math.max(out[k] ?? -Infinity, v);
    else if (!(k in out)) out[k] = v;
  return out;
}

/** Season records: the further pass (XP) wins, claimed tiers and challenges are combined. */
function mergeSeasons(a = {}, b = {}) {
  const out = { ...a };
  for (const [id, rb] of Object.entries(b)) {
    const ra = out[id];
    if (!ra) {
      out[id] = rb;
      continue;
    }
    const base = (rb.xp || 0) > (ra.xp || 0) ? rb : ra;
    out[id] = {
      ...base,
      xp: Math.max(ra.xp || 0, rb.xp || 0),
      claimed: union(ra.claimed, rb.claimed),
      plusClaimed: union(ra.plusClaimed, rb.plusClaimed),
      // a finished event challenge stays finished (its coins are never paid twice)
      ...(ra.ev || rb.ev ? { ev: { ...(base.ev || {}), done: union(ra.ev?.done, rb.ev?.done) } } : {}),
    };
  }
  return out;
}

/**
 * Merge this device's save with the cloud's. Returns a new save; neither input is changed.
 * `local` keeps its device-only parts (settings, pending uploads, ghosts).
 */
export function mergeSaves(local, cloud) {
  if (!cloud) return local;
  const cloudFull = { ...cloud };
  const localWins = progressScore(local) >= progressScore(cloudFull);
  const base = JSON.parse(JSON.stringify(localWins ? local : { ...local, ...cloudFull }));
  const other = localWins ? cloudFull : local;
  // can only ever be gained: combine
  base.unlocked = union(base.unlocked, other.unlocked);
  base.achievements = union(base.achievements, other.achievements);
  base.dimensions = union(base.dimensions, other.dimensions);
  base.levelRewards = union(base.levelRewards, other.levelRewards);
  base.cos = {
    owned: union(base.cos?.owned, other.cos?.owned),
    equipped: { ...(base.cos?.equipped || {}) },
  };
  // Drift Pass+ banners are owned for good (their tier stays claimed in seasons)
  base.banners = {
    owned: union(base.banners?.owned, other.banners?.owned),
    equipped: base.banners?.equipped ?? other.banners?.equipped ?? null,
  };
  base.titles = {
    owned: union(base.titles?.owned, other.titles?.owned),
    equipped: base.titles?.equipped ?? other.titles?.equipped ?? null,
  };
  // having been ALL MIGHTY (the world's #1) is for good, on either side
  if (base.allMighty?.former || other.allMighty?.former)
    base.allMighty = {
      former: true,
      at: [base.allMighty?.at, other.allMighty?.at].filter(Boolean).sort()[0] || "",
    };
  base.shards = maxEach(base.shards, other.shards);
  base.stats = maxEach(base.stats, other.stats);
  // the per-hero / per-realm counters are maps: the larger count of each key
  for (const k of ["heroRuns", "realmDeaths"])
    base.stats[k] = maxEach(base.stats?.[k], other.stats?.[k]);
  // a leaderboard reset (online/lbReset.js) wipes the best scores set before it: the later
  // reset wins, and a best from a save that hasn't applied it doesn't count
  const later = (x, y) => ((x || "") > (y || "") ? x : y) || "";
  const reset = later(base.lbReset, other.lbReset);
  const bestOf = (sv) => ((sv.lbReset || "") >= reset ? sv.best || 0 : 0);
  base.best = Math.max(bestOf(base), bestOf(other));
  base.lbReset = reset;
  base.pass = {
    ...(base.pass || {}),
    xp: Math.max(base.pass?.xp || 0, other.pass?.xp || 0),
    claimed: union(base.pass?.claimed, other.pass?.claimed),
  };
  base.seasons = mergeSeasons(base.seasons, other.seasons);
  // LEVEL MODE: per level the best of both (done, each star coin, flawless, fastest time)
  if (base.lv || other.lv) base.lv = mergeLevelProgress(base.lv, other.lv);
  base.login = {
    ...(base.login || {}),
    streak: Math.max(base.login?.streak || 0, other.login?.streak || 0),
    // a reward claimed on either side today stays claimed (no double daily reward)
    claimed: later(base.login?.claimed, other.login?.claimed),
    last: later(base.login?.last, other.login?.last),
  };
  base.dailyDrop = later(base.dailyDrop, other.dailyDrop);
  if (!base.profile?.username && other.profile?.username) base.profile = { ...other.profile };
  // a selected hero / equipped item the merged save doesn't own falls back safely
  if (!base.unlocked[base.selected]) base.selected = "volt";
  // device-only parts always stay this device's
  for (const k of LOCAL_ONLY) if (k in local) base[k] = local[k];
  // the reset came from the account (applied on another device): this device's ghost and
  // daily best are from before it, and the notice was already seen there
  if ((local.lbReset || "") < reset) {
    base.ghost = null;
    if (base.daily) base.daily = { ...base.daily, best: 0, ghost: null };
  }
  delete base.dailyBest;
  return base;
}

// Cloud save: which parts of the save go to the player's account, and how two saves (this
// device and the cloud) are merged when they meet. Pure functions, no network.
//
// "Keep the most progress": the save with more progress is the base (its coins, level, XP,
// selected hero, equipped items, pass/season progress). Anything that can only be gained,
// never lost, is then combined from both: owned heroes and items, achievements, discovered
// dimensions, hero shards, claimed rewards, best scores and lifetime stats.

import { mergeLevelProgress } from "../levels/merge.js";
import { PLUS_S1_LAYOUT, migratePlusClaimsS1 } from "../data/seasonDefs.js";
import { SPIN_MAX } from "../tuning.js";

/**
 * Spendable amounts. When both sides changed since they last synced (two devices playing in
 * the same day), each side's earnings and spending are added up instead of one side's total
 * winning: coins earned on the tablet aren't lost to the phone's total, and a hero bought on
 * one device isn't paid for by the other's coins.
 */
const SPENDABLE = { coins: Infinity, spins: SPIN_MAX, spinPts: Infinity };

/** The spendable amounts of a save (what the device remembers as "last synced"). */
export function spendable(save) {
  const out = {};
  for (const k of Object.keys(SPENDABLE)) out[k] = Math.max(0, Number(save?.[k]) || 0);
  return out;
}

/** Device-only parts of the save that never go to the cloud. */
// (Drift Pass+ ownership is never taken from a save: the server's verified purchases are the
// source of truth, restored by the store)
// (cloudSync: what this device last synced, see account.js)
const LOCAL_ONLY = ["settings", "lbQueue", "ghost", "daily", "passPlus", "lbNotice", "cloudSync"];

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
    // Season 1's paid-track claims are stored by tier, and its track changed layout: a save
    // still on the old layout (e.g. a cloud copy uploaded before the update) has its claims
    // moved to the new tiers first, or old tier numbers would mark new rewards as claimed
    const s1New = id === "s1" && (ra.plusLayout === PLUS_S1_LAYOUT || rb.plusLayout === PLUS_S1_LAYOUT);
    const plusOf = (r) => (s1New && r.plusLayout !== PLUS_S1_LAYOUT ? migratePlusClaimsS1(r.plusClaimed || {}) : r.plusClaimed);
    out[id] = {
      ...base,
      ...(s1New ? { plusLayout: PLUS_S1_LAYOUT } : {}),
      xp: Math.max(ra.xp || 0, rb.xp || 0),
      claimed: union(ra.claimed, rb.claimed),
      plusClaimed: union(plusOf(ra), plusOf(rb)),
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
export function mergeSaves(local, cloud, synced = null) {
  if (!cloud) return local;
  const cloudFull = { ...cloud };
  delete cloudFull.syncId; // (the cloud copy's write id: see account.js pushNow)
  const localWins = progressScore(local) >= progressScore(cloudFull);
  const base = JSON.parse(JSON.stringify(localWins ? local : { ...local, ...cloudFull }));
  const other = localWins ? cloudFull : local;
  // can only ever be gained: combine
  base.unlocked = union(base.unlocked, other.unlocked);
  base.achievements = union(base.achievements, other.achievements);
  base.dimensions = union(base.dimensions, other.dimensions);
  base.realms = union(base.realms, other.realms);
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
  base.perkDaily = later(base.perkDaily, other.perkDaily); // a hero's daily coin perk, too
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
  delete base.syncId;
  // spendable amounts: what both sides gained or spent since they last synced, added up
  // (`synced` = the amounts this device last saw in the cloud; without it, the base's own)
  if (synced)
    for (const [k, cap] of Object.entries(SPENDABLE)) {
      const was = Number(synced[k]) || 0;
      const v = was + ((Number(local[k]) || 0) - was) + ((Number(cloudFull[k]) || 0) - was);
      base[k] = Math.min(cap, Math.max(0, Math.round(v)));
    }
  return base;
}

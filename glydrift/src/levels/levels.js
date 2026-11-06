// LEVEL MODE: 50 hand-designed levels, 10 per realm (every 10th is a boss), replacing the
// Daily Challenge. A level is a fixed, seeded list of "beats" played by the normal obstacle
// spawner (ObstacleManager.level), so it looks and plays like the rest of the game but is the
// same every time, with a finish line, three hidden star coins and a progress bar.
//
// Beat tokens (space separated):
//   saw gate blade …     an existing obstacle pattern (see ObstacleManager.spawnPattern)
//   gate^3               the same pattern three times
//   *t *m *b             a hidden star coin (top / middle / bottom) in the next gap
//   >                    a breather: a longer gap with a coin trail
//   |                    a checkpoint (normal mode respawns here after a crash)
//   @Some_text           a hint shown when that point reaches you (underscores = spaces)
//   d=0.4                the difficulty for the beats after it (gap sizes, hazard speeds)
//   g=420                the space between patterns for the beats after it (px)
import { LEVEL_DEFS } from "./levelDefs.js";
import { Save } from "../data/save.js";
import { Titles } from "../data/titles.js";
import { TEST } from "../systems/testFlags.js";
import { mergeLevelProgress as mergeLv } from "./merge.js";

export const REALMS = [
  { id: "void", name: "NEON VOID", col: 0x3ef4ff, title: "lv_void" },
  { id: "solar", name: "SOLAR STORM", col: 0xff8a2a, title: "lv_solar" },
  { id: "frozen", name: "FROZEN NEBULA", col: 0x9ad8ff, title: "lv_frozen" },
  { id: "glitch", name: "GLITCH REALM", col: 0x39ff88, title: "lv_glitch" },
  { id: "abyss", name: "THE ABYSS", col: 0xc8102e, title: "lv_abyss" },
];
export const LEVEL_COUNT = 50;

/** Coins for a first finish, per star earned for the first time, and per realm cleared. */
export const LEVEL_REWARDS = {
  finish: (n) => 50 + n * 6,
  star: 40,
  bossBonus: 300,
  realmCoins: 1000,
  finalCoins: 10000,
};

/** Parse one level's beat string into a list of beats. */
export function parseBeats(src, base) {
  const out = [];
  let d = base.d;
  let g = base.gap;
  let star = null;
  let hint = null;
  let cp = false;
  let breathe = false;
  for (const tok of src.trim().split(/\s+/)) {
    if (!tok) continue;
    if (tok.startsWith("*")) star = tok[1] || "m";
    else if (tok === ">") breathe = true;
    else if (tok === "|") cp = true;
    else if (tok.startsWith("@")) hint = tok.slice(1).replace(/_/g, " ");
    else if (tok.startsWith("d=")) d = Number(tok.slice(2));
    else if (tok.startsWith("g=")) g = Number(tok.slice(2));
    else {
      const [kind, rep] = tok.split("^");
      const n = Number(rep) || 1;
      for (let i = 0; i < n; i++) {
        out.push({ kind, d, gap: g, star, hint, cp, breathe });
        star = hint = null;
        cp = breathe = false;
      }
    }
  }
  return out;
}

/**
 * Batches shipped to players (10 levels each, one realm per batch, in order). A batch only
 * ships once every one of its levels passed the bot + god-mode checks and the full test suite.
 * Test builds can open later batches with ?levels=50 to verify them first.
 */
export const SHIPPED_BATCHES = 2;

let cache = null;
/** All playable levels (n = 1..50), parsed. Levels not shipped yet are absent. */
export function allLevels() {
  if (cache) return cache;
  const q = TEST.on && typeof location !== "undefined" ? new URLSearchParams(location.search) : null;
  const upTo = Number(q?.get("levels")) || SHIPPED_BATCHES * 10;
  cache = LEVEL_DEFS.filter((d) => d.n <= upTo).map((def) => {
    const realm = REALMS[Math.floor((def.n - 1) / 10)];
    const boss = def.n % 10 === 0;
    const base = { d: def.d ?? 0.1, gap: def.gap ?? 520 };
    const beats = parseBeats(def.beats, base);
    // a checkpoint at least every 6 patterns (normal mode respawns there)
    let since = 0;
    for (const b of beats) {
      if (b.cp) since = 0;
      else if (++since >= 6) {
        b.cp = true;
        since = 0;
      }
    }
    return {
      ...def,
      id: `lv${String(def.n).padStart(2, "0")}`,
      realm: realm.id,
      realmIdx: Math.floor((def.n - 1) / 10),
      boss,
      seed: def.seed ?? (def.n * 7919 + 13) >>> 0,
      speedM: def.speedM ?? (def.n - 1) * 35,
      beats,
      stars: beats.filter((b) => b.star).length,
    };
  });
  return cache;
}
export const getLevel = (n) => allLevels().find((l) => l.n === n) || null;
/** How many levels are built (batches ship 10 at a time). */
export const builtCount = () => allLevels().length;

// ------------------------------------------------------------------ progress (saved)
function state() {
  const s = Save.data;
  s.lv ||= { p: {}, claimed: {}, played: 0 };
  s.lv.p ||= {};
  s.lv.claimed ||= {};
  return s.lv;
}
const rec = (n) => state().p[n] || null;

/** Stars earned on level n: [finished, all 3 star coins, flawless]. */
export function starsOf(n) {
  const r = rec(n);
  if (!r) return [false, false, false];
  return [!!r.done, !!(r.coins && r.coins.every(Boolean) && r.coins.length >= 3), !!r.flawless];
}
export const starCount = (n) => starsOf(n).filter(Boolean).length;
export const totalStars = () => allLevels().reduce((a, l) => a + starCount(l.n), 0);
export const levelRecord = (n) => rec(n);

/** Is level n playable? Level 1 always; then in order (finish the one before it). */
export function isUnlocked(n) {
  if (n < 1 || n > builtCount()) return false;
  if (n === 1) return true;
  return !!rec(n - 1)?.done;
}
/** The highest unlocked level (the one the map scrolls to). */
export function currentLevel() {
  let n = 1;
  while (n < builtCount() && rec(n)?.done) n++;
  return n;
}

/**
 * A finished (or abandoned) normal-mode run. Practice runs never reach here.
 * @param res { n, finished, deaths, coins: [bool×3], timeMs }
 * @returns what changed: { first, newStars:[…], coins, rewards:[…], bestTime, prevBest }
 */
export function recordLevel(res) {
  const lv = state();
  const n = res.n;
  const def = getLevel(n);
  const r = (lv.p[n] ||= {
    done: false,
    coins: [false, false, false],
    flawless: false,
    best: 0,
    attempts: 0,
  });
  r.attempts = (r.attempts || 0) + 1;
  lv.played = (lv.played || 0) + 1;
  const out = {
    first: false,
    newStars: [],
    coins: 0,
    rewards: [],
    prevBest: r.best || 0,
    bestTime: false,
  };
  if (!res.finished) return out;
  const before = starsOf(n);
  if (!r.done) {
    r.done = true;
    out.first = true;
  }
  // star coins only count on a finished run (each one is kept once collected)
  r.coins = r.coins.map((c, i) => c || !!res.coins?.[i]);
  if (res.deaths === 0) r.flawless = true;
  if (res.deaths === 0 && res.timeMs > 0 && (!r.best || res.timeMs < r.best)) {
    out.bestTime = true;
    r.best = Math.round(res.timeMs);
  }
  const after = starsOf(n);
  after.forEach((v, i) => {
    if (v && !before[i]) out.newStars.push(i);
  });
  // first-time rewards (each paid once, remembered in lv.claimed)
  const claim = (key, coins, extra) => {
    if (lv.claimed[key]) return;
    lv.claimed[key] = true;
    out.coins += coins;
    out.rewards.push({ key, coins, ...extra });
  };
  if (r.done)
    claim(`f${n}`, LEVEL_REWARDS.finish(n) + (def?.boss ? LEVEL_REWARDS.bossBonus : 0), {
      kind: "finish",
    });
  after.forEach((v, i) => {
    if (v) claim(`s${n}_${i}`, LEVEL_REWARDS.star, { kind: "star" });
  });
  // a realm is cleared when its boss (every 10th level) is beaten
  if (def?.boss && r.done) {
    const realm = REALMS[def.realmIdx];
    claim(
      `realm_${realm.id}`,
      n === LEVEL_COUNT ? LEVEL_REWARDS.finalCoins : LEVEL_REWARDS.realmCoins,
      {
        kind: "realm",
        realm: realm.id,
        title: realm.title,
        trail: n === LEVEL_COUNT ? "trail_lv_master" : null,
      },
    );
  }
  Save.data.coins += out.coins;
  // realm titles and the Level Master trail
  for (const rw of out.rewards) {
    if (rw.title) Titles.grant(rw.title);
    if (rw.trail) {
      Save.data.cos ||= { owned: {}, equipped: {} };
      Save.data.cos.owned[rw.trail] = true;
      Save.data.cos.equipped.trail = rw.trail;
    }
  }
  Save.write();
  return out;
}

export { mergeLevelProgress } from "./merge.js";

/** "1:05.3" */
export function fmtTime(ms) {
  if (!ms) return "--";
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? "0" : ""}${r.toFixed(1)}`;
}

// test builds only: hooks for the automated level tests
if (TEST.on && typeof window !== "undefined") {
  window.__glyLevelMerge = mergeLv;
  window.__glyLevelCount = () => builtCount();
}

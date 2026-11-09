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
export const SHIPPED_BATCHES = 5;

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
  // (a damaged or hand-edited save may hold something other than a list here: never crash on it)
  const coins = Array.isArray(r.coins) ? r.coins : [];
  return [!!r.done, coins.length >= 3 && coins.every(Boolean), !!r.flawless];
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
  if (!Array.isArray(r.coins)) r.coins = [false, false, false]; // (a damaged save)
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
  // star milestones reached by this run (paid once each; the map rail shows them too)
  out.milestones = claimMilestones();
  return out;
}

// ------------------------------------------------------------------ names, map goodies
/** "Level 7: Upside Down" (bosses keep the same form; screens add the red boss styling). */
export const levelLabel = (def) => `Level ${def.n}: ${def.name}`;

/** Hazard kind -> map icon (the faint silhouette inside a locked node). */
const ICON_OF = {
  saw: "saw", saw2: "saw", gate: "gate", blade: "axe", bladeduo: "axe", hlaser: "laser",
  pulse: "pulse", pulsepair: "pulse", flip: "flip", mini: "mini", geyser: "geyser",
  eruption: "geyser", geyserbar: "geyser", meteor: "meteor", shower: "meteor",
  firebar: "firebar", firepair: "firebar", flare: "flare", icicle: "icicle",
  icecurtain: "icicle", slider: "slider", sliderpair: "slider", gauntlet: "slider",
  zap: "zap", zapstairs: "zap", comet: "comet", blink: "blink", blinkpair: "blink",
  blinkgate: "blink", zone: "zone", tendril: "tendril", tendrileye: "tendril",
  slammer: "slammer", eyeslam: "slammer", walls: "walls", eyebeam: "eye", eyepair: "eye",
};
let hazardCache = null;
/** Each level's signature hazard icon: the hazard it introduces, else its most used one. */
export function mainHazard(n) {
  if (!hazardCache) {
    hazardCache = {};
    const seen = new Set();
    for (const d of LEVEL_DEFS) {
      const beats = parseBeats(d.beats, { d: 0, gap: 0 });
      const cnt = {};
      for (const b of beats) cnt[b.kind] = (cnt[b.kind] || 0) + 1;
      const fresh = Object.keys(cnt).filter((k) => !seen.has(k) && k !== "gate");
      Object.keys(cnt).forEach((k) => seen.add(k));
      const top = Object.entries(cnt)
        .filter(([k]) => k !== "gate")
        .sort((a, b) => b[1] - a[1])[0]?.[0];
      hazardCache[d.n] = ICON_OF[fresh[0] || top] || "saw";
    }
  }
  return hazardCache[n] || "saw";
}

/** Treasure chests on the map after every 5th level: chest k opens when level 5k is beaten. */
export const CHEST_COUNT = LEVEL_COUNT / 5;
export const chestCoins = (k) => 150 + 50 * (k - 1);
export const chestState = (k) =>
  state().claimed[`chest${k}`] ? "open" : rec(5 * k)?.done ? "ready" : "locked";
/** Open every chest whose level is beaten (once each). Returns [{k, coins}]. */
export function claimChests() {
  const lv = state();
  const out = [];
  for (let k = 1; k <= CHEST_COUNT; k++) {
    if (lv.claimed[`chest${k}`] || !rec(5 * k)?.done) continue;
    lv.claimed[`chest${k}`] = true;
    out.push({ k, coins: chestCoins(k) });
    Save.data.coins += chestCoins(k);
  }
  if (out.length) Save.write();
  return out;
}

/** Star milestones along the map's side rail. */
export const STAR_MILESTONES = [
  { stars: 15, kind: "trail", id: "trail_starlight", label: "Starlight trail" },
  { stars: 40, kind: "coins", coins: 1500, label: "1,500 coins" },
  { stars: 75, kind: "title", id: "lv_starchaser", label: "Star Chaser title" },
  { stars: 110, kind: "coins", coins: 4000, label: "4,000 coins" },
  { stars: 150, kind: "title", id: "lv_perfect", label: "Perfect Pilot title" },
];
export const milestoneClaimed = (m) => !!state().claimed[`m${m.stars}`];
/** Grant every milestone the star total has reached (once each). Returns the new ones. */
export function claimMilestones() {
  const lv = state();
  const have = totalStars();
  const out = [];
  for (const m of STAR_MILESTONES) {
    if (have < m.stars || lv.claimed[`m${m.stars}`]) continue;
    lv.claimed[`m${m.stars}`] = true;
    if (m.kind === "coins") Save.data.coins += m.coins;
    if (m.kind === "title") Titles.grant(m.id);
    if (m.kind === "trail") {
      Save.data.cos ||= { owned: {}, equipped: {} };
      Save.data.cos.owned ||= {};
      Save.data.cos.owned[m.id] = true;
    }
    out.push(m);
  }
  if (out.length) Save.write();
  return out;
}
/** Stars earned in realm r (0..4), out of 30. */
export function realmStars(r) {
  let s = 0;
  for (let n = r * 10 + 1; n <= r * 10 + 10; n++) s += starCount(n);
  return s;
}
/** The next level to play: the first unbeaten one, else the first without 3 stars. */
export function nextLevel() {
  const c = currentLevel();
  if (!rec(c)?.done) return c;
  for (let n = 1; n <= builtCount(); n++) if (starCount(n) < 3) return n;
  return builtCount();
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
  window.__glyLevels = {
    getLevel,
    levelLabel,
    mainHazard,
    nextLevel,
    chestState,
    STAR_MILESTONES,
    names: () => LEVEL_DEFS.map((d) => d.name),
  };
}

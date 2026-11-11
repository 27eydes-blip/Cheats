// Meta-progression: XP/levels, missions, achievements, login streak, daily, unlocks.
import { BIOMES, progressRank } from "../biomes/biomes.js";
import { CHARACTERS, getCharacter, heroReleased, onSale } from "../player/characterDefs.js";
import { dayDiff, RNG, todayKey } from "./rng.js";
import { Save } from "./save.js";
import { plusAllowed } from "./plusGate.js";
import { Titles } from "./titles.js";
import { getCosmetic } from "./cosmetics.js";
import { SPIN_MAX } from "../tuning.js";
import { Seasons } from "./seasons.js";
import { DriftPass } from "./driftPass.js";
import { perkCoins, perkPassXp, perkXp } from "./heroPerks.js";
import { TEST } from "../systems/testFlags.js";

// ------------------------------------------------------------------ missions
const MISSION_TEMPLATES = [
  {
    id: "lasers_run",
    text: "Pass {n} lasers in one run",
    stat: "lasers",
    scope: "run",
    n: [5, 8, 12],
  },
  {
    id: "near_run",
    text: "Get {n} near-misses in one run",
    stat: "nearMiss",
    scope: "run",
    n: [3, 6, 9],
  },
  {
    id: "near_total",
    text: "Get {n} near-misses",
    stat: "nearMiss",
    scope: "total",
    n: [10, 20, 35],
  },
  { id: "biome", text: "Reach {biome}", stat: "biome", scope: "run", n: [1, 2, 3] },
  { id: "sakura", text: "Reach Sakura Skies", stat: "sakura", scope: "run", n: [1] },
  {
    id: "dist_run",
    text: "Fly {n}m in one run",
    stat: "distance",
    scope: "run",
    n: [300, 600, 1000],
  },
  {
    id: "dist_total",
    text: "Fly {n}m in total",
    stat: "distance",
    scope: "total",
    n: [2000, 5000],
  },
  {
    id: "coins_run",
    text: "Collect {n} coins in one run",
    stat: "coins",
    scope: "run",
    n: [10, 25, 40],
  },
  {
    id: "portals_run",
    text: "Fly through {n} portals in one run",
    stat: "portals",
    scope: "run",
    n: [2, 4],
  },
  { id: "saws_run", text: "Pass {n} saws in one run", stat: "saws", scope: "run", n: [6, 12] },
  { id: "runs", text: "Play {n} runs", stat: "runs", scope: "total", n: [3, 6] },
  // LEVEL MODE (it replaced the Daily Challenge)
  { id: "levels", text: "Beat {n} levels", stat: "levelDone", scope: "total", n: [1, 3] },
  { id: "stars", text: "Earn {n} level stars", stat: "levelStars", scope: "total", n: [3, 5] },
];

function missionFrom(tpl, n) {
  const text =
    tpl.id === "biome"
      ? tpl.text.replace(
          "{biome}",
          BIOMES[n].name.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()),
        )
      : tpl.text.replace("{n}", n);
  const tier = tpl.n.indexOf(n);
  return {
    tpl: tpl.id,
    text,
    stat: tpl.stat,
    scope: tpl.scope,
    target: n,
    progress: 0,
    done: false,
    reward: { coins: 100 + tier * 100, xp: 60 + tier * 50 },
  };
}

function runStat(run, stat) {
  if (stat === "runs") return 1;
  // an old "Play the Daily Challenge" mission now completes by beating a level
  if (stat === "daily") return run.levelDone || 0;
  // "Reach Solar Storm" etc. count the original realm ladder (Sakura Skies is BIOMES' last
  // entry, so its raw index would otherwise read as further than every realm)
  if (stat === "biome") return progressRank(run.biome || 0);
  return run[stat] || 0;
}

// ------------------------------------------------------------------ achievements
const DIMS = {
  prism: "Prism Rift",
  tidal: "Tidal Sky",
  chrono: "Chrono Fracture",
  mirror: "Mirror Realm",
};
export const DIMENSION_COUNT = Object.keys(DIMS).length;
/** How many dimensions this save has discovered. */
export const dimensionsFound = (s) => Object.keys(DIMS).filter((d) => s.dimensions?.[d]).length;

export const ACHIEVEMENTS = [
  {
    id: "first",
    name: "First Flight",
    desc: "Finish your first run",
    glyph: "1",
    check: (s) => s.stats.runs >= 1,
  },
  {
    id: "close",
    name: "Close Call",
    desc: "Pull off a near-miss",
    glyph: "!",
    check: (s) => s.stats.nearMisses >= 1,
  },
  {
    id: "daredevil",
    name: "Daredevil",
    desc: "10 near-misses in one run",
    glyph: "D",
    check: (s) => s.stats.maxNearRun >= 10,
  },
  {
    id: "sakura",
    name: "Blossom Drifter",
    desc: "Reach Sakura Skies",
    glyph: "B",
    check: (s) => !!s.realms?.sakura,
  },
  {
    id: "solar",
    name: "Sun Surfer",
    desc: "Reach the Solar Storm",
    glyph: "S",
    check: (s) => s.stats.maxBiome >= 1,
  },
  {
    id: "frozen",
    name: "Ice Breaker",
    desc: "Reach the Frozen Nebula",
    glyph: "F",
    check: (s) => s.stats.maxBiome >= 2,
  },
  {
    id: "glitch",
    name: "Corrupted",
    desc: "Reach the Glitch Realm",
    glyph: "G",
    check: (s) => s.stats.maxBiome >= 3,
  },
  {
    id: "abyss",
    name: "Into the Abyss",
    desc: "Reach the Abyss",
    glyph: "A",
    check: (s) => s.stats.maxBiome >= 4,
  },
  {
    id: "marathon",
    name: "Marathon",
    desc: "Fly 2500m in one run",
    glyph: "M",
    check: (s) => s.stats.maxDistance >= 2500,
  },
  {
    id: "laser",
    name: "Laser Dancer",
    desc: "Pass 15 lasers in one run",
    glyph: "L",
    check: (s) => s.stats.maxLasersRun >= 15,
  },
  {
    id: "portal",
    name: "Portal Hopper",
    desc: "6 portals in one run",
    glyph: "P",
    check: (s) => s.stats.maxPortalsRun >= 6,
  },
  {
    id: "rich",
    name: "Stardust Hoarder",
    desc: "Collect 1000 coins total",
    glyph: "$",
    check: (s) => s.stats.coins >= 1000,
  },
  {
    id: "streak",
    name: "Devoted",
    desc: "7-day login streak",
    glyph: "7",
    check: (s) => s.login.streak >= 7,
  },
  {
    id: "daily5",
    name: "Level Driver",
    desc: "Beat 5 levels",
    glyph: "★",
    // (was "Play 5 Daily Challenges": earned before stays earned)
    check: (s) => (s.stats.levelsBeaten || 0) >= 5,
  },
  {
    id: "level10",
    name: "Ascendant",
    desc: "Reach player level 10",
    glyph: "X",
    check: (s) => s.level >= 10,
  },
  {
    id: "arm_day",
    name: "Never Skip Arm Day",
    desc: "Unlock YARMS",
    glyph: "A",
    check: (s) => !!s.unlocked.yarms,
  },
  {
    id: "collector",
    name: "Full Roster",
    desc: "Unlock every character",
    glyph: "C",
    check: (s) =>
      CHARACTERS.every(
        (c) => c.limited || c.season || c.passPlus || !heroReleased(c) || s.unlocked[c.id],
      ),
  },
  {
    id: "legend",
    name: "Supernova",
    desc: "Unlock Nova",
    glyph: "N",
    check: (s) => !!s.unlocked.nova,
  },
  {
    id: "dim_prism",
    name: "Prism Walker",
    desc: "Discover the Prism Rift",
    glyph: "P",
    check: (s) => !!s.dimensions?.prism,
  },
  {
    id: "dim_tidal",
    name: "Sky Diver",
    desc: "Discover the Tidal Sky",
    glyph: "T",
    check: (s) => !!s.dimensions?.tidal,
  },
  {
    id: "dim_chrono",
    name: "Time Bender",
    desc: "Discover the Chrono Fracture",
    glyph: "C",
    check: (s) => !!s.dimensions?.chrono,
  },
  {
    id: "dim_mirror",
    name: "Reflection",
    desc: "Discover the Mirror Realm",
    glyph: "M",
    check: (s) => !!s.dimensions?.mirror,
  },
  {
    id: "dim_all",
    name: "Dimension Hopper",
    desc: "Discover all 4 dimensions",
    glyph: "4",
    check: (s) => dimensionsFound(s) >= DIMENSION_COUNT,
  },
];

// ------------------------------------------------------------------ login streak
export const LOGIN_REWARDS = [
  { coins: 50 },
  { coins: 80 },
  { coins: 120 },
  { coins: 160 },
  { coins: 220 },
  { coins: 300 },
  { coins: 400, shard: true },
];

// ------------------------------------------------------------------ level rewards
export const LEVEL_REWARDS = {
  2: { coins: 150 },
  3: { shard: true },
  4: { coins: 250 },
  5: { coins: 400 },
  6: { shard: true },
  8: { coins: 600 },
  10: { shard: true, coins: 800 },
  12: { coins: 1000 },
  15: { coins: 1500 },
  20: { coins: 2500 },
};

/** Points per Lucky Spin. */
export const SPIN_EVERY = 2500;
/** Most spins one run can earn (a single huge run used to bank dozens). */
export const SPINS_PER_RUN = 1;
/**
 * The wheel, clockwise from the top. Weights are relative chances and add up to 100, so each
 * weight is that slice's chance in percent (the odds table shows exactly these numbers).
 * Coin slices pay double what they used to (100 / 150 / 200 / 400 / 2000 → 200 / 300 / 400 /
 * 800 / 4000), and one slice is a rare cosmetic from SPIN_COSMETICS.
 */
export const SPIN_SLICES = [
  { type: "coins", amount: 200, weight: 22 },
  { type: "hero", weight: 5 },
  { type: "coins", amount: 400, weight: 20 },
  { type: "spins", amount: 2, weight: 9 }, // two free spins back
  { type: "cosmetic", weight: 3 }, // one of SPIN_COSMETICS, or its coin value if owned
  { type: "coins", amount: 300, weight: 20 },
  { type: "hero", weight: 5 },
  { type: "jackpot", amount: 4000, weight: 3 },
  { type: "coins", amount: 800, weight: 13 },
];
/** What a hero slice pays once every spin hero is owned. */
export const SPIN_HERO_COINS = 2000;
/**
 * The cosmetic slice: one of these epic shop items, picked evenly. They stay for sale in the
 * shop as before; the wheel is just a lucky way to get one. Already own the one rolled? You
 * get half its shop price in coins instead (the screen says so).
 */
export const SPIN_COSMETICS = [
  "trail_rainbow",
  "trail_galaxy",
  "hat_halo",
  "hat_helmet",
  "skin_neon",
  "skin_chrome",
  "coin_hearts",
];
/** The coins a cosmetic you already own pays instead: half its shop price, to the nearest 50. */
export const spinCosmeticCoins = (id) =>
  Math.max(500, Math.round((getCosmetic(id)?.price || 1000) / 100) * 50);
/** A hero is guaranteed after this many spins in a row without one (while any are left). */
export const SPIN_PITY = 30;
/** Most spins a multi-spin uses at once. */
export const SPIN_MULTI_MAX = 20;

export const Progression = {
  xpToNext(level) {
    return Math.round(140 * level ** 1.32);
  },

  // ---------------------------------------------------------------- missions
  ensureMissions() {
    const s = Save.data;
    const rng = new RNG(Date.now());
    // the Daily Challenge is gone: an old daily mission becomes "Beat a level"
    for (const m of s.missions)
      if (m.tpl === "daily") {
        m.tpl = "levels";
        m.stat = "levelDone";
        m.text = "Beat 1 level";
      }
    if (s.missions.length === 0) {
      // the first three are hand-picked so new players see the signature goals
      s.missions = [
        missionFrom(MISSION_TEMPLATES[0], 5),
        missionFrom(MISSION_TEMPLATES[2], 10),
        missionFrom(MISSION_TEMPLATES[3], 1),
      ];
    }
    while (s.missions.length < 3) {
      const used = new Set(s.missions.map((m) => m.tpl));
      const pool = MISSION_TEMPLATES.filter((t) => !used.has(t.id));
      const tpl = rng.pick(pool);
      s.missions.push(missionFrom(tpl, rng.pick(tpl.n)));
    }
    Save.write();
  },

  /** Progress value of a mission including the in-flight run. */
  missionValue(m, run) {
    const v = run ? runStat(run, m.stat) : 0;
    return m.scope === "total" ? m.progress + v : Math.max(m.progress, v);
  },

  /** Missions that become complete during the live run (for in-game toasts). */
  liveMissionCheck(run, announced) {
    const out = [];
    for (const m of Save.data.missions) {
      if (m.done || announced.has(m)) continue;
      if (Progression.missionValue(m, run) >= m.target) {
        announced.add(m);
        out.push(m);
      }
    }
    return out;
  },

  // ---------------------------------------------------------------- login
  loginStatus() {
    const s = Save.data;
    const today = todayKey();
    if (s.login.claimed === today)
      return { canClaim: false, streak: s.login.streak, day: ((s.login.streak - 1) % 7) + 1 };
    const gap = s.login.last ? dayDiff(s.login.last, today) : 99;
    // the date went backwards (flew west / clock changed): today is already covered
    if (gap < 0)
      return { canClaim: false, streak: s.login.streak, day: ((s.login.streak - 1) % 7) + 1 };
    const streak = gap === 1 ? s.login.streak + 1 : gap === 0 ? s.login.streak : 1;
    return { canClaim: true, streak, day: ((streak - 1) % 7) + 1 };
  },

  claimLogin() {
    const st = Progression.loginStatus();
    if (!st.canClaim) return null;
    const s = Save.data;
    s.login.streak = st.streak;
    s.stats.maxStreak = Math.max(s.stats.maxStreak || 0, st.streak);
    s.login.last = todayKey();
    s.login.claimed = todayKey();
    const reward = LOGIN_REWARDS[st.day - 1];
    s.coins += reward.coins;
    s.stats.coins += 0;
    const out = { ...reward, day: st.day, streak: st.streak };
    if (reward.shard) out.shardResult = Progression.grantShard();
    out.unlocks = Progression.checkChallengeUnlocks(); // Bao: a login-streak hero
    Progression.checkAchievements();
    Save.write();
    return out;
  },

  /** The character the next shard will go to (for labelling the Day 7 reward). */
  shardTarget() {
    return CHARACTERS.find((c) => c.shards && !Save.data.unlocked[c.id]) || null;
  },

  // ---------------------------------------------------------------- unlocks
  grantShard() {
    const s = Save.data;
    const target = CHARACTERS.find((c) => c.shards && !s.unlocked[c.id]);
    if (!target) {
      s.coins += 300;
      return { coins: 300 };
    }
    s.shards[target.id] = (s.shards[target.id] || 0) + 1;
    let unlocked = false;
    if (s.shards[target.id] >= target.shards) {
      s.unlocked[target.id] = true;
      unlocked = true;
    }
    return { id: target.id, count: s.shards[target.id], need: target.shards, unlocked };
  },

  isUnlocked(id) {
    // a Drift Pass+ hero also needs its season's verified purchase (plusGate.js)
    return !!Save.data.unlocked[id] && plusAllowed(getCharacter(id));
  },
  /** The hero to fly: the selected one, or VOLT if it isn't usable any more. */
  selectedHero() {
    const id = Save.data.selected;
    return this.isUnlocked(id) ? id : "volt";
  },

  /** A stat by name; "dimensions" = how many dimensions this save has discovered. */
  statOf(stat) {
    const s = Save.data;
    if (stat === "dimensions") return dimensionsFound(s);
    if (stat === "prismFound") return s.dimensions?.prism ? 1 : 0;
    if (stat === "maxStreak") return Math.max(s.stats.maxStreak || 0, s.login?.streak || 0);
    if (stat === "deaths") return s.stats.deaths ?? s.stats.runs ?? 0;
    return s.stats[stat] || 0;
  },

  /** Heroes with `requires` need every listed goal done before they can be bought. */
  requirementsMet(def) {
    return (def.requires || []).every((r) => Progression.statOf(r.stat) >= r.value);
  },

  challengeMet(def) {
    if (!def.challenge) return false;
    return Progression.statOf(def.challenge.stat) >= def.challenge.value;
  },

  challengeProgress(def) {
    if (!def.challenge) return 0;
    return Math.min(1, Progression.statOf(def.challenge.stat) / def.challenge.value);
  },

  buy(id) {
    const s = Save.data;
    const def = getCharacter(id);
    // a season's hero goes on sale for coins once its season is over
    const cost = def.cost || Seasons.afterPrice(id);
    if (def.lottery || def.passPlus || !cost) return false; // Spin / Pass+ heroes: never for sale
    if (!onSale(def)) return false; // limited-time heroes only inside their window
    if (!Progression.requirementsMet(def)) return false;
    if (s.unlocked[id] || s.coins < cost) return false;
    s.coins -= cost;
    s.unlocked[id] = true;
    Progression.checkAchievements();
    Save.write();
    return true;
  },

  /** Unlocks characters whose challenges are now satisfied. */
  checkChallengeUnlocks() {
    const s = Save.data;
    const out = [];
    for (const c of CHARACTERS) {
      if (!s.unlocked[c.id] && heroReleased(c) && Progression.challengeMet(c)) {
        s.unlocked[c.id] = true;
        out.push(c);
      }
    }
    return out;
  },

  /**
   * The single closest goal for the "almost there" panel: an unfinished mission or the
   * nearest character unlock — whichever is furthest along.
   */
  nearestGoal() {
    let best = null;
    for (const m of Save.data.missions) {
      if (m.done) continue;
      const cur = Math.min(m.target, Progression.missionValue(m, null));
      const frac = cur / m.target;
      const label = m.stat === "biome" || m.stat === "sakura" ? m.text : `${m.text} · ${cur}/${m.target}`;
      if (!best || frac > best.frac) best = { kind: "mission", text: label, frac, color: 0x39ff88 };
    }
    const u = Progression.nextUnlockHint();
    if (u && (!best || u.frac > best.frac + 0.05))
      best = { kind: "unlock", text: u.text, frac: u.frac, color: u.def.color };
    return best;
  },

  /** "Almost there" helper: the cheapest locked character and how far away it is. */
  nextUnlockHint() {
    const s = Save.data;
    const locked = CHARACTERS.filter(
      (c) =>
        !s.unlocked[c.id] &&
        heroReleased(c) &&
        !c.lottery &&
        !c.passPlus &&
        !c.limited &&
        !c.season &&
        !c.requires,
    );
    if (!locked.length) return null;
    let best = null;
    for (const c of locked) {
      // challenge-only heroes (cost 0) can't be bought: no "unlock now" from coins
      const coinFrac = c.cost > 0 ? s.coins / c.cost : 0;
      const chFrac = Progression.challengeProgress(c);
      const shardFrac = c.shards ? (s.shards[c.id] || 0) / c.shards : 0;
      const frac = Math.max(coinFrac, chFrac, shardFrac);
      // nearest = furthest along; near-ties go to the cheaper (closer) hero
      const better =
        !best ||
        frac > best.frac + 0.05 ||
        (Math.abs(frac - best.frac) <= 0.05 && c.cost < best.def.cost);
      if (better) best = { def: c, frac, coinFrac, chFrac, shardFrac };
    }
    const d = best.def;
    let text;
    if (best.chFrac >= best.coinFrac && best.chFrac >= best.shardFrac && d.challenge) {
      const cur = Progression.statOf(d.challenge.stat);
      const left = d.challenge.value - cur;
      text =
        d.challenge.stat === "maxBiome"
          ? `${d.challenge.text} to unlock ${d.name}`
          : `${d.challenge.stat === "maxDistance" ? `${left}m` : left} more to unlock ${d.name}`;
    } else if (best.shardFrac > best.coinFrac) {
      text = `${d.shards - (s.shards[d.id] || 0)} shard(s) to unlock ${d.name}`;
    } else {
      text =
        s.coins >= d.cost
          ? `You can unlock ${d.name} now!`
          : `${d.cost - s.coins} coins to unlock ${d.name}`;
    }
    return { def: d, frac: Math.min(1, best.frac), text };
  },

  // ---------------------------------------------------------------- Lucky Spin
  /** Heroes the Lucky Spin can still award: spin-only ones plus shop heroes in the spin pool. */
  lotteryLeft() {
    return CHARACTERS.filter((c) => (c.lottery || c.spinPool) && !Save.data.unlocked[c.id]);
  },

  /**
   * Spend a spin and roll the prize (decided before the wheel animates; the wheel then lands
   * exactly on that slice). Returns { slice, prize } where prize is one of
   * {type:"coins", amount, jackpot} | {type:"spins", amount} | {type:"hero", id} |
   * {type:"cosmetic", id, dupe, amount} (dupe: already owned, so `amount` coins instead).
   * `force` (test builds only) picks the slice, so tests can check every kind of prize.
   */
  spin(force) {
    const s = Save.data;
    if ((s.spins || 0) <= 0) return null;
    s.spins -= 1;
    const left = Progression.lotteryLeft();
    let idx = 0;
    if (TEST.on && Number.isInteger(force) && SPIN_SLICES[force]) idx = force;
    else if (left.length && (s.spinPity || 0) >= SPIN_PITY - 1) {
      // pity: too long without a hero → this spin lands on a hero slice
      const heroSlices = SPIN_SLICES.map((sl, i) => (sl.type === "hero" ? i : -1)).filter(
        (i) => i >= 0,
      );
      idx = heroSlices[Math.floor(Math.random() * heroSlices.length)];
    } else {
      const total = SPIN_SLICES.reduce((a, sl) => a + sl.weight, 0);
      let r = Math.random() * total;
      for (; idx < SPIN_SLICES.length - 1; idx++) {
        r -= SPIN_SLICES[idx].weight;
        if (r < 0) break;
      }
    }
    const slice = SPIN_SLICES[idx];
    s.spinPity = slice.type === "hero" && left.length ? 0 : (s.spinPity || 0) + 1;
    let prize;
    if (slice.type === "hero" && left.length) {
      const w = (c) => ({ rare: 6, epic: 3, legendary: 1 })[c.rarity] || 3;
      let h = Math.random() * left.reduce((a, c) => a + w(c), 0);
      let pick = left[0];
      for (const c of left) {
        h -= w(c);
        if (h < 0) {
          pick = c;
          break;
        }
      }
      s.unlocked[pick.id] = true;
      prize = { type: "hero", id: pick.id };
    } else if (slice.type === "spins") {
      const got = Math.max(0, Math.min(slice.amount, SPIN_MAX - s.spins));
      s.spins += got;
      prize = { type: "spins", amount: got };
    } else if (slice.type === "cosmetic") {
      const id = SPIN_COSMETICS[Math.floor(Math.random() * SPIN_COSMETICS.length)];
      s.cos ||= { owned: {}, equipped: {} };
      s.cos.owned ||= {};
      if (s.cos.owned[id]) {
        const amount = spinCosmeticCoins(id);
        s.coins += amount;
        prize = { type: "cosmetic", id, dupe: true, amount };
      } else {
        s.cos.owned[id] = true;
        prize = { type: "cosmetic", id, dupe: false, amount: 0 };
      }
    } else {
      // every lottery hero owned → the hero slice pays a jackpot instead
      const amount = slice.type === "hero" ? SPIN_HERO_COINS : slice.amount;
      s.coins += amount;
      prize = { type: "coins", amount, jackpot: slice.type === "jackpot" };
    }
    Save.write();
    return { slice: idx, prize };
  },

  /** Spins left before the hero guarantee kicks in (null when every hero is owned). */
  spinsToGuarantee() {
    if (!Progression.lotteryLeft().length) return null;
    return Math.max(1, SPIN_PITY - (Save.data.spinPity || 0));
  },

  /** Use up to n spins in one go (free spins won along the way can be used too). */
  spinMany(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const r = Progression.spin();
      if (!r) break;
      out.push(r);
    }
    return out;
  },

  // ---------------------------------------------------------------- achievements
  checkAchievements() {
    const s = Save.data;
    const out = [];
    for (const a of ACHIEVEMENTS) {
      if (!s.achievements[a.id] && a.check(s)) {
        s.achievements[a.id] = Date.now();
        out.push(a);
      }
    }
    return out;
  },

  // ---------------------------------------------------------------- end of run
  commitRun(run) {
    const s = Save.data;
    const st = s.stats;
    const res = {
      run,
      prevBest: run.mode === "daily" ? s.daily.best : s.best,
      coinsBefore: s.coins,
      levelBefore: s.level,
      xpBefore: s.xp,
      levelUps: [],
      missions: [],
      achievements: [],
      unlocks: [],
    };

    // stats
    st.runs += 1;
    st.totalDistance += run.distance;
    st.nearMisses += run.nearMiss;
    st.lasers += run.lasers;
    st.saws += run.saws;
    st.portals += run.portals;
    st.coins += run.coins;
    st.maxDistance = Math.max(st.maxDistance, run.distance);
    st.maxNearRun = Math.max(st.maxNearRun, run.nearMiss);
    st.maxCombo = Math.max(st.maxCombo || 0, run.bestCombo || 1); // THE HADDAD's challenge
    st.maxBiome = Math.max(st.maxBiome, progressRank(run.biome || 0));
    st.maxLasersRun = Math.max(st.maxLasersRun, run.lasers);
    st.maxPortalsRun = Math.max(st.maxPortalsRun, run.portals);
    if (run.killedIn === "void") st.voidDeaths = (st.voidDeaths || 0) + 1;
    // JAMAL's challenge ("Die 50 times"): a run that ended in a crash (a save from before this
    // was counted starts from its earlier runs, nearly all of which ended that way)
    if (run.killedIn) st.deaths = (st.deaths ?? Math.max(0, st.runs - 1)) + 1;
    // animal challenges: the Abyss and the Prism Rift
    if (run.abyssM > 0) st.abyssRuns = (st.abyssRuns || 0) + 1;
    st.maxAbyssM = Math.max(st.maxAbyssM || 0, Math.floor(run.abyssM || 0));
    st.maxAbyssNear = Math.max(st.maxAbyssNear || 0, run.abyssNear || 0);
    st.maxPrismM = Math.max(st.maxPrismM || 0, Math.floor(run.prismM || 0));
    st.prismClears = (st.prismClears || 0) + (run.prismClear || 0);
    st.abyssClears = (st.abyssClears || 0) + (run.abyssClear || 0);
    // the Stats page: time flown, runs per hero and crashes per realm. Only runs from now on
    // are timed, so the average run time divides by timedRuns, not by every run ever played.
    st.playMs = (st.playMs || 0) + Math.round(run.runTimeMs || 0);
    st.timedRuns = (st.timedRuns || 0) + 1;
    if (run.char) {
      st.heroRuns ||= {};
      st.heroRuns[run.char] = (st.heroRuns[run.char] || 0) + 1;
    }
    if (run.killedIn) {
      st.realmDeaths ||= {};
      st.realmDeaths[run.killedIn] = (st.realmDeaths[run.killedIn] || 0) + 1;
    }

    // LEVEL MODE: levels beaten and stars earned (missions, achievements)
    if (run.mode === "level") {
      st.levelsBeaten = (st.levelsBeaten || 0) + (run.levelDone || 0);
      st.levelStars = (st.levelStars || 0) + (run.levelStars || 0);
    }
    // (the Daily Challenge was replaced by level mode; old daily data stays stored, unused)
    if (run.mode === "daily") {
      const today = todayKey();
      if (s.daily.date !== today) {
        s.daily = {
          date: today,
          best: 0,
          attempts: 0,
          ghost: null,
          ghostChar: run.char,
          lastPlayed: today,
        };
      }
      if (s.daily.attempts === 0) st.dailyPlayed += 1;
      s.daily.attempts += 1;
    }

    // best + ghost (a boosted run never sets a best: it isn't a fair score)
    res.newBest = !run.boosted && run.score > res.prevBest;
    if (run.mode === "daily") {
      if (res.newBest) {
        s.daily.best = run.score;
        s.daily.ghost = run.ghost;
        s.daily.ghostChar = run.char;
      }
    } else if (res.newBest) {
      s.best = run.score;
      s.ghost = run.ghost;
      s.ghostChar = run.char;
    }

    // coins (+ a hero perk bonus, e.g. RONIN's +13, which isn't "collected")
    s.coins += run.coins + (run.perkBonus?.total || 0);
    // reward-only hero perks (DRIFT PASS+ heroes: +% coins / XP / pass XP, a daily bonus).
    // Paid on top, never counted as "collected" (missions, stats and XP ignore them), and
    // they never touch run.score or run.distance.
    const perks = getCharacter(run.char)?.perks;
    const pc = perkCoins(perks, run, s);
    if (pc.pct || pc.daily || perks?.xpPct || perks?.passPct) {
      run.heroPerk = { coins: pc.pct + pc.daily, pctCoins: pc.pct, daily: pc.daily, xp: 0, passXp: 0 };
      s.coins += pc.pct + pc.daily;
    }

    // missions
    for (const m of s.missions) {
      if (m.done) continue;
      const v = Progression.missionValue(m, run);
      m.progress = m.scope === "total" ? v : Math.max(m.progress, v);
      if (m.progress >= m.target) {
        m.done = true;
        s.coins += m.reward.coins;
        res.missions.push(m);
      }
    }
    const completedXp = res.missions.reduce((a, m) => a + m.reward.xp, 0);
    s.missions = s.missions.filter((m) => !m.done);

    // xp
    const xp = Math.round(
      run.distance * 0.25 + run.nearMiss * 8 + run.coins * 1.5 + 10 + completedXp,
    );
    const xpPerk = perkXp(perks, xp);
    res.xpGained = xp + xpPerk;
    s.xp += xp + xpPerk;
    // the Drift Pass fills with the run's XP (+ a bonus for beating a level, x XP boosts); a
    // hero's XP perk is level XP only, its pass perk is pass XP only
    res.passBefore = DriftPass.unlockedCount();
    const passBase = xp + (run.levelDone ? 100 : 0);
    let passXp = perkPassXp(perks, passBase);
    if (run.heroPerk) {
      run.heroPerk.xp = xpPerk;
      run.heroPerk.passXp = passXp - passBase;
    }
    const boost = s.xpBoost;
    if (boost?.runs > 0) {
      passXp *= boost.mul;
      boost.runs -= 1;
      res.xpBoosted = boost.mul;
    }
    DriftPass.addXp(passXp);
    // season event challenges (coins paid inside onRun; their XP goes into the pass)
    res.seasonDone = Seasons.onRun(run);
    for (const c of res.seasonDone) DriftPass.addXp(c.reward?.xp || 0);
    res.passAfter = DriftPass.unlockedCount();
    while (s.xp >= Progression.xpToNext(s.level)) {
      s.xp -= Progression.xpToNext(s.level);
      s.level += 1;
      const reward = LEVEL_REWARDS[s.level] || { coins: 100 + s.level * 20 };
      const lu = { level: s.level, reward: { ...reward } };
      if (!s.levelRewards[s.level]) {
        s.levelRewards[s.level] = true;
        if (reward.coins) s.coins += reward.coins;
        if (reward.shard) lu.shardResult = Progression.grantShard();
      }
      res.levelUps.push(lu);
    }

    // Lucky Spin: every SPIN_EVERY points scored banks a spin, at most SPINS_PER_RUN per run
    // and never more than SPIN_MAX held; points past that don't carry over
    s.spins = Math.min(s.spins || 0, SPIN_MAX);
    s.spinPts = (s.spinPts || 0) + Math.max(0, Math.floor(run.score));
    res.spinsEarned = 0;
    while (s.spinPts >= SPIN_EVERY && res.spinsEarned < SPINS_PER_RUN && s.spins < SPIN_MAX) {
      s.spinPts -= SPIN_EVERY;
      s.spins += 1;
      res.spinsEarned++;
    }
    s.spinPts = Math.min(s.spinPts, SPIN_EVERY - 1);
    res.spinPts = s.spinPts;
    res.spinsFull = s.spins >= SPIN_MAX;

    res.unlocks = Progression.checkChallengeUnlocks();
    res.achievements = Progression.checkAchievements();
    res.newTitles = Titles.sync(); // achievements / leagues / season tiers can earn titles
    Progression.ensureMissions();
    res.coinsAfter = s.coins;
    res.levelAfter = s.level;
    res.xpAfter = s.xp;
    Save.write();
    return res;
  },
};

// test builds only: hero unlock rules (shop price, challenges) for automated tests
if (TEST.on && typeof window !== "undefined") window.__glyHeroes = { Progression, getCharacter };

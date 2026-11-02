// Meta-progression: XP/levels, missions, achievements, login streak, daily, unlocks.
import { BIOMES } from "../biomes/biomes.js";
import { CHARACTERS, getCharacter } from "../player/characterDefs.js";
import { dayDiff, RNG, todayKey } from "./rng.js";
import { Save } from "./save.js";

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
  { id: "daily", text: "Play the Daily Challenge", stat: "daily", scope: "total", n: [1] },
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
  if (stat === "runs" || stat === "daily")
    return stat === "daily" ? (run.mode === "daily" ? 1 : 0) : 1;
  return run[stat] || 0;
}

// ------------------------------------------------------------------ achievements
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
    name: "Daily Driver",
    desc: "Play 5 Daily Challenges",
    glyph: "★",
    check: (s) => s.stats.dailyPlayed >= 5,
  },
  {
    id: "level10",
    name: "Ascendant",
    desc: "Reach player level 10",
    glyph: "X",
    check: (s) => s.level >= 10,
  },
  {
    id: "collector",
    name: "Full Roster",
    desc: "Unlock every character",
    glyph: "C",
    check: (s) => CHARACTERS.every((c) => s.unlocked[c.id]),
  },
  {
    id: "legend",
    name: "Supernova",
    desc: "Unlock Nova",
    glyph: "N",
    check: (s) => !!s.unlocked.nova,
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

export const Progression = {
  xpToNext(level) {
    return Math.round(140 * level ** 1.32);
  },

  // ---------------------------------------------------------------- missions
  ensureMissions() {
    const s = Save.data;
    const rng = new RNG(Date.now());
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
    const streak = gap === 1 ? s.login.streak + 1 : gap === 0 ? s.login.streak : 1;
    return { canClaim: true, streak, day: ((streak - 1) % 7) + 1 };
  },

  claimLogin() {
    const st = Progression.loginStatus();
    if (!st.canClaim) return null;
    const s = Save.data;
    s.login.streak = st.streak;
    s.login.last = todayKey();
    s.login.claimed = todayKey();
    const reward = LOGIN_REWARDS[st.day - 1];
    s.coins += reward.coins;
    s.stats.coins += 0;
    const out = { ...reward, day: st.day, streak: st.streak };
    if (reward.shard) out.shardResult = Progression.grantShard();
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
    return !!Save.data.unlocked[id];
  },

  challengeMet(def) {
    if (!def.challenge) return false;
    return (Save.data.stats[def.challenge.stat] || 0) >= def.challenge.value;
  },

  challengeProgress(def) {
    if (!def.challenge) return 0;
    return Math.min(1, (Save.data.stats[def.challenge.stat] || 0) / def.challenge.value);
  },

  buy(id) {
    const s = Save.data;
    const def = getCharacter(id);
    if (s.unlocked[id] || s.coins < def.cost) return false;
    s.coins -= def.cost;
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
      if (!s.unlocked[c.id] && Progression.challengeMet(c)) {
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
      const label = m.stat === "biome" ? m.text : `${m.text} · ${cur}/${m.target}`;
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
    const locked = CHARACTERS.filter((c) => !s.unlocked[c.id]);
    if (!locked.length) return null;
    let best = null;
    for (const c of locked) {
      const coinFrac = s.coins / c.cost;
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
      const cur = s.stats[d.challenge.stat] || 0;
      const left = d.challenge.value - cur;
      text =
        d.challenge.stat === "maxBiome"
          ? `${d.challenge.text} to unlock ${d.name}`
          : `${d.challenge.stat === "maxDistance" ? `${left}m` : left} more to unlock ${d.name}`;
    } else if (best.shardFrac > best.coinFrac) {
      text = `${d.shards - (s.shards[d.id] || 0)} shard(s) to unlock ${d.name}`;
    } else {
      text = `${Math.max(0, d.cost - s.coins)} coins to unlock ${d.name}`;
    }
    return { def: d, frac: Math.min(1, best.frac), text };
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
    st.maxBiome = Math.max(st.maxBiome, run.biome);
    st.maxLasersRun = Math.max(st.maxLasersRun, run.lasers);
    st.maxPortalsRun = Math.max(st.maxPortalsRun, run.portals);

    // daily
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

    // best + ghost
    res.newBest = run.score > res.prevBest;
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

    // coins
    s.coins += run.coins;

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
    res.xpGained = xp;
    s.xp += xp;
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

    res.unlocks = Progression.checkChallengeUnlocks();
    res.achievements = Progression.checkAchievements();
    Progression.ensureMissions();
    res.coinsAfter = s.coins;
    res.levelAfter = s.level;
    res.xpAfter = s.xp;
    Save.write();
    return res;
  },
};

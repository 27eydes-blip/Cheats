// SEASONS — the built-in defaults (pure data, JSON-compatible). The live copy comes from
// Supabase (table `season_config`, row id "live" — see SEASONS_ADMIN.md); this file is used
// until that loads, and whenever it can't. Every 4 weeks: a new 30-tier Drift Pass, one new
// character (the tier-50 reward, buyable for coins after the season ends) and one event.
//
// Pass reward types: { coins } | { item: cosmetic id } | { pod: true } | { hero: hero id }
//   | { shards: n } | { xpBoost: { mul, runs } }   (DRIFT PASS+ adds { title } { banner } { emote })
// Event challenge types (counted from runs played during the season):
//   count   — add up a run metric over the season          { metric, value }
//   best    — the metric's best single run                 { metric, value }
//   collect — collect every listed value of a metric       { metric, values: [...] }
// Run metrics: runs, score, meters, nearMiss, coins, reachedAbyss, abyssM, reachedPrism,
//   prismM, prismClear, abyssClear, abyssKiller (hazard type that ended a run in the Abyss)
// Home themes: "crimson" | "prism" | "garden" | "storm"

// ---- 50-tier tracks -------------------------------------------------------------------
// FREE track: coins, Mystery Pods, shards and XP boosts, with something special every few
// tiers; every 5th tier is a milestone (a hero in Season 1); tier 50 is the season hero.
// DRIFT PASS+ track: shown locked ("coming soon") — there are no real-money purchases.
const FREE_PATTERN = [
  (t) => ({ coins: 60 + t * 6 }),
  (t) => ({ coins: 80 + t * 6 }),
  () => ({ pod: true }),
  () => ({ shards: 1 }),
  (t) => ({ coins: 100 + t * 6 }),
  () => ({ xpBoost: { mul: 2, runs: 3 } }),
  (t) => ({ coins: 120 + t * 6 }),
  () => ({ pod: true }),
  () => ({ shards: 2 }),
];
const FREE_ITEMS = {
  7: { item: "flap_stars" },
  13: { item: "coin_stars" },
  18: { item: "trail_hearts" },
  23: { item: "death_confetti" },
  28: { item: "hat_shades" },
  33: { item: "flap_notes" },
  38: { item: "death_ghost" },
  43: { item: "coin_gems" },
  47: { item: "trail_fire" },
};
/** milestones: { 5: reward, 10: reward, … 50: reward } */
function freeTrack(milestones) {
  return Array.from({ length: 50 }, (_, i) => {
    const t = i + 1;
    if (milestones[t]) return milestones[t];
    if (FREE_ITEMS[t]) return FREE_ITEMS[t];
    return FREE_PATTERN[i % FREE_PATTERN.length](t);
  });
}
/**
 * DRIFT PASS+ (the paid track, $3.99 a season): every 5th tier is a Pass+ exclusive in a
 * new style — animated skins (drawn 10% smaller, standard hitbox), animated titles, trails,
 * death effects and a banner. Nothing on it changes speed, hitbox, score or leaderboards.
 */
function plusTrack(theme) {
  const special = {
    5: { item: "skin_holo", label: "NEW SKIN" },
    10: { title: "p_abysslord", label: "ANIMATED TITLE" },
    15: { item: "trail_aurora", label: "NEW TRAIL" },
    20: { banner: theme.banner, label: "NEW BANNER" },
    25: { title: "p_neonroyal", label: "ANIMATED TITLE" },
    30: { item: "skin_inferno", label: "NEW SKIN" },
    35: { item: "death_supernova", label: "NEW DEATH FX" },
    40: { title: "p_starborn", label: "ANIMATED TITLE" },
    45: { item: "death_glitchout", label: "NEW DEATH FX" },
    50: { item: "skin_starlight", label: "NEW SKIN" },
  };
  return Array.from({ length: 50 }, (_, i) => {
    const t = i + 1;
    if (special[t]) return { ...special[t], milestone: true };
    if (t === 22) return { item: "trail_eclipse", label: "NEW TRAIL" };
    if (t % 3 === 0) return { pod: true };
    return { coins: 200 + t * 20 };
  });
}
/**
 * Season 1's DRIFT PASS+ track (layout 2, 2026-11-06): the ten pass-exclusive heroes, the
 * evolving RIFTLING (base form at tier 1, armor at 15, aura at 30, its legendary RIFT SOVEREIGN
 * form at 50), animated titles, trails, death effects, victory poses, the Abyss home theme, and
 * — at the very end — the gold leaderboard name and the forever Season 1 badge. Something new
 * every 1–3 tiers; coins / shards / pods fill the rest. Pass heroes are placed by their own
 * passTier (passHeroDefs.js), so this table only holds everything else.
 */
export const PLUS_S1_SPECIAL = {
  3: { item: "skin_holo", label: "NEW SKIN" },
  4: { title: "p_riftdiver", label: "ANIMATED TITLE" },
  6: { item: "trail_pp_galaxydust", label: "NEW TRAIL" },
  7: { title: "p_abysslord", label: "ANIMATED TITLE" },
  8: { item: "death_pp_fireworks", label: "NEW DEATH FX" },
  11: { item: "pose_pp_power", label: "VICTORY POSE" },
  12: { item: "trail_aurora", label: "NEW TRAIL" },
  13: { title: "p_abysswalker", label: "ANIMATED TITLE" },
  17: { banner: "s1", label: "NEW BANNER" },
  18: { item: "trail_pp_lightning", label: "NEW TRAIL" },
  21: { item: "death_pp_melt", label: "NEW DEATH FX" },
  22: { item: "trail_eclipse", label: "NEW TRAIL" },
  23: { item: "pose_pp_spinflip", label: "VICTORY POSE" },
  26: { item: "theme_pp_abyss", label: "HOME THEME" },
  27: { title: "p_neonroyal", label: "ANIMATED TITLE" },
  28: { title: "p_voidtouched", label: "ANIMATED TITLE" },
  32: { item: "skin_inferno", label: "NEW SKIN" },
  33: { item: "trail_pp_comboflame", label: "NEW TRAIL" },
  36: { item: "death_pp_shatter", label: "NEW DEATH FX" },
  37: { item: "death_supernova", label: "NEW DEATH FX" },
  38: { item: "pose_pp_aura", label: "VICTORY POSE" },
  42: { title: "p_starborn", label: "ANIMATED TITLE" },
  43: { title: "p_s1founder", label: "ANIMATED TITLE" },
  45: { item: "skin_starlight", label: "NEW SKIN" },
  47: { item: "death_glitchout", label: "NEW DEATH FX" },
  48: { item: "name_pp_gold", label: "GOLD NAME" },
  49: { item: "badge_pp_s1", label: "FOREVER BADGE" },
};
/** Pass-hero tiers in layout 2 (kept in step with passHeroDefs.js passTier). */
const PLUS_S1_HEROES = {
  1: "riftling",
  2: "voidcat",
  5: "hexowl",
  10: "wraithmoth",
  15: "riftling_armor",
  16: "triphound",
  20: "phantomray",
  25: "scorpyre",
  30: "riftling_aura",
  31: "krakkie",
  35: "crimsonmantis",
  40: "gloomeleon",
  46: "umbradrake",
  50: "riftsovereign",
};
const filler = (t) =>
  t % 4 === 0 ? { shards: 3 + Math.floor(t / 10) } : t % 3 === 0 ? { pod: true } : { coins: 200 + t * 20 };
export const PLUS_S1_LAYOUT = 2;
export function plusTrackS1(theme) {
  return Array.from({ length: 50 }, (_, i) => {
    const t = i + 1;
    if (PLUS_S1_HEROES[t])
      return { hero: PLUS_S1_HEROES[t], label: t === 50 ? "LEGENDARY FORM" : "PASS HERO", milestone: true };
    const sp = PLUS_S1_SPECIAL[t];
    if (sp) {
      const r = sp.banner ? { banner: theme.banner, label: sp.label } : { ...sp };
      return { ...r, milestone: t % 5 === 0 || t >= 48 };
    }
    return filler(t);
  });
}
/** Layout 1 (the launch layout), kept only to move claims made on it (passPlus.js). */
export function plusTrackS1v1(theme) {

  const special = {
    1: { hero: "voidcat", label: "PASS HERO" },
    3: { item: "skin_holo", label: "NEW SKIN" },
    5: { hero: "hexowl", label: "PASS HERO" },
    7: { title: "p_abysslord", label: "ANIMATED TITLE" },
    10: { hero: "wraithmoth", label: "PASS HERO" },
    12: { item: "trail_aurora", label: "NEW TRAIL" },
    15: { hero: "triphound", label: "PASS HERO" },
    17: { banner: theme.banner, label: "NEW BANNER" },
    20: { hero: "phantomray", label: "PASS HERO" },
    22: { item: "trail_eclipse", label: "NEW TRAIL" },
    25: { hero: "scorpyre", label: "PASS HERO" },
    27: { title: "p_neonroyal", label: "ANIMATED TITLE" },
    30: { hero: "krakkie", label: "PASS HERO" },
    32: { item: "skin_inferno", label: "NEW SKIN" },
    35: { hero: "crimsonmantis", label: "PASS HERO" },
    37: { item: "death_supernova", label: "NEW DEATH FX" },
    40: { hero: "gloomeleon", label: "PASS HERO" },
    42: { title: "p_starborn", label: "ANIMATED TITLE" },
    45: { item: "skin_starlight", label: "NEW SKIN" },
    47: { item: "death_glitchout", label: "NEW DEATH FX" },
    50: { hero: "umbradrake", label: "PASS HERO" },
  };
  return Array.from({ length: 50 }, (_, i) => {
    const t = i + 1;
    if (special[t]) return { ...special[t], milestone: t % 5 === 0 || !!special[t].hero };
    if (t % 4 === 0) return { shards: 3 + Math.floor(t / 10) };
    if (t % 3 === 0) return { pod: true };
    return { coins: 200 + t * 20 };
  });
}

/** What a reward is, for matching it across layouts ("hero:voidcat", "item:skin_holo"…). */
const rewardKey = (r) =>
  r?.hero ? `hero:${r.hero}` : r?.item ? `item:${r.item}` : r?.title ? `title:${r.title}` : r?.banner ? "banner" : null;

/**
 * Season 1's paid track moved to layout 2 (new rewards; four pass heroes moved one tier or a
 * few). Claims are stored by tier, so move each claimed special reward to its new tier; a
 * claimed coins / shards / pod tier stays claimed only if it's still a filler tier (otherwise
 * the new reward there is yours to claim). Pure: used by passPlus.js and the cloud save merge.
 */
export function migratePlusClaimsS1(claimed = {}) {
  const theme = { banner: "crimson" };
  const before = plusTrackS1v1(theme);
  const after = plusTrackS1(theme);
  const next = {};
  for (const i of Object.keys(claimed)) {
    if (!claimed[i]) continue;
    const key = rewardKey(before[i]);
    if (key) {
      const j = after.findIndex((r) => rewardKey(r) === key);
      if (j >= 0) next[j] = true;
    } else if (!rewardKey(after[i])) next[i] = true;
  }
  return next;
}
const DEFAULT_MILESTONES = {
  5: { coins: 750 },
  10: { item: "trail_galaxy" },
  15: { pod: true },
  20: { item: "hat_halo" },
  25: { coins: 1500 },
  30: { item: "skin_neon" },
  35: { pod: true },
  40: { item: "death_blackhole" },
  45: { coins: 2500 },
};

export const SEASON_DEFAULTS = {
  version: 1,
  seasons: [
    {
      id: "s1",
      number: 1,
      name: "ABYSS RISING",
      tagline: "The Abyss is waking up.",
      start: "2026-11-04T00:00:00Z",
      end: "2026-12-02T00:00:00Z",
      theme: {
        primary: "#c8102e",
        accent: "#ff3a4a",
        dark: "#14020a",
        home: "crimson",
        pulse: "heartbeat",
      },
      featuredHero: "levijr",
      heroPriceAfter: 12000,
      pass: {
        // ~3 weeks of most-days play to finish the free track
        tierXp: 450,
        // all ten Abyss heroes are the milestones (still unlockable by Abyss challenges too)
        tiers: freeTrack({
          5: { hero: "gloombat" },
          10: { hero: "grimrat" },
          15: { hero: "murktoad" },
          20: { hero: "hollowcrow" },
          25: { hero: "lurkeel" },
          30: { hero: "ashspider" },
          35: { hero: "anglerfiend" },
          40: { hero: "riftwolf" },
          45: { hero: "grimvulture" },
          50: { hero: "levijr" },
        }),
        plus: plusTrackS1({
          trail: "trail_bloodmoon",
          hat: "hat_bloodcrown",
          title: "ABYSS LORD",
          banner: "crimson",
        }),
      },
      event: {
        name: "ABYSS RISING",
        challenges: [
          {
            id: "abyss5",
            text: "Reach the Abyss 5 times",
            type: "count",
            metric: "reachedAbyss",
            value: 5,
            reward: { coins: 500, xp: 700 },
          },
          {
            id: "abyss300",
            text: "Survive 300m in the Abyss",
            type: "best",
            metric: "abyssM",
            value: 300,
            reward: { coins: 800, xp: 1000 },
          },
          {
            id: "abyssall",
            text: "Die to every Abyss hazard",
            type: "collect",
            metric: "abyssKiller",
            values: ["tendril", "slammer", "walls"],
            labels: { tendril: "Tendril", slammer: "Slammer", walls: "Closing Walls" },
            reward: { coins: 1000, xp: 1200 },
          },
        ],
        shopItems: ["trail_bloodmoon", "trail_abyssal", "hat_bloodcrown", "hat_abysseye"],
      },
    },
    {
      id: "s2",
      number: 2,
      name: "PRISM RIFT",
      tagline: "Light splits. So do you.",
      start: "2026-12-02T00:00:00Z",
      end: "2026-12-30T00:00:00Z",
      theme: {
        primary: "#9a3aff",
        accent: "#6ad8ff",
        dark: "#0c0620",
        home: "prism",
        pulse: "shimmer",
      },
      featuredHero: "prismara",
      heroPriceAfter: 12000,
      pass: {
        tierXp: 450,
        tiers: freeTrack({ ...DEFAULT_MILESTONES, 50: { hero: "prismara" } }),
        plus: plusTrack({
          trail: "trail_prism",
          hat: "hat_crown",
          title: "PRISM WALKER",
          banner: "prism",
        }),
      },
      event: {
        name: "PRISM SURGE",
        challenges: [
          {
            id: "prism1",
            text: "Reach the Prism Rift",
            type: "count",
            metric: "reachedPrism",
            value: 1,
            reward: { coins: 400, xp: 600 },
          },
          {
            id: "prism400",
            text: "Fly 400m inside the Prism Rift",
            type: "best",
            metric: "prismM",
            value: 400,
            reward: { coins: 800, xp: 1000 },
          },
          {
            id: "prism3",
            text: "Survive the Prism Rift 3 times",
            type: "count",
            metric: "prismClear",
            value: 3,
            reward: { coins: 1000, xp: 1200 },
          },
        ],
        shopItems: ["trail_prism"],
      },
    },
    {
      id: "s3",
      number: 3,
      name: "ZEN DRIFT",
      tagline: "Breathe in. Fly on.",
      start: "2026-12-30T00:00:00Z",
      end: "2027-01-27T00:00:00Z",
      theme: {
        primary: "#4ac84a",
        accent: "#ff9ac8",
        dark: "#06140a",
        home: "garden",
        pulse: "breathe",
      },
      featuredHero: "bao",
      heroPriceAfter: 12000,
      pass: {
        tierXp: 450,
        tiers: freeTrack({ ...DEFAULT_MILESTONES, 50: { hero: "bao" } }),
        plus: plusTrack({
          trail: "trail_zen",
          hat: "hat_crown",
          title: "ZEN MASTER",
          banner: "garden",
        }),
      },
      event: {
        name: "CALM GARDEN",
        challenges: [
          {
            id: "zenruns",
            text: "Play 20 runs",
            type: "count",
            metric: "runs",
            value: 20,
            reward: { coins: 400, xp: 600 },
          },
          {
            id: "zen1500",
            text: "Fly 1500m in one run",
            type: "best",
            metric: "meters",
            value: 1500,
            reward: { coins: 800, xp: 1000 },
          },
          {
            id: "zennear",
            text: "100 near-misses this season",
            type: "count",
            metric: "nearMiss",
            value: 100,
            reward: { coins: 1000, xp: 1200 },
          },
        ],
        shopItems: ["trail_zen"],
      },
    },
    {
      id: "s4",
      number: 4,
      name: "STORM RIDERS",
      tagline: "Ride the lightning.",
      start: "2027-01-27T00:00:00Z",
      end: "2027-02-24T00:00:00Z",
      theme: {
        primary: "#1a8ad8",
        accent: "#3ef4ff",
        dark: "#020a18",
        home: "storm",
        pulse: "flicker",
      },
      featuredHero: "sonjuwon",
      heroPriceAfter: 12000,
      pass: {
        tierXp: 450,
        tiers: freeTrack({ ...DEFAULT_MILESTONES, 50: { hero: "sonjuwon" } }),
        plus: plusTrack({
          trail: "trail_storm",
          hat: "hat_crown",
          title: "STORM RIDER",
          banner: "storm",
        }),
      },
      event: {
        name: "LIGHTNING STORM",
        challenges: [
          {
            id: "storm5",
            text: "Reach the Abyss 5 times",
            type: "count",
            metric: "reachedAbyss",
            value: 5,
            reward: { coins: 500, xp: 700 },
          },
          {
            id: "storm60",
            text: "60 near-misses in one run",
            type: "best",
            metric: "nearMiss",
            value: 60,
            reward: { coins: 800, xp: 1000 },
          },
          {
            id: "stormcoins",
            text: "Collect 3000 coins this season",
            type: "count",
            metric: "coins",
            value: 3000,
            reward: { coins: 1000, xp: 1200 },
          },
        ],
        shopItems: ["trail_storm"],
      },
    },
  ],
};

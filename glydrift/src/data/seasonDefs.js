// SEASONS — the built-in defaults (pure data, JSON-compatible). The live copy comes from
// Supabase (table `season_config`, row id "live" — see SEASONS_ADMIN.md); this file is used
// until that loads, and whenever it can't. Every 4 weeks: a new 30-tier Drift Pass, one new
// character (the tier-30 reward, buyable for coins after the season ends) and one event.
//
// Pass reward types: { coins } | { item: cosmetic id } | { pod: true } | { hero: hero id }
// Event challenge types (counted from runs played during the season):
//   count   — add up a run metric over the season          { metric, value }
//   best    — the metric's best single run                 { metric, value }
//   collect — collect every listed value of a metric       { metric, values: [...] }
// Run metrics: runs, score, meters, nearMiss, coins, reachedAbyss, abyssM, reachedPrism,
//   prismM, prismClear, abyssClear, abyssKiller (hazard type that ended a run in the Abyss)
// Home themes: "crimson" | "prism" | "garden" | "storm"

const coinTier = (i) => ({ coins: 100 + i * 15 });

/** 30 tiers: coins most of the way, cosmetics and pods sprinkled in, heroes where given. */
function track(heroes = {}, extras = {}) {
  return Array.from({ length: 30 }, (_, i) => heroes[i + 1] || extras[i + 1] || coinTier(i));
}
const EXTRAS = {
  4: { item: "flap_stars" },
  8: { pod: true },
  11: { item: "coin_stars" },
  14: { item: "trail_hearts" },
  16: { pod: true },
  19: { item: "death_confetti" },
  22: { item: "hat_shades" },
  25: { pod: true },
  28: { item: "death_ghost" },
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
        tierXp: 350,
        // all ten Abyss heroes ride the pass (they stay unlockable by Abyss challenges too)
        tiers: track(
          {
            3: { hero: "gloombat" },
            6: { hero: "grimrat" },
            9: { hero: "murktoad" },
            12: { hero: "hollowcrow" },
            15: { hero: "lurkeel" },
            18: { hero: "ashspider" },
            21: { hero: "anglerfiend" },
            24: { hero: "riftwolf" },
            27: { hero: "grimvulture" },
            30: { hero: "levijr" },
          },
          EXTRAS,
        ),
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
      pass: { tierXp: 350, tiers: track({ 30: { hero: "prismara" } }, EXTRAS) },
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
      pass: { tierXp: 350, tiers: track({ 30: { hero: "bao" } }, EXTRAS) },
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
      pass: { tierXp: 350, tiers: track({ 30: { hero: "sonjuwon" } }, EXTRAS) },
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

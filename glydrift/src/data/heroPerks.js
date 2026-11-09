// Reward-only hero perks (the DRIFT PASS+ heroes'). Each hero's `perks` block can hold:
//   coinPct     +N% of the coins collected in the run, paid at the end
//   xpPct       +N% player-level XP from the run
//   passPct     +N% Drift Pass XP from the run
//   dailyCoins  N coins on the first finished run of the day with a hero that has this perk
// They only ever touch what a run PAYS (coins, XP, pass XP), never what it SCORES: score,
// distance, hitbox, speed, gravity and survival stay exactly the standard rules, so these
// heroes keep the plain leaderboard (no gold perk badge; see LeaderboardScene hasCoinPerks).
// Applied in Progression.commitRun, so endless runs and finished levels both count.
import { todayKey } from "./rng.js";

const pct = (n) => Math.max(0, Math.min(25, Number(n) || 0)); // a typo can't pay out 1000%

/** The extra XP a perk adds to `xp` (rounded down, so a perk never pays more than it says). */
export const perkXp = (perks, xp) => Math.floor((xp * pct(perks?.xpPct)) / 100);

/** Drift Pass XP after the hero's pass perk. */
export const perkPassXp = (perks, passXp) => passXp + Math.floor((passXp * pct(perks?.passPct)) / 100);

/**
 * The run's perk coins: a share of the collected coins, plus the once-a-day bonus. The day
 * is one save field shared by every hero (switching heroes can't claim it twice), and only a
 * LATER day counts, so winding the clock back can't claim it again either.
 */
export function perkCoins(perks, run, save, key = todayKey()) {
  const out = { pct: 0, daily: 0 };
  if (!perks) return out;
  out.pct = Math.floor(((run.coins || 0) * pct(perks.coinPct)) / 100);
  const daily = Math.max(0, Math.min(200, Math.floor(perks.dailyCoins || 0)));
  if (daily && (save.perkDaily || "") < key) {
    save.perkDaily = key;
    out.daily = daily;
  }
  return out;
}

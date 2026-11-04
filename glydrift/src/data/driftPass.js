// DRIFT PASS — a free reward track unlocked with XP from playing. Every run's XP fills it;
// each tier pays coins or a cosmetic, and the last tier is a free Mystery Pod.
//
// PREMIUM_TRACK is an intentionally empty, switched-off placeholder for a possible future
// paid track. There are NO real-money purchases anywhere in the game; nothing reads it yet.
import { Save } from "./save.js";
import { getCosmetic, Shop } from "./cosmetics.js";
import { Analytics } from "../systems/analytics.js";
import { CHARACTERS, getCharacter, heroReleased } from "../player/characterDefs.js";
import { Seasons } from "./seasons.js";

export const PASS_TIER_XP = 400; // ~2 runs per tier

/** reward: { coins } | { item: cosmetic id } | { pod: true } | { hero: id } */
export const FREE_TRACK = [
  { coins: 100 },
  { item: "flap_stars" },
  { coins: 150 },
  { item: "coin_stars" },
  { coins: 200 },
  { item: "trail_hearts" },
  { coins: 250 },
  { item: "death_confetti" },
  { coins: 300 },
  { item: "hat_shades" },
  { coins: 350 },
  { item: "flap_notes" },
  { coins: 400 },
  { item: "death_ghost" },
  { pod: true },
];

/** The live track: this season's 30 tiers, or the classic 15 between seasons. */
export function passTrack() {
  return Seasons.active()?.pass.tiers || FREE_TRACK;
}
/** XP per tier for the live track. */
export function tierXp() {
  return Seasons.active()?.pass.tierXp || PASS_TIER_XP;
}

/** Hand out one tier's reward. Owned cosmetics / heroes pay coins instead. */
export function giveReward(r) {
  const s = Save.data;
  if (r.coins) {
    s.coins += r.coins;
    return { coins: r.coins };
  }
  if (r.shards) {
    // shards go to the next shard hero you don't own yet (coins if there isn't one)
    const target = CHARACTERS.find((c) => c.shards && !s.unlocked[c.id] && heroReleased(c));
    if (!target) {
      s.coins += 150 * r.shards;
      return { coins: 150 * r.shards };
    }
    s.shards ||= {};
    s.shards[target.id] = (s.shards[target.id] || 0) + r.shards;
    if (s.shards[target.id] >= target.shards) s.unlocked[target.id] = true;
    return { shards: r.shards, hero: s.unlocked[target.id] ? target : null, shardHero: target };
  }
  if (r.xpBoost) {
    // the next few runs earn extra pass XP
    const b = (s.xpBoost ||= { mul: 1, runs: 0 });
    b.mul = b.runs > 0 ? Math.max(b.mul, r.xpBoost.mul) : r.xpBoost.mul; // a spent boost resets
    b.runs += r.xpBoost.runs;
    return { xpBoost: r.xpBoost };
  }
  if (r.hero) {
    const def = getCharacter(r.hero);
    if (s.unlocked[r.hero]) {
      s.coins += 400;
      return { coins: 400, dupeHero: def };
    }
    s.unlocked[r.hero] = true;
    return { hero: def };
  }
  if (r.item) {
    const c = getCosmetic(r.item);
    if (Shop.owns(r.item)) {
      const back = Math.round(c.price / 2);
      s.coins += back;
      return { coins: back, dupe: c };
    }
    s.cos.owned[r.item] = true;
    return { item: c };
  }
  return { pod: Shop.openPod({ free: true }) };
}

/** Season end: claim tier i of a (finished) season for the player. */
export function claimSeasonTier(season, record, i) {
  if (record.claimed[i]) return null;
  record.claimed[i] = true;
  return giveReward(season.pass.tiers[i]);
}

// Future premium track: hidden and disabled (no purchases exist). Keep it separate from the
// free track so nothing here can leak into it.
export const PREMIUM_TRACK = { enabled: false, tiers: [] };

function pass() {
  const season = Seasons.active();
  if (season) return Seasons.record(season.id); // each season has its own pass
  const s = Save.data;
  s.pass ||= { xp: 0, claimed: {} };
  s.pass.claimed ||= {};
  return s.pass;
}

export const DriftPass = {
  addXp(n) {
    const before = DriftPass.unlockedCount();
    pass().xp += Math.max(0, Math.round(n));
    const after = DriftPass.unlockedCount();
    for (let t = before; t < after; t++)
      Analytics.log("pass_tier_reached", {
        season: Seasons.active()?.id || "classic",
        tier: t + 1,
      });
  },
  xp() {
    return pass().xp;
  },
  /** Tiers whose XP is reached. */
  unlockedCount() {
    return Math.min(passTrack().length, Math.floor(pass().xp / tierXp()));
  },
  isUnlocked(i) {
    return i < DriftPass.unlockedCount();
  },
  isClaimed(i) {
    return !!pass().claimed[i];
  },
  /** The first tier that is unlocked-but-unclaimed, else the next locked one (null when done). */
  nextTier() {
    for (let i = 0; i < passTrack().length; i++) if (!DriftPass.isClaimed(i)) return i;
    return null;
  },
  /** progress 0..1 toward tier i */
  progressTo(i) {
    const need = (i + 1) * tierXp();
    const from = i * tierXp();
    return Math.max(0, Math.min(1, (pass().xp - from) / (need - from)));
  },
  claimable() {
    let n = 0;
    for (let i = 0; i < DriftPass.unlockedCount(); i++) if (!DriftPass.isClaimed(i)) n++;
    return n;
  },
  /**
   * Claim tier i. Cosmetics you already own pay half their price in coins instead.
   * @returns {{ coins?: number, item?: object, pod?: object } | null}
   */
  claim(i) {
    if (!DriftPass.isUnlocked(i) || DriftPass.isClaimed(i)) return null;
    const r = passTrack()[i];
    pass().claimed[i] = true;
    const out = giveReward(r);
    Save.write();
    Analytics.log("pass_claimed", { tier: i, reward: r });
    return out;
  },
};

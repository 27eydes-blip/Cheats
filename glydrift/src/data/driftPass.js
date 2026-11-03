// DRIFT PASS — a free reward track unlocked with XP from playing. Every run's XP fills it;
// each tier pays coins or a cosmetic, and the last tier is a free Mystery Pod.
//
// PREMIUM_TRACK is an intentionally empty, switched-off placeholder for a possible future
// paid track. There are NO real-money purchases anywhere in the game; nothing reads it yet.
import { Save } from "./save.js";
import { getCosmetic, Shop } from "./cosmetics.js";
import { Analytics } from "../systems/analytics.js";
import { getCharacter, onSale } from "../player/characterDefs.js";

export const PASS_TIER_XP = 400; // ~2 runs per tier

/** reward: { coins } | { item: cosmetic id } | { pod: true } | { hero: id } (December) */
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

// December: three of the coin tiers become the Christmas commons (they're also in the shop)
const DECEMBER_HEROES = { 2: "mittens", 6: "pengo", 10: "hollyhog" };

/** The free track as it stands today (Christmas heroes in December). */
export function passTrack() {
  if (!onSale(getCharacter("mittens"))) return FREE_TRACK;
  return FREE_TRACK.map((r, i) => (DECEMBER_HEROES[i] ? { hero: DECEMBER_HEROES[i] } : r));
}

// Future premium track: hidden and disabled (no purchases exist). Keep it separate from the
// free track so nothing here can leak into it.
export const PREMIUM_TRACK = { enabled: false, tiers: [] };

function pass() {
  const s = Save.data;
  s.pass ||= { xp: 0, claimed: {} };
  s.pass.claimed ||= {};
  return s.pass;
}

export const DriftPass = {
  addXp(n) {
    pass().xp += Math.max(0, Math.round(n));
  },
  xp() {
    return pass().xp;
  },
  /** Tiers whose XP is reached. */
  unlockedCount() {
    return Math.min(passTrack().length, Math.floor(pass().xp / PASS_TIER_XP));
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
    const need = (i + 1) * PASS_TIER_XP;
    const from = i * PASS_TIER_XP;
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
    const s = Save.data;
    const r = passTrack()[i];
    pass().claimed[i] = true;
    let out;
    if (r.coins) {
      s.coins += r.coins;
      out = { coins: r.coins };
    } else if (r.hero) {
      // a Christmas hero (if you already bought it in the shop: 400 coins instead)
      const def = getCharacter(r.hero);
      if (s.unlocked[r.hero]) {
        s.coins += 400;
        out = { coins: 400, dupeHero: def };
      } else {
        s.unlocked[r.hero] = true;
        out = { hero: def };
      }
    } else if (r.item) {
      const c = getCosmetic(r.item);
      if (Shop.owns(r.item)) {
        const back = Math.round(c.price / 2);
        s.coins += back;
        out = { coins: back, dupe: c };
      } else {
        s.cos.owned[r.item] = true;
        out = { item: c };
      }
    } else {
      out = { pod: Shop.openPod({ free: true }) };
    }
    Save.write();
    Analytics.log("pass_claimed", { tier: i, reward: r });
    return out;
  },
};

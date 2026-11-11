// DRIFT PASS+ — the season's paid track ($3.99, one purchase per season; the game's only
// real-money purchase). Ownership only ever comes from a purchase the server has verified
// (online/store.js); this module keeps the verified entitlement and pays out the track.
// Every reward is cosmetic: nothing here touches speed, hitbox, score or leaderboards.
import { Save } from "./save.js";
import { Seasons } from "./seasons.js";
import { DriftPass, giveReward } from "./driftPass.js";
import { getCosmetic } from "./cosmetics.js";
import { Titles } from "./titles.js";
import { PLUS_S1_LAYOUT, migratePlusClaimsS1, plusTrackS1, plusTrackS1v1 } from "./seasonDefs.js";
import { Progression } from "./progression.js";

export const PLUS_PRICE_LABEL = "$3.99";
export const productIdFor = (seasonId) => `com.glydrift.game.driftpassplus.${seasonId}`;

function ent() {
  const s = Save.data;
  s.passPlus ||= {};
  return s.passPlus;
}
function record(seasonId) {
  const rec = Seasons.record(seasonId);
  rec.plusClaimed ||= {};
  if (seasonId === "s1" && rec.plusLayout !== PLUS_S1_LAYOUT) migrateS1(rec);
  return rec;
}

/** Season 1's paid track moved to layout 2: move claims made on layout 1 (seasonDefs.js). */
function migrateS1(rec) {
  rec.plusClaimed = migratePlusClaimsS1(rec.plusClaimed);
  rec.plusLayout = PLUS_S1_LAYOUT;
}

export const PassPlus = {
  /** The live season's id (Drift Pass+ only exists while a season runs). */
  season() {
    return Seasons.active()?.id || null;
  },
  owns(seasonId = this.season()) {
    return !!seasonId && !!ent()[seasonId]?.verified;
  },
  /** Record a server-verified purchase (called by the store only). */
  grant(seasonId, info = {}) {
    ent()[seasonId] = { verified: true, tx: info.transactionId || null, at: info.at || Date.now() };
    Save.write();
  },
  /**
   * Keep only the seasons the server lists as verified purchases for this account (the store
   * calls this after a successful read of the account's purchases). A device entitlement the
   * server doesn't know about — e.g. typed into local storage — is dropped, and every Pass+
   * reward stops counting with it (plusGate.js). Owned items stay recorded, so a real purchase
   * restored later brings them all back.
   */
  keepOnly(seasonIds) {
    const e = ent();
    let dropped = 0;
    for (const id of Object.keys(e))
      if (!seasonIds.includes(id)) {
        delete e[id];
        dropped++;
      }
    if (dropped) Save.write();
    return dropped;
  },
  track(seasonId = this.season()) {
    const season = Seasons.active();
    return season && season.id === seasonId ? season.pass.plus || [] : [];
  },
  isClaimed(i, seasonId = this.season()) {
    return !!record(seasonId).plusClaimed[i];
  },
  canClaim(i, seasonId = this.season()) {
    return this.owns(seasonId) && DriftPass.isUnlocked(i) && !this.isClaimed(i, seasonId);
  },
  claimable(seasonId = this.season()) {
    let n = 0;
    for (let i = 0; i < this.track(seasonId).length; i++) if (this.canClaim(i, seasonId)) n++;
    return n;
  },
  /** Pay out tier i of the paid track. */
  claim(i, seasonId = this.season()) {
    if (!this.canClaim(i, seasonId)) return null;
    return this.payout(this.track(seasonId)[i], seasonId, i);
  },
  /**
   * The season is over: pay out an earned paid tier that was never claimed (the season recap
   * auto-claims them, like the free track) — a paid reward is never lost to the end date.
   */
  claimEnded(season, i) {
    if (!this.owns(season.id) || record(season.id).plusClaimed[i]) return null;
    const r = season.pass.plus?.[i];
    return r ? this.payout(r, season.id, i) : null;
  },
  payout(r, seasonId, i) {
    record(seasonId).plusClaimed[i] = true;
    const s = Save.data;
    let out;
    if (r.coins) {
      s.coins += r.coins;
      out = { coins: r.coins };
    } else if (r.item) {
      s.cos.owned[r.item] = true;
      const c = getCosmetic(r.item);
      // the forever badge and the gold name switch on as soon as they're yours (Settings has
      // the gold-name toggle); everything else waits for you to equip it
      if (c && (c.cat === "badge" || c.cat === "name")) s.cos.equipped[c.cat] = c.id;
      out = { item: c };
    } else if (r.title) {
      Titles.grant(r.title);
      out = { title: r.title };
    } else if (r.banner) {
      s.banners ||= { owned: {}, equipped: null };
      s.banners.owned[r.banner] = true;
      s.banners.equipped = r.banner;
      out = { banner: r.banner };
    } else if (r.hero || r.shards || r.pod) {
      // pass heroes unlock here and only here; shards go to the next shard hero as usual
      out = giveReward(r);
    }
    Save.write();
    return out;
  },
};

// test builds only
import { TEST } from "../systems/testFlags.js";
if (TEST.on && typeof window !== "undefined") {
  window.__glyPassPlus = PassPlus;
  window.__glyPlusS1 = {
    plusTrackS1,
    plusTrackS1v1,
    layout: PLUS_S1_LAYOUT,
    record: (id = "s1") => record(id),
    heroUsable: (id) => Progression.isUnlocked(id),
    selectedHero: () => Progression.selectedHero(),
  };
}

/** The Season 1 paid-track reward (and its tier) for a hero / cosmetic / title id. */
export function plusRewardFor(id) {
  const track = plusTrackS1({ banner: "crimson" });
  const i = track.findIndex((r) => r.hero === id || r.item === id || r.title === id);
  return i < 0 ? null : { reward: track[i], tier: i + 1 };
}

/**
 * Test builds only (?pplus / ?ppequip): own Season 1's Drift Pass+ with every paid-track reward
 * claimed, then equip the listed items, titles or hero. Compiled out of release builds.
 */
export function applyPlusTestFlags() {
  if (!TEST.on) return;
  const s = Save.data;
  if (TEST.pplus) {
    PassPlus.grant("s1", { transactionId: "test-pplus" });
    const rec = record("s1");
    plusTrackS1({ banner: "crimson" }).forEach((r, i) => {
      rec.plusClaimed[i] = true;
      if (r.item) s.cos.owned[r.item] = true;
      if (r.title) Titles.grant(r.title);
      if (r.hero) s.unlocked[r.hero] = true;
    });
    s.cos.equipped.badge = "badge_pp_s1";
    s.cos.equipped.name = "name_pp_gold";
  }
  for (const id of (TEST.ppequip || "").split(",").filter(Boolean)) {
    const c = getCosmetic(id);
    if (c) s.cos.equipped[c.cat] = id;
    else if (id.startsWith("p_")) Titles.equip(id);
    else if (s.unlocked[id]) s.selected = id;
  }
  Save.write();
}

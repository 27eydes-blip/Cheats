// © 2026 Sam Eyde III. All rights reserved. Glydrift — see LICENSE. Not open source.
// DRIFT PASS+ — the season's paid track ($3.99, one purchase per season; the game's only
// real-money purchase). Ownership only ever comes from a purchase the server has verified
// (online/store.js); this module keeps the verified entitlement and pays out the track.
// Every reward is cosmetic: nothing here touches speed, hitbox, score or leaderboards.
import { Save } from "./save.js";
import { Seasons } from "./seasons.js";
import { DriftPass, giveReward } from "./driftPass.js";
import { getCosmetic } from "./cosmetics.js";
import { Titles } from "./titles.js";

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
  return rec;
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
    const r = this.track(seasonId)[i];
    record(seasonId).plusClaimed[i] = true;
    const s = Save.data;
    let out;
    if (r.coins) {
      s.coins += r.coins;
      out = { coins: r.coins };
    } else if (r.item) {
      s.cos.owned[r.item] = true;
      out = { item: getCosmetic(r.item) };
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
if (TEST.on && typeof window !== "undefined") window.__glyPassPlus = PassPlus;

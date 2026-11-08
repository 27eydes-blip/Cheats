// Buying DRIFT PASS+ (the game's only real-money purchase).
//
//  iPhone app: StoreKit 2 through the app's native GlydriftStore plugin (ios-plugin/). The
//  purchase carries the player's account id (appAccountToken), then its transaction id goes
//  to the Supabase Edge Function "verify-purchase", which asks Apple's App Store Server API
//  whether it's real, checks app, product, account and refund status, and only then records
//  it in the purchases table. Rewards unlock only after the server says yes — the device is
//  never trusted on its own.
//  Web: no purchase here ("Get Drift Pass+ in the iPhone app"); RESTORE still pulls any
//  verified purchases the signed-in account owns.
//  Test builds (?mockiap): a stand-in store + server so the flow can be tested.
import { TEST } from "../systems/testFlags.js";
import { Leaderboard } from "./leaderboard.js";
import { PassPlus, productIdFor } from "../data/passPlus.js";
import { Account } from "./account.js";

export class StoreError extends Error {}

const nativeIOS = () => {
  const cap = typeof window !== "undefined" ? window.Capacitor : null;
  return !!cap?.isNativePlatform?.() && cap.getPlatform?.() === "ios";
};

async function nativeStore() {
  const { registerPlugin } = await import("@capacitor/core");
  return registerPlugin("GlydriftStore");
}

/** Ask the server to verify a transaction; resolves to the season it unlocks. */
async function verify(transactionId, productId) {
  const sb = await Leaderboard.session();
  const { data, error } = await sb.functions.invoke("verify-purchase", {
    body: { transactionId, productId },
  });
  if (error) throw new StoreError("Couldn't verify the purchase — tap RESTORE PURCHASES to retry.");
  if (!data?.ok) throw new StoreError(data?.reason || "The purchase couldn't be verified.");
  return data;
}

// ---- the stand-in (?mockiap) ----
const MOCK = "glydrift.mockstore";
const mockDb = () => {
  try {
    return JSON.parse(localStorage.getItem(MOCK)) || { purchases: [] };
  } catch {
    return { purchases: [] };
  }
};

export const Store = {
  /** "ios" (can buy), "web" (buy in the app), or "mock" (tests). */
  platform() {
    if (TEST.mockiap) return "mock";
    return nativeIOS() ? "ios" : "web";
  },
  canBuy() {
    return this.platform() !== "web";
  },

  /** Buy this season's Drift Pass+. Resolves once the server has verified it. */
  async buy(seasonId = PassPlus.season()) {
    if (!seasonId) throw new StoreError("Drift Pass+ is only on sale during a season.");
    if (PassPlus.owns(seasonId)) return { already: true };
    const productId = productIdFor(seasonId);
    const p = this.platform();
    if (p === "web") throw new StoreError("Get Drift Pass+ in the iPhone app.");
    if (p === "mock") {
      if (localStorage.getItem("glydrift.mockstore.fail"))
        throw new StoreError("The purchase couldn't be verified.");
      const db = mockDb();
      const tx = `mock-${db.purchases.length + 1}`;
      db.purchases.push({ transactionId: tx, productId, seasonId });
      localStorage.setItem(MOCK, JSON.stringify(db));
      PassPlus.grant(seasonId, { transactionId: tx }); // the stand-in server said yes
      return { ok: true, seasonId };
    }
    const sb = await Leaderboard.session();
    const {
      data: { session },
    } = await sb.auth.getSession();
    const store = await nativeStore();
    const res = await store.purchase({ productId, appAccountToken: session.user.id });
    if (res.pending)
      throw new StoreError("Waiting for approval — it unlocks once approved (RESTORE PURCHASES).");
    if (res.cancelled) return { cancelled: true };
    const v = await verify(res.transactionId, productId);
    PassPlus.grant(v.seasonId || seasonId, { transactionId: res.transactionId });
    return { ok: true, seasonId: v.seasonId || seasonId };
  },

  /** RESTORE PURCHASES: re-verify App Store purchases and pull the account's verified ones. */
  async restore() {
    const p = this.platform();
    let restored = 0;
    if (p === "mock") {
      for (const x of mockDb().purchases) {
        if (!PassPlus.owns(x.seasonId)) restored++;
        PassPlus.grant(x.seasonId, x);
      }
      return { restored };
    }
    if (p === "ios") {
      const store = await nativeStore();
      const { transactions = [] } = await store.restore();
      for (const t of transactions) {
        if (!t.productId?.startsWith("com.glydrift.game.driftpassplus.")) continue;
        const v = await verify(t.transactionId, t.productId);
        if (!PassPlus.owns(v.seasonId)) restored++;
        PassPlus.grant(v.seasonId, t);
      }
    }
    restored += await this.pullServerEntitlements();
    return { restored };
  },

  /**
   * Launch check: the server, not this device, decides who owns Drift Pass+. Signed in: the
   * account's verified purchases are pulled and any season the server doesn't list is dropped.
   * A guest (an anonymous session) can buy too: its own verified purchases are kept the same
   * way. No session at all: any local entitlement is dropped. Offline / server not reachable:
   * nothing changes until the next launch.
   */
  async recheck() {
    if (this.platform() === "mock" || TEST.offline || !Account.available || !Account.known) return;
    if (Account.user) await this.pullServerEntitlements({ exact: true });
    else PassPlus.keepOnly([]);
  },

  /** Verified purchases recorded on the server for this account (any device). */
  async pullServerEntitlements({ exact = false } = {}) {
    if (TEST.offline) return 0;
    try {
      const sb = await Leaderboard.session();
      const { data, error } = await sb.from("purchases").select("season_id, transaction_id");
      if (error) return 0;
      if (exact) PassPlus.keepOnly((data || []).map((r) => r.season_id));
      let n = 0;
      for (const row of data || []) {
        if (!PassPlus.owns(row.season_id)) n++;
        PassPlus.grant(row.season_id, { transactionId: row.transaction_id });
      }
      return n;
    } catch {
      return 0;
    }
  },
};

// Coin grants from the owner (supabase/migrations/20261115000002_coin_grants.sql). The owner adds
// a grant on the server; the game claims it here: one atomic call marks the player's unclaimed
// grants claimed and returns them, so each grant is paid exactly once, and the coins go into the
// save (and sync to the account like any other coins). Works for guests too: it uses the
// leaderboard's session (the anonymous player id).
//
// Asked at launch, when the game comes back to the screen and every two minutes while it's open,
// never in the middle of a run. Never throws; before the migration has been run it does nothing.
import { Save } from "../data/save.js";
import { TEST } from "../systems/testFlags.js";
import { Leaderboard } from "./leaderboard.js";

const CHECK_MS = 120_000;

export const Grants = {
  claiming: null,
  listeners: new Set(),
  isBusy: null, // set at boot: true while a run is being played
  off: false, // the server doesn't have the grants function (yet)

  /** fn({ coins, notes }) after grants were paid out (the menu shows them). */
  onGrant(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },

  /** Claim and pay any waiting grants. Resolves to the coins paid (0 when none). */
  claim() {
    if (this.off || this.isBusy?.()) return Promise.resolve(0);
    if (this.claiming) return this.claiming;
    this.claiming = (async () => {
      try {
        const sb = await Leaderboard.session();
        const { data, error } = await sb.rpc("glydrift_claim_grants");
        if (error) {
          // the migration hasn't been run: stop asking this session
          if (["PGRST202", "42883", "PGRST205"].includes(error.code)) this.off = true;
          return 0;
        }
        return this.pay(data || []);
      } catch {
        return 0; // offline: asked again later
      } finally {
        this.claiming = null;
      }
    })();
    return this.claiming;
  },

  /** Add claimed grants to the save (once each: the server already marked them claimed). */
  pay(rows) {
    const coins = rows.reduce((a, r) => a + Math.max(0, Math.round(Number(r.coins) || 0)), 0);
    if (coins <= 0) return 0;
    Save.data.coins = (Save.data.coins || 0) + coins;
    Save.data.stats ||= {};
    Save.data.stats.grantCoins = (Save.data.stats.grantCoins || 0) + coins;
    Save.write(); // (signed in: the cloud sync uploads it)
    const notes = rows.map((r) => r.note).filter(Boolean);
    for (const fn of this.listeners) fn({ coins, notes });
    // (the home screen listens for this: no import, so the scenes' load order stays as it was)
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("glydrift:grant", { detail: { coins, notes } }));
    return coins;
  },

  /** Once at launch: claim now, then when the game is shown again and every two minutes. */
  init() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    document.addEventListener("visibilitychange", () => !document.hidden && this.claim());
    this.timer = setInterval(() => this.claim(), CHECK_MS);
    this.claim();
  },
};

if (TEST.on && typeof window !== "undefined") window.__glyGrants = Grants;

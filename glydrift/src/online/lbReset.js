// Leaderboard resets. When a reset is run on the server (supabase/migrations/
// 20261107000001_leaderboard_reset.sql), it publishes a marker in the public table
// glydrift_meta: key "lb_reset", value { id: "2026-11", at: <time> }. Each game that sees a
// marker it hasn't applied yet:
//   - clears this device's best score, its ghost and today's daily best (the boards are
//     empty, so the next run can set a new best there), and drops endless / daily scores
//     still waiting to upload from before the reset;
//   - keeps everything else (coins, heroes, cosmetics, Drift Pass, level stars, account);
//   - shows the LEADERBOARD RESET pop-up once, unless this is a brand-new install.
// The applied reset id (save.lbReset) travels with the account's cloud save, so a player who
// has seen the notice on one device doesn't see it again on another (cloudSave.js merges it,
// and drops any best score from before the reset).
import { Save } from "../data/save.js";
import { TEST } from "../systems/testFlags.js";
import { Account } from "./account.js";
import { Leaderboard, Levels } from "./leaderboard.js";

const KEY = "lb_reset";

/** The reset the server announces ({ id } or null). Never throws. */
async function fetchMarker() {
  if (TEST.lbreset) return { id: TEST.lbreset };
  if (TEST.offline || TEST.lbmock) return null;
  try {
    const sb = await Leaderboard.client();
    const { data, error } = await sb
      .from("glydrift_meta")
      .select("value")
      .eq("key", KEY)
      .maybeSingle();
    if (error || !data?.value?.id) return null; // no reset yet (or the table isn't there)
    return { id: String(data.value.id) };
  } catch {
    return null;
  }
}

/** Waits for the account's cloud save to be merged first (at most a few seconds). */
async function accountSettled() {
  if (!Account.available) return;
  try {
    Account.init();
    await Promise.race([Account.ready, new Promise((r) => setTimeout(r, 6000))]);
  } catch {
    // offline: this device's save decides
  }
}

export const LbReset = {
  /** Apply reset `id` to this device's save. Returns true if the notice should show. */
  apply(id) {
    const s = Save.data;
    if ((s.lbReset || "") >= id) return false;
    // a brand-new install (never flown, no best): nothing to tell them
    const fresh = !((s.stats?.runs || 0) > 0 || (s.best || 0) > 0);
    s.best = 0;
    s.ghost = null;
    if (s.daily) {
      s.daily.best = 0;
      s.daily.ghost = null;
    }
    // endless / daily / distance scores from before the reset never reach the new boards
    // (level times stay: those boards weren't reset); the entry being uploaded right now
    // finishes on its own
    const q = s.lbQueue || [];
    for (let i = q.length - 1; i >= 0; i--) {
      const op = q[i];
      if (op.type !== "score" || Levels.isLevel(op.level)) continue;
      if (i === 0 && Leaderboard.flushing) continue;
      q.splice(i, 1);
    }
    s.lbReset = id;
    if (!fresh) s.lbNotice = id;
    Save.write();
    return !fresh;
  },

  /** Check the server once; returns the reset id whose notice should show now, or null. */
  async check() {
    const m = await fetchMarker();
    if (!m) return this.pending();
    await accountSettled();
    this.apply(m.id);
    return this.pending();
  },

  /** A notice waiting on this device (applied but not shown yet). */
  pending() {
    const s = Save.data;
    return s.lbNotice && s.lbNotice === s.lbReset ? s.lbNotice : null;
  },

  markShown() {
    Save.data.lbNotice = "";
    Save.write();
  },
};

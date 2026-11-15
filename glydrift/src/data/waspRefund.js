// WASP LORD was switched off (heroSwitch.js). A save that owned him is marked `waspRefund.owed`
// when he's taken out of it; this pays his 55,000 coins back ONCE per player:
//  - signed in (an account): the SERVER decides (glydrift_wasp_refund, one row per account in
//    glydrift_wasp_refunds), so a reload, logging out and in, or a second device can never pay
//    it twice. The save's `paid` flag then travels with the cloud save as well.
//  - a guest (no account, this device only): paid here once; `paid` stays in the save.
// A signed-in player who's offline is paid when the server can be reached.
import { Save } from "./save.js";
import { heroOn, WASP_REFUND } from "./heroSwitch.js";
import { Account } from "../online/account.js";

const wait = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);

export const WaspRefund = {
  busy: false,

  /** Is a refund still to be settled for this save? */
  pending() {
    const r = Save.data.waspRefund;
    return !heroOn("wasplord") && !!r?.owed && !r.paid;
  },

  /**
   * Settle the refund if one is owed. Returns "paid" when the coins were added just now (show
   * the message), otherwise null (nothing owed, already paid elsewhere, or try again later).
   */
  async settle() {
    if (!this.pending() || this.busy) return null;
    this.busy = true;
    try {
      if (Account.available) await wait(Account.ready, 8000);
      const s = Save.data;
      const account = Account.signedIn || !!s.cloudSync?.uid;
      if (account) {
        if (!Account.signedIn) return null; // offline: next time
        const res = await Account.claimWaspRefund();
        if (!this.pending()) return null; // (a cloud merge marked it paid meanwhile)
        if (res === "granted") return this.pay();
        if (res === "already") {
          s.waspRefund = { owed: false, paid: true };
          Save.write();
        }
        return null; // "not_owner" / not set up yet: nothing paid
      }
      if (Account.available && !Account.known) return null; // can't tell yet: next time
      return this.pay(); // a guest: this device's own save
    } catch {
      return null; // offline / server not set up: next launch
    } finally {
      this.busy = false;
    }
  },

  pay() {
    const s = Save.data;
    s.coins += WASP_REFUND;
    s.waspRefund = { owed: false, paid: true };
    Save.write();
    return "paid";
  },
};

export const WASP_REFUND_TEXT = "Wasp Lord has been removed. Your 55,000 coins were refunded.";

// WASP LORD switched off: a player whose personal best (score and/or distance) was set with him
// gets both reset ONCE to their highest remaining non-Wasp Lord score on the leaderboard (0 if
// none). The server decides and remembers the values (glydrift_wasp_best_reset(), one row per
// player in glydrift_wasp_best_resets), so every device of that player gets the same numbers
// and a reload never resets again. `save.waspBest` records it here and in the cloud save:
// cloudSave.js makes a reset save's best win over a not-yet-reset copy (an older device or app),
// so the Wasp Lord best can't come back through a cloud merge.
import { Save } from "./save.js";
import { heroOn } from "./heroSwitch.js";
import { Leaderboard } from "../online/leaderboard.js";
import { TEST } from "../systems/testFlags.js";

export const WaspBest = {
  busy: false,

  pending() {
    return !heroOn("wasplord") && !Save.data.waspBest?.done;
  },

  /** Apply the server's answer (exported for tests). Returns true when the bests changed. */
  apply(res) {
    const s = Save.data;
    if (!res || typeof res !== "object" || !this.pending()) return false;
    if (!res.reset) {
      s.waspBest = { done: true, reset: false };
      Save.write();
      return false;
    }
    // the server's numbers, or a non-Wasp Lord run still waiting to upload (offline) if higher
    const queued = (level) =>
      Math.max(0, ...(s.lbQueue || []).filter((q) => q?.type === "score" && q.level === level && q.character !== "wasplord").map((q) => Number(q.score) || 0));
    const best = Math.max(0, Math.floor(Number(res.best) || 0), queued("endless"));
    const dist = Math.max(0, Math.floor(Number(res.distance) || 0), queued("endless-distance"));
    s.best = best;
    s.stats.maxDistance = dist;
    s.ghost = null; // the ghost of the best run was his flight
    if (s.ghostChar === "wasplord") s.ghostChar = "volt";
    s.waspBest = { done: true, reset: true, best, distance: dist };
    Save.write();
    return true;
  },

  /** Ask the server once (never throws; offline or not set up yet: next launch). */
  async settle() {
    if (!this.pending() || this.busy || TEST.offline || TEST.lbmock) return false;
    this.busy = true;
    try {
      const sb = await Leaderboard.session();
      const { data, error } = await sb.rpc("glydrift_wasp_best_reset");
      if (error) return false;
      return this.apply(data);
    } catch {
      return false;
    } finally {
      this.busy = false;
    }
  },
};

if (TEST.on && typeof window !== "undefined") window.__glyWaspBest = WaspBest;

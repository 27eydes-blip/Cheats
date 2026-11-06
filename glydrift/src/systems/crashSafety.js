// Crash safety: a run is never lost.
//   - While flying, the run (score, distance, coins…) is checkpointed every few seconds.
//   - If the game errors badly enough that the frame guard sends it back to the home screen,
//     the run is finished right there: progress saved, score sent to the leaderboard.
//   - If the phone closes the game mid-run (iOS does that when memory runs out, without any
//     error), the next launch finds the checkpoint and does the same, then reports it.
//   - A run finished normally, or one the player quit from the pause menu, clears it.
// Endless and daily runs only (level runs keep their own progress).
import { Progression } from "../data/progression.js";
import { Leaderboard } from "../online/leaderboard.js";
import { CrashReport } from "./crashReport.js";
import { TEST } from "./testFlags.js";

const KEY = "glydrift.liveRun";
// a page load: a checkpoint from an earlier page load is a run the phone closed
const SESSION = (() => {
  try {
    return crypto.getRandomValues(new Uint32Array(2)).join("-");
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
})();

export const CrashSafety = {
  session: SESSION,

  /** Called every few seconds while a run is on. */
  checkpoint(run, where = {}) {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ sid: SESSION, at: Date.now(), run: JSON.parse(JSON.stringify(run)), ...where }),
      );
    } catch {}
  },

  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {}
  },

  pending() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {
      return null;
    }
  },

  /**
   * Finish an interrupted run from its checkpoint: coins, XP, best score and the leaderboard,
   * exactly like a normal death. Returns the run, or null when there was nothing to recover.
   * reason: "error" (the game recovered from a crash) | "killed_mid_run" (found at launch).
   */
  recover(reason) {
    const cp = this.pending();
    if (!cp?.run) return null;
    this.clear(); // first: a run is credited once, even if crediting it fails
    const run = { ...cp.run, recovered: reason };
    if (!(run.distance > 0)) return null;
    try {
      Progression.commitRun(run);
    } catch (e) {
      CrashReport.report("recover_failed", e);
    }
    try {
      Leaderboard.submitRun(run);
    } catch {}
    CrashReport.report(reason, reason === "killed_mid_run" ? "the game was closed mid-run" : "run recovered after an error", {
      score: run.score,
      distance: run.distance,
      realm: cp.realm,
      hero: run.char,
      mode: run.mode,
      scene: "Game",
    });
    return run;
  },

  /** At launch: a checkpoint left by an earlier page load means the phone closed the game. */
  recoverAtLaunch() {
    const cp = this.pending();
    if (!cp || cp.sid === SESSION) return null;
    return this.recover("killed_mid_run");
  },
};

// test builds only
if (TEST.on && typeof window !== "undefined") window.__glyCrash = { CrashSafety, CrashReport };

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
const DONE = "glydrift.recoveredRuns"; // sessions whose run another page load already credited
// a page load: a checkpoint from an earlier page load is a run the phone closed
const SESSION = (() => {
  try {
    return crypto.getRandomValues(new Uint32Array(2)).join("-");
  } catch {
    return `${Date.now()}-${Math.random()}`;
  }
})();

// how the run ended, for telling iOS memory kills apart from players closing the game: a run
// last seen on screen that never came back is a crash (memory, a freeze); one last seen in the
// background is the phone tidying up (or the player swiping it away)
function killedMessage(cp) {
  const secs = Math.round((cp.run?.runTimeMs || 0) / 1000);
  return `the game was closed mid-run (${cp.hidden ? "in the background" : "on screen"}, ${secs}s in)`;
}

export const CrashSafety = {
  session: SESSION,

  /** Called every few seconds while a run is on. */
  checkpoint(run, where = {}) {
    try {
      // another page load (a second tab, or the home-screen app reopened while this page was
      // still alive in the background) already credited and reported this run: writing it again
      // made the next launch report and credit it a second time
      if (this.recoveredElsewhere()) return;
      localStorage.setItem(
        KEY,
        JSON.stringify({
          sid: SESSION,
          at: Date.now(),
          hidden:
            typeof document !== "undefined" &&
            document.visibilityState === "hidden",
          run: JSON.parse(JSON.stringify(run)),
          ...where,
        }),
      );
    } catch {}
  },

  /** This page's run was credited by another page load (see recover). */
  recoveredElsewhere() {
    try {
      return JSON.parse(localStorage.getItem(DONE) || "[]").includes(SESSION);
    } catch {
      return false;
    }
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
    if (cp.sid !== SESSION)
      try {
        const done = JSON.parse(localStorage.getItem(DONE) || "[]").filter(
          (s) => s !== cp.sid,
        );
        localStorage.setItem(
          DONE,
          JSON.stringify([...done, cp.sid].slice(-10)),
        );
      } catch {}
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
    CrashReport.report(
      reason,
      reason === "killed_mid_run"
        ? killedMessage(cp)
        : "run recovered after an error",
      {
        score: run.score,
        distance: run.distance,
        realm: cp.realm,
        hero: run.char,
        mode: run.mode,
        scene: "Game",
      },
    );
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
if (TEST.on && typeof window !== "undefined")
  window.__glyCrash = { CrashSafety, CrashReport };

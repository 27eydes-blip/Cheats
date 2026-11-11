import Phaser from "phaser";

/**
 * Frame guard: never let one bad frame freeze the game.
 *
 * Phaser asks the browser for the next frame only *after* the current one finishes, so a
 * single uncaught error anywhere in a frame (scene update, tween/timer callback, render)
 * stops the loop for good and the screen freezes on its last picture. This wraps the
 * per-frame step so an error is caught, recorded and the loop keeps going. If the same
 * frame keeps failing, the game drops back to the home screen (and, as a last resort,
 * reloads the page) instead of hanging.
 *
 * Errors are kept in localStorage under "glydrift.errors" (last 12) for diagnosis.
 */
const KEY = "glydrift.errors";
const RECOVER_AFTER = 20; // consecutive failing frames (~1/3 s) → end the run (game over) or go home
const HOME_AFTER = 80; // still failing after that (~1 s more) → everything back to the home screen
const RELOAD_AFTER = 180; // still failing after the recovery (~3 s) → reload the page

let streak = 0;
let recovered = false;

/**
 * Crash safety hooks (set at boot): report the error; end the run cleanly (game over, score
 * saved) before recovering; finish the run from its checkpoint before going home.
 */
export const GuardHooks = { onError: null, endRun: null, beforeRecover: null };

export function recordError(kind, err, game) {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    let scenes = "";
    try {
      scenes = game?.scene
        .getScenes(true)
        .map((s) => s.sys.settings.key)
        .join(",");
    } catch {}
    list.push({
      t: new Date().toISOString(),
      kind,
      msg: String(err?.message || err).slice(0, 200),
      stack: String(err?.stack || "")
        .split("\n")
        .slice(0, 4)
        .join(" | ")
        .slice(0, 400),
      scenes,
    });
    localStorage.setItem(KEY, JSON.stringify(list.slice(-12)));
  } catch {}
}

export function recover(game) {
  try {
    GuardHooks.beforeRecover?.();
  } catch (e) {
    recordError("recover-hook", e, game);
  }
  try {
    const sm = game.scene;
    for (const s of sm.getScenes(false)) {
      const k = s.sys.settings.key;
      if (k !== "Backdrop" && (s.sys.isActive() || s.sys.isPaused() || s.sys.isSleeping()))
        sm.stop(k);
    }
    sm.start("Menu");
  } catch (e) {
    recordError("recover", e, game);
  }
}

/** Wrap one of Phaser's per-frame steps so a thrown error never stops the loop. */
function guard(name) {
  const orig = Phaser.Game.prototype[name];
  Phaser.Game.prototype[name] = function guardedStep(time, delta) {
    try {
      orig.call(this, time, delta);
      streak = 0;
      recovered = false;
    } catch (err) {
      // The error cut the frame short, before Phaser's render step could mark the scene
      // manager idle. Left "busy", every scene change from now on (including the recovery
      // below) is queued and re-queued forever: the page locks up. Mark it idle again.
      try {
        if (this.scene) this.scene.isProcessing = false;
      } catch {}
      streak++;
      if (streak === 1) {
        console.error("[glydrift] frame error (loop kept alive):", err?.stack || String(err)); // (text: every browser logs it readably)
        recordError("frame", err, this);
        try {
          GuardHooks.onError?.(err);
        } catch {}
      }
      if (streak === RECOVER_AFTER && !recovered) {
        // first try: a run in progress ends the normal way (game over, score saved)
        let ended = false;
        try {
          ended = !!GuardHooks.endRun?.(this);
        } catch (e) {
          recordError("endrun", e, this);
        }
        if (!ended) {
          recovered = true;
          recover(this);
        }
      } else if (streak === HOME_AFTER && !recovered) {
        recovered = true;
        recover(this);
      } else if (streak >= RELOAD_AFTER) {
        streak = 0;
        reloadOnce();
      }
    }
  };
}
// the normal frame, and the update-only frame (a hidden tab; test builds that draw less often)
guard("step");
guard("headlessStep");

// (a lost GPU context: systems/contextGuard.js)

/**
 * A screen that fails while it's being built (its create() throws) would sit half-drawn, often
 * with no BACK button. Every scene's create is wrapped: on an error the run in progress is
 * saved, the error reported, and the player goes back to the home screen with their progress.
 * The home screen itself gets two more tries, then the page reloads (at most once a minute).
 */
let menuFails = 0;
let gameRef = null;
function sceneFailed(scene, err) {
  const game = gameRef || scene.sys?.game;
  const key = scene.sys?.settings?.key || "?";
  console.error(`[glydrift] the ${key} screen failed to open:`, err);
  recordError(`scene:${key}`, err, game);
  try {
    GuardHooks.onError?.(err, "scene");
  } catch {}
  setTimeout(() => {
    if (key === "Boot" || (key === "Menu" && ++menuFails > 2)) return reloadOnce();
    recover(game);
  }, 0);
}
/** Wrap the create() of these scene classes (call before the game is made). */
export function guardScenes(classes, game) {
  gameRef = game || gameRef;
  for (const Cls of classes) {
    const create = Cls.prototype.create;
    if (typeof create !== "function" || create.__guarded) continue;
    const wrapped = function guardedCreate(...args) {
      this.__createFailed = false;
      try {
        const r = create.apply(this, args);
        if (r && typeof r.catch === "function")
          r.catch((e) => {
            this.__createFailed = true;
            sceneFailed(this, e);
          });
        return r;
      } catch (err) {
        this.__createFailed = true; // its update would only fail on the half-built screen
        sceneFailed(this, err);
      }
    };
    wrapped.__guarded = true;
    Cls.prototype.create = wrapped;
    const update = Cls.prototype.update;
    if (typeof update === "function")
      Cls.prototype.update = function guardedUpdate(...args) {
        if (this.__createFailed) return;
        return update.apply(this, args);
      };
  }
}

function reloadOnce() {
  let last = 0;
  try {
    last = +sessionStorage.getItem("glydrift.reloadAt") || 0;
    sessionStorage.setItem("glydrift.reloadAt", String(Date.now()));
  } catch {}
  if (Date.now() - last > 60000) location.reload();
}

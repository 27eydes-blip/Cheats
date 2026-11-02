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
const RECOVER_AFTER = 20; // consecutive failing frames (~1/3 s) → back to the home screen
const RELOAD_AFTER = 180; // still failing after the recovery (~3 s) → reload the page

let streak = 0;
let recovered = false;

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

function recover(game) {
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

const step = Phaser.Game.prototype.step;
Phaser.Game.prototype.step = function guardedStep(time, delta) {
  try {
    step.call(this, time, delta);
    streak = 0;
    recovered = false;
  } catch (err) {
    streak++;
    if (streak === 1) {
      console.error("[glydrift] frame error (loop kept alive):", err);
      recordError("frame", err, this);
    }
    if (streak === RECOVER_AFTER && !recovered) {
      recovered = true;
      recover(this);
    } else if (streak >= RELOAD_AFTER) {
      streak = 0;
      let last = 0;
      try {
        last = +sessionStorage.getItem("glydrift.reloadAt") || 0;
        sessionStorage.setItem("glydrift.reloadAt", String(Date.now()));
      } catch {}
      if (Date.now() - last > 60000) location.reload();
    }
  }
};

/** Also keep a record of a lost GPU context (iOS can drop it under memory pressure). */
export function watchContext(game) {
  const c = game.canvas;
  if (!c) return;
  c.addEventListener("webglcontextlost", () => recordError("contextlost", "WebGL context lost", game));
  c.addEventListener("webglcontextrestored", () =>
    recordError("contextrestored", "WebGL context restored", game),
  );
}

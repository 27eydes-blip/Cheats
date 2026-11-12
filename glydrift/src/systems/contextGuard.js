// Lost GPU context: never keep a run going with invisible graphics.
//
// iPad Safari drops the WebGL context when the device runs low on graphics memory. Phaser then
// stops drawing but the game kept running underneath: the run went on unseen and the player
// died to hazards they couldn't see. And when the context came back, the textures could come
// back blank (iOS wipes the canvases they're uploaded from in the same reset).
//
//  1. Lost: the run pauses at once (the normal pause, the run is checkpointed) and a small
//     "Restoring graphics…" note shows over the frozen picture (the game itself can't draw).
//  2. Restored: every texture is drawn again from scratch (gfx/rebuildArt.js), every text and
//     tile sprite redrawn; then the PAUSED menu shows and the player taps RESUME.
//     Not in a run: the screen the player was on starts again (it builds its own art).
//  3. Not back after GIVE_UP_MS of the game being on screen, or the rebuild failed: the run
//     ends the normal way (score, coins and distance saved, sent to the leaderboard) and the
//     page reloads into the home screen (a reload is the only way to get a new context).
import { rebuildAllTextures } from "../gfx/rebuildArt.js";
import { Save } from "../data/save.js";
import { CrashReport } from "./crashReport.js";
import { recordError } from "./frameGuard.js";

export const GIVE_UP_MS = 8000;
const NO_RESTART = new Set(["Boot", "Backdrop", "Game", "Hud", "GameOver", "LevelComplete"]);

export const ContextGuard = {
  lost: false,
  lostCount: 0,
  restoredCount: 0,
  lastRebuild: null,
  gaveUp: null,
  game: null,

  install(game) {
    this.game = game;
    const c = game.canvas;
    if (!c || this.installed) return;
    this.installed = true;
    // (Phaser's own listeners were added first: they mark the renderer lost, and on restore
    // recreate its GL objects before this one rebuilds the pixels)
    c.addEventListener("webglcontextlost", (e) => this.onLost(e), false);
    c.addEventListener("webglcontextrestored", () => this.onRestored(), false);
  },

  runScene() {
    const gs = this.game?.scene.getScene("Game");
    return gs && (gs.sys.isActive() || gs.sys.isPaused()) ? gs : null;
  },

  onLost(e) {
    e?.preventDefault?.(); // (tells the browser we want the context back)
    if (this.lost) return;
    this.lost = true;
    this.lostCount++;
    this.gaveUp = null;
    recordError("contextlost", "WebGL context lost", this.game);
    CrashReport.report("contextlost", "WebGL context lost");
    // the run stops right now: the same pause as going to the background (it also saves a
    // checkpoint, so even a phone that then closes the game keeps the run)
    try {
      this.runScene()?.onHidden?.();
    } catch (err) {
      recordError("contextlost-pause", err, this.game);
    }
    this.note("Restoring graphics…");
    this.startWatch();
  },

  onRestored() {
    if (!this.lost) return;
    this.stopWatch();
    const gl = this.game.renderer?.gl;
    if (!gl || gl.isContextLost()) return this.startWatch(); // a false start: keep waiting
    let result = null;
    try {
      result = rebuildAllTextures(this.game);
      this.lastRebuild = result;
      if (result.missing.length)
        throw new Error(`textures not rebuilt: ${result.missing.slice(0, 6).join(", ")}`);
    } catch (err) {
      recordError("contextrebuild", err, this.game);
      CrashReport.report("contextrebuild", err);
      return this.giveUp("rebuild");
    }
    this.lost = false;
    this.restoredCount++;
    this.note(null);
    recordError("contextrestored", `WebGL context restored (${result.rebuilt} textures)`, this.game);
    if (!this.runScene()) this.restartScreens();
    // (in a run, the PAUSED menu from step 1 is showing: RESUME carries on)
  },

  /** Not in a run: the open screen(s) start again, so anything they drew themselves is fresh. */
  restartScreens() {
    try {
      for (const s of this.game.scene.getScenes(true)) {
        const k = s.sys.settings.key;
        if (!NO_RESTART.has(k)) s.scene.restart();
      }
    } catch (err) {
      recordError("contextrestart", err, this.game);
    }
  },

  /** The graphics can't come back: finish the run properly, then start the page again. */
  giveUp(reason) {
    if (this.gaveUp) return;
    this.gaveUp = reason;
    this.stopWatch();
    CrashReport.report("contextgiveup", `graphics not restored (${reason})`);
    try {
      const gs = this.runScene();
      if (gs && gs.state === "playing") {
        // (the run is paused: un-pause just long enough to end it the normal way)
        if (gs.sys.isPaused()) gs.sys.resume();
        gs.endAfterError?.();
      }
    } catch (err) {
      recordError("contextgiveup", err, this.game);
    }
    try {
      Save.write();
    } catch {}
    this.note("Graphics were reset. Your run is saved. Restarting…");
    CrashReport.flush?.();
    setTimeout(() => this.reload(), 1500);
  },

  reload() {
    try {
      location.reload();
    } catch {}
  },

  /** Count only time the game is on screen (iOS restores a backgrounded page when it returns). */
  startWatch() {
    this.stopWatch();
    let shown = 0;
    let last = performance.now();
    this.timer = setInterval(() => {
      const now = performance.now();
      if (document.visibilityState === "visible") shown += now - last;
      last = now;
      if (!this.lost) return this.stopWatch();
      if (shown >= GIVE_UP_MS) this.giveUp("timeout");
    }, 250);
  },

  stopWatch() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  },

  where() {
    try {
      const gs = this.runScene();
      return gs
        ? { realm: gs.zoneId, score: Math.floor(gs.score || 0), meters: Math.floor(gs.meters || 0) }
        : { screen: this.game.scene.getScenes(true).map((s) => s.sys.settings.key).join(",") };
    } catch {
      return {};
    }
  },

  /** A plain DOM note over the game (the canvas can't draw while the context is lost). */
  note(text) {
    let el = document.getElementById("gfx-note");
    if (!text) {
      el?.remove();
      return;
    }
    if (!el) {
      el = document.createElement("div");
      el.id = "gfx-note";
      el.setAttribute("role", "status");
      el.style.cssText =
        "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:50;" +
        "padding:14px 22px;border-radius:12px;background:rgba(5,1,13,0.88);" +
        "border:1px solid rgba(62,244,255,0.5);color:#e8e0ff;text-align:center;" +
        "font:600 18px Rajdhani,system-ui,sans-serif;max-width:80vw;pointer-events:none";
      document.body.appendChild(el);
    }
    el.textContent = text;
  },
};

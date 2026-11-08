// Always the latest version. Every build has an id (__BUILD_ID__) and publishes it in
// version.json. The game checks it at launch, whenever it comes back to the foreground and every
// 5 minutes; when a newer version is live it reloads into it as soon as it's safe: never in the
// middle of a run (it waits for the home screen / game over). The service worker serves the page
// network-first, so the reload gets the new files. One reload per new version at most: if the
// reload still came up with the old files (a slow CDN), it doesn't loop.
/* global __BUILD_ID__ */
import { TEST } from "./testFlags.js";

export const BUILD = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";
const RELOADED = "glydrift.reloadedFor";
let latest = null;
let game = null;

const enabled = () => import.meta.env.PROD && !TEST.on && typeof fetch !== "undefined";

/** No run in progress (home screen, game over, menus): a reload loses nothing. */
function safeNow() {
  try {
    const gs = game?.scene?.getScene("Game");
    if (!gs || !game.scene.isActive("Game")) return true;
    return gs.state === "dead" || game.scene.isActive("GameOver");
  } catch {
    return true;
  }
}

export const Updater = {
  /** True when a reload would lose nothing (no run in progress). */
  safe() {
    return safeNow();
  },
  get latest() {
    return latest;
  },
  /** A newer version is live and this page hasn't reloaded into it yet. */
  get pending() {
    if (!latest || latest === BUILD) return false;
    try {
      return sessionStorage.getItem(RELOADED) !== latest;
    } catch {
      return true;
    }
  },

  async check() {
    if (!enabled()) return;
    try {
      const base = import.meta.env.BASE_URL || "/";
      const res = await fetch(`${base}version.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const v = await res.json();
      if (v?.build) latest = String(v.build);
      this.applyIfSafe();
    } catch {
      // offline: try again later
    }
  },

  /** Reload into the new version now if nothing would be lost. */
  applyIfSafe() {
    if (!this.pending || !safeNow()) return false;
    try {
      sessionStorage.setItem(RELOADED, latest);
    } catch {}
    window.location.reload();
    return true;
  },

  start(g) {
    game = g;
    if (!enabled()) return;
    this.check();
    setInterval(() => this.check(), 5 * 60 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") this.check();
    });
  },
};

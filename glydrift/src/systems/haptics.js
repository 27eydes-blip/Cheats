// Light / strong haptic taps. Uses the native Haptics plugin when the game runs as an
// installed app (Capacitor), else the Vibration API where the browser has one (Android).
// iPhone Safari / home-screen web apps have no web vibration API, so there it is a no-op.
import { Save } from "../data/save.js";
import { isNativeApp } from "./platform.js";

let last = 0;

// the app: the @capacitor/haptics plugin (the Taptic Engine), loaded once at first use
let plugin = null;
let loading = false;
function native() {
  if (!isNativeApp()) return null;
  if (!plugin && !loading) {
    plugin = window.Capacitor?.Plugins?.Haptics || null;
    loading = !plugin;
    if (!plugin)
      import("@capacitor/haptics")
        .then((m) => (plugin = m.Haptics))
        .catch(() => {});
  }
  return plugin;
}

/** Settings → HAPTICS: "full" (every flap too), "light" (softer, no per-flap tick) or "off". */
export function hapticsLevel() {
  const v = Save.data.settings.haptics;
  if (v === false || v === "off") return "off";
  return v === "light" ? "light" : "full";
}

function buzz(style, ms, { flap = false } = {}) {
  const level = hapticsLevel();
  if (level === "off" || (flap && level === "light")) return;
  if (level === "light" && style === "HEAVY") {
    style = "MEDIUM";
    ms = Math.round(ms / 2);
  }
  const now = performance.now();
  if (style === "LIGHT" && now - last < 70) return; // never a buzzing blur
  last = now;
  try {
    const h = native();
    if (h?.impact) {
      // (the native call is async: a rejection must not surface as an unhandled error)
      Promise.resolve(h.impact({ style })).catch(() => {});
      return;
    }
    navigator.vibrate?.(ms);
  } catch {}
}

export const Haptics = {
  /** the lightest tick: every flap */
  tap: () => buzz("LIGHT", 5, { flap: true }),
  /** coins, combo steps, perfect passes */
  light: () => buzz("LIGHT", 8),
  /** milestones, new best, level-ups, unlocks */
  strong: () => buzz("HEAVY", 28),
};

// test builds only
/* global __TEST_FLAGS__ */
if (typeof __TEST_FLAGS__ !== "undefined" && __TEST_FLAGS__ && typeof window !== "undefined")
  window.__glyHaptics = { Haptics, hapticsLevel };

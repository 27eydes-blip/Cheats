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

function buzz(style, ms) {
  if (Save.data.settings.haptics === false) return;
  const now = performance.now();
  if (style === "LIGHT" && now - last < 70) return; // never a buzzing blur
  last = now;
  try {
    const h = native();
    if (h?.impact) {
      h.impact({ style });
      return;
    }
    navigator.vibrate?.(ms);
  } catch {}
}

export const Haptics = {
  /** the lightest tick: every flap */
  tap: () => buzz("LIGHT", 5),
  /** coins, combo steps, perfect passes */
  light: () => buzz("LIGHT", 8),
  /** milestones, new best, level-ups, unlocks */
  strong: () => buzz("HEAVY", 28),
};

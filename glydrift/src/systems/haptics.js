// Light / strong haptic taps. Uses the native Haptics plugin when the game runs as an
// installed app (Capacitor), else the Vibration API where the browser has one (Android).
// iPhone Safari / home-screen web apps have no web vibration API, so there it is a no-op.
import { Save } from "../data/save.js";

let last = 0;

function native() {
  return typeof window !== "undefined" ? window.Capacitor?.Plugins?.Haptics : null;
}

function buzz(style, ms) {
  if (Save.data.settings.haptics === false) return;
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
  tap: () => buzz("LIGHT", 5),
  /** coins, combo steps, perfect passes */
  light: () => buzz("LIGHT", 8),
  /** milestones, new best, level-ups, unlocks */
  strong: () => buzz("HEAVY", 28),
};

// Oblivion GP haptics: short vibration patterns for what your car feels (drift, boost, a hit, a
// wall scrape, an item pickup) through navigator.vibrate, wherever the browser has it (Android
// Chrome, Samsung Internet, Firefox for Android...). Safari on iPhone and iPad has no web vibration
// API at all, so there (and on desktops) every call is a silent no-op. Settings > Haptics turns it
// off. Each kind has a minimum gap so a long scrape or a busy fight never buzzes non-stop.
import { SETTINGS } from '../settings.js';

// patterns in ms: a number = one buzz, an array = buzz, pause, buzz...
export const HAPTICS = {
  drift: { p: 12, gap: 0.35 }, // a drift starts
  tier: { p: 18, gap: 0.2 }, // the drift sparks change colour
  boost: { p: [26, 30, 18], gap: 0.5 }, // boost pad, mini-turbo, turbo item, bounty boost
  hit: { p: [45, 25, 30], gap: 0.25 }, // you took a hit
  crash: { p: [90, 40, 140], gap: 0.8 }, // you were wrecked
  bump: { p: 30, gap: 0.25 }, // a hard bump with another car (stronger = longer)
  wall: { p: 35, gap: 0.3 }, // a wall hit
  scrape: { p: 9, gap: 0.12 }, // scraping along a wall
  item: { p: [14, 45, 14], gap: 0.3 }, // you picked up an item
  land: { p: 22, gap: 0.3 }, // landing a jump
};
const last = {};
let nav = typeof navigator !== 'undefined' ? navigator : null;
// tests can swap in a fake navigator
export function setHapticsNavigator(n) { nav = n; for (const k in last) delete last[k]; }
export const hapticsSupported = () => !!(nav && typeof nav.vibrate === 'function');
// now: seconds (any clock); k: strength 0..1 scales one-buzz patterns. Returns true if it buzzed.
export function haptic(kind, k = 1, now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000) {
  const H = HAPTICS[kind];
  if (!H || SETTINGS.haptics === false || !hapticsSupported() || k <= 0) return false;
  if (last[kind] != null && now - last[kind] < H.gap) return false;
  last[kind] = now;
  const p = typeof H.p === 'number' ? Math.max(6, Math.round(H.p * Math.min(1.6, 0.4 + k * 0.8))) : H.p;
  try { return nav.vibrate(p) !== false; } catch { return false; }
}
// stop any buzz (leaving the race, turning Haptics off)
export function hapticsOff() { try { if (hapticsSupported()) nav.vibrate(0); } catch {} }

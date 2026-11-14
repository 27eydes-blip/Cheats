// Player settings shared by every module (render, effects, audio).
// reduceFlash: no strobing/pulsing, no screen shake, steady glows instead.
// lowGfx: no shadows, ambient particles, slime animation, ground clutter; 1x resolution.
const KEY = 'hunt-settings';
const defaults = { reduceFlash: false, lowGfx: false, sound: true };
let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
export const SETTINGS = { ...defaults, ...saved };
try {
  if (saved.reduceFlash === undefined && matchMedia('(prefers-reduced-motion: reduce)').matches) SETTINGS.reduceFlash = true;
} catch {}
export function setSetting(k, v) {
  SETTINGS[k] = v;
  try { localStorage.setItem(KEY, JSON.stringify(SETTINGS)); } catch {}
}
// a 0..1 pulse that becomes a steady value under Reduce Flashing
export const pulse = (t, speed = 8, steady = 0.75) => (SETTINGS.reduceFlash ? steady : 0.5 + Math.sin(t * speed) * 0.5);

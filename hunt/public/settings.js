// Player settings shared by every module (render, effects, audio).
// reduceFlash: no strobing/pulsing, no screen shake, steady glows instead.
// lowGfx: no shadows, ambient particles, slime animation, ground clutter; 1x resolution.
const KEY = 'hunt-settings';
// aimSens: aim stick sensitivity (less drag needed when higher); leftHanded: aim on the left thumb;
// holdFire: keep firing while the aim stick is held (otherwise fire on release)
// raceSens: racing steering sensitivity 0.5..1.5 (turn rate); raceStick: racing joystick size s / m / l
const defaults = { reduceFlash: false, lowGfx: false, sound: true, musicVol: 0.6, sfxVol: 0.9, aimSens: 1, leftHanded: false, holdFire: false, raceSens: 1, raceStick: 'm' };
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

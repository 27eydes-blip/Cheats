// Player settings shared by every module (render, effects, audio).
// reduceFlash: no strobing/pulsing, no screen shake, steady glows instead.
// lowGfx: no shadows, ambient particles, slime animation, ground clutter; 1x resolution.
const KEY = 'hunt-settings';
// aimSens: aim stick sensitivity (less drag needed when higher); leftHanded: aim on the left thumb;
// holdFire: keep firing while the aim stick is held (otherwise fire on release)
// raceSens: racing steering sensitivity 0.5..1.5 (turn rate); raceStick: racing joystick size s / m / l
// raceView: race camera 'top' (default) | 'chase' | 'cockpit' (the old raceCam key is ignored so everyone is back on top-down) (race/camera.js); haptics: race vibrations (where the browser can)
const defaults = { reduceFlash: false, lowGfx: false, sound: true, musicVol: 0.6, sfxVol: 0.9, aimSens: 1, leftHanded: false, holdFire: false, raceSens: 1, raceStick: 'm', raceView: 'top', haptics: true };
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

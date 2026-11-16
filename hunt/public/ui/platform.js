// Menu car art for the neon store and lobby: a car turning on a dark platform with a neon rim and
// its underglow pooled under it, drawn from a look (race/looks.js). Try-on in the store passes a
// look with the item swapped in; `boost` shows the boost flame and trail.
import { makeLook, drawCarPreview, setCosResolver } from '../race/looks.js';
import { resolveCos, equippedOf, SLOTS } from '../race/garage.js';
import { DRIVERS } from '../race/physics.js';

export const CAR_SPAN = 64; // track units a car needs at any heading
const TAU = Math.PI * 2;
setCosResolver(resolveCos); // (race roster rows -> looks: race/looks.js lookForRacer)
const looks = new Map();
// a look for car + equipped ids ({slot: id}), cached (menus redraw every frame)
export function lookOf(car, ids = null) {
  const key = car + ':' + (ids ? SLOTS.map((s) => ids[s] || '').join(',') : '');
  let L = looks.get(key);
  if (!L) { if (looks.size > 200) looks.clear(); L = makeLook(DRIVERS[car] ? car : 'volt', resolveCos(ids, car)); looks.set(key, L); }
  return L;
}
export const equippedLook = (p, car) => lookOf(car, equippedOf(p, car));

const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

// the car on its platform, filling w x h. o: {still (no turning), boost (show the boost flame and trail), steady (Reduce Flashing), low (no glow pass)}
export function drawPlatform(g, w, h, car, look, t, o = {}) {
  const L = look || lookOf(car), still = !!o.still;
  const s = Math.max(0.1, Math.min(w / (CAR_SPAN * 1.6), h / (CAR_SPAN * 1.25)));
  const cx = w / 2, cy = h * 0.52;
  // platform: dark disc, neon rim, a ring of marks that turns with the car
  const ang = still ? -0.6 : t * 0.6;
  g.save();
  g.translate(cx, cy + 10 * s); g.scale(1, 0.38);
  g.fillStyle = '#07050f'; g.beginPath(); g.arc(0, 8 * s, 40 * s, 0, TAU); g.fill();
  g.fillStyle = '#151027'; g.beginPath(); g.arc(0, 0, 40 * s, 0, TAU); g.fill();
  if (!o.low) { g.shadowColor = L.neon; g.shadowBlur = 14; }
  g.lineWidth = Math.max(2, 2.6 * s); g.strokeStyle = L.neon; g.beginPath(); g.arc(0, 0, 39 * s, 0, TAU); g.stroke();
  g.shadowBlur = 0;
  g.strokeStyle = rgba(L.neon, 0.45); g.lineWidth = Math.max(1, 1.2 * s); g.beginPath();
  for (let i = 0; i < 16; i++) { const a = ang + (i / 16) * TAU; g.moveTo(Math.cos(a) * 30 * s, Math.sin(a) * 30 * s); g.lineTo(Math.cos(a) * 35 * s, Math.sin(a) * 35 * s); }
  g.stroke();
  g.restore();
  // the car (drawCarPreview draws its underglow, rims and, with boost, the flame and trail), seen a
  // little from the front: squashed like the platform
  g.save();
  g.translate(cx, cy); g.scale(s * 0.8, s * 0.64); // (a little smaller than the platform: its underglow shows round it)
  drawCarPreview(g, car, L, ang, t, { steady: !!o.steady, boost: !!o.boost });
  g.restore();
}

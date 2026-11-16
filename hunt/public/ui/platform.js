// Menu car art for the neon store and lobby: a car turning on a dark platform with a neon rim and
// its underglow pooled under it, drawn from a look (race/looks.js). Try-on in the store passes a
// look with the item swapped in; flames / trails / rims can be shown as a little demo.
import { makeLook, drawCarPreview } from '../race/looks.js';
import { resolveCos, equippedOf, SLOTS } from '../race/garage.js';
import { DRIVERS } from '../race/physics.js';

export const CAR_SPAN = 64; // track units a car needs at any heading
const TAU = Math.PI * 2;
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

// underglow in car space (car at the origin, nose +x), under the body
function underglow(g, L, t, still) {
  const blob = (x, y, rx, ry, a) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, rx);
    gr.addColorStop(0, rgba(L.glow, a)); gr.addColorStop(1, rgba(L.glow, 0));
    g.save(); g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rx, 0, TAU); g.fill(); g.restore();
  };
  if (L.glowStyle === 'twin') { blob(20, 0, 34, 28, 0.75); blob(-22, 0, 34, 28, 0.75); }
  else if (L.glowStyle === 'mist') { for (let i = 0; i < 4; i++) { const k = still ? i : t * 0.8 + i * 1.7; blob(Math.cos(k) * 18, Math.sin(k * 1.3) * 10, 40, 32, 0.4); } }
  else blob(0, 0, 58, 42, 0.85);
}

// boost demo in car space: the exhaust flame and a trail behind the car
function flameDemo(g, L, t, still) {
  const f = still ? 1 : 0.85 + Math.sin(t * 31) * 0.15;
  for (const y of [-5, 5]) {
    g.beginPath(); g.moveTo(-28, y - 4); g.quadraticCurveTo(-28 - 22 * f, y, -28, y + 4); g.closePath(); g.fillStyle = L.flame.outer; g.fill();
    g.beginPath(); g.moveTo(-28, y - 2); g.quadraticCurveTo(-28 - 11 * f, y, -28, y + 2); g.closePath(); g.fillStyle = L.flame.core; g.fill();
  }
}
function trailDemo(g, L, t, still) {
  g.save(); g.lineCap = 'round';
  if (L.trailStyle === 'sparks') {
    for (let i = 0; i < 12; i++) { const k = ((still ? i * 0.08 : t * 1.5 + i * 0.08) % 1); g.globalAlpha = 1 - k; g.fillStyle = L.trail; g.beginPath(); g.arc(-30 - k * 70, Math.sin(i * 2.1) * 8 * k, 2.4 * (1 - k) + 0.6, 0, TAU); g.fill(); }
  } else {
    const w = L.trailStyle === 'ribbon' ? 9 : 3.5;
    const gr = g.createLinearGradient(-30, 0, -110, 0); gr.addColorStop(0, rgba(L.trail, 0.95)); gr.addColorStop(1, rgba(L.trail, 0));
    g.strokeStyle = gr;
    for (const y of L.trailStyle === 'ribbon' ? [0] : [-8, 8]) { g.lineWidth = w; g.beginPath(); g.moveTo(-30, y); g.bezierCurveTo(-60, y + (still ? 0 : Math.sin(t * 3) * 6), -85, y, -110, y); g.stroke(); }
  }
  g.restore();
}
// rim hubs over the four wheels (the menu car art has no rim layer of its own yet)
function rimDemo(g, L) {
  for (const [x, y] of [[15, -14], [15, 14], [-15, -15], [-15, 15]]) {
    g.beginPath(); g.arc(x, y, 3.6, 0, TAU); g.fillStyle = '#12091e'; g.fill(); g.lineWidth = 1.6; g.strokeStyle = L.rim; g.stroke();
    g.beginPath(); for (let i = 0; i < L.spokes; i++) { const a = (i / L.spokes) * TAU; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 3.2, y + Math.sin(a) * 3.2); } g.lineWidth = 0.9; g.stroke();
  }
}

// the car on its platform, filling w x h. o: {still (no turning), demo: 'flame'|'trail'|'wheel'|null, low (no glow pass)}
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
  // the car, seen a little from the front (squashed), with the underglow under it
  g.save();
  g.translate(cx, cy); g.scale(s * 0.8, s * 0.64); // (the car a little smaller than the platform: its underglow shows round it)
  g.save(); g.rotate(ang); underglow(g, L, t, still); if (o.demo === 'trail') trailDemo(g, L, t, still); if (o.demo === 'flame') flameDemo(g, L, t, still); g.restore();
  drawCarPreview(g, car, L, ang, t);
  if (o.demo === 'wheel') { g.rotate(ang); rimDemo(g, L); }
  g.restore();
}

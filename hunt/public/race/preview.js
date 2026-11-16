// Menu art for the racing lobby: small track previews (the real layout, in each world's colours),
// a driver's car on a turntable, and the driver stat bars. Previews are drawn once per size and
// cached, so the lobby only blits them.
import { DRIVERS, ALL_DRIVER_IDS } from './physics.js';
import { drawCarPreview, glowDot } from './cars2.js';
import { makeLook } from './looks2.js';
export { drawCarPreview };
import { getTrack, TRACK_IDS, trackName } from './tracks.js';
import { WEAPONS, weaponCd } from './items.js';

const INK = '#12091e';
// world colours at night for the previews: ground, road, neon edge, accent (start line, hazards)
const PAL = {
  desert: { bg: '#4c2e35', road: '#231c2c', edge: '#ff8a4a', acc: '#ff3d6a', glow: '#ffcf7a' },
  frozen: { bg: '#2c3f6a', road: '#161e36', edge: '#5fd0ff', acc: '#bff4ff', glow: '#bfe9ff' },
  ashlands: { bg: '#241418', road: '#2a2026', edge: '#ff6a1a', acc: '#ff3d1f', glow: '#ff9f43' },
  neon: { bg: '#100c2a', road: '#1c1838', edge: '#ff3fa4', acc: '#38f2ff', glow: '#c04dff' },
};
export const TRACK_CHOICES = ['any', ...TRACK_IDS];
export const trackLabel = (k, arena = false) => (k === 'any' ? (arena ? 'Random Arena' : 'Random Track') : trackName(k, arena) || k);

const cache = new Map();
// a cached canvas (w x h CSS px at dpr) with the layout of track `key` ('any' = a question mark card)
export function trackPreview(key, w, h, dpr = 1, arena = false) {
  const ck = `${key}:${arena ? 1 : 0}:${w}x${h}@${dpr}`;
  let cv = cache.get(ck);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * dpr)); cv.height = Math.max(1, Math.round(h * dpr));
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (key === 'any') drawRandom(g, w, h); else drawLayout(g, key, w, h, arena);
  if (cache.size > 64) cache.clear();
  cache.set(ck, cv);
  return cv;
}

function drawRandom(g, w, h) {
  const q = TRACK_IDS.length;
  for (let i = 0; i < q; i++) { g.fillStyle = PAL[TRACK_IDS[i]]?.bg || '#555'; g.fillRect((w / q) * i, 0, w / q + 1, h); }
  g.fillStyle = 'rgba(18,9,30,0.45)'; g.fillRect(0, 0, w, h);
  const s = Math.min(w, h);
  g.font = `400 ${Math.round(s * 0.62)}px "Lilita One", "Arial Black", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = Math.max(3, s * 0.08); g.strokeStyle = INK; g.lineJoin = 'round';
  g.strokeText('?', w / 2, h / 2 + s * 0.04); g.fillStyle = '#ffd23f'; g.fillText('?', w / 2, h / 2 + s * 0.04);
}

function drawLayout(g, key, w, h, arena) {
  const T = getTrack(key, arena), P = PAL[key] || PAL.desert;
  g.fillStyle = P.bg; g.fillRect(0, 0, w, h);
  if (!T) return;
  const b = T.box ? { x0: T.box.x0 - 60, y0: T.box.y0 - 60, x1: T.box.x1 + 60, y1: T.box.y1 + 60 } : T.bounds;
  const bw = b.x1 - b.x0, bh = b.y1 - b.y0, pad = Math.max(4, Math.min(w, h) * 0.08), k = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
  const ox = (w - bw * k) / 2 - b.x0 * k, oy = (h - bh * k) / 2 - b.y0 * k;
  g.save(); g.setTransform(g.getTransform().a * k, 0, 0, g.getTransform().d * k, g.getTransform().a * ox, g.getTransform().d * oy);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const px = 1 / k; // one CSS pixel in track units
  if (T.box) {
    g.fillStyle = INK; g.fillRect(T.box.x0 - 4 * px, T.box.y0 - 4 * px, T.box.x1 - T.box.x0 + 8 * px, T.box.y1 - T.box.y0 + 8 * px);
    g.fillStyle = P.road; g.fillRect(T.box.x0, T.box.y0, T.box.x1 - T.box.x0, T.box.y1 - T.box.y0);
    g.fillStyle = INK; for (const o of T.obstacles || []) { g.beginPath(); g.arc(o.x, o.y, o.r, 0, 7); g.fill(); }
    g.fillStyle = P.acc; for (const c of T.circles || []) { g.globalAlpha = 0.8; g.beginPath(); g.arc(c.x, c.y, c.r, 0, 7); g.fill(); }
    g.globalAlpha = 1;
  } else {
    // wall, road (thick strokes of the centre lines, widest first), shortcuts dashed, start line
    const pass = (col, wd, dash) => {
      g.strokeStyle = col;
      for (const c of T.corridors) {
        g.lineWidth = Math.max(wd(c), 2 * px); g.setLineDash(c.main ? [] : dash);
        g.beginPath(); for (let i = 0; i < c.n; i++) g.lineTo(c.px[i], c.py[i]); if (c.closed) g.closePath(); g.stroke();
      }
    };
    const road = (c) => Math.max(c.hw[0] * 2, (c.main ? 7 : 4) * px);
    pass(INK, (c) => road(c) + 5 * px, [40 * px, 0]);
    pass(P.edge, (c) => road(c) + 2 * px, [8 * px, 6 * px]);
    pass(P.road, road, [8 * px, 6 * px]);
    g.setLineDash([]);
    const G0 = T.gates[0];
    if (G0) { g.strokeStyle = '#ffd23f'; g.lineWidth = 3 * px; g.beginPath(); g.moveTo(G0.x0, G0.y0); g.lineTo(G0.x1, G0.y1); g.stroke(); }
  }
  g.restore();
  // a soft vignette so the layout reads on any background
  const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(18,9,30,0.35)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}

// blit a preview into a canvas element sized by CSS
export function paintPreview(cv, key, arena = false) {
  const d = Math.min(2, devicePixelRatio || 1), r = cv.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
  const g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
  g.drawImage(trackPreview(key, w, h, d, arena), 0, 0);
}

// a car spinning slowly on a neon platform with its underglow, filling a w x h box. look: a look
// object from looks.js (default: the car's base look); t drives the spin and the animated skins
// (callers pass t = 0 under Reduce Flashing for a still car).
export const CAR_SPAN = 64; // track units a car needs at any heading (body + wheels + wings)
export function drawCarStage(g, w, h, id, t, { still = false, ring = true, look = null } = {}) {
  const L = look || makeLook(id);
  const s = Math.max(0.1, Math.min(w / (CAR_SPAN * 1.45), h / (CAR_SPAN * 1.1)));
  const cx = w / 2, cy = h / 2 + 4 * s;
  if (ring) {
    g.fillStyle = 'rgba(8,6,20,0.7)'; g.beginPath(); g.ellipse(cx, cy + 6 * s, 36 * s, 13 * s, 0, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5;
    g.drawImage(glowDot(L.glow), cx - 40 * s, cy - 8 * s, 80 * s, 28 * s);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.lineWidth = Math.max(2, 2.2 * s); g.strokeStyle = L.neon;
    g.beginPath(); g.ellipse(cx, cy + 6 * s, 32 * s, 11 * s, 0, 0, Math.PI * 2); g.stroke();
    g.lineWidth = Math.max(1, 0.8 * s); g.strokeStyle = L.neon2; g.globalAlpha = 0.7;
    g.beginPath(); g.ellipse(cx, cy + 6 * s, 26 * s, 8.6 * s, 0, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
  }
  const a = still ? -0.5 : -0.5 + t * 0.6;
  g.save();
  g.translate(cx, cy - Math.abs(Math.sin(t * 2.2)) * (still ? 0 : 1.2 * s));
  g.scale(s, s * 0.82); // seen from a little in front: the platform is an ellipse
  drawCarPreview(g, L.driver, L, a, t, { steady: still || !t, boost: false }); // parked: no flames
  g.restore();
}

// The 4 stat bars on every car card (Garage, store, lobby), each 0..1 across all 14 cars (never
// empty, never quite full), from the real numbers:
//   SPEED     top speed
//   HANDLING  turn rate and grip
//   BOOST     how fast it gets going and how much it gets from boosts: acceleration x drift charge
//             (VOIDRUNNER) x boost length (SOLAR FANG)
//   WEAPON    the built-in weapon's damage per second of recharge, weighted by how it lands
//             (a pulse hits everyone close, a rail reaches far, mines wait to be driven over; a
//             sentry fires a few bolts) and the driver's recharge (HELIX)
const LANDS = { arc: 1, pulse: 1.3, rail: 1.1, mine: 0.75, turret: 0.55, blink: 1.1 };
const SHOTS = (W) => (W.kind === 'turret' ? Math.max(1, Math.round(W.life / W.rate)) : 1);
export const STAT_VAL = {
  top: (D) => D.top,
  handling: (D) => D.handling * (0.75 + 0.25 * D.grip / 8.2),
  boost: (D) => D.accel * (D.dcMul || 1) * (D.boostLen || 1),
  weapon: (D, id) => { const W = WEAPONS[id] || WEAPONS.volt; return (W.dmg * SHOTS(W) * (LANDS[W.kind] || 1)) / weaponCd(id, D); },
};
const RANGE = {};
for (const k of Object.keys(STAT_VAL)) {
  const v = ALL_DRIVER_IDS.map((d) => STAT_VAL[k](DRIVERS[d], d));
  RANGE[k] = [Math.min(...v), Math.max(...v)];
}
export const STAT_ROWS = [['SPEED', 'top'], ['HANDLING', 'handling'], ['BOOST', 'boost'], ['WEAPON', 'weapon']];
export function driverStats(id) {
  const D = DRIVERS[id] || DRIVERS.volt, d = DRIVERS[id] ? id : 'volt';
  return STAT_ROWS.map(([label, k]) => {
    const [lo, hi] = RANGE[k], x = STAT_VAL[k](D, d), f = hi > lo ? (x - lo) / (hi - lo) : 0.5;
    return { label, k, f: 0.3 + f * 0.65, v: k === 'top' ? `${Math.round(D.top / 8)} km/h` : (Math.round((0.3 + f * 0.65) * 100) / 10).toFixed(1) };
  });
}
export const weaponOf = (id) => WEAPONS[id] || WEAPONS.volt;

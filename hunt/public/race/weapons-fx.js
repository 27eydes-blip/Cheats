// Oblivion GP weapons, the client's side: the combat event bus (hooks for haptics, sound mixing,
// camera and slow-mo layers), the art for the new pickups' effects (drawn in code once into cached
// sprites, blitted per frame) and the arming / lock-on cues. The server decides everything; this
// only shows it. Reduce Flashing: no strobes (arming traps breathe slowly), sounds stay.
import { SETTINGS } from '../settings.js';
import { INK } from './cars.js';

const TAU = Math.PI * 2;
const ROTORS = [[-14, -14], [14, -14], [-14, 14], [14, 14]];

// ------------------------------------------------------------------ combat bus
// app.js emits, anything may listen (no DOM, no allocation unless someone listens):
//   'hit'     {id, src, kind, dmg, big, me}   a racer took damage (me: you were hit or hit them)
//   'explode' {x, y, r}                       an explosion in the world (r ~ size in px)
//   'pickup'  {id, item, lvl, up, me}         a racer got an item from a box (up: it levelled up)
//   'lockon'  {target, src, kind, me}         a missile / drone locked on (me: on you)
//   'dodge'   {id, me}                        a drift shook a missile
//   'takedown'{victim, by, me}                a racer was wrecked by another
//   'hitstop' {t}                             the 0.08 s freeze that sells a hit you dealt or took
export const HIT_STOP = 0.08;
const L = new Map();
export const combatBus = {
  on(type, fn) { let a = L.get(type); if (!a) L.set(type, (a = [])); a.push(fn); return () => this.off(type, fn); },
  off(type, fn) { const a = L.get(type); if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
  has(type) { const a = L.get(type); return !!a && a.length > 0; },
  emit(type, data) { const a = L.get(type); if (a) for (const fn of a.slice()) { try { fn(data); } catch (e) { console.warn('combat bus', type, e); } } },
};

// ------------------------------------------------------------------ cues
// a trap that is still arming: a fast warning blink, or a slow steady breathe under Reduce Flashing
export const armPulse = (t, id = 0) => (SETTINGS.reduceFlash ? 0.6 + 0.25 * Math.sin(t * 2.6 + id) : (Math.sin(t * 24 + id) > 0 ? 1 : 0.25));

// ------------------------------------------------------------------ cached sprites (built once)
function canvas(w, h = w) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; }
let SP = null;
function sprites() {
  if (SP) return SP;
  SP = {};
  // GRAVITY WELL: a violet event horizon with a bright rim and spiral arms (rotated per frame)
  {
    const s = 256, cv = canvas(s), g = cv.getContext('2d'), c = s / 2;
    const gr = g.createRadialGradient(c, c, 0, c, c, c);
    gr.addColorStop(0, 'rgba(4,0,12,0.95)'); gr.addColorStop(0.22, 'rgba(10,2,28,0.92)'); gr.addColorStop(0.3, 'rgba(190,120,255,0.85)');
    gr.addColorStop(0.36, 'rgba(90,40,200,0.45)'); gr.addColorStop(0.75, 'rgba(60,20,140,0.14)'); gr.addColorStop(1, 'rgba(40,10,90,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    g.translate(c, c); g.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      g.rotate(TAU / 4);
      g.beginPath();
      for (let i = 0; i <= 40; i++) { const u = i / 40, r = c * (0.3 + u * 0.66), a = u * 2.4; i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.strokeStyle = 'rgba(200,160,255,0.35)'; g.lineWidth = 6; g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2; g.stroke();
    }
    SP.well = cv;
  }
  // HUNTER DRONE: a round body, four rotor rings and a red eye (the rotor blur is drawn live)
  {
    const s = 64, cv = canvas(s), g = cv.getContext('2d');
    g.translate(s / 2, s / 2); g.lineWidth = 3; g.strokeStyle = INK;
    for (const [x, y] of ROTORS) { g.beginPath(); g.arc(x, y, 9, 0, TAU); g.fillStyle = 'rgba(160,200,255,0.25)'; g.fill(); g.stroke(); g.beginPath(); g.moveTo(0, 0); g.lineTo(x, y); g.stroke(); }
    g.beginPath(); g.arc(0, 0, 10, 0, TAU); g.fillStyle = '#4a5466'; g.fill(); g.stroke();
    g.beginPath(); g.arc(4, 0, 4, 0, TAU); g.fillStyle = '#ff3b3b'; g.fill();
    SP.drone = cv;
  }
  // STICKY BOMB: a green goo blob with a fuse cap
  {
    const s = 64, cv = canvas(s), g = cv.getContext('2d');
    g.translate(s / 2, s / 2); g.lineWidth = 3; g.strokeStyle = INK;
    g.fillStyle = '#7dff5a';
    g.beginPath(); for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU, r = 15 + (k % 2) * 4; k ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.arc(0, 0, 9, 0, TAU); g.fillStyle = '#26332a'; g.fill(); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(-6, -7, 4, 2.5, -0.6, 0, TAU); g.fill();
    SP.sticky = cv;
  }
  // GHOST: a soft white veil drawn over a phased car
  {
    const s = 128, cv = canvas(s), g = cv.getContext('2d'), c = s / 2;
    const gr = g.createRadialGradient(c, c, 0, c, c, c);
    gr.addColorStop(0, 'rgba(220,240,255,0.55)'); gr.addColorStop(0.6, 'rgba(160,200,255,0.2)'); gr.addColorStop(1, 'rgba(160,200,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    SP.ghost = cv;
  }
  return SP;
}

// ------------------------------------------------------------------ world drawing (camera transform set)
export function drawWell(g, e, t, r, armed) {
  const S = sprites(), k = armed ? 1 : 0.45, rr = r * (armed ? 1 : 0.35);
  g.save(); g.translate(e.x, e.y); g.rotate(SETTINGS.reduceFlash ? t * 0.6 : t * 1.8);
  g.globalAlpha = k; g.drawImage(S.well, -rr, -rr, rr * 2, rr * 2); g.globalAlpha = 1;
  g.restore();
  if (armed) { g.beginPath(); g.arc(e.x, e.y, r, 0, TAU); g.lineWidth = 2; g.strokeStyle = 'rgba(190,140,255,0.45)'; g.stroke(); }
}
export function drawDrone(g, e, t, lockedOnMe) {
  const S = sprites();
  g.save(); g.translate(e.x, e.y); g.rotate(e.a);
  g.drawImage(S.drone, -27, -27, 54, 54);
  // rotor blur
  g.strokeStyle = 'rgba(230,240,255,0.55)'; g.lineWidth = 1.5;
  const a = t * 40;
  for (const [x, y] of ROTORS) { g.beginPath(); g.moveTo(x - Math.cos(a) * 8 * 0.62, y - Math.sin(a) * 8 * 0.62); g.lineTo(x + Math.cos(a) * 8 * 0.62, y + Math.sin(a) * 8 * 0.62); g.stroke(); }
  g.restore();
  if (lockedOnMe) { g.beginPath(); g.arc(e.x, e.y, 30, 0, TAU); g.lineWidth = 3; g.strokeStyle = 'rgba(255,60,60,0.85)'; g.stroke(); }
}
export function drawSticky(g, e, t, fuseLeft) {
  const S = sprites(), k = fuseLeft != null && fuseLeft < 1.2 ? 1.2 : 1;
  if (e.armed) { // stuck on a car: a green danger ring round it
    g.beginPath(); g.arc(e.x, e.y, 40, 0, TAU); g.lineWidth = 4; g.strokeStyle = 'rgba(125,255,90,0.75)'; g.stroke();
  }
  g.drawImage(S.sticky, e.x - 21 * k, e.y - 21 * k, 42 * k, 42 * k);
  // the fuse light: blinks faster as it burns down (steady glow under Reduce Flashing)
  const on = SETTINGS.reduceFlash || fuseLeft == null || Math.sin(t * (fuseLeft < 1.2 ? 30 : 12)) > 0;
  g.beginPath(); g.arc(e.x, e.y - 1, 3.5, 0, TAU); g.fillStyle = on ? '#ff3b3b' : '#5a1010'; g.fill();
}
// oil + spikes merged: a wide slick ringed with spikes
export function drawTrap(g, e, t, r, oil, armed) {
  g.save(); g.translate(e.x, e.y); g.rotate(e.id * 1.7);
  g.drawImage(oil, -r * 1.15, -r * 1.15, r * 2.3, r * 2.3);
  const a0 = armed ? 1 : armPulse(t, e.id);
  g.globalAlpha = a0; g.fillStyle = '#e8e2d2'; g.strokeStyle = INK; g.lineWidth = 1.5;
  g.beginPath();
  for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU, x = Math.cos(a) * r * 0.86, y = Math.sin(a) * r * 0.86, nx = Math.cos(a), ny = Math.sin(a); g.moveTo(x - ny * 5, y + nx * 5); g.lineTo(x + nx * 11, y + ny * 11); g.lineTo(x + ny * 5, y - nx * 5); }
  g.fill(); g.stroke(); g.globalAlpha = 1;
  g.restore();
}
export function drawGhostVeil(g, x, y) { const S = sprites(); g.globalCompositeOperation = 'lighter'; g.drawImage(S.ghost, x - 46, y - 46, 92, 92); g.globalCompositeOperation = 'source-over'; }
// the item level as pips (II / III) on a held item slot, in screen space
export function levelPips(g, x, y, lvl, u) {
  if (!(lvl > 1)) return;
  for (let i = 0; i < lvl; i++) { g.beginPath(); g.arc(x + (i - (lvl - 1) / 2) * 9 * u, y, 3.4 * u, 0, TAU); g.fillStyle = lvl === 3 ? '#ffd23f' : '#5ff4ff'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = INK; g.stroke(); }
}

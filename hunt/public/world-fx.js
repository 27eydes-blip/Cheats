// Free Play atmosphere: landmarks you can see from far away, day/night lighting, fog, the
// Blood Moon tint and compass markers. All steady under Reduce Flashing; fog skipped in Low Graphics.
import { TILE, dayNight, visionRange, worldKeyAt, zoneAt, zoneBySlot, onHigh } from './shared.js';
import { outlinedText } from './render.js';
import { drawLandmarkIcon } from './minimap.js';
import { SETTINGS, pulse } from './settings.js';

const INK = '#1b1033';

// lighting state for the camera position
export function envState(map, pos, svOffset = 0) {
  const world = map.kind === 'world';
  const dn = world ? dayNight(Date.now() + svOffset) : null;
  const key = worldKeyAt(map, pos.x, pos.y);
  const vision = visionRange(map, pos.x, pos.y, dn);
  const cave = key === 'hollow', fog = key === 'marsh';
  // how dark the screen gets outside your vision circle
  const dark = Math.max(dn ? dn.dark * 0.78 : 0, cave ? 0.82 : 0, fog ? 0.35 : 0);
  return { dn, key, vision, dark, cave, fog, blood: dn ? dn.blood : 0, high: onHigh(map, pos.x, pos.y), zone: world ? zoneAt(pos.x, pos.y) : null };
}

// ---------------------------------------------------------------- landmarks (world space, big)
export function drawLandmarks(ctx, map, view, t) {
  for (const lm of map.landmarks || []) {
    if (lm.x < view.x0 - 900 || lm.x > view.x1 + 900 || lm.y < view.y0 - 300 || lm.y > view.y1 + 1400) continue;
    ctx.save(); ctx.translate(lm.x, lm.y); ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = INK;
    if (lm.kind === 'tower') drawTower(ctx, t);
    else if (lm.kind === 'volcano') drawVolcano(ctx, t);
    else if (lm.kind === 'waterfall') drawWaterfall(ctx, t);
    ctx.restore();
  }
}
function drawTower(ctx, t) { // the Giant Tower of the Ruined Citadel: rises far above the fortress
  ctx.fillStyle = 'rgba(27,16,51,0.3)'; ctx.beginPath(); ctx.ellipse(70, 60, 190, 70, 0.3, 0, Math.PI * 2); ctx.fill(); // shadow
  ctx.beginPath(); ctx.arc(0, 0, 165, 0, Math.PI * 2); ctx.fillStyle = '#5a5f70'; ctx.fill(); ctx.stroke(); // base
  const w = 130, top = -760;
  ctx.fillStyle = '#7b8193'; ctx.fillRect(-w / 2, top, w, -top + 40); ctx.strokeRect(-w / 2, top, w, -top + 40);
  ctx.fillStyle = '#626879'; ctx.fillRect(w / 2 - 34, top, 34, -top + 40); // shaded side
  ctx.strokeStyle = 'rgba(27,16,51,0.45)'; ctx.lineWidth = 3;
  for (let y = top + 30; y < 40; y += 34) { ctx.beginPath(); ctx.moveTo(-w / 2, y); ctx.lineTo(w / 2, y); ctx.stroke(); for (let x = -w / 2 + ((y / 34) % 2 ? 20 : 40); x < w / 2; x += 44) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 34); ctx.stroke(); } }
  ctx.lineWidth = 6; ctx.strokeStyle = INK;
  // glowing windows (steady flicker only without Reduce Flashing)
  for (const [x, y] of [[-30, -560], [10, -420], [-20, -270], [16, -140]]) {
    ctx.fillStyle = INK; ctx.fillRect(x, y, 22, 36);
    ctx.globalAlpha = 0.65 + pulse(t + x, 2, 0.25) * 0.35; ctx.fillStyle = '#ff9a3c'; ctx.fillRect(x + 4, y + 4, 14, 28); ctx.globalAlpha = 1;
  }
  // broken crenellations + a tattered dark banner
  ctx.fillStyle = '#8a90a3';
  for (let i = 0; i < 4; i++) if (i !== 2) { ctx.fillRect(-w / 2 + i * 36, top - 34, 26, 36); ctx.strokeRect(-w / 2 + i * 36, top - 34, 26, 36); }
  ctx.beginPath(); ctx.moveTo(-6, top - 34); ctx.lineTo(-6, top - 170); ctx.stroke();
  const wv = SETTINGS.reduceFlash ? 0 : Math.sin(t * 2.4) * 8;
  ctx.beginPath(); ctx.moveTo(-6, top - 168); ctx.lineTo(70, top - 150 + wv); ctx.lineTo(50, top - 128 + wv); ctx.lineTo(74, top - 104 + wv); ctx.lineTo(-6, top - 100); ctx.closePath();
  ctx.fillStyle = '#8a1a2a'; ctx.fill(); ctx.stroke();
}
function drawVolcano(ctx, t) { // the Ashlands volcano: smoking cone with a lava crater
  if (!SETTINGS.lowGfx) {
    const glow = ctx.createRadialGradient(0, -60, 40, 0, -60, 460);
    glow.addColorStop(0, 'rgba(255,100,30,0.32)'); glow.addColorStop(1, 'rgba(255,100,30,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, -60, 460, 0, Math.PI * 2); ctx.fill();
  }
  ctx.beginPath(); ctx.moveTo(-360, 120); ctx.lineTo(-110, -330); ctx.lineTo(110, -330); ctx.lineTo(360, 120); ctx.quadraticCurveTo(0, 190, -360, 120); ctx.closePath();
  ctx.fillStyle = '#2b2529'; ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3d3539'; ctx.beginPath(); ctx.moveTo(-110, -330); ctx.lineTo(-40, -330); ctx.lineTo(-170, 130); ctx.lineTo(-330, 110); ctx.closePath(); ctx.fill();
  // lava channels running down
  ctx.strokeStyle = '#ff5a1f'; ctx.lineWidth = 10; ctx.lineCap = 'round';
  for (const [a, b, c, d] of [[-50, -320, -120, 60], [40, -320, 150, 40]]) { ctx.beginPath(); ctx.moveTo(a, -320); ctx.quadraticCurveTo((a + c) / 2 + 30, (b + d) / 2, c, d); ctx.stroke(); }
  ctx.lineWidth = 6; ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.ellipse(0, -330, 110, 34, 0, 0, Math.PI * 2); ctx.fillStyle = '#ff6a1f'; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, -334, 70, 18, 0, 0, Math.PI * 2); ctx.fillStyle = '#ffd23f'; ctx.fill();
  // smoke plume rising (stateless puffs)
  if (!SETTINGS.lowGfx) for (let i = 0; i < 6; i++) {
    const k = SETTINGS.reduceFlash ? i / 6 : ((t * 0.12 + i / 6) % 1);
    const x = Math.sin(i * 1.7 + k * 3) * 40 + k * 120, y = -380 - k * 620, r = 50 + k * 110;
    ctx.globalAlpha = 0.5 * (1 - k); ctx.fillStyle = '#5b5359'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function drawWaterfall(ctx, t) { // the Frozen Waterfall: an ice cliff with a frozen fall into a pool
  const w = 760;
  ctx.beginPath(); ctx.ellipse(0, 230, 330, 110, 0, 0, Math.PI * 2); ctx.fillStyle = '#cfeaff'; ctx.fill(); ctx.stroke(); // frozen pool (walkable)
  ctx.strokeStyle = 'rgba(90,150,210,0.6)'; ctx.lineWidth = 3;
  for (const [a, b] of [[-160, 220], [60, 250], [180, 200]]) { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(a + 50, b + 16); ctx.lineTo(a + 90, b - 4); ctx.stroke(); }
  ctx.lineWidth = 6; ctx.strokeStyle = INK;
  ctx.beginPath(); ctx.moveTo(-w / 2, 80); ctx.lineTo(-w / 2 + 40, -260); ctx.lineTo(-120, -330); ctx.lineTo(80, -300); ctx.lineTo(w / 2 - 30, -250); ctx.lineTo(w / 2, 80); ctx.closePath();
  ctx.fillStyle = '#6aa8d8'; ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3f6f99'; ctx.beginPath(); ctx.moveTo(-w / 2, 80); ctx.lineTo(-w / 2 + 40, -260); ctx.lineTo(-w / 2 + 120, -230); ctx.lineTo(-w / 2 + 90, 80); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-90, -310); ctx.lineTo(90, -300); ctx.lineTo(120, 150); ctx.lineTo(-120, 150); ctx.closePath(); // the frozen fall
  ctx.fillStyle = '#e6f6ff'; ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#a9dcff'; ctx.lineWidth = 7;
  for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 24, -290); ctx.lineTo(i * 30, 140); ctx.stroke(); }
  ctx.fillStyle = '#ffffff'; for (const [x, y, s] of [[-40, -200, 1], [50, -80, 0.7], [-20, 40, 0.8]]) { const k = s * (0.8 + pulse(t + x, 1.5, 0.5) * 0.4); ctx.beginPath(); ctx.moveTo(x, y - 14 * k); ctx.lineTo(x + 5 * k, y); ctx.lineTo(x, y + 14 * k); ctx.lineTo(x - 5 * k, y); ctx.closePath(); ctx.fill(); } // ice glints
  // icicles along the cliff lip
  ctx.fillStyle = '#e6f6ff'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
  for (let x = -w / 2 + 60; x < w / 2 - 40; x += 46) { if (Math.abs(x) < 110) continue; ctx.beginPath(); ctx.moveTo(x, 70); ctx.lineTo(x + 10, 120 + (x % 3) * 12); ctx.lineTo(x + 20, 70); ctx.closePath(); ctx.fill(); ctx.stroke(); }
}

// ---------------------------------------------------------------- lighting (screen space)
let fogSprite = null;
function fogPuff() {
  if (fogSprite) return fogSprite;
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
  const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  gr.addColorStop(0, 'rgba(210,220,215,0.55)'); gr.addColorStop(1, 'rgba(210,220,215,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  return (fogSprite = c);
}
// fog, darkness and the Blood Moon tint are all soft, so they're painted into ONE quarter-
// resolution layer and blitted once: one full-screen fill instead of several (phones are fill-bound)
let atm = null;
export function drawAtmosphere(ctx, st, cam, W, H, s, t) {
  const fogAmt = SETTINGS.lowGfx ? 0 : Math.max(st.fog ? 1 : 0, st.dn ? st.dn.dark * 0.6 : 0);
  if (!(fogAmt > 0) && !(st.dark > 0.01) && !st.blood) return;
  const q = 4, w = Math.max(1, Math.ceil(W / q)), h = Math.max(1, Math.ceil(H / q));
  if (!atm) atm = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  if (atm.width !== w || atm.height !== h) { atm.width = w; atm.height = h; }
  const g = atm.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); g.scale(1 / q, 1 / q);
  // fog: soft banks drifting past (marsh always; everywhere at night)
  if (fogAmt > 0) {
    const sp = fogPuff(), drift = SETTINGS.reduceFlash ? 0 : t * 18;
    g.globalAlpha = Math.min(0.9, 0.55 * fogAmt + (st.fog ? 0.25 : 0));
    for (let i = 0; i < 6; i++) {
      const wx = ((i * 977 + drift - cam.x * 0.35) % (W + 600) + W + 600) % (W + 600) - 300;
      const wy = ((i * 613 - cam.y * 0.35) % (H + 500) + H + 500) % (H + 500) - 250;
      const r = 280 + (i % 3) * 120;
      g.drawImage(sp, wx - r, wy - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
  }
  // darkness outside your vision circle (night, caves, fog). The light circle is tighter than the
  // gameplay vision so night and caves read as dark on a phone too (dimmed, not hidden)
  if (st.dark > 0.01) {
    const R = Math.min(Math.min(st.vision, 2600) * s, Math.max(W, H) * (st.cave ? 0.3 : st.fog && !(st.dn && st.dn.dark) ? 0.45 : 0.34)), cx = W / 2, cy = H / 2;
    const col = st.cave ? '7,6,13' : st.blood ? '40,4,10' : '6,8,28';
    const base = st.dn ? st.dn.dark * 0.3 : 0; // the whole night is a little darker, more so outside your light
    const gr = g.createRadialGradient(cx, cy, R * 0.5, cx, cy, Math.max(R * 1.25, 10));
    gr.addColorStop(0, `rgba(${col},${base})`); gr.addColorStop(1, `rgba(${col},${Math.min(0.92, st.dark + base * 0.5)})`);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  if (st.blood) { g.fillStyle = 'rgba(150,0,25,0.17)'; g.fillRect(0, 0, W, H); } // BLOOD MOON: a steady red tint (no flashing)
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(atm, 0, 0, w * q, h * q); ctx.restore();
}

// ---------------------------------------------------------------- compass markers for far landmarks
// where an off-screen pointer at angle a sits: on the edge of the SAFE area (never under a notch or
// the home bar), m px in from it
const NO_SA = { t: 0, r: 0, b: 0, l: 0 };
export function edgePoint(a, W, H, sa = NO_SA, m = 34) {
  const x0 = sa.l + m, x1 = W - sa.r - m, y0 = sa.t + m, y1 = H - sa.b - m;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, c = Math.cos(a), sn = Math.sin(a);
  const k = Math.min((x1 - x0) / 2 / Math.abs(c || 1e-6), (y1 - y0) / 2 / Math.abs(sn || 1e-6));
  return { x: Math.max(x0, Math.min(x1, cx + c * k)), y: Math.max(y0, Math.min(y1, cy + sn * k)) };
}

export function drawCompass(ctx, map, cam, W, H, s, sa = NO_SA, avoid = null) {
  for (const lm of map.landmarks || []) {
    const dx = (lm.x - cam.x) * s, dy = (lm.y - cam.y) * s, d = Math.hypot(lm.x - cam.x, lm.y - cam.y);
    if ((Math.abs(dx) < W / 2 && Math.abs(dy) < H / 2) || d > 9000) continue;
    const e = edgePoint(Math.atan2(dy, dx), W, H, sa, 34);
    // keep clear of the top HUD pills and the bottom controls
    const x = e.x;
    const between = x > W * 0.3 && x < W * 0.64; // bottom edge between the stick and the buttons is free
    let y = Math.max(96 + sa.t, Math.min(H - sa.b - (between ? 44 : 140), e.y));
    // a DOM panel on that edge (the safe hub's): slide the marker just below it
    if (avoid && x > avoid.left - 20 && x < avoid.right + 20 && y > avoid.top - 20 && y < avoid.bottom + 32) y = avoid.bottom + 32;
    ctx.save(); ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(x, y, 17, 0, Math.PI * 2); ctx.fillStyle = 'rgba(27,16,51,0.75)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#ffd23f'; ctx.stroke();
    drawLandmarkIcon(ctx, lm.kind, x, y + 1, 1.1);
    outlinedText(ctx, `${Math.round(d / 100) * 10}m`, x, y + 27, 10, '#fff');
    ctx.restore();
  }
}

// zone names + one-line flavour for the "entering" banner
export const ZONE_INFO = {
  city: 'Neon alleys and rooftop cover.', citadel: 'A crumbling fortress. Climb the courtyards, watch the tunnels.', forest: 'Old trees and thick brush.',
  hollow: 'Pitch-dark caves. Stay close to the crystals.', hub: 'Roads lead to every zone. The safe hub is in the middle.', ashlands: 'Lava rivers and a smoking volcano. Cross at the bridges.',
  frozen: 'Ice and snow beneath the Frozen Waterfall.', marsh: 'Thick fog and sinking mud. Keep to the boardwalks.', mirage: 'Golden dunes, oases and old ruins.',
};
export const zoneLabel = (slot) => zoneBySlot(slot)?.name || '';
void TILE;

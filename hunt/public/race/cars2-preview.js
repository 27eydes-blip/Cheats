// Dev preview for the 8 unlockable cars (not linked from the game). Views:
//   ?view=grid     every car on a turntable with name, rarity, trail colour and voice; ENGINE plays
//                  its rev, UNLOCK opens the celebration screen
//   ?view=close    the 8 cars big, side by side, boosting (close-up art check)
//   ?view=pack     the 8 cars (and 2 starters) racing in a pack at race scale on a night road
//   ?view=spin     the garage spin-in for &car=, looping
//   ?view=unlock   the unlock screen for &car=
// Flags: rf=1 Reduce Flashing, low=1 Low Graphics, t=<s> freeze the clock, bar=0 hide the bar.
import { CarSprites, blitCar, drawUnderglow, drawBoostTrail, drawCarPreview, exhaustsOf, CAR2_IDS } from './cars2.js';
import { makeLook, BASE_LOOKS2, RARITY, carName, NEON_GLOW } from './looks2.js';
import { Showcase, SPIN_IN_S } from './showcase2.js';
import { ENGINE_VOICES, revVoice } from './sound2.js';
import { showUnlock } from '../ui/unlock.js';
import { SETTINGS } from '../settings.js';

const Q = new URLSearchParams(location.search);
const view = Q.get('view') || 'grid', car = BASE_LOOKS2[Q.get('car')] ? Q.get('car') : 'prime';
const steady = Q.get('rf') === '1' || (Q.get('rf') !== '0' && SETTINGS.reduceFlash), low = Q.get('low') === '1';
const frozen = Q.has('t') ? parseFloat(Q.get('t')) || 0 : null;
const clock = (now) => (frozen !== null ? frozen : now / 1000);
const main = document.getElementById('main'), bar = document.getElementById('bar');
window.__cars2 = { ready: false, view, car, steady, low };

// ---- bar
if (Q.get('bar') === '0') bar.remove();
else {
  const link = (v, label, extra = '') => { const a = document.createElement('a'); a.href = `?view=${v}${extra}${steady ? '&rf=1' : ''}${low ? '&low=1' : ''}`; a.textContent = label; if (v === view) a.className = 'on'; bar.appendChild(a); };
  bar.innerHTML = '<b>UNLOCKABLE CARS · DEV</b>';
  link('grid', 'GRID'); link('close', 'CLOSE UP'); link('pack', 'PACK'); link('spin', 'SPIN-IN', `&car=${car}`); link('unlock', 'UNLOCK', `&car=${car}`);
  const tog = (k, on, label) => { const a = document.createElement('a'); const q = new URLSearchParams(location.search); q.set(k, on ? '0' : '1'); a.href = '?' + q; a.textContent = label; if (on) a.className = 'on'; bar.appendChild(a); };
  tog('rf', steady, 'REDUCE FLASHING'); tog('low', low, 'LOW GRAPHICS');
}

const fit = (cv) => { const d = Math.min(2, devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); } return { d, w, h }; };
const loop = (fn) => { const f = (now) => { fn(clock(now)); if (frozen === null) requestAnimationFrame(f); }; requestAnimationFrame(f); };

// ---- views
if (view === 'grid') grid();
else if (view === 'close') close();
else if (view === 'pack') pack();
else if (view === 'spin') spin();
else if (view === 'unlock') unlock();

function grid() {
  const wrap = document.createElement('div'); wrap.className = 'grid'; main.appendChild(wrap);
  const cards = CAR2_IDS.map((id) => {
    const B = BASE_LOOKS2[id], R = RARITY[B.rarity], el = document.createElement('div');
    el.className = 'card'; el.style.setProperty('--c', R.color); el.style.setProperty('--g', R.glow + '55');
    el.innerHTML = `<canvas></canvas><div class="meta"><span class="nm">${B.name}</span><span class="tag">${R.name}</span></div>
      <div class="sub"><span class="sw" style="background:${B.trail.color};box-shadow:0 0 6px ${B.trail.color}"></span>${B.trail.style} trail · ${ENGINE_VOICES[B.voice].label}
      <button type="button" data-rev="${id}">ENGINE</button><button type="button" data-unlock="${id}">UNLOCK</button></div>`;
    wrap.appendChild(el);
    return { id, cv: el.querySelector('canvas'), show: new Showcase(), t0: null };
  });
  wrap.addEventListener('click', (e) => {
    const r = e.target.dataset.rev, u = e.target.dataset.unlock;
    if (r) revVoice(BASE_LOOKS2[r].voice);
    if (u) showUnlock({ id: u, steady, low, perk: 'Perk text comes with the car stats.' });
  });
  loop((t) => {
    for (const c of cards) {
      const { d, w, h } = fit(c.cv), g = c.cv.getContext('2d');
      if (c.t0 === null) c.t0 = t;
      g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
      g.translate(w / 2, h / 2);
      c.show.draw(g, c.id, null, frozen !== null ? SPIN_IN_S + t : t - c.t0, t, { size: Math.min(w * 0.62, h * 0.8), steady, low });
    }
    window.__cars2.ready = true;
  });
}

// close up: 4 x 2 (landscape) or 2 x 4 (portrait), each car big, boosting, heading up-right
function close() {
  document.body.classList.add('fill');
  const cv = document.createElement('canvas'); cv.id = 'stage'; main.appendChild(cv);
  loop((t) => {
    const { d, w, h } = fit(cv), g = cv.getContext('2d'), top = bar.isConnected ? bar.offsetHeight : 0;
    g.setTransform(d, 0, 0, d, 0, 0); g.fillStyle = '#07061a'; g.fillRect(0, 0, w, h); floor(g, w, h, t);
    const cols = w > h ? 4 : 2, rows = 8 / cols, cw = w / cols, ch = (h - top - 16) / rows;
    CAR2_IDS.forEach((id, i) => {
      const cx = cw * (i % cols) + cw / 2, cy = top + ch * Math.floor(i / cols) + ch / 2, L = makeLook(id), R = RARITY[L.rarity];
      const k = Math.min(cw / 100, ch / 74);
      g.setTransform(d * k, 0, 0, d * k, d * cx, d * (cy - 4 * k));
      drawCarPreview(g, id, L, -0.42, t + i * 0.37, { steady, low });
      g.setTransform(d, 0, 0, d, 0, 0);
      g.font = `700 ${Math.max(10, Math.round(Math.min(ch * 0.075, cw * 0.05)))}px "Chakra Petch", system-ui, sans-serif`; g.textAlign = 'center';
      g.fillStyle = R.color; g.fillText(`${L.name} · ${R.name}`, cx, cy + ch * 0.44);
    });
    window.__cars2.ready = true;
  });
}

// a dark floor with a faint grid (shared by close up and spin)
function floor(g, w, h) {
  g.strokeStyle = 'rgba(80,110,255,0.07)'; g.lineWidth = 1; g.beginPath();
  for (let x = 0; x < w; x += 28) { g.moveTo(x, 0); g.lineTo(x, h); }
  for (let y = 0; y < h; y += 28) { g.moveTo(0, y); g.lineTo(w, y); }
  g.stroke();
}

// the pack: race scale (the renderer's zoom for this screen and CAR_VIS), a night road, boosting
function pack() {
  document.body.classList.add('fill');
  const cv = document.createElement('canvas'); cv.id = 'stage'; main.appendChild(cv);
  const spr = new CarSprites(), CAR_VIS = 1.18;
  const field = [...CAR2_IDS, 'volt', 'rook'].map((id, i) => ({ id, L: makeLook(id), lane: ((i * 3) % 5) - 2, row: Math.floor(i / 2) * 1.0 + (i % 2) * 0.5, ring: new Float32Array(32), boost: i % 3 !== 2 }));
  let lastScale = 0;
  loop((t) => {
    const { d, w, h } = fit(cv), g = cv.getContext('2d');
    const zoom = Math.max(0.5, Math.min(1.3, Math.min(w, h * 1.75) / 1000)), s = zoom * d;
    const sc = Math.round(zoom * d * CAR_VIS * 8) / 8;
    if (sc !== lastScale) { spr.setScale(sc); lastScale = sc; }
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#0a0916'; g.fillRect(0, 0, cv.width, cv.height);
    // camera follows the pack moving +x along a gentle S curve
    const speed = 520, camX = t * speed, roadY = (x) => Math.sin(x / 900) * 140, roadA = (x) => Math.atan(Math.cos(x / 900) * 140 / 900);
    const ox = w / 2 - camX * zoom + 120 * zoom, oy = h / 2 - roadY(camX) * zoom;
    const M = (x, y, a = 0, k = 1) => { const c = Math.cos(a) * k * s, sn = Math.sin(a) * k * s; g.setTransform(c, sn, -sn, c, d * (ox + x * zoom), d * (oy + y * zoom)); };
    // road: wide asphalt band, neon edges, dashed lanes
    M(0, 0); const x0 = camX - w / zoom, x1 = camX + w / zoom, hw = 260;
    for (const [wd, col] of [[hw * 2 + 30, '#ff3fa4'], [hw * 2 + 22, '#05040a'], [hw * 2, '#1b1830']]) {
      g.strokeStyle = col; g.lineWidth = wd; g.lineCap = 'butt'; g.globalAlpha = col === '#ff3fa4' ? 0.55 * NEON_GLOW : 1; g.beginPath();
      for (let x = x0; x <= x1; x += 40) g.lineTo(x, roadY(x)); g.stroke();
    }
    g.globalAlpha = 1; g.strokeStyle = 'rgba(160,200,255,0.25)'; g.lineWidth = 4; g.setLineDash([60, 70]);
    for (const l of [-1, 1]) { g.beginPath(); for (let x = x0; x <= x1; x += 40) g.lineTo(x, roadY(x) + l * hw * 0.34); g.stroke(); }
    g.setLineDash([]);
    for (const c of field) {
      const x = camX - c.row * 95 + Math.sin(t * 0.7 + c.lane) * 30, a = roadA(x) + Math.sin(t * 1.3 + c.row) * 0.06, y = roadY(x) + c.lane * 64;
      // trail ring: positions behind the car (newest first at ti - 1)
      for (let k = 0; k < 16; k++) { const xx = x - (k + 1) * 14, j = ((15 - k + 16) % 16) * 2; c.ring[j] = xx - Math.cos(a) * 24; c.ring[j + 1] = roadY(xx) + c.lane * 64 + Math.sin(t * 0.7 + c.lane) * 0 - Math.sin(a) * 24; }
      M(x, y, a, CAR_VIS); drawUnderglow(g, c.L, t, 1, steady, low);
      if (c.boost) {
        M(0, 0); drawBoostTrail(g, c.L, c.ring, 0, 14, t, steady, low);
        const ex = exhaustsOf(c.id); g.globalCompositeOperation = 'lighter'; g.globalAlpha = NEON_GLOW;
        for (const [ex0, ey0] of ex) { M(x + (Math.cos(a) * ex0 - Math.sin(a) * ey0) * CAR_VIS, y + (Math.sin(a) * ex0 + Math.cos(a) * ey0) * CAR_VIS, a, ex.length > 1 ? 0.75 : 1); const Lf = 30 + (steady ? 0 : Math.sin(t * 40 + c.row) * 6); g.fillStyle = c.L.flame.outer; g.beginPath(); g.moveTo(0, -8); g.quadraticCurveTo(-Lf * 0.6, -6, -Lf, 0); g.quadraticCurveTo(-Lf * 0.6, 6, 0, 8); g.closePath(); g.fill(); g.fillStyle = c.L.flame.core; g.beginPath(); g.moveTo(0, -4); g.quadraticCurveTo(-Lf * 0.35, -3, -Lf * 0.55, 0); g.quadraticCurveTo(-Lf * 0.35, 3, 0, 4); g.closePath(); g.fill(); }
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      }
      const sp = spr.get(c.L, a);
      M(x, y, a - sp.ang, CAR_VIS); blitCar(g, sp, t, steady, low);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    window.__cars2.ready = true;
  });
}

function spin() {
  document.body.classList.add('fill');
  const cv = document.createElement('canvas'); cv.id = 'stage'; main.appendChild(cv);
  const show = new Showcase(), L = makeLook(car), R = RARITY[L.rarity];
  let t0 = null;
  cv.addEventListener('click', () => { t0 = null; });
  loop((t) => {
    if (t0 === null) t0 = t;
    const { d, w, h } = fit(cv), g = cv.getContext('2d');
    g.setTransform(d, 0, 0, d, 0, 0); g.fillStyle = '#07061a'; g.fillRect(0, 0, w, h); floor(g, w, h);
    const p = frozen !== null ? frozen : (t - t0) % (SPIN_IN_S + 3.5);
    g.translate(w / 2, h / 2 - 12);
    show.draw(g, car, L, p, t, { size: Math.min(w * 0.45, h * 0.5), steady, low });
    g.setTransform(d, 0, 0, d, 0, 0); g.textAlign = 'center'; g.fillStyle = R.light;
    g.font = '700 16px "Chakra Petch", system-ui, sans-serif'; g.fillText(`${carName(car)} · ${R.name} · spin-in ${p.toFixed(2)} s (tap to replay)`, w / 2, h - 26);
    window.__cars2.ready = true;
  });
}

function unlock() {
  document.body.classList.add('fill');
  bar.style.position = 'fixed'; bar.style.zIndex = '500';
  const open = () => showUnlock({ id: car, steady, low, sound: false, perk: Q.get('perk') || 'Perk text comes with the car stats.', onClose: () => setTimeout(open, 600) });
  open();
  requestAnimationFrame(() => setTimeout(() => { window.__cars2.ready = true; }, 50));
}

// Hunt Racers HUD, drawn on the race canvas in screen space (no DOM layout work per frame):
// position, lap + lap timer + best lap, speedometer + boost / drift meter, held item, weapon
// cooldown, minimap (leader highlighted for everyone), mode info, countdown, wrong-way, wrecked,
// banners, missile lock warning, feed, and the touch buttons. Safe-area aware.
import { FLAG } from './protocol.js';
import { DRIVERS, driftTier } from './physics.js';
import { WEAPONS, ITEMS } from './items.js';
import { SETTINGS } from '../settings.js';
import { INK } from './cars.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const TAU = Math.PI * 2;
const FONT = '"Lilita One", "Arial Black", sans-serif';
const ORD = (n) => (n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] || 'TH');
export const fmtTime = (s) => { if (s == null || !(s >= 0)) return '--:--.-'; const m = Math.floor(s / 60), r = s - m * 60; return `${m}:${r < 10 ? '0' : ''}${r.toFixed(2)}`; };
const TIER_COL = ['#ffffff', '#3a86ff', '#ff9f1c', '#c04dff'];

export function text(g, s, x, y, size, col, align = 'left', lw = 0) {
  g.font = `${size}px ${FONT}`; g.textAlign = align; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = lw || Math.max(3, size * 0.16); g.strokeStyle = INK;
  g.strokeText(s, x, y); g.fillStyle = col; g.fillText(s, x, y);
}
const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
const panel = (g, x, y, w, h, r = 10, fill = 'rgba(27,16,51,0.78)') => { rr(g, x, y, w, h, r); g.fillStyle = fill; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke(); };

// small vector icons for the items (size ~ s px)
export function itemIcon(g, id, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s / 40, s / 40); g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = 3; g.strokeStyle = INK;
  switch (id) {
    case 'missile': g.rotate(-0.6); g.fillStyle = '#e8e2d2'; g.beginPath(); g.moveTo(16, 0); g.lineTo(8, -6); g.lineTo(-12, -6); g.lineTo(-12, 6); g.lineTo(8, 6); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#ff3b3b'; g.beginPath(); g.moveTo(16, 0); g.lineTo(8, -6); g.lineTo(8, 6); g.closePath(); g.fill(); for (const k of [-1, 1]) { g.beginPath(); g.moveTo(-6, k * 6); g.lineTo(-14, k * 13); g.lineTo(-14, k * 6); g.closePath(); g.fill(); g.stroke(); } g.fillStyle = '#ffb347'; g.beginPath(); g.moveTo(-12, -3); g.lineTo(-20, 0); g.lineTo(-12, 3); g.fill(); break;
    case 'oil': g.fillStyle = '#1a1622'; g.beginPath(); g.ellipse(0, 6, 17, 9, 0, 0, TAU); g.fill(); g.stroke(); g.beginPath(); g.moveTo(0, -16); g.quadraticCurveTo(9, -4, 0, 2); g.quadraticCurveTo(-9, -4, 0, -16); g.fill(); g.stroke(); g.fillStyle = '#c04dff'; g.beginPath(); g.ellipse(-5, 4, 6, 2.5, -0.3, 0, TAU); g.fill(); break;
    case 'shield': g.fillStyle = '#5ff4ff'; g.beginPath(); g.moveTo(0, -17); g.lineTo(14, -10); g.quadraticCurveTo(13, 9, 0, 17); g.quadraticCurveTo(-13, 9, -14, -10); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#e8ffff'; g.beginPath(); g.moveTo(0, -11); g.lineTo(8, -7); g.quadraticCurveTo(7, 5, 0, 10); g.closePath(); g.fill(); break;
    case 'rockets': for (const k of [-10, 0, 10]) { g.fillStyle = '#ffb347'; g.beginPath(); g.moveTo(k, -16); g.lineTo(k + 5, -7); g.lineTo(k + 5, 10); g.lineTo(k - 5, 10); g.lineTo(k - 5, -7); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#ff3b3b'; g.beginPath(); g.moveTo(k - 3, 11); g.lineTo(k, 17); g.lineTo(k + 3, 11); g.fill(); } break;
    case 'emp': g.fillStyle = '#3a86ff'; g.beginPath(); g.arc(0, 0, 15, 0, TAU); g.fill(); g.stroke(); g.strokeStyle = '#c9fbff'; g.lineWidth = 3; g.beginPath(); g.moveTo(3, -12); g.lineTo(-5, 1); g.lineTo(3, 1); g.lineTo(-3, 12); g.stroke(); break;
    case 'turbo': g.fillStyle = '#5ff4ff'; for (const k of [-9, 3]) { g.beginPath(); g.moveTo(k - 6, -14); g.lineTo(k + 8, 0); g.lineTo(k - 6, 14); g.lineTo(k - 1, 0); g.closePath(); g.fill(); g.stroke(); } break;
    case 'spikes': g.fillStyle = '#4a4d58'; g.fillRect(-17, -2, 34, 10); g.strokeRect(-17, -2, 34, 10); g.fillStyle = '#e8e2d2'; g.beginPath(); for (let k = -15; k < 14; k += 8) { g.moveTo(k, -2); g.lineTo(k + 4, -14); g.lineTo(k + 8, -2); } g.fill(); g.stroke(); break;
  }
  g.restore();
}
// the driver's weapon icon
export function weaponIcon(g, id, x, y, s, col) {
  g.save(); g.translate(x, y); g.scale(s / 40, s / 40); g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 4;
  switch (id) {
    case 'volt': g.beginPath(); g.moveTo(-14, -4); g.lineTo(-6, 6); g.lineTo(0, -6); g.lineTo(6, 6); g.lineTo(14, -4); g.stroke(); break;
    case 'brick': for (const r of [6, 12, 17]) { g.beginPath(); g.arc(0, 0, r, -1, 1); g.stroke(); } break;
    case 'wisp': g.beginPath(); g.moveTo(-16, 0); g.lineTo(16, 0); g.stroke(); g.beginPath(); g.moveTo(10, -6); g.lineTo(17, 0); g.lineTo(10, 6); g.stroke(); break;
    case 'dune': g.beginPath(); g.arc(0, 0, 10, 0, TAU); g.stroke(); g.beginPath(); g.arc(0, 0, 3.5, 0, TAU); g.fill(); break;
    case 'rook': g.beginPath(); g.arc(0, 4, 9, Math.PI, 0); g.stroke(); g.beginPath(); g.moveTo(0, 0); g.lineTo(13, -9); g.stroke(); g.beginPath(); g.moveTo(-12, 8); g.lineTo(12, 8); g.stroke(); break;
    case 'flicker': g.beginPath(); g.arc(-4, 6, 16, -1.4, -0.2); g.stroke(); g.beginPath(); g.moveTo(-14, 10); g.lineTo(14, -10); g.lineWidth = 2; g.stroke(); break;
  }
  g.restore();
}

export class Hud {
  constructor() {
    this.banners = []; // {text, sub, col, t, life}
    this.feed = []; // {text, col, t}
    this.roll = 0; // item roulette time left
    this.wrongT = 0;
    this.lastCount = 99;
    this.split = null; // {text, col, t}
  }
  banner(text, sub = '', col = '#ffd23f', life = 1.8) { this.banners.push({ text, sub, col, t: 0, life }); if (this.banners.length > 3) this.banners.shift(); }
  log(text, col = '#fff') { this.feed.push({ text, col, t: 0 }); if (this.feed.length > 4) this.feed.shift(); }

  draw(g, S) {
    const { W, H, SA, dpr, view, me, rc, ctrl, dt, t, mode } = S;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    const u = clamp(Math.min(H / 375, W / 667), 0.8, 1.6);
    const L = SA.l + 12, Tp = SA.t + 8;
    const car = view.cars.find((c) => c.me);
    const n = view.ranks.length || view.cars.length;
    const battle = mode === 'battle', trial = mode === 'trial';
    // -------- position + lap block (top left)
    if (me) {
      const rk = me.out || me.fin || me.rk || 1;
      text(g, String(rk), L, Tp + 24 * u, 46 * u, rk === 1 ? '#ffd23f' : '#ffffff', 'left', 6 * u);
      const w1 = g.measureText(String(rk)).width;
      text(g, ORD(rk), L + w1 + 2 * u, Tp + 14 * u, 18 * u, rk === 1 ? '#ffd23f' : '#ffffff');
      text(g, `/${n}`, L + w1 + 2 * u, Tp + 34 * u, 15 * u, '#c9b8ff');
      let y = Tp + 60 * u;
      if (battle) { text(g, `TAKEDOWNS ${me.k}`, L, y, 17 * u, '#ff9f43'); y += 20 * u; }
      else if (view.hud && view.hud.laps) {
        const lap = clamp(me.lap, 1, view.hud.laps);
        text(g, `LAP ${lap}/${view.hud.laps}`, L, y, 18 * u, lap === view.hud.laps ? '#ff9f43' : '#ffffff'); y += 20 * u;
        text(g, fmtTime(me.lt), L, y, 15 * u, '#ffffff'); y += 17 * u;
        text(g, `BEST ${me.bl ? fmtTime(me.bl) : '--'}`, L, y, 12 * u, '#c9b8ff'); y += 16 * u;
      } else if (mode === 'elim') { text(g, `${view.hud?.left ?? n} LEFT`, L, y, 17 * u, '#ffffff'); y += 20 * u; }
      // feed under the block
      for (let i = 0; i < this.feed.length; i++) {
        const f = this.feed[i]; f.t += dt;
        g.globalAlpha = clamp(3.5 - f.t, 0, 1);
        text(g, f.text, L, y + 4 * u + i * 16 * u, 12 * u, f.col);
      }
      g.globalAlpha = 1;
      while (this.feed.length && this.feed[0].t > 3.5) this.feed.shift();
    }
    // -------- item + weapon (top centre)
    const cx = W / 2, slot = 46 * u;
    if (me && mode !== 'trial') {
      const ix = cx - slot - 6 * u, iy = Tp;
      panel(g, ix, iy, slot, slot, 12 * u, me.item || this.roll > 0 ? 'rgba(106,42,110,0.9)' : 'rgba(27,16,51,0.7)');
      if (this.roll > 0) { this.roll -= dt; const ids = ['missile', 'oil', 'shield', 'rockets', 'emp', 'turbo', 'spikes']; itemIcon(g, ids[Math.floor(t * 18) % ids.length], ix + slot / 2, iy + slot / 2, slot * 0.66); }
      else if (me.item) itemIcon(g, me.item, ix + slot / 2, iy + slot / 2, slot * 0.7);
      if (ctrl.mode !== 'touch') text(g, 'K', ix + slot - 6 * u, iy + slot - 6 * u, 11 * u, '#c9b8ff', 'center');
      // weapon with a cooldown sweep
      const wid = rc.myDriver(), w = WEAPONS[wid], wx = cx + 6 * u + slot / 2, wy = Tp + slot / 2, r = slot / 2;
      const cd = me.em > 0 ? 1 : w ? clamp(me.wc / w.cd, 0, 1) : 0;
      g.beginPath(); g.arc(wx, wy, r, 0, TAU); g.fillStyle = cd > 0 ? 'rgba(27,16,51,0.85)' : 'rgba(255,210,63,0.95)'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
      if (cd > 0) { g.beginPath(); g.moveTo(wx, wy); g.arc(wx, wy, r - 3, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - cd)); g.closePath(); g.fillStyle = 'rgba(255,210,63,0.55)'; g.fill(); }
      weaponIcon(g, wid, wx, wy, slot * 0.6, cd > 0 ? '#c9b8ff' : INK);
      if (me.em > 0) text(g, 'EMP', wx, wy + r + 8 * u, 11 * u, '#5ff4ff', 'center');
      else if (ctrl.mode !== 'touch') text(g, 'J', wx + r - 4 * u, wy + r - 4 * u, 11 * u, '#c9b8ff', 'center');
    }
    // -------- mode info pill (under the slots)
    let pill = null, pillCol = '#ffffff';
    const md = view.hud || {};
    if (mode === 'elim' && md.nx != null && view.countdown <= 0) { pill = `KNOCKOUT IN ${Math.ceil(md.nx)}`; pillCol = md.nx < 5 ? '#ff5f5f' : '#ffffff'; }
    else if (battle && md.tl != null) { const s = Math.ceil(md.tl); pill = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; pillCol = md.tl < 15 ? '#ff5f5f' : '#ffffff'; }
    else if (md.ft != null) { pill = `FINISH CLOSES ${Math.ceil(md.ft)}`; pillCol = '#ff9f43'; }
    else if (trial && S.bestTime) { pill = `BEST ${fmtTime(S.bestTime)}`; pillCol = '#c9b8ff'; }
    if (pill) {
      const y = mode === 'trial' ? Tp + 14 * u : Tp + slot + 16 * u;
      g.font = `${15 * u}px ${FONT}`; const w = g.measureText(pill).width + 22 * u;
      panel(g, cx - w / 2, y - 12 * u, w, 24 * u, 12 * u);
      text(g, pill, cx, y, 15 * u, pillCol, 'center');
    }
    if (this.split) {
      this.split.t += dt;
      g.globalAlpha = clamp(3 - this.split.t, 0, 1);
      text(g, this.split.text, cx, Tp + (trial ? 46 : slot + 44) * u, 18 * u, this.split.col, 'center');
      g.globalAlpha = 1;
      if (this.split.t > 3) this.split = null;
    }
    // -------- minimap (top right)
    this.minimap(g, S, u, car);
    // -------- speedometer + boost / drift meter (bottom centre; the credit sits just below)
    if (car && !(car.f & FLAG.DEAD)) {
      const spd = car.spd, top = DRIVERS[rc.myDriver()]?.top || 800;
      const gx = cx, gy = H - SA.b - 40 * u, R = 27 * u;
      g.beginPath(); g.arc(gx, gy, R + 4 * u, Math.PI * 0.8, Math.PI * 2.2); g.lineWidth = 9 * u; g.strokeStyle = INK; g.lineCap = 'round'; g.stroke();
      g.beginPath(); g.arc(gx, gy, R + 4 * u, Math.PI * 0.8, Math.PI * 0.8 + Math.PI * 1.4 * clamp(spd / (top * 1.4), 0, 1)); g.lineWidth = 5 * u;
      g.strokeStyle = car.f & FLAG.BOOST ? '#5ff4ff' : spd > top * 0.95 ? '#ff9f43' : '#ffd23f'; g.stroke(); g.lineCap = 'butt';
      text(g, String(Math.round(spd / 8)), gx, gy - 2 * u, 20 * u, '#ffffff', 'center');
      text(g, 'KM/H', gx, gy + 13 * u, 8 * u, '#c9b8ff', 'center', 2.5);
      // drift charge (tier colours) or boost left
      const dc = rc.car && car.predicted ? rc.car.dc : 0, tier = driftTier(dc), bw = 92 * u, bh = 7 * u, bx = gx - bw / 2, by = gy + R * 0.9 + 2 * u;
      void by;
      if (rc.car && (rc.car.drift || rc.car.boostT > 0)) {
        const k = rc.car.drift ? clamp(dc / 2.2, 0, 1) : clamp(rc.car.boostT / 1.6, 0, 1);
        const yy = gy - R - 18 * u;
        rr(g, bx, yy, bw, bh, bh / 2); g.fillStyle = 'rgba(27,16,51,0.8)'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = INK; g.stroke();
        if (k > 0) { rr(g, bx + 1.5, yy + 1.5, (bw - 3) * k, bh - 3, (bh - 3) / 2); g.fillStyle = rc.car.drift ? TIER_COL[tier] : '#5ff4ff'; g.fill(); }
        if (rc.car.drift) for (const f of [0.7 / 2.2, 1.4 / 2.2]) { g.fillStyle = INK; g.fillRect(bx + bw * f - 1, yy, 2, bh); }
      }
    }
    // -------- touch buttons
    if (ctrl.mode === 'touch') this.buttons(g, S, u);
    this.menuButton(g, S);
    // -------- centre overlays
    this.center(g, S, u, car);
  }

  minimap(g, S, u, car) {
    const { W, SA, dpr, view, art } = S;
    const size = Math.round(clamp(S.H * 0.34, 96, 180));
    const m = art.minimap(size, dpr), x = W - SA.r - 56 - size, y = SA.t + 6;
    g.drawImage(m.cv, x, y, size, size);
    const k = m.k, ox = x + m.ox, oy = y + m.oy;
    for (const c of view.cars) {
      if (c.f & FLAG.DEAD || c.me) continue;
      const px = ox + c.x * k, py = oy + c.y * k;
      g.beginPath(); g.arc(px, py, 3.2, 0, TAU); g.fillStyle = DRIVERS[S.rc.roster.get(c.id)?.driver]?.color || '#fff'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = INK; g.stroke();
    }
    // the leader (bounty) is shown to everyone
    const ld = view.leader ? view.cars.find((c) => c.id === view.leader) : null;
    if (ld) {
      const px = ox + ld.x * k, py = oy + ld.y * k, pr = SETTINGS.reduceFlash ? 7 : 6 + Math.sin(S.t * 6) * 1.5;
      g.beginPath(); g.arc(px, py, pr, 0, TAU); g.lineWidth = 2.5; g.strokeStyle = '#ffd23f'; g.stroke();
      g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(px - 5, py - 7); g.lineTo(px - 5, py - 12); g.lineTo(px - 2, py - 9); g.lineTo(px, py - 13); g.lineTo(px + 2, py - 9); g.lineTo(px + 5, py - 12); g.lineTo(px + 5, py - 7); g.closePath(); g.fill(); g.lineWidth = 1.2; g.strokeStyle = INK; g.stroke();
    }
    if (car) {
      const px = ox + car.x * k, py = oy + car.y * k;
      g.save(); g.translate(px, py); g.rotate(car.a);
      g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, -5); g.lineTo(-3, 0); g.lineTo(-5, 5); g.closePath(); g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = 2; g.strokeStyle = INK; g.stroke();
      g.restore();
    }
  }

  menuButton(g, S) {
    const b = S.ctrl.btn.menu;
    g.beginPath(); g.arc(b.x, b.y, b.r, 0, TAU); g.fillStyle = 'rgba(27,16,51,0.75)'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
    g.fillStyle = '#fff'; g.fillRect(b.x - 6, b.y - 7, 4, 14); g.fillRect(b.x + 2, b.y - 7, 4, 14);
  }

  buttons(g, S, u) {
    const { ctrl, me, rc } = S, b = ctrl.btn;
    const btn = (B, label, col, icon) => {
      g.beginPath(); g.arc(B.x, B.y, B.r, 0, TAU);
      g.fillStyle = B.down ? col : 'rgba(27,16,51,0.55)'; g.fill();
      g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
      g.beginPath(); g.arc(B.x, B.y, B.r - 4, 0, TAU); g.lineWidth = 2.5; g.strokeStyle = col; g.globalAlpha = 0.85; g.stroke(); g.globalAlpha = 1;
      if (icon) icon(); else text(g, label, B.x, B.y, Math.max(12, B.r * 0.42), B.down ? INK === col ? '#fff' : '#ffffff' : col, 'center');
    };
    const tier = rc.car ? driftTier(rc.car.dc) : 0;
    btn(b.drift, 'DRIFT', rc.car && rc.car.drift ? TIER_COL[tier] : '#ffd23f');
    btn(b.brake, 'BRAKE', '#ff5f5f');
    // FIRE: weapon icon + cooldown sweep
    const w = WEAPONS[rc.myDriver()], cd = me ? (me.em > 0 ? 1 : w ? clamp(me.wc / w.cd, 0, 1) : 0) : 0;
    btn(b.fire, 'FIRE', cd > 0 ? '#8a7aa8' : '#ff9f43', () => {
      weaponIcon(g, rc.myDriver(), b.fire.x, b.fire.y - b.fire.r * 0.18, b.fire.r * 0.8, cd > 0 ? '#8a7aa8' : '#ff9f43');
      text(g, 'FIRE', b.fire.x, b.fire.y + b.fire.r * 0.42, Math.max(10, b.fire.r * 0.3), cd > 0 ? '#8a7aa8' : '#ffffff', 'center');
      if (cd > 0) { g.beginPath(); g.arc(b.fire.x, b.fire.y, b.fire.r - 2, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - cd)); g.lineWidth = 5; g.strokeStyle = '#ff9f43'; g.stroke(); }
    });
    btn(b.item, 'ITEM', me && me.item ? '#c04dff' : '#8a7aa8', () => {
      if (me && me.item) itemIcon(g, me.item, b.item.x, b.item.y - b.item.r * 0.1, b.item.r * 1.05);
      else text(g, 'ITEM', b.item.x, b.item.y, Math.max(10, b.item.r * 0.36), '#8a7aa8', 'center');
    });
    // steer stick (where the thumb is) or a hint where to put it
    const s = ctrl.stick;
    if (s.id != null) {
      const m = s.max;
      rr(g, s.ox - m - 16, s.oy - 18, (m + 16) * 2, 36, 18); g.fillStyle = 'rgba(27,16,51,0.45)'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
      g.beginPath(); g.arc(s.ox + s.v * m, s.oy, 24, 0, TAU); g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
    } else if (S.view.countdown > 0 || S.t < 8) {
      const x = SETTINGS.leftHanded ? S.W - S.SA.r - 110 * u : S.SA.l + 110 * u, y = S.H - S.SA.b - 70 * u;
      g.globalAlpha = 0.55;
      rr(g, x - 70 * u, y - 16 * u, 140 * u, 32 * u, 16 * u); g.fillStyle = 'rgba(27,16,51,0.5)'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
      text(g, '◀  STEER  ▶', x, y, 14 * u, '#ffffff', 'center');
      g.globalAlpha = 1;
    }
  }

  center(g, S, u, car) {
    const { W, H, view, me, dt, t, renderer } = S;
    const cx = W / 2, cy = H * 0.4;
    // countdown 3-2-1-GO
    const cd = view.countdown;
    if (cd > 0 || (view.time >= 0 && view.time < 0.8)) {
      const n = cd > 0 ? Math.ceil(cd) : 0, f = cd > 0 ? cd - Math.floor(cd) : 1 - view.time / 0.8;
      const s = SETTINGS.reduceFlash ? 1 : 1 + (cd > 0 ? f * 0.5 : (1 - f) * 0.4);
      g.globalAlpha = cd > 0 ? 1 : clamp(f * 1.4, 0, 1);
      text(g, n ? String(n) : 'GO!', cx, cy, 92 * u * s, n ? '#ffffff' : '#5ef2c6', 'center', 10 * u);
      g.globalAlpha = 1;
    }
    // wrong way
    if (S.wrong) { const k = SETTINGS.reduceFlash ? 1 : 0.6 + 0.4 * Math.sin(t * 10); g.globalAlpha = k; text(g, 'WRONG WAY', cx, cy, 40 * u, '#ff5f5f', 'center', 7 * u); text(g, '↻ turn around', cx, cy + 32 * u, 15 * u, '#ffffff', 'center'); g.globalAlpha = 1; }
    // wrecked
    if (me && me.rt > 0 && !me.out) {
      panel(g, cx - 130 * u, cy - 40 * u, 260 * u, 80 * u, 18 * u, 'rgba(27,16,51,0.82)');
      text(g, 'WRECKED', cx, cy - 12 * u, 34 * u, '#ff5f5f', 'center', 6 * u);
      text(g, `back in ${Math.ceil(me.rt)}`, cx, cy + 20 * u, 18 * u, '#ffffff', 'center');
    }
    if (me && me.out) text(g, `KNOCKED OUT · ${me.out}${ORD(me.out).toLowerCase()}`, cx, H * 0.2, 22 * u, '#ff9f43', 'center');
    if (me && me.fin && view.cars.length) text(g, `FINISHED ${me.fin}${ORD(me.fin)}`, cx, H * 0.2, 26 * u, '#ffd23f', 'center');
    // missile lock warning
    if (renderer.threat > 0 && !(car && car.f & FLAG.DEAD)) {
      const k = SETTINGS.reduceFlash ? 1 : Math.sin(t * 16) > 0 ? 1 : 0.4;
      g.globalAlpha = k; text(g, '⚠ MISSILE LOCKED', cx, H * 0.3, 20 * u, '#ff3b3b', 'center', 5 * u); g.globalAlpha = 1;
      if (!SETTINGS.reduceFlash) { g.lineWidth = 10; g.strokeStyle = `rgba(255,40,40,${0.25 * k * clamp(renderer.threat, 0, 1)})`; g.strokeRect(5, 5, W - 10, H - 10); }
    }
    // banners
    let by = H * 0.22;
    for (let i = 0; i < this.banners.length; i++) {
      const b = this.banners[i]; b.t += dt;
      const f = b.t / b.life, k = clamp(Math.min(b.t * 6, (1 - f) * 4), 0, 1);
      g.globalAlpha = k;
      const s = SETTINGS.reduceFlash ? 1 : 1 + clamp(0.3 - b.t, 0, 0.3);
      text(g, b.text, cx, by, 24 * u * s, b.col, 'center', 5 * u);
      if (b.sub) text(g, b.sub, cx, by + 21 * u, 13 * u, '#ffffff', 'center');
      by += (b.sub ? 42 : 32) * u;
      g.globalAlpha = 1;
    }
    for (let i = this.banners.length - 1; i >= 0; i--) if (this.banners[i].t > this.banners[i].life) this.banners.splice(i, 1);
  }
}
export { ITEMS };

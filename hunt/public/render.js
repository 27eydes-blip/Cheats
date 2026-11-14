// All canvas drawing. Chunky cartoon look: bold dark outlines, bright flat fills.
import { BRAWLERS, BRAWLER_IDS, TILE, PLAYER_R, WALL, BUSH, CRATE, WATER, CRATE_HP, SUPPLY_HP, HUB, worldKeyAt, attackDirs } from './shared.js';
import { STICK_R } from './input.js';

export const INK = '#1b1033';
export const FONT = '"Lilita One", "Arial Black", system-ui, sans-serif';

export function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

export function outlinedText(ctx, txt, x, y, size, fill = '#fff', stroke = INK, align = 'center') {
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size * 0.28);
  ctx.strokeStyle = stroke;
  ctx.strokeText(txt, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(txt, x, y);
}

const hash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

// ---------------------------------------------------------------- world themes
// Each world (shared.js WORLDS) gets a palette and a decoration painter.
export const THEMES = {
  meadow: {
    groundA: '#8ee05e', groundB: '#82d653', tuft: 'rgba(40,120,40,0.35)', wallTop: '#a48ff0', wallSide: '#5d47a8',
    borderTop: '#6c58b8', borderSide: '#3d2c70', bush: '#2f9e44', bushHi: '#51cf66', water: '#4cc9f0', waterHi: '#a5e9ff', void: '#2b1d55',
  },
  city: {
    groundA: '#8c93a8', groundB: '#858ca1', tuft: 'rgba(255,255,255,0.18)', wallTop: '#4fd1c5', wallSide: '#2c7a7b',
    borderTop: '#5a5f7a', borderSide: '#33364d', bush: '#3aa655', bushHi: '#6fdc7e', water: '#4cc9f0', waterHi: '#a5e9ff', void: '#1e2033',
    deco: (ctx, x, y, h) => {
      if ((h & 15) === 0) { ctx.fillStyle = 'rgba(255,230,90,0.8)'; ctx.fillRect(x + 6, y + 22, 38, 6); } // lane paint
      else if ((h & 31) === 1) { ctx.fillStyle = 'rgba(40,40,60,0.35)'; ctx.beginPath(); ctx.arc(x + 25, y + 25, 9, 0, 7); ctx.fill(); } // manhole
    },
    wallDeco: (ctx, x, y, h) => {
      ctx.fillStyle = (h & 3) ? '#ffe66d' : '#2c7a7b';
      ctx.fillRect(x + 9, y - 6, 9, 8); ctx.fillStyle = (h & 4) ? '#ff6bd6' : '#2c7a7b'; ctx.fillRect(x + 29, y - 6, 9, 8);
    },
  },
  forest: {
    groundA: '#5fb84a', groundB: '#57ad43', tuft: 'rgba(20,80,20,0.4)', wallTop: '#9c7a54', wallSide: '#5e4630',
    borderTop: '#4a7a3a', borderSide: '#2a4a22', bush: '#1f7a35', bushHi: '#3fae55', water: '#3aa7c9', waterHi: '#8fe0f5', void: '#16301c',
    deco: (ctx, x, y, h) => {
      if ((h & 15) === 2) { ctx.fillStyle = '#e8590c'; ctx.beginPath(); ctx.arc(x + 20, y + 30, 5, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(x + 18, y + 28, 2, 2); } // mushroom
      else if ((h & 15) === 3) { ctx.fillStyle = '#b5651d'; ctx.save(); ctx.translate(x + 30, y + 20); ctx.rotate(h % 6); ctx.fillRect(-6, -2, 12, 4); ctx.restore(); } // leaf
    },
  },
  desert: {
    groundA: '#ecc77e', groundB: '#e4bd72', tuft: 'rgba(160,110,40,0.35)', wallTop: '#e09a5a', wallSide: '#a35f2c',
    borderTop: '#c47d45', borderSide: '#7a4320', bush: '#8a9a3a', bushHi: '#b5c25a', water: '#2ec4c4', waterHi: '#9ff5ee', void: '#4a2a1a',
    deco: (ctx, x, y, h) => {
      if ((h & 31) === 4) { ctx.strokeStyle = '#2f7a3a'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x + 25, y + 38); ctx.lineTo(x + 25, y + 14); ctx.moveTo(x + 25, y + 26); ctx.lineTo(x + 16, y + 22); ctx.stroke(); }
    },
  },
  frozen: {
    groundA: '#eef6ff', groundB: '#e2eefb', tuft: 'rgba(120,160,210,0.35)', wallTop: '#b9e4ff', wallSide: '#6aa8d8',
    borderTop: '#8fb8d8', borderSide: '#4a7aa0', bush: '#2e8b6b', bushHi: '#e8fbff', water: '#9fd8f0', waterHi: '#ffffff', void: '#1d2b44',
    deco: (ctx, x, y, h) => {
      if ((h & 15) === 5) { ctx.fillStyle = 'rgba(150,200,240,0.55)'; ctx.beginPath(); ctx.ellipse(x + 25, y + 25, 16, 7, 0, 0, 7); ctx.fill(); }
    },
  },
};
export const theme = (key) => THEMES[key] || THEMES.meadow;

function visRange(map, x0, y0, x1, y1) {
  return [Math.max(0, Math.floor(x0 / TILE) - 1), Math.max(0, Math.floor(y0 / TILE) - 1),
    Math.min(map.gw - 1, Math.floor(x1 / TILE) + 1), Math.min(map.gh - 1, Math.floor(y1 / TILE) + 1)];
}

export function drawGround(ctx, map, x0, y0, x1, y1, t) {
  const th0 = theme(worldKeyAt(map, (x0 + x1) / 2, (y0 + y1) / 2));
  ctx.fillStyle = th0.void;
  ctx.fillRect(x0 - 10, y0 - 10, x1 - x0 + 20, y1 - y0 + 20);
  const [tx0, ty0, tx1, ty1] = visRange(map, x0, y0, x1, y1);
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
    const th = theme(worldKeyAt(map, x * TILE, y * TILE));
    ctx.fillStyle = (x + y) & 1 ? th.groundB : th.groundA;
    ctx.fillRect(x * TILE, y * TILE, TILE + 0.5, TILE + 0.5);
  }
  ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
    const h = hash(x, y);
    const th = theme(worldKeyAt(map, x * TILE, y * TILE));
    if (th.deco) th.deco(ctx, x * TILE, y * TILE, h, t);
    if ((h & 7) !== 0) continue;
    const px = x * TILE + 10 + (h >>> 3) % 30, py = y * TILE + 14 + (h >>> 7) % 26;
    ctx.strokeStyle = th.tuft;
    ctx.beginPath(); ctx.moveTo(px - 4, py); ctx.lineTo(px - 6, py - 7); ctx.moveTo(px, py); ctx.lineTo(px, py - 9); ctx.moveTo(px + 4, py); ctx.lineTo(px + 6, py - 7); ctx.stroke();
  }
  // water
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
    if (map.t[y * map.gw + x] !== WATER) continue;
    const th = theme(worldKeyAt(map, x * TILE, y * TILE));
    const open = (dx, dy) => map.t[(y + dy) * map.gw + x + dx] !== WATER;
    ctx.fillStyle = th.water;
    rr(ctx, x * TILE - (open(-1, 0) ? -3 : 1), y * TILE - (open(0, -1) ? -3 : 1), TILE + (open(-1, 0) ? -3 : 1) + (open(1, 0) ? -3 : 1), TILE + (open(0, -1) ? -3 : 1) + (open(0, 1) ? -3 : 1), 12);
    ctx.fill();
    if (open(0, -1)) { ctx.fillStyle = 'rgba(27,16,51,0.35)'; ctx.fillRect(x * TILE + 3, y * TILE + 3, TILE - 6, 5); }
    const w = Math.sin(t * 2 + x * 1.7 + y) * 6;
    ctx.strokeStyle = th.waterHi; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x * TILE + 12 + w, y * TILE + 26); ctx.lineTo(x * TILE + 26 + w, y * TILE + 26); ctx.stroke();
  }
  // hub safe zone
  if (map.kind === 'world' && Math.abs(HUB.x - (x0 + x1) / 2) < (x1 - x0) / 2 + HUB.r && Math.abs(HUB.y - (y0 + y1) / 2) < (y1 - y0) / 2 + HUB.r) {
    ctx.save();
    ctx.beginPath(); ctx.arc(HUB.x, HUB.y, HUB.r, 0, Math.PI * 2);
    ctx.fillStyle = '#c7b8ff'; ctx.fill();
    ctx.lineWidth = 10; ctx.strokeStyle = INK; ctx.stroke();
    ctx.setLineDash([26, 16]); ctx.lineDashOffset = -t * 20; ctx.lineWidth = 5; ctx.strokeStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(HUB.x, HUB.y, HUB.r - 20, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(HUB.x + Math.cos(a) * 150, HUB.y + Math.sin(a) * 150, 22, 0, 7); ctx.fillStyle = '#a48ff0'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
    }
    outlinedText(ctx, 'SAFE HUB', HUB.x, HUB.y - 20, 40, '#ffd23f');
    outlinedText(ctx, 'no damage · change brawler', HUB.x, HUB.y + 20, 18, '#fff');
    ctx.restore();
  }
}

export function drawBlocks(ctx, map, crateHp, x0, y0, x1, y1) {
  const [tx0, ty0, tx1, ty1] = visRange(map, x0, y0, x1, y1);
  const H = 12;
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const t = map.t[ty * map.gw + tx];
      if (t !== WALL && t !== CRATE) continue;
      const x = tx * TILE, y = ty * TILE;
      ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
      if (t === WALL) {
        const th = theme(worldKeyAt(map, x, y));
        const border = tx === 0 || ty === 0 || tx === map.gw - 1 || ty === map.gh - 1;
        ctx.fillStyle = border ? th.borderSide : th.wallSide;
        rr(ctx, x + 1, y - H + 4, TILE - 2, TILE + H - 4, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = border ? th.borderTop : th.wallTop;
        rr(ctx, x + 1, y - H, TILE - 2, TILE - 4, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        rr(ctx, x + 7, y - H + 5, TILE - 22, 6, 3); ctx.fill();
        if (th.wallDeco && !border) th.wallDeco(ctx, x, y, hash(tx, ty));
      } else {
        const raw = crateHp.get(ty * map.gw + tx) ?? CRATE_HP;
        const supply = raw < 0, hp = Math.abs(raw), max = supply ? SUPPLY_HP : CRATE_HP;
        ctx.fillStyle = supply ? '#1f6f8b' : '#8a4b1f';
        rr(ctx, x + 3, y - H + 6, TILE - 6, TILE + H - 8, 5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = supply ? '#ffd23f' : '#d98c3f';
        rr(ctx, x + 3, y - H + 2, TILE - 6, TILE - 8, 5); ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + 9, y - H + 8); ctx.lineTo(x + TILE - 9, y + TILE - 16 - H + 8);
        ctx.moveTo(x + TILE - 9, y - H + 8); ctx.lineTo(x + 9, y + TILE - 16 - H + 8);
        ctx.lineWidth = 4; ctx.strokeStyle = supply ? '#1f6f8b' : '#8a4b1f'; ctx.stroke();
        if (hp < max * 0.66) {
          ctx.beginPath(); ctx.moveTo(x + 14, y - 4); ctx.lineTo(x + 22, y + 6); ctx.lineTo(x + 18, y + 14);
          if (hp < max * 0.33) { ctx.moveTo(x + 34, y - 6); ctx.lineTo(x + 28, y + 4); ctx.lineTo(x + 36, y + 12); }
          ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
        }
      }
    }
  }
}

export function drawBushes(ctx, map, x0, y0, x1, y1, me, t) {
  const [tx0, ty0, tx1, ty1] = visRange(map, x0, y0, x1, y1);
  const list = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (map.t[ty * map.gw + tx] === BUSH) list.push([tx, ty]);
  if (!list.length) return;
  ctx.save();
  for (const pass of [0, 1, 2]) {
    for (const [tx, ty] of list) {
      const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
      const th = theme(worldKeyAt(map, cx, cy));
      const near = me && Math.hypot(me.x - cx, me.y - cy) < 95;
      ctx.globalAlpha = near ? 0.45 : 1;
      const h = hash(tx, ty);
      const sway = Math.sin(t * 1.6 + tx + ty) * 1.2;
      ctx.beginPath();
      if (pass < 2) { ctx.arc(cx + sway, cy - 8, 30 + (pass === 0 ? 3 : -1) + (h & 3), 0, Math.PI * 2); ctx.fillStyle = pass === 0 ? INK : th.bush; ctx.fill(); }
      else {
        ctx.arc(cx - 8, cy - 18, 9, 0, Math.PI * 2);
        ctx.moveTo(cx + 18, cy - 4); ctx.arc(cx + 12, cy - 4, 6, 0, Math.PI * 2);
        ctx.fillStyle = th.bushHi; ctx.fill();
      }
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- brawlers
function eyes(ctx, facing, ox, oy, spread, size) {
  const fx = Math.cos(facing), fy = Math.sin(facing);
  for (const s of [-1, 1]) {
    const ex = ox + s * spread + fx * 5, ey = oy + fy * 3;
    ctx.beginPath(); ctx.ellipse(ex, ey, size * 0.8, size, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.arc(ex + fx * size * 0.35, ey + fy * size * 0.4, size * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = INK; ctx.fill();
  }
}

export function drawBrawler(ctx, id, x, y, facing, t, o = {}) {
  const B = BRAWLERS[id];
  ctx.save();
  ctx.translate(x, y);
  const sc = (o.scale || 1) * (o.size || 1);
  if (sc !== 1) ctx.scale(sc, sc);
  ctx.globalAlpha = o.alpha ?? 1;
  const bob = Math.sin(t * (o.moving ? 14 : 3)) * (o.moving ? 2.2 : 1);
  ctx.beginPath(); ctx.ellipse(0, 22, 26, 9, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20,10,40,0.28)'; ctx.fill();
  ctx.translate(0, bob);
  ctx.lineJoin = 'round';
  const behind = Math.sin(facing) < -0.3;
  const gun = () => {
    ctx.save(); ctx.rotate(facing);
    ctx.lineWidth = 4; ctx.strokeStyle = INK;
    if (id === 'volt') {
      rr(ctx, 10, -8, 32, 16, 6); ctx.fillStyle = B.accent; ctx.fill(); ctx.stroke();
      rr(ctx, 38, -5, 8, 10, 3); ctx.fillStyle = '#bde0ff'; ctx.fill(); ctx.stroke();
    } else if (id === 'brick') {
      rr(ctx, 12, -12, 36, 24, 5); ctx.fillStyle = '#4a4a5e'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(48, -4); ctx.lineTo(12, -4); ctx.moveTo(48, 4); ctx.lineTo(12, 4); ctx.lineWidth = 3; ctx.stroke();
    } else {
      rr(ctx, 8, -5, 52, 10, 4); ctx.fillStyle = B.accent; ctx.fill(); ctx.stroke();
      rr(ctx, 18, -9, 14, 6, 2); ctx.fillStyle = '#d9c8ff'; ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  };
  if (behind) gun();
  ctx.lineWidth = 4.5; ctx.strokeStyle = INK;
  const flash = o.flash > 0;
  if (id === 'volt') {
    ctx.beginPath(); ctx.moveTo(-9, -20); ctx.lineTo(-15, -36); ctx.moveTo(9, -20); ctx.lineTo(15, -36); ctx.lineWidth = 4; ctx.stroke();
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.arc(s * 15, -37, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = Math.sin(t * 10 + s) > 0 ? '#bde0ff' : B.accent; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI * 2);
    ctx.fillStyle = flash ? '#fff' : B.color; ctx.fill(); ctx.lineWidth = 4.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, 6); ctx.lineTo(-6, 15); ctx.lineTo(0, 15); ctx.lineTo(-4, 23); ctx.lineTo(7, 12); ctx.lineTo(1, 12); ctx.closePath();
    ctx.fillStyle = B.accent; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
    eyes(ctx, facing, 0, -6, 9, 7);
  } else if (id === 'brick') {
    rr(ctx, -29, -26, 58, 52, 14);
    ctx.fillStyle = flash ? '#fff' : B.color; ctx.fill(); ctx.lineWidth = 4.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-29, -8); ctx.lineTo(-29, -14); ctx.quadraticCurveTo(-29, -26, -15, -26); ctx.lineTo(15, -26); ctx.quadraticCurveTo(29, -26, 29, -14); ctx.lineTo(29, -8); ctx.closePath();
    ctx.fillStyle = B.accent; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(-5, -24, 10, 14); ctx.strokeRect(-5, -24, 10, 14);
    eyes(ctx, facing, 0, 0, 11, 6);
    ctx.beginPath(); ctx.moveTo(-18, -9); ctx.lineTo(-5, -5); ctx.moveTo(18, -9); ctx.lineTo(5, -5); ctx.lineWidth = 4; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-8, 15); ctx.lineTo(8, 15); ctx.lineWidth = 3.5; ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(-24, 4);
    ctx.quadraticCurveTo(-26, -30, 0, -32);
    ctx.quadraticCurveTo(26, -30, 24, 4);
    const w = Math.sin(t * 6) * 2;
    ctx.lineTo(24, 20);
    ctx.quadraticCurveTo(18, 14 + w, 12, 22);
    ctx.quadraticCurveTo(6, 14 - w, 0, 22);
    ctx.quadraticCurveTo(-6, 14 + w, -12, 22);
    ctx.quadraticCurveTo(-18, 14 - w, -24, 20);
    ctx.closePath();
    ctx.fillStyle = flash ? '#fff' : B.color; ctx.fill(); ctx.lineWidth = 4.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-25, -2); ctx.quadraticCurveTo(-27, -34, 0, -36); ctx.quadraticCurveTo(27, -34, 25, -2);
    ctx.quadraticCurveTo(0, -18, -25, -2); ctx.closePath();
    ctx.fillStyle = B.accent; ctx.fill(); ctx.stroke();
    const fx = Math.cos(facing) * 4, fy = Math.sin(facing) * 2;
    ctx.fillStyle = '#eaffff';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 8 + fx, -2 + fy, 4, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke(); }
  }
  if (!behind) gun();
  ctx.restore();
}

// BOUNTY glow / hunted target aura / spawn bubble / speed rush lines (drawn under the brawler)
export function drawAura(ctx, p, t) {
  const g = (p.glow || 0) / 100;
  if (p.fl & 32) { // hunted target
    ctx.beginPath(); ctx.arc(p.x, p.y, 46 + Math.sin(t * 8) * 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,40,70,0.28)'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = '#ff2846'; ctx.stroke();
  } else if (g > 0) {
    const r = 40 + g * 34;
    const grad = ctx.createRadialGradient(p.x, p.y, 10, p.x, p.y, r);
    grad.addColorStop(0, `rgba(255,214,60,${0.55 * g})`); grad.addColorStop(1, 'rgba(255,214,60,0)');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
  }
  if (p.fl & 64) { // rush
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    const a = p.facing + Math.PI;
    ctx.beginPath();
    for (let i = -1; i <= 1; i++) {
      const sx = p.x + Math.cos(a) * 30 + Math.cos(a + Math.PI / 2) * i * 14, sy = p.y + Math.sin(a) * 30 + Math.sin(a + Math.PI / 2) * i * 14;
      const L = 14 + ((t * 60 + i * 7) % 12);
      ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a) * L, sy + Math.sin(a) * L);
    }
    ctx.stroke();
  }
}
export function drawBubble(ctx, p, t) {
  if (!(p.fl & 16)) return;
  ctx.beginPath(); ctx.arc(p.x, p.y, 38, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(160,220,255,0.18)'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = `rgba(200,240,255,${0.6 + Math.sin(t * 10) * 0.3})`; ctx.stroke();
}

// ---------------------------------------------------------------- items
export function drawCube(ctx, x, y, t) {
  const b = Math.sin(t * 4 + x) * 4;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath(); ctx.ellipse(0, 14, 14, 5, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(20,10,40,0.3)'; ctx.fill();
  ctx.translate(0, b - 6);
  rr(ctx, -14, -14, 28, 28, 6); ctx.fillStyle = '#5be35b'; ctx.fill();
  ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(2, -9); ctx.lineTo(-6, 2); ctx.lineTo(0, 2); ctx.lineTo(-3, 10); ctx.lineTo(6, -2); ctx.lineTo(0, -2); ctx.closePath();
  ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
}
export function drawCrystal(ctx, x, y, t) {
  const b = Math.sin(t * 3 + y) * 4;
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.ellipse(0, 14, 11, 4, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(20,10,40,0.3)'; ctx.fill();
  ctx.translate(0, b - 8);
  ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(11, -4); ctx.lineTo(0, 14); ctx.lineTo(-11, -4); ctx.closePath();
  ctx.fillStyle = '#d65cff'; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(4, -4); ctx.lineTo(0, 14); ctx.fillStyle = '#f4b8ff'; ctx.fill();
  ctx.restore();
}

const BULLET_COL = { volt: ['#bde0ff', '#3a86ff'], brick: ['#ffe066', '#ff7b39'], wisp: ['#f3e8ff', '#8f5cff'] };
export function drawBullet(ctx, kind, x, y, ang) {
  const [c1, c2] = BULLET_COL[kind] || BULLET_COL.volt;
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.lineWidth = 3; ctx.strokeStyle = INK;
  if (kind === 'wisp') {
    rr(ctx, -22, -6, 36, 12, 6); ctx.fillStyle = c2; ctx.fill(); ctx.stroke();
    rr(ctx, -6, -3, 16, 6, 3); ctx.fillStyle = c1; ctx.fill();
  } else if (kind === 'brick') {
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fillStyle = c2; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(-1, -2, 3.5, 0, Math.PI * 2); ctx.fillStyle = c1; ctx.fill();
  } else {
    rr(ctx, -14, -7, 26, 14, 7); ctx.fillStyle = c2; ctx.fill(); ctx.stroke();
    rr(ctx, -6, -3.5, 14, 7, 3.5); ctx.fillStyle = c1; ctx.fill();
  }
  ctx.restore();
}

export function drawPoison(ctx, inset, size, x0, y0, x1, y1, t) {
  if (inset <= 0) return;
  const a = size - inset;
  ctx.save();
  ctx.fillStyle = 'rgba(70,200,90,0.42)';
  ctx.beginPath();
  ctx.rect(x0 - 50, y0 - 50, x1 - x0 + 100, y1 - y0 + 100);
  ctx.rect(inset, inset, a - inset, a - inset);
  ctx.fill('evenodd');
  ctx.setLineDash([22, 14]); ctx.lineDashOffset = -t * 40;
  ctx.lineWidth = 6; ctx.strokeStyle = '#d4ff4f';
  ctx.strokeRect(inset, inset, a - inset, a - inset);
  ctx.setLineDash([]);
  ctx.restore();
}

// helpers handed to event modules' draw()
export function eventHelpers(ctx, map, view) {
  return {
    map,
    visible: (x, y) => x > view.x0 - 80 && x < view.x1 + 80 && y > view.y0 - 80 && y < view.y1 + 80,
    warnTile(x, y, color, t) {
      ctx.globalAlpha = 0.45 + Math.sin(t * 10) * 0.25;
      ctx.lineWidth = 5; ctx.strokeStyle = color; rr(ctx, x - 22, y - 22, 44, 44, 10); ctx.stroke(); ctx.globalAlpha = 1;
    },
    flame(x, y, t) {
      for (let i = 0; i < 3; i++) {
        const fx = x + (i - 1) * 13, h = 22 + Math.sin(t * 12 + i * 2) * 7;
        ctx.beginPath(); ctx.moveTo(fx - 9, y + 10); ctx.quadraticCurveTo(fx - 8, y - h * 0.5, fx, y - h); ctx.quadraticCurveTo(fx + 8, y - h * 0.5, fx + 9, y + 10); ctx.closePath();
        ctx.fillStyle = i === 1 ? '#ffd23f' : '#ff6b2b'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
      }
    },
    pool(c, phase, t, kind) {
      if (!this.visible(c.x, c.y)) return;
      ctx.save();
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      if (phase === 'warn') {
        ctx.fillStyle = kind === 'lava' ? 'rgba(255,90,40,0.18)' : 'rgba(150,230,255,0.2)'; ctx.fill();
        ctx.setLineDash([16, 12]); ctx.lineDashOffset = -t * 30; ctx.lineWidth = 6;
        ctx.strokeStyle = kind === 'lava' ? '#ff4d2e' : '#8ee8ff'; ctx.stroke();
      } else if (kind === 'lava') {
        const g = ctx.createRadialGradient(c.x, c.y, c.r * 0.2, c.x, c.y, c.r);
        g.addColorStop(0, '#ffe066'); g.addColorStop(0.55, '#ff7b1c'); g.addColorStop(1, '#d6331c');
        ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.stroke();
        ctx.fillStyle = 'rgba(255,240,150,0.85)';
        for (let i = 0; i < 5; i++) { const a = t * 0.7 + i * 1.3, d = c.r * 0.55 * ((i * 37) % 10) / 10; ctx.beginPath(); ctx.arc(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, 5 + Math.sin(t * 5 + i) * 3, 0, 7); ctx.fill(); }
      } else {
        ctx.fillStyle = 'rgba(200,245,255,0.75)'; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = '#4a9fd0'; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(c.x - c.r * 0.4, c.y - c.r * 0.2); ctx.lineTo(c.x - c.r * 0.1, c.y - c.r * 0.5); ctx.moveTo(c.x + c.r * 0.1, c.y + c.r * 0.3); ctx.lineTo(c.x + c.r * 0.45, c.y); ctx.stroke();
      }
      ctx.restore();
    },
    target(x, y, t) {
      const r = 60 + Math.sin(t * 8) * 6;
      ctx.lineWidth = 6; ctx.strokeStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - r - 14, y); ctx.lineTo(x + r + 14, y); ctx.moveTo(x, y - r - 14); ctx.lineTo(x, y + r + 14); ctx.stroke();
    },
  };
}

export function drawAim(ctx, brawler, x, y, ang, kind) {
  const B = BRAWLERS[brawler];
  ctx.save();
  ctx.translate(x, y);
  if (kind === 'fire') {
    const a = B.attack;
    ctx.fillStyle = 'rgba(255,255,255,0.32)'; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2;
    ctx.beginPath();
    if (a.kind === 'spread') { ctx.moveTo(0, 0); ctx.arc(0, 0, a.range, ang - a.arc / 2 - 0.04, ang + a.arc / 2 + 0.04); ctx.closePath(); }
    else { ctx.rotate(ang); rr(ctx, PLAYER_R * 0.6, -a.radius - 4, a.range, (a.radius + 4) * 2, a.radius + 4); }
    ctx.fill(); ctx.stroke();
  } else {
    const s = B.super;
    ctx.fillStyle = 'rgba(255,210,63,0.35)'; ctx.strokeStyle = 'rgba(255,230,120,0.95)'; ctx.lineWidth = 3;
    ctx.beginPath();
    if (s.kind === 'dash') { ctx.rotate(ang); rr(ctx, 0, -s.radius * 0.7, s.dist, s.radius * 1.4, s.radius * 0.7); }
    else if (s.kind === 'slam') ctx.arc(0, 0, s.radius, 0, Math.PI * 2);
    else ctx.arc(0, 0, 60, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

export function drawStatus(ctx, p, isMe, t) {
  const y = p.y - 58 * (p.size || 1) - 4;
  const w = 74, h = 15;
  outlinedText(ctx, p.name, p.x, y - 16, 15, isMe ? '#b8ff6b' : (p.fl & 32) ? '#ff8a9a' : '#fff');
  rr(ctx, p.x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4, 7); ctx.fillStyle = INK; ctx.fill();
  const f = Math.max(0, Math.min(1, p.hp / p.mh));
  rr(ctx, p.x - w / 2, y - h / 2, w, h, 5); ctx.fillStyle = '#3a2a5e'; ctx.fill();
  if (f > 0) { rr(ctx, p.x - w / 2, y - h / 2, Math.max(8, w * f), h, 5); ctx.fillStyle = isMe ? '#4be06e' : '#ff4d5e'; ctx.fill(); }
  outlinedText(ctx, String(Math.ceil(p.hp)), p.x, y + 1, 12);
  if (p.cu > 0) {
    rr(ctx, p.x - w / 2 - 24, y - 10, 20, 20, 5); ctx.fillStyle = '#5be35b'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
    outlinedText(ctx, String(p.cu), p.x - w / 2 - 14, y + 1, 12);
  }
  if (p.bt > 0) { // bounty star
    const bx = p.x + w / 2 + 16;
    ctx.save(); ctx.translate(bx, y); ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i & 1 ? 6 : 13; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
    outlinedText(ctx, String(p.bt), bx, y + 1, 11, INK, '#ffd23f');
  }
  if (p.cr > 0) { drawCrystal(ctx, p.x - 52, y - 30, 0); outlinedText(ctx, String(p.cr), p.x - 38, y - 30, 14, '#f4b8ff'); }
  if (p.stun) for (let i = 0; i < 3; i++) { const a = t * 5 + (i * Math.PI * 2) / 3; outlinedText(ctx, '★', p.x + Math.cos(a) * 20, p.y - 40 + Math.sin(a) * 6, 14, '#ffe066'); }
}

export function drawAmmo(ctx, x, y, ammo, superReady, t) {
  const w = 22, h = 8, gap = 3, total = w * 3 + gap * 2;
  const sx = x - total / 2, sy = y + 36;
  rr(ctx, sx - 3, sy - 3, total + 6, h + 6, 5); ctx.fillStyle = INK; ctx.fill();
  for (let i = 0; i < 3; i++) {
    const f = Math.max(0, Math.min(1, ammo - i));
    rr(ctx, sx + i * (w + gap), sy, w, h, 3); ctx.fillStyle = '#4a3a6e'; ctx.fill();
    if (f > 0) { rr(ctx, sx + i * (w + gap), sy, w * f, h, 3); ctx.fillStyle = f >= 1 ? '#ff9f1c' : '#b86f12'; ctx.fill(); }
  }
  if (superReady) {
    ctx.beginPath(); ctx.arc(x, y, 34 + Math.sin(t * 8) * 3, 0, Math.PI * 2);
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,210,63,0.85)'; ctx.stroke();
  }
}

// ---------------------------------------------------------------- radar (screen space)
// pings: [{x,y,bt,age,target}], me: {x,y}, extras: {poison:{inset,size}, hub, zones, range}
export function drawRadar(ctx, cx, cy, R, me, pings, extras, t) {
  const range = extras.range || 1600, k = R / range;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(27,16,51,0.72)'; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
  ctx.clip();
  ctx.strokeStyle = 'rgba(160,140,255,0.35)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.5, 0, 7); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
  const P = (x, y) => [cx + (x - me.x) * k, cy + (y - me.y) * k];
  if (extras.poison && extras.poison.inset > 0) {
    const { inset, size } = extras.poison; const [a, b] = P(inset, inset);
    ctx.strokeStyle = '#7dff5a'; ctx.lineWidth = 2; ctx.strokeRect(a, b, (size - 2 * inset) * k, (size - 2 * inset) * k);
  }
  if (extras.hub) { const [a, b] = P(HUB.x, HUB.y); ctx.beginPath(); ctx.arc(a, b, HUB.r * k, 0, 7); ctx.fillStyle = 'rgba(199,184,255,0.5)'; ctx.fill(); }
  if (extras.zones) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([4, 4]);
    const [a, b] = P(2000, 0), [c, d] = P(0, 2000), [e] = P(2000, 4000), [, f] = P(4000, 2000);
    ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(e, P(2000, 4000)[1]); ctx.moveTo(c, d); ctx.lineTo(P(4000, 2000)[0], f); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.sweep = (t * 2) % (Math.PI * 2);
  const g = ctx.createConicGradient ? ctx.createConicGradient(ctx.sweep, cx, cy) : null;
  if (g) { g.addColorStop(0, 'rgba(120,255,180,0.25)'); g.addColorStop(0.12, 'rgba(120,255,180,0)'); ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, R * 2, R * 2); }
  for (const p of pings) {
    let [x, y] = P(p.x, p.y);
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
    if (d > R - 6) { x = cx + (dx / d) * (R - 6); y = cy + (dy / d) * (R - 6); }
    const a = Math.max(0, 1 - p.age / 3);
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.arc(x, y, 4 + Math.min(5, p.bt) + (1 - a) * 6, 0, 7);
    ctx.fillStyle = p.target ? '#ff2846' : '#ffd23f'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 7); ctx.fillStyle = '#b8ff6b'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- screen-space controls
export function drawControls(ctx, input, superC, brawler, t, safe) {
  if (!input.isTouch) return;
  ctx.save();
  const m = input.moveT;
  if (m) {
    ctx.beginPath(); ctx.arc(m.bx, m.by, STICK_R, 0, Math.PI * 2); ctx.fillStyle = 'rgba(27,16,51,0.35)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.stroke();
    let dx = m.x - m.bx, dy = m.y - m.by; const d = Math.hypot(dx, dy);
    if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
    ctx.beginPath(); ctx.arc(m.bx + dx, m.by + dy, 28, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
  } else {
    ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.arc(110, input.H - 105, STICK_R, 0, Math.PI * 2); ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (safe) ctx.globalAlpha = 0.35;
  const a = input.aimT;
  const showA = a && a.kind === 'fire' ? a : null;
  const ab = showA ? { x: a.bx, y: a.by } : input.atkHint;
  ctx.beginPath(); ctx.arc(ab.x, ab.y, STICK_R, 0, Math.PI * 2);
  ctx.fillStyle = showA ? 'rgba(255,77,94,0.3)' : 'rgba(255,77,94,0.16)'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.stroke();
  let kx = 0, ky = 0;
  if (showA) { kx = a.x - a.bx; ky = a.y - a.by; const d = Math.hypot(kx, ky); if (d > STICK_R) { kx *= STICK_R / d; ky *= STICK_R / d; } }
  ctx.beginPath(); ctx.arc(ab.x + kx, ab.y + ky, 30, 0, Math.PI * 2); ctx.fillStyle = '#ff4d5e'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
  outlinedText(ctx, '✦', ab.x + kx, ab.y + ky + 1, 22);

  const sb = input.superBtn;
  const sup = a && a.kind === 'super' ? a : null;
  const ready = superC >= 1;
  let sx = 0, sy = 0;
  if (sup) { sx = sup.x - sup.bx; sy = sup.y - sup.by; const d = Math.hypot(sx, sy); if (d > STICK_R) { sx *= STICK_R / d; sy *= STICK_R / d; } }
  if (sup) { ctx.beginPath(); ctx.arc(sb.x, sb.y, STICK_R, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,210,63,0.22)'; ctx.fill(); }
  ctx.beginPath(); ctx.arc(sb.x + sx, sb.y + sy, sb.r, 0, Math.PI * 2);
  ctx.fillStyle = ready ? '#ffd23f' : 'rgba(60,45,100,0.85)'; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
  if (!ready) {
    ctx.beginPath(); ctx.arc(sb.x, sb.y, sb.r - 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * superC);
    ctx.lineWidth = 7; ctx.strokeStyle = '#ffd23f'; ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(sb.x + sx, sb.y + sy, sb.r + 6 + Math.sin(t * 7) * 3, 0, Math.PI * 2);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,230,120,0.8)'; ctx.stroke();
  }
  outlinedText(ctx, 'SUPER', sb.x + sx, sb.y + sy + 1, 13, ready ? '#fff' : '#cfc3ff');
  ctx.restore();
}

export function drawPortrait(canvas, id) {
  const ctx = canvas.getContext('2d');
  const d = Math.min(2, devicePixelRatio || 1);
  canvas.width = canvas.clientWidth * d; canvas.height = canvas.clientHeight * d;
  let t = Math.random() * 10;
  const loop = () => {
    if (!canvas.isConnected) return;
    t += 1 / 60;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBrawler(ctx, id, canvas.clientWidth / 2, canvas.clientHeight / 2 + 8, 0.35 + Math.sin(t) * 0.25, t, { scale: Math.min(1.8, canvas.clientHeight / 52) });
    requestAnimationFrame(loop);
  };
  loop();
}

export { BRAWLER_IDS, attackDirs };

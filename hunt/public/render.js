// All canvas drawing. Chunky cartoon look: bold dark outlines, bright flat fills.
import { BRAWLERS, BRAWLER_IDS, TILE, GRID, MAP_SIZE, PLAYER_R, WALL, BUSH, CRATE, CRATE_HP, attackDirs } from './shared.js';
import { STICK_R } from './input.js';

export const INK = '#1b1033';
export const FONT = '"Lilita One", "Arial Black", system-ui, sans-serif';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

function outlinedText(ctx, txt, x, y, size, fill = '#fff', stroke = INK, align = 'center') {
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

// ---------------------------------------------------------------- brawlers
function eyes(ctx, facing, ox, oy, spread, size, pupil = INK, white = '#fff') {
  const fx = Math.cos(facing), fy = Math.sin(facing);
  for (const s of [-1, 1]) {
    const ex = ox + s * spread + fx * 5, ey = oy + fy * 3;
    ctx.beginPath(); ctx.ellipse(ex, ey, size * 0.8, size, 0, 0, Math.PI * 2);
    ctx.fillStyle = white; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.arc(ex + fx * size * 0.35, ey + fy * size * 0.4, size * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = pupil; ctx.fill();
  }
}

function weapon(ctx, facing, draw) {
  ctx.save();
  ctx.rotate(facing);
  draw();
  ctx.restore();
}

export function drawBrawler(ctx, id, x, y, facing, t, o = {}) {
  const B = BRAWLERS[id];
  ctx.save();
  ctx.translate(x, y);
  if (o.scale) ctx.scale(o.scale, o.scale);
  ctx.globalAlpha = o.alpha ?? 1;
  const bob = Math.sin(t * (o.moving ? 14 : 3)) * (o.moving ? 2.2 : 1);
  // shadow
  ctx.beginPath(); ctx.ellipse(0, 22, 26, 9, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20,10,40,0.28)'; ctx.fill();
  ctx.translate(0, bob);
  ctx.lineJoin = 'round';
  const behind = Math.sin(facing) < -0.3; // weapon drawn behind body when aiming "up"
  const gun = () => weapon(ctx, facing, () => {
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
  });
  if (behind) gun();

  ctx.lineWidth = 4.5; ctx.strokeStyle = INK;
  const flash = o.flash > 0;
  if (id === 'volt') {
    // antennae
    ctx.beginPath(); ctx.moveTo(-9, -20); ctx.lineTo(-15, -36); ctx.moveTo(9, -20); ctx.lineTo(15, -36); ctx.lineWidth = 4; ctx.stroke();
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.arc(s * 15, -37, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = Math.sin(t * 10 + s) > 0 ? '#bde0ff' : B.accent; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI * 2);
    ctx.fillStyle = flash ? '#fff' : B.color; ctx.fill(); ctx.lineWidth = 4.5; ctx.stroke();
    // belly bolt
    ctx.beginPath(); ctx.moveTo(3, 6); ctx.lineTo(-6, 15); ctx.lineTo(0, 15); ctx.lineTo(-4, 23); ctx.lineTo(7, 12); ctx.lineTo(1, 12); ctx.closePath();
    ctx.fillStyle = B.accent; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
    eyes(ctx, facing, 0, -6, 9, 7);
  } else if (id === 'brick') {
    rr(ctx, -29, -26, 58, 52, 14);
    ctx.fillStyle = flash ? '#fff' : B.color; ctx.fill(); ctx.lineWidth = 4.5; ctx.stroke();
    // helmet
    ctx.beginPath(); ctx.moveTo(-29, -8); ctx.lineTo(-29, -14); ctx.quadraticCurveTo(-29, -26, -15, -26); ctx.lineTo(15, -26); ctx.quadraticCurveTo(29, -26, 29, -14); ctx.lineTo(29, -8); ctx.closePath();
    ctx.fillStyle = B.accent; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(-5, -24, 10, 14); ctx.strokeRect(-5, -24, 10, 14);
    eyes(ctx, facing, 0, 0, 11, 6);
    // brows
    ctx.beginPath(); ctx.moveTo(-18, -9); ctx.lineTo(-5, -5); ctx.moveTo(18, -9); ctx.lineTo(5, -5); ctx.lineWidth = 4; ctx.stroke();
    // mouth
    ctx.beginPath(); ctx.moveTo(-8, 15); ctx.lineTo(8, 15); ctx.lineWidth = 3.5; ctx.stroke();
  } else {
    // ghostly drop with wavy hem
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
    // hood
    ctx.beginPath(); ctx.moveTo(-25, -2); ctx.quadraticCurveTo(-27, -34, 0, -36); ctx.quadraticCurveTo(27, -34, 25, -2);
    ctx.quadraticCurveTo(0, -18, -25, -2); ctx.closePath();
    ctx.fillStyle = B.accent; ctx.fill(); ctx.stroke();
    // glowing eyes
    const fx = Math.cos(facing) * 4, fy = Math.sin(facing) * 2;
    ctx.fillStyle = '#eaffff';
    for (const s of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(s * 8 + fx, -2 + fy, 4, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke();
    }
  }
  if (!behind) gun();
  ctx.restore();
}

// ---------------------------------------------------------------- world
const GRASS_A = '#8ee05e', GRASS_B = '#82d653';

export function drawGround(ctx, x0, y0, x1, y1) {
  ctx.fillStyle = '#2b1d55';
  ctx.fillRect(x0 - 10, y0 - 10, x1 - x0 + 20, y1 - y0 + 20);
  const tx0 = Math.max(0, Math.floor(x0 / TILE)), ty0 = Math.max(0, Math.floor(y0 / TILE));
  const tx1 = Math.min(GRID - 1, Math.floor(x1 / TILE)), ty1 = Math.min(GRID - 1, Math.floor(y1 / TILE));
  ctx.fillStyle = GRASS_A;
  ctx.fillRect(tx0 * TILE, ty0 * TILE, (tx1 - tx0 + 1) * TILE, (ty1 - ty0 + 1) * TILE);
  ctx.fillStyle = GRASS_B;
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) if ((x + y) & 1) ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
  // a few tufts for texture
  ctx.strokeStyle = 'rgba(40,120,40,0.35)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
    const h = (x * 73856093) ^ (y * 19349663);
    if ((h & 7) !== 0) continue;
    const px = x * TILE + 10 + (h >>> 3) % 30, py = y * TILE + 14 + (h >>> 7) % 26;
    ctx.moveTo(px - 4, py); ctx.lineTo(px - 6, py - 7); ctx.moveTo(px, py); ctx.lineTo(px, py - 9); ctx.moveTo(px + 4, py); ctx.lineTo(px + 6, py - 7);
  }
  ctx.stroke();
}

function visRange(x0, y0, x1, y1) {
  return [Math.max(0, Math.floor(x0 / TILE) - 1), Math.max(0, Math.floor(y0 / TILE) - 1),
    Math.min(GRID - 1, Math.floor(x1 / TILE) + 1), Math.min(GRID - 1, Math.floor(y1 / TILE) + 1)];
}

export function drawBlocks(ctx, tiles, crateHp, x0, y0, x1, y1) {
  const [tx0, ty0, tx1, ty1] = visRange(x0, y0, x1, y1);
  const H = 12;
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const t = tiles[ty * GRID + tx];
      if (t !== WALL && t !== CRATE) continue;
      const x = tx * TILE, y = ty * TILE;
      ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
      if (t === WALL) {
        const border = tx === 0 || ty === 0 || tx === GRID - 1 || ty === GRID - 1;
        ctx.fillStyle = border ? '#3d2c70' : '#5d47a8';
        rr(ctx, x + 1, y - H + 4, TILE - 2, TILE + H - 4, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = border ? '#6c58b8' : '#a48ff0';
        rr(ctx, x + 1, y - H, TILE - 2, TILE - 4, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        rr(ctx, x + 7, y - H + 5, TILE - 22, 6, 3); ctx.fill();
      } else {
        const hp = crateHp.get(ty * GRID + tx) ?? CRATE_HP;
        ctx.fillStyle = '#8a4b1f';
        rr(ctx, x + 3, y - H + 6, TILE - 6, TILE + H - 8, 5); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#d98c3f';
        rr(ctx, x + 3, y - H + 2, TILE - 6, TILE - 8, 5); ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + 9, y - H + 8); ctx.lineTo(x + TILE - 9, y + TILE - 16 - H + 8);
        ctx.moveTo(x + TILE - 9, y - H + 8); ctx.lineTo(x + 9, y + TILE - 16 - H + 8);
        ctx.lineWidth = 4; ctx.strokeStyle = '#8a4b1f'; ctx.stroke();
        if (hp < CRATE_HP * 0.66) {
          ctx.beginPath(); ctx.moveTo(x + 14, y - 4); ctx.lineTo(x + 22, y + 6); ctx.lineTo(x + 18, y + 14);
          if (hp < CRATE_HP * 0.33) { ctx.moveTo(x + 34, y - 6); ctx.lineTo(x + 28, y + 4); ctx.lineTo(x + 36, y + 12); }
          ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
        }
      }
    }
  }
}

export function drawBushes(ctx, tiles, x0, y0, x1, y1, me, t) {
  const [tx0, ty0, tx1, ty1] = visRange(x0, y0, x1, y1);
  const list = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (tiles[ty * GRID + tx] === BUSH) list.push([tx, ty]);
  if (!list.length) return;
  const blob = (tx, ty, pad) => {
    const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
    const h = (tx * 92837111) ^ (ty * 689287499);
    const sway = Math.sin(t * 1.6 + tx + ty) * 1.2;
    ctx.moveTo(cx + 30 + pad, cy - 8);
    ctx.arc(cx + sway, cy - 8, 30 + pad + (h & 3), 0, Math.PI * 2);
  };
  ctx.save();
  for (const pass of [0, 1, 2]) {
    for (const [tx, ty] of list) {
      const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
      const near = me && Math.hypot(me.x - cx, me.y - cy) < 95;
      ctx.globalAlpha = near ? 0.45 : 1;
      ctx.beginPath();
      if (pass === 0) { blob(tx, ty, 3); ctx.fillStyle = INK; ctx.fill(); }
      else if (pass === 1) { blob(tx, ty, -1); ctx.fillStyle = '#2f9e44'; ctx.fill(); }
      else {
        ctx.arc(cx - 8, cy - 18, 9, 0, Math.PI * 2);
        ctx.moveTo(cx + 18, cy - 4); ctx.arc(cx + 12, cy - 4, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#51cf66'; ctx.fill();
      }
    }
  }
  ctx.restore();
}

export function drawCube(ctx, x, y, t) {
  const b = Math.sin(t * 4 + x) * 4;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath(); ctx.ellipse(0, 14, 14, 5, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(20,10,40,0.3)'; ctx.fill();
  ctx.translate(0, b - 6);
  ctx.shadowColor = '#7dff7a'; ctx.shadowBlur = 16;
  rr(ctx, -14, -14, 28, 28, 6); ctx.fillStyle = '#5be35b'; ctx.fill();
  ctx.shadowBlur = 0; ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(2, -9); ctx.lineTo(-6, 2); ctx.lineTo(0, 2); ctx.lineTo(-3, 10); ctx.lineTo(6, -2); ctx.lineTo(0, -2); ctx.closePath();
  ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 1.5; ctx.stroke();
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

export function drawPoison(ctx, inset, x0, y0, x1, y1, t) {
  if (inset <= 0) return;
  const a = MAP_SIZE - inset;
  ctx.save();
  ctx.fillStyle = 'rgba(70,200,90,0.42)';
  ctx.beginPath();
  ctx.rect(x0 - 50, y0 - 50, x1 - x0 + 100, y1 - y0 + 100);
  ctx.rect(inset, a, a - inset, -(a - inset)); // hole (counter-wound)
  ctx.fill('evenodd');
  ctx.setLineDash([22, 14]); ctx.lineDashOffset = -t * 40;
  ctx.lineWidth = 6; ctx.strokeStyle = '#d4ff4f';
  ctx.strokeRect(inset, inset, a - inset, a - inset);
  ctx.setLineDash([]);
  // bubbles
  ctx.fillStyle = 'rgba(200,255,120,0.55)';
  for (let i = 0; i < 60; i++) {
    const bx = x0 + ((i * 197.3 + t * 13 * (i % 3 + 1)) % (x1 - x0 + 1));
    const by = y1 - ((i * 311.7 + t * 40 * ((i % 4) + 1)) % (y1 - y0 + 1));
    if (bx > inset && bx < a && by > inset && by < a) continue;
    ctx.beginPath(); ctx.arc(bx, by, 4 + (i % 5), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function drawAim(ctx, brawler, x, y, ang, kind, superCfg) {
  const B = BRAWLERS[brawler];
  ctx.save();
  ctx.translate(x, y);
  if (kind === 'fire') {
    const a = B.attack;
    ctx.fillStyle = 'rgba(255,255,255,0.32)'; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2;
    ctx.beginPath();
    if (a.kind === 'spread') {
      ctx.moveTo(0, 0); ctx.arc(0, 0, a.range, ang - a.arc / 2 - 0.04, ang + a.arc / 2 + 0.04); ctx.closePath();
    } else {
      ctx.rotate(ang); rr(ctx, PLAYER_R * 0.6, -a.radius - 4, a.range, (a.radius + 4) * 2, a.radius + 4);
    }
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
  // name + health bar above the head
  const y = p.y - 58;
  const w = 74, h = 15;
  outlinedText(ctx, p.name, p.x, y - 16, 15, isMe ? '#b8ff6b' : '#fff');
  rr(ctx, p.x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4, 7); ctx.fillStyle = INK; ctx.fill();
  const f = Math.max(0, Math.min(1, p.hp / p.mh));
  rr(ctx, p.x - w / 2, y - h / 2, w, h, 5); ctx.fillStyle = '#3a2a5e'; ctx.fill();
  if (f > 0) { rr(ctx, p.x - w / 2, y - h / 2, Math.max(8, w * f), h, 5); ctx.fillStyle = isMe ? '#4be06e' : '#ff4d5e'; ctx.fill(); }
  outlinedText(ctx, String(Math.ceil(p.hp)), p.x, y + 1, 12);
  if (p.cu > 0) {
    rr(ctx, p.x - w / 2 - 24, y - 10, 20, 20, 5); ctx.fillStyle = '#5be35b'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
    outlinedText(ctx, String(p.cu), p.x - w / 2 - 14, y + 1, 12);
  }
  if (p.stun) {
    for (let i = 0; i < 3; i++) {
      const a = t * 5 + (i * Math.PI * 2) / 3;
      outlinedText(ctx, '★', p.x + Math.cos(a) * 20, p.y - 40 + Math.sin(a) * 6, 14, '#ffe066');
    }
  }
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

// ---------------------------------------------------------------- screen-space HUD
export function drawControls(ctx, input, superC, brawler, t, autoAimHint) {
  if (!input.isTouch) return;
  ctx.save();
  // move stick
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
  // attack stick
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

  // super button
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

export { outlinedText, rr, BRAWLER_IDS, attackDirs };

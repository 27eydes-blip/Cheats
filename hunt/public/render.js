// All canvas drawing. Chunky cartoon look: bold dark outlines, bright flat fills.
import { BRAWLERS, BRAWLER_IDS, TILE, PLAYER_R, WALL, BUSH, CRATE, WATER, CRATE_HP, SUPPLY_HP, HUB, worldKeyAt, attackDirs } from './shared.js';
import { STICK_R } from './input.js';
import { SETTINGS, pulse } from './settings.js';
import { SKINS } from './catalog.js';

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

// DESERT MIRAGE: golden sunset desert. Everything you can fight or get hurt by gets a
// cool teal/purple rim + dark outline so it pops off the warm ground.
const MIRAGE = {
  groundA: '#f3c26a', groundB: '#ecb85f', tuft: 'rgba(168,96,32,0.32)', wallTop: '#eda661', wallSide: '#a3542c',
  borderTop: '#c4733d', borderSide: '#6e3020', bush: '#4f8a3c', bushHi: '#a8d45e', water: '#1fd6c6', waterHi: '#d4fff8', void: '#3a1a48',
  pillars: true, shadow: 'rgba(92,30,82,0.30)', shadowDx: 34, shadowDy: 20,
  rim: '#0e8f97', rimDeep: '#3b1f78', bulletRim: '#3b1f78',
  hazard: { lava: ['#b9fbff', '#2bc4cf', '#3b1f78'], flame: ['#7ef9ff', '#7a4cff'], warn: '#5ff4ff', ice: '#3b1f78' },
  deco: (ctx, x, y, h, t) => {
    // dune ripples
    if ((h & 3) === 0) {
      ctx.strokeStyle = 'rgba(190,120,45,0.38)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x + 4, y + 30); ctx.quadraticCurveTo(x + 25, y + 20 + (h % 7), x + 46, y + 30); ctx.stroke();
    }
    // patches of cracked stone (low-frequency so they cluster)
    const g = ((((x / 200) | 0) * 92821) ^ (((y / 200) | 0) * 68917)) >>> 0;
    if ((g & 3) === 0 && (h & 1)) {
      ctx.fillStyle = '#d8a35a'; ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
      ctx.strokeStyle = 'rgba(110,55,30,0.45)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 6, y + 10 + (h % 9)); ctx.lineTo(x + 22, y + 24); ctx.lineTo(x + 18, y + 42); ctx.moveTo(x + 22, y + 24); ctx.lineTo(x + 40, y + 20 + (h % 11)); ctx.stroke();
    }
    const k = (h >>> 4) % 97;
    if (k === 1) { // bones
      ctx.strokeStyle = '#fff7e6'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + 14, y + 30); ctx.lineTo(x + 34, y + 22); ctx.stroke();
      ctx.fillStyle = '#fff7e6'; for (const [bx, by] of [[13, 27], [15, 33], [33, 19], [36, 25]]) { ctx.beginPath(); ctx.arc(x + bx, y + by, 3, 0, 7); ctx.fill(); }
    } else if (k === 2 || k === 3) { // pottery
      ctx.fillStyle = k === 2 ? '#c4552b' : '#3b8f9a';
      ctx.beginPath(); ctx.ellipse(x + 25, y + 30, 9, 11, 0, 0, 7); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
      ctx.fillRect(x + 21, y + 15, 8, 6); ctx.strokeRect(x + 21, y + 15, 8, 6);
    } else if (k === 4) { // tattered flag
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 18, y + 42); ctx.lineTo(x + 18, y + 6); ctx.stroke();
      const w = Math.sin(t * 4 + x) * 3;
      ctx.beginPath(); ctx.moveTo(x + 18, y + 7); ctx.lineTo(x + 40, y + 11 + w); ctx.lineTo(x + 18, y + 19); ctx.closePath();
      ctx.fillStyle = '#2bc4cf'; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
    } else if (k === 5 || k === 6) { // cactus
      ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 11;
      ctx.beginPath(); ctx.moveTo(x + 25, y + 42); ctx.lineTo(x + 25, y + 10); ctx.moveTo(x + 25, y + 28); ctx.lineTo(x + 14, y + 24); ctx.lineTo(x + 14, y + 16); ctx.moveTo(x + 25, y + 22); ctx.lineTo(x + 35, y + 18); ctx.lineTo(x + 35, y + 12); ctx.stroke();
      ctx.strokeStyle = '#3f9a4a'; ctx.lineWidth = 6; ctx.stroke();
    }
  },
  wallDeco: (ctx, x, y, h) => { // sandstone strata
    ctx.strokeStyle = 'rgba(140,60,30,0.45)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 5, y - 2 + (h % 5)); ctx.lineTo(x + 45, y + (h % 7) - 3); ctx.moveTo(x + 5, y + 12 + (h % 4)); ctx.lineTo(x + 45, y + 10 + (h % 6)); ctx.stroke();
  },
};
THEMES.mirage = MIRAGE;
export const theme = (key) => THEMES[key] || THEMES.meadow;

// broken sandstone column for isolated wall tiles in pillar themes
function drawPillar(ctx, x, y, h) {
  const cx = x + 25, top = y - 30 + (h % 3) * 6;
  ctx.lineWidth = 3.5; ctx.strokeStyle = INK;
  rr(ctx, cx - 17, y + 30, 34, 12, 4); ctx.fillStyle = '#a3542c'; ctx.fill(); ctx.stroke(); // base
  rr(ctx, cx - 13, top + 6, 26, y + 34 - top - 6, 4); ctx.fillStyle = '#eda661'; ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(140,60,30,0.6)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx - 5, top + 12); ctx.lineTo(cx - 5, y + 30); ctx.moveTo(cx + 5, top + 12); ctx.lineTo(cx + 5, y + 30); ctx.stroke();
  // jagged broken top
  ctx.beginPath(); ctx.moveTo(cx - 13, top + 8); ctx.lineTo(cx - 6, top); ctx.lineTo(cx, top + 7); ctx.lineTo(cx + 6, top + 2); ctx.lineTo(cx + 13, top + 9); ctx.closePath();
  ctx.fillStyle = '#f7c98a'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
}
function isolated(map, tx, ty) {
  const W = (x, y) => map.t[y * map.gw + x] === WALL;
  return !W(tx + 1, ty) && !W(tx - 1, ty) && !W(tx, ty + 1) && !W(tx, ty - 1);
}

// long sunset shadows (themes with `shadow`)
export function drawShadows(ctx, map, x0, y0, x1, y1) {
  const [tx0, ty0, tx1, ty1] = visRange(map, x0 - 60, y0 - 40, x1, y1);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const t = map.t[ty * map.gw + tx];
    if (t !== WALL && t !== CRATE) continue;
    const th = theme(worldKeyAt(map, tx * TILE, ty * TILE));
    if (!th.shadow) continue;
    const x = tx * TILE, y = ty * TILE, dx = th.shadowDx * (t === CRATE ? 0.6 : 1.4), dy = th.shadowDy * (t === CRATE ? 0.6 : 1.4);
    ctx.fillStyle = th.shadow;
    ctx.beginPath(); ctx.moveTo(x + 2, y + TILE); ctx.lineTo(x + TILE, y + TILE); ctx.lineTo(x + TILE, y + 2);
    ctx.lineTo(x + TILE + dx, y + dy); ctx.lineTo(x + TILE + dx, y + TILE + dy); ctx.lineTo(x + 2 + dx, y + TILE + dy); ctx.closePath(); ctx.fill();
  }
}

// heat shimmer + drifting sand (world space) and sunset grade (screen space)
export function drawAmbient(ctx, map, view, t, lowFx) {
  const key = worldKeyAt(map, (view.x0 + view.x1) / 2, (view.y0 + view.y1) / 2);
  if (key !== 'mirage') return;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, map.gw * TILE, map.gh * TILE); ctx.clip();
  // heat shimmer: faint wavy bands sliding over open sand
  ctx.strokeStyle = 'rgba(255,248,220,0.16)'; ctx.lineWidth = 3;
  const step = 90;
  for (let y = Math.floor(view.y0 / step) * step; y < view.y1; y += step) {
    ctx.beginPath();
    for (let x = view.x0; x <= view.x1; x += 30) {
      const yy = y + Math.sin(x * 0.02 + t * 3 + y) * 6 + Math.sin(t * 1.3 + y) * 10;
      x === view.x0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  // drifting sand grains (stateless: position is a function of time)
  if (!lowFx) {
    ctx.fillStyle = 'rgba(255,226,160,0.75)';
    const W = view.x1 - view.x0, H = view.y1 - view.y0;
    for (let i = 0; i < 70; i++) {
      const sp = 60 + (i % 7) * 18;
      const x = view.x0 + ((i * 197.3 + t * sp) % W);
      const y = view.y0 + ((i * 311.9 + t * sp * 0.25 + Math.sin(t + i) * 20) % H);
      ctx.fillRect(x, y, 3 + (i % 3), 2);
    }
  }
  ctx.restore();
}
export function drawGrade(ctx, map, cam, W, H) {
  if (worldKeyAt(map, cam.x, cam.y) !== 'mirage') return;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,140,40,0.10)'); g.addColorStop(1, 'rgba(110,40,140,0.12)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// cool rim under players in rim themes (teal ring + long shadow)
// SQUAD HUNT: blue ring for you/teammates, red for enemies (dark outline so it reads anywhere)
export function drawTeamRing(ctx, p, mate) {
  const s = p.size || 1;
  ctx.beginPath(); ctx.arc(p.x, p.y + 2, 31 * s, 0, Math.PI * 2);
  ctx.lineWidth = 10; ctx.strokeStyle = INK; ctx.stroke();
  ctx.lineWidth = 5; ctx.strokeStyle = mate ? '#3a86ff' : '#ff2846'; ctx.stroke();
}
export function drawRim(ctx, map, p) {
  const th = theme(worldKeyAt(map, p.x, p.y));
  if (!th.rim) return;
  const s = p.size || 1;
  ctx.save();
  ctx.fillStyle = th.shadow;
  ctx.beginPath(); ctx.ellipse(p.x + 26 * s, p.y + 22 * s, 34 * s, 10 * s, 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(p.x, p.y + 2, 31 * s, 0, Math.PI * 2);
  ctx.lineWidth = 9; ctx.strokeStyle = th.rimDeep; ctx.stroke();
  ctx.lineWidth = 4; ctx.strokeStyle = th.rim; ctx.stroke();
  ctx.restore();
}

function drawPalm(ctx, x, y, t) {
  ctx.save(); ctx.lineCap = 'round';
  ctx.strokeStyle = INK; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(x, y + 10); ctx.quadraticCurveTo(x + 10, y - 20, x + 4, y - 46); ctx.stroke();
  ctx.strokeStyle = '#a0612f'; ctx.lineWidth = 6; ctx.stroke();
  const sw = Math.sin(t * 1.5) * 0.08;
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.62 + sw;
    ctx.beginPath(); ctx.moveTo(x + 4, y - 46); ctx.quadraticCurveTo(x + 4 + Math.cos(a) * 26, y - 46 + Math.sin(a) * 26 - 10, x + 4 + Math.cos(a) * 42, y - 46 + Math.sin(a) * 42 + 6);
    ctx.strokeStyle = INK; ctx.lineWidth = 10; ctx.stroke(); ctx.strokeStyle = '#3f9a4a'; ctx.lineWidth = 5; ctx.stroke();
  }
  ctx.restore();
}

function visRange(map, x0, y0, x1, y1) {
  return [Math.max(0, Math.floor(x0 / TILE) - 1), Math.max(0, Math.floor(y0 / TILE) - 1),
    Math.min(map.gw - 1, Math.floor(x1 / TILE) + 1), Math.min(map.gh - 1, Math.floor(y1 / TILE) + 1)];
}

// Ground is static, so it's painted once into chunk canvases (CHUNK x CHUNK tiles) at the current
// render resolution and blitted each frame. Water ripples and the hub stay live.
const CHUNK = 8;
export function resetGroundCache(map) { if (map) map._ground = null; }
export function drawGround(ctx, map, x0, y0, x1, y1, t, res = 1) {
  const th0 = theme(worldKeyAt(map, (x0 + x1) / 2, (y0 + y1) / 2));
  ctx.fillStyle = th0.void;
  ctx.fillRect(x0 - 10, y0 - 10, x1 - x0 + 20, y1 - y0 + 20);
  res = Math.max(0.35, Math.min(2, Math.round(res * 4) / 4));
  if (!map._ground || map._ground.res !== res) map._ground = { res, chunks: new Map() };
  const G = map._ground, cs = CHUNK * TILE;
  const cx0 = Math.max(0, Math.floor(x0 / cs)), cy0 = Math.max(0, Math.floor(y0 / cs));
  const cx1 = Math.min(Math.ceil(map.gw / CHUNK) - 1, Math.floor(x1 / cs)), cy1 = Math.min(Math.ceil(map.gh / CHUNK) - 1, Math.floor(y1 / cs));
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
    let c = G.chunks.get(cy * 1000 + cx);
    if (!c) {
      const px = Math.ceil(cs * res);
      c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(px, px) : Object.assign(document.createElement('canvas'), { width: px, height: px });
      const g = c.getContext('2d');
      g.scale(res, res); g.translate(-cx * cs, -cy * cs);
      paintGround(g, map, cx * cs, cy * cs, cx * cs + cs - 1, cy * cs + cs - 1);
      G.chunks.set(cy * 1000 + cx, c);
    }
    ctx.drawImage(c, cx * cs, cy * cs, cs, cs);
  }
  drawGroundLive(ctx, map, x0, y0, x1, y1, t);
}
function paintGround(ctx, map, x0, y0, x1, y1) {
  const t = 0;
  const [tx0, ty0, tx1, ty1] = [Math.floor(x0 / TILE), Math.floor(y0 / TILE), Math.min(map.gw - 1, Math.floor(x1 / TILE)), Math.min(map.gh - 1, Math.floor(y1 / TILE))];
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
    if ((h & 7) !== 0 || SETTINGS.lowGfx) continue;
    const px = x * TILE + 10 + (h >>> 3) % 30, py = y * TILE + 14 + (h >>> 7) % 26;
    ctx.strokeStyle = th.tuft;
    ctx.beginPath(); ctx.moveTo(px - 4, py); ctx.lineTo(px - 6, py - 7); ctx.moveTo(px, py); ctx.lineTo(px, py - 9); ctx.moveTo(px + 4, py); ctx.lineTo(px + 6, py - 7); ctx.stroke();
  }
}
function drawGroundLive(ctx, map, x0, y0, x1, y1, t) {
  const [tx0, ty0, tx1, ty1] = visRange(map, x0, y0, x1, y1);
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
  // palms around oases
  for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
    const i = y * map.gw + x;
    if (map.t[i] !== 0 || !theme(worldKeyAt(map, x * TILE, y * TILE)).pillars) continue;
    if (map.t[i + 1] !== WATER && map.t[i - 1] !== WATER && map.t[i + map.gw] !== WATER && map.t[i - map.gw] !== WATER) continue;
    if (hash(x, y) % 3) continue;
    drawPalm(ctx, x * TILE + 25, y * TILE + 30, t + x);
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
      if (t !== CRATE) continue; // walls/cover are drawn by art/walls.js
      const x = tx * TILE, y = ty * TILE;
      ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
      if (t === WALL) {
        const th = theme(worldKeyAt(map, x, y));
        const border = tx === 0 || ty === 0 || tx === map.gw - 1 || ty === map.gh - 1;
        if (th.pillars && !border && isolated(map, tx, ty)) { drawPillar(ctx, x, y, hash(tx, ty)); continue; }
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
let blinkK = 1; // 1 = open, ~0.1 = closed (lobby idle blink)
function eyes(ctx, facing, ox, oy, spread, size) {
  const fx = Math.cos(facing), fy = Math.sin(facing);
  for (const s of [-1, 1]) {
    const ex = ox + s * spread + fx * 5, ey = oy + fy * 3;
    ctx.beginPath(); ctx.ellipse(ex, ey, size * 0.8, Math.max(0.6, size * blinkK), 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
    if (blinkK < 0.5) continue;
    ctx.beginPath(); ctx.arc(ex + fx * size * 0.35, ey + fy * size * 0.4, size * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = INK; ctx.fill();
  }
}

// skin accessories, drawn on top of the body (cosmetic only)
function drawAccessory(ctx, acc, t) {
  ctx.save(); ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
  const blob = (x, y, r, c) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = c; ctx.fill(); ctx.stroke(); };
  switch (acc) {
    case 'cloud': blob(-10, -36, 9, '#eef'); blob(2, -40, 11, '#eef'); blob(14, -35, 8, '#eef'); break;
    case 'shades': rr(ctx, -18, -14, 36, 10, 4); ctx.fillStyle = INK; ctx.fill(); break;
    case 'moss': blob(-14, -26, 7, '#5fb84a'); blob(-4, -29, 6, '#3f9a4a'); break;
    case 'horns': for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 18, -24); ctx.quadraticCurveTo(s * 30, -34, s * 26, -44); ctx.lineTo(s * 14, -28); ctx.closePath(); ctx.fillStyle = '#fff3d6'; ctx.fill(); ctx.stroke(); } break;
    case 'snowflake': ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; ctx.moveTo(Math.cos(a) * 9, -40 + Math.sin(a) * 9); ctx.lineTo(-Math.cos(a) * 9, -40 - Math.sin(a) * 9); } ctx.stroke(); break;
    case 'flame': { const h = 12 + (SETTINGS.reduceFlash ? 2 : Math.sin(t * 10) * 3); ctx.beginPath(); ctx.moveTo(-8, -32); ctx.quadraticCurveTo(0, -32 - h * 2, 8, -32); ctx.closePath(); ctx.fillStyle = '#ffb347'; ctx.fill(); ctx.stroke(); break; }
    case 'moon': ctx.beginPath(); ctx.arc(14, -36, 9, 0.6, 5.7); ctx.arc(18, -38, 7, 5.2, 1.1, true); ctx.closePath(); ctx.fillStyle = '#fff6b0'; ctx.fill(); ctx.stroke(); break;
    case 'leaf': ctx.beginPath(); ctx.ellipse(0, -38, 6, 12, 0.5, 0, 7); ctx.fillStyle = '#3f9a4a'; ctx.fill(); ctx.stroke(); break;
    case 'antenna': ctx.beginPath(); ctx.moveTo(14, -22); ctx.lineTo(20, -44); ctx.stroke(); blob(20, -46, 4, '#ff2846'); break;
    case 'bolt': for (const s of [-1, 1]) blob(s * 22, -14, 4, '#c0c0c8'); break;
    case 'visor': rr(ctx, -20, -12, 40, 9, 4); ctx.fillStyle = '#5ff4ff'; ctx.fill(); ctx.stroke(); break;
    case 'flower': for (let i = 0; i < 5; i++) { const a = i * 1.257; blob(16 + Math.cos(a) * 5, -30 + Math.sin(a) * 5, 4, '#fff'); } blob(16, -30, 3, '#ffd23f'); break;
  }
  ctx.restore();
}

export function drawBrawler(ctx, id, x, y, facing, t, o = {}) {
  const sk = o.skin && SKINS[o.skin] && SKINS[o.skin].brawler === id ? SKINS[o.skin] : null;
  const B = sk ? { ...BRAWLERS[id], color: sk.color, dark: sk.dark, accent: sk.accent } : BRAWLERS[id];
  blinkK = 1 - (o.blink || 0) * 0.9;
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
    } else if (id === 'wisp') {
      rr(ctx, 8, -5, 52, 10, 4); ctx.fillStyle = B.accent; ctx.fill(); ctx.stroke();
      rr(ctx, 18, -9, 14, 6, 2); ctx.fillStyle = '#d9c8ff'; ctx.fill(); ctx.stroke();
    } else if (id === 'dune') { // carved staff with a turquoise stone
      rr(ctx, 6, -4, 44, 8, 4); ctx.fillStyle = '#8a5a2b'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(52, 0, 8, 0, Math.PI * 2); ctx.fillStyle = B.accent; ctx.fill(); ctx.stroke();
    } else if (id === 'rook') { // mine launcher with an orange muzzle
      rr(ctx, 10, -9, 30, 18, 5); ctx.fillStyle = '#4a4a5e'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(42, 0, 9, 0, Math.PI * 2); ctx.fillStyle = B.accent; ctx.fill(); ctx.stroke();
    } else { // twin curved blades
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(14, s * 10); ctx.quadraticCurveTo(34, s * 18, 46, s * 4); ctx.lineTo(40, s * 2); ctx.quadraticCurveTo(30, s * 10, 14, s * 4); ctx.closePath();
        ctx.fillStyle = '#e8e4ff'; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
      }
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
  } else if (id === 'dune') {
    // a sand spirit in a hooded cloak, swirling grains around it
    for (let i = 0; i < 3; i++) {
      const a = t * 2 + i * 2.1;
      ctx.beginPath(); ctx.arc(Math.cos(a) * 30, Math.sin(a) * 12 + 6, 3, 0, 7); ctx.fillStyle = '#f7d98a'; ctx.fill();
    }
    ctx.beginPath(); ctx.moveTo(-26, 22); ctx.quadraticCurveTo(-28, -16, 0, -30); ctx.quadraticCurveTo(28, -16, 26, 22); ctx.quadraticCurveTo(0, 30, -26, 22); ctx.closePath();
    ctx.fillStyle = flash ? '#fff' : B.color; ctx.fill(); ctx.lineWidth = 4.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-20, 6); ctx.quadraticCurveTo(0, 16, 20, 6); ctx.lineTo(18, 14); ctx.quadraticCurveTo(0, 22, -18, 14); ctx.closePath();
    ctx.fillStyle = B.accent; ctx.fill(); ctx.lineWidth = 3; ctx.stroke(); // scarf
    ctx.beginPath(); ctx.ellipse(0, -10, 15, 11, 0, 0, 7); ctx.fillStyle = '#3d2614'; ctx.fill(); ctx.stroke(); // hood shadow
    const fx = Math.cos(facing) * 4, fy = Math.sin(facing) * 2;
    ctx.fillStyle = '#7ef9ff';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 6 + fx, -10 + fy, 3.2, Math.max(0.5, 3.2 * blinkK), 0, 0, 7); ctx.fill(); }
  } else if (id === 'rook') {
    rr(ctx, -27, -24, 54, 50, 16); ctx.fillStyle = flash ? '#fff' : B.color; ctx.fill(); ctx.lineWidth = 4.5; ctx.stroke();
    rr(ctx, -20, 10, 40, 12, 5); ctx.fillStyle = B.dark; ctx.fill(); ctx.lineWidth = 3; ctx.stroke(); // belt
    for (const s of [-1, 0, 1]) { ctx.beginPath(); ctx.arc(s * 12, 16, 4, 0, 7); ctx.fillStyle = B.accent; ctx.fill(); ctx.stroke(); } // mines on the belt
    rr(ctx, -21, -16, 42, 16, 8); ctx.fillStyle = '#2b2b3a'; ctx.fill(); ctx.stroke(); // goggles strap
    const fx = Math.cos(facing) * 4, fy = Math.sin(facing) * 2;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 9 + fx, -8 + fy, 6.5, 0, 7); ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.lineWidth = 3; ctx.stroke(); if (blinkK > 0.5) { ctx.beginPath(); ctx.arc(s * 9 + fx * 1.4, -8 + fy * 1.4, 2.6, 0, 7); ctx.fillStyle = INK; ctx.fill(); } }
  } else if (id === 'flicker') {
    // sleek masked assassin with fox ears and a trailing scarf
    ctx.beginPath(); ctx.moveTo(-16, -18); ctx.lineTo(-12, -36); ctx.lineTo(-4, -22); ctx.moveTo(16, -18); ctx.lineTo(12, -36); ctx.lineTo(4, -22);
    ctx.fillStyle = B.dark; ctx.fill(); ctx.lineWidth = 3.5; ctx.stroke();
    const sw = Math.sin(t * 9) * 4;
    ctx.beginPath(); ctx.moveTo(-6, 8); ctx.quadraticCurveTo(-30 - Math.cos(facing) * 10, 12 + sw, -38 - Math.cos(facing) * 14, 4 + sw); ctx.lineTo(-34, 14 + sw); ctx.quadraticCurveTo(-20, 18, -4, 14); ctx.closePath();
    ctx.fillStyle = B.accent; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, 21, 24, 0, 0, 7); ctx.fillStyle = flash ? '#fff' : B.color; ctx.fill(); ctx.lineWidth = 4.5; ctx.stroke();
    rr(ctx, -18, -10, 36, 12, 6); ctx.fillStyle = '#1b1033'; ctx.fill(); // mask band
    const fx = Math.cos(facing) * 4, fy = Math.sin(facing) * 2;
    ctx.fillStyle = '#ff5fa2';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 8 + fx, -4 + fy, 5, Math.max(0.5, 3 * blinkK), s * 0.3, 0, 7); ctx.fill(); }
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
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 8 + fx, -2 + fy, 4, Math.max(0.6, 6 * blinkK), 0, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke(); }
  }
  if (!behind) gun();
  if (sk) drawAccessory(ctx, sk.acc, t);
  ctx.restore();
}

// BOUNTY glow / hunted target aura / spawn bubble / speed rush lines (drawn under the brawler)
export function drawAura(ctx, p, t) {
  const g = (p.glow || 0) / 100;
  if (p.fl & 32) { // hunted target
    ctx.beginPath(); ctx.arc(p.x, p.y, 42 + pulse(t) * 8, 0, Math.PI * 2);
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
  ctx.lineWidth = 3; ctx.strokeStyle = `rgba(200,240,255,${0.3 + pulse(t, 10) * 0.6})`; ctx.stroke();
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
export function drawMine(ctx, x, y, armed, mine, t) {
  ctx.save(); ctx.translate(x, y);
  ctx.globalAlpha = armed && !mine ? 0.9 : 1;
  ctx.beginPath(); ctx.arc(0, 0, 14, 0, 7); ctx.fillStyle = '#4a4a5e'; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.stroke();
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.6; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 14, Math.sin(a) * 14); ctx.lineTo(Math.cos(a) * 20, Math.sin(a) * 20); ctx.lineWidth = 4; ctx.stroke(); }
  // light: amber while arming, then red (or teal for your own). Steady under Reduce Flashing.
  const on = SETTINGS.reduceFlash ? 1 : (Math.sin(t * (armed ? 6 : 14)) > -0.2 ? 1 : 0.35);
  ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); ctx.globalAlpha = on; ctx.fillStyle = !armed ? '#ffb347' : mine ? '#5ff4ff' : '#ff2846'; ctx.fill();
  ctx.restore();
}
export function drawCage(ctx, x, y) {
  ctx.save(); ctx.translate(x, y);
  rr(ctx, -34, -40, 68, 70, 8); ctx.fillStyle = 'rgba(255,140,26,0.18)'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); for (let k = -24; k <= 24; k += 12) { ctx.moveTo(k, -40); ctx.lineTo(k, 30); } ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 3; ctx.strokeStyle = '#ff8c1a'; ctx.stroke();
  ctx.restore();
}
export function drawSlowed(ctx, x, y, t) {
  ctx.save(); ctx.fillStyle = 'rgba(232,176,74,0.8)';
  for (let i = 0; i < 6; i++) { const a = i * 1.05 + t * 3; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 24, y + 18 + Math.sin(a) * 6, 3, 0, 7); ctx.fill(); }
  ctx.restore();
}
export function drawWorm(ctx, x, y, r, k) {
  // k: 0..1 lifetime of the eruption. Teal/purple with dark outline so it reads on any ground.
  const h = Math.sin(Math.min(1, k * 1.6) * Math.PI) * r * 0.9;
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.ellipse(0, 10, r * 0.75, r * 0.3, 0, 0, 7); ctx.fillStyle = 'rgba(80,40,20,0.45)'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(-24, 10); ctx.quadraticCurveTo(-30, -h * 0.6, -6, -h); ctx.quadraticCurveTo(14, -h - 6, 24, -h * 0.5); ctx.lineTo(24, 10); ctx.closePath();
  ctx.fillStyle = '#2bc4cf'; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke();
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-26 + i * 2, 10 - (h * i) / 4); ctx.lineTo(24, 10 - (h * i) / 4.4); ctx.lineWidth = 3; ctx.strokeStyle = '#3b1f78'; ctx.stroke(); }
  ctx.beginPath(); ctx.arc(2, -h + 4, 9, 0, 7); ctx.fillStyle = '#3b1f78'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke(); // maw
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

const BULLET_COL = { volt: ['#bde0ff', '#3a86ff'], brick: ['#ffe066', '#ff7b39'], wisp: ['#f3e8ff', '#8f5cff'], dune: ['#f7d98a', '#2a9d8f'], rook: ['#ffd23f', '#4a4a5e'], cage: ['#ffe066', '#ff8c1a'] };
const TRAIL = { volt: ['#7db8ff', 46], brick: ['#ffb347', 22], wisp: ['#c9a6ff', 90], dune: ['#f7d98a', 40] };
export function drawTrail(ctx, kind, x, y, ang) {
  const tr = TRAIL[kind];
  if (!tr) return;
  const [col, len] = tr, x0 = x - Math.cos(ang) * len, y0 = y - Math.sin(ang) * len;
  const g = ctx.createLinearGradient(x0, y0, x, y);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, col);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = kind === 'dune' ? 14 : 7; ctx.strokeStyle = g; ctx.globalAlpha = 0.75;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke(); ctx.restore();
}

export function drawBullet(ctx, kind, x, y, ang, rim) {
  const [c1, c2] = BULLET_COL[kind] || BULLET_COL.volt;
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  if (rim) { ctx.beginPath(); ctx.ellipse(-4, 0, 22, 12, 0, 0, Math.PI * 2); ctx.fillStyle = rim; ctx.globalAlpha = 0.55; ctx.fill(); ctx.globalAlpha = 1; }
  ctx.lineWidth = 3; ctx.strokeStyle = INK;
  if (kind === 'dune') { // sand crescent wave
    ctx.beginPath(); ctx.arc(-18, 0, 30, -0.9, 0.9); ctx.arc(-26, 0, 30, 0.85, -0.85, true); ctx.closePath();
    ctx.fillStyle = c1; ctx.fill(); ctx.lineWidth = 3.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(-18, 0, 24, -0.6, 0.6); ctx.strokeStyle = c2; ctx.lineWidth = 3; ctx.stroke();
  } else if (kind === 'rook') { // thrown mine, spinning
    ctx.rotate(x * 0.05);
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.fillStyle = c2; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, 7); ctx.fillStyle = c1; ctx.fill();
  } else if (kind === 'cage') {
    rr(ctx, -12, -12, 24, 24, 4); ctx.fillStyle = 'rgba(255,140,26,0.35)'; ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); for (const k of [-6, 0, 6]) { ctx.moveTo(k, -12); ctx.lineTo(k, 12); } ctx.strokeStyle = c2; ctx.lineWidth = 2.5; ctx.stroke();
  } else if (kind === 'wisp') {
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
  const hz = (x, y) => theme(worldKeyAt(map, x, y)).hazard;
  return {
    map,
    visible: (x, y) => x > view.x0 - 80 && x < view.x1 + 80 && y > view.y0 - 80 && y < view.y1 + 80,
    warnTile(x, y, color, t) {
      color = hz(x, y)?.warn || color;
      const pu = 0.5 + pulse(t) * 0.5;
      rr(ctx, x - 21, y - 21, 42, 42, 10);
      ctx.fillStyle = color; ctx.globalAlpha = 0.25 * pu; ctx.fill(); ctx.globalAlpha = 1;
      ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = 4.5; ctx.strokeStyle = color; ctx.globalAlpha = pu; ctx.stroke(); ctx.globalAlpha = 1;
      outlinedText(ctx, '!', x, y, 22, color);
    },
    flame(x, y, t) {
      const fc = hz(x, y)?.flame || ['#ffd23f', '#ff6b2b'];
      for (let i = 0; i < 3; i++) {
        const fx = x + (i - 1) * 13, h = 22 + Math.sin(t * 12 + i * 2) * 7;
        ctx.beginPath(); ctx.moveTo(fx - 9, y + 10); ctx.quadraticCurveTo(fx - 8, y - h * 0.5, fx, y - h); ctx.quadraticCurveTo(fx + 8, y - h * 0.5, fx + 9, y + 10); ctx.closePath();
        ctx.fillStyle = i === 1 ? fc[0] : fc[1]; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
      }
    },
    pool(c, phase, t, kind) {
      if (!this.visible(c.x, c.y)) return;
      const H = hz(c.x, c.y);
      ctx.save();
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      if (phase === 'warn') {
        ctx.fillStyle = kind === 'lava' ? 'rgba(255,90,40,0.18)' : 'rgba(150,230,255,0.2)'; ctx.fill();
        ctx.lineWidth = 11; ctx.strokeStyle = INK; ctx.stroke();
        ctx.setLineDash([16, 12]); ctx.lineDashOffset = -t * 30; ctx.lineWidth = 6;
        ctx.strokeStyle = H ? H.warn : kind === 'lava' ? '#ff4d2e' : '#8ee8ff'; ctx.stroke();
      } else if (kind === 'lava') {
        const g = ctx.createRadialGradient(c.x, c.y, c.r * 0.2, c.x, c.y, c.r);
        const L = H?.lava || ['#ffe066', '#ff7b1c', '#d6331c'];
        g.addColorStop(0, L[0]); g.addColorStop(0.55, L[1]); g.addColorStop(1, L[2]);
        ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.stroke();
        ctx.fillStyle = 'rgba(255,240,150,0.85)';
        for (let i = 0; i < 5; i++) { const a = t * 0.7 + i * 1.3, d = c.r * 0.55 * ((i * 37) % 10) / 10; ctx.beginPath(); ctx.arc(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, 5 + Math.sin(t * 5 + i) * 3, 0, 7); ctx.fill(); }
      } else {
        ctx.fillStyle = 'rgba(200,245,255,0.75)'; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = H?.ice || '#4a9fd0'; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(c.x - c.r * 0.4, c.y - c.r * 0.2); ctx.lineTo(c.x - c.r * 0.1, c.y - c.r * 0.5); ctx.moveTo(c.x + c.r * 0.1, c.y + c.r * 0.3); ctx.lineTo(c.x + c.r * 0.45, c.y); ctx.stroke();
      }
      ctx.restore();
    },
    target(x, y, t) {
      const r = 54 + pulse(t) * 12;
      ctx.lineWidth = 6; ctx.strokeStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - r - 14, y); ctx.lineTo(x + r + 14, y); ctx.moveTo(x, y - r - 14); ctx.lineTo(x, y + r + 14); ctx.stroke();
    },
  };
}

export function drawAim(ctx, brawler, x, y, ang, kind, mag) {
  const B = BRAWLERS[brawler];
  ctx.save();
  ctx.translate(x, y);
  if (kind === 'fire') {
    const a = B.attack;
    ctx.fillStyle = 'rgba(255,255,255,0.32)'; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2;
    ctx.beginPath();
    if (a.kind === 'spread' || a.kind === 'slash') { ctx.moveTo(0, 0); ctx.arc(0, 0, a.range, ang - a.arc / 2 - 0.04, ang + a.arc / 2 + 0.04); ctx.closePath(); }
    else if (a.kind === 'mine') { const d = a.range * Math.max(0.13, Math.min(1, mag ?? 1)); ctx.arc(Math.cos(ang) * d, Math.sin(ang) * d, a.blast, 0, Math.PI * 2); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ang) * d, Math.sin(ang) * d); }
    else { ctx.rotate(ang); rr(ctx, PLAYER_R * 0.6, -a.radius - 4, a.range, (a.radius + 4) * 2, a.radius + 4); }
    ctx.fill(); ctx.stroke();
  } else {
    const s = B.super;
    ctx.fillStyle = 'rgba(255,210,63,0.35)'; ctx.strokeStyle = 'rgba(255,230,120,0.95)'; ctx.lineWidth = 3;
    ctx.beginPath();
    if (s.kind === 'dash') { ctx.rotate(ang); rr(ctx, 0, -s.radius * 0.7, s.dist, s.radius * 1.4, s.radius * 0.7); }
    else if (s.kind === 'slam') ctx.arc(0, 0, s.radius, 0, Math.PI * 2);
    else if (s.kind === 'worm') { ctx.arc(Math.cos(ang) * s.range * 0.6, Math.sin(ang) * s.range * 0.6, s.radius, 0, Math.PI * 2); }
    else if (s.kind === 'cage') { ctx.rotate(ang); rr(ctx, 0, -s.radius, s.range, s.radius * 2, s.radius); }
    else if (s.kind === 'blink') ctx.arc(0, 0, s.range, 0, Math.PI * 2);
    else ctx.arc(0, 0, 60, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

export function drawStatus(ctx, p, isMe, t, side) {
  const y = p.y - 58 * (p.size || 1) - 4;
  const w = 74, h = 15;
  outlinedText(ctx, p.name, p.x, y - (p.title ? 30 : 16), 15, isMe ? '#b8ff6b' : (p.fl & 32) ? '#ff8a9a' : '#fff');
  if (p.title) outlinedText(ctx, p.title, p.x, y - 15, 11, '#ffd23f');
  rr(ctx, p.x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4, 7); ctx.fillStyle = INK; ctx.fill();
  const f = Math.max(0, Math.min(1, p.hp / p.mh));
  rr(ctx, p.x - w / 2, y - h / 2, w, h, 5); ctx.fillStyle = '#3a2a5e'; ctx.fill();
  if (f > 0) { rr(ctx, p.x - w / 2, y - h / 2, Math.max(8, w * f), h, 5); ctx.fillStyle = isMe ? '#4be06e' : side === 'mate' ? '#3a86ff' : '#ff4d5e'; ctx.fill(); }
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
    ctx.beginPath(); ctx.arc(x, y, 31 + pulse(t) * 6, 0, Math.PI * 2);
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
    ctx.fillStyle = p.mate ? '#3a86ff' : p.target ? '#ff2846' : '#ffd23f'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
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
    if (canvas.offsetParent === null) { requestAnimationFrame(loop); return; } // lobby hidden: don't draw
    t += 1 / 60;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBrawler(ctx, id, canvas.clientWidth / 2, canvas.clientHeight / 2 + 8, 0.35 + Math.sin(t) * 0.25, t, { scale: Math.min(1.8, canvas.clientHeight / 52) });
    requestAnimationFrame(loop);
  };
  loop();
}

export { BRAWLER_IDS, attackDirs };

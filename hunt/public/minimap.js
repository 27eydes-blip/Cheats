// Minimap + full map for Free Play (and a world overview for tests/screenshots).
// The world is baked once into a small image (1 pixel per tile); the in-game minimap shows the
// area around you, and tapping it opens the full map: zones, roads, landmarks, you, the top
// bounty holder, the day/night clock and the events running in each zone.
import { TILE, WALL, BUSH, CRATE, WATER, ZONES, HUB, worldKeyAt, zoneBySlot } from './shared.js';
import { theme, outlinedText } from './render.js';
import { EVENTS } from './events/index.js';

const INK = '#1b1033';
const rgb = (hex) => { const h = hex.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));

// 1 pixel per tile, cached on the map
export function bakeMini(map) {
  if (map._mini) return map._mini;
  const w = map.gw, h = map.gh;
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = cv.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  const cache = new Map();
  const pal = (key) => {
    if (cache.has(key)) return cache.get(key);
    const th = theme(key), ground = rgb(th.groundA);
    const p = {
      ground, wall: rgb(th.wallSide), rock: mix(rgb(th.borderSide), [0, 0, 0], 0.15), water: rgb(th.water), bush: rgb(th.bush),
      road: rgb(th.road || '#c9b07a'), mud: rgb(th.mud || '#3a2e20'), high: mix(ground, [255, 255, 255], 0.3), crate: [217, 140, 63], border: [27, 16, 51],
    };
    cache.set(key, p); return p;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, t = map.t[i], p = pal(worldKeyAt(map, x * TILE + 25, y * TILE + 25));
    const c = map.border[i] ? p.border : t === WALL ? (map.rock && map.rock[i] ? p.rock : p.wall) : t === WATER ? p.water : t === BUSH ? p.bush : t === CRATE ? p.crate
      : map.road && map.road[i] ? p.road : map.mud && map.mud[i] ? p.mud : map.high && map.high[i] ? p.high : p.ground;
    d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  if (map.kind === 'world') { // the safe hub
    g.beginPath(); g.arc(HUB.x / TILE, HUB.y / TILE, HUB.r / TILE, 0, Math.PI * 2); g.fillStyle = '#ffd23f'; g.fill();
  }
  map._mini = cv;
  return cv;
}

// landmark + point-of-interest icons (vector, readable at any size)
export function drawLandmarkIcon(g, kind, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s, s); g.lineWidth = 2.2; g.strokeStyle = INK; g.lineJoin = 'round';
  if (kind === 'tower') { g.fillStyle = '#b3b9cb'; g.fillRect(-4, -9, 8, 15); g.strokeRect(-4, -9, 8, 15); g.beginPath(); g.moveTo(-6, -9); g.lineTo(0, -15); g.lineTo(6, -9); g.closePath(); g.fillStyle = '#d04a3a'; g.fill(); g.stroke(); }
  else if (kind === 'volcano') { g.beginPath(); g.moveTo(-10, 7); g.lineTo(-3, -7); g.lineTo(3, -7); g.lineTo(10, 7); g.closePath(); g.fillStyle = '#3b3540'; g.fill(); g.stroke(); g.fillStyle = '#ff6a1f'; g.fillRect(-3, -8, 6, 3); }
  else if (kind === 'waterfall') { g.fillStyle = '#5b9fd6'; g.fillRect(-9, -7, 18, 6); g.strokeRect(-9, -7, 18, 6); g.fillStyle = '#e6f6ff'; g.fillRect(-4, -1, 8, 9); g.strokeRect(-4, -1, 8, 9); }
  else if (kind === 'vault') { g.fillStyle = '#ffd23f'; g.fillRect(-5, -5, 10, 10); g.strokeRect(-5, -5, 10, 10); g.fillStyle = INK; g.fillRect(-1, -2, 2, 4); }
  else if (kind === 'high') { g.beginPath(); g.moveTo(-7, 5); g.lineTo(0, -6); g.lineTo(7, 5); g.closePath(); g.fillStyle = '#e8e0c8'; g.fill(); g.stroke(); }
  else if (kind === 'skull') { // top bounty holder ("Marked")
    g.beginPath(); g.arc(0, -2, 7, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.stroke(); g.fillRect(-4, 3, 8, 5); g.strokeRect(-4, 3, 8, 5);
    g.fillStyle = '#d0102a'; g.beginPath(); g.arc(-2.6, -2, 2, 0, 7); g.arc(2.6, -2, 2, 0, 7); g.fill();
  }
  g.restore();
}

// the round in-game minimap (top-left): area around `me`, `span` px of world across
export function drawMiniMap(ctx, map, cx, cy, R, me, o = {}) {
  const mini = bakeMini(map), span = o.span || 5200, k = (R * 2) / span; // screen px per world px
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = '#120a24'; ctx.fill();
  ctx.clip();
  const sx = (me.x - span / 2) / TILE, sy = (me.y - span / 2) / TILE, sw = span / TILE;
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 0.92;
  ctx.drawImage(mini, sx, sy, sw, sw, cx - R, cy - R, R * 2, R * 2);
  ctx.globalAlpha = 1;
  const P = (x, y) => [cx + (x - me.x) * k, cy + (y - me.y) * k];
  for (const lm of map.landmarks || []) { const [x, y] = P(lm.x, lm.y); drawLandmarkIcon(ctx, lm.kind, x, y, 0.8); }
  for (const p of o.pings || []) { const [x, y] = P(p.x, p.y); ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fillStyle = p.mate ? '#3a86ff' : '#ffd23f'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke(); }
  if (o.top && Math.hypot(o.top.x - me.x, o.top.y - me.y) < span / 2) { const [x, y] = P(o.top.x, o.top.y); drawLandmarkIcon(ctx, 'skull', x, y, 0.7); }
  ctx.restore();
  // ring, you (an arrow), the zone name
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.stroke();
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(o.facing || 0);
  ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -5); ctx.lineTo(-2, 0); ctx.lineTo(-5, 5); ctx.closePath();
  ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(); ctx.restore();
  if (o.label) outlinedText(ctx, o.label, cx, cy + R - 9, 9, '#fff');
  if (o.hint) outlinedText(ctx, 'TAP FOR MAP', cx, cy - R + 9, 8, '#ffd23f');
}

// the full-screen map
export function drawFullMap(g, map, W, H, o = {}) {
  const mini = bakeMini(map), pad = 14, size = Math.min(W - pad * 2, H - pad * 2 - 30), ox = (W - size) / 2, oy = pad + 24;
  const k = size / (map.gw * TILE), P = (x, y) => [ox + x * k, oy + y * k];
  g.fillStyle = 'rgba(12,8,24,0.92)'; g.fillRect(0, 0, W, H);
  g.imageSmoothingEnabled = false;
  g.drawImage(mini, ox, oy, size, size);
  g.lineWidth = 3; g.strokeStyle = INK; g.strokeRect(ox, oy, size, size);
  // landmark and POI icons first: the zone names, events and hunter counts go on top, so they stay readable
  for (const lm of map.landmarks || []) { const [x, y] = P(lm.x, lm.y); drawLandmarkIcon(g, lm.kind, x, y, Math.max(0.9, size / 360)); }
  for (const p of map.pois || []) if (p.kind === 'vault' || p.kind === 'high') { const [x, y] = P(p.x, p.y); drawLandmarkIcon(g, p.kind, x, y, Math.max(0.5, size / 700)); }
  // zone names + active events
  for (const z of ZONES) {
    const [x, y] = P((z.x0 + z.x1) / 2, z.y0 + (z.y1 - z.y0) * 0.16);
    outlinedText(g, z.name.toUpperCase(), x, y, Math.max(10, size / 36), '#fff');
    const ev = o.online && o.online[z.slot] && o.online[z.slot].ev;
    if (ev && EVENTS[ev[0]]) outlinedText(g, `${ev[1] === 'warn' ? '⚠ ' : ''}${EVENTS[ev[0]].name}`, x, y + Math.max(12, size / 30), Math.max(10, size / 46), EVENTS[ev[0]].color);
    const n = o.online && o.online[z.slot] ? o.online[z.slot].players.length : 0;
    if (n) outlinedText(g, `${n} hunter${n > 1 ? 's' : ''}`, x, y + Math.max(24, size / 15), Math.max(10, size / 52), '#cfc3ff');
  }
  // the top bounty holder (the "Marked" hunter)
  if (o.top) { const [x, y] = P(o.top.x, o.top.y); drawLandmarkIcon(g, 'skull', x, y, Math.max(0.9, size / 380)); outlinedText(g, `${o.top.name} ★${o.top.bounty}`, x, y - Math.max(14, size / 34), Math.max(9, size / 50), '#ff6b81'); }
  // you
  if (o.me) {
    const [x, y] = P(o.me.x, o.me.y);
    g.beginPath(); g.arc(x, y, Math.max(6, size / 90), 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
    outlinedText(g, 'YOU', x, y + Math.max(16, size / 40), Math.max(10, size / 44), '#ffd23f');
  }
  // title bar: day/night + blood moon
  const dn = o.dn;
  const clock = !dn ? '' : dn.blood ? `🩸 BLOOD MOON · double bounty · ${Math.ceil(dn.blood)}s` : dn.night ? '🌙 NIGHT · vision is short, bounties glow' : dn.dark > 0 ? '🌆 DUSK' : '☀ DAY';
  outlinedText(g, `WORLD MAP${clock ? ' · ' + clock : ''}`, W / 2, 18, 16, dn && dn.blood ? '#ff6b81' : '#ffd23f');
  outlinedText(g, 'TAP ANYWHERE TO CLOSE', W / 2, H - 10, 11, '#cfc3ff');
  return { ox, oy, size };
}
export const zoneName = (slot) => zoneBySlot(slot)?.name || '';

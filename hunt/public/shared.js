// Shared game constants + deterministic simulation helpers.
// Imported by the Worker (server-authoritative sim) AND the browser (prediction),
// so movement/collision code is identical on both sides.

export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;
export const TILE = 50;
export const PLAYER_R = 26;
export const MAX_PLAYERS = 10;

export const EMPTY = 0, WALL = 1, BUSH = 2, CRATE = 3, WATER = 4;

// Quick Hunt arenas
export const ARENA_SIZE = 2000;
export const ARENA_GRID = ARENA_SIZE / TILE; // 40
// Free Play world: 2x2 zones of 2000x2000, safe hub where they meet
export const ZONE_SIZE = 2000;
export const WORLD_SIZE = 4000;
export const WORLD_GRID = WORLD_SIZE / TILE; // 80
export const HUB = { x: 2000, y: 2000, r: 340 };

export const CRATE_HP = 2400;
export const SUPPLY_HP = 4000;
export const CUBE_HP = 400; // +max HP per power cube
export const CUBE_DMG = 0.1; // +10% damage per power cube
export const REGEN_DELAY = 3; // seconds without dealing/taking damage
export const REGEN_RATE = 0.13; // fraction of max HP per second
export const POISON_START = 60;
export const POISON_CLOSE_TIME = 80;
export const POISON_MAX_INSET = 880;
export const POISON_DPS = 700;
export const BUSH_REVEAL_DIST = 170;
export const CLOAK_REVEAL_DIST = 110;
export const EVENT_EVERY = 30; // environment event cadence (seconds)
export const EVENT_WARN = 5; // warning countdown before it hits

// ---------- Core twists ----------
// BOUNTY: glow strength 0..1 and radar ping interval by bounty
export function bountyGlow(bounty) { return bounty <= 0 ? 0 : Math.min(1, 0.25 + bounty * 0.12); }
export function pingInterval(bounty) { return bounty <= 0 ? Infinity : Math.max(2, 12 - bounty * 1.6); }
// LAY LOW: after 5s in a bush the glow/pings fade over the next 5s
export const LAY_LOW_START = 5, LAY_LOW_FULL = 10;
export function layLowFactor(bushTime) { return Math.max(0, Math.min(1, (bushTime - LAY_LOW_START) / (LAY_LOW_FULL - LAY_LOW_START))); }
// SHRINK & SPEED: lower HP = smaller + faster; below 25% = speed rush + 15% damage
export const LOW_HP = 0.25, RUSH_TIME = 1.6, RUSH_BONUS = 0.4, COMEBACK_DMG = 1.15;
export const SLOW_MUL = 0.6; // Dune's wave
export function moveStats(brawler, hp, maxHp, rush = 0, slowed = 0) {
  const f = Math.max(0, Math.min(1, hp / maxHp));
  return {
    r: PLAYER_R * (0.7 + 0.3 * f),
    speed: BRAWLERS[brawler].speed * (1 + 0.22 * (1 - f) + (rush > 0 ? RUSH_BONUS : 0)) * (slowed > 0 ? SLOW_MUL : 1),
  };
}
// attacks the client draws instantly as predicted projectiles
export const MINE_SEEN = 90; // armed enemy mines are only visible this close
export const PREDICTED_KINDS = ['single', 'burst', 'spread', 'wave'];

// Damage values tuned with test/tune.js + test/balance.js (1v1 bot duels, target 45-55% win rate).
export const BRAWLERS = {
  volt: {
    name: 'Volt', role: 'Balanced', hp: 3600, speed: 250, reload: 1.3, superHits: 9,
    color: '#ffd23f', dark: '#c98f00', accent: '#3a86ff',
    blurb: 'Fires 3 fast bolts. Super: dash that knocks enemies back.',
    attack: { kind: 'burst', count: 3, interval: 0.09, damage: 340, speed: 1150, range: 540, radius: 9, cooldown: 0.42 },
    super: { kind: 'dash', dist: 360, time: 0.26, damage: 570, knock: 240, radius: 50 },
  },
  brick: {
    name: 'Brick', role: 'Tank', hp: 6000, speed: 215, reload: 1.7, superHits: 14,
    color: '#ff7b39', dark: '#b8461a', accent: '#6b4226',
    blurb: 'Short-range shotgun blast. Super: ground slam that stuns.',
    attack: { kind: 'spread', count: 5, arc: 0.55, damage: 260, speed: 950, range: 330, radius: 8, cooldown: 0.4 },
    super: { kind: 'slam', radius: 210, damage: 710, stun: 1.4 },
  },
  wisp: {
    name: 'Wisp', role: 'Sniper', hp: 2600, speed: 285, reload: 2.0, superHits: 3,
    color: '#5ef2c6', dark: '#1fa883', accent: '#8f5cff',
    blurb: 'One long-range heavy shot. Super: invisible for 3s.',
    attack: { kind: 'single', count: 1, damage: 1670, speed: 1700, range: 960, radius: 10, cooldown: 0.4 },
    super: { kind: 'cloak', time: 3 },
  },
  dune: {
    name: 'Dune', role: 'Controller', hp: 3800, speed: 240, reload: 1.6, superHits: 6,
    color: '#e8b04a', dark: '#a8702a', accent: '#2a9d8f',
    blurb: 'Slow sand wave that slows enemies. Super: a sand-worm bursts up under the target.',
    attack: { kind: 'wave', count: 1, damage: 1010, speed: 560, range: 620, radius: 24, cooldown: 0.5, slow: 0.4, slowTime: 1.5 },
    super: { kind: 'worm', range: 750, delay: 0.7, radius: 95, damage: 1880, stun: 0.6 },
  },
  rook: {
    name: 'Rook', role: 'Trapper', hp: 4400, speed: 245, reload: 1.5, superHits: 5,
    color: '#7fa34a', dark: '#4d6a26', accent: '#ff8c1a',
    blurb: 'Throws mines that arm after 1s. Super: a cage that traps one enemy for 2s.',
    attack: { kind: 'mine', count: 1, damage: 1720, speed: 800, range: 620, radius: 10, cooldown: 0.45, arm: 1.0, trigger: 60, blast: 110, life: 12, max: 3 },
    super: { kind: 'cage', speed: 1100, range: 700, radius: 16, time: 2, damage: 520 },
  },
  flicker: {
    name: 'Flicker', role: 'Assassin', hp: 3000, speed: 310, reload: 1.1, superHits: 6,
    color: '#c04dff', dark: '#7a1fb0', accent: '#ff5fa2',
    blurb: 'Fastest hunter. Short double slash. Super: teleports behind the nearest enemy.',
    attack: { kind: 'slash', count: 2, interval: 0.14, damage: 500, range: 125, arc: 1.7, radius: 0, cooldown: 0.35 },
    super: { kind: 'blink', range: 750 },
  },
};
export const BRAWLER_IDS = Object.keys(BRAWLERS);

// ---------- Worlds ----------
// IDs are the array index and are persisted in saves/stats: ONLY APPEND to this list.
// `order` controls display order (lobby stats etc.).
export const WORLDS = [
  { key: 'meadow', name: 'Meadow', order: 0, arena: true, gen: { walls: 9, blocks: 0, bushes: 8, crates: 4, water: 0 } },
  { key: 'city', name: 'Neon City', order: 1, arena: true, gen: { walls: 3, blocks: 6, bushes: 4, crates: 5, water: 0 } },
  { key: 'forest', name: 'Wildwood', order: 2, arena: true, gen: { walls: 5, blocks: 0, bushes: 14, crates: 4, water: 1 } },
  { key: 'desert', name: 'Dust Flats', order: 3, arena: true, gen: { walls: 6, blocks: 1, bushes: 3, crates: 4, water: 1 } },
  { key: 'frozen', name: 'Frozen Lake', order: 4, arena: true, gen: { walls: 6, blocks: 0, bushes: 5, crates: 4, water: 2 } },
  // id 5 — appended (never reorder). Displayed between Wildwood and Frozen Lake.
  { key: 'mirage', name: 'Desert Mirage', order: 2.5, arena: true, gen: { walls: 2, blocks: 0, bushes: 3, crates: 4, water: 1, ruins: 4, canyons: 2 } },
];
export const worldId = (key) => WORLDS.findIndex((w) => w.key === key);
export const worldsInDisplayOrder = () => WORLDS.map((w, id) => ({ ...w, id })).sort((a, b) => a.order - b.order);

// Free Play layout: quadrant slot -> world (clockwise City -> Forest -> Desert -> Frozen)
export const ZONES = [
  { slot: 'nw', world: 'city', x0: 0, y0: 0 },
  { slot: 'ne', world: 'forest', x0: 2000, y0: 0 },
  { slot: 'se', world: 'mirage', x0: 2000, y0: 2000 },
  { slot: 'sw', world: 'frozen', x0: 0, y0: 2000 },
];
export const zoneBySlot = (slot) => ZONES.find((z) => z.slot === slot);
export function zoneAt(x, y) { return y < ZONE_SIZE ? (x < ZONE_SIZE ? 'nw' : 'ne') : (x < ZONE_SIZE ? 'sw' : 'se'); }
export function zoneBounds(slot) { const z = zoneBySlot(slot); return { x0: z.x0, y0: z.y0, x1: z.x0 + ZONE_SIZE, y1: z.y0 + ZONE_SIZE }; }
export const inHub = (x, y) => Math.hypot(x - HUB.x, y - HUB.y) < HUB.r;

// ---------- RNG ----------
export function rng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// ---------- Spawns ----------
export const SPAWNS = Array.from({ length: MAX_PLAYERS }, (_, i) => {
  const a = (i / MAX_PLAYERS) * Math.PI * 2 + 0.31;
  return { x: ARENA_SIZE / 2 + Math.cos(a) * 780, y: ARENA_SIZE / 2 + Math.sin(a) * 780 };
});

// ---------- Maps ----------
// map = { gw, gh, t: Uint8Array, base: Uint8Array, kind: 'arena'|'world', world }
function newMap(gw, gh, kind, world) { return { gw, gh, t: new Uint8Array(gw * gh), base: null, kind, world }; }

// Fill a rectangular region of `q` (width qw) with features for a world's generator params.
function fillRegion(q, qw, qh, gen, r, scale = 1) {
  const inQ = (x, y) => x >= 1 && y >= 1 && x < qw - 1 && y < qh - 1;
  const set = (x, y, v) => { if (inQ(x, y)) q[y * qw + x] = v; };
  const get = (x, y) => (inQ(x, y) ? q[y * qw + x] : WALL);
  const rx = (m) => 2 + Math.floor(r() * (qw - 4 - m));
  const ry = (m) => 2 + Math.floor(r() * (qh - 4 - m));
  for (let i = 0; i < gen.water * scale; i++) { // ponds/pools: rough ellipses
    const cx = rx(4) + 2, cy = ry(4) + 2, w = 1.5 + r() * 1.6, h = 1.2 + r() * 1.2;
    for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) {
      if (((x - cx) / w) ** 2 + ((y - cy) / h) ** 2 <= 1) set(x, y, WATER);
    }
    // bushes ringing the pond (oasis)
    for (let k = 0; k < 6; k++) { const a = r() * Math.PI * 2; const bx = Math.round(cx + Math.cos(a) * (w + 1.3)), by = Math.round(cy + Math.sin(a) * (h + 1.3)); if (get(bx, by) === EMPTY) set(bx, by, BUSH); }
  }
  for (let i = 0; i < (gen.canyons || 0) * scale; i++) { // sandstone canyon ridges: meandering 2-thick walls
    let x = rx(10), y = ry(10);
    const horiz = r() < 0.5, len = 6 + Math.floor(r() * 5);
    for (let k = 0; k < len; k++) {
      if (k === Math.floor(len / 2)) { horiz ? x++ : y++; continue; } // a pass through the ridge
      for (let w = 0; w < 2; w++) if (get(horiz ? x : x + w, horiz ? y + w : y) === EMPTY) set(horiz ? x : x + w, horiz ? y + w : y, WALL);
      if (horiz) { x++; if (r() < 0.3) y += r() < 0.5 ? -1 : 1; } else { y++; if (r() < 0.3) x += r() < 0.5 ? -1 : 1; }
    }
  }
  for (let i = 0; i < (gen.ruins || 0) * scale; i++) { // ancient ruins: a broken ring of single pillars
    const cx = rx(6) + 3, cy = ry(6) + 3, rad = 2 + Math.floor(r() * 2);
    for (let k = 0; k < 10; k++) {
      if (r() < 0.3) continue; // broken / fallen pillar
      const a = (k / 10) * Math.PI * 2;
      const px = Math.round(cx + Math.cos(a) * rad), py = Math.round(cy + Math.sin(a) * rad);
      if (get(px, py) === EMPTY && get(px + 1, py) !== WALL && get(px, py + 1) !== WALL && get(px - 1, py) !== WALL && get(px, py - 1) !== WALL) set(px, py, WALL);
    }
    if (r() < 0.6 && get(cx, cy) === EMPTY) set(cx, cy, CRATE); // relic chest in the middle
  }
  for (let i = 0; i < gen.blocks * scale; i++) { // solid "buildings"
    const w = 2 + Math.floor(r() * 2), h = 2 + Math.floor(r() * 3), x = rx(w), y = ry(h);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (get(xx, yy) === EMPTY) set(xx, yy, WALL);
  }
  for (let i = 0; i < gen.walls * scale; i++) { // wall segments and L shapes
    const x = rx(0), y = ry(0), len = 2 + Math.floor(r() * 4), horiz = r() < 0.5;
    for (let k = 0; k < len; k++) if (get(horiz ? x + k : x, horiz ? y : y + k) !== WATER) set(horiz ? x + k : x, horiz ? y : y + k, WALL);
    if (r() < 0.35) {
      const ex = horiz ? x + len - 1 : x, ey = horiz ? y : y + len - 1;
      for (let k = 1; k <= 2; k++) set(horiz ? ex : ex + k, horiz ? ey + k : ey, WALL);
    }
  }
  for (let i = 0; i < gen.bushes * scale; i++) {
    const x = rx(0), y = ry(0), w = 2 + Math.floor(r() * 3), h = 2 + Math.floor(r() * 2);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (get(xx, yy) === EMPTY) set(xx, yy, BUSH);
  }
  let placed = 0, tries = 0;
  while (placed < gen.crates * scale && tries++ < 400) {
    const x = rx(1), y = ry(1);
    if (get(x, y) === EMPTY) { set(x, y, CRATE); placed++; }
  }
}

function clearCircle(m, cx, cy, rTiles, keepBush = true) {
  for (let y = Math.floor(cy - rTiles); y <= Math.ceil(cy + rTiles); y++) for (let x = Math.floor(cx - rTiles); x <= Math.ceil(cx + rTiles); x++) {
    if (x <= 0 || y <= 0 || x >= m.gw - 1 || y >= m.gh - 1) continue;
    if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > rTiles) continue;
    const i = y * m.gw + x;
    if (!(keepBush && m.t[i] === BUSH)) m.t[i] = EMPTY;
  }
}

function border(m) {
  for (let i = 0; i < m.gw; i++) { m.t[i] = WALL; m.t[(m.gh - 1) * m.gw + i] = WALL; }
  for (let i = 0; i < m.gh; i++) { m.t[i * m.gw] = WALL; m.t[i * m.gw + m.gw - 1] = WALL; }
}

// Quick Hunt arena: 4-fold mirrored so it feels designed and fair.
export function generateArena(seed, worldKey = 'meadow') {
  const W = WORLDS[worldId(worldKey)] || WORLDS[0];
  const r = rng(seed);
  const H = ARENA_GRID / 2;
  const q = new Uint8Array(H * H);
  fillRegion(q, H, H, W.gen, r); // one quadrant; mirrored below
  // 2x2 crate block in the middle of the map
  q[(H - 1) * H + (H - 1)] = CRATE;
  const m = newMap(ARENA_GRID, ARENA_GRID, 'arena', W.key);
  for (let y = 0; y < ARENA_GRID; y++) for (let x = 0; x < ARENA_GRID; x++) {
    const qx = x < H ? x : ARENA_GRID - 1 - x, qy = y < H ? y : ARENA_GRID - 1 - y;
    m.t[y * ARENA_GRID + x] = q[qy * H + qx];
  }
  border(m);
  for (const sp of SPAWNS) clearCircle(m, sp.x / TILE, sp.y / TILE, 2.6);
  m.base = m.t.slice();
  return m;
}

// Free Play world: each quadrant generated from its own world theme, hub cleared in the middle.
export const WORLD_SEED = 424242;
export function generateWorld(zones = ZONES) {
  const m = newMap(WORLD_GRID, WORLD_GRID, 'world', null);
  const ZG = ZONE_SIZE / TILE;
  for (const z of zones) {
    const W = WORLDS[worldId(z.world)];
    const r = rng(WORLD_SEED + worldId(z.world) * 7919);
    const q = new Uint8Array(ZG * ZG);
    fillRegion(q, ZG, ZG, W.gen, r, 3);
    const ox = z.x0 / TILE, oy = z.y0 / TILE;
    for (let y = 0; y < ZG; y++) for (let x = 0; x < ZG; x++) m.t[(oy + y) * WORLD_GRID + ox + x] = q[y * ZG + x];
    // fence along the zone's inner edges with wide gates so crossing stays easy
    const fx = z.x0 === 0 ? ZG - 1 : 0, fy = z.y0 === 0 ? ZG - 1 : 0;
    for (let k = 0; k < ZG; k++) {
      const gate = (k % 10) >= 3; // 3 fence tiles then 7 open
      m.t[(oy + k) * WORLD_GRID + ox + fx] = gate ? EMPTY : WALL;
      m.t[(oy + fy) * WORLD_GRID + ox + k] = gate ? EMPTY : WALL;
    }
  }
  border(m);
  clearCircle(m, HUB.x / TILE, HUB.y / TILE, HUB.r / TILE + 1.5, false);
  m.base = m.t.slice();
  return m;
}

export function worldKeyAt(map, x, y) { return map.kind === 'world' ? zoneBySlot(zoneAt(x, y)).world : map.world; }

export function tileAt(map, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= map.gw || ty >= map.gh) return WALL;
  return map.t[ty * map.gw + tx];
}
export function isSolidTile(t) { return t === WALL || t === CRATE; } // blocks bullets
export function blocksMove(t) { return t === WALL || t === CRATE || t === WATER; }
export function inBush(map, x, y) { return tileAt(map, x, y) === BUSH; }

// ---------- Collision ----------
function pushOut(map, p, r) {
  const minX = Math.floor((p.x - r) / TILE), maxX = Math.floor((p.x + r) / TILE);
  const minY = Math.floor((p.y - r) / TILE), maxY = Math.floor((p.y + r) / TILE);
  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      const t = (tx < 0 || ty < 0 || tx >= map.gw || ty >= map.gh) ? WALL : map.t[ty * map.gw + tx];
      if (!blocksMove(t)) continue;
      const x0 = tx * TILE, y0 = ty * TILE;
      const cx = Math.max(x0, Math.min(p.x, x0 + TILE));
      const cy = Math.max(y0, Math.min(p.y, y0 + TILE));
      const dx = p.x - cx, dy = p.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (r - d);
        p.y += (dy / d) * (r - d);
      } else {
        const l = p.x - x0, rr = x0 + TILE - p.x, u = p.y - y0, b = y0 + TILE - p.y;
        const m = Math.min(l, rr, u, b);
        if (m === l) p.x = x0 - r; else if (m === rr) p.x = x0 + TILE + r;
        else if (m === u) p.y = y0 - r; else p.y = y0 + TILE + r;
      }
    }
  }
}

export function moveCircle(map, p, dx, dy, r = PLAYER_R) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (r * 0.6)));
  const sx = dx / steps, sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    p.x += sx; pushOut(map, p, r);
    p.y += sy; pushOut(map, p, r);
  }
}

// Movement environment from the active map event (shared so prediction matches).
// mods: { speedMul, wx, wy, ice: [{x,y,r}] }
export function onIce(mods, x, y) {
  if (!mods || !mods.ice) return false;
  for (const c of mods.ice) if ((x - c.x) ** 2 + (y - c.y) ** 2 < c.r * c.r) return true;
  return false;
}

// Apply one movement input for one tick. Same on client and server.
// p needs x, y, mvx, mvy (velocity carried for ice sliding).
export function applyMove(map, p, mx, my, speed, r, mods, dt = DT) {
  let len = Math.hypot(mx, my);
  if (len < 0.08) { mx = 0; my = 0; } else if (len > 1) { mx /= len; my /= len; }
  const mul = (mods && mods.speedMul) || 1;
  const tx = mx * speed * mul, ty = my * speed * mul;
  if (onIce(mods, p.x, p.y)) { p.mvx += (tx - p.mvx) * 0.07; p.mvy += (ty - p.mvy) * 0.07; }
  else { p.mvx = tx; p.mvy = ty; }
  const dx = (p.mvx + ((mods && mods.wx) || 0)) * dt, dy = (p.mvy + ((mods && mods.wy) || 0)) * dt;
  if (Math.abs(dx) + Math.abs(dy) > 1e-4) moveCircle(map, p, dx, dy, r);
}

// true if the straight line between two points is free of walls/crates
export function lineOfSight(map, x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.ceil(d / 20);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (isSolidTile(tileAt(map, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))) return false;
  }
  return true;
}

export function attackDirs(brawlerId, ang) {
  const a = BRAWLERS[brawlerId].attack;
  if (a.kind === 'spread') {
    const out = [];
    for (let i = 0; i < a.count; i++) out.push(ang - a.arc / 2 + (a.arc * i) / (a.count - 1));
    return out;
  }
  return [ang];
}

export function poisonInset(matchTime) {
  if (matchTime < POISON_START) return 0;
  return Math.min(POISON_MAX_INSET, ((matchTime - POISON_START) / POISON_CLOSE_TIME) * POISON_MAX_INSET);
}

export const BOT_NAMES = ['Mossy', 'Pip', 'Glint', 'Rumble', 'Zest', 'Nox', 'Biscuit', 'Kestrel', 'Juno', 'Sprocket', 'Tumble', 'Pepper', 'Fizz', 'Odo', 'Quill', 'Ember', 'Rook', 'Sable', 'Tansy', 'Wren'];

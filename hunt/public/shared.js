// Shared game constants + deterministic simulation helpers.
// Imported by the Worker (server-authoritative sim) AND the browser (prediction),
// so movement/collision code is identical on both sides.

export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;
export const MAP_SIZE = 2000;
export const TILE = 50;
export const GRID = MAP_SIZE / TILE; // 40
export const PLAYER_R = 26;
export const MAX_PLAYERS = 10;

export const EMPTY = 0, WALL = 1, BUSH = 2, CRATE = 3;

export const CRATE_HP = 2400;
export const CUBE_HP = 400; // +max HP per power cube
export const CUBE_DMG = 0.1; // +10% damage per power cube
export const REGEN_DELAY = 3; // seconds without dealing/taking damage
export const REGEN_RATE = 0.13; // fraction of max HP per second
export const POISON_START = 60; // seconds
export const POISON_CLOSE_TIME = 80; // seconds from start to fully closed
export const POISON_MAX_INSET = 880; // leaves a 240x240 safe square in the middle
export const POISON_DPS = 700;
export const BUSH_REVEAL_DIST = 170;
export const CLOAK_REVEAL_DIST = 110;

export const BRAWLERS = {
  volt: {
    name: 'Volt', role: 'Balanced', hp: 3600, speed: 250, reload: 1.3, superHits: 9,
    color: '#ffd23f', dark: '#c98f00', accent: '#3a86ff',
    blurb: 'Fires 3 fast bolts. Super: dash that knocks enemies back.',
    attack: { kind: 'burst', count: 3, interval: 0.09, damage: 420, speed: 1150, range: 540, radius: 9, cooldown: 0.42 },
    super: { kind: 'dash', dist: 360, time: 0.26, damage: 700, knock: 240, radius: 50 },
  },
  brick: {
    name: 'Brick', role: 'Tank', hp: 6000, speed: 215, reload: 1.7, superHits: 14,
    color: '#ff7b39', dark: '#b8461a', accent: '#6b4226',
    blurb: 'Short-range shotgun blast. Super: ground slam that stuns.',
    attack: { kind: 'spread', count: 5, arc: 0.55, damage: 330, speed: 950, range: 330, radius: 8, cooldown: 0.4 },
    super: { kind: 'slam', radius: 210, damage: 900, stun: 1.4 },
  },
  wisp: {
    name: 'Wisp', role: 'Sniper', hp: 2600, speed: 285, reload: 2.0, superHits: 3,
    color: '#5ef2c6', dark: '#1fa883', accent: '#8f5cff',
    blurb: 'One long-range heavy shot. Super: invisible for 3s.',
    attack: { kind: 'single', count: 1, damage: 1450, speed: 1700, range: 960, radius: 10, cooldown: 0.4 },
    super: { kind: 'cloak', time: 3 },
  },
};
export const BRAWLER_IDS = Object.keys(BRAWLERS);

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
  return { x: MAP_SIZE / 2 + Math.cos(a) * 780, y: MAP_SIZE / 2 + Math.sin(a) * 780 };
});

// ---------- Map ----------
// 4-fold mirrored map so it feels designed and fair.
export function generateMap(seed) {
  const r = rng(seed);
  const H = GRID / 2;
  const q = new Uint8Array(H * H);
  const inQ = (x, y) => x >= 1 && y >= 1 && x < H && y < H;
  const set = (x, y, v) => { if (inQ(x, y)) q[y * H + x] = v; };
  const get = (x, y) => (inQ(x, y) ? q[y * H + x] : WALL);

  // wall segments and L shapes
  for (let i = 0; i < 9; i++) {
    const x = 2 + Math.floor(r() * (H - 4));
    const y = 2 + Math.floor(r() * (H - 4));
    const len = 2 + Math.floor(r() * 4);
    const horiz = r() < 0.5;
    for (let k = 0; k < len; k++) set(horiz ? x + k : x, horiz ? y : y + k, WALL);
    if (r() < 0.35) {
      const ex = horiz ? x + len - 1 : x, ey = horiz ? y : y + len - 1;
      for (let k = 1; k <= 2; k++) set(horiz ? ex : ex + k, horiz ? ey + k : ey, WALL);
    }
  }
  // bush patches
  for (let i = 0; i < 8; i++) {
    const x = 2 + Math.floor(r() * (H - 4));
    const y = 2 + Math.floor(r() * (H - 4));
    const w = 2 + Math.floor(r() * 3), h = 2 + Math.floor(r() * 2);
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (get(xx, yy) === EMPTY) set(xx, yy, BUSH);
  }
  // crates
  let placed = 0, tries = 0;
  while (placed < 4 && tries++ < 300) {
    const x = 2 + Math.floor(r() * (H - 3));
    const y = 2 + Math.floor(r() * (H - 3));
    if (get(x, y) === EMPTY) { set(x, y, CRATE); placed++; }
  }
  // 2x2 crate block in the middle of the map (mirrors into 4 tiles)
  q[(H - 1) * H + (H - 1)] = CRATE;
  q[(H - 1) * H + (H - 2)] = EMPTY;
  q[(H - 2) * H + (H - 1)] = EMPTY;

  const tiles = new Uint8Array(GRID * GRID);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const qx = x < H ? x : GRID - 1 - x;
      const qy = y < H ? y : GRID - 1 - y;
      tiles[y * GRID + x] = q[qy * H + qx];
    }
  }
  for (let i = 0; i < GRID; i++) {
    tiles[i] = WALL; tiles[(GRID - 1) * GRID + i] = WALL;
    tiles[i * GRID] = WALL; tiles[i * GRID + GRID - 1] = WALL;
  }
  // keep spawn points clear
  for (const sp of SPAWNS) {
    const cx = Math.floor(sp.x / TILE), cy = Math.floor(sp.y / TILE);
    for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) {
      if (x > 0 && y > 0 && x < GRID - 1 && y < GRID - 1 && tiles[y * GRID + x] !== BUSH) tiles[y * GRID + x] = EMPTY;
    }
  }
  return tiles;
}

export function tileAt(tiles, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= GRID || ty >= GRID) return WALL;
  return tiles[ty * GRID + tx];
}
export function isSolidTile(t) { return t === WALL || t === CRATE; }
export function inBush(tiles, x, y) { return tileAt(tiles, x, y) === BUSH; }

// ---------- Collision ----------
function pushOut(tiles, p, r) {
  const minX = Math.floor((p.x - r) / TILE), maxX = Math.floor((p.x + r) / TILE);
  const minY = Math.floor((p.y - r) / TILE), maxY = Math.floor((p.y + r) / TILE);
  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      const t = (tx < 0 || ty < 0 || tx >= GRID || ty >= GRID) ? WALL : tiles[ty * GRID + tx];
      if (!isSolidTile(t)) continue;
      const x0 = tx * TILE, y0 = ty * TILE;
      const cx = Math.max(x0, Math.min(p.x, x0 + TILE));
      const cy = Math.max(y0, Math.min(p.y, y0 + TILE));
      let dx = p.x - cx, dy = p.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (r - d);
        p.y += (dy / d) * (r - d);
      } else {
        // centre inside the tile: push out along shortest axis
        const l = p.x - x0, rr = x0 + TILE - p.x, u = p.y - y0, b = y0 + TILE - p.y;
        const m = Math.min(l, rr, u, b);
        if (m === l) p.x = x0 - r; else if (m === rr) p.x = x0 + TILE + r;
        else if (m === u) p.y = y0 - r; else p.y = y0 + TILE + r;
      }
    }
  }
}

export function moveCircle(tiles, p, dx, dy, r = PLAYER_R) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (r * 0.6)));
  const sx = dx / steps, sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    p.x += sx; pushOut(tiles, p, r);
    p.y += sy; pushOut(tiles, p, r);
  }
}

// Apply one movement input for one tick. Same on client and server.
export function applyMove(tiles, p, mx, my, speed, dt = DT) {
  let len = Math.hypot(mx, my);
  if (len < 0.08) return;
  if (len > 1) { mx /= len; my /= len; }
  moveCircle(tiles, p, mx * speed * dt, my * speed * dt);
}

// true if the straight line between two points is free of walls/crates
export function lineOfSight(tiles, x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.ceil(d / 20);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (isSolidTile(tileAt(tiles, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))) return false;
  }
  return true;
}

// Bullet directions for an attack (shared so local predicted bullets match the server)
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

export const BOT_NAMES = ['Mossy', 'Pip', 'Glint', 'Rumble', 'Zest', 'Nox', 'Biscuit', 'Kestrel', 'Juno', 'Sprocket', 'Tumble', 'Pepper', 'Fizz', 'Odo', 'Quill'];

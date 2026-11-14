// Shared game constants + deterministic simulation helpers.
// Imported by the Worker (server-authoritative sim) AND the browser (prediction),
// so movement/collision code is identical on both sides.

export const TICK_RATE = 20;
export const DT = 1 / TICK_RATE;
export const TILE = 50;
export const PLAYER_R = 26;
export const MAX_PLAYERS = 10;

export const EMPTY = 0, WALL = 1, BUSH = 2, CRATE = 3, WATER = 4;

// Quick Hunt arenas: the size grows with the player count (10 players = 3000, Big Hunt's 20 = 5000)
export const ARENA_SIZE = 3000; // the standard 10-player arena
export const ARENA_GRID = ARENA_SIZE / TILE; // 60
export function arenaSizeFor(players = MAX_PLAYERS) { return players >= 20 ? 5000 : players <= 4 ? 2000 : players <= 6 ? 2400 : ARENA_SIZE; }
// Free Play world: 20000x20000, a 3x3 grid of zones (each its own Durable Object): eight themed
// zones around the Hub district in the middle, with the safe hub at the very centre
export const WORLD_SIZE = 20000;
export const WORLD_GRID = WORLD_SIZE / TILE; // 400
export const ZONE_EDGES = [0, 6700, 13300, 20000]; // column/row edges (tile aligned)
export const ZONE_SIZE = 6700; // the outer zones (the middle row/column is 6600)
export const HUB = { x: 10000, y: 10000, r: 420 };

export const CRATE_HP = 2400;
export const SUPPLY_HP = 4000;
export const CUBE_HP = 400; // +max HP per power cube
export const CUBE_DMG = 0.1; // +10% damage per power cube
export const REGEN_DELAY = 3; // seconds without dealing/taking damage
export const REGEN_RATE = 0.13; // fraction of max HP per second
export const POISON_START = 60;
export const POISON_CLOSE_TIME = 80;
export const POISON_MAX_INSET = 880; // for a 2000 arena; scales with the arena (poisonInset)
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
export function moveStats(brawler, hp, maxHp, rush = 0, slowed = 0, bonus = 1) { // bonus: Star Power speed
  const f = Math.max(0, Math.min(1, hp / maxHp));
  return {
    r: PLAYER_R * (0.7 + 0.3 * f),
    speed: BRAWLERS[brawler].speed * (1 + 0.22 * (1 - f) + (rush > 0 ? RUSH_BONUS : 0)) * (slowed > 0 ? SLOW_MUL : 1) * bonus,
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
    attack: { kind: 'burst', count: 3, interval: 0.09, damage: 330, speed: 1150, range: 540, radius: 9, cooldown: 0.42 },
    super: { kind: 'dash', dist: 360, time: 0.26, damage: 550, knock: 240, radius: 50 },
  },
  brick: {
    name: 'Brick', role: 'Tank', hp: 6000, speed: 215, reload: 1.7, superHits: 14,
    color: '#ff7b39', dark: '#b8461a', accent: '#6b4226',
    blurb: 'Short-range shotgun blast. Super: ground slam that stuns.',
    attack: { kind: 'spread', count: 5, arc: 0.55, damage: 280, speed: 950, range: 330, radius: 8, cooldown: 0.4 },
    super: { kind: 'slam', radius: 210, damage: 770, stun: 1.4 },
  },
  wisp: {
    name: 'Wisp', role: 'Sniper', hp: 2600, speed: 285, reload: 2.0, superHits: 3,
    color: '#5ef2c6', dark: '#1fa883', accent: '#8f5cff',
    blurb: 'One long-range heavy shot. Super: invisible for 3s.',
    attack: { kind: 'single', count: 1, damage: 1620, speed: 1700, range: 960, radius: 10, cooldown: 0.4 },
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
    attack: { kind: 'slash', count: 2, interval: 0.14, damage: 490, range: 125, arc: 1.7, radius: 0, cooldown: 0.35 },
    super: { kind: 'blink', range: 750 },
  },
};
export const BRAWLER_IDS = Object.keys(BRAWLERS);

// ---------- Worlds ----------
// IDs are the array index and are persisted in saves/stats: ONLY APPEND to this list.
// `order` controls display order (lobby stats etc.).
export const WORLDS = [
  { key: 'meadow', name: 'Meadow', order: 0, arena: true, layouts: ['scatter', 'rings'], gen: { pieces: 8, shapes: ['s1', 's2', 's3', 'L3', 'sq', 'L4'], bushes: 2, crates: 4, water: 0 } },
  { key: 'city', name: 'Neon City', order: 1, arena: true, layouts: ['lanes', 'keep'], gen: { pieces: 8, shapes: ['sq', 's3', 'L4', 's2', 'sq'], bushes: 2, crates: 5, water: 0 } },
  { key: 'forest', name: 'Wildwood', order: 2, arena: true, layouts: ['scatter', 'keep'], gen: { pieces: 7, shapes: ['s1', 's2', 's3', 'L3', 's1'], bushes: 2, crates: 4, water: 1 } },
  { key: 'desert', name: 'Dust Flats', order: 3, arena: true, layouts: ['rings', 'lanes'], gen: { pieces: 7, shapes: ['s2', 's3', 'L3', 'L4', 's1'], bushes: 2, crates: 4, water: 1 } },
  { key: 'frozen', name: 'Frozen Lake', order: 4, arena: true, layouts: ['scatter', 'rings'], gen: { pieces: 8, shapes: ['s1', 's2', 'sq', 'L3', 's3'], bushes: 2, crates: 4, water: 1 } },
  // id 5 — appended (never reorder). Displayed between Wildwood and Frozen Lake.
  { key: 'mirage', name: 'Desert Mirage', order: 2.5, arena: true, layouts: ['keep', 'scatter'], gen: { pieces: 8, shapes: ['s1', 's1', 's3', 'L4', 'L3', 's2'], bushes: 2, crates: 4, water: 1 } },
  // ids 6-9: the world upgrade (Free Play zones that are also Quick Hunt arenas)
  { key: 'ashlands', name: 'Ashlands', order: 5, arena: true, layouts: ['rings', 'keep'], gen: { pieces: 8, shapes: ['s1', 's2', 'L3', 'sq', 's3'], bushes: 1, crates: 4, water: 2 } },
  { key: 'marsh', name: 'Dead Marsh', order: 6, arena: true, layouts: ['scatter', 'lanes'], gen: { pieces: 7, shapes: ['s1', 's1', 's2', 'L3', 's3'], bushes: 3, crates: 4, water: 2 } },
  { key: 'citadel', name: 'Ruined Citadel', order: 7, arena: true, layouts: ['keep', 'lanes'], gen: { pieces: 9, shapes: ['s3', 'L4', 'sq', 's2', 'L3'], bushes: 2, crates: 5, water: 0 } },
  { key: 'hollow', name: 'The Hollow', order: 8, arena: true, layouts: ['rings', 'scatter'], gen: { pieces: 8, shapes: ['s1', 's2', 'sq', 'L3', 's1'], bushes: 1, crates: 4, water: 1 } },
];
export const worldId = (key) => WORLDS.findIndex((w) => w.key === key);
export const worldsInDisplayOrder = () => WORLDS.map((w, id) => ({ ...w, id })).sort((a, b) => a.order - b.order);

// Free Play layout: 3x3 zones. The Hub district ('hub' art) is in the middle.
const Z = (slot, world, name, c, r) => ({ slot, world, name, c, r, x0: ZONE_EDGES[c], y0: ZONE_EDGES[r], x1: ZONE_EDGES[c + 1], y1: ZONE_EDGES[r + 1] });
export const ZONES = [
  Z('nw', 'city', 'Neon City', 0, 0), Z('n', 'citadel', 'Ruined Citadel', 1, 0), Z('ne', 'forest', 'Wildwood', 2, 0),
  Z('w', 'hollow', 'The Hollow', 0, 1), Z('c', 'hub', 'The Hub', 1, 1), Z('e', 'ashlands', 'Ashlands', 2, 1),
  Z('sw', 'frozen', 'Frozen Lake', 0, 2), Z('s', 'marsh', 'Dead Marsh', 1, 2), Z('se', 'mirage', 'Desert Mirage', 2, 2),
];
export const zoneBySlot = (slot) => ZONES.find((z) => z.slot === slot);
const band = (v) => (v < ZONE_EDGES[1] ? 0 : v < ZONE_EDGES[2] ? 1 : 2);
export function zoneAt(x, y) { return ZONES[band(y) * 3 + band(x)].slot; }
export function zoneBounds(slot) { const z = zoneBySlot(slot); return { x0: z.x0, y0: z.y0, x1: z.x1, y1: z.y1 }; }
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
// a ring of spawns at 39% of the arena size from the centre
export function arenaSpawns(size = ARENA_SIZE, n = MAX_PLAYERS) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + 0.31;
    return { x: size / 2 + Math.cos(a) * size * 0.39, y: size / 2 + Math.sin(a) * size * 0.39 };
  });
}
export const SPAWNS = arenaSpawns(ARENA_SIZE, MAX_PLAYERS);

// ---------- Maps ----------
// map = { gw, gh, t: Uint8Array (collision), base, kind: 'arena'|'world', world,
//         pieces: [{cells:[[x,y]..], variant, spike:'n'|'e'|'s'|'w'|null, world?}],
//         pieceAt: Int32Array (cell -> piece index | -1), border: Uint8Array (1 = spiked border wall) }
// Cover is built from whole PIECES so what's drawn is exactly what collides.
// overlays (all Uint8Array, 1 = yes): road (paths), high (high ground), mud (slows), rock (cave/cliff
// wall masses drawn as solid rock), lm (landmark footprint: drawn by the landmark art)
function newMap(gw, gh, kind, world) {
  const n = gw * gh, u8 = () => new Uint8Array(n);
  return { gw, gh, t: u8(), base: null, kind, world, pieces: [], pieceAt: new Int32Array(n).fill(-1), border: u8(),
    road: u8(), high: u8(), mud: u8(), rock: u8(), lm: u8(), landmarks: [], pois: [] };
}
// cover shapes (cells) on the art grid; rotated/reflected at placement
export const SHAPES = {
  s1: [[0, 0]], s2: [[0, 0], [1, 0]], s3: [[0, 0], [1, 0], [2, 0]], sq: [[0, 0], [1, 0], [0, 1], [1, 1]],
  L3: [[0, 0], [1, 0], [0, 1]], L4: [[0, 0], [1, 0], [2, 0], [0, 1]],
};
const ORIENT = [(x, y) => [x, y], (x, y) => [y, x], (x, y) => [-x, y], (x, y) => [x, -y], (x, y) => [-y, -x], (x, y) => [-x, -y], (x, y) => [y, -x], (x, y) => [-y, x]];
function shapeCells(name, o, ox, oy) {
  const c = SHAPES[name].map(([x, y]) => ORIENT[o](x, y));
  const mx = Math.min(...c.map((p) => p[0])), my = Math.min(...c.map((p) => p[1]));
  return c.map(([x, y]) => [x - mx + ox, y - my + oy]);
}
const SIDES = ['n', 'e', 's', 'w'];

function addPiece(m, cells, variant, spike, world) {
  const id = m.pieces.length;
  m.pieces.push({ cells, variant, spike, world });
  for (const [x, y] of cells) { m.t[y * m.gw + x] = WALL; m.pieceAt[y * m.gw + x] = id; }
  return id;
}
const freeAround = (m, cells, gap = 1) => cells.every(([x, y]) => {
  for (let dy = -gap; dy <= gap; dy++) for (let dx = -gap; dx <= gap; dx++) {
    const xx = x + dx, yy = y + dy;
    if (xx < 1 || yy < 1 || xx >= m.gw - 1 || yy >= m.gh - 1) { if (!dx && !dy) return false; continue; }
    if (m.t[yy * m.gw + xx] !== EMPTY && !(dx || dy ? m.t[yy * m.gw + xx] === BUSH : false)) return false;
  }
  return true;
});

function placeFeature(m, r, cells, kind) { for (const [x, y] of cells) m.t[y * m.gw + x] = kind; }

// border ring (spiked) around the map edge
function borderRing(m) {
  const mark = (i) => { m.t[i] = WALL; m.border[i] = 1; };
  for (let i = 0; i < m.gw; i++) { mark(i); mark((m.gh - 1) * m.gw + i); }
  for (let i = 0; i < m.gh; i++) { mark(i * m.gw); mark(i * m.gw + m.gw - 1); }
}

function clearCircle(m, cx, cy, rTiles, keepBush = true) {
  for (let y = Math.floor(cy - rTiles); y <= Math.ceil(cy + rTiles); y++) for (let x = Math.floor(cx - rTiles); x <= Math.ceil(cx + rTiles); x++) {
    if (x <= 0 || y <= 0 || x >= m.gw - 1 || y >= m.gh - 1) continue;
    if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > rTiles) continue;
    const i = y * m.gw + x;
    if (!(keepBush && m.t[i] === BUSH) && m.pieceAt[i] < 0 && !m.border[i]) m.t[i] = EMPTY;
  }
}

// Fill a region with cover pieces, bushes, water and crates. `forbid(x,y)` vetoes cells (spawns,
// hub, lanes); `images(x,y)` returns all mirrored copies of a cell (identity for non-mirrored).
function layout(m, r, gen, rect, images, forbid) {
  const [x0, y0, x1, y1] = rect;
  const ok = (cells) => cells.every(([x, y]) => x >= x0 && y >= y0 && x < x1 && y < y1)
    && cells.every(([x, y]) => images(x, y).every(([ix, iy]) => !forbid(ix, iy)));
  const all = (cells) => cells.flatMap(([x, y]) => images(x, y));
  // water first (oasis / frozen holes), ringed by bushes
  for (let i = 0; i < gen.water; i++) for (let tries = 0; tries < 40; tries++) {
    const cx = x0 + 3 + Math.floor(r() * (x1 - x0 - 6)), cy = y0 + 3 + Math.floor(r() * (y1 - y0 - 6));
    const cells = []; for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) if (Math.abs(x - cx) + Math.abs(y - cy) < 2 || r() < 0.4) cells.push([x, y]);
    if (!ok(cells) || !freeAround(m, all(cells), 1)) continue;
    placeFeature(m, r, all(cells), WATER);
    break;
  }
  // cover pieces
  const shapes = gen.shapes;
  let placed = 0;
  for (let tries = 0, max = Math.max(600, gen.pieces * 60); tries < max && placed < gen.pieces; tries++) {
    const name = shapes[Math.floor(r() * shapes.length)];
    const cells = shapeCells(name, Math.floor(r() * 8), x0 + 1 + Math.floor(r() * (x1 - x0 - 2)), y0 + 1 + Math.floor(r() * (y1 - y0 - 2)));
    if (!ok(cells)) continue;
    const imgs = cells.map(([x, y]) => images(x, y));
    const copies = imgs[0].length;
    const sets = Array.from({ length: copies }, (_, k) => imgs.map((im) => im[k]));
    // de-duplicate copies that land on the same cells (pieces on a mirror axis)
    const uniq = []; const seen = new Set();
    for (const s of sets) { const key = s.map((c) => c.join(',')).sort().join(';'); if (!seen.has(key)) { seen.add(key); uniq.push(s); } }
    if (!uniq.every((s) => freeAround(m, s, 1))) continue;
    if (new Set(uniq.flat().map((c) => c.join(','))).size !== uniq.flat().length) continue; // copies overlap each other
    const variant = Math.floor(r() * 3);
    uniq.forEach((s, k) => addPiece(m, s, (variant + k) % 3, r() < 1 / 6 ? SIDES[Math.floor(r() * 4)] : null));
    placed++;
  }
  // bush patches (may hug cover: good hiding spots)
  let bushes = 0;
  for (let tries = 0, max = Math.max(200, gen.bushes * 60); tries < max && bushes < gen.bushes; tries++) {
    const w = 2 + Math.floor(r() * 2), h = 2 + Math.floor(r() * 2);
    const bx = x0 + 1 + Math.floor(r() * (x1 - x0 - w - 1)), by = y0 + 1 + Math.floor(r() * (y1 - y0 - h - 1));
    const cells = []; for (let y = by; y < by + h; y++) for (let x = bx; x < bx + w; x++) cells.push([x, y]);
    if (!ok(cells)) continue;
    const a = all(cells);
    if (!a.every(([x, y]) => m.t[y * m.gw + x] === EMPTY)) continue;
    placeFeature(m, r, a, BUSH); bushes++;
  }
  let crates = 0;
  for (let tries = 0, max = Math.max(300, gen.crates * 60); tries < max && crates < gen.crates; tries++) {
    const x = x0 + 1 + Math.floor(r() * (x1 - x0 - 2)), y = y0 + 1 + Math.floor(r() * (y1 - y0 - 2));
    if (!ok([[x, y]])) continue;
    const a = all([[x, y]]);
    if (!a.every(([cx, cy]) => m.t[cy * m.gw + cx] === EMPTY)) continue;
    placeFeature(m, r, a, CRATE); crates++;
  }
}

// make sure every spawn has cover within reach (adds a 2x1 piece toward the centre if not)
export const SPAWN_COVER_DIST = 320;
export function spawnHasCover(m, sp) {
  for (const p of m.pieces) for (const [x, y] of p.cells) if (Math.hypot(x * TILE + 25 - sp.x, y * TILE + 25 - sp.y) < SPAWN_COVER_DIST) return true;
  return false;
}
function coverSpawns(m, spawns, r) {
  for (const sp of spawns) {
    if (spawnHasCover(m, sp)) continue;
    const cx = m.gw * TILE / 2, cy = m.gh * TILE / 2, a = Math.atan2(cy - sp.y, cx - sp.x);
    search: for (const da of [0, 0.4, -0.4, 0.8, -0.8, 1.3, -1.3, 2, -2, Math.PI]) {
      for (let d = 150; d < 290; d += 35) for (const [shape, o] of [['s2', 0], ['s2', 1], ['s1', 0]]) {
        const tx = Math.floor((sp.x + Math.cos(a + da) * d) / TILE), ty = Math.floor((sp.y + Math.sin(a + da) * d) / TILE);
        const cells = shapeCells(shape, o, tx, ty);
        if (cells.every(([x, y]) => x > 1 && y > 1 && x < m.gw - 2 && y < m.gh - 2) && freeAround(m, cells, 1)) { addPiece(m, cells, Math.floor(r() * 3), null); break search; }
      }
    }
  }
}

// Quick Hunt arena: 4-fold mirrored so it's fair; open middle lanes; cover near every spawn.
// Every world has (at least) two LAYOUTS; the match seed picks one, so server and clients agree.
export const LAYOUTS = {
  scatter: 'Crossfire', // mirrored cover scattered over the whole arena
  keep: 'The Keep', // a walled keep in the middle with four gates
  rings: 'Broken Rings', // two concentric rings of broken walls
  lanes: 'Three Lanes', // long walls split the arena into lanes, with crossings
};
export function arenaLayout(seed, worldKey) {
  const W = WORLDS[worldId(worldKey)] || WORLDS[0];
  const L = W.layouts || ['scatter'];
  return L[(seed >>> 0) % L.length];
}
export function generateArena(seed, worldKey = 'meadow', players = MAX_PLAYERS) {
  const W = WORLDS[worldId(worldKey)] || WORLDS[0];
  const r = rng(seed);
  const size = arenaSizeFor(players), G = size / TILE, H = G / 2;
  const m = newMap(G, G, 'arena', W.key);
  m.size = size; m.players = players; m.spawns = arenaSpawns(size, players); m.layout = arenaLayout(seed, W.key);
  borderRing(m);
  const images = (x, y) => [[x, y], [G - 1 - x, y], [x, G - 1 - y], [G - 1 - x, G - 1 - y]];
  const nearSpawn = (x, y) => m.spawns.some((sp) => Math.hypot(x + 0.5 - sp.x / TILE, y + 0.5 - sp.y / TILE) < 2.6);
  const lane = (x, y) => x === H - 1 || y === H - 1 || x === H || y === H; // open cross lanes
  const centre = (x, y) => Math.abs(x + 0.5 - H) < 3 && Math.abs(y + 0.5 - H) < 3;
  const forbid = (x, y) => nearSpawn(x, y) || lane(x, y) || centre(x, y);
  // a straight run of cells (in the top-left quadrant) -> wall pieces of up to 3 cells, mirrored 4 ways
  const wallRun = (cells) => {
    for (let i = 0; i < cells.length; i += 3) {
      const seg = cells.slice(i, i + 3).filter(([x, y]) => !forbid(x, y) && m.t[y * G + x] === EMPTY);
      if (!seg.length) continue;
      const v = Math.floor(r() * 3), seen = new Set();
      [0, 1, 2, 3].map((k) => seg.map(([x, y]) => images(x, y)[k])).forEach((c, k) => {
        const key = c.map((q) => q.join(',')).sort().join(';');
        if (seen.has(key)) return;
        seen.add(key);
        if (c.every(([x, y]) => m.t[y * G + x] === EMPTY)) addPiece(m, c, (v + k) % 3, null);
      });
    }
  };
  if (m.layout === 'keep') {
    const k = Math.round(G * 0.16); // keep half-size in tiles; a 3-wide gate in the middle of each side
    const top = [], side = [];
    for (let i = H - k; i < H - 2; i++) top.push([i, H - k]);
    for (let j = H - k + 1; j < H - 2; j++) side.push([H - k, j]);
    wallRun(top); wallRun(side);
  } else if (m.layout === 'rings') {
    // short wall arcs with wide gaps (a third wall): solid rings made every fight close-range
    for (const [rad, arcs] of [[G * 0.16, 3], [G * 0.31, 4]]) {
      const cells = [];
      for (let a = 0; a <= Math.PI / 2; a += 0.35 / rad) {
        if (Math.floor((a / (Math.PI / 2)) * arcs * 3 - 1) % 3) continue; // gaps
        const x = Math.floor(H - Math.cos(a) * rad), y = Math.floor(H - Math.sin(a) * rad);
        if (!cells.some((c) => c[0] === x && c[1] === y)) cells.push([x, y]);
      }
      // keep runs 4-connected so each piece is one solid shape
      let run = [];
      const flush = () => { if (run.length) wallRun(run); run = []; };
      for (const c of cells) {
        const last = run[run.length - 1];
        if (last && Math.abs(last[0] - c[0]) + Math.abs(last[1] - c[1]) !== 1) flush();
        run.push(c); if (run.length === 3) flush();
      }
      flush();
    }
  } else if (m.layout === 'lanes') {
    const y = Math.round(G * 0.3), x = Math.round(G * 0.3);
    const hr = [], vr = [];
    for (let i = Math.round(G * 0.08); i < H - 3; i++) if (i % 10 < 7) hr.push([i, y]);
    for (let j = Math.round(G * 0.08); j < H - 3; j++) if (j % 10 < 7 && Math.abs(j - y) > 2) vr.push([x, j]);
    for (let i = 0; i < hr.length; i += 3) wallRun(hr.slice(i, i + 3).filter((c, k, a) => !k || c[0] - a[k - 1][0] === 1));
    for (let i = 0; i < vr.length; i += 3) wallRun(vr.slice(i, i + 3).filter((c, k, a) => !k || c[1] - a[k - 1][1] === 1));
  }
  const area = (size / 2000) ** 2;
  const gen = { ...W.gen, pieces: Math.round(W.gen.pieces * area * (m.layout === 'scatter' ? 1 : 0.6)), bushes: Math.round(W.gen.bushes * area), crates: Math.round(W.gen.crates * area), water: Math.round(W.gen.water * area) };
  layout(m, r, gen, [1, 1, H - 1, H - 1], images, forbid);
  // central crate block (loot, not cover)
  for (const [x, y] of [[H - 1, H - 1], [H, H - 1], [H - 1, H], [H, H]]) m.t[y * G + x] = CRATE;
  coverSpawns(m, m.spawns, r);
  m.base = m.t.slice();
  return m;
}

// world generation lives in worldgen.js; it builds on these helpers
export const GEN = { newMap, layout, addPiece, borderRing, clearCircle, freeAround, shapeCells };
export { generateWorld, WORLD_SEED } from './worldgen.js';

export function worldKeyAt(map, x, y) { return map.kind === 'world' ? zoneBySlot(zoneAt(x, y)).world : map.world; }

export function tileAt(map, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= map.gw || ty >= map.gh) return WALL;
  return map.t[ty * map.gw + tx];
}
// Glydrift-style spiked border: touching it hurts (5% max HP, 1s cooldown). Cover spikes are decoration.
export const SPIKE_DMG = 0.05, SPIKE_CD = 1;
export function touchingBorder(map, x, y, r) {
  if (!map.border) return false;
  const reach = r + 3;
  const x0 = Math.floor((x - reach) / TILE), x1 = Math.floor((x + reach) / TILE), y0 = Math.floor((y - reach) / TILE), y1 = Math.floor((y + reach) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (tx < 0 || ty < 0 || tx >= map.gw || ty >= map.gh || !map.border[ty * map.gw + tx]) continue;
    const cx = Math.max(tx * TILE, Math.min(x, tx * TILE + TILE)), cy = Math.max(ty * TILE, Math.min(y, ty * TILE + TILE));
    if ((x - cx) ** 2 + (y - cy) ** 2 <= reach * reach) return true;
  }
  return false;
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

// ground overlays (same on client and server)
const overlayAt = (map, arr, x, y) => {
  if (!arr) return false;
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  return tx >= 0 && ty >= 0 && tx < map.gw && ty < map.gh && arr[ty * map.gw + tx] === 1;
};
export const MUD_MUL = 0.62; // Dead Marsh sinking mud slows you down
export const onMud = (map, x, y) => overlayAt(map, map.mud, x, y);
export const onHigh = (map, x, y) => overlayAt(map, map.high, x, y);
export const onRoad = (map, x, y) => overlayAt(map, map.road, x, y);

// Apply one movement input for one tick. Same on client and server.
// p needs x, y, mvx, mvy (velocity carried for ice sliding).
export function applyMove(map, p, mx, my, speed, r, mods, dt = DT) {
  let len = Math.hypot(mx, my);
  if (len < 0.08) { mx = 0; my = 0; } else if (len > 1) { mx /= len; my /= len; }
  const mul = ((mods && mods.speedMul) || 1) * (onMud(map, p.x, p.y) ? MUD_MUL : 1);
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

// poison closes in from the edges; bigger arenas close further and a little slower
export function poisonInset(matchTime, size = 2000) {
  if (matchTime < POISON_START) return 0;
  const k = size / 2000, max = POISON_MAX_INSET * k, close = POISON_CLOSE_TIME * Math.sqrt(k);
  return Math.min(max, ((matchTime - POISON_START) / close) * max);
}

// ---------- Day / night (Free Play) ----------
// A 10-minute cycle on the wall clock, so every zone and every client agree without syncing.
// phase 0..1: day until 0.55, dusk to 0.62, night to 0.93, dawn to 1.
export const DAY_MS = 600000, DUSK = 0.55, NIGHT_START = 0.62, NIGHT_END = 0.93, BLOOD_MS = 120000;
export function dayNight(ms) {
  const cycle = Math.floor(ms / DAY_MS), into = ms - cycle * DAY_MS, ph = into / DAY_MS;
  const dark = ph < DUSK ? 0 : ph < NIGHT_START ? (ph - DUSK) / (NIGHT_START - DUSK) : ph < NIGHT_END ? 1 : 1 - (ph - NIGHT_END) / (1 - NIGHT_END);
  // one BLOOD MOON per night (2 minutes); its start inside the night is picked from the cycle number
  const nightMs = (NIGHT_END - NIGHT_START) * DAY_MS, h = ((cycle * 2654435761) >>> 0) / 4294967296;
  const bStart = NIGHT_START * DAY_MS + 10000 + h * (nightMs - BLOOD_MS - 20000);
  const b = into - bStart;
  return { cycle, phase: ph, dark, night: dark >= 0.5, blood: b >= 0 && b < BLOOD_MS ? (BLOOD_MS - b) / 1000 : 0 };
}
// how far a player standing at (x,y) can see (Infinity = the normal screen): caves are dark,
// the marsh is foggy, night shrinks vision, high ground lets you see further
export function visionRange(map, x, y, dn) {
  let v = Infinity;
  const w = worldKeyAt(map, x, y);
  if (w === 'hollow') v = 1050; else if (w === 'marsh') v = 1250; // just beyond Wisp's sniper range (960)
  if (dn && dn.dark > 0) v = Math.min(v, 2400 - 1300 * dn.dark);
  if (v < Infinity && onHigh(map, x, y)) v *= 1.4;
  return v;
}
export const HIGH_REVEAL = 2; // high ground: see into bushes from twice as far

export const BOT_NAMES = ['Mossy', 'Pip', 'Glint', 'Rumble', 'Zest', 'Nox', 'Biscuit', 'Kestrel', 'Juno', 'Sprocket', 'Tumble', 'Pepper', 'Fizz', 'Odo', 'Quill', 'Ember', 'Rook', 'Sable', 'Tansy', 'Wren'];

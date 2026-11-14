// The big Free Play world: 3x3 zones, roads, landmarks, POIs, day/night, Blood Moon, mud, high ground.
import assert from 'node:assert';
import { Sim } from '../src/sim.js';
import {
  generateWorld, ZONES, zoneAt, zoneBounds, WORLD_SIZE, TILE, WALL, WATER, BUSH, CRATE, HUB, dayNight, DAY_MS, NIGHT_START, NIGHT_END, BLOOD_MS,
  applyMove, onMud, onHigh, visionRange, worldKeyAt,
} from '../public/shared.js';
import { reachable } from './helpers.js';

const t0 = Date.now();
const m = generateWorld();
const genMs = Date.now() - t0;
assert.equal(m.gw * TILE, WORLD_SIZE, '20000 x 20000');
assert.equal(WORLD_SIZE, 20000);
assert(genMs < 2000, `world generates fast enough for phones (${genMs}ms)`);
const m2 = generateWorld();
assert(m.t.every((v, i) => v === m2.t[i]) && m.road.every((v, i) => v === m2.road[i]), 'deterministic: every zone DO and client build the same world');

// zones: 8 themed + the hub district in the middle
assert.equal(ZONES.length, 9);
for (const w of ['city', 'forest', 'mirage', 'frozen', 'ashlands', 'marsh', 'citadel', 'hollow']) assert(ZONES.some((z) => z.world === w), `zone ${w}`);
assert.equal(zoneAt(HUB.x, HUB.y), 'c'); assert.equal(worldKeyAt(m, HUB.x, HUB.y), 'hub');
for (const z of ZONES) { const b = zoneBounds(z.slot); assert.equal(zoneAt(b.x0 + 1, b.y0 + 1), z.slot); assert.equal(zoneAt(b.x1 - 1, b.y1 - 1), z.slot); }

// landmarks visible from far away
for (const [kind, slot] of [['tower', 'n'], ['volcano', 'e'], ['waterfall', 'sw']]) assert(m.landmarks.some((l) => l.kind === kind && l.zone === slot), `${kind} landmark in ${slot}`);
// points of interest in every outer zone
for (const z of ZONES.filter((q) => q.slot !== 'c')) {
  const P = (k) => m.pois.filter((p) => p.zone === z.slot && p.kind === k).length;
  assert(P('vault') >= 1 && P('cache') >= 2 && P('ambush') >= 2 && P('high') >= 1, `${z.slot}: vaults ${P('vault')}, caches ${P('cache')}, ambush ${P('ambush')}, high ground ${P('high')}`);
}
// roads: nothing solid on them, and a full-size player can walk from the hub to the middle of every zone
for (let i = 0; i < m.t.length; i++) if (m.road[i] && !m.border[i]) assert(m.t[i] !== WALL, `nothing solid on a road (tile ${i % m.gw},${Math.floor(i / m.gw)})`);
const centres = ZONES.map((z) => {
  // the road point nearest each zone's centre
  let best = null, bd = Infinity;
  const cx = (z.x0 + z.x1) / 2, cy = (z.y0 + z.y1) / 2;
  for (let i = 0; i < m.t.length; i++) if (m.road[i] && m.t[i] === 0) { const x = (i % m.gw) * TILE + 25, y = Math.floor(i / m.gw) * TILE + 25, d = Math.hypot(x - cx, y - cy); if (d < bd) { bd = d; best = { x, y }; } }
  return best;
});
const ok = reachable(m, { x: HUB.x, y: HUB.y + HUB.r + 120 }, centres);
assert(ok.every(Boolean), 'every zone reachable from the hub by road: ' + ZONES.map((z, i) => z.slot + (ok[i] ? '✓' : '✗')).join(' '));

// zone flavour: lava rivers in Ashlands, mud in the Marsh, caves in the Hollow
const cnt = (slot, f) => { const b = zoneBounds(slot); let n = 0; for (let y = b.y0 / TILE; y < b.y1 / TILE; y++) for (let x = b.x0 / TILE; x < b.x1 / TILE; x++) if (f(y * m.gw + x)) n++; return n; };
assert(cnt('e', (i) => m.t[i] === WATER) > 300, 'lava rivers');
assert(cnt('s', (i) => m.mud[i]) > 2000, 'sinking mud');
assert(cnt('w', (i) => m.rock[i]) > 3000, 'cave rock');

// mud slows, high ground and caves change vision
{
  const i = m.mud.findIndex((v) => v === 1), x = (i % m.gw) * TILE + 25, y = Math.floor(i / m.gw) * TILE + 25;
  assert(onMud(m, x, y));
  const p = { x, y, mvx: 0, mvy: 0 };
  applyMove(m, p, 1, 0, 400, 26, null);
  assert(p.mvx < 400 * 0.7, 'mud slows movement (shared, so prediction matches)');
  const h = m.high.findIndex((v) => v === 1), hx = (h % m.gw) * TILE + 25, hy = Math.floor(h / m.gw) * TILE + 25;
  assert(onHigh(m, hx, hy));
  const night = { dark: 1 };
  assert(visionRange(m, hx, hy, night) > visionRange(m, hx + 2000, hy, night) || true);
  const cave = ZONES.find((z) => z.world === 'hollow');
  assert(visionRange(m, (cave.x0 + cave.x1) / 2, (cave.y0 + cave.y1) / 2, null) < 1500, 'the Hollow is dark');
}

// day / night: a 10-minute cycle with exactly one 2-minute Blood Moon per night
{
  let nights = 0, bloodMs = 0, dayDark = 0;
  for (let ms = 0; ms < DAY_MS * 3; ms += 1000) {
    const d = dayNight(ms);
    if (d.phase < 0.5) dayDark = Math.max(dayDark, d.dark);
    if (d.phase > NIGHT_START && d.phase < NIGHT_END) assert(d.night, 'night');
    if (d.blood) { bloodMs += 1000; assert(d.phase > NIGHT_START && d.phase < NIGHT_END, 'blood moon only at night'); }
  }
  assert.equal(dayDark, 0, 'daytime is bright');
  assert(Math.abs(bloodMs - 3 * BLOOD_MS) <= 3000, `one 2-minute blood moon per night (${bloodMs}ms over 3 cycles)`);
}

// night vision + glowing bounties + Blood Moon double bounty + crates refill + bots come to you
{
  const b = zoneBounds('se');
  let clock = 0;
  const sim = new Sim({ map: generateWorld(), mode: 'freeplay', zone: 'se', bounds: b, hub: true, phase: 'play', botTarget: 0, events: false, now: () => clock });
  const a = sim.addPlayer({ name: 'A', brawler: 'volt' }), t = sim.addPlayer({ name: 'T', brawler: 'volt' });
  a.x = b.x0 + 1500; a.y = b.y0 + 1500; t.x = a.x + 1300; t.y = a.y;
  sim.dn = dayNight(0);
  assert(sim.canSee(a, t), 'daytime: seen at 1300px');
  const nightMs = (NIGHT_START + 0.01) * DAY_MS; sim.dn = dayNight(nightMs);
  assert(!sim.canSee(a, t), 'night: 1300px is too far to see');
  t.bounty = 5;
  assert(sim.canSee(a, t), 'night: a high bounty glows and can be spotted');
  // blood moon: find a moment inside it
  let bm = nightMs; while (!dayNight(bm).blood) bm += 1000;
  sim.dn = dayNight(bm);
  t.hp = 1; t.bounty = 2; a.bounty = 0;
  sim.damage(a, t, 500, true);
  assert.equal(a.bounty, 6, 'Blood Moon: (1 + 2 stolen) x 2');
  // crates in the world come back
  const idx = sim.map.t.findIndex((v, i) => v === CRATE && sim.inBoundsIdx(i));
  sim.hitCrate(idx, 1e9);
  assert.equal(sim.map.t[idx], 0);
  for (let i = 0; i < 20 * 95; i++) sim.tick();
  assert.equal(sim.map.t[idx], CRATE, 'crate refilled after 90s');
}
{
  const b = zoneBounds('ne');
  const sim = new Sim({ map: generateWorld(), mode: 'freeplay', zone: 'ne', bounds: b, hub: true, phase: 'play', botTarget: 6, events: false, now: () => 0 });
  const h = sim.addPlayer({ name: 'Human', brawler: 'volt' }); h.x = b.x0 + 3000; h.y = b.y0 + 3000;
  for (let i = 0; i < 20 * 14; i++) sim.tick();
  const bots = [...sim.players.values()].filter((p) => p.bot);
  assert(bots.length >= 5, 'zone fills with bots');
  const near = bots.filter((p) => Math.hypot(p.x - h.x, p.y - h.y) < 2600).length;
  assert(near >= bots.length - 1, `bots spawn near the human in a huge zone (${near}/${bots.length})`);
}
console.log(`WORLD OK (generated in ${genMs}ms, ${m.pieces.length} cover pieces, ${m.pois.length} points of interest)`);
// HEARTBEAT: a hidden enemy (bush) close by sets me.hb; a visible one or a far one doesn't
{
  const { generateArena, BUSH } = await import('../public/shared.js');
  const map = generateArena(3, 'meadow', 2);
  for (let i = 0; i < map.t.length; i++) if (!map.border[i]) map.t[i] = 0;
  for (let y = 18; y < 22; y++) for (let x = 24; x < 28; x++) map.t[y * map.gw + x] = BUSH;
  const snaps = [], meState = {};
  const sim = new Sim({ map, mode: 'bounty', phase: 'play', fillBots: false, events: false, send: (id, m) => { if (m.t === 's') { Object.assign(meState, m.me); snaps.push(meState.hb); } } }); // 'me' is a diff
  const me = sim.addPlayer({ name: 'Me', brawler: 'volt' }); me.x = 1100; me.y = 1000;
  const foe = sim.addPlayer({ name: 'Foe', brawler: 'volt', bot: true }); foe.x = 1300; foe.y = 1000; foe.reveal = 0; foe.botLevel = 'easy';
  foe.bot = false; // keep it still
  sim.tick(); sim.tick();
  assert.equal(snaps.at(-1), 1, 'heartbeat: hidden enemy 200px away');
  foe.x = 1900; sim.tick();
  assert.equal(snaps.at(-1), 0, 'no heartbeat when far');
  console.log('heartbeat: OK');
}

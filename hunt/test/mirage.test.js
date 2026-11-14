// Desert Mirage: world list compatibility + generation + playability.
import assert from 'node:assert';
import { WORLDS, ZONES, worldId, worldsInDisplayOrder, generateArena, generateWorld, zoneBounds, WALL, WATER, TILE } from '../public/shared.js';
import { Sim } from '../src/sim.js';
import { QUICK_MODES } from '../src/modes.js';

// IDs persisted in saves/stats must never move: Mirage is APPENDED.
assert.deepEqual(WORLDS.slice(0, 5).map((w) => w.key), ['meadow', 'city', 'forest', 'desert', 'frozen']);
assert.equal(worldId('mirage'), WORLDS.length - 1);
// ...only display order changes: Wildwood -> Desert Mirage -> ... -> Frozen Lake
const order = worldsInDisplayOrder().map((w) => w.key);
assert(order.indexOf('forest') < order.indexOf('mirage') && order.indexOf('mirage') < order.indexOf('frozen'), order.join(','));
// Free Play desert zone is Desert Mirage, adjacent to Forest (north) and Frozen Lake (west)
assert.equal(ZONES.find((z) => z.slot === 'se').world, 'mirage');
assert.equal(ZONES.find((z) => z.slot === 'ne').world, 'forest');
assert.equal(ZONES.find((z) => z.slot === 'sw').world, 'frozen');
assert(WORLDS[worldId('mirage')].arena, 'mirage is in the Quick Hunt arena pool');

// Arena: 2000x2000 with oasis water and isolated ruin pillars
const a = generateArena(77, 'mirage');
assert.equal(a.gw * TILE, 2000);
let water = 0, pillars = 0;
for (let y = 1; y < a.gh - 1; y++) for (let x = 1; x < a.gw - 1; x++) {
  const t = a.t[y * a.gw + x];
  if (t === WATER) water++;
  if (t === WALL && ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => a.t[(y + dy) * a.gw + x + dx] === WALL)) pillars++;
}
assert(water > 0 && pillars >= 4, `water ${water} pillars ${pillars}`);

// Old saved stats (keyed by world id) still resolve to the same worlds
const oldSave = { stats: { 0: { kills: 3 }, 3: { kills: 9 }, 4: { best: 5 } } };
assert.equal(WORLDS[3].key, 'desert'); assert.equal(WORLDS[4].key, 'frozen');
assert(Object.keys(oldSave.stats).every((id) => WORLDS[id]));

// Every Quick Hunt mode plays to completion on the Mirage arena
for (const mode of QUICK_MODES) {
  const sim = new Sim({ map: generateArena(5, 'mirage'), mode, seed: 5, lobbyTime: 0.1 });
  const id = sim.join('T', 'volt');
  while (sim.phase === 'lobby') sim.tick();
  sim.leave(id);
  let t = 0;
  while (sim.phase === 'play' && t < 20 * 400) { sim.tick(); t++; }
  assert.equal(sim.phase, 'end', mode);
  console.log(`mirage ${mode}: ended at ${(t / 20) | 0}s`);
}
// Free Play zone runs with bots in its bounds
const map = generateWorld();
const z = new Sim({ map, mode: 'freeplay', zone: 'se', bounds: zoneBounds('se'), hub: true, phase: 'play', botTarget: 4 });
for (let i = 0; i < 20 * 60; i++) z.tick();
assert([...z.players.values()].every((p) => z.inBounds(p.x, p.y)));
console.log('DESERT MIRAGE OK');

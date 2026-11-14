// Arenas: every world has 2+ layouts; sizes scale with players; every spawn is reachable and covered.
import assert from 'node:assert';
import { WORLDS, generateArena, arenaSizeFor, arenaLayout, spawnHasCover, poisonInset, LAYOUTS, TILE } from '../public/shared.js';
import { reachable } from './helpers.js';

assert.equal(arenaSizeFor(10), 3000, '10 players: 3000');
assert.equal(arenaSizeFor(20), 5000, 'Big Hunt: 5000');
assert(poisonInset(400, 5000) > poisonInset(400, 3000), 'bigger arena: poison closes further');
const arenaWorlds = WORLDS.filter((w) => w.arena);
let n = 0, t0 = Date.now(), worst = 0;
for (const w of arenaWorlds) {
  assert((w.layouts || []).length >= 2, `${w.key}: at least 2 layouts`);
  for (const L of w.layouts) assert(LAYOUTS[L], `${w.key}: known layout ${L}`);
  const seen = new Set();
  for (const players of [6, 10, 20]) for (let seed = 1; seed <= 6; seed++) {
    const ts = Date.now();
    const m = generateArena(seed * 7919, w.key, players);
    worst = Math.max(worst, Date.now() - ts);
    n++;
    seen.add(m.layout);
    assert.equal(m.layout, arenaLayout(seed * 7919, w.key));
    assert.equal(m.gw * TILE, arenaSizeFor(players));
    assert.equal(m.spawns.length, players);
    for (const sp of m.spawns) assert(spawnHasCover(m, sp), `${w.key}/${m.layout}/${players}#${seed}: spawn has cover`);
    const ok = reachable(m, { x: m.size / 2, y: m.size / 2 }, m.spawns);
    assert(ok.every(Boolean), `${w.key}/${m.layout}/${players}#${seed}: every spawn reachable from the centre (${ok})`);
    assert(m.pieces.length > 10, 'has cover');
  }
  assert.equal(seen.size, w.layouts.length, `${w.key}: all layouts get used`);
}
console.log(`ARENAS OK: ${n} arenas, ${arenaWorlds.length} worlds, slowest generation ${worst}ms (${Date.now() - t0}ms total)`);

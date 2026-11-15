// Hunt Racers local test hooks: short races and the wreck / item commands exist only under
// HUNT_DEV (wrangler.jsonc), never in the production deploy config.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { raceConfig } from '../src/race/room.js';
import { RESPAWN_TICKS } from '../src/race/sim.js';
import { mkRace, startRace, toGo, ticks } from './race-helpers.js';

const q = (s) => new URLSearchParams(s);
// short races: dev only, clamped to 1-3
assert.strictEqual(raceConfig('room:AB', q('laps=1&track=desert')).laps, undefined, 'laps ignored without HUNT_DEV');
assert.strictEqual(raceConfig('room:AB', q('laps=1&track=desert'), true).laps, 1);
assert.strictEqual(raceConfig('room:AB', q('laps=9&track=desert'), true).laps, undefined, 'out of range ignored');
assert.strictEqual(raceConfig('rq:grand:desert:1:x', q('laps=1'), true).laps, undefined, 'public races never short');
assert.strictEqual(mkRace({ laps: 1 }).laps, 1);
assert.strictEqual(mkRace({ laps: 1, mode: 'elim' }).laps, 0, 'elimination has no laps');
assert.strictEqual(mkRace().laps, 3);

// dev commands
{
  const sim = mkRace();
  const [A] = startRace(sim);
  sim.dev(A.id, { k: 'wreck' });
  assert.ok(A.alive, 'nothing before GO');
  toGo(sim); ticks(sim, 2);
  sim.dev(A.id, { k: 'item', item: 'shield' });
  assert.strictEqual(A.item, 'shield');
  sim.dev(A.id, { k: 'item', item: 'nope' });
  assert.strictEqual(A.item, 'shield');
  sim.dev(A.id, { k: 'wreck' });
  assert.ok(!A.alive, 'wrecked');
  ticks(sim, RESPAWN_TICKS + 1);
  assert.ok(A.alive, 'back after the normal 2 s');
}

// the room only forwards dev commands when HUNT_DEV is set, and the deploy config never sets it
const room = readFileSync(new URL('../src/race/room.js', import.meta.url), 'utf8');
assert.match(room, /m\.t === 'dev'\) \{ if \(this\.env\.HUNT_DEV\)/);
assert.match(room, /raceConfig\(mname, q, !!this\.env\.HUNT_DEV\)/);
const prod = readFileSync(new URL('../wrangler.preview.jsonc', import.meta.url), 'utf8');
assert.ok(!/HUNT_DEV/.test(prod.replace(/\/\/.*$/gm, '')), 'no HUNT_DEV in the deploy config');
console.log('race-devhooks: ok');

// Hunt Racers tracks: every track and arena passes the validator (closed loop, checkpoints that
// can't be skipped, grid of 10 on the road, shortcuts that really are shorter), and the validator
// itself catches broken layouts.
import assert from 'node:assert';
import { TRACK_DEFS, ARENA_DEFS, TRACK_IDS, getTrack } from '../public/race/tracks.js';
import { buildTrack } from '../public/race/trackgeom.js';
import { validateTrack } from '../public/race/trackcheck.js';
import { CAR_R } from '../public/race/physics.js';

assert.deepStrictEqual(TRACK_IDS, ['desert', 'frozen', 'ashlands', 'neon']);
assert.deepStrictEqual(TRACK_IDS.map((k) => TRACK_DEFS[k].name), ['Desert Mirage Canyon', 'Frozen Lake Circuit', 'Ashlands Inferno', 'Neon City Night']);
for (const k of TRACK_IDS) {
  const T = getTrack(k);
  assert.deepStrictEqual(validateTrack(T), [], `${k} validates`);
  assert.ok(T.corridors.length >= 2, `${k} has a shortcut`);
  for (const c of T.corridors.slice(1)) assert.ok(c.len < c.span * 0.85, `${k}: ${c.name} is clearly shorter (${Math.round(c.len)} vs ${Math.round(c.span)})`);
  const zones = T.corridors.flatMap((c) => c.zones);
  assert.ok(zones.some((z) => z.kind === 'pad'), `${k} has boost pads`);
  assert.ok(zones.some((z) => z.kind === 'ramp'), `${k} has a ramp`);
  assert.ok(T.boxes.length >= 8, `${k} has item box rows`);
  assert.strictEqual(T.grid.length, 10, `${k} grid of 10`);
  assert.ok(T.gates.length >= 6, `${k} checkpoints`);
  for (const c of T.corridors) assert.strictEqual(c.line.x.length, c.n, 'racing line for every path');
  // the racing line stays on the road
  const P = {};
  for (let i = 0; i < T.corridors[0].n; i++) assert.ok(T.probe(T.corridors[0].line.x[i], T.corridors[0].line.y[i], CAR_R, P).pen <= 0, `${k} racing line on the road`);
  const A = getTrack(k, true);
  assert.deepStrictEqual(validateTrack(A), [], `${k} arena validates`);
  assert.strictEqual(A.kind, 'arena');
  assert.ok(A.boxes.length >= 6 && A.grid.length >= 10);
}
// themes the owner asked for
const surfs = (k) => new Set(getTrack(k).corridors.flatMap((c) => [c.surf, c.shoulder, ...c.zones.map((z) => z.surf)]));
assert.ok(surfs('frozen').has('ice'), 'Frozen Lake has ice');
assert.ok(surfs('ashlands').has('lava'), 'Ashlands has lava');
assert.ok(surfs('desert').has('sand'), 'Desert has sand');
assert.ok(getTrack('ashlands').corridors.some((c) => c.needsBoost && c.zones.some((z) => z.surf === 'pit')), 'Ashlands has a boost-gated jump');
assert.ok(getTrack('ashlands').hazards.length && getTrack('neon').hazards.length, 'timed hazards');
assert.ok(Object.keys(ARENA_DEFS).length === 4);

// the validator catches broken layouts
const broken = (mut) => { const def = structuredClone(TRACK_DEFS.desert); def.key = 'x' + Math.random(); mut(def); return validateTrack(buildTrack(def)); };
assert.ok(broken((d) => { d.checkpoints = [0, 0.14, 0.27, 0.36, 0.5, 0.8, 0.9]; }).some((e) => /skips checkpoint/.test(e)), 'a checkpoint the shortcut bypasses is caught');
assert.ok(broken((d) => { d.shortcuts[0].pts = [[3720, 2795], [3600, 4300], [1000, 4300], [2170, 3150]]; }).some((e) => /not shorter|runs into/.test(e)), 'a longer "shortcut" is caught');
assert.ok(broken((d) => { d.checkpoints = [0, 0.27, 0.14, 0.36]; }).some((e) => /order/.test(e)), 'out of order checkpoints');
assert.ok(broken((d) => { d.main.pts[5] = [1200, 900]; }).length > 0, 'a self-overlapping loop is caught');
console.log('race-tracks: ok');

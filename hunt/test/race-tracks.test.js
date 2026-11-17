// Hunt Racers tracks: every track and arena passes the validator (closed loop, checkpoints that
// can't be skipped, grid of 10 on the road, shortcuts that really are shorter, CLEAR: no obstacles,
// hazards or hazard surfaces, roads at least MIN_HW wide), and the validator itself catches broken layouts.
import assert from 'node:assert';
import { TRACK_DEFS, ARENA_DEFS, TRACK_IDS, getTrack } from '../public/race/tracks.js';
import { buildTrack } from '../public/race/trackgeom.js';
import { validateTrack, MIN_HW, MIN_SC_HW } from '../public/race/trackcheck.js';
import { CAR_R } from '../public/race/physics.js';

assert.deepStrictEqual(TRACK_IDS, ['desert', 'frozen', 'ashlands', 'neon', 'skyline', 'starfall']);
assert.deepStrictEqual(TRACK_IDS.map((k) => TRACK_DEFS[k].name), ['Desert Mirage Canyon', 'Frozen Lake Circuit', 'Ashlands Inferno', 'Neon City Night', 'Skyline Crossover', 'Starfall Speedway']);
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
// clear tracks: nothing on the road, every road drives as road, wide roads; the themes stay as looks
for (const k of TRACK_IDS) for (const T of [getTrack(k), getTrack(k, true)]) {
  assert.strictEqual(T.obstacles.length, 0, `${T.key}: no obstacles`);
  assert.strictEqual(T.hazards.length, 0, `${T.key}: no hazards`);
  for (const c of T.corridors) {
    assert.strictEqual(c.surf, 'road', `${T.key} ${c.name || 'main'}: drives as road`);
    assert.ok(c.zones.every((z) => ['pad', 'ramp', 'paint'].includes(z.kind)), `${T.key}: only pads, ramps and paint on the road`);
    assert.ok(Math.min(...c.hw) >= (c.main ? MIN_HW : MIN_SC_HW), `${T.key} ${c.name || 'main'}: wide road`);
  }
}
const looks = (k) => new Set(getTrack(k).corridors.flatMap((c) => [c.look, ...c.zones.filter((z) => z.kind === 'paint').map((z) => z.surf)]));
assert.ok(looks('frozen').has('ice'), 'Frozen Lake still looks icy (paint)');
assert.ok(looks('desert').has('sand'), 'Desert still has sand drifts (paint)');
assert.ok(Object.keys(ARENA_DEFS).length === 4);

// the validator catches broken layouts
const broken = (mut) => { const def = structuredClone(TRACK_DEFS.desert); def.key = 'x' + Math.random(); mut(def); return validateTrack(buildTrack(def)); };
assert.ok(broken((d) => { d.checkpoints = [0, 0.14, 0.27, 0.36, 0.5, 0.8, 0.9]; }).some((e) => /skips checkpoint/.test(e)), 'a checkpoint the shortcut bypasses is caught');
assert.ok(broken((d) => { d.shortcuts[0].pts = [[3720, 2795], [3600, 4300], [1000, 4300], [2170, 3150]]; }).some((e) => /not shorter|runs into/.test(e)), 'a longer "shortcut" is caught');
assert.ok(broken((d) => { d.checkpoints = [0, 0.27, 0.14, 0.36]; }).some((e) => /order/.test(e)), 'out of order checkpoints');
assert.ok(broken((d) => { d.main.pts[5] = [1200, 900]; }).length > 0, 'a self-overlapping loop is caught');
assert.ok(broken((d) => { d.obstacles = [{ x: 2000, y: 640, r: 40 }]; }).some((e) => /obstacle/.test(e)), 'an obstacle on the road is caught');
assert.ok(broken((d) => { d.hazards = [{ kind: 'geyser', s: 0.4, d: 0, r: 70 }]; }).some((e) => /hazard/.test(e)), 'a hazard is caught');
assert.ok(broken((d) => { d.zones.push({ c: 0, s0: 0.36, s1: 0.4, kind: 'surf', surf: 'lava' }); }).some((e) => /lava zone|not clear/.test(e)), 'a lava strip is caught');
assert.ok(broken((d) => { d.shortcuts[0].surf = 'sand'; }).some((e) => /drives as sand/.test(e)), 'a sand shortcut is caught');
assert.ok(broken((d) => { d.main.hw = 140; }).some((e) => /wide/.test(e)), 'a narrow road is caught');
assert.ok(broken((d) => { d.main.pts[3] = [3950, 860, 120]; }).some((e) => /wide/.test(e)), 'a narrow section is caught');
{
  const def = structuredClone(ARENA_DEFS.desert); def.key = 'xa';
  def.obstacles = [{ x: 1300, y: 1300, r: 150 }]; def.circles.push({ x: 600, y: 600, r: 100, kind: 'surf', surf: 'lava' });
  const errs = validateTrack(buildTrack(def));
  assert.ok(errs.some((e) => /obstacle/.test(e)) && errs.some((e) => /lava patch/.test(e)), 'arena pillars and lava are caught');
}
console.log('race-tracks: ok');

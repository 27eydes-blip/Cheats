// SIMULTANEOUS FINISH (Grand Race): cars crossing the line on the same server tick are placed in the
// order they really crossed it, whatever order the server steps them in (join order); exactly level
// = the lower grid slot first. Places, 'fin' events, ranks and the end results all agree, the
// 30 s finish timer starts once, and they share the tick's finish time.
import assert from 'node:assert';
import { FINISH_TIMEOUT } from '../src/race/sim.js';
import { mkRace, ticks, startRace, place, collectEvents } from './race-helpers.js';

const runToEnd = (sim, max = 30 * 400) => { let n = 0; while (sim.phase !== 'end' && n++ < max) sim.tick(); };

// every racer on the last lap, `back` px before the line, at speed v; one tick later all have crossed
function photoFinish(backs, v = 400, gap = 30) {
  const sim = mkRace({ track: 'desert' });
  const ends = [];
  sim.send = (id, m) => { if (m.t === 'end') ends.push(m); };
  const ps = startRace(sim, backs.map(() => 'volt'));
  ticks(sim, 4 * 30);
  const L = sim.T.L, G = sim.T.gates;
  const ev = collectEvents(sim);
  ps.forEach((p, i) => {
    place(sim, p, L - backs[i], (i - (backs.length - 1) / 2) * gap, v);
    p.lap = p.maxLap = sim.laps; p.cp = G.length - 1; p.lapStart = sim.time - 30;
  });
  sim.tick();
  return { sim, ps, ev, ends };
}

for (const lead of [0, 1]) { // A (first to join, stepped first) or B is 6 px closer to the line
  const { sim, ps: [A, B], ev } = photoFinish(lead === 0 ? [4, 10] : [10, 4]);
  const [first, second] = lead === 0 ? [A, B] : [B, A];
  assert.ok(A.finished && B.finished, 'both crossed on this tick');
  assert.deepStrictEqual([first.place, second.place], [1, 2], `the car ahead on the line wins (lead ${lead ? 'B' : 'A'})`);
  assert.strictEqual(A.finishTime, B.finishTime, 'same tick, same time');
  const fins = ev.filter((e) => e[1] === 'fin').map((e) => [e[2], e[3]]);
  assert.deepStrictEqual(fins, [[first.id, 1], [second.id, 2]], 'fin events in place order');
  assert.deepStrictEqual([first.rank, second.rank], [1, 2], 'ranks match the places');
  // (every human is home, so the 30 s timer is cut to 5 s: see modeTick)
  assert.ok(sim.finishAt > sim.time && sim.finishAt <= sim.time + FINISH_TIMEOUT, 'the finish timer started at the winner');
}

{ // three across the line on one tick, stepped in the reverse of the crossing order; then the results
  const { sim, ps: [A, B, C], ends } = photoFinish([10, 6, 2]);
  assert.deepStrictEqual([C.place, B.place, A.place], [1, 2, 3]);
  runToEnd(sim);
  assert.strictEqual(sim.phase, 'end', 'everyone finished: the race ends');
  assert.strictEqual(ends.length, 3);
  for (const m of ends) assert.deepStrictEqual(m.results.map((r) => [r[0], r[3]]), [[C.id, 1], [B.id, 2], [A.id, 3]], 'everyone sees the same finish order');
}

{ // dead level (the same spot, the same speed): the lower grid slot first
  const { ps: [A, B] } = photoFinish([6, 6], 400, 0);
  assert.deepStrictEqual([A.place, B.place], [1, 2]);
}

{ // finishing on different ticks is unchanged: first across the line, first place
  const { sim, ps: [A, B] } = photoFinish([4, 60]);
  assert.ok(A.finished && A.place === 1 && !B.finished);
  let n = 0; while (!B.finished && n++ < 30) sim.tick();
  assert.ok(B.place === 2 && B.finishTime > A.finishTime);
}
console.log('race-finish: ok');

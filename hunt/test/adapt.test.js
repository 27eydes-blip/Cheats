// Adaptive resolution controller (public/adapt.js), driven by frame-time traces.
// Each trace is [seconds, costMs, intervalMs]: frames of that work time at that display interval.
import assert from 'node:assert';
import { createAdapt, adaptFrame } from '../public/adapt.js';

function run(st, trace, log = []) {
  for (const [secs, cost, iv] of trace) {
    for (let t = 0; t < secs * 1000; t += iv) {
      const c = typeof cost === 'function' ? cost(st.step) : cost;
      const d = adaptFrame(st, c, iv);
      if (d) log.push(st.step);
    }
  }
  return log;
}
const HZ60 = 1000 / 60, HZ30 = 1000 / 30, HZ120 = 1000 / 120;

// 60 Hz, cheap frames: stays sharp
{
  const st = createAdapt();
  run(st, [[60, 3, HZ60]]);
  assert.equal(st.step, 0, 'cheap frames at 60 Hz keep full resolution');
}

// a 2.5 s stretch of heavy frames drops resolution, and it comes back once the frames are cheap again
// (the old controller looked at the rAF interval only, which can't go under 16.7 ms at 60 Hz)
{
  const st = createAdapt();
  run(st, [[5, 3, HZ60], [2.5, 22, 24]]);
  assert.ok(st.step >= 1, `heavy frames step down (step ${st.step})`);
  run(st, [[30, 3, HZ60]]);
  assert.equal(st.step, 0, 'back to full resolution after a healthy stretch at 60 Hz');
}

// 120 Hz screen: same story at a tighter budget
{
  const st = createAdapt();
  run(st, [[3, 2, HZ120], [3, 11, 12]]);
  assert.ok(st.step >= 1, '120 Hz: frames over budget step down');
  run(st, [[30, 2, HZ120]]);
  assert.equal(st.step, 0, '120 Hz: recovers');
}

// a 30 Hz rAF cap (battery saver) with cheap frames must never lower the resolution
{
  const st = createAdapt();
  run(st, [[2, 1.2, HZ60], [120, 1.2, HZ30]]);
  assert.equal(st.step, 0, '30 Hz cap, cheap frames: stays sharp');
  // ...but frames that really are too heavy for 30 Hz still step down
  run(st, [[4, 31, HZ30]]);
  assert.ok(st.step >= 1, '30 Hz with frames near 33 ms: steps down');
}

// a tab switch (one long stall) is not "slow frames"
{
  const st = createAdapt();
  run(st, [[3, 3, HZ60], [0.1, 3, 100], [0.1, 3, 100], [3, 3, HZ60]]);
  assert.equal(st.step, 0, 'a couple of stalled frames change nothing');
}

// hysteresis: a device that is too slow at full resolution and fast one step down (cost [16, 7] ms)
// may try going back up now and then, but must not flip back and forth every few seconds
{
  const st = createAdapt();
  const cost = [16, 7, 5, 4];
  const log = run(st, [[300, (step) => cost[step], HZ60]]);
  assert.ok(log.length >= 2, `it does try to go back up (${log.join(',')})`);
  assert.ok(log.length <= 14, `but rarely: ${log.length} changes in 5 minutes (${log.join(',')})`);
  assert.equal(st.upHold, 120000, 'each failed step up doubles the wait, up to two minutes');
}

// stalls/huge frames never break it (NaN, zero)
{
  const st = createAdapt();
  run(st, [[2, 0, 0.0001], [2, 1000, 1000]]);
  assert.ok(Number.isFinite(st.cost) && Number.isFinite(st.budget));
  assert.ok(st.step >= 0 && st.step <= 3);
}

console.log('adapt: ok');

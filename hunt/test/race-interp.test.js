// Rival cars glide: RaceClient.view() interpolates everyone else from 30 Hz snapshots. Real phone
// networks deliver them 0-60 ms late (and in bunches); the render clock used to restart from each
// arrival, so a late snapshot pulled the other cars backwards and the next one made them lurch.
// Here a rival drives a straight line at a constant 600 px/s while snapshots arrive with random
// delay, and the drawn position, sampled at 60 fps, must move forward every frame by a steady step.
import assert from 'node:assert';
import { RaceClient, INTERP_TICKS } from '../public/race/net.js';
import { newCar, packState, TICK_RATE } from '../public/race/physics.js';

function run({ jitter, bunch = 0, seed = 7, secs = 12, stall = 0 }) {
  let r = seed;
  const rnd = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
  let clock = 1000;
  const rc = new RaceClient({ transport: () => ({ readyState: 1, send() {}, addEventListener() {}, close() {} }), now: () => clock });
  rc.onMsg({ t: 'welcome', id: 1, secret: 's', match: 'room:T', room: 'T', mode: 'grand', track: 'desert', arena: false, bots: 0, tick: 30 });
  rc.onMsg({ t: 'ro', add: { 1: ['A', 'volt', 0], 2: ['B', 'volt', 1] }, full: 1 });
  rc.onMsg({ t: 'start', you: 1, mode: 'grand', track: 'desert', arena: false, laps: 3, tick: 30, cd: 0, players: 2, tm: 0 });
  const me = newCar(0, 0, 0);
  const V = 600; // rival speed px/s along +x
  const snap = (n) => ({ t: 's', n, tm: n / TICK_RATE, c: [[1, 0, 0, 0, 0, 100, 1, 0], [2, Math.round((V * n) / TICK_RATE), 500, 0, 0, 100, 1, V]], rk: [1, 2], ld: 0, e: [], bx: [], hz: 0, md: {},
    me: { s: packState(me), ack: 0, ep: 1, hp: 100, mh: 100, it: -1, wc: 0, sh: 0, em: 0, gh: 0, lap: 1, cp: 0, rk: 1, rt: 0, mc: 0, k: 0, d: 0, lt: 1, bl: null, fin: 0, out: 0, auto: 1 } });
  // arrival schedule: tick n is sent at n/30 s (+ an optional server stall) and arrives `jitter` ms
  // later at random, in order
  const arrivals = [];
  let last = 0;
  for (let n = 1; n <= secs * TICK_RATE; n++) {
    let sent = 1000 + (n * 1000) / TICK_RATE + (stall && n > TICK_RATE * 5 ? stall : 0);
    let at = sent + rnd() * jitter;
    if (bunch && n % bunch) at = Math.max(at, sent + jitter); // every few ticks a bunch arrives together
    at = Math.max(at, last); last = at;
    arrivals.push([at, n]);
  }
  const xs = [];
  let ai = 0;
  for (clock = 1000; clock < 1000 + secs * 1000; clock += 1000 / 60) {
    while (ai < arrivals.length && arrivals[ai][0] <= clock) rc.onMsg(snap(arrivals[ai++][1]));
    const v = rc.view(clock);
    if (!v) continue;
    xs.push(v.cars.find((c) => c.id === 2).x);
  }
  // after a 3 s warm-up: per-frame steps
  const steps = [];
  for (let i = 180 + 1; i < xs.length; i++) steps.push(xs[i] - xs[i - 1]);
  const ideal = V / 60;
  const back = steps.filter((d) => d < 0).length;
  const worst = Math.max(...steps.map((d) => Math.abs(d - ideal)));
  let acc = 0; for (let i = 1; i < steps.length; i++) acc = Math.max(acc, Math.abs(steps[i] - steps[i - 1]));
  return { back, worst, acc, ideal, lagTicks: ((V * clock) / 1000 / TICK_RATE) };
}

for (const o of [{ jitter: 0 }, { jitter: 30 }, { jitter: 60 }, { jitter: 60, seed: 99 }, { jitter: 45, bunch: 3 }]) {
  const r = run(o);
  assert.strictEqual(r.back, 0, `${JSON.stringify(o)}: the rival never moves backwards (${r.back} frames did)`);
  // a step stays within 12% of the steady 10 px a frame (render clock: at most 8% off real time)
  assert.ok(r.worst <= r.ideal * 0.12, `${JSON.stringify(o)}: steady per-frame step (worst off by ${r.worst.toFixed(2)} px of ${r.ideal.toFixed(1)})`);
  assert.ok(r.acc <= r.ideal * 0.12, `${JSON.stringify(o)}: no lurch between frames (${r.acc.toFixed(2)} px)`);
}
// a server that stalls for 400 ms once: the clock re-syncs (a single snap is allowed), then glides again
{
  const r = run({ jitter: 20, stall: 400 });
  assert.ok(r.back <= 1, `after a server stall the rival moves backwards at most once (${r.back})`);
}
// your own car (predicted at the 30 Hz tick) is drawn moving every 60 Hz frame, not every other
// one: the camera follows it, so 30 Hz steps made the whole world judder
{
  let clock = 1000;
  const rc = new RaceClient({ transport: () => ({ readyState: 1, send() {}, addEventListener() {}, close() {} }), now: () => clock });
  rc.onMsg({ t: 'welcome', id: 1, secret: 's', match: 'room:T', room: 'T', mode: 'grand', track: 'desert', arena: false, bots: 0, tick: 30 });
  rc.onMsg({ t: 'ro', add: { 1: ['A', 'volt', 0] }, full: 1 });
  rc.onMsg({ t: 'start', you: 1, mode: 'grand', track: 'desert', arena: false, laps: 3, tick: 30, cd: 0, players: 1, tm: 0 });
  const T = rc.T, g = T.grid[0], car = newCar(g.x, g.y, g.a);
  car.vx = Math.cos(g.a) * 500; car.vy = Math.sin(g.a) * 500;
  rc.onMsg({ t: 's', n: 30, tm: 1, c: [[1, Math.round(car.x), Math.round(car.y), Math.round(car.a * 1000), 0, 100, 1, 500]], rk: [1], ld: 0, e: [], bx: [], hz: 0, md: {},
    me: { s: packState(car), ack: 0, ep: 1, hp: 100, mh: 100, it: -1, wc: 0, sh: 0, em: 0, gh: 0, lap: 1, cp: 0, rk: 1, rt: 0, mc: 0, k: 0, d: 0, lt: 1, bl: null, fin: 0, out: 0, auto: 0 } });
  rc.ws = { readyState: 1, send() {} };
  rc.setInput({ st: 0, th: 1, dr: 0 });
  const steps = [];
  let px = null, py = null;
  for (let i = 0; i < 40; i++, clock += 1000 / 60) {
    rc.frame(clock);
    const m = rc.view(clock).cars.find((c) => c.me);
    assert.ok(m.predicted);
    if (px != null) steps.push(Math.hypot(m.x - px, m.y - py));
    px = m.x; py = m.y;
  }
  const s = steps.slice(4), lo = Math.min(...s), hi = Math.max(...s);
  assert.ok(lo > hi * 0.6, `own car moves every frame (steps ${lo.toFixed(1)}..${hi.toFixed(1)} px)`);
}
assert.strictEqual(INTERP_TICKS, 3);
console.log('race-interp: ok');

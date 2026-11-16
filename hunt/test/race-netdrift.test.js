// RaceClient prediction keeps the server's drift: rebuilding the own car from a snapshot must not
// end a drift in progress (it used to "settle" the state with drift released, so the own car never
// charged spark tiers and was corrected every tick while drifting).
import assert from 'node:assert';
import { RaceClient } from '../public/race/net.js';
import { newCar, packState, DRIVERS, stepCar } from '../public/race/physics.js';
import { getTrack } from '../public/race/tracks.js';
import { pointAt } from '../public/race/trackgeom.js';

const rc = new RaceClient({ transport: () => ({ readyState: 1, send() {}, addEventListener() {}, close() {} }) });
rc.onMsg({ t: 'welcome', id: 1, secret: 's', match: 'room:T', room: 'T', mode: 'grand', track: 'desert', arena: false, bots: 0, tick: 30 });
rc.onMsg({ t: 'ro', add: { 1: ['A', 'volt', 0] }, full: 1 });
rc.onMsg({ t: 'start', you: 1, mode: 'grand', track: 'desert', arena: false, laps: 3, tick: 30, cd: 3, players: 1, tm: -3 });
const T = getTrack('desert'), p = pointAt(T.corridors[0], 900, 0);
// a server car mid-drift at speed
const car = newCar(p.x, p.y, p.a);
car.vx = Math.cos(p.a) * 650; car.vy = Math.sin(p.a) * 650;
stepCar(car, { st: 0, th: 0, dr: 0 }, DRIVERS.volt, T, 0);
car.drift = 1; car.dc = 1.0;
const snap = (n, c) => ({ t: 's', n, tm: 1 + n / 30, c: [[1, Math.round(c.x), Math.round(c.y), Math.round(c.a * 1000), 1, 100, 1, 650]], rk: [1], ld: 0, e: [], bx: [], hz: 0, md: { laps: 3 },
  me: { s: packState(c), ack: 0, ep: 1, hp: 100, mh: 100, it: -1, wc: 0, sh: 0, em: 0, gh: 0, lap: 1, cp: 0, rk: 1, rt: 0, mc: 0, k: 0, d: 0, lt: 1, bl: null, fin: 0, out: 0, auto: 0 } });
rc.onMsg(snap(30, car));
assert.strictEqual(rc.car.drift, 1, 'the predicted car is still drifting');
assert.ok(Math.abs(rc.car.dc - 1.0) < 1e-6, 'drift charge kept');
assert.ok(rc.car.boostT === 0, 'no phantom mini-turbo from the rebuild');
// pending inputs replay on top, still drifting (holding drift, countersteering)
rc.ws = { readyState: 1, send() {} };
rc.held = { st: -0.5, th: 1, dr: 1 };
rc.step(); rc.step();
rc.onMsg(snap(31, car));
assert.strictEqual(rc.car.drift, 1);
assert.ok(rc.car.dc > 1.0, 'charge keeps building through the replayed inputs');
console.log('race-netdrift: ok');

// HUD and rendering logic that runs without a browser: off-screen pointers stay in the safe area,
// projectiles don't pile up while frames are paused, wildfire flames follow the server's clock.
import assert from 'node:assert';
import { edgePoint } from '../public/world-fx.js';
import { ShotSim } from '../public/shots.js';
import wildfire, { BURN_S } from '../public/events/wildfire.js';
import { BUSH, EMPTY, TILE } from '../public/shared.js';

// edgePoint: never inside a notch / home-bar inset, whichever way it points
{
  const W = 932, H = 430, sa = { t: 0, r: 0, b: 21, l: 59 };
  for (let a = -Math.PI; a < Math.PI; a += 0.05) {
    for (const m of [34, 50]) {
      const p = edgePoint(a, W, H, sa, m);
      assert.ok(p.x >= sa.l + m - 1e-6 && p.x <= W - sa.r - m + 1e-6, `x inside the safe area (a=${a.toFixed(2)})`);
      assert.ok(p.y >= sa.t + m - 1e-6 && p.y <= H - sa.b - m + 1e-6, `y inside the safe area (a=${a.toFixed(2)})`);
    }
  }
  const west = edgePoint(Math.PI, W, H, sa, 34);
  assert.equal(Math.round(west.x), 59 + 34, 'due west: just inside the left inset (it used to be x=34, under the notch)');
  const east = edgePoint(0, W, H, { t: 0, r: 59, b: 0, l: 0 }, 50);
  assert.equal(Math.round(east.x), W - 59 - 50);
  // no insets: the same as the plain screen edge
  assert.deepEqual(edgePoint(0, 800, 400), { x: 766, y: 200 });
}

// ShotSim.prune: while frames are paused (hidden tab), shots that ended or are long gone are dropped;
// while frames run it does nothing (sample() handles them, with their hit effects)
{
  const s = new ShotSim();
  const row = (id, tick) => [id, 0, 0, 10, 0, 500, 0, tick, 1, 0];
  let tick = 100;
  for (let i = 0; i < 300; i++) {
    tick++;
    s.fired('main', row(i, tick));
    if (i >= 5) s.ended('main', row(i - 5, 0), tick); // each one ends 5 ticks after it was fired
    s.prune('main', tick, 5000 + tick * 50); // no frame for a long time
  }
  assert.ok(s.live.size <= 6, `hidden: live shots stay bounded (${s.live.size})`);
  // a shot the server never ended is still dropped once it is far too old
  const t = new ShotSim();
  t.fired('main', row(1, 10));
  t.prune('main', 100, 9e9); assert.equal(t.live.size, 1, 'still young: kept');
  t.prune('main', 300, 9e9); assert.equal(t.live.size, 0, '10 s old with no word from the server: dropped');
  // frames are being drawn: prune leaves everything to sample()
  const u = new ShotSim();
  u.fired('main', row(1, 10)); u.ended('main', row(1, 0), 12);
  u.sampledAt = 1000; u.prune('main', 50, 1200);
  assert.equal(u.live.size, 1, 'frames running: untouched');
  // only that connection's shots
  const v = new ShotSim();
  v.fired('a', row(1, 10)); v.ended('a', row(1, 0), 12); v.fired('b', row(1, 10)); v.ended('b', row(1, 0), 12);
  v.prune('a', 50, 9e9);
  assert.deepEqual([...v.live.keys()], ['b:1']);
}

// wildfire: flames for exactly as long as the server burns (BURN_S), from the event's time left
{
  const gw = 10, burn = [11, 12, 13];
  const t = new Uint8Array(100); for (const i of burn) t[i] = BUSH;
  let flames = 0, warns = 0;
  const R = { map: { gw, t }, visible: () => true, flame: () => flames++, warnTile: () => warns++ };
  // the params as the client has them: sent once when the fire started (burnT 0 forever)
  const p = { burn, burnT: 0 };
  const at = (elapsed) => { flames = 0; wildfire.draw(null, p, 'on', 0, R, wildfire.duration - elapsed); return flames; };
  assert.equal(at(0.5), 3, 'burning at 0.5 s');
  assert.equal(at(BURN_S - 0.05), 3, 'still burning just before the server stops');
  assert.equal(at(BURN_S + 0.05), 0, 'no flames once the server stopped the fire');
  assert.equal(at(10), 0, 'none late in the event (it used to draw them for all 14 s)');
  wildfire.draw(null, p, 'warn', 0, R, 3); assert.equal(warns, 3, 'warning tiles still shown');
  t[12] = EMPTY; // a bush the client already sees as gone
  assert.equal(at(1), 2, 'no flame on a tile that is not a bush any more');

  // the server's damage stops at the same moment
  const hurt = [];
  const sim = { players: new Map([[1, { alive: true, x: TILE * 1.5, y: TILE * 1.5 }]]), map: { gw, t }, hazard: (pl, k, d) => hurt.push(d), setTile: () => {} };
  const sp = { burn: [11], burnT: 0 };
  let el = 0;
  while (el < 6) { wildfire.tick(sim, sp, 0.05); el += 0.05; if (el < BURN_S - 0.06) assert.ok(hurt.length > 0); }
  const last = hurt.length;
  wildfire.tick(sim, sp, 0.05);
  assert.equal(hurt.length, last, 'no fire damage after BURN_S');
}

console.log('hud: ok');

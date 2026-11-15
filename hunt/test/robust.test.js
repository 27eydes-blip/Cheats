// Whatever a client sends, and whatever breaks inside a tick, a room keeps running for everyone
// else: every JSON value and every non-JSON frame is survived by the handlers themselves (nothing
// is merely caught), and a tick that does throw is counted and skipped, not fatal.
import assert from 'node:assert';
import { fakeD1, fakeEnv, manual, steps, connect } from './server-harness.js';
import { MatchRoom, ZoneRoom } from '../src/worker.js';
import { faults } from '../src/guard.js';
import { Sim } from '../src/sim.js';
import { generateArena } from '../public/shared.js';

const deep = (n) => { let v = 'x'; for (let i = 0; i < n; i++) v = i % 2 ? [v] : { t: 'in', f: v }; return v; };
const JUNK = [
  'null', '5', '-0', '1e999', '"x"', '""', 'true', 'false', '[]', '[1,2,3]', '[null]', '{}', '{', '}', '', ' ', 'undefined', 'NaN', '\u0000',
  '{"t":null}', '{"t":5}', '{"t":[]}', '{"t":{}}', '{"t":"in"}', '{"t":"in","s":{}}', '{"t":"in","f":[],"u":{},"mx":"1","my":null,"w":"1","gd":[1],"fd":{},"ch":[],"vt":"9"}',
  '{"t":"in","f":1e308,"u":-1e308,"mx":1e308,"s":1e308}', '{"t":"pick"}', '{"t":"pick","brawler":null}', '{"t":"pick","brawler":["volt"]}', '{"t":"pick","brawler":{"toString":1}}',
  '{"t":"emote"}', '{"t":"emote","e":"1"}', '{"t":"emote","e":1.5}', '{"t":"emote","e":[1]}', '{"t":"ping"}', '{"t":"ping","c":{"a":[1,{"b":null}]}}',
  '{"t":"pos"}', '{"t":"pos","x":"a","y":{}}', '{"t":"pos","x":1e999,"y":-1e999}', '{"t":"claim"}', '{"t":"claim","token":null}', '{"t":"claim","token":{},"pend":5}',
  '{"t":"claim","token":"x","pend":[null,5,"x",[1],{"s":{}},{"t":"pick","brawler":"brick"}]}', '{"__proto__":{"t":"in"},"t":"in","f":0}', '{"constructor":{"prototype":{"x":1}},"t":"in"}',
  JSON.stringify(deep(400)), JSON.stringify({ t: 'pick', brawler: deep(50) }), JSON.stringify({ t: 'claim', token: deep(50), pend: deep(51) }), JSON.stringify({ t: 'in', s: 1, pad: 'x'.repeat(100000) }), 'x'.repeat(200000),
  new ArrayBuffer(8), new Uint8Array([123, 34, 116, 34, 58, 34, 105, 110, 34, 125]).buffer,
];

// ---- a match: one client sends junk, the other must not notice
{
  const room = manual(new MatchRoom({}, fakeEnv(fakeD1())));
  const bad = await connect(room, '/ws?match=room:JUNK&name=Bad&brawler=volt&bots=0&lobby=1.5');
  const ok = await connect(room, '/ws?match=room:JUNK&name=Ok&brawler=brick&bots=0&lobby=1.5');
  for (const j of JUNK) bad.say(j); // in the lobby too
  steps(room, 100);
  assert.equal(room.sim.phase, 'play');
  const n0 = ok.of('s').length, t0 = room.sim.tickN;
  for (const j of JUNK) { bad.say(j); room.step(); }
  assert.equal(room.sim.tickN - t0, JUNK.length, 'every tick ran');
  assert.equal(ok.of('s').length - n0, JUNK.length, 'the other player got a snapshot every tick');
  assert.equal(bad.readyState, 1, 'junk does not even cost the sender its socket');
  bad.say({ t: 'ping', c: 7 });
  assert.equal(bad.last('pong').c, 7, 'and the socket still works');
  const me = room.sim.players.get(bad.last('welcome').id);
  assert(Number.isFinite(me.x) && Number.isFinite(me.y) && Number.isFinite(me.hp) && Number.isFinite(me.facing), 'no NaN leaked into the player');
}
// ---- a Free Play zone: a player socket and an observer socket send junk
{
  const zone = manual(new ZoneRoom({}, fakeEnv(fakeD1())));
  const bad = await connect(zone, '/zone?slot=c&join=1&name=Bad&brawler=volt');
  const obs = await connect(zone, '/zone?slot=c&x=100&y=100');
  const ok = await connect(zone, '/zone?slot=c&join=1&name=Ok&brawler=brick');
  const n0 = ok.of('s').length, t0 = zone.sim.tickN, players = zone.sim.humans().length;
  for (const j of JUNK) { bad.say(j); obs.say(j); zone.step(); }
  assert.equal(zone.sim.tickN - t0, JUNK.length, 'every zone tick ran');
  assert.equal(ok.of('s').length - n0, JUNK.length, 'the other player got a snapshot every tick');
  assert.equal(zone.sim.humans().length, players, 'junk claims created nobody');
  for (const o of zone.sim.observers.values()) assert(Number.isFinite(o.x) && Number.isFinite(o.y), 'observer position stays a number');
  assert.equal(bad.readyState, 1); assert.equal(obs.readyState, 1);
}
assert.equal(faults.n, 0, 'the handlers survived on their own (nothing had to be caught): ' + (faults.last && faults.last.stack));

// ---- defence in depth: if a tick does throw, the room counts it and carries on
{
  const room = manual(new MatchRoom({}, fakeEnv(fakeD1())));
  const a = await connect(room, '/ws?match=room:BOOM&name=A&brawler=volt&lobby=1.5');
  steps(room, 100);
  assert.equal(room.sim.phase, 'play');
  const sim = room.sim, real = sim.updateBullets;
  let boom = 3;
  sim.updateBullets = function () { if (boom-- > 0) throw new Error('injected tick failure'); return real.call(this); };
  const log = console.log; console.log = () => {}; // (the fault log is expected here)
  const n0 = a.of('s').length;
  assert.doesNotThrow(() => steps(room, 10), 'a throwing tick never escapes the room');
  console.log = log;
  assert.equal(faults.n, 3, 'each failed tick was counted');
  assert.equal(sim.tickErrors, 3);
  assert.equal(a.of('s').length - n0, 7, 'snapshots resume as soon as the tick works again');
  assert(sim.fx.length < 50 && sim.bnew.length < 50, 'a failed tick leaves no pile of one-shot effects behind');
  // ...but tick() itself still throws, so a bug fails loudly in tests
  const bare = new Sim({ map: generateArena(3), mode: 'bounty', phase: 'play', fillBots: false });
  bare.updateBullets = () => { throw new Error('bug'); };
  assert.throws(() => bare.tick(), /bug/);
}
// ---- a broken step (not just the tick) can't kill the loop either
{
  const { MatchRoom: M } = await import('../src/worker.js');
  const room = new M({}, fakeEnv(fakeD1()));
  const before = faults.n;
  let calls = 0;
  room.step = () => { calls++; throw new Error('injected step failure'); };
  room.loop.step = () => room.step();
  const log = console.log; console.log = () => {};
  room.loop.start();
  await new Promise((r) => setTimeout(r, 260));
  room.loop.stop();
  console.log = log;
  assert(calls >= 2, 'the loop kept calling step after it threw (' + calls + ')');
  assert.equal(faults.n - before, calls);
}

// ---- the Worker entry module may only export handlers and Durable Object classes
// (workerd refuses to start if it also exports, say, a number)
{
  const mod = await import('../src/worker.js');
  for (const [name, v] of Object.entries(mod)) assert(typeof v === 'function' || (v && typeof v === 'object'), `worker.js export "${name}" must be a handler or a class, got ${typeof v}`);
}
console.log(`robustness tests passed (${JUNK.length} junk frames per socket)`);

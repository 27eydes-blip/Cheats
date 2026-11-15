// FRIEND ROOMS: the room plays the host's mode, the host presses START (no countdown race), friends
// in Squad Hunt are one squad, and a friend who arrives mid-match is seated in the room's next match.
import assert from 'node:assert';
import { fakeD1, fakeEnv, manual, steps, connect, settle } from './server-harness.js';
import { MatchRoom } from '../src/worker.js';
import { RANDOM_MODES } from '../src/modes.js';
import { ROOM_IDLE_SECS } from '../src/sim.js';

const room = () => manual(new MatchRoom({}, fakeEnv(fakeD1())));
const humans = (r) => r.sim.humans().filter((p) => !p.wasBot);
const join = (r, code, q) => connect(r, `/ws?match=room:${code}&brawler=volt&${q}`);

// Quick Hunt's random pool is the 10-player events only
assert(!RANDOM_MODES.includes('squad') && !RANDOM_MODES.includes('bighunt'), 'no Squad or Big Hunt in Quick Hunt: ' + RANDOM_MODES);

// ---- the host's mode, the host's START, no 12-second race
{
  const r = room();
  const a = await join(r, 'SQ', 'name=Ann&mode=squad');
  const b = await join(r, 'SQ', 'name=Ben&mode=showdown');
  assert.equal(r.sim.modeKey, 'squad', 'the room plays the mode its host picked');
  assert.equal(b.last('welcome').mode, 'squad');
  steps(r, 20 * 30);
  assert.equal(r.sim.phase, 'lobby', 'a friend room waits for its host (no countdown)');
  const lb = b.last('lobby');
  assert.equal(lb.host, a.last('welcome').id, 'the first one in is the host');
  assert.deepEqual(lb.ids, [a.last('welcome').id, b.last('welcome').id]);
  assert.equal(lb.startIn, null, 'no countdown on screen');
  assert.equal(lb.can, true);
  b.say({ t: 'host', start: 1 });
  b.say({ t: 'host', bots: false });
  assert.equal(r.sim.phase, 'lobby', 'only the host can start');
  assert.equal(r.sim.fillBots, true, 'only the host can switch bots');
  a.say({ t: 'host', start: 1 });
  assert.equal(r.sim.phase, 'play', 'START starts it');
  const [pa, pb] = humans(r);
  assert.equal(pa.team, pb.team, 'friends are one squad in Squad Hunt');
  const mates = [...r.sim.players.values()].filter((p) => p.team === pa.team);
  assert.equal(mates.length, 3, '3v3: two friends and a bot against three bots');
  assert([...r.sim.players.values()].filter((p) => p.team !== pa.team).every((p) => p.wasBot));
  console.log('friend room: host mode + START + same squad: ok');
}
// ---- bots off: Squad friends split evenly to play each other; the host toggles bots
{
  const r = room();
  const a = await join(r, 'SPLIT', 'name=A&mode=squad');
  for (const n of ['B', 'C', 'D']) await join(r, 'SPLIT', 'name=' + n);
  a.say({ t: 'host', bots: false });
  assert.equal(r.sim.fillBots, false);
  assert.equal(a.last('lobby').bots, false, 'everyone sees the bots switch');
  a.say({ t: 'host', start: 1 });
  assert.equal(r.sim.players.size, 4, 'no bots');
  const t = humans(r).map((p) => p.team).sort();
  assert.deepEqual(t, [1, 1, 2, 2], 'four friends without bots: 2 v 2');
}
// ---- bots off needs two hunters; the host leaving hands the room on
{
  const r = room();
  const a = await join(r, 'HOST', 'name=A&mode=bounty&bots=0');
  assert.equal(a.last('lobby').can, false, 'bots off and alone: START is not ready');
  a.say({ t: 'host', start: 1 });
  assert.equal(r.sim.phase, 'lobby');
  const b = await join(r, 'HOST', 'name=B');
  const c = await join(r, 'HOST', 'name=C');
  a.close(1000, 'gone');
  assert.equal(r.sim.hostId, b.last('welcome').id, 'the next one in becomes host');
  assert.equal(c.last('lobby').host, b.last('welcome').id, 'and everyone is told');
  b.say({ t: 'host', start: 1 });
  assert.equal(r.sim.phase, 'play');
  assert.equal(r.sim.players.size, 2, 'bots stayed off');
}
// ---- a long idle room still starts by itself (safety net), counting down only in the last minute
{
  const r = room();
  const a = await join(r, 'IDLE', 'name=A&mode=bounty');
  steps(r, 20 * (ROOM_IDLE_SECS - 50));
  assert.equal(r.sim.phase, 'lobby');
  assert(a.last('lobby').startIn > 0 && a.last('lobby').startIn <= 60, 'the last minute counts down');
  steps(r, 20 * 55);
  assert.equal(r.sim.phase, 'play', 'starts after ' + ROOM_IDLE_SECS + 's');
}
// ---- the test hook ?lobby= keeps its old fixed countdown
{
  const r = room();
  await join(r, 'TIMED', 'name=A&mode=bounty&lobby=1.5');
  steps(r, 40);
  assert.equal(r.sim.phase, 'play', 'lobby=1.5 still starts by itself');
}
// ---- a friend who comes in mid-match waits, then joins the room's next match (same mode); the old host is host again
{
  const r = room();
  const a = await join(r, 'LATE', 'name=Host&mode=crystals');
  const b = await join(r, 'LATE', 'name=Pal');
  a.say({ t: 'host', bots: false });
  a.say({ t: 'host', start: 1 });
  assert.equal(r.sim.phase, 'play');
  const late = await join(r, 'LATE', 'name=Late&mode=showdown');
  assert(!late.last('retry'), 'not bounced to the menu');
  assert.equal(late.readyState, 1, 'kept connected');
  const w = late.last('roomwait');
  assert(w && w.mode === 'crystals' && w.left > 0, 'told the room is mid-match and how long is left');
  late.say({ t: 'ping', c: 7 });
  assert.equal(late.last('pong').c, 7, 'the waiting socket answers pings (it is not "silent")');
  late.say({ t: 'host', start: 1 }); // ignored
  const quitter = await join(r, 'LATE', 'name=Quit');
  quitter.close(1000, 'cancel');
  assert.equal(r.waiting.size, 1, 'CANCEL leaves the queue');
  steps(r, 20);
  assert(late.of('roomwait').length >= 2, 'the wait message keeps coming');
  r.sim.time = 1e6; r.step(); // the match ends
  assert.equal(r.sim.phase, 'end');
  await settle(); r.step();
  assert.equal(r.sim.phase, 'lobby', 'the next lobby opens for the friend who waited');
  const lw = late.last('welcome');
  assert(lw && lw.room === 'LATE', 'seated in the room');
  assert.equal(r.sim.modeKey, 'crystals', 'the room keeps its mode (the waiting friend asked for showdown)');
  assert.equal(r.sim.fillBots, false, 'and its bots setting');
  assert.equal(r.sim.hostId, lw.id, 'first in the new lobby holds it for now');
  const back = await join(r, 'LATE', 'name=Host');
  assert.equal(r.sim.hostId, back.last('welcome').id, 'the last host gets the room back');
  const pal = await join(r, 'LATE', 'name=Pal&mode=showdown');
  assert.equal(r.sim.modeKey, 'crystals');
  assert.equal(humans(r).length, 3);
  pal.close(1000, 'x');
  console.log('friend room: late friend waits for the next match: ok');
}
// ---- the host reconnecting in the lobby (same account) stays host
{
  const db = fakeD1(), r = manual(new MatchRoom({}, fakeEnv(db)));
  db.addUser('u1', 'tok1');
  await join(r, 'RE', 'name=A&mode=bounty&token=tok1');
  await join(r, 'RE', 'name=B');
  const a2 = await join(r, 'RE', 'name=A&token=tok1');
  assert.equal(r.sim.hostId, a2.last('welcome').id, 'the host keeps the room on a new connection');
}
console.log('ROOMS OK');

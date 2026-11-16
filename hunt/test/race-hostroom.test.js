// Hunt Racers friend rooms run by their host: the first one in picks mode / track / bots and presses
// START (nobody else can), the host's FILL WITH BOTS switch works in the room, a friend who arrives
// mid-race waits and is seated in the next race, the room keeps its settings between races and the
// last race's host gets the room back.
import assert from 'node:assert';
import { raceEnv, fakeD1, open, settle } from './race-harness.js';
import worker, { RaceRoom, RaceMatchmaker } from '../src/worker.js';
import { RaceClient } from '../public/race/net.js';
import { ROOM_IDLE_SECS } from '../src/race/sim.js';

const env = raceEnv({ RaceRoom, RaceMatchmaker }, fakeD1());
const client = (params) => new RaceClient({ base: '', params, transport: (url) => open(worker, env, url) });
const tick = (room, n = 1) => { for (let i = 0; i < n; i++) room.step(); };

// ---------------------------------------------------------------- the host starts the race
const A = client({ name: 'Ann', driver: 'volt', room: 'crew1', mode: 'elim', track: 'frozen', bots: 0 });
await A.connect(); await settle();
const B = client({ name: 'Ben', driver: 'wisp', room: 'CREW1', mode: 'battle', track: 'desert', bots: 1 });
await B.connect(); await settle();
const room = env.rooms.get('room:CREW1');
assert.ok(room.sim.hostStart, 'a room without ?lobby= is host-run');
assert.deepStrictEqual([B.mode, B.trackKey, room.sim.fillBots], ['elim', 'frozen', false], 'the host picked mode, track and bots');
tick(room, 30 * 20); // 20 s: a host room does not start by itself
assert.strictEqual(room.sim.phase, 'lobby');
assert.strictEqual(A.lobby.host, A.id, 'Ann is the host');
assert.deepStrictEqual(A.lobby.ids, [A.id, B.id]);
assert.strictEqual(A.lobby.can, true, 'two humans: START is ready (bots off)');
assert.strictEqual(A.lobby.startIn, null, 'no countdown until the last minute of the idle timer');
// only the host's buttons count
B.send({ t: 'host', start: 1, bots: true }); await settle(); tick(room);
assert.strictEqual(room.sim.phase, 'lobby', 'a guest cannot start');
assert.strictEqual(room.sim.fillBots, false, 'a guest cannot switch bots');
A.send({ t: 'host', bots: true }); await settle(); tick(room, 16);
assert.strictEqual(room.sim.fillBots, true, 'the host switched FILL WITH BOTS on');
assert.strictEqual(B.lobby.bots, true, 'everyone sees it');
A.send({ t: 'host', bots: false }); await settle(); tick(room);
A.send({ t: 'host', start: 1 }); await settle(); tick(room);
assert.strictEqual(room.sim.phase, 'play', 'START starts the race');
assert.strictEqual(room.sim.players.size, 2, 'bots off: just the two friends');
assert.strictEqual(A.phase, 'race'); assert.strictEqual(B.phase, 'race');

// ---------------------------------------------------------------- a late friend waits for the next race
const C = client({ name: 'Cid', driver: 'dune', room: 'CREW1', mode: 'grand', track: 'neon', bots: 1 });
let waited = null; C.on('roomwait', (m) => { waited = m; });
await C.connect(); await settle();
assert.ok(waited, 'the late friend is told the race is running');
assert.strictEqual(waited.room, 'CREW1');
assert.strictEqual(waited.mode, 'elim');
assert.strictEqual(C.phase, 'wait');
assert.strictEqual(room.sim.players.size, 2, 'not put into the running race');
tick(room, 70); await settle();
assert.ok(room.waiting.size === 1, 'still waiting');
room.sim.finish(); // the race ends
for (let i = 0; i < 40 && room.sim.phase === 'end'; i++) { tick(room); await settle(); }
assert.strictEqual(room.sim.phase, 'lobby', 'the next race opened for the friend who waited');
await settle();
assert.strictEqual(C.phase, 'lobby', 'Cid is in the next lobby');
assert.deepStrictEqual([C.mode, C.trackKey], ['elim', 'frozen'], 'the room kept its mode and track');
assert.strictEqual(room.sim.fillBots, false, 'and its bots setting');
assert.strictEqual(C.lobby.host, C.id, 'first one in holds the room for now');
// Ann presses RACE AGAIN: she gets her room back
const A2 = client({ name: 'Ann', driver: 'volt', room: 'CREW1', mode: 'elim', track: 'frozen', bots: 0 });
await A2.connect(); await settle();
assert.strictEqual(A2.phase, 'lobby');
assert.strictEqual(room.sim.hostId, A2.id, 'the last race\'s host is host again');
assert.strictEqual(C.lobby.host, A2.id);
// the host leaves the lobby: the next one in takes over
A2.leave(); await settle(); tick(room);
assert.strictEqual(room.sim.hostId, C.id, 'the host left: Cid hosts');
C.send({ t: 'host', start: 1 }); await settle(); tick(room);
assert.strictEqual(room.sim.phase, 'lobby', 'bots off and alone: START waits for a friend');
C.send({ t: 'host', bots: true }); await settle(); tick(room);
C.send({ t: 'host', start: 1 }); await settle(); tick(room);
assert.strictEqual(room.sim.phase, 'play', 'bots on: Cid can start alone');
assert.strictEqual(room.sim.players.size, 10, 'bots filled the grid');

// ---------------------------------------------------------------- same names: the first one in hosts
const S1 = client({ name: 'Racer', driver: 'volt', room: 'TWINS', token: 'tok-one' });
await S1.connect(); await settle();
const S2 = client({ name: 'Racer', driver: 'wisp', room: 'TWINS', token: 'tok-two' });
await S2.connect(); await settle();
const twins = env.rooms.get('room:TWINS');
assert.strictEqual(twins.sim.hostId, S1.id, 'a second racer with the same name does not take the room');
assert.strictEqual(S2.lobby.host, S1.id);

// ---------------------------------------------------------------- safety net + timed rooms
const D = client({ name: 'Dot', driver: 'rook', room: 'IDLE1', mode: 'grand', bots: 1 });
await D.connect(); await settle();
const idle = env.rooms.get('room:IDLE1');
tick(idle, 30 * (ROOM_IDLE_SECS - 30));
assert.strictEqual(idle.sim.phase, 'lobby');
assert.ok(D.lobby.startIn != null && D.lobby.startIn <= 60, 'the last minute counts down');
tick(idle, 30 * 31);
assert.strictEqual(idle.sim.phase, 'play', 'a forgotten room starts by itself');
const E = client({ name: 'Eve', driver: 'rook', room: 'TIMED1', mode: 'grand', bots: 1, lobby: 2 });
await E.connect(); await settle();
const timed = env.rooms.get('room:TIMED1');
assert.strictEqual(timed.sim.hostStart, false, '?lobby= keeps the fixed countdown');
tick(timed, 70);
assert.strictEqual(timed.sim.phase, 'play');
console.log('race-hostroom: ok');

// Hunt Racers server end to end: the worker's /race route, RaceMatchmaker queues and the RaceRoom
// Durable Object, driven by two RaceClient instances (public/race/net.js) as two phones would:
// driving with prediction over a laggy link, shooting, an item, a wreck + respawn, a dropped
// connection + rejoin, lap counting, finish order and the account results.
import assert from 'node:assert';
import { raceEnv, fakeD1, open, settle } from './race-harness.js';
import worker, { RaceRoom, RaceMatchmaker } from '../src/worker.js';
import { RaceClient } from '../public/race/net.js';
import { botInput } from '../src/race/bots.js';
import { FLAG } from '../public/race/protocol.js';
import { RESPAWN_TICKS } from '../src/race/sim.js';
import { newProgress, trophyDelta } from '../public/progression.js';

const db = fakeD1();
db.addUser('ua', 'tokA'); db.addUser('ub', 'tokB'); db.addUser('uc', 'tokC');
const env = raceEnv({ RaceRoom, RaceMatchmaker }, db);
const coins0 = newProgress().coins;

// a client whose outgoing messages arrive LAG ticks late (a phone on a real network)
const LAG = 3;
// token checks hash with crypto.subtle (truly async): wait for them like a real lobby would
async function until(fn, what) { for (let i = 0; i < 300 && !fn(); i++) await settle(5); assert.ok(fn(), what); }
function laggy(c) {
  const q = [];
  const tr = c.transport;
  c.transport = async (url) => {
    const ws = await tr(url);
    const send = ws.send.bind(ws);
    ws.send = (d) => q.push([c.tickN, d, send, ws]);
    return ws;
  };
  c.flush = () => { while (q.length && q[0][0] <= c.tickN - LAG) { const [, d, send, ws] = q.shift(); if (ws.readyState === 1) send(d); } };
  c.tickN = 0;
  return c;
}
const client = (params) => laggy(new RaceClient({ base: '', params, transport: (url) => open(worker, env, url) }));

// ---------------------------------------------------------------- two humans in a friend room, bots OFF
const A = client({ name: 'Ann', driver: 'volt', token: 'tokA', room: 'pals7', mode: 'grand', track: 'neon', bots: 0, lobby: 2 });
const B = client({ name: 'Ben', driver: 'wisp', token: 'tokB', room: 'PALS7', mode: 'battle', track: 'desert', bots: 1 });
await A.connect();
await settle();
assert.strictEqual(A.phase, 'lobby');
assert.strictEqual(A.room, 'PALS7');
await B.connect();
await settle();
const room = env.rooms.get('room:PALS7');
await until(() => [...room.sim.players.values()].every((p) => p.account), 'accounts attached');
assert.ok(room, 'one room for the code');
assert.deepStrictEqual([B.mode, B.trackKey, room.sim.fillBots], ['grand', 'neon', false], 'the host picked mode, track and bots');
assert.deepStrictEqual(A.lobby.players.map((p) => p[0]).sort(), ['Ann', 'Ben']);

const sp = (c) => room.sim.players.get(c.id);
const corr = [];
const both = [A, B];
function tick(drive = true) {
  for (const c of both) {
    c.tickN++;
    if (drive && room.sim.phase === 'play' && sp(c) && !sp(c).finished) {
      const inp = botInput(room.sim, sp(c)); // a "human" steering by the same brain
      c.setInput({ st: inp.st, th: inp.th, dr: inp.dr });
      if (inp.i) c.useItem();
    }
    c.step();
    c.flush();
  }
  room.step();
  for (const c of both) if (c.corr != null && c.predicting()) corr.push(c.corr);
}
let n = 0;
while (room.sim.phase === 'lobby' && n++ < 400) tick(false);
assert.strictEqual(room.sim.phase, 'play');
assert.strictEqual(room.sim.players.size, 2, 'no bots');
assert.strictEqual(A.phase, 'race');
assert.ok(A.start && A.start.tick === 30 && A.start.laps === 3);
assert.deepStrictEqual([...A.roster.keys()].sort(), [A.id, B.id].sort());
while (room.sim.time < 8) tick();
assert.ok(A.view().cars.length === 2, 'both cars in view');
assert.ok(A.view().me.lap >= 1, 'racing');

// shooting: both fire their weapons; both phones see both shots
const ready = (c) => sp(c).alive && sp(c).empT <= 0 && sp(c).wcd <= 0 && sp(c).ghostT <= 0;
while (!(ready(A) && ready(B))) tick();
A.drainEvents(); B.drainEvents();
A.fire(); B.fire();
tick(); tick(); tick(); tick(); tick();
const evA = A.drainEvents(), evB = B.drainEvents();
for (const ev of [evA, evB]) {
  assert.ok(ev.some((e) => e[0] === 'arc' && e[1] === A.id), 'Volt\'s tesla arc');
  assert.ok(ev.some((e) => e[0] === 'rail' && e[1] === B.id), 'Wisp\'s rail lance');
}
// an item
sp(A).item = 'turbo';
A.useItem();
for (let i = 0; i < 5; i++) tick();
// (used: gone, unless the bot driving A ran through an item box in those ticks and got a new one)
const evItem = A.drainEvents();
assert.ok(evItem.some((e) => e[0] === 'use' && e[1] === A.id));
assert.ok(sp(A).item === null || evItem.some((e) => e[0] === 'box' && e[1] === A.id && e[3] >= 0), 'the item was used up');

// a wreck: B is destroyed, the server holds it for exactly 2 s, then B drives on with its lap
while (!ready(B)) tick();
sp(B).shieldT = 0; sp(B).protT = 0; // (a shield from an item box, or the after-hit protection, would block the hit)
const lapB = sp(B).lap;
room.sim.damage(sp(B), sp(A), 999, 'rail');
tick();
assert.ok(B.me.rt > 1.9 && B.view().cars.find((c) => c.me).f & FLAG.DEAD, 'B sees itself wrecked');
let waited = 1;
while (!sp(B).alive) { tick(); waited++; }
assert.strictEqual(waited, RESPAWN_TICKS);
tick();
assert.strictEqual(B.me.rt, 0);
assert.strictEqual(sp(B).lap, lapB, 'lap kept');
assert.ok(B.predicting(), 'B predicts again after respawning');

// a dropped connection: B's phone loses the socket, the client rejoins the same car
const idB = B.id;
B.ws.close();
assert.strictEqual(sp(B).connected, false);
await settle(400);
assert.strictEqual(B.id, idB);
assert.strictEqual(sp(B).connected, true, 'rejoined');
assert.strictEqual(room.sim.players.size, 2);
tick();
assert.ok(B.latest.n === room.sim.tickN, 'snapshots flowing again');

// race to the end
while (room.sim.phase !== 'end' && n++ < 30 * 200) tick();
for (let i = 0; i < 100 && !(A.progress && B.progress); i++) await settle(10); // results are written asynchronously
assert.strictEqual(room.sim.phase, 'end');
for (const c of both) {
  assert.strictEqual(c.phase, 'end');
  assert.ok(c.results.results.every((r) => r[9] === 1), 'both finished');
}
const res = A.results.results;
assert.ok(res[0][4] <= res[1][4], 'finish order by time');
const pa = sp(A), pb = sp(B);
assert.deepStrictEqual([pa.lapTimes.length, pb.lapTimes.length], [3, 3], 'three laps each');
// prediction quality over a 3-tick laggy link
corr.sort((x, y) => x - y);
assert.ok(corr[corr.length >> 1] < 1, `median correction ${corr[corr.length >> 1]} px`);
assert.ok(corr[Math.floor(corr.length * 0.95)] < 25, `95th percentile correction ${corr[Math.floor(corr.length * 0.95)]} px`);
// results reach both accounts through the shared progression
const winner = res[0][0] === A.id ? ['ua', A, 'volt'] : ['ub', B, 'wisp'];
const loser = winner[1] === A ? ['ub', B, 'wisp'] : ['ua', A, 'volt'];
const pw = db.progress(winner[0]), pl = db.progress(loser[0]);
assert.strictEqual(pw.trophies[winner[2]], 8, 'winner +8 trophies');
assert.strictEqual(pl.trophies[loser[2]], trophyDelta({ rank: 2, players: 2 }), 'second place: the usual trophy rule');
assert.strictEqual(pw.modes.race_grand.games, 1, 'race tagged in the per-mode stats');
assert.strictEqual(pw.race.races, 1);
assert.ok(pw.coins > coins0 && pw.xp > 0 && pw.pass.xp > 0, 'coins, XP and pass XP');
assert.ok(pw.daily.prog.play === 1, 'missions count races');
assert.ok(winner[1].progress && winner[1].progress.coins > 0, 'the phone is told what it earned');

// ---------------------------------------------------------------- public queues: bots on / off never mix
const X = client({ name: 'Xi', driver: 'dune', mode: 'grand', bots: 0 });
const Y = client({ name: 'Yu', driver: 'rook', mode: 'grand', bots: 1 });
await X.connect(); await Y.connect(); await settle();
const rx = env.rooms.get(X.match), ry = env.rooms.get(Y.match);
assert.notStrictEqual(X.match, Y.match);
assert.match(X.match, /^rq:grand:[a-z]+:0:/);
assert.match(Y.match, /^rq:grand:[a-z]+:1:/);
for (let i = 0; i < 400; i++) { rx.step(); ry.step(); }
assert.strictEqual(ry.sim.phase, 'play');
assert.strictEqual(ry.sim.players.size, 10, 'bots fill the bots-ON race');
assert.strictEqual(rx.sim.phase, 'lobby', 'the bots-OFF race waits for a second human');
const Z = client({ name: 'Zed', driver: 'brick', mode: 'grand', bots: 0 });
await Z.connect(); await settle();
assert.strictEqual(Z.match, X.match, 'same bots-OFF queue');
for (let i = 0; i < 200; i++) rx.step();
assert.strictEqual(rx.sim.phase, 'play');
assert.strictEqual(rx.sim.players.size, 2);
assert.ok([...rx.sim.players.values()].every((p) => !p.wasBot), 'zero bots');

// ---------------------------------------------------------------- time trial: solo, best time saved
const T = client({ name: 'Tia', driver: 'flicker', mode: 'trial', track: 'desert', token: 'tokC' });
await T.connect(); await settle();
assert.match(T.match, /^solo:desert:/);
const rt = env.rooms.get(T.match);
await until(() => rt.sim.players.get(T.id).account === 'uc', 'account attached');
n = 0;
while (rt.sim.phase !== 'end' && n++ < 30 * 200) {
  const p = rt.sim.players.get(T.id);
  if (rt.sim.phase === 'play') { const inp = botInput(rt.sim, p); T.setInput(inp); }
  T.tickN++; T.step(); T.flush(); rt.step();
}
for (let i = 0; i < 100 && !T.progress; i++) await settle(10); // results are written asynchronously
const pt = db.progress('uc'), me = rt.sim.players.get(T.id);
assert.strictEqual(rt.sim.players.size, 1, 'solo');
assert.strictEqual(pt.race.best.desert, me.finishTime, 'best time saved');
assert.strictEqual(pt.trophies.flicker, 0, 'no trophies from a solo run');
assert.ok(T.progress && T.progress.improved);
console.log('race-room: ok');
process.exit(0);

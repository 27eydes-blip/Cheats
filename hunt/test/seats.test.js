// One seat per account per match, results recorded once, and reconnects that always win.
import assert from 'node:assert';
import { fakeD1, fakeEnv, manual, steps, connect, settle } from './server-harness.js';
import { MatchRoom, ZoneRoom } from '../src/worker.js';
import { faults, ZONE_HUMANS } from '../src/guard.js';
import { newProgress } from '../public/progression.js';

const humans = (room) => room.sim.humans().filter((p) => !p.wasBot);
const finish = async (room) => { room.sim.time = 1e6; room.step(); assert.equal(room.sim.phase, 'end'); await settle(); await settle(); };
const start = (room) => { steps(room, 20 * 13); assert.equal(room.sim.phase, 'play'); };

// ---- farming: three sockets, one account, one match -> ONE seat and ONE result
{
  const db = fakeD1(), room = manual(new MatchRoom({}, fakeEnv(db)));
  db.addUser('u1', 'tok1');
  const s1 = await connect(room, '/ws?match=room:FARM&name=Me1&brawler=volt&mode=bounty&lobby=12&token=tok1');
  const s2 = await connect(room, '/ws?match=room:FARM&name=Me2&brawler=brick&mode=bounty&lobby=12&token=tok1');
  const s3 = await connect(room, '/ws?match=room:FARM&name=Me3&brawler=wisp&mode=bounty&lobby=12&token=tok1');
  assert.equal(humans(room).length, 1, 'one account holds one seat');
  assert.equal(humans(room)[0].brawler, 'wisp', 'in the lobby the newest connection (and its pick) wins');
  assert.equal(humans(room)[0].account, 'u1');
  for (const old of [s1, s2]) { assert(old.last('kick') && /other screen/.test(old.last('kick').reason), 'the replaced screen is told why'); assert.equal(old.readyState, 3, 'and closed'); }
  assert.equal(s3.readyState, 1);
  start(room);
  assert.equal(room.sim.players.size, 10, 'bots fill the rest');
  await finish(room);
  const p = db.progress('u1');
  assert.equal(p.games, 1, 'one match = one game played (got ' + p.games + ')');
  assert(s3.last('progress'), 'and the player sees their rewards');
  assert.equal(s3.of('progress').length, 1);
}
// ---- same account joins a match that is already running: it takes over its own seat
{
  const db = fakeD1(), room = manual(new MatchRoom({}, fakeEnv(db)));
  db.addUser('u1', 'tok1');
  const a1 = await connect(room, '/ws?match=room:TAKE&name=A&brawler=brick&mode=bounty&lobby=12&token=tok1');
  const g = await connect(room, '/ws?match=room:TAKE&name=Guest&brawler=volt&mode=bounty&lobby=12');
  start(room);
  const w1 = a1.last('welcome'), seat = room.sim.players.get(w1.id);
  seat.bounty = 3; seat.kills = 2;
  const a2 = await connect(room, '/ws?match=room:TAKE&name=Other&brawler=wisp&mode=bounty&lobby=12&token=tok1');
  const w2 = a2.last('welcome');
  assert.equal(w2.id, w1.id, 'same seat');
  assert.equal(room.sim.players.size, 10, 'no extra player');
  assert.equal(humans(room).length, 2);
  assert.notEqual(w2.secret, w1.secret, 'the seat gets a new secret');
  assert(a2.last('start') && !a2.last('start').rejoin && a2.last('ro') && a2.last('st'), 'the new screen gets the full match start');
  assert(a1.last('kick'), 'the old screen is told'); assert.equal(a1.readyState, 3);
  assert.equal(seat.connected, true); assert.equal(seat.bot, false);
  assert.equal(seat.bounty, 3, 'the seat keeps its state');
  // the old screen can't grab it back, and can't steer it
  const back = await connect(room, `/ws?match=room:TAKE&rejoin=${w1.id}&secret=${w1.secret}`);
  assert(back.last('rejoinfail'), 'the old secret no longer works');
  assert.equal(a2.readyState, 1, 'the new screen keeps the seat');
  const n0 = a2.of('s').length;
  a2.say({ t: 'in', s: 1, mx: 1, my: 0 });
  steps(room, 5);
  assert.equal(a2.of('s').length - n0, 5, 'snapshots go to the new screen');
  assert.equal(seat.lastSeq, 1, 'and its inputs are the ones that count');
  // quitting records the result once; the match ending later adds nothing
  a2.say({ t: 'bye' });
  await settle();
  assert.equal(db.progress('u1').games, 1, 'a quit is recorded');
  const a3 = await connect(room, '/ws?match=room:TAKE&name=Again&brawler=volt&mode=bounty&lobby=12&token=tok1');
  // (a friend room holds them for its next match instead)
  assert(!a3.last('welcome') && a3.last('roomwait'), 'after quitting, the account cannot slip back into the same match');
  a3.close(1000, 'cancel');
  await finish(room);
  assert.equal(db.progress('u1').games, 1, 'still one game');
  g.say({ t: 'bye' });
}
// ---- belt and braces: even if one account somehow sat in two seats, it is paid once
{
  const db = fakeD1(), room = manual(new MatchRoom({}, fakeEnv(db)));
  db.addUser('u1', 'tok1');
  await connect(room, '/ws?match=room:TWICE&name=A&brawler=volt&mode=bounty&lobby=12');
  await connect(room, '/ws?match=room:TWICE&name=B&brawler=volt&mode=bounty&lobby=12');
  await connect(room, '/ws?match=room:TWICE&name=C&brawler=volt&mode=bounty&lobby=12');
  for (const p of humans(room)) p.account = 'u1';
  start(room);
  await finish(room);
  assert.equal(db.progress('u1').games, 1, 'one result per account per match (got ' + db.progress('u1').games + ')');
  assert.equal(db.progress('u1').trophies.volt <= 8, true);
}
// ---- guests (no token) and different accounts are unaffected
{
  const db = fakeD1(), room = manual(new MatchRoom({}, fakeEnv(db)));
  db.addUser('u1', 'tok1'); db.addUser('u2', 'tok2');
  const cs = [];
  for (const t of ['', '', '&token=tok1', '&token=tok2', '&token=not-a-token']) cs.push(await connect(room, '/ws?match=room:GUESTS&name=G&brawler=volt&mode=bounty&lobby=12' + t));
  assert.equal(humans(room).length, 5, 'five people, five seats');
  assert(cs.every((c) => c.readyState === 1 && !c.last('kick')));
  start(room);
  await finish(room);
  assert.equal(db.progress('u1').games, 1); assert.equal(db.progress('u2').games, 1);
}
// ---- results use the match they came from, even if the room restarts while D1 is busy
{
  const db = fakeD1(), room = manual(new MatchRoom({}, fakeEnv(db)));
  for (const u of ['u1', 'u2', 'u3']) db.addUser(u, 'tok-' + u);
  const cs = [await connect(room, '/ws?match=room:RACE&name=Host&brawler=volt&mode=bounty&lobby=12')]; // a guest hosts the room
  for (const u of ['u1', 'u2', 'u3']) cs.push(await connect(room, `/ws?match=room:RACE&name=${u}&brawler=volt&mode=bounty&lobby=12&token=tok-${u}`));
  start(room);
  const first = room.sim;
  let open; db.gate = new Promise((r) => { open = r; }); // D1 is slow...
  first.time = 1e6; room.step();
  assert.equal(first.phase, 'end');
  // ...and meanwhile the host restarts the room as a Test Range (no rewards) match
  await connect(room, '/ws?match=room:RACE&name=Host&brawler=volt&mode=range');
  assert.notEqual(room.sim, first); assert.equal(room.sim.modeKey, 'range');
  db.gate = null; open();
  for (let i = 0; i < 20; i++) await settle();
  for (const u of ['u1', 'u2', 'u3']) {
    const p = db.progress(u);
    assert.equal(p.games, 1, `${u}: the finished match was recorded`);
    assert.deepEqual(Object.keys(p.modes), ['bounty'], `${u}: under the mode that was played`);
  }
}
// ---- Free Play: one seat per account in a zone, and a reconnect with the right secret always wins
{
  const db = fakeD1(), zone = manual(new ZoneRoom({}, fakeEnv(db)));
  db.addUser('u1', 'tok1', { ...newProgress(), equipped: { title: 'tracker' } });
  const z1 = await connect(zone, '/zone?slot=c&join=1&name=Me&brawler=volt&token=tok1');
  const w1 = z1.last('welcome'), seat = zone.sim.players.get(w1.id);
  assert.equal(seat.account, 'u1');
  seat.bounty = 4;
  const z2 = await connect(zone, '/zone?slot=c&join=1&name=Me&brawler=brick&token=tok1');
  const w2 = z2.last('welcome');
  assert.equal(w2.id, w1.id, 'the second screen takes over the brawler already in the zone');
  assert.equal(zone.sim.humans().length, 1, 'no second player');
  assert(z1.last('kick')); assert.equal(z1.readyState, 3);
  assert.equal(seat.bounty, 4); assert.equal(seat.connected, true);
  assert(z2.last('ro') && z2.last('st'), 'the new screen gets the zone state');
  assert((await connect(zone, `/zone?slot=c&rejoin=${w1.id}&secret=${w1.secret}`)).last('rejoinfail'), 'the old screen cannot take it back');
  assert.equal(z2.readyState, 1);
  // guests are separate people
  const g1 = await connect(zone, '/zone?slot=c&join=1&name=G1&brawler=volt'), g2 = await connect(zone, '/zone?slot=c&join=1&name=G2&brawler=volt');
  assert.equal(zone.sim.humans().length, 3);

  // RECONNECT while the server still thinks the old socket is open (a phone that lost signal
  // never closes it): the right secret must win
  const wg = g1.last('welcome'), gp = zone.sim.players.get(wg.id);
  gp.bounty = 7; gp.hp = 1234;
  assert.equal(g1.readyState, 1, 'the old socket still looks alive to the server');
  const g1b = await connect(zone, `/zone?slot=c&rejoin=${wg.id}&secret=${wg.secret}`);
  assert(!g1b.last('rejoinfail'), 'not refused');
  assert.equal(g1b.last('welcome').id, wg.id); assert.equal(g1b.last('welcome').rejoin, 1);
  assert.equal(g1.readyState, 3, 'the stale socket was closed');
  assert(!g1.last('kick'), 'quietly: it is the same player');
  assert.equal(zone.sim.players.get(wg.id), gp); assert.equal(gp.bounty, 7); assert.equal(gp.hp, 1234);
  assert.equal(zone.sim.humans().length, 3, 'nobody was added or removed');
  const n0 = g1b.of('s').length;
  g1b.say({ t: 'in', s: 9, mx: 0, my: 0 });
  steps(zone, 3);
  assert.equal(g1b.of('s').length - n0, 3, 'the new socket gets the snapshots');
  assert.equal(gp.lastSeq, 9);
  // and the ordinary case (the old socket did close first) still works
  g1b.close();
  assert.equal(gp.connected, false); assert(zone.dropped.has(wg.id));
  const g1c = await connect(zone, `/zone?slot=c&rejoin=${wg.id}&secret=${wg.secret}`);
  assert.equal(g1c.last('welcome').rejoin, 1); assert.equal(gp.connected, true); assert(!zone.dropped.has(wg.id));
  for (const c of [z2, g2, g1c]) c.say({ t: 'bye' });
  assert.equal(zone.sim, null, 'the zone shuts down when everyone has left');
}
// ---- Free Play: a full zone refuses new arrivals with a friendly message (and nothing else changes)
{
  const db = fakeD1(), zone = manual(new ZoneRoom({}, fakeEnv(db)));
  db.addUser('u1', 'tok1');
  const mine = await connect(zone, '/zone?slot=c&join=1&name=Me&brawler=volt&token=tok1');
  const crowd = [];
  for (let i = 1; i < ZONE_HUMANS; i++) crowd.push(await connect(zone, `/zone?slot=c&join=1&name=G${i}&brawler=volt`));
  assert.equal(zone.sim.humans().length, ZONE_HUMANS);
  const late = await connect(zone, '/zone?slot=c&join=1&name=Late&brawler=volt');
  assert(late.last('kick') && /full/i.test(late.last('kick').reason), 'a friendly refusal');
  assert(!late.last('welcome')); assert.equal(late.readyState, 3);
  assert.equal(zone.sim.humans().length, ZONE_HUMANS, 'nobody was added');
  steps(zone, 3);
  // people already inside are never bounced: reconnects, the same account on a new screen, watching
  const w = crowd[0].last('welcome');
  assert.equal((await connect(zone, `/zone?slot=c&rejoin=${w.id}&secret=${w.secret}`)).last('welcome').rejoin, 1, 'a reconnect still gets in');
  assert.equal((await connect(zone, '/zone?slot=c&join=1&name=Me&brawler=volt&token=tok1')).last('welcome').id, mine.last('welcome').id, 'so does the same account');
  assert((await connect(zone, '/zone?slot=c&x=1&y=1')).last('welcome').observer, 'and border observers');
  crowd[1].say({ t: 'bye' });
  assert((await connect(zone, '/zone?slot=c&join=1&name=Late&brawler=volt')).last('welcome'), 'a free spot can be taken again');
}
assert.equal(faults.n, 0, String(faults.last && faults.last.stack));
console.log('seat / result / reconnect tests passed');

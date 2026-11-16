// UNLOCKABLE CARS (Oblivion GP Part 4): the unlock rules in progress JSON (public/race/unlocks.js),
// old saves upgraded without loss, the race results that count toward them, the store actions,
// the server refusing a locked car at the race join (crafted joins through the real worker and
// RaceRoom), and two devices on one account seeing the same unlocks.
import assert from 'node:assert';
import { raceEnv, fakeD1, open, settle } from './race-harness.js';
import worker, { RaceRoom, RaceMatchmaker } from '../src/worker.js';
import { RaceClient } from '../public/race/net.js';
import { newProgress, normalize, totalTrophies } from '../public/progression.js';
import { applyPurchase } from '../public/catalog.js';
import { applyRace } from '../src/race/results.js';
import { NEW_DRIVER_IDS, DRIVER_IDS, DRIVERS } from '../public/race/physics.js';
import { TRACK_IDS } from '../public/race/tracks.js';
import { UNLOCKS, PERKS, carUnlocked, unlockedCars, unlockProgress, defaultCar, challengeState, dailyChallenge, weeklyChallenge, dayOf, weekOf, PIECES_NEEDED, DAILY_PIECES, WEEKLY_PIECES } from '../public/race/unlocks.js';
import { rarityOf } from '../public/race/looks2.js';

const DAY = 20400; // a fixed UTC day for the challenge tests
const race = (p, o) => applyRace(p, { raceMode: 'grand', track: 'desert', rank: 5, players: 10, kills: 0, brawler: 'volt', mode: 'race_grand', mc: 0, day: DAY, ...o });

// ---------------------------------------------------------------- the rules
{
  assert.deepStrictEqual(Object.keys(UNLOCKS), NEW_DRIVER_IDS, 'a rule for every new car');
  for (const id of NEW_DRIVER_IDS) {
    assert.strictEqual(UNLOCKS[id].rarity, rarityOf(id), `${id}: the rule's rarity is the art's rarity`);
    assert.ok(PERKS[id], `${id}: a perk text`);
  }
  for (const id of ['void', 'fang', 'frost']) assert.ok(UNLOCKS[id].coins > 0 && UNLOCKS[id].goal.stat === 'trophies', `${id}: rare = coins or a trophy milestone`);
  assert.deepStrictEqual(['grav', 'vx', 'redline'].map((id) => UNLOCKS[id].goal.text), ['Win 5 Elimination races', 'Get 10 takedowns in races', 'Finish 1st on all 4 tracks']);
  for (const id of ['helix', 'prime']) assert.ok(UNLOCKS[id].pieces === PIECES_NEEDED && UNLOCKS[id].goal.n > 0, `${id}: legendary = a long-term goal + pieces`);
  // a new account drives the six starters and nothing else
  const p = normalize(newProgress());
  assert.deepStrictEqual(unlockedCars(p), DRIVER_IDS);
  for (const id of NEW_DRIVER_IDS) assert.ok(!carUnlocked(p, id) && unlockProgress(p, id).f < 1, `${id} starts locked with a progress bar below full`);
  assert.strictEqual(defaultCar(p), 'volt');
  console.log('unlock rules: ok');
}

// ---------------------------------------------------------------- old saves: upgraded, nothing lost
{
  const old = { v: 1, xp: 5400, coins: 777, gems: 31, trophies: { volt: 60, wisp: 40 }, owned: ['trail_gold', 'last_racer'], claimed: [100],
    race: { best: { desert: 61.2 }, bestLap: { neon: 20.1 }, races: 40, wins: 7, elimWins: 2, cos: { volt: { trail: 'trail_gold' } }, tut: 1 },
    modes: { race_grand: { games: 30, wins: 5, top3: 9, kills: 6 }, race_elim: { games: 10, wins: 2, top3: 4, kills: 3 } } };
  const n = normalize(JSON.parse(JSON.stringify(old)));
  assert.strictEqual(n.coins, 777); assert.strictEqual(n.gems, 31); assert.strictEqual(n.xp, 5400);
  assert.deepStrictEqual([n.trophies.volt, n.trophies.wisp], [60, 40]);
  assert.ok(n.owned.includes('trail_gold') && n.owned.includes('last_racer'));
  assert.deepStrictEqual([n.race.best, n.race.bestLap, n.race.races, n.race.wins, n.race.elimWins, n.race.tut], [old.race.best, old.race.bestLap, 40, 7, 2, 1]);
  assert.deepStrictEqual(n.race.cos.volt, { trail: 'trail_gold' });
  assert.deepStrictEqual(n.race.cars, [], 'no cars yet (100 trophies is short of the first milestone)');
  assert.strictEqual(n.race.ko, 9, 'lifetime race takedowns start from the race mode stats already saved');
  assert.deepStrictEqual(n.race.pieces, { helix: 0, prime: 0 });
  // an old save already past a milestone gets the car on load
  const rich = normalize({ trophies: { volt: 200, brick: 120 } });
  assert.ok(carUnlocked(rich, 'void') && carUnlocked(rich, 'fang') && !carUnlocked(rich, 'frost'), '320 trophies: VOIDRUNNER and SOLAR FANG');
  // normalize is idempotent and never drops an unlock, even if trophies fall later
  const again = normalize(JSON.parse(JSON.stringify(rich)));
  again.trophies = { volt: 10 };
  assert.ok(carUnlocked(normalize(again), 'void'), 'an unlocked car stays unlocked');
  // broken shapes are repaired, junk ids dropped
  const junk = normalize({ race: { cars: ['prime', 'nope', 'prime', 7], pieces: { helix: 99, prime: -3, x: 4 }, firsts: [1], ch: 'x', car: 'ufo', ko: 'lots' } });
  assert.deepStrictEqual(junk.race.cars, ['prime']); assert.deepStrictEqual(junk.race.pieces, { helix: PIECES_NEEDED, prime: 0 });
  assert.deepStrictEqual(junk.race.firsts, {}); assert.strictEqual(junk.race.car, undefined); assert.strictEqual(junk.race.ko, 0);
  console.log('old saves: ok');
}

// ---------------------------------------------------------------- rare: buy with coins, or trophies
{
  let p = normalize(newProgress());
  assert.ok(applyPurchase(p, { action: 'carbuy', car: 'void' }).error, 'not enough coins');
  p.coins = 2000;
  const out = applyPurchase(p, { action: 'carbuy', car: 'void' });
  assert.ok(!out.error && out.unlocked[0] === 'void' && carUnlocked(out.progress, 'void'), 'bought');
  assert.strictEqual(out.progress.coins, 2000 - UNLOCKS.void.coins);
  assert.ok(applyPurchase(out.progress, { action: 'carbuy', car: 'void' }).error, 'never twice');
  for (const id of ['grav', 'vx', 'redline', 'helix', 'prime']) { p.coins = 1e6; assert.ok(applyPurchase(p, { action: 'carbuy', car: id }).error, `${id} is won, not bought`); }
  assert.ok(applyPurchase(p, { action: 'carbuy', car: 'volt' }).error, 'a starter is not for sale');
  // the default car: only an unlocked one
  assert.ok(applyPurchase(p, { action: 'carset', car: 'prime' }).error);
  assert.ok(!applyPurchase(p, { action: 'carset', car: 'void' }).error && defaultCar(p) === 'void');
  // trophy milestone, through race results
  p = normalize(newProgress());
  p.trophies.volt = 444;
  let r = race(p, { rank: 1, brawler: 'volt' });
  assert.ok(totalTrophies(r.progress) >= 450 && ['void', 'fang', 'frost'].every((id) => carUnlocked(r.progress, id)), 'a win past 450 trophies unlocks all three rares');
  assert.ok(r.unlocked.includes('frost'), 'the result says which car was just unlocked');
  console.log('rare unlocks: ok');
}

// ---------------------------------------------------------------- epic: win-based challenges
{
  let p = normalize(newProgress());
  for (let i = 0; i < 4; i++) p = race(p, { raceMode: 'elim', mode: 'race_elim', rank: 1, surv: 120 }).progress;
  assert.ok(!carUnlocked(p, 'grav') && unlockProgress(p, 'grav').f === 0.8, '4 of 5 Elimination wins: 80%');
  let r = race(p, { raceMode: 'elim', mode: 'race_elim', rank: 1, surv: 120 });
  assert.ok(carUnlocked(r.progress, 'grav') && r.unlocked.includes('grav'), 'the 5th Elimination win unlocks GRAVITON');
  p = normalize(newProgress());
  p = race(p, { kills: 6 }).progress;
  assert.ok(!carUnlocked(p, 'vx') && unlockProgress(p, 'vx').lines[0].have === 6);
  p = race(p, { raceMode: 'battle', mode: 'race_battle', track: 'neon', kills: 4 }).progress;
  assert.ok(carUnlocked(p, 'vx'), '10 race takedowns (any race mode) unlock PHANTOM VX');
  p = normalize(newProgress());
  for (const t of TRACK_IDS.slice(0, 3)) p = race(p, { track: t, rank: 1 }).progress;
  p = race(p, { raceMode: 'battle', mode: 'race_battle', track: TRACK_IDS[3], rank: 1 }).progress;
  assert.ok(!carUnlocked(p, 'redline'), 'a Battle Arena win is not a 1st place on a track');
  p = race(p, { raceMode: 'trial', track: TRACK_IDS[3], rank: 1, time: 60 }).progress;
  assert.ok(!carUnlocked(p, 'redline'), 'a Time Trial is not a race win');
  r = race(p, { raceMode: 'elim', mode: 'race_elim', track: TRACK_IDS[3], rank: 1, surv: 100 });
  assert.ok(carUnlocked(r.progress, 'redline') && r.unlocked.includes('redline'), '1st on all 4 tracks unlocks REDLINE ZERO');
  console.log('epic unlocks: ok');
}

// ---------------------------------------------------------------- legendary: long-term goals + pieces
{
  const D = dailyChallenge(DAY), Wk = weeklyChallenge(DAY);
  let p = normalize(newProgress());
  const st = challengeState(p, DAY);
  assert.deepStrictEqual(st.map((c) => [c.kind, c.text, c.have, c.done]), [['daily', D.text, 0, false], ['weekly', Wk.text, 0, false]]);
  // play races that meet both challenges (wins with takedowns count for every challenge kind)
  let pieces = 0, n = 0;
  while (!challengeState(p, DAY)[1].done && n++ < 40) { const r = race(p, { rank: 1, kills: 3 }); p = r.progress; pieces += r.pieces ? r.pieces.pieces : 0; }
  assert.strictEqual(pieces, DAILY_PIECES + WEEKLY_PIECES, 'the daily and the weekly challenge each pay their pieces once');
  assert.strictEqual(p.race.pieces.helix, DAILY_PIECES + WEEKLY_PIECES, 'pieces fill HELIX first');
  const more = race(p, { rank: 1, kills: 3 });
  assert.ok(!more.pieces, 'no more pieces today');
  // the next day: a new daily challenge (the weekly one is done for the week)
  const day2 = DAY + 1;
  assert.strictEqual(weekOf(day2), weekOf(DAY));
  let r2 = null;
  for (let i = 0; i < 6 && !(r2 && r2.pieces); i++) r2 = applyRace(more.progress, { raceMode: 'grand', track: 'neon', rank: 1, players: 10, kills: 3, brawler: 'volt', mode: 'race_grand', day: day2 });
  assert.ok(r2.pieces && r2.pieces.pieces === DAILY_PIECES, 'a new day, a new daily piece');
  // HELIX: 10 pieces AND 25 wins
  p = normalize(newProgress());
  p.race.pieces.helix = PIECES_NEEDED; p.race.wins = 24;
  assert.ok(!carUnlocked(normalize(p), 'helix'), 'pieces alone are not enough');
  const hx = race(p, { rank: 1 });
  assert.ok(carUnlocked(hx.progress, 'helix') && hx.unlocked.includes('helix'), 'the 25th win with 10 pieces unlocks HELIX');
  // once HELIX is done the pieces go to PRIME; PRIME needs 1000 trophies too (the hardest)
  const q = hx.progress;
  q.race.ch = { d: 0, dp: {}, dd: 0, w: 0, wp: {}, wd: 0 };
  const r3 = race(q, { rank: 1, kills: 3 });
  assert.ok(r3.pieces && r3.pieces.to.includes('prime') && r3.progress.race.pieces.prime > 0, 'pieces now go to OBLIVION PRIME');
  const pr = r3.progress; pr.race.pieces.prime = PIECES_NEEDED; pr.trophies = { volt: 995 };
  assert.ok(!carUnlocked(normalize(pr), 'prime'));
  const r4 = race(pr, { rank: 1, brawler: 'volt' });
  assert.ok(carUnlocked(r4.progress, 'prime') && r4.unlocked.includes('prime'), '1000 trophies + 10 pieces unlock OBLIVION PRIME');
  // both legendaries done: a piece pays coins
  const done = r4.progress; done.race.ch = { d: 0, dp: {}, dd: 0, w: 0, wp: {}, wd: 0 };
  const c0 = done.coins, r5 = race(done, { rank: 1, kills: 3 });
  assert.ok(r5.pieces.coins > 0 && r5.progress.coins > c0, 'spare pieces pay coins');
  console.log('legendary unlocks: ok');
}

// ---------------------------------------------------------------- the server: race joins
const db = fakeD1();
const pLocked = newProgress(), pOwn = normalize(newProgress());
pOwn.race.cars = ['prime', 'redline']; pOwn.race.car = 'redline';
db.addUser('u1', 'tokLocked', pLocked); db.addUser('u2', 'tokOwner', pOwn);
const env = raceEnv({ RaceRoom, RaceMatchmaker }, db);
async function until(fn, what) { for (let i = 0; i < 300 && !fn(); i++) await settle(5); assert.ok(fn(), what); }
// a crafted join: the raw socket, no client-side checks at all
async function crafted(qs) {
  const ws = await open(worker, env, '/race?' + qs);
  const got = [];
  ws.addEventListener('message', (e) => got.push(JSON.parse(e.data)));
  return { ws, got, send: (m) => ws.send(JSON.stringify(m)) };
}
const roomOf = (code) => env.rooms.get('room:' + code);
{
  // 1) a guest asking for OBLIVION PRIME: told at once, seated in the starter car
  const g = await crafted('name=Gus&driver=prime&room=LOCK1&mode=grand&track=desert&bots=1');
  await settle();
  const car = g.got.find((m) => m.t === 'car');
  assert.ok(car && car.driver === 'volt' && car.want === 'prime' && car.reason === 'locked', 'the guest is told the car is locked');
  const sim = roomOf('LOCK1').sim;
  assert.deepStrictEqual([...sim.players.values()].map((p) => p.driver), ['volt'], 'the server seated the guest in VOLT');
  // 2) an account without the car: replaced by its default car once the account loads
  const L = await crafted('name=Lou&driver=prime&token=tokLocked&room=LOCK1');
  await until(() => L.got.some((m) => m.t === 'car'), 'the locked account is told');
  const pl = [...sim.players.values()].find((p) => p.name === 'Lou');
  assert.strictEqual(pl.driver, 'volt'); assert.strictEqual(L.got.find((m) => m.t === 'car').driver, 'volt');
  // 3) the owner keeps the car
  const O = await crafted('name=Ola&driver=prime&token=tokOwner&room=LOCK1');
  await until(() => [...sim.players.values()].find((p) => p.name === 'Ola')?.carOk, 'the owner is checked');
  const po = [...sim.players.values()].find((p) => p.name === 'Ola');
  assert.strictEqual(po.driver, 'prime', 'an unlocked car is raced'); assert.ok(!O.got.some((m) => m.t === 'car'));
  // 4) a lobby pick of a locked car is refused; the owner may switch to another car they own
  L.send({ t: 'pick', driver: 'helix' }); O.send({ t: 'pick', driver: 'redline' }); g.send({ t: 'pick', driver: 'wisp' });
  await settle();
  assert.strictEqual(pl.driver, 'volt', 'a locked pick is refused');
  assert.ok(L.got.filter((m) => m.t === 'car').length === 2, 'and the client is told again');
  assert.strictEqual(po.driver, 'redline'); assert.strictEqual([...sim.players.values()].find((p) => p.name === 'Gus').driver, 'wisp', 'starters are always fine');
  // the lobby everyone sees has the real cars
  const lob = [...O.got].reverse().find((m) => m.t === 'lobby');
  assert.deepStrictEqual(lob.players.map((r) => r[1]).sort(), ['redline', 'volt', 'wisp']);
  // 5) the race starts before an account has loaded: an unverified new car is not raced
  const sim2 = new (await import('../src/race/sim.js')).RaceSim({ mode: 'grand', track: 'neon', fillBots: false, lobbyTime: 0 });
  const id = sim2.join('Zed', 'helix'); sim2.join('Yan', 'volt');
  sim2.players.get(id).carOk = false;
  const told = []; sim2.send = (pid, m) => { if (m.t === 'car') told.push([pid, m]); };
  sim2.players.get(id).connected = true;
  sim2.start();
  assert.strictEqual(sim2.players.get(id).driver, 'volt'); assert.ok(told.length === 1 && told[0][1].want === 'helix');
  for (const c of [g, L, O]) c.ws.close();
  console.log('locked car refused at join: ok');
}

// ---------------------------------------------------------------- two devices, one account
{
  const p0 = normalize(newProgress()); p0.coins = 5000;
  db.addUser('u3', 'tokSync', p0);
  const api = async (path, body) => { const res = await worker.fetch(new Request('http://hunt.test/api' + path, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer tokSync', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), env); return res.json(); };
  // phone A and phone B both signed in to the same account (the same session token)
  const a0 = await api('/me'), b0 = await api('/me');
  assert.ok(!carUnlocked(a0.user.progress, 'fang') && !carUnlocked(b0.user.progress, 'fang'));
  const buy = await api('/shop', { action: 'carbuy', car: 'fang' }); // phone A buys SOLAR FANG
  assert.ok(!buy.error && carUnlocked(buy.user.progress, 'fang'), 'bought on phone A');
  const b1 = await api('/me'); // phone B refreshes
  assert.ok(carUnlocked(b1.user.progress, 'fang') && b1.user.progress.coins === 5000 - UNLOCKS.fang.coins, 'phone B sees the unlock and the coins');
  await api('/shop', { action: 'carset', car: 'fang' });
  // both phones race in it in one friend room: the server accepts the car for both
  const mk = (name) => new RaceClient({ base: '', params: { name, driver: 'fang', token: 'tokSync', room: 'SYNC2', mode: 'grand', track: 'frozen', bots: 0, lobby: 2 }, transport: (url) => open(worker, env, url) });
  const A = mk('PhoneA'), B = mk('PhoneB');
  await A.connect(); await B.connect();
  const sim = roomOf('SYNC2').sim;
  await until(() => [...sim.players.values()].every((p) => p.carOk && p.account), 'both phones checked');
  assert.deepStrictEqual([...sim.players.values()].map((p) => p.driver), ['fang', 'fang'], 'the unlock is good on both devices');
  // and a car the account does not have is refused on either phone
  A.pick('prime'); await settle();
  assert.strictEqual([...sim.players.values()].find((p) => p.name === 'PhoneA').driver, 'fang');
  A.leave(); B.leave();
  console.log('two-device sync: ok');
}

// ---------------------------------------------------------------- results carry new unlocks to the client
{
  const p = normalize(newProgress());
  p.race.elimWins = 4;
  const r = applyRace(p, { raceMode: 'elim', mode: 'race_elim', track: 'neon', rank: 1, players: 10, kills: 2, brawler: 'void', surv: 90, mc: 0 });
  assert.deepStrictEqual(r.unlocked, ['grav']);
  assert.ok(r.progress.trophies.void > 0, 'an unlockable car earns trophies like the starters');
  assert.ok(DRIVERS.grav && DRIVERS.prime, 'drivers exist');
  console.log('race-unlocks: ok');
}

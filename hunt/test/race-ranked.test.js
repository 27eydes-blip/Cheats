// RANKED LADDER (public/race/ranked.js, applied server-side in src/race/results.js): tiers and
// divisions, rank points per result, the tier floor, which races count, old saves, and that the
// race room marks only public (matchmade) races as ranked.
import assert from 'node:assert';
import { TIERS, rankInfo, rpDelta, applyRanked, rkOf, tierIndex } from '../public/race/ranked.js';
import { applyRace, raceResult } from '../src/race/results.js';
import { newProgress, normalize } from '../public/progression.js';
import { raceConfig } from '../src/race/room.js';

// ---------------------------------------------------------------- tiers
assert.deepStrictEqual(TIERS.map((t) => t.name), ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Oblivion']);
assert.strictEqual(rankInfo(0).label, 'Bronze III');
assert.strictEqual(rankInfo(100).label, 'Bronze II');
assert.strictEqual(rankInfo(299).label, 'Bronze I');
assert.strictEqual(rankInfo(300).label, 'Silver III');
assert.strictEqual(rankInfo(1199).label, 'Gold I');
assert.strictEqual(rankInfo(3499).next, 'Oblivion');
assert.strictEqual(rankInfo(5000).label, 'Oblivion');
assert.strictEqual(rankInfo(5000).next, null);
assert.strictEqual(rankInfo(250).toNext, 50);
assert.strictEqual(rankInfo(250).next, 'Silver III');
for (let rp = 0; rp < 3600; rp += 37) { const i = rankInfo(rp); assert.ok(i.f >= 0 && i.f <= 1 && rp >= i.lo && (i.hi == null || rp < i.hi), `division range at ${rp}`); }

// ---------------------------------------------------------------- points
const res = (rank, players = 10, kills = 0) => ({ rank, players, kills });
assert.strictEqual(rpDelta(0, res(1)), 32, 'a win in Bronze');
assert.ok(rpDelta(0, res(10)) === 0, 'Bronze never loses points');
assert.ok(rpDelta(1300, res(10)) < 0 && rpDelta(1300, res(1)) > 0, 'Platinum: last loses, a win gains');
assert.ok(rpDelta(3600, res(10)) < rpDelta(1300, res(10)), 'losses grow up the ladder');
assert.ok(rpDelta(3600, res(1)) < rpDelta(0, res(1)), 'gains ease off at the top');
assert.ok(rpDelta(0, res(1), 3) > rpDelta(0, res(1), 0), 'a top-3 streak adds a bonus');
assert.strictEqual(rpDelta(0, res(1, 10, 9)) - rpDelta(0, res(1)), 3, 'takedowns add a little (capped)');
for (let rp = 0; rp < 4000; rp += 100) for (let r = 1; r < 10; r++) assert.ok(rpDelta(rp, res(r)) >= rpDelta(rp, res(r + 1)), 'a better place never earns less');

// ---------------------------------------------------------------- applying, the tier floor
const prog = (rp, st = 0) => { const p = normalize(newProgress()); p.race.rk = { rp, best: rp, n: 5, st }; return p; };
let p = prog(305);
let out = applyRanked(p, { raceMode: 'grand', ranked: true, rank: 10, players: 10 });
assert.strictEqual(out.rp, 300, 'Silver III at 305 cannot drop out of Silver');
assert.strictEqual(p.race.rk.rp, 300);
p = prog(290);
out = applyRanked(p, { raceMode: 'elim', ranked: true, rank: 1, players: 10 });
assert.ok(out.up && out.newTier && out.label === 'Silver III' && out.rp === 322, `a win promotes Bronze I to Silver (${out.label} ${out.rp})`);
assert.strictEqual(p.race.rk.n, 6); assert.strictEqual(p.race.rk.st, 1);
p = prog(1000, 2);
out = applyRanked(p, { raceMode: 'grand', ranked: true, rank: 9, players: 10 });
assert.strictEqual(p.race.rk.st, 0, 'outside the top 3 ends the streak');
assert.strictEqual(p.race.rk.best, 1000, 'best keeps the highest');
for (const r of [{ raceMode: 'grand', ranked: false }, { raceMode: 'trial', ranked: true }, { raceMode: 'battle', ranked: true }, { raceMode: 'tutorial', ranked: true }]) {
  const q = prog(500);
  assert.strictEqual(applyRanked(q, { ...r, rank: 1, players: 10 }), null, `${r.raceMode} ${r.ranked ? 'ranked' : 'room'}: does not count`);
  assert.strictEqual(q.race.rk.rp, 500);
}

// ---------------------------------------------------------------- old saves
const old = normalize({ v: 1, xp: 900, coins: 50, race: { wins: 4, races: 12, best: { desert: 70 } } });
assert.deepStrictEqual(rkOf(old), { rp: 0, best: 0, n: 0, st: 0 }, 'an old save starts at Bronze III');
assert.deepStrictEqual(rkOf({ race: { rk: { rp: 'x', best: -5, n: NaN } } }), { rp: 0, best: 0, n: 0, st: 0 }, 'a broken rk is read safely');
assert.strictEqual(tierIndex(rkOf(null).rp), 0);

// ---------------------------------------------------------------- through the server's race results
const row = (o = {}) => ({ p: {}, rank: 1, players: 10, mode: 'grand', track: 'skyline', kills: 2, steals: 0, mc: 10, time: 60, bestLap: 19.5, driver: 'volt', ...o });
const day = 20000;
let a = applyRace(old, { ...raceResult(row()), ranked: true, day });
assert.ok(a.rank && a.rank.rp === 34 && a.rank.delta === 34 && a.rank.label === 'Bronze III', `a ranked win pays RP (${JSON.stringify(a.rank)})`);
assert.strictEqual(a.progress.race.rk.rp, 34);
assert.strictEqual(a.progress.race.wins, 5, 'the old save keeps its wins');
assert.strictEqual(a.progress.race.best.desert, 70, 'and its best times');
const room = applyRace(a.progress, { ...raceResult(row()), ranked: false, day });
assert.ok(!room.rank && room.progress.race.rk.rp === 34, 'a friend-room race leaves the ladder alone');
const trial = applyRace(a.progress, { ...raceResult(row({ mode: 'trial' })), ranked: true, day });
assert.ok(!trial.rank && trial.progress.race.rk.rp === 34, 'Time Trial leaves the ladder alone');
// the JSON round trip (D1) keeps it
assert.strictEqual(rkOf(normalize(JSON.parse(JSON.stringify(a.progress)))).rp, 34);

// ---------------------------------------------------------------- only public races are ranked
const q = new URLSearchParams('mode=grand&track=skyline');
assert.strictEqual(raceConfig('rq:grand:skyline:1:00000000-0000-0000-0000-000000000000', q).ranked, true, 'a matchmade race is ranked');
assert.ok(!raceConfig('room:ABC', q).ranked, 'a friend room is not');
assert.ok(!raceConfig('solo:skyline:00000000-0000-0000-0000-000000000000', q).ranked, 'Time Trial is not');
console.log('race-ranked: ok');

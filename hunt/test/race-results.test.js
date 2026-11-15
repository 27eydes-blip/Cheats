// Race results feed the shared account progression: trophies, XP, coins (+ capped match coins),
// pass XP, missions, per-mode stats tagged race_<mode>; Time Trial saves best times only.
import assert from 'node:assert';
import { applyRace, raceResult, MATCH_COIN_CAP } from '../src/race/results.js';
import { newProgress, applyMatch, normalize } from '../public/progression.js';

const row = (o) => ({ p: {}, rank: 1, players: 10, mode: 'grand', track: 'neon', kills: 3, steals: 1, mc: 25, time: 61.2, bestLap: 19.9, finished: true, driver: 'rook', ...o });
const day = 20000;
{
  const r = { ...raceResult(row()), day };
  const out = applyRace(newProgress(), r);
  const ref = applyMatch(newProgress(), { rank: 1, players: 10, kills: 3, bounty: 1, brawler: 'rook', mode: 'race_grand', steals: 1, day });
  assert.strictEqual(out.delta, ref.delta, 'same trophy rule as every match');
  assert.strictEqual(out.progress.trophies.rook, 8);
  assert.strictEqual(out.xp, ref.xp, 'same XP');
  assert.strictEqual(out.coins, ref.coins + 25, 'match coins paid on top');
  assert.strictEqual(out.progress.modes.race_grand.games, 1);
  assert.strictEqual(out.progress.modes.race_grand.wins, 1);
  assert.strictEqual(out.progress.pass.xp, out.xp, 'Hunt Pass XP');
  assert.deepStrictEqual([out.progress.daily.prog.play, out.progress.daily.prog.win, out.progress.daily.prog.kills, out.progress.daily.prog.bounty], [1, 1, 3, 1], 'missions: play, win, takedowns, bounty steals');
  assert.deepStrictEqual([out.progress.race.races, out.progress.race.wins, out.progress.race.bestLap.neon], [1, 1, 19.9]);
  const capped = applyRace(newProgress(), { ...raceResult(row({ mc: 500 })), day });
  assert.strictEqual(capped.matchCoins, MATCH_COIN_CAP, 'match coins are capped');
  const last = applyRace(newProgress(), { ...raceResult(row({ rank: 10 })), day });
  assert.strictEqual(last.progress.trophies.rook, 0, 'last place never goes below 0');
  // survives the normalize round trip (stored as JSON)
  const again = applyRace(JSON.parse(JSON.stringify(out.progress)), { ...raceResult(row({ mode: 'elim' })), day });
  assert.strictEqual(again.progress.race.races, 2);
  assert.strictEqual(again.progress.modes.race_elim.games, 1);
  assert.strictEqual(normalize(again.progress).race.races, 2, 'normalize keeps race stats');
}
{ // time trial: best time only, no trophies / coins / wins
  let p = newProgress();
  const t1 = applyRace(p, raceResult(row({ mode: 'trial', time: 70.5, bestLap: 22 })));
  assert.ok(t1.improved && t1.best === 70.5);
  assert.deepStrictEqual([t1.delta, t1.xp, t1.coins, t1.progress.games], [0, 0, 0, 0]);
  const t2 = applyRace(t1.progress, raceResult(row({ mode: 'trial', time: 75, bestLap: 21.5 })));
  assert.ok(!t2.improved && t2.best === 70.5, 'a slower run keeps the best');
  assert.strictEqual(t2.progress.race.bestLap.neon, 21.5, 'best lap tracked separately');
  const t3 = applyRace(t2.progress, raceResult(row({ mode: 'trial', time: 66 })));
  assert.ok(t3.improved && t3.progress.race.best.neon === 66 && t3.progress.race.trials === 3);
  const dnf = applyRace(t3.progress, raceResult(row({ mode: 'trial', time: null })));
  assert.ok(!dnf.improved && dnf.best === 66, 'an unfinished run changes nothing');
}
console.log('race-results: ok');

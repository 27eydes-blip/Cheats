// Race results -> the existing account progression (public/progression.js applyMatch), so trophies,
// XP, coins, GP Pass XP, daily missions and lifetime stats all work for races. Races are tagged
// 'race_<mode>' in the per-mode stats. A race's match coins (item boxes, laps, takedowns, bounty
// steals) are paid out on top, capped. Time Trial is solo: it never moves trophies (a solo "win"
// every time would be free trophies); it saves your best time per track instead. The tutorial pays
// nothing: finishing it only sets the one-time flag progress.race.tut = 1.
import { applyMatch, normalize } from '../../public/progression.js';

export const MATCH_COIN_CAP = 40;
export const raceTag = (mode) => 'race_' + mode;

// a sim result row ({p, rank, players, mode, track, kills, steals, mc, time, bestLap, driver}) ->
// the result object applyMatch understands (+ race extras)
export function raceResult(row) {
  return {
    rank: row.rank, players: row.players, kills: row.kills | 0, bounty: row.steals | 0, brawler: row.driver,
    mode: raceTag(row.mode), won: undefined, assists: 0, steals: row.steals | 0, wstat: {},
    raceMode: row.mode, track: row.track, mc: row.mc | 0, time: row.time ?? null, bestLap: row.bestLap ?? null, tut: row.tut ? 1 : 0,
  };
}

export function applyRace(prog, r) {
  const p = normalize(prog);
  const race = (p.race = p.race && typeof p.race === 'object' ? p.race : {});
  race.best ||= {};
  race.bestLap ||= {};
  if (r.raceMode === 'tutorial') {
    const first = !!r.tut && race.tut !== 1;
    if (r.tut) race.tut = 1;
    return { progress: p, delta: 0, xp: 0, coins: 0, levels: [], mastery: [], wxp: [], tut: race.tut === 1 ? 1 : 0, first };
  }
  if (r.raceMode === 'trial') {
    race.trials = (race.trials | 0) + 1;
    const cur = race.best[r.track];
    const improved = r.time != null && (cur == null || r.time < cur);
    if (improved) race.best[r.track] = r.time;
    if (r.bestLap != null && (race.bestLap[r.track] == null || r.bestLap < race.bestLap[r.track])) race.bestLap[r.track] = r.bestLap;
    return { progress: p, delta: 0, xp: 0, coins: 0, levels: [], mastery: [], wxp: [], best: race.best[r.track] ?? null, improved };
  }
  const out = applyMatch(p, r);
  const bonus = Math.max(0, Math.min(MATCH_COIN_CAP, r.mc | 0));
  out.progress.coins += bonus;
  out.coins += bonus;
  out.matchCoins = bonus;
  const rr = out.progress.race;
  rr.races = (rr.races | 0) + 1;
  if (r.rank === 1) rr.wins = (rr.wins | 0) + 1;
  if (r.bestLap != null && (rr.bestLap[r.track] == null || r.bestLap < rr.bestLap[r.track])) rr.bestLap[r.track] = r.bestLap;
  return out;
}

// Race results -> the existing account progression (public/progression.js applyMatch), so trophies,
// XP, coins, GP Pass XP, daily missions and lifetime stats all work for races. Races are tagged
// 'race_<mode>' in the per-mode stats. A race's match coins (item boxes, laps, takedowns, bounty
// steals) are paid out on top, capped. Time Trial is solo: it never moves trophies (a solo "win"
// every time would be free trophies); it saves your best time per track instead. The tutorial pays
// nothing: finishing it only sets the one-time flag progress.race.tut = 1.
import { applyMatch, normalize } from '../../public/progression.js';
import { applyRaceUnlocks } from '../../public/race/unlocks.js';

export const MATCH_COIN_CAP = 40;
// ELIMINATION extras on top of the usual placement pay (applyMatch: trophies and coins by place, XP
// and coins per minute survived): coins per takedown (capped), coins per 10 s survived (capped), and
// the cosmetic title 'Last Racer Standing' for a win (earned once, never sold; shown on the results).
export const ELIM_PAY = { ko: 2, koCap: 8, perTen: 1, survCap: 15 };
export const ELIM_TITLE = 'last_racer';
export function elimBonus(r) {
  const ko = ELIM_PAY.ko * Math.max(0, Math.min(ELIM_PAY.koCap, r.kills | 0));
  const surv = ELIM_PAY.perTen * Math.max(0, Math.min(ELIM_PAY.survCap, Math.floor((Number(r.surv) || 0) / 10)));
  return { ko, surv };
}
export const raceTag = (mode) => 'race_' + mode;

// a sim result row ({p, rank, players, mode, track, kills, steals, mc, time, bestLap, driver}) ->
// the result object applyMatch understands (+ race extras)
export function raceResult(row) {
  return {
    rank: row.rank, players: row.players, kills: row.kills | 0, bounty: row.steals | 0, brawler: row.driver,
    mode: raceTag(row.mode), won: undefined, assists: 0, steals: row.steals | 0, wstat: {},
    raceMode: row.mode, track: row.track, mc: row.mc | 0, time: row.time ?? null, bestLap: row.bestLap ?? null, tut: row.tut ? 1 : 0,
    // elim: pay per minute survived (to your knock-out), not a fixed match length
    ...(row.surv != null ? { surv: row.surv, secs: row.surv } : {}),
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
  if (r.raceMode === 'elim') {
    const b = elimBonus(r), win = r.rank === 1;
    out.progress.coins += b.ko + b.surv; out.coins += b.ko + b.surv;
    let title = 0;
    if (win) {
      rr.elimWins = (rr.elimWins | 0) + 1;
      if (!out.progress.owned.includes(ELIM_TITLE)) { out.progress.owned.push(ELIM_TITLE); title = 1; }
    }
    out.elim = { ko: b.ko, surv: b.surv, secs: Math.round(Number(r.surv) || 0), win: win ? 1 : 0, title, titleId: win ? ELIM_TITLE : null };
  }
  // UNLOCKABLE CARS: takedowns, 1st places per track, the daily / weekly piece challenges, then
  // every car whose goal is now met (race/unlocks.js); the progress message carries what was won
  const u = applyRaceUnlocks(out.progress, r, r.day);
  out.unlocked = u.unlocked; out.pieces = u.pieces;
  if (u.pieces && u.pieces.coins) out.coins += u.pieces.coins;
  return out;
}

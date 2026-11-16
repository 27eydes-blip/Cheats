// Oblivion GP unlockable cars: who may drive what, and how each of the 8 new cars is won. Shared by
// the server (authoritative: accounts.js store actions, src/race/results.js after every race, the
// race room's check at join) and the client (Garage / store progress bars). Everything lives in the
// account's progress JSON under progress.race, so it syncs to every device on the account:
//   race.cars     the unlocked new cars (ids, in unlock order; the six starters are always yours)
//   race.car      the account's default car (used when a locked car is asked for at a race join)
//   race.ko       lifetime race takedowns        race.elimWins  Elimination wins (results.js)
//   race.firsts   {track: 1st places} in Grand and Elimination races
//   race.pieces   {helix, prime}: car pieces from the daily / weekly challenges
//   race.ch       this day's and this week's challenge progress {d, dp, dd, w, wp, wd}
// normalize() (progression.js) runs normalizeRace on every load: old saves get the new fields
// without losing anything (race.ko starts from the race takedowns already in progress.modes).
import { DRIVERS, DRIVER_IDS, NEW_DRIVER_IDS } from './physics.js';
import { TRACK_IDS } from './tracks.js';

export const STARTER_CARS = DRIVER_IDS;
export const NEW_CARS = NEW_DRIVER_IDS;
export const PIECES_NEEDED = 10;
const own = (o, k) => (o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);

// How each car unlocks. Rare: buy with coins OR reach a trophy milestone. Epic: a win-based
// challenge. Legendary: a long-term goal AND 10 car pieces from daily / weekly challenges.
//   stat: what is counted (see statOf)   n: how many   text: what the Garage says
export const UNLOCKS = {
  void: { rarity: 'rare', coins: 1500, goal: { stat: 'trophies', n: 150, text: 'Reach 150 trophies' } },
  fang: { rarity: 'rare', coins: 1500, goal: { stat: 'trophies', n: 300, text: 'Reach 300 trophies' } },
  frost: { rarity: 'rare', coins: 1500, goal: { stat: 'trophies', n: 450, text: 'Reach 450 trophies' } },
  grav: { rarity: 'epic', goal: { stat: 'elimWins', n: 5, text: 'Win 5 Elimination races' } },
  vx: { rarity: 'epic', goal: { stat: 'ko', n: 10, text: 'Get 10 takedowns in races' } },
  redline: { rarity: 'epic', goal: { stat: 'tracks1st', n: TRACK_IDS.length, text: 'Finish 1st on all 4 tracks' } },
  helix: { rarity: 'legendary', pieces: PIECES_NEEDED, goal: { stat: 'wins', n: 25, text: 'Win 25 races' } },
  prime: { rarity: 'legendary', pieces: PIECES_NEEDED, goal: { stat: 'trophies', n: 1000, text: 'Reach 1000 trophies' } },
};
// the passive perk in plain words (Garage, store, unlock screen)
export const PERKS = {
  void: 'Drift sparks charge 20% faster', fang: 'Every boost lasts 25% longer', frost: 'No slipping on ice or oil',
  grav: 'Pulls nearby item boxes to it', vx: 'Once per race, the first hit passes straight through',
  redline: 'Top speed leader, but turns wide', helix: 'Built-in weapon recharges 25% faster', prime: 'The best all-round stats',
};

// Car pieces: one daily challenge (1 piece) and one weekly challenge (3 pieces), the same for
// everyone, picked from these pools by the UTC day / week. Pieces fill HELIX first, then PRIME;
// once both are full a piece pays PIECE_COINS coins instead.
export const DAILY_CH = [
  { id: 'd_play4', text: 'Play 4 races', stat: 'play', goal: 4 },
  { id: 'd_top3x3', text: 'Finish top 3 in 3 races', stat: 'top3', goal: 3 },
  { id: 'd_ko4', text: 'Get 4 takedowns', stat: 'ko', goal: 4 },
  { id: 'd_win1', text: 'Win a race', stat: 'win', goal: 1 },
];
export const WEEKLY_CH = [
  { id: 'w_win5', text: 'Win 5 races this week', stat: 'win', goal: 5 },
  { id: 'w_ko25', text: 'Get 25 takedowns this week', stat: 'ko', goal: 25 },
  { id: 'w_top3x12', text: 'Finish top 3 in 12 races this week', stat: 'top3', goal: 12 },
];
export const DAILY_PIECES = 1, WEEKLY_PIECES = 3, PIECE_COINS = 100;
export const dayOf = (now = Date.now()) => Math.floor(now / 864e5);
export const weekOf = (day) => Math.floor((day + 3) / 7); // UTC weeks start on Monday (day 0 was a Thursday)
const pickCh = (pool, k) => pool[(((Math.imul(k | 0, 2654435761) >>> 0) % 9973) + (k | 0)) % pool.length];
export const dailyChallenge = (day = dayOf()) => pickCh(DAILY_CH, day);
export const weeklyChallenge = (day = dayOf()) => pickCh(WEEKLY_CH, weekOf(day));

const isNew = (id) => NEW_CARS.includes(id);
export const carUnlocked = (p, id) => STARTER_CARS.includes(id) || (isNew(id) && !!p && !!p.race && Array.isArray(p.race.cars) && p.race.cars.includes(id));
export const unlockedCars = (p) => [...STARTER_CARS, ...NEW_CARS.filter((id) => carUnlocked(p, id))];
// the car a locked pick falls back to: the account's default car if it may drive it, else the first starter
export const defaultCar = (p) => { const c = p && p.race && p.race.car; return typeof c === 'string' && DRIVERS[c] && carUnlocked(p, c) ? c : STARTER_CARS[0]; };

const sumTrophies = (p) => Object.values((p && p.trophies) || {}).reduce((s, v) => s + (v | 0), 0);
export function statOf(p, stat) {
  const r = (p && p.race) || {};
  switch (stat) {
    case 'trophies': return sumTrophies(p);
    case 'elimWins': return r.elimWins | 0;
    case 'ko': return r.ko | 0;
    case 'wins': return r.wins | 0;
    case 'tracks1st': return TRACK_IDS.filter((t) => (own(r.firsts, t) | 0) > 0).length;
  }
  return 0;
}
// a locked car's progress for the Garage bar: {f 0..1, have, need, text, lines: [{text, have, need}], coins?}
export function unlockProgress(p, id) {
  const U = UNLOCKS[id];
  if (!U) return { f: 1, done: true, lines: [], text: '' };
  const g = U.goal, have = Math.min(g.n, statOf(p, g.stat));
  const lines = [{ text: g.text, have, need: g.n }];
  let f = have / g.n;
  if (U.pieces) {
    const pc = Math.min(U.pieces, (own(p && p.race && p.race.pieces, id) | 0));
    lines.push({ text: 'Car pieces from daily and weekly challenges', have: pc, need: U.pieces });
    f = (f + pc / U.pieces) / 2;
  }
  if (U.coins) { const c = Math.min(U.coins, (p && p.coins) | 0); f = Math.max(f, c / U.coins); }
  const done = carUnlocked(p, id);
  return { f: done ? 1 : Math.min(1, f), done, lines, coins: U.coins || 0, text: U.coins ? `${U.coins} coins or ${g.text.toLowerCase()}` : lines.map((l) => l.text).join(' + ') };
}

// unlock every car whose goal is met (never the coin price: that is buyCar). Only adds. -> new ids
export function checkUnlocks(p) {
  const r = p.race, got = [];
  for (const id of NEW_CARS) {
    if (r.cars.includes(id)) continue;
    const U = UNLOCKS[id];
    if (statOf(p, U.goal.stat) < U.goal.n) continue;
    if (U.pieces && (own(r.pieces, id) | 0) < U.pieces) continue;
    r.cars.push(id); got.push(id);
  }
  return got;
}

// fill in the race unlock fields (old saves, broken shapes); keeps everything valid that is there
export function normalizeRace(p) {
  const r = p.race;
  r.cars = Array.isArray(r.cars) ? r.cars.filter((id, i, a) => isNew(id) && a.indexOf(id) === i) : [];
  const pieces = r.pieces && typeof r.pieces === 'object' && !Array.isArray(r.pieces) ? r.pieces : {};
  r.pieces = {};
  for (const id of NEW_CARS) if (UNLOCKS[id].pieces) r.pieces[id] = Math.max(0, Math.min(PIECES_NEEDED, Number(own(pieces, id)) | 0));
  // lifetime race takedowns: an old save starts from the takedowns already in its race mode stats
  if (typeof r.ko !== 'number' || !Number.isFinite(r.ko)) r.ko = Object.entries(p.modes || {}).reduce((s, [k, m]) => s + (k.startsWith('race_') && m ? m.kills | 0 : 0), 0);
  const fi = r.firsts && typeof r.firsts === 'object' && !Array.isArray(r.firsts) ? r.firsts : {};
  r.firsts = {};
  for (const t of TRACK_IDS) if ((own(fi, t) | 0) > 0) r.firsts[t] = own(fi, t) | 0;
  const ch = r.ch && typeof r.ch === 'object' && !Array.isArray(r.ch) ? r.ch : {};
  r.ch = { d: ch.d | 0, dp: ch.dp && typeof ch.dp === 'object' ? ch.dp : {}, dd: ch.dd ? 1 : 0, w: ch.w | 0, wp: ch.wp && typeof ch.wp === 'object' ? ch.wp : {}, wd: ch.wd ? 1 : 0 };
  if (r.car != null && !(typeof r.car === 'string' && DRIVERS[r.car])) delete r.car;
  checkUnlocks(p); // a goal already met (e.g. an old save past 150 trophies) unlocks on load
  return p;
}

// this day's / week's challenge state for display: [{kind, text, have, goal, done, pieces}]
export function challengeState(p, day = dayOf()) {
  const r = (p && p.race) || {}, ch = r.ch || {}, w = weekOf(day), D = dailyChallenge(day), Wk = weeklyChallenge(day);
  const dp = ch.d === day ? ch.dp || {} : {}, wp = ch.w === w ? ch.wp || {} : {};
  return [
    { kind: 'daily', id: D.id, text: D.text, have: Math.min(D.goal, dp[D.stat] | 0), goal: D.goal, done: ch.d === day && !!ch.dd, pieces: DAILY_PIECES },
    { kind: 'weekly', id: Wk.id, text: Wk.text, have: Math.min(Wk.goal, wp[Wk.stat] | 0), goal: Wk.goal, done: ch.w === w && !!ch.wd, pieces: WEEKLY_PIECES },
  ];
}
// pieces won go to the first legendary car still short of them; extra pieces pay coins
export function addPieces(p, n) {
  const r = p.race, out = { pieces: 0, to: [], coins: 0 };
  for (let k = 0; k < n; k++) {
    const id = NEW_CARS.find((c) => UNLOCKS[c].pieces && !r.cars.includes(c) && (r.pieces[c] | 0) < UNLOCKS[c].pieces);
    if (id) { r.pieces[id] = (r.pieces[id] | 0) + 1; out.pieces++; if (!out.to.includes(id)) out.to.push(id); } else { p.coins += PIECE_COINS; out.coins += PIECE_COINS; }
  }
  return out;
}

// after one race (server, src/race/results.js): count the unlock stats and the challenges, award
// pieces, unlock what is now earned. r: {raceMode, track, rank, players, kills, won?}. -> {unlocked, pieces}
export function applyRaceUnlocks(p, r, day = dayOf()) {
  const R = p.race, race = r.raceMode === 'grand' || r.raceMode === 'elim', win = r.rank === 1, top3 = r.rank <= 3;
  R.ko = (R.ko | 0) + Math.max(0, r.kills | 0);
  if (race && win && TRACK_IDS.includes(r.track)) R.firsts[r.track] = (R.firsts[r.track] | 0) + 1;
  // challenges: every race mode except Time Trial and the tutorial counts
  const ch = R.ch, w = weekOf(day);
  if (ch.d !== day) { ch.d = day; ch.dp = {}; ch.dd = 0; }
  if (ch.w !== w) { ch.w = w; ch.wp = {}; ch.wd = 0; }
  for (const P of [ch.dp, ch.wp]) { P.play = (P.play | 0) + 1; P.ko = (P.ko | 0) + Math.max(0, r.kills | 0); if (win) P.win = (P.win | 0) + 1; if (top3) P.top3 = (P.top3 | 0) + 1; }
  let pieces = 0;
  const D = dailyChallenge(day), Wk = weeklyChallenge(day);
  if (!ch.dd && (ch.dp[D.stat] | 0) >= D.goal) { ch.dd = 1; pieces += DAILY_PIECES; }
  if (!ch.wd && (ch.wp[Wk.stat] | 0) >= Wk.goal) { ch.wd = 1; pieces += WEEKLY_PIECES; }
  const got = pieces ? addPieces(p, pieces) : null;
  return { unlocked: checkUnlocks(p), pieces: got };
}

// store actions (server-authoritative through catalog.applyPurchase; the client runs the same for display)
//   {action: 'carbuy', car}   buy a rare car with coins (test currency)
//   {action: 'carset', car}   the account's default car (must be unlocked)
export function carAction(p, req) {
  const id = req.car;
  if (req.action === 'carbuy') {
    const U = own(UNLOCKS, id);
    if (!U) return { error: 'not for sale' };
    if (carUnlocked(p, id)) return { error: 'already unlocked' };
    if (!U.coins) return { error: 'This car is won, not bought' };
    if ((p.coins | 0) < U.coins) return { error: 'Not enough coins (test)' };
    p.coins -= U.coins;
    p.race.cars.push(id);
    return { progress: p, unlocked: [id] };
  }
  if (req.action === 'carset') {
    if (typeof id !== 'string' || !DRIVERS[id]) return { error: 'bad car' };
    if (!carUnlocked(p, id)) return { error: 'That car is locked' };
    p.race.car = id;
    return { progress: p };
  }
  return { error: 'unknown action' };
}

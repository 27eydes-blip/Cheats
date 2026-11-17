// RANKED LADDER: rank points (RP) earned from public races (Grand Race and Elimination, matchmade:
// never friend rooms, Time Trial, Battle or the tutorial), shown as a tier from Bronze to Oblivion.
// Server-authoritative: src/race/results.js applies it after every race; the client only reads it.
// Lives in the account's progress JSON as progress.race.rk = {rp, best, n, st}:
//   rp    rank points now          best  the highest RP ever (the best tier reached)
//   n     ranked races played      st    top-3 streak (consecutive top-3 finishes)
// Old saves have no rk: they start at Bronze III with 0 RP (rkOf() fills it in, nothing is lost).
// Tiers have three divisions (III, II, I) except Oblivion. You can slip back a division but never
// out of a tier you are in (the tier floor holds), and Bronze never loses points.
export const TIERS = [
  { id: 'bronze', name: 'Bronze', at: 0, col: '#d08a5c' },
  { id: 'silver', name: 'Silver', at: 300, col: '#cfd8ea' },
  { id: 'gold', name: 'Gold', at: 700, col: '#f0c987' },
  { id: 'platinum', name: 'Platinum', at: 1200, col: '#7ef9e0' },
  { id: 'diamond', name: 'Diamond', at: 1800, col: '#7ab8ff' },
  { id: 'master', name: 'Master', at: 2600, col: '#c77dff' },
  { id: 'oblivion', name: 'Oblivion', at: 3500, col: '#ff4fd8' },
];
export const RANKED_MODES = ['grand', 'elim'];
const DIVS = ['III', 'II', 'I'];
// RP for a race: by finishing place in the field (win +32 .. last -14 at the base), a little per
// takedown, a streak bonus for top-3 runs. Losses scale up the ladder, gains ease off at the top.
export const RP = { win: 32, last: -14, ko: 1, koCap: 3, streak: 2, streakCap: 3 };
const LOSS = [0, 0.5, 0.75, 1, 1.15, 1.3, 1.5];
const GAIN = [1, 1, 0.95, 0.9, 0.85, 0.8, 0.75];

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
// the ladder state of a progress object (read-only: a fresh object for old saves)
export function rkOf(p) {
  const rk = p && p.race && p.race.rk && typeof p.race.rk === 'object' ? p.race.rk : {};
  const rp = Math.max(0, Math.floor(num(rk.rp)));
  return { rp, best: Math.max(rp, Math.floor(num(rk.best))), n: Math.max(0, Math.floor(num(rk.n))), st: Math.max(0, Math.floor(num(rk.st))) };
}
export const tierIndex = (rp) => { let k = 0; while (k + 1 < TIERS.length && rp >= TIERS[k + 1].at) k++; return k; };
// {tier, k, div ('III'|'II'|'I'|''), label 'Gold II', lo, hi (this division's RP range; hi null at the
// top), f (0..1 through the division), next ('Gold I' | null), toNext (RP to it)}
export function rankInfo(rp) {
  rp = Math.max(0, Math.floor(num(rp)));
  const k = tierIndex(rp), T = TIERS[k], top = k === TIERS.length - 1;
  if (top) return { tier: T, k, div: '', label: T.name, lo: T.at, hi: null, f: 1, next: null, toNext: 0, rp };
  const span = TIERS[k + 1].at - T.at, d = Math.min(2, Math.floor(((rp - T.at) * 3) / span));
  const lo = T.at + Math.round((span * d) / 3), hi = d === 2 ? TIERS[k + 1].at : T.at + Math.round((span * (d + 1)) / 3);
  const next = d === 2 ? (k + 1 === TIERS.length - 1 ? TIERS[k + 1].name : `${TIERS[k + 1].name} III`) : `${T.name} ${DIVS[d + 1]}`;
  return { tier: T, k, div: DIVS[d], label: `${T.name} ${DIVS[d]}`, lo, hi, f: (rp - lo) / (hi - lo), next, toNext: hi - rp, rp };
}

// RP change for one result: r = {rank, players, kills} in a field of `players`
export function rpDelta(rp, r, streak = 0) {
  const n = Math.max(2, r.players | 0), place = Math.max(1, Math.min(n, r.rank | 0)), k = tierIndex(rp);
  const f = (n - place) / (n - 1); // 1 = won, 0 = last
  let d = RP.last + (RP.win - RP.last) * f;
  d = d >= 0 ? d * GAIN[k] : d * LOSS[k];
  if (place <= 3) d += RP.streak * Math.min(RP.streakCap, streak); // (streak = top-3s before this one)
  d += RP.ko * Math.min(RP.koCap, Math.max(0, r.kills | 0));
  return Math.round(d);
}

// apply one race to progress (mutates p.race.rk). r: {raceMode, ranked, rank, players, kills}.
// -> null (not a ranked race) or {rp, delta, from, label, tier, div, up, down, best, toNext, next, f}
export function applyRanked(p, r) {
  if (!r || !r.ranked || !RANKED_MODES.includes(r.raceMode)) return null;
  const rk = rkOf(p), before = rankInfo(rk.rp);
  let d = rpDelta(rk.rp, r, rk.st);
  const floor = TIERS[before.k].at; // never out of the tier you are in
  const rp = Math.max(floor, rk.rp + d);
  d = rp - rk.rp;
  const after = rankInfo(rp);
  p.race.rk = { rp, best: Math.max(rk.best, rp), n: rk.n + 1, st: (r.rank | 0) <= 3 ? rk.st + 1 : 0 };
  const order = (i) => i.k * 3 + (i.div ? DIVS.indexOf(i.div) : 0);
  return {
    rp, delta: d, from: rk.rp, label: after.label, tier: after.tier.id, div: after.div, col: after.tier.col,
    up: order(after) > order(before) ? 1 : 0, down: order(after) < order(before) ? 1 : 0, newTier: after.k > before.k ? 1 : 0,
    best: p.race.rk.best, next: after.next, toNext: after.toNext, f: after.f, streak: p.race.rk.st,
  };
}

// Car balance harness (see race-cars-balance.test.js and COMBAT.md "Car balance").
// HEAD-TO-HEAD, as the lead defined it: every car is raced 1v1 against a rotating field of the
// other 13 cars (all 14 in the pool: the six starters and the eight unlockables), both driven by
// the same bot brain at the same level, with weapons and items on as in a real Grand Race. Every
// unordered pair of cars races RACES_PER_PAIR times: seeds cycle through all 4 tracks and each seed
// is raced twice with the two cars swapping the two front grid slots (mirrored slots), so each car
// gets 13 x 24 = 312 races. A car's win rate = races it finished first / races. Fixed seeds: the
// same table every run.
import { RaceSim } from '../src/race/sim.js';
import { newCar, stepCar, ALL_DRIVER_IDS } from '../public/race/physics.js';
// (the 4 classic tracks the balance was defined and tuned on: the same races and table as before the
// new tracks; the new tracks' effect on car balance is measured separately, see the content report)
import { CLASSIC_TRACK_IDS as TRACK_IDS } from '../public/race/tracks.js';

export const BALANCE_CARS = ALL_DRIVER_IDS;
export const SEEDS_PER_PAIR = 12; // x 2 mirrored slots = 24 races per pair
const IDLE = { st: 0, th: 0, dr: 0 };
// all unordered pairs [i, j], i < j, in a fixed order
export const PAIRS = [];
for (let i = 0; i < BALANCE_CARS.length; i++) for (let j = i + 1; j < BALANCE_CARS.length; j++) PAIRS.push([BALANCE_CARS[i], BALANCE_CARS[j]]);

// one race of car a vs car b: 1 if a won, else 0
export function carDuel(a, b, i, mirror, level = 'normal') {
  const track = TRACK_IDS[i % TRACK_IDS.length];
  const sim = new RaceSim({ mode: 'grand', track, seed: 7100 + i * 13, lobbyTime: 0, fillBots: false, botLevel: level });
  const A = sim.addPlayer({ name: 'A', driver: a, bot: true }), B = sim.addPlayer({ name: 'B', driver: b, bot: true });
  sim.start();
  const G = sim.T.grid;
  for (const [p, k] of [[A, mirror], [B, 1 - mirror]]) { p.car = newCar(G[k].x, G[k].y, G[k].a); stepCar(p.car, IDLE, p.st, sim.T, 0); p.ai = null; }
  sim.rank();
  sim.snapshots = () => {};
  let n = 0;
  while (sim.phase === 'play' && !sim.places && n++ < 30 * 330) sim.tick();
  return A.finished && A.place === 1 ? 1 : B.finished && B.place === 1 ? 0 : A.prog > B.prog ? 1 : 0;
}
// one pair over `seeds` mirrored seed pairs -> {a, b, races, winsA}
export function pairResult(a, b, seeds = SEEDS_PER_PAIR, level) {
  let winsA = 0, races = 0;
  for (let i = 0; i < seeds; i++) for (const m of [0, 1]) { winsA += carDuel(a, b, i, m, level); races++; }
  return { a, b, races, winsA };
}
// per-car table from pair results
export function carTable(rows) {
  const T = Object.fromEntries(BALANCE_CARS.map((c) => [c, { car: c, races: 0, wins: 0, vs: {} }]));
  for (const r of rows) {
    T[r.a].races += r.races; T[r.a].wins += r.winsA; T[r.a].vs[r.b] = r.winsA / r.races;
    T[r.b].races += r.races; T[r.b].wins += r.races - r.winsA; T[r.b].vs[r.a] = 1 - r.winsA / r.races;
  }
  for (const c of BALANCE_CARS) T[c].rate = T[c].wins / Math.max(1, T[c].races);
  return BALANCE_CARS.map((c) => T[c]);
}

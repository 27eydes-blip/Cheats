// Item balance harness (see race-items-balance.test.js and COMBAT.md "Item balance").
// HEAD-TO-HEAD, as the lead defined it: for each item X, 1v1 bot races where racer A gets X at
// every item box (an empty slot gets X, holding X levels it up) and racer B gets the normal
// position-weighted roll at the same boxes (the neutral baseline: the item pool itself). Both
// drive the same car at the same bot level. Races cycle through every track and all 6 drivers;
// each seed is raced twice with A and B swapping the two front grid slots (mirrored slots).
// A's win rate = races A finished first / races. Fixed seeds: the same numbers every run.
import { RaceSim } from '../src/race/sim.js';
import { newCar, stepCar, DRIVER_IDS } from '../public/race/physics.js';
import { TRACK_IDS } from '../public/race/tracks.js'; // every track in the game (the classic four and the new ones)
import { ITEM_IDS } from '../public/race/items.js';

const IDLE = { st: 0, th: 0, dr: 0 };
// one race: returns 1 if A won, else 0 (plus a few stats)
export function duel(item, i, mirror, level = 'normal') {
  const track = TRACK_IDS[i % TRACK_IDS.length], driver = DRIVER_IDS[Math.floor(i / TRACK_IDS.length) % DRIVER_IDS.length];
  const sim = new RaceSim({ mode: 'grand', track, seed: 9000 + i * 7, lobbyTime: 0, fillBots: false, botLevel: level });
  const A = sim.addPlayer({ name: 'A', driver, bot: true }), B = sim.addPlayer({ name: 'B', driver, bot: true });
  sim.itemFor = (p) => (p === A ? item : undefined);
  sim.start();
  // mirrored grid slots: A on slot `mirror`, B on the other
  const G = sim.T.grid;
  for (const [p, k] of [[A, mirror], [B, 1 - mirror]]) { p.car = newCar(G[k].x, G[k].y, G[k].a); stepCar(p.car, IDLE, p.st, sim.T, 0); p.ai = null; }
  sim.rank();
  let uses = 0, dmg = 0;
  const orig = sim.snapshots.bind(sim);
  sim.snapshots = () => { for (const e of sim.events) { if (e[0] === 'use' && e[1] === A.id) uses++; if (e[0] === 'hit' && e[2] === A.id) dmg += e[4]; } };
  let n = 0;
  while (sim.phase === 'play' && !sim.places && n++ < 30 * 330) sim.tick();
  sim.snapshots = orig;
  const won = A.finished && A.place === 1 ? 1 : B.finished && B.place === 1 ? 0 : A.prog > B.prog ? 1 : 0;
  return { won, uses, dmg, time: sim.time, wrecksB: B.deaths, wrecksA: A.deaths };
}
// win rate of item over `pairs` mirrored seed pairs (2 races each)
export function itemWinRate(item, pairs, level) {
  let wins = 0, uses = 0, races = 0, dmg = 0, wA = 0, wB = 0;
  for (let i = 0; i < pairs; i++) for (const m of [0, 1]) { const r = duel(item, i, m, level); wins += r.won; uses += r.uses; dmg += r.dmg; wA += r.wrecksA; wB += r.wrecksB; races++; }
  return { item, races, wins, rate: wins / races, uses: uses / races, dmg: dmg / races, wrecksA: wA / races, wrecksB: wB / races };
}
export const BALANCE_ITEMS = ITEM_IDS;

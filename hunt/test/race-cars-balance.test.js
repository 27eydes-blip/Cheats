// CAR BALANCE (Oblivion GP Part 4): no car wins more than 55% or less than 45%.
// Definition (the lead's, see COMBAT.md "Car balance"): HEAD-TO-HEAD. Every car (the 6 starters
// and the 8 unlockables) races 1v1 against a rotating field of the other 13 cars, both cars driven
// by the same bot brain at the same level, weapons and items on, all 6 tracks, each fixed seed
// raced twice with the grid slots swapped (mirrored). Every pair races 36 times, so each car gets
// 13 x 36 = 468 races (at least the 300 asked for). Its win rate must be 45%-55%. Perks are small
// tradeoffs inside that bound. Deterministic: fixed seeds, the same table every run.
// The full run (3276 races) is spread over a few worker threads.
// CAR_BALANCE_SEEDS=n runs n mirrored seed pairs per car pair instead of 12 (the bound is only checked at 12+).
import assert from 'node:assert';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { pairResult, carTable, PAIRS, SEEDS_PER_PAIR, BALANCE_CARS } from './race-carbalance.js';

const SEEDS = Number(process.env.CAR_BALANCE_SEEDS) || SEEDS_PER_PAIR;
export const LO = 0.45, HI = 0.55;

if (!isMainThread) {
  for (const [a, b] of workerData.pairs) parentPort.postMessage(pairResult(a, b, workerData.seeds));
} else {
  const t0 = Date.now();
  const nw = Math.max(1, Math.min(3, cpus().length - 1));
  const chunks = Array.from({ length: nw }, () => []);
  PAIRS.forEach((pr, i) => chunks[i % nw].push(pr));
  const rows = [];
  await Promise.all(chunks.map((pairs) => new Promise((res, rej) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { pairs, seeds: SEEDS } });
    w.on('message', (r) => rows.push(r)); w.on('error', rej); w.on('exit', (c) => (c ? rej(new Error('worker exit ' + c)) : res()));
  })));
  const table = carTable(rows);
  console.log(`car balance: ${SEEDS * 2 * (BALANCE_CARS.length - 1)} head-to-head races per car, ${rows.length * SEEDS * 2} in all (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  console.log('  car        races   wins');
  for (const r of table) console.log(`  ${r.car.padEnd(9)}  ${String(r.races).padStart(5)}  ${(r.rate * 100).toFixed(1).padStart(5)}%`);
  assert.strictEqual(rows.length, PAIRS.length, 'every pair raced');
  for (const r of table) {
    assert.strictEqual(r.races, SEEDS * 2 * (BALANCE_CARS.length - 1));
    if (SEEDS >= SEEDS_PER_PAIR) assert.ok(r.rate >= LO && r.rate <= HI, `${r.car}: head-to-head win rate ${(r.rate * 100).toFixed(1)}% is outside 45-55%`);
  }
  console.log('race-cars-balance: ok');
}

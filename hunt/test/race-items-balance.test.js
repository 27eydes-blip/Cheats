// ITEM BALANCE (Oblivion GP weapons, part h): no pickup decides a race on its own.
// Definition (the lead's, see COMBAT.md "Item balance"): HEAD-TO-HEAD. For each of the 12 items,
// 300 1v1 bot races where racer A gets that item at every item box (holding it: it levels up) and
// racer B gets the normal position-weighted roll at the same boxes (the neutral baseline is the
// item pool itself). Same car and bot level for both, all 6 tracks, all 6 drivers, each fixed
// seed raced twice with the two grid slots swapped (mirrored). A's win rate must be 45%-55% for
// every item. Deterministic: fixed seeds, the same table every run.
// The full run (3600 races) takes well under a minute spread over a few worker threads.
// ITEM_BALANCE_PAIRS=n runs n seed pairs per item instead of 150 (the bound is only checked at 150+).
import assert from 'node:assert';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { itemWinRate, BALANCE_ITEMS } from './race-itembalance.js';

const PAIRS = Number(process.env.ITEM_BALANCE_PAIRS) || 150; // 150 pairs = 300 races
export const LO = 0.45, HI = 0.55;

if (!isMainThread) {
  for (const it of workerData.items) parentPort.postMessage(itemWinRate(it, workerData.pairs));
} else {
  const t0 = Date.now();
  const nw = Math.max(1, Math.min(3, cpus().length - 1));
  const chunks = Array.from({ length: nw }, () => []);
  BALANCE_ITEMS.forEach((it, i) => chunks[i % nw].push(it));
  const rows = [];
  await Promise.all(chunks.map((items) => new Promise((res, rej) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { items, pairs: PAIRS } });
    w.on('message', (r) => rows.push(r)); w.on('error', rej); w.on('exit', (c) => (c ? rej(new Error('worker exit ' + c)) : res()));
  })));
  rows.sort((a, b) => BALANCE_ITEMS.indexOf(a.item) - BALANCE_ITEMS.indexOf(b.item));
  console.log(`item balance: ${PAIRS * 2} head-to-head races per item (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  console.log('  item        A wins   uses/race');
  for (const r of rows) console.log(`  ${r.item.padEnd(10)}  ${(r.rate * 100).toFixed(1).padStart(5)}%   ${r.uses.toFixed(1)}`);
  assert.strictEqual(rows.length, BALANCE_ITEMS.length, 'every item raced');
  for (const r of rows) {
    assert.strictEqual(r.races, PAIRS * 2);
    assert.ok(r.uses > 0.5, `${r.item}: the bots really use it (${r.uses.toFixed(2)} per race)`);
    if (PAIRS >= 150) assert.ok(r.rate >= LO && r.rate <= HI, `${r.item}: A's head-to-head win rate ${(r.rate * 100).toFixed(1)}% is outside 45-55%`);
  }
  console.log('race-items-balance: ok');
}

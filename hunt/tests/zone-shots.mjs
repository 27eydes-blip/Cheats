// Screenshot helper: node tests/zone-shots.mjs <outdir> [devices=iphone,ipad] [only=label,...]
// Drops into Free Play at fixed spots/times (local dev flags ?at= and ?clock=).
import { chromium } from '@playwright/test';
import { dayNight, DAY_MS } from '../public/shared.js';
const out = process.argv[2] || 'docs/upgrade', devs = (process.argv[3] || 'iphone,ipad').split(','), only = process.argv[4] ? process.argv[4].split(',') : null;
const base = 'http://127.0.0.1:8788';
// a clock phase inside this cycle's Blood Moon
const cyc = Math.floor(Date.now() / DAY_MS) * DAY_MS; let bp = 0.62; while (!dayNight(cyc + bp * DAY_MS).blood) bp += 0.002;
let np = 0.63; while (dayNight(cyc + np * DAY_MS).blood) np += 0.002; // plain night (no Blood Moon)
const SPOTS = [
  ['hub', '10000,10640', 0.2], ['citadel', '10325,4000', 0.25], ['ashlands', '17175,9700', 0.3], ['hollow', '3350,9900', 0.3],
  ['marsh', '10050,16700', 0.3], ['frozen', '2750,16300', 0.2], ['city', '3300,3300', 0.2], ['night', '10000,10640', np], ['bloodmoon', '17175,9700', bp],
];
const DEV = { iphone: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, ipad: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } };
const b = await chromium.launch();
for (const dev of devs) {
  const ctx = await b.newContext(DEV[dev]);
  for (const [label, at, clock] of SPOTS) {
    if (only && !only.includes(label)) continue;
    const p = await ctx.newPage();
    p.on('pageerror', (e) => console.log('ERR', label, e.message));
    await p.goto(`${base}/?free=1&at=${at}&clock=${clock}`);
    await p.waitForFunction(() => window.__hunt && window.__hunt.me, null, { timeout: 30000 });
    await p.waitForTimeout(2500);
    await p.screenshot({ path: `${out}/zone-${label}-${dev}.jpg`, quality: 80 });
    if (label === 'hub') { await p.evaluate(() => window.__huntMap.open()); await p.waitForTimeout(600); await p.screenshot({ path: `${out}/worldmap-${dev}.jpg`, quality: 80 }); }
    await p.close();
  }
}
await b.close();

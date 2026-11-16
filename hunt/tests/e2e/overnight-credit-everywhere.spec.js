// "Created by Sam Eyde III" is on every screen a racer can reach: the lobby, every store tab, the
// GP Pass, Trophy Road, profile, settings, garage / drivers and a driver's detail, friends, the
// missions popup, the pre-race card, a friend room and the finish screen. On each one, on an iPhone
// SE (landscape), an iPhone Pro Max (portrait) and an iPad, the credit must be fully on screen, not
// covered by anything, and clearly visible (opacity above 0.5).
import { test, expect } from '@playwright/test';
import { trackErrors, waitSettled, isolateRaces } from './helpers.js';
import { RACE_SCREENS } from './overnight-lobby-audit.lib.js';

const CREDIT = 'Created by Sam Eyde III';
const SCREENS = [
  ...RACE_SCREENS,
  { name: 'garage (dock)', open: async (p) => { await p.click('#rail_garage'); await p.waitForSelector('.ui-screen:not([hidden])'); } },
];

// Runs in the page: is at least one credit line on screen, on top and clearly visible?
function creditCheck(text) {
  const els = [...document.querySelectorAll('body *')].filter((e) => !e.children.length && e.textContent.trim() === text);
  const seen = [];
  for (const e of els) {
    let shown = true, op = 1;
    for (let x = e; x && x !== document.documentElement; x = x.parentElement) {
      const s = getComputedStyle(x);
      if (x.hidden || s.display === 'none' || s.visibility === 'hidden') shown = false;
      op *= +s.opacity;
    }
    const r = e.getBoundingClientRect();
    if (!shown || r.width < 20) continue;
    const onScreen = r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5;
    // credits ignore taps (pointer-events: none), so let hit testing see them for this check only
    const prev = els.map((c) => c.style.pointerEvents);
    for (const c of els) c.style.pointerEvents = 'auto';
    const top = [[0.08, 0.5], [0.5, 0.5], [0.92, 0.5]].every(([fx, fy]) => {
      const h = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
      return !!h && (h === e || e.contains(h));
    });
    els.forEach((c, i) => { c.style.pointerEvents = prev[i]; });
    if (onScreen && top && op > 0.5) return 'ok';
    seen.push(`${e.className || e.id}: onScreen ${onScreen} onTop ${top} opacity ${op.toFixed(2)} @${Math.round(r.left)},${Math.round(r.top)}`);
  }
  return seen.length ? seen.join(' | ') : 'no credit shown';
}

for (const [label, w, h] of [['iPhone SE landscape', 667, 375], ['iPhone Pro Max portrait', 430, 932], ['iPad', 1180, 820]]) {
  test(`credit visible on every racing screen: ${label} ${w}x${h}`, async ({ browser }) => {
    test.setTimeout(300_000);
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    await isolateRaces(ctx); // (its bots-off public race waits alone)
    const page = await ctx.newPage();
    await page.addInitScript(() => { try { localStorage.setItem('hunt-race-tut', '1'); } catch {} });
    const errors = trackErrors(page);
    const problems = [];
    for (const s of SCREENS) {
      await page.goto('/');
      await page.waitForSelector('#playBtn');
      await page.waitForFunction(() => import('/account.js').then((A) => !!A.ACC.user)); // (its answer re-renders the lobby)
      await s.open(page);
      await waitSettled(page);
      const r = await page.evaluate(creditCheck, CREDIT);
      if (r !== 'ok') problems.push(`[${s.name}] ${r}`);
    }
    expect(problems).toEqual([]);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

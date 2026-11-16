// The 8 unlockable cars in the lobby (Oblivion GP Part 4): the GARAGE shows all 14 cars with the
// locked ones' progress bars, a locked car's detail spins it in, a rare car bought in the STORE
// plays the NEW CAR UNLOCKED screen (credit on it, EQUIP makes it your car), the rarity glow holds
// still under Reduce Flashing, a locked car asked for at a race join is replaced by the server
// (the client is told), and an unlocked one is raced.
import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';

const CREDIT = 'Made by Gleyde Technologies';
// (as in overnight-credit-everywhere.spec.js) is a credit line on screen, on top and clearly visible?
function creditCheck(text) {
  const els = [...document.querySelectorAll('body *')].filter((e) => !e.children.length && e.textContent.trim() === text);
  for (const e of els) {
    let shown = true, op = 1;
    for (let x = e; x && x !== document.documentElement; x = x.parentElement) { const s = getComputedStyle(x); if (x.hidden || s.display === 'none' || s.visibility === 'hidden') shown = false; op *= +s.opacity; }
    const r = e.getBoundingClientRect();
    if (!shown || r.width < 20) continue;
    const onScreen = r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5;
    const prev = els.map((c) => c.style.pointerEvents); for (const c of els) c.style.pointerEvents = 'auto';
    const top = [0.1, 0.5, 0.9].every((fx) => { const h = document.elementFromPoint(r.left + r.width * fx, r.top + r.height / 2); return !!h && (h === e || e.contains(h)); });
    els.forEach((c, i) => { c.style.pointerEvents = prev[i]; });
    if (onScreen && top && op > 0.5) return 'ok';
  }
  return 'no visible credit';
}
// HUNT_DEV-only: put test numbers on this account (coins, trophies, unlock counters)
const grant = (page, body) => page.evaluate((b) => import('/account.js').then(async (A) => {
  const r = await fetch('/api/devgrant', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + A.ACC.token }, body: JSON.stringify(b) });
  A.setUser((await r.json()).user);
}), body);
const progress = (page) => page.evaluate(() => import('/account.js').then((A) => JSON.parse(JSON.stringify(A.progress()))));
async function lobby(browser, { w = 844, h = 390, rf = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
  await ctx.addInitScript((rf) => { try { localStorage.setItem('hunt-race-tut', '1'); if (rf) localStorage.setItem('hunt-settings', JSON.stringify({ reduceFlash: true })); } catch {} }, rf);
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  await page.goto('/');
  await page.waitForSelector('#playBtn');
  await page.waitForFunction(() => import('/account.js').then((A) => !!A.ACC.user));
  return { ctx, page, errors };
}
// the showcase canvas changes between two frames (the car is spinning in)
const portraitSig = (page) => page.evaluate(() => { const cv = document.querySelector('.detail .portrait'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let s = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 97) { s += d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7; if (d[i + 3] > 0 && d[i] + d[i + 1] + d[i + 2] > 60) n++; } return { s, n }; });

test('garage: all 14 cars, locked progress bars, a spin-in detail, the credit, glow steady under Reduce Flashing', async ({ browser }) => {
  for (const rf of [false, true]) {
    const { ctx, page, errors } = await lobby(browser, { rf });
    await grant(page, { trophies: { volt: 120 }, race: { elimWins: 2 } });
    await page.tap('.nameplate #stage');
    await expect(page.locator('.dcard')).toHaveCount(14);
    await expect(page.locator('.dcard.locked')).toHaveCount(8);
    await expect(page.locator('.dcard.rar')).toHaveCount(8);
    // every locked car says what it takes and shows how far along you are
    for (const id of ['void', 'fang', 'frost', 'grav', 'vx', 'redline', 'helix', 'prime']) await expect(page.locator(`.dcard[data-b="${id}"] .dc-prog`)).toHaveCount(1);
    await expect(page.locator('.dcard[data-b="void"] .dc-need')).toHaveText(/1500 coins or reach 150 trophies/);
    await expect(page.locator('.dcard[data-b="void"] .dc-prog')).toHaveAttribute('aria-valuenow', '80');
    await expect(page.locator('.dcard[data-b="grav"] .dc-prog')).toHaveAttribute('aria-valuenow', '40');
    await expect(page.locator('.dcard[data-b="grav"] .dc-need')).toHaveText('Win 5 Elimination races');
    expect(await page.evaluate(creditCheck, CREDIT)).toBe('ok');
    // the rarity glow breathes, and holds still under Reduce Flashing
    const anim = await page.locator('.dcard[data-b="prime"]').evaluate((e) => getComputedStyle(e).animationName);
    expect(anim).toBe(rf ? 'none' : 'rar-breathe');
    // a locked car's detail: it spins in onto its pad, the perk and what it takes, no SELECT
    await page.locator('.dcard[data-b="helix"]').scrollIntoViewIfNeeded();
    await page.tap('.dcard[data-b="helix"]');
    await expect(page.locator('.detail[data-car="helix"]')).toBeVisible();
    await expect(page.locator('.detail .dd-perk')).toContainText('recharges 25% faster');
    await expect(page.locator('.detail .dd-need')).toHaveCount(2); // the long-term goal + the pieces
    await expect(page.locator('.detail .dd-ch')).toHaveCount(2); // today's and this week's piece challenge
    await expect(page.locator('.detail [data-sel]')).toHaveCount(0);
    await expect(page.locator('.detail [data-locked]')).toBeVisible();
    await page.waitForTimeout(250);
    const a = await portraitSig(page); await page.waitForTimeout(200); const b = await portraitSig(page);
    expect(a.n).toBeGreaterThan(20); // drawn
    if (!rf) expect(a.s).not.toBe(b.s); // spinning in
    expect(await page.evaluate(creditCheck, CREDIT)).toBe('ok');
    expect(errors).toEqual([]);
    await ctx.close();
  }
});

test('store: buy a rare car with test coins, NEW CAR UNLOCKED (credit on it, steady under Reduce Flashing), EQUIP drives it', async ({ browser }) => {
  for (const rf of [false, true]) {
    const { ctx, page, errors } = await lobby(browser, { rf });
    await grant(page, { coins: 2000 });
    await page.tap('#rail_store');
    await page.tap('.st-tab[data-t="cars"]');
    await expect(page.locator('.st-card[data-kind="car"]')).toHaveCount(14);
    await page.tap('.st-card[data-id="frost"]');
    await expect(page.locator('#stBuy')).toHaveText('BUY');
    await expect(page.locator('#stPrice')).toContainText('1500');
    // an epic car is won, not bought: its progress, no BUY
    await page.tap('.st-card[data-id="redline"]');
    await expect(page.locator('#stBuy')).toHaveText('LOCKED');
    await expect(page.locator('#stPrice')).toContainText('Finish 1st on all 4 tracks');
    await page.tap('.st-card[data-id="frost"]');
    await page.tap('#stBuy');
    const u = page.locator('.ulk');
    await expect(u).toBeVisible();
    await expect(u.locator('.ulk-name')).toHaveText('FROSTBYTE');
    await expect(u.locator('.ulk-tag')).toHaveText('RARE');
    await expect(u.locator('.ulk-perk')).toHaveText('No slipping on ice or oil');
    await expect(u).toHaveClass(rf ? /calm/ : /^(?!.*calm)/);
    await page.waitForTimeout(1400);
    expect(await page.evaluate(creditCheck, CREDIT)).toBe('ok');
    const p = await progress(page);
    expect(p.race.cars).toEqual(['frost']); expect(p.coins).toBe(500);
    await page.tap('.ulk [data-act="equip"]');
    await expect(u).toHaveCount(0);
    await expect.poll(async () => (await progress(page)).race.car).toBe('frost');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hunt')).brawler)).toBe('frost');
    // the celebration plays once per car on this device
    await page.evaluate(() => import('/account.js').then((A) => A.refresh()));
    await page.waitForTimeout(300);
    await expect(page.locator('.ulk')).toHaveCount(0);
    await expect(page.locator('.st-card[data-id="frost"] .st-badge')).toHaveText(/DRIVING|OWNED/);
    expect(errors).toEqual([]);
    await ctx.close();
  }
});

test('race join: a locked car is replaced by the server (the client is told); an unlocked one is raced', async ({ browser }) => {
  const { ctx, page, errors } = await lobby(browser);
  // a crafted join for a car this account does not have
  await page.goto('/?race=1&mode=grand&track=neon&bots=1&lobby=2&laps=1&driver=prime');
  await page.waitForFunction(() => window.__race && window.__race.rc && window.__race.rc.phase === 'race', null, { timeout: 30_000 });
  await expect(page.locator('.rc-toast')).toContainText('OBLIVION PRIME is locked');
  expect(await page.evaluate(() => [window.__race.rc.myDriver(), window.__race.rc.roster.get(window.__race.rc.id).driver])).toEqual(['volt', 'volt']);
  // unlock VOIDRUNNER (150 trophies), then race it
  await page.goto('/');
  await page.waitForFunction(() => import('/account.js').then((A) => !!A.ACC.user));
  await grant(page, { trophies: { volt: 160 } });
  await expect(page.locator('.ulk')).toBeVisible(); // the trophy milestone's celebration
  await page.tap('.ulk [data-act="later"]');
  await page.goto('/?race=1&mode=grand&track=desert&bots=1&lobby=2&laps=1&driver=void');
  await page.waitForFunction(() => window.__race && window.__race.rc && window.__race.rc.phase === 'race', null, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => [window.__race.rc.myDriver(), window.__race.rc.roster.get(window.__race.rc.id).driver])).toEqual(['void', 'void']);
  expect(errors).toEqual([]);
  await ctx.close();
});

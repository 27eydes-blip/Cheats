// The Credits card: tapping "Made by Gleyde Technologies" in the lobby, or the CREDITS row at the
// bottom of Settings, opens a card with the wordmark and all three credit lines. Escape, CLOSE and
// a tap outside close it; the credit line stays on screen while it is open; the lobby line is a
// real button whose touch pad reaches up to 44px without covering any other control; under Reduce
// Flashing the card shows without animation.
import { test, expect } from '@playwright/test';
import { trackErrors, waitSettled } from './helpers.js';

const LINES = ['Made by Gleyde Technologies', 'Created by Sammy Eyde', 'Produced by COO Juwon Shon'];

async function lobby(page) {
  await page.addInitScript(() => { try { localStorage.setItem('hunt-race-tut', '1'); } catch {} });
  await page.goto('/');
  await page.waitForSelector('#playBtn');
  await page.waitForFunction(() => import('/account.js').then((A) => !!A.ACC.user)); // (its answer re-renders the lobby)
}
async function expectCard(page) {
  const card = page.locator('.cr-pop:not([hidden])');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('role', 'dialog');
  await expect(card.locator('.cr-brand svg')).toBeVisible();
  const text = (await card.locator('.cr-list').innerText()).replace(/\s+/g, ' ');
  for (const l of LINES) expect(text, l).toContain(l);
  // the whole card fits on screen and the credit line is shown above the dim
  const fits = await card.locator('.card-a').evaluate((c) => { const r = c.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 0.5 && r.right <= innerWidth + 0.5; });
  expect(fits, 'card fits the screen').toBe(true);
  await expect(page.locator('#ovCredit')).toBeVisible();
  await expect(page.locator('#ovCredit')).toHaveText('Made by Gleyde Technologies');
  return card;
}

// Runs in the page: the line's touch pad (its ::before) takes taps up to 44px tall, or up to the
// next control above it, and never covers another control (PLAY, the dock, the tab bar); only the
// big car pad may lend its bottom 30px edge.
function padCheck() {
  const c = document.querySelector('#lobby #credit'), r = c.getBoundingClientRect(), cs = getComputedStyle(c);
  const v = (k) => parseFloat(cs.getPropertyValue(k)) || 0, up = v('--cr-up'), down = v('--cr-down'), side = v('--cr-side');
  const pad = { left: r.left - side, right: r.right + side, top: r.top - up, bottom: r.bottom + down };
  const ctrls = [...document.querySelectorAll('#lobby :is(button, a[href], input, select, [role="button"], .tap)')].filter((e) => e !== c && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
  for (const e of ctrls) {
    const q = e.getBoundingClientRect();
    // a big panel (the car pad) may lend the bottom 30px of its edge; everything else, nothing
    const lend = q.width >= 120 && q.height >= 120 ? 30 : 0;
    if (q.left < pad.right - 0.5 && q.right > pad.left + 0.5 && q.top < pad.bottom - 0.5 && q.bottom - lend > pad.top + 0.5) return `pad covers ${e.id || e.className}`;
  }
  // the pad really takes taps: at its top row and at its sides
  for (const [x, y] of [[(r.left + r.right) / 2, pad.top + 1], [pad.left + 1, r.top + r.height / 2], [pad.right - 1, r.top + r.height / 2]]) {
    const t = document.elementFromPoint(x, y);
    if (t !== c) return `pad misses at ${Math.round(x)},${Math.round(y)}: ${t && (t.id || t.className)}`;
  }
  // and it stops only at 44px or at a control right above it
  if (pad.bottom - pad.top < 43.5) {
    let stop = false;
    for (let x = pad.left + 1; x < pad.right - 1 && !stop; x += 4) {
      const above = document.elementFromPoint(x, pad.top - 1);
      const ctrl = above && above.closest('button, a[href], input, select, [role="button"], .tap');
      stop = !!ctrl && ctrl !== c;
    }
    if (!stop) return `pad is ${Math.round(pad.bottom - pad.top)}px with nothing right above it`;
  }
  return 'ok';
}

test('the credit line\'s touch pad never covers another control, in every lobby layout', async ({ browser }) => {
  for (const [w, h, url] of [[667, 375, '/'], [390, 844, '/'], [932, 430, '/'], [1180, 820, '/'], [820, 1180, '/'], [667, 375, '/?shooter=1'], [390, 844, '/?shooter=1']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForSelector('#playBtn');
    await page.waitForFunction(() => import('/account.js').then((A) => !!A.ACC.user));
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    expect(await page.evaluate(padCheck), `${w}x${h} ${url}`).toBe('ok');
    await ctx.close();
  }
});

for (const [label, w, h] of [['iPhone SE', 667, 375], ['iPad', 1180, 820]]) {
  test(`credits open from the lobby credit line and from Settings (${label})`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = trackErrors(page);
    await lobby(page);
    const line = page.locator('#lobby #credit');
    await expect(line).toHaveText('Made by Gleyde Technologies');
    // a real button with a label, and a thumb-sized target on touch
    expect(await line.evaluate((e) => e.tagName)).toBe('BUTTON');
    await expect(page.getByRole('button', { name: /Made by Gleyde Technologies/ })).toBeVisible();
    expect(await page.evaluate(padCheck)).toBe('ok');
    // the target's centre row is the line itself (nothing covers it)
    const hit = await line.evaluate((e) => { const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return t === e; });
    expect(hit).toBe(true);

    // (a) tap the line: the card opens; Escape closes it and focus comes back to the line
    await line.tap();
    await waitSettled(page);
    await expectCard(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('.cr-pop')).toHaveCount(0);
    await expect(line).toBeVisible();

    // tap outside the card closes it too
    await line.tap();
    await expectCard(page);
    await page.mouse.click(4, 4);
    await expect(page.locator('.cr-pop')).toHaveCount(0);

    // (b) Settings: the CREDITS row at the bottom opens it; CLOSE goes back to Settings
    await page.click('#rail_settings');
    const row = page.locator('#setCredits');
    await row.scrollIntoViewIfNeeded();
    await expect(row).toBeVisible();
    await expect(row).toContainText('CREDITS');
    await row.click();
    const card = await expectCard(page);
    await card.locator('[data-close]').click();
    await expect(page.locator('.cr-pop')).toHaveCount(0);
    await expect(page.locator('.ui-screen:not([hidden]) .ui-head .title')).toHaveText('SETTINGS');
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('credits card under Reduce Flashing: no animation, shown at full opacity', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('hunt-settings', JSON.stringify({ reduceFlash: true })); } catch {} });
  await lobby(page);
  await expect(page.locator('body')).toHaveClass(/reduce-flash/);
  await page.click('#lobby #credit');
  const card = await expectCard(page);
  const st = await card.locator('.card-a').evaluate((c) => ({ anims: c.getAnimations().length, op: getComputedStyle(c).opacity }));
  expect(st).toEqual({ anims: 0, op: '1' });
});

// Lobby behaviour (E2): previews never commit until SELECT/EQUIP, reward items show how to earn
// them, every screen has unique ids and no 'undefined' / 'NaN' / 'null', the Hunt Pass opens on
// the first claimable tier, keyboard + Escape work, the hunter fits its frame, new-item dots.
import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';
import { SCREENS } from './overnight-lobby-audit.lib.js';

// set this client's progress (display only) the way a sync from the server would
const setProgress = (page, patch) => page.evaluate(async (patch) => {
  const A = await import('/account.js');
  A.setUser({ ...A.ACC.user, progress: { ...A.progress(), ...patch } });
}, patch);
const selected = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('hunt') || '{}').brawler || 'volt');

test('every lobby screen: unique ids and never "undefined", "NaN" or "null" on screen', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = trackErrors(page);
  const problems = [];
  const check = async (name) => {
    const r = await page.evaluate(() => {
      const ids = {}; for (const e of document.querySelectorAll('[id]')) ids[e.id] = (ids[e.id] || 0) + 1;
      const dup = Object.entries(ids).filter(([, n]) => n > 1).map(([k]) => k);
      const bad = (document.body.innerText.match(/\b(undefined|NaN|null)\b/g) || []);
      const attrs = [...document.querySelectorAll('[aria-label],[title]')].map((e) => (e.getAttribute('aria-label') || '') + ' ' + (e.getAttribute('title') || '')).filter((t) => /\b(undefined|NaN|null)\b/.test(t));
      return { dup, bad, attrs };
    });
    if (r.dup.length) problems.push(`[${name}] duplicate ids: ${r.dup.join(', ')}`);
    if (r.bad.length || r.attrs.length) problems.push(`[${name}] shows ${[...r.bad, ...r.attrs].join(', ')}`);
  };
  for (const s of SCREENS) {
    await page.goto('/');
    await page.waitForSelector('#playBtn');
    await s.open(page);
    await page.waitForTimeout(300);
    await check(s.name);
  }
  // every hunter's skins in the Locker (level / road / pass skins included)
  await page.goto('/'); await page.waitForSelector('#playBtn');
  await page.click('#rail_locker'); await page.click('.lsec[data-open="skins"] .ribbonhead');
  for (const b of ['volt', 'brick', 'wisp', 'dune', 'rook', 'flicker']) { await page.click(`#lkWho [data-w="${b}"]`); await check(`locker skins ${b}`); }
  // a Hunt Pass with claimable rewards, and the Trophy Road with something to claim
  await setProgress(page, { pass: { xp: 7 * 120 + 30, premium: false, claimed: [] }, trophies: { volt: 250 } });
  await page.click('.ui-screen .back'); await page.waitForTimeout(250);
  await page.click('#rail_pass'); await page.waitForSelector('.track .claim'); await check('hunt pass with claims');
  expect(problems).toEqual([]);
  expect(errors).toEqual([]);
});

test('brawler detail is a preview: CLOSE, Escape and a tap outside cancel; only SELECT changes your hunter', async ({ page }) => {
  await page.goto('/'); await page.waitForSelector('#playBtn');
  const before = await selected(page);
  expect(before).toBe('volt');
  await page.click('.nameplate #stage');
  for (const how of ['close', 'escape', 'outside']) {
    await page.click('.bcard[data-b="rook"]');
    await expect(page.locator('.detail [data-sel]')).toBeVisible();
    // trying on a skin is a preview too
    await page.click('.detail .sk[data-skin="rook_classic"]');
    if (how === 'close') await page.click('.detail [data-x]:not([data-sel])');
    else if (how === 'escape') await page.keyboard.press('Escape');
    else await page.mouse.click(3, 3);
    await expect(page.locator('.detail')).toHaveCount(0);
    expect(await selected(page), how).toBe('volt');
    expect(await page.evaluate(async () => (await import('/account.js')).progress().equipped['skin:rook'] || null), how).toBe(null);
    await expect(page.locator('.bcard.sel')).toHaveAttribute('data-b', 'volt');
  }
  await page.click('.bcard[data-b="rook"]');
  await page.click('.detail .sk[data-skin="rook_classic"]');
  await page.click('.detail [data-sel]');
  await expect(page.locator('.detail')).toHaveCount(0);
  expect(await selected(page)).toBe('rook');
  await expect.poll(() => page.evaluate(async () => (await import('/account.js')).progress().equipped['skin:rook'])).toBe('rook_classic');
});

test('locker: tapping an item previews it; reward items show where they come from with a lock, never a price', async ({ page }) => {
  await page.goto('/'); await page.waitForSelector('#playBtn');
  await page.click('#rail_locker'); await page.click('.lsec[data-open="skins"] .ribbonhead');
  await page.click('#lkWho [data-w="volt"]');
  const card = (k) => page.locator(`#lkItems .ped[data-k="${k}"]`);
  await expect(card('volt_static').locator('.tag')).toHaveText(/LEVEL 15/);
  await expect(card('volt_storm').locator('.tag')).toHaveText(/ROAD 700/);
  await expect(card('volt_solar').locator('.tag')).toHaveText(/PREMIUM PASS 30/);
  for (const k of ['volt_static', 'volt_storm', 'volt_solar']) {
    await expect(card(k).locator('[data-buy]')).toHaveCount(0);
    await expect(card(k).locator('.tag .ico, .tag svg').first()).toBeVisible(); // the lock
  }
  // titles: a level title is never for sale; tapping a title previews it without equipping
  await page.click('#lkTabs [data-t="titles"]');
  await expect(card('legend').locator('[data-buy]')).toHaveCount(0);
  await expect(card('legend').locator('.tag')).toHaveText(/LEVEL 100/);
  await expect(card('sharpshooter').locator('[data-buy]')).toBeVisible(); // shop titles still sell
  await card('sharpshooter').click();
  await expect(page.locator('#lkTitle')).toHaveText('Sharpshooter');
  expect(await page.evaluate(async () => (await import('/account.js')).progress().equipped.title || null)).toBe(null);
  // the equipped-title layout keeps PREVIEW KILL EFFECT inside the card
  const fit = await page.evaluate(() => { const c = document.querySelector('.locker .preview').getBoundingClientRect(), b = document.querySelector('#lkFx').getBoundingClientRect(); return b.bottom <= c.bottom + 0.5 && b.bottom <= innerHeight; });
  expect(fit).toBe(true);
});

test('hunt pass opens with the first claimable tier in view, and claimed coins fly to its own counter', async ({ page }) => {
  await page.goto('/'); await page.waitForSelector('#playBtn');
  await setProgress(page, { pass: { xp: 12 * 120, premium: false, claimed: ['free:1', 'free:2'] } });
  await page.click('#rail_pass');
  await page.waitForSelector('.track .claim');
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => {
    const tr = document.querySelector('.track').getBoundingClientRect(), t3 = document.querySelectorAll('.track .tier')[2].getBoundingClientRect();
    return { inView: t3.left >= tr.left - 1 && t3.right <= tr.right + 1, ids: document.querySelectorAll('#tbCoins').length, own: document.querySelectorAll('#hpCoinChip').length };
  });
  expect(r.inView, 'tier 3 (first unclaimed) is in view').toBe(true);
  expect(r.ids).toBe(1);
  expect(r.own).toBe(1);
  // nothing to claim: the current tier is in view instead
  await setProgress(page, { pass: { xp: 20 * 120, premium: false, claimed: Array.from({ length: 20 }, (_, i) => `free:${i + 1}`) } });
  await page.click('.ui-screen .back'); await page.waitForTimeout(250);
  await page.click('#rail_pass'); await page.waitForSelector('.track .tier');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => { const tr = document.querySelector('.track').getBoundingClientRect(), t = document.querySelectorAll('.track .tier')[19].getBoundingClientRect(); return t.left >= tr.left - 1 && t.right <= tr.right + 1; })).toBe(true);
});

test('keyboard: every lobby control is a tab stop, rings are visible, Escape closes the top-most screen and focus returns', async ({ page }) => {
  await page.goto('/'); await page.waitForSelector('#playBtn');
  const stops = new Set();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    stops.add(await page.evaluate(() => { const a = document.activeElement; return a.id || (a.matches('.slot.me') ? 'slot.me' : a.className); }));
  }
  for (const id of ['profileCard', 'tbMissions', 'fillBots', 'slot.me', 'playBtn', 'rail_settings', 'tab_profile']) expect([...stops], id).toContain(id);
  // the hunter picker from the keyboard
  await page.focus('.slot.me');
  const ring = await page.evaluate(() => { document.querySelector('.slot.me').focus(); return getComputedStyle(document.querySelector('.slot.me')).outlineStyle; });
  await page.keyboard.press('Enter');
  await expect(page.locator('.bcard').first()).toBeVisible();
  expect(await page.evaluate(() => !!document.activeElement.closest('.ui-screen'))).toBe(true); // focus moved in
  await page.focus('.bcard[data-b="wisp"]');
  await page.keyboard.press('Enter');
  await expect(page.locator('.detail')).toBeVisible();
  expect(await page.evaluate(() => !!document.activeElement.closest('.detail'))).toBe(true);
  await page.keyboard.press('Escape'); // closes only the detail
  await expect(page.locator('.detail')).toHaveCount(0);
  await expect(page.locator('.ui-screen')).toHaveCount(1);
  expect(await page.evaluate(() => document.activeElement.dataset.b)).toBe('wisp'); // back where it was
  await page.keyboard.press('Escape');
  await expect(page.locator('.ui-screen')).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement.matches('.slot.me'))).toBe(true);
  // popups too, and text fields show a focus ring
  await page.focus('#tbMissions'); await page.keyboard.press('Enter');
  await expect(page.locator('.ui-pop')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ui-pop')).toHaveCount(0);
  await page.click('#tab_profile'); await page.click('#pgAccount');
  await page.focus('#regF input[name="username"]');
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
  expect(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle)).not.toBe('none');
  expect(ring).not.toBe('none');
  // FILL WITH BOTS is a switch you can flip with the keyboard
  await page.keyboard.press('Escape');
  await page.click('#tab_play');
  await page.focus('#fillBots'); await page.keyboard.press('Space');
  await expect(page.locator('#fillBots')).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Space');
  await expect(page.locator('#fillBots')).toHaveAttribute('aria-checked', 'true');
});

// the hunter (weapon included) must stay inside its frame: draw only the hunter at the real
// stage / preview size and check that nothing touches the canvas edge
async function hunterFits(page, which) {
  return page.evaluate(async (which) => {
    const R = await import('/render.js'), { BRAWLER_IDS } = await import('/shared.js');
    const { stageFit } = await import('/ui/lobby.js'), { lockerFit } = await import('/ui/screens.js');
    const src = document.querySelector(which === 'stage' ? '#stage' : '#lkPrev').getBoundingClientRect();
    const w = Math.round(src.width), h = Math.round(src.height);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d', { willReadFrequently: true });
    const bad = [];
    for (const id of BRAWLER_IDS) for (let f = 0; f < 12; f++) for (const hop of which === 'stage' ? [0, 26] : [0]) {
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
      if (which === 'stage') { const s = stageFit(w, h); R.drawBrawler(g, id, s.cx, s.y - hop * s.sc, (f / 12) * Math.PI * 2, 0.7, { scale: s.sc }); }
      else { const s = lockerFit(w, h); R.drawBrawler(g, id, s.x, s.y, (f / 12) * Math.PI * 2, 0.7, { scale: s.sc }); }
      const d = g.getImageData(0, 0, w, h).data, a = (x, y) => d[(y * w + x) * 4 + 3];
      let edge = false;
      for (let x = 0; x < w && !edge; x++) if (a(x, 0) > 8) edge = true;
      for (let y = 0; y < h && !edge; y++) if (a(0, y) > 8 || a(w - 1, y) > 8) edge = true;
      if (edge) { bad.push(`${id}@${f}${hop ? ' hop' : ''}`); break; }
    }
    return { w, h, bad, scale: which === 'stage' ? stageFit(w, h).sc : lockerFit(w, h).sc };
  }, which);
}
for (const [w, h, touch] of [[1280, 720], [1366, 768], [1440, 900], [1920, 1080], [1024, 768, true], [768, 1024, true], [844, 390, true], [390, 844, true]]) {
  test(`${w}x${h}: the hunter fits its frame, weapon included (lobby stage and Locker preview)`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(touch ? { hasTouch: true } : {}) });
    const page = await ctx.newPage();
    await page.goto('/'); await page.waitForSelector('#playBtn'); await page.waitForTimeout(200);
    const st = await hunterFits(page, 'stage');
    expect(st.bad, `stage ${st.w}x${st.h}`).toEqual([]);
    expect(st.scale * 80, 'still a big hunter').toBeGreaterThan(Math.min(st.w, st.h) * 0.4);
    await page.click('#rail_locker'); await page.click('.lsec[data-open="skins"] .ribbonhead'); await page.waitForTimeout(300);
    const lk = await hunterFits(page, 'locker');
    expect(lk.bad, `locker ${lk.w}x${lk.h}`).toEqual([]);
    await ctx.close();
  });
}

test('armory and locker dots: lit only for something new, gone once seen; mode buttons only pick', async ({ page }) => {
  await page.goto('/'); await page.waitForSelector('#playBtn');
  await expect(page.locator('#dot_locker')).toBeHidden(); // a fresh player has nothing new
  await expect(page.locator('#dot_armory')).toBeHidden();
  // level up: a new weapon unlocks -> Armory dot; a new item -> Locker dot
  await setProgress(page, { xp: 6000, owned: [...(await page.evaluate(async () => (await import('/account.js')).progress().owned)), 'confetti'] });
  await expect(page.locator('#dot_armory')).toBeVisible();
  await expect(page.locator('#dot_locker')).toBeVisible();
  await page.click('#rail_armory');
  await expect(page.locator('#arItems .newtag').first()).toBeVisible();
  await page.click('.ui-screen .back');
  await expect(page.locator('#dot_armory')).toBeHidden();
  await page.click('#rail_locker');
  await page.click('#tab_play');
  await expect(page.locator('#dot_locker')).toBeHidden();
  // a mode button selects (a tick), it does not start a match
  await page.click('.modebtn[data-m="squad"]');
  await expect(page.locator('.modebtn[data-m="squad"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.mm')).toBeHidden();
  expect(await page.locator('.modebtn .go').first().textContent()).not.toContain('▶');
});

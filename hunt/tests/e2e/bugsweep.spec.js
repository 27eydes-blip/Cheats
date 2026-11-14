// Bug sweep regression tests (client). See BUG_LIST.md.
import { test, expect } from '@playwright/test';
import { trackErrors, waitMe } from './helpers.js';

test('error/disconnect toasts show above the lobby and menu screens', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#lobby')).toBeVisible();
  await page.click('#rail_settings');
  await page.evaluate(() => { const t = document.getElementById('toast'); t.textContent = 'Match full'; t.hidden = false; });
  const box = await page.locator('#toast').boundingBox();
  const topZ = await page.evaluate(([x, y]) => {
    const t = document.getElementById('toast');
    t.style.pointerEvents = 'auto';
    const hit = document.elementFromPoint(x, y);
    t.style.pointerEvents = '';
    return hit === t || t.contains(hit);
  }, [box.x + box.width / 2, box.y + box.height / 2]);
  expect(topZ).toBe(true);
});

test('results keep the trophy/XP result that arrived before the screen opened', async ({ page }) => {
  await page.goto('/?world=meadow&mode=bounty');
  await waitMe(page);
  await page.evaluate(() => {
    const G = window.__hunt;
    window.__huntMsg({ t: 'end', mode: 'bounty', rank: 1, kills: 1, bounty: 2, winner: 'Me', results: [['Me', G.brawler, 1, 1, 0, G.myId, 2, 2]] });
    window.__huntMsg({ t: 'progress', delta: 8, xp: 60, progress: { xp: 160, trophies: {}, owned: [], equipped: {} } });
  });
  await expect(page.locator('.res')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#rsTro')).toHaveText('+8', { timeout: 3000 });
  await expect(page.locator('#rsXpN')).toHaveText('+60 XP');
});

test('Sound off silences lobby music at once; app switch suspends audio', async ({ page }) => {
  await page.goto('/');
  await page.mouse.click(5, 5);
  await page.waitForFunction(async () => (await import('/ui/music.js')).musicPlaying(), null, { timeout: 5000 });
  await page.waitForTimeout(1500);
  // a browser with no audio output (headless Firefox on a server) never starts its audio clock
  const running = await page.evaluate(async () => (await import('/audio.js')).audioCtx().state === 'running');
  test.skip(!running, 'this browser has no audio device here, so nothing can play');
  expect(await page.evaluate(async () => (await import('/ui/music.js')).musicLevel())).toBeGreaterThan(0.05);
  await page.click('#rail_settings');
  await page.locator('#setSound').uncheck({ force: true });
  await page.waitForTimeout(800);
  expect(await page.evaluate(async () => (await import('/ui/music.js')).musicLevel())).toBeLessThan(0.01);
  const st = await page.evaluate(async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 300));
    return (await import('/audio.js')).audioCtx().state;
  });
  expect(st).toBe('suspended');
});

test('an unknown event id from the server cannot freeze the game loop', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?world=meadow&mode=bounty');
  await waitMe(page);
  await page.evaluate(() => {
    window.__huntMsg({ t: 'ev', id: 'from_the_future', ph: 'on', tl: 10, p: {} });
    // even a broken event that slipped through must not stop rendering
    const c = window.__hunt.conns.get('main'); c.ev = { id: 'from_the_future', ph: 'on', p: {}, at: performance.now() };
  });
  const t0 = await page.evaluate(() => window.__hunt.ticks);
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__hunt.ticks)).toBeGreaterThan(t0 + 5);
  expect(errors.filter((e) => !/frame error/.test(e))).toEqual([]);
});

test('the lobby still boots when storage is blocked (Safari, private frames)', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(() => {
    const boom = () => { throw new DOMException('blocked', 'SecurityError'); };
    Storage.prototype.getItem = boom; Storage.prototype.setItem = boom;
  });
  await page.goto('/');
  await expect(page.locator('#playBtn, .play').first()).toBeVisible();
  await page.click('#modeCard');
  expect(errors).toEqual([]);
});

test('public retry re-queues without flashing the lobby or "Connection lost"', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.__seen = [];
    const t = document.getElementById('toast');
    new MutationObserver(() => { if (!t.hidden) window.__seen.push(t.textContent); }).observe(t, { attributes: true, childList: true });
  });
  // a public match was already full/started: server answers 'retry' then closes the socket
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__hunt.phase === 'waiting');
  await page.evaluate(() => {
    const c = window.__hunt.conns.get('main');
    window.__huntMsg({ t: 'retry', reason: 'Match already started', match: 'qp:x' });
    c.ws.close();
  });
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__hunt.phase)).toBe('waiting');
  expect(await page.evaluate(() => window.__seen)).not.toContain('Connection lost');
});

test('wall art cache stays bounded across many arena layouts (no leak over many matches)', async ({ page }) => {
  await page.goto('/');
  const n = await page.evaluate(async () => {
    const { WallArt } = await import('/art/walls.js');
    const a = new WallArt();
    for (let i = 0; i < 2000; i++) a.get('meadow', 'P' + i, () => ({ cv: null }));
    a.get('meadow', 'P1999', () => { throw new Error('should be cached'); });
    return a.stats().sprites;
  });
  expect(n).toBeLessThanOrEqual(120);
});

test('GPU context loss rebuilds the in-game and lobby art caches', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?world=mirage&mode=bounty');
  await waitMe(page);
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => ({ gen: window.__huntArt.art.stats().generation, ground: !!window.__hunt.map._ground }));
  expect(before.ground).toBe(true);
  await page.evaluate(() => { const c = document.getElementById('game'); c.dispatchEvent(new Event('contextlost', { cancelable: true })); c.dispatchEvent(new Event('contextrestored')); });
  const mid = await page.evaluate(() => ({ gen: window.__huntArt.art.stats().generation }));
  expect(mid.gen).toBeGreaterThan(before.gen);
  await page.waitForTimeout(400); // next frames repaint everything from scratch
  expect(await page.evaluate(() => window.__huntArt.art.stats().sprites)).toBeGreaterThan(0);
  expect(await page.evaluate(() => !!window.__hunt.map._ground)).toBe(true);
  // the lobby (CSS background + a hunter card redrawn every frame) comes back fine
  await page.goto('/');
  await page.waitForSelector('#playBtn', { state: 'visible' });
  expect(errors).toEqual([]);
});

test('a full session (lobby screens, match, results, Free Play) logs no console errors or warnings', async ({ page }) => {
  const issues = [];
  page.on('pageerror', (e) => issues.push(e.message));
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/fonts\.g|Failed to load resource/.test(m.text())) issues.push(m.text()); });
  await page.goto('/');
  await page.waitForSelector('#playBtn', { state: 'visible' });
  await page.waitForTimeout(1000);
  for (const id of ['tab_profile', 'rail_locker', 'tab_play']) { await page.click('#' + id); await page.waitForTimeout(400); } // tabs
  for (const id of ['rail_armory', 'rail_pass', 'rail_road', 'rail_friends', 'rail_settings', 'tbMissions']) {
    await page.click('#' + id); await page.waitForTimeout(500);
    const bk = page.locator('.ui-screen .back').last();
    if (await bk.count()) await bk.click(); else await page.locator('.ui-pop [data-close]').last().click();
    await page.waitForTimeout(350);
  }
  await page.click('.modebtn[data-m="quick"]');
  await page.click('#playBtn');
  await page.waitForFunction(() => window.__hunt.phase === 'play' && window.__hunt.me, null, { timeout: 40000 });
  await page.keyboard.down('d'); await page.waitForTimeout(1200); await page.keyboard.up('d');
  await page.evaluate(() => { const G = window.__hunt; window.__huntMsg({ t: 'end', mode: G.modeKey, rank: 3, kills: 0, bounty: 0, winner: 'X', results: [['Me', G.brawler, 3, 0, 0, G.myId, 0, 0]] }); });
  await page.waitForSelector('#rsLobby', { state: 'visible', timeout: 8000 });
  await page.click('#rsLobby');
  await page.goto('/?free=1');
  await page.waitForFunction(() => window.__hunt.me, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  expect(issues).toEqual([]);
});

test('"Created by Sam Eyde III" is visible in the lobby and in a match', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#credit')).toBeVisible();
  await expect(page.locator('#credit')).toHaveText('Created by Sam Eyde III');
  await page.goto('/?world=meadow&mode=bounty');
  await waitMe(page);
  await expect(page.locator('#creditGame')).toBeVisible();
  await expect(page.locator('#creditGame')).toHaveText('Created by Sam Eyde III');
});

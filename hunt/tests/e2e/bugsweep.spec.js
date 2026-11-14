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
  expect(n).toBeLessThanOrEqual(600);
});

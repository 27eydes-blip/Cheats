// Version skew: a newer server can send ids this client has never heard of (a new brawler, mode,
// weapon, reward, world or event). None of them may throw, break a frame or leak canvas state.
import { test, expect } from '@playwright/test';
import { trackErrors, waitMe } from './helpers.js';

// count save()/restore() on the game canvas, so a frame that throws mid-draw can't leak a saved state
const countSaves = () => {
  const P = CanvasRenderingContext2D.prototype, save = P.save, restore = P.restore, reset = P.reset;
  window.__depth = 0;
  P.save = function () { if (this.canvas.id === 'game') window.__depth++; return save.call(this); };
  P.restore = function () { if (this.canvas.id === 'game' && window.__depth > 0) window.__depth--; return restore.call(this); };
  if (reset) P.reset = function () { if (this.canvas.id === 'game') window.__depth = 0; return reset.call(this); };
};
// the save depth as seen between frames
const depth = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(window.__depth))));
const settle = async (page, errors, what) => {
  await page.waitForTimeout(500);
  expect(errors, what).toEqual([]);
  expect(await depth(page), `${what}: canvas save depth between frames`).toBe(0);
};
// a copy of the last snapshot with extra rows, one tick later
const snap = (page, extra) => page.evaluate((x) => {
  const c = [...window.__hunt.conns.values()].find((k) => k.primary);
  window.__huntMsg({ ...c.last, n: c.last.n + 1, fx: [], bn: [], bd: [], ...x });
}, extra);

test('ids this client does not know never break the match', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(countSaves);
  await page.goto('/?world=meadow&mode=bounty');
  await waitMe(page);
  await page.waitForFunction(() => window.__hunt.view.others.length > 0);

  // a hunter with a brawler, skin, title and badge from the future
  const seen = await page.evaluate(() => {
    const G = window.__hunt, me = G.me;
    const o = [...G.view.others].sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
    window.__huntMsg({ t: 'ro', add: { [o.id]: [o.name, 'ember', 0, { skin: 'ember_gold', title: 'future_title', badge: 'future_badge', wskin: 'future' }] } });
    return o.id;
  });
  await settle(page, errors, 'unknown brawler in the roster');
  expect(await page.evaluate((id) => window.__hunt.view.others.some((o) => o.id === id), seen)).toBe(true);

  // bullets, effects, weapon drops and held weapons with unknown indexes
  const at = await page.evaluate(() => ({ x: Math.round(window.__hunt.me.x), y: Math.round(window.__hunt.me.y), id: window.__hunt.myId }));
  await snap(page, {
    bn: [[900001, at.x + 60, at.y, 300, 0, 600, 250, 0, seen, 0], [900002, at.x + 60, at.y + 30, 300, 0, 600, 17, 0, seen, 0], [900003, at.x - 60, at.y, 0, 300, 600, 99999, 0, seen, 0]],
    fx: [['die', at.x + 80, at.y, 17, seen, 99], ['hit', at.x + 50, at.y, 250, seen], ['swing', at.x + 50, at.y, 1, seen, 250], ['wpick', at.x, at.y, 99, at.id],
      ['gadget', at.x + 40, at.y, 7, seen], ['emote', at.x, at.y, 99, seen], ['future_fx', at.x, at.y, 1, seen, 1], ['dmg', at.x + 40, at.y, 120, seen, 0]],
    wd: [[777, at.x + 90, at.y + 40, 99, 1]],
    px: [[seen, 3000, 0, 0, 0, 0, 0, 99, 5]],
  });
  await settle(page, errors, 'unknown bullet kinds, effects and weapon drops');

  // my own second weapon is one this client does not have
  await page.evaluate(() => { const G = window.__hunt; G.me.w2 = [99, 3]; G.me.ws = 1; });
  await settle(page, errors, 'unknown weapon in my second slot');
  await page.evaluate(() => { const G = window.__hunt; G.me.w2 = null; G.me.ws = 0; });

  // events
  await page.evaluate(() => { window.__huntMsg({ t: 'ev', id: 'future_event', ph: 'on', tl: 9, p: {} }); window.__huntMsg({ t: 'st', td: [], ch: [], ev: { id: 'future_event', ph: 'on', tl: 9 } }); window.__huntMsg({ t: 'future_message', x: 1 }); });
  await settle(page, errors, 'unknown event and message type');

  // rewards with unknown ids, then the end of a mode this client does not know: results still open
  await page.evaluate(() => {
    const G = window.__hunt;
    window.__huntMsg({ t: 'progress', delta: 5, xp: 30, coins: 9, progress: { xp: 130, trophies: {}, owned: [], equipped: {} },
      levels: [{ level: 2, coins: 50, weapons: ['future_gun'], emotes: ['future_emote'], skin: 'future_skin', title: 'future_title' }],
      mastery: [{ id: 'future_gun', level: 2 }], wxp: [{ id: 'future_gun', xp0: 0, xp1: 40 }] });
    window.__huntMsg({ t: 'end', mode: 'koth', rank: 2, kills: 1, bounty: 3, winner: 'Bot', results: [['Me', 'ember', 2, 1, 0, G.myId, 3, 3], ['Bot', 'ember', 1, 4, 1, 77, 9, 9]] });
  });
  await expect(page.locator('.res')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#rsMsg')).toContainText('KOTH');
  await expect(page.locator('#rsTro')).toHaveText('+5', { timeout: 3000 });
  await expect(page.locator('#rsUps .ucard')).toHaveCount(6);
  await expect(page.locator('#rsUps')).toContainText('future_gun');
  await expect(page.locator('#rsLobby')).toBeVisible();
  await settle(page, errors, 'unknown mode and reward ids at the end of a match');
});

test('a match in a mode and world this client does not know still starts', async ({ page }) => {
  const errors = trackErrors(page);
  await page.addInitScript(countSaves);
  await page.goto('/?world=meadow&mode=bounty');
  await waitMe(page);
  await page.evaluate(() => { const G = window.__hunt; window.__huntMsg({ t: 'start', you: G.myId, mode: 'koth', world: 'future_world', seed: 5, players: 10 }); });
  await expect(page.locator('.intro .imode').last()).toHaveText('KOTH');
  await expect(page.locator('#evName')).toHaveText('KOTH', { timeout: 6000 }); // (the mode banner follows the intro)
  expect(await page.evaluate(() => window.__hunt.phase)).toBe('play');
  expect(errors).toEqual([]);
  expect(await depth(page)).toBe(0);
});

test('one bad frame does not leak canvas state into the next', async ({ page }) => {
  await page.addInitScript(countSaves);
  await page.goto('/?world=meadow&mode=bounty');
  await waitMe(page);
  // make a draw call deep inside the frame throw for a while
  await page.evaluate(() => {
    const P = CanvasRenderingContext2D.prototype, arc = P.arc;
    window.__boom = 30;
    P.arc = function (...a) { if (this.canvas.id === 'game' && window.__boom > 0) { window.__boom--; throw new Error('test: bad draw call'); } return arc.apply(this, a); };
  });
  await page.waitForFunction(() => window.__boom === 0);
  expect(await depth(page)).toBe(0);
  // and the game draws again afterwards
  await page.waitForTimeout(300);
  const painted = await page.evaluate(() => { const c = document.getElementById('game'); const d = c.getContext('2d').getImageData(c.width / 2 - 20, c.height / 2 - 20, 40, 40).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
  expect(painted).toBeGreaterThan(0);
});

// Hunt Racers controls for first-time players: the tutorial before the very first race (from the
// lobby's PLAY, SKIP goes on to the race the player picked, never again after that), the tutorial
// overlay (big prompt per step for touch and keys, progress dots, YOU'RE READY!), the racing
// Settings rows (steering sensitivity, left-handed, joystick size) applied to the next race, and
// the thumb controls' layout on an iPhone SE and an iPad (nothing overlaps, nothing covers the credit).
// The tutorial track and its step events come from the server (mode=tutorial); the overlay test
// feeds it those events in both wire shapes, as RaceClient delivers them.
import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';
import { phone, raceUrl, waitPhase, layout, creditVisible, Fingers } from './race-helpers.js';

test.describe.configure({ mode: 'serial' });

test('the first race from the lobby starts with the tutorial; SKIP goes on to the picked race, and only once', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'touch context');
  const P = await phone(browser, 667, 375), page = P.page, errs = trackErrors(page);
  // (automated browsers get the automatic tutorial only with ?tut=1)
  await page.goto('/?tut=1');
  await page.waitForSelector('#playBtn');
  await page.tap('#playBtn');
  await page.waitForFunction(() => window.__race && window.__race.session.o.tutorial);
  await expect(page.locator('.rc-skip')).toBeVisible();
  await expect(page.locator('.rc-wt')).toHaveText('HOW TO DRIVE');
  expect(await page.evaluate(() => ({ mode: window.__race.rc.params.mode, sens: window.__race.rc.params.sens, bots: window.__race.rc.params.bots }))).toEqual({ mode: 'tutorial', sens: 1, bots: 0 });
  await creditVisible(page);
  await page.tap('.rc-skip');
  // the race the player picked on the PLAY page (Grand Race), and the tutorial is remembered
  await page.waitForFunction(() => window.__race && !window.__race.session.o.tutorial && !window.__race.session.dead);
  expect(await page.evaluate(() => window.__race.rc.params.mode)).toBe('grand');
  expect(await page.evaluate(() => localStorage.getItem('hunt-race-tut'))).toBe('1');
  await expect(page.locator('.rc-skip')).toHaveCount(0);
  await expect(page.locator('.rc-wait .rc-cancel')).toBeVisible();
  await page.tap('.rc-wait .rc-cancel');
  await page.waitForSelector('#playBtn');
  await page.tap('#playBtn');
  await page.waitForFunction(() => window.__race && !window.__race.session.dead);
  expect(await page.evaluate(() => [!!window.__race.session.o.tutorial, window.__race.rc.params.mode])).toEqual([false, 'grand']);
  expect(errs).toEqual([]);
  await P.ctx.close();
});

test('tutorial overlay: one big prompt per step (touch and keys words), progress dots, SKIP, YOU\'RE READY!', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#playBtn');
  const r = await page.evaluate(async () => {
    const T = await import('/race/tutorial.js');
    await new Promise((ok) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/race/race.css'; l.onload = ok; document.head.appendChild(l); });
    const root = document.createElement('div'); root.className = 'rc-root'; document.body.appendChild(root);
    const log = [];
    const tut = new T.Tutorial(root, { next: true, onSkip: () => log.push('skip'), onGo: () => log.push('go'), onStep: (s, last) => log.push(s + (last ? '!' : '')) });
    const out = [];
    const feed = (e) => { const row = T.evRow(e); if (row && row[0] === 'tut') tut.event(T.tutStep(row)); };
    tut.prompt(false); out.push(tut.state());
    tut.prompt(true); out.push(tut.state()); // a keyboard player: keys in the words
    feed({ k: 'tut', id: 1, step: 'steer' }); tut.prompt(false); out.push(tut.state());
    feed(['tut', 'drift']); tut.prompt(false); out.push(tut.state());
    feed(['tut', 'drift']); // a repeat changes nothing
    feed(['tut', 7, 'item']); tut.prompt(true); out.push(tut.state());
    const skipBox = root.querySelector('.rc-skip').getBoundingClientRect(), card = root.querySelector('.rc-tc').getBoundingClientRect();
    root.querySelector('.rc-skip').click();
    feed({ k: 'tut', id: 1, step: 'fire' }); feed({ k: 'tut', id: 1, step: 'done' });
    out.push(tut.state());
    const ready = root.querySelector('.rc-ready');
    const readyShown = getComputedStyle(ready).display !== 'none', skipShown = getComputedStyle(root.querySelector('.rc-skip')).display !== 'none';
    root.querySelector('.rc-go').click();
    const fontPx = parseFloat(getComputedStyle(root.querySelector('.rc-tp')).fontSize);
    return { out, log, readyShown, skipShown, flag: localStorage.getItem(T.TUT_FLAG), go: root.querySelector('.rc-go').textContent, skip: { w: skipBox.width, h: skipBox.height }, card: { top: card.top, w: card.width }, fontPx };
  });
  const [s0, k0, s1, s2, s3, fin] = r.out;
  expect(s0).toMatchObject({ step: 0, id: 'steer', prompt: 'STEER AROUND THE CONES', sub: 'Slide the stick where you want to go', hidden: false, dots: ['now', '', '', ''] });
  expect(k0.sub).toBe('Steer with ← → or A D');
  expect(s1).toMatchObject({ step: 1, prompt: 'HOLD DRIFT THROUGH THE CURVE', dots: ['ok', 'now', '', ''] });
  expect(s2).toMatchObject({ step: 2, prompt: 'DRIVE THROUGH AN ITEM BOX, THEN TAP ITEM', dots: ['ok', 'ok', 'now', ''] });
  expect(s3).toMatchObject({ step: 3, prompt: 'PRESS J AT THE TARGET', sub: 'J or a left click fires your weapon', dots: ['ok', 'ok', 'ok', 'now'] });
  expect(fin).toMatchObject({ step: 4, shown: true, hidden: true });
  expect(r.log).toEqual(['steer', 'drift', 'item', 'skip', 'fire!', 'go']);
  expect(r.readyShown).toBe(true);
  expect(r.skipShown).toBe(false);
  expect(r.flag).toBe('1');
  expect(r.go).toBe("LET'S RACE");
  // a big prompt and a thumb-sized SKIP
  expect(r.fontPx).toBeGreaterThanOrEqual(22);
  expect(r.skip.h).toBeGreaterThanOrEqual(44);
  expect(r.skip.w).toBeGreaterThanOrEqual(70);
});

test('Settings: steering sensitivity, left-handed and joystick size reach the next race', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP touch input');
  const P = await phone(browser, 667, 375), page = P.page, errs = trackErrors(page);
  await page.goto('/');
  await page.tap('#rail_settings');
  await expect(page.locator('#sensName')).toHaveText('Normal');
  await page.locator('#setSteer').fill('1.4');
  await expect(page.locator('#sensName')).toHaveText('Very quick');
  await page.locator('#setSteer').fill('0.6');
  await expect(page.locator('#sensName')).toHaveText('Very gentle');
  await page.locator('#setSteer').fill('1.4');
  await page.locator('#setLeft').check();
  await page.tap('#setStick [data-k="l"]');
  await expect(page.locator('#setStick [data-k="l"]')).toHaveClass(/on/);
  await expect(page.locator('#setTut')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('hunt-settings')));
  expect(saved).toMatchObject({ raceSens: 1.4, leftHanded: true, raceStick: 'l' });
  // the next race: the server is told the sensitivity, the controls are mirrored, the stick is larger
  await page.goto(raceUrl({ bots: '1' }));
  await waitPhase(page, 'race');
  expect(await page.evaluate(() => window.__race.rc.params.sens)).toBe(1.4);
  const L = await layout(page);
  expect(L.stick.cx).toBeGreaterThan(L.W / 2);
  for (const k of ['drift', 'fire', 'item', 'brake']) expect(L.btn[k].x, k).toBeLessThan(L.W / 2);
  expect(L.stick.r).toBe(Math.round(Math.min(L.W, L.H) * 0.21 * 1.18));
  // the stick's magnitude is scaled by the sensitivity (capped at 1)
  await page.waitForFunction(() => window.__race.rc.latest && window.__race.rc.latest.tm > 0.3);
  const F = new Fingers(P);
  await F.down(1, L.stick.cx, L.stick.cy);
  await F.move(1, L.stick.cx, L.stick.cy - L.stick.r * 0.3);
  // the controls are read once a frame: wait for a frame that has seen the thumb (slow machines
  // can go more than 150 ms between frames)
  await expect.poll(() => page.evaluate(() => window.__race.input().out.hm)).toBeGreaterThan(0);
  const inp = await page.evaluate(() => window.__race.input());
  expect(inp.stickHeld).toBe(true);
  expect(inp.hm).toBeCloseTo(0.4, 2);
  expect(inp.out.hm).toBeCloseTo(0.56, 2);
  expect(inp.out.ha).toBeCloseTo(-Math.PI / 2, 2); // up on screen = up in the world
  await F.up(1);
  await expect.poll(() => page.evaluate(() => window.__race.input().out.hm), { message: 'letting go of the stick stops steering' }).toBe(0);
  await creditVisible(page);
  expect(errs).toEqual([]);
  await P.ctx.close();
});

for (const [W, H] of [[667, 375], [1180, 820]]) {
  test(`${W}x${H}: joystick, thumb buttons and RESET are big, apart, on screen and clear of the credit and speedometer`, async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'touch context');
    const P = await phone(browser, W, H), page = P.page;
    await page.goto(raceUrl({ bots: '1' }));
    await waitPhase(page, 'race');
    await page.waitForFunction(() => window.__race.layout().gauge);
    const r = await page.evaluate(() => {
      const L = window.__race.layout(), c = document.querySelector('.rc-credit').getBoundingClientRect();
      const ctl = { stick: { x: L.stick.cx, y: L.stick.cy, r: L.stick.r } };
      for (const k of ['drift', 'fire', 'item', 'brake', 'menu']) ctl[k] = { x: L.btn[k].x, y: L.btn[k].y, r: L.btn[k].r };
      ctl.reset = { x: L.btn.reset.x, y: L.btn.reset.y, r: L.btn.reset.r1 }; // at its biggest (stuck)
      return { ctl, credit: { l: c.left, r: c.right, t: c.top, b: c.bottom }, gauge: L.gauge, W: L.W, H: L.H };
    });
    const names = Object.keys(r.ctl);
    for (const a of names) {
      const A = r.ctl[a];
      expect(A.x - A.r >= 0 && A.x + A.r <= r.W && A.y - A.r >= 0 && A.y + A.r <= r.H, `${a} on screen`).toBe(true);
      // circle vs the credit's box
      const nx = Math.max(r.credit.l, Math.min(A.x, r.credit.r)), ny = Math.max(r.credit.t, Math.min(A.y, r.credit.b));
      expect(Math.hypot(A.x - nx, A.y - ny), `${a} clear of the credit`).toBeGreaterThan(A.r);
      expect(Math.hypot(A.x - r.gauge.x, A.y - r.gauge.y), `${a} clear of the speedometer`).toBeGreaterThan(A.r + r.gauge.r);
      for (const b of names) if (a < b) { const B = r.ctl[b]; expect(Math.hypot(A.x - B.x, A.y - B.y), `${a} / ${b} apart`).toBeGreaterThan(A.r + B.r); }
    }
    // the joystick: about 160 px across on a small phone, larger on a tablet
    expect(r.ctl.stick.r * 2).toBeGreaterThanOrEqual(W < 800 ? 140 : 220);
    expect(r.ctl.drift.r * 2).toBeGreaterThanOrEqual(64);
    await creditVisible(page);
    await P.ctx.close();
  });
}

// Phone audit of every lobby and menu screen (E1): tap targets, text size, primary actions in
// view, no sideways scroll, credit line clear. Plus the specific bugs behind it: the POWER screen
// was unreachable on landscape phones, PLAY sat under the tab bar in portrait, the guest chip
// covered the XP bar, and Armory EQUIP started off-screen.
import { test, expect } from '@playwright/test';
import { trackErrors, waitMe } from './helpers.js';
import { SCREENS, RACE_SCREENS, auditPage } from './overnight-lobby-audit.lib.js';

// A phone: touch screen, mobile viewport. Firefox has no mobile emulation switch, so it gets touch only.
const phone = (browser, width, height) => browser.newContext({ viewport: { width, height }, hasTouch: true, ...(browser.browserType().name() === 'firefox' ? {} : { isMobile: true }) });
// The touch rules key off a coarse pointer. An engine that cannot emulate one cannot run these checks.
async function needTouch(page) {
  const coarse = await page.evaluate(() => matchMedia('(any-pointer: coarse)').matches);
  test.skip(!coarse, 'this browser build does not emulate a touch (coarse) pointer');
}

// Nothing is exempt today. If a control ever has to stay small, list its exact message here with
// the reason, e.g. [/tap target button#foo /, 'why it cannot be bigger'].
const ALLOW = [];
const allowed = (msg) => ALLOW.some(([re]) => re.test(msg));

// the racing lobby (the game, at /) and the classic shooter lobby (?shooter=1)
// (iPads: the racing lobby, the game everyone plays)
for (const [w, h, kinds] of [[667, 375, 2], [844, 390, 2], [932, 430, 2], [390, 844, 2], [430, 932, 2], [1180, 820, 1], [820, 1180, 1]]) for (const [kind, base, screens] of [['racing', '/', RACE_SCREENS], ['classic', '/?shooter=1', SCREENS]].slice(0, kinds)) {
  test(`phone audit ${w}x${h} (${kind} lobby): every menu screen has thumb-sized controls, readable text and its main buttons in view`, async ({ browser }) => {
    test.setTimeout(300_000);
    const ctx = await phone(browser, w, h);
    const page = await ctx.newPage();
    const errors = trackErrors(page);
    const problems = [];
    await page.goto(base);
    await needTouch(page);
    for (const s of screens) {
      await page.goto(base);
      await page.waitForSelector('#playBtn');
      await s.open(page);
      // let the slide-in finish so sizes and hit tests are the settled ones
      await page.waitForFunction(() => !document.getAnimations().some((a) => ['screen-in', 'pop-in', 'flip-in'].includes(a.animationName) && a.playState !== 'finished'));
      for (const msg of await page.evaluate(auditPage, s.primary)) if (!allowed(msg)) problems.push(`[${s.name}] ${msg}`);
    }
    expect(problems).toEqual([]);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

for (const [w, h] of [[667, 375], [844, 390], [932, 430]]) {
  test(`landscape phone ${w}x${h}: the POWER row is on the hunter card and opens Brawler Power (classic lobby)`, async ({ browser }) => {
    const ctx = await phone(browser, w, h);
    const page = await ctx.newPage();
    await page.goto('/?shooter=1');
    await needTouch(page);
    await expect(page.locator('#npPower')).toBeVisible();
    await page.tap('#npPower');
    await expect(page.locator('.ui-pop #pwBody .pwpick')).toHaveCount(2); // Gadget + Star Power picks
    await expect(page.locator('.ui-pop [data-close]')).toBeInViewport({ ratio: 1 });
    await page.tap('.ui-pop [data-close]');
    await expect(page.locator('.ui-pop')).toHaveCount(0);
    // second way in: the brawler card, for the hunter you are looking at
    await page.tap('.nameplate #stage');
    await page.tap('.bcard[data-b="rook"]');
    await expect(page.locator('.detail [data-power]')).toBeInViewport({ ratio: 1 });
    await page.tap('.detail [data-power]');
    await expect(page.locator('.ui-pop #pwWho .chipbtn.on')).toContainText('Rook');
    await ctx.close();
  });
}

for (const [w, h] of [[320, 568], [375, 667], [390, 844], [412, 915], [430, 932]]) {
  test(`portrait ${w}x${h}: PLAY, Trophy Road and Hunt Pass are in view without scrolling, clear of the tabs and the credit (classic lobby)`, async ({ browser }) => {
    const ctx = await phone(browser, w, h);
    const page = await ctx.newPage();
    const errors = trackErrors(page);
    await page.goto('/?shooter=1');
    await needTouch(page);
    await page.waitForSelector('#playBtn');
    const r = await page.evaluate(() => {
      const box = (s) => document.querySelector(s).getBoundingClientRect();
      const tabs = box('.lb-tabs'), credit = box('#lobby #credit'), pg = document.querySelector('.pg-play');
      const over = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
      const out = { scrolls: pg.scrollHeight > pg.clientHeight + 1 || document.scrollingElement.scrollHeight > innerHeight + 1, creditOnScreen: credit.top >= 0 && credit.bottom <= tabs.top + 0.5 && credit.right <= innerWidth, stage: box('#stage').height };
      for (const s of ['#playBtn', '#rail_road', '#passBtn', '#npPower', '.slot.me']) {
        const b = box(s);
        out[s + ':dbg'] = [up, dn, document.elementFromPoint(cx, cy - up - 1)?.className, document.elementFromPoint(cx, cy + dn + 1)?.className, b.height].join(' ');
        out[s] = { inView: b.left >= 0 && b.top >= 0 && b.right <= innerWidth + 0.5 && b.bottom <= tabs.top + 0.5, hitsCredit: over(b, credit), w: b.width, h: b.height };
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        out[s].onTop = !!hit && document.querySelector(s).contains(hit);
      }
      return out;
    });
    expect(r.scrolls, 'the play page does not need scrolling').toBe(false);
    expect(r.creditOnScreen, 'credit line is on screen above the tab bar').toBe(true);
    expect(r.stage, 'your hunter is drawn').toBeGreaterThan(40);
    for (const s of ['#playBtn', '#rail_road', '#passBtn', '#npPower', '.slot.me']) {
      expect(r[s].inView, `${s} fully in view above the tab bar`).toBe(true);
      expect(r[s].hitsCredit, `${s} clear of the credit`).toBe(false);
      expect(r[s].onTop, `${s} not covered`).toBe(true);
    }
    expect(r['#playBtn'].h).toBeGreaterThanOrEqual(44);
    expect(r['#playBtn'].w).toBeGreaterThanOrEqual(120);
    // and PLAY really starts matchmaking from here
    await page.tap('#playBtn');
    await expect(page.locator('.mm')).toBeVisible();
    await expect(page.locator('#mmCancel')).toBeInViewport({ ratio: 1 });
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('guest chip: sits beside the name (not on the XP bar) and its dismiss is a thumb-sized target', async ({ browser }) => {
  for (const [w, h] of [[667, 375], [932, 430], [390, 844]]) {
    const ctx = await phone(browser, w, h);
    const page = await ctx.newPage();
    await page.goto('/');
    await needTouch(page);
    await expect(page.locator('#guestChip')).toBeVisible();
    const r = await page.evaluate(() => {
      const chip = document.querySelector('#guestChip').getBoundingClientRect(), xp = document.querySelector('.xpbar').getBoundingClientRect(), nm = document.querySelector('#pName').getBoundingClientRect();
      const x = document.querySelector('#guestX'), xr = x.getBoundingClientRect(), cx = xr.left + xr.width / 2, cy = xr.top + xr.height / 2;
      const over = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      // the dismiss answers taps 20px from its centre in every direction
      const reach = [[-20, 0], [20, 0], [0, -20], [0, 20]].every(([dx, dy]) => document.elementFromPoint(cx + dx, cy + dy) === x);
      return { onXp: over(chip, xp), onName: over(chip, nm), nameW: nm.width, reach, inView: chip.right <= innerWidth && chip.left >= 0 };
    });
    expect(r.onXp, `${w}x${h}: chip clear of the XP bar`).toBe(false);
    expect(r.onName, `${w}x${h}: chip clear of the name`).toBe(false);
    expect(r.nameW, `${w}x${h}: the name still has room`).toBeGreaterThan(30);
    expect(r.reach, `${w}x${h}: dismiss hit area`).toBe(true);
    expect(r.inView).toBe(true);
    // a tap near the edge of the ✕ (not dead centre) still dismisses, and does not open the profile
    const xb = await page.locator('#guestX').boundingBox();
    await page.touchscreen.tap(xb.x + xb.width / 2 + 16, xb.y + xb.height / 2 + 14);
    await expect(page.locator('#guestChip')).toBeHidden();
    await expect(page.locator('.ui-screen')).toHaveCount(0);
    await ctx.close();
  }
});

test('armory on a short phone: EQUIP and TEST RANGE are in view at once and work (classic lobby)', async ({ browser }) => {
  const ctx = await phone(browser, 667, 375);
  const page = await ctx.newPage();
  await page.goto('/?shooter=1');
  await needTouch(page);
  await page.tap('#rail_armory');
  await expect(page.locator('#arEq')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('#arTry')).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.querySelector('#arInfo').scrollTop)).toBe(0); // no scrolling was needed
  await page.tap('#arEq');
  await expect(page.locator('#arUn')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('#arItems .ped.on .tag')).toContainText('EQUIPPED');
  await ctx.close();
});

test('locker on a short phone: the EQUIPPED tag and level-locked skins are labelled (classic lobby)', async ({ browser }) => {
  const ctx = await phone(browser, 667, 375);
  const page = await ctx.newPage();
  await page.goto('/?shooter=1');
  await needTouch(page);
  await page.tap('#rail_locker');
  await page.tap('.lsec[data-open="skins"] .ribbonhead');
  await expect(page.locator('#lkItems .ped.on .tag')).toBeVisible();
  await expect(page.locator('#lkItems .ped.on .tag')).toHaveText('EQUIPPED');
  await page.tap('#lkWho [data-w="volt"]');
  await expect(page.locator('#lkItems .ped[data-k="volt_static"] .tag')).toContainText('LEVEL 15'); // never "undefined"
  await expect(page.locator('#lkItems')).not.toContainText('undefined');
  await ctx.close();
});

test('match on an upright phone: a small turn-your-phone hint, the game stays playable, shown once', async ({ browser }) => {
  const ctx = await phone(browser, 390, 844);
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  await page.goto('/?world=meadow&mode=bounty');
  await needTouch(page);
  await waitMe(page);
  const hint = page.locator('#rotate');
  await expect(hint).toBeVisible();
  await expect(hint).toHaveText(/Turn your phone sideways for a wider view/);
  await expect(page.locator('#creditGame')).toBeVisible();
  const r = await page.evaluate(() => {
    const h = document.querySelector('#rotate').getBoundingClientRect(), c = document.querySelector('#creditGame').getBoundingClientRect();
    const over = h.left < c.right && h.right > c.left && h.top < c.bottom && h.bottom > c.top;
    // the sticks' halves of the screen still reach the game, not the hint
    const free = [[innerWidth * 0.25, innerHeight * 0.8], [innerWidth * 0.75, innerHeight * 0.8], [innerWidth / 2, innerHeight / 2]].every(([x, y]) => !document.elementFromPoint(x, y)?.closest('#rotate'));
    return { over, free, area: (h.width * h.height) / (innerWidth * innerHeight), inView: h.left >= 0 && h.right <= innerWidth && h.top >= 0, tapH: h.height };
  });
  expect(r.over, 'hint clear of the credit').toBe(false);
  expect(r.free, 'hint does not sit on the controls').toBe(true);
  expect(r.area, 'hint is small').toBeLessThan(0.08);
  expect(r.inView).toBe(true);
  expect(r.tapH).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => window.__hunt.phase)).toBe('play');
  await hint.tap();
  await expect(hint).toBeHidden();
  // same session, next match: not shown again
  await page.goto('/?world=meadow&mode=bounty');
  await waitMe(page);
  await page.waitForTimeout(300);
  await expect(page.locator('#rotate')).toBeHidden();
  expect(errors).toEqual([]);
  await ctx.close();
});

test('the turn-your-phone hint goes away when the phone is turned, and never shows in landscape or with a mouse', async ({ browser }) => {
  const ctx = await phone(browser, 390, 844);
  const page = await ctx.newPage();
  await page.goto('/?world=meadow&mode=bounty');
  await needTouch(page);
  await waitMe(page);
  await expect(page.locator('#rotate')).toBeVisible();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('#rotate')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  await expect(page.locator('#rotate')).toBeHidden();
  await ctx.close();
  const land = await phone(browser, 844, 390);
  const p2 = await land.newPage();
  await p2.goto('/?world=meadow&mode=bounty');
  await waitMe(p2);
  await expect(p2.locator('#rotate')).toBeHidden();
  await land.close();
  const desk = await browser.newContext({ viewport: { width: 500, height: 900 } });
  const p3 = await desk.newPage();
  await p3.goto('/?world=meadow&mode=bounty');
  await waitMe(p3);
  await expect(p3.locator('#rotate')).toBeHidden();
  await desk.close();
});

test('desktop keeps its layout: full-size text scale and the four-slot party (classic lobby)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/?shooter=1');
  await page.waitForSelector('#playBtn');
  const r = await page.evaluate(() => ({
    u: parseFloat(getComputedStyle(document.querySelector('.tabbtn')).minHeight) / 7,
    invites: [...document.querySelectorAll('.slot.invite')].filter((e) => e.getBoundingClientRect().width > 0).length,
    test: getComputedStyle(document.querySelector('#tbCoins small')).display,
    power: document.querySelector('#npPower .bar').getBoundingClientRect().width,
  }));
  expect(r.u).toBeCloseTo(10, 1);
  expect(r.invites).toBe(3);
  expect(r.test).not.toBe('none');
  expect(r.power).toBeGreaterThan(20);
  await ctx.close();
});

// ---------------------------------------------------------------- HUNT RACERS: the space lobby
// Phones (landscape iPhone SE / Pro Max, portrait phones) and iPads: every main control of the play
// view is fully on screen, on top, thumb-sized (its real hit area), clear of the credit line and
// of the dock; the dock has its five orbs; the page never scrolls; LAUNCH starts a race.
const SPACE_SEL = ['#playBtn', '#trackBtn', '#fillBots', '.nameplate #stage', '.modebtn[data-m="grand"]', '.modebtn[data-m="elim"]', '.modebtn[data-m="battle"]', '.modebtn[data-m="trial"]', '.sp-car-arrow.next', '#rail_store', '#rail_settings', '#rail_road', '#tbMissions', '#coinPlus', '#gemPlus'];
for (const [w, h] of [[667, 375], [932, 430], [1180, 820], [820, 1180], [320, 568], [375, 667], [390, 844], [430, 932]]) {
  test(`space lobby ${w}x${h} (racing): modes, track, bots, LAUNCH and the dock in view, thumb-sized, clear of the credit`, async ({ browser }) => {
    const ctx = await phone(browser, w, h);
    const page = await ctx.newPage();
    const errors = trackErrors(page);
    await page.goto('/');
    await needTouch(page);
    await page.waitForSelector('#playBtn');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const r = await page.evaluate((SEL) => {
      const box = (s) => document.querySelector(s).getBoundingClientRect();
      const dock = box('.sp-dock'), credit = box('#lobby #credit');
      const over = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5 && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
      const out = {
        scrolls: document.scrollingElement.scrollHeight > innerHeight + 1 || document.scrollingElement.scrollWidth > innerWidth + 1,
        creditOnScreen: credit.left >= 0 && credit.top >= 0 && credit.bottom <= innerHeight && credit.right <= innerWidth && credit.width > 50,
        dockOnScreen: dock.left >= -0.5 && dock.right <= innerWidth + 0.5 && dock.bottom <= innerHeight + 0.5,
        stage: box('#stage').height,
        orbs: [...document.querySelectorAll('.sp-orb')].map((b) => b.dataset.k),
        orbsDbg: [...document.querySelectorAll('.sp-orb')].map((b) => { const q = b.getBoundingClientRect(); return [q.width, q.height, q.bottom].map(Math.round).join('/'); }).join(' ') + ' credit ' + [credit.left, credit.top, credit.right].map(Math.round).join('/'),
        orbsOk: [...document.querySelectorAll('.sp-orb')].every((b) => { const q = b.getBoundingClientRect(); return q.width >= 43.4 && q.height >= 43.4 && q.bottom <= innerHeight + 0.5 && !over(q, credit); }),
      };
      for (const s of SEL) {
        const el = document.querySelector(s), b = el.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
        const hit = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && el.contains(e); };
        // the real hit area: a small control may reach further with an invisible padded edge
        let up = 0, dn = 0; while (up < 30 && hit(cx, cy - up - 1)) up++; while (dn < 30 && hit(cx, cy + dn + 1)) dn++;
        out[s + ':dbg'] = [up, dn, document.elementFromPoint(cx, cy - up - 1)?.className, document.elementFromPoint(cx, cy + dn + 1)?.className, b.height].join(' ');
        out[s] = { inView: b.left >= -0.5 && b.top >= -0.5 && b.right <= innerWidth + 0.5 && b.bottom <= innerHeight + 0.5, hitsCredit: over(b, credit), hitsDock: s !== '#playBtn' && over(b, dock), onTop: hit(cx, cy), hitH: up + dn + 1, w: b.width };
      }
      return out;
    }, SPACE_SEL);
    expect(r.scrolls, 'the lobby never scrolls').toBe(false);
    expect(r.creditOnScreen, 'credit line on screen').toBe(true);
    expect(r.dockOnScreen, 'dock on screen').toBe(true);
    expect(r.stage, 'your car is drawn').toBeGreaterThan(40);
    expect(r.orbs).toEqual(['profile', 'garage', 'race', 'pass', 'crew']);
    expect(r.orbsOk, 'dock orbs thumb-sized, on screen, clear of the credit: ' + r.orbsDbg).toBe(true);
    for (const s of SPACE_SEL) {
      expect(r[s].inView, `${s} fully in view`).toBe(true);
      expect(r[s].hitsCredit, `${s} clear of the credit`).toBe(false);
      expect(r[s].hitsDock, `${s} clear of the dock`).toBe(false);
      expect(r[s].onTop, `${s} not covered`).toBe(true);
      expect(r[s].hitH, `${s} is thumb-sized: ${r[s + ':dbg']}`).toBeGreaterThanOrEqual(43);
    }
    expect(r['#playBtn'].w).toBeGreaterThanOrEqual(120);
    // and LAUNCH really starts a race from here (the waiting card, CANCEL in reach, the credit on top)
    if (await page.getAttribute('#fillBots', 'aria-checked') === 'true') await page.tap('#fillBots');
    await page.tap('#playBtn');
    await expect(page.locator('.rc-wait')).toBeVisible();
    await expect(page.locator('.rc-cancel')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.rc-credit')).toBeVisible();
    await page.tap('.rc-cancel');
    await expect(page.locator('#lobby')).toBeVisible();
    await expect(page.locator('.rc-root')).toHaveCount(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('desktop (racing): the four modes as cards and strip, the track with its preview and three crew pods', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForSelector('#playBtn');
  const r = await page.evaluate(() => ({
    modes: [...document.querySelectorAll('.modebtn[data-m]')].map((b) => b.dataset.m),
    cards: [...document.querySelectorAll('.sp-card')].map((c) => [c.dataset.id, !!c.querySelector('.sp-card-sub').textContent]),
    pods: [...document.querySelectorAll('.sp-pod.empty')].filter((e) => e.getBoundingClientRect().width > 0).length,
    preview: document.querySelector('#trackPv').width,
    credit: document.querySelector('#lobby #credit').textContent,
  }));
  expect(r.modes).toEqual(['grand', 'elim', 'battle', 'trial']);
  expect(r.cards).toEqual([['grand', true], ['elim', true], ['battle', true], ['trial', true]]); // each with its short description
  expect(r.pods).toBe(3);
  expect(r.preview).toBeGreaterThan(20);
  expect(r.credit).toBe('Created by Sam Eyde III');
  await ctx.close();
});

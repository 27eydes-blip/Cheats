// Hunt Racers STORE (test currency): buy with test coins, try an item on in the big preview before
// buying, equip it, see it on another player's screen in a 2-phone race (the race roster carries
// it), the HORN goes out to the other racer, and the daily shop counts down to 00:00 UTC and
// refreshes there. The credit stays on the store screen.
import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';
import { phone, roomCode, waitPhase } from './race-helpers.js';

const LIME = [0x7d, 0xff, 0x3a];
// share of the store preview's pixels close to a colour (the underglow being tried on)
const previewShare = (page, rgb) => page.evaluate((c) => {
  const cv = document.querySelector('#stCv'), g = cv.getContext('2d'), d = g.getImageData(0, 0, cv.width, cv.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40 && Math.abs(d[i] - c[0]) < 50 && Math.abs(d[i + 1] - c[1]) < 50 && Math.abs(d[i + 2] - c[2]) < 50) n++;
  return n / (d.length / 4);
}, rgb);
const progress = (page) => page.evaluate(() => import('/account.js').then((A) => JSON.parse(JSON.stringify(A.progress()))));

test('store: try on, buy with test coins, equip; owned / equipped badges; not enough gems is refused', async ({ browser }) => {
  const ph = await phone(browser, 844, 390);
  const { page } = ph;
  const errors = trackErrors(page, { allowHttp: /400 POST \/api\/shop/ });
  await page.goto('/');
  await page.waitForSelector('#playBtn');
  await page.waitForFunction(() => import('/account.js').then((A) => !!A.ACC.user));
  await expect(page.locator('#lobby #credit')).toHaveText('Made by Gleyde Technologies');
  await page.tap('#rail_store');
  await expect(page.locator('.st-tab.on')).toHaveText(/DAILY/);
  await expect(page.locator('.st-credit')).toHaveText('Made by Gleyde Technologies');
  await expect(page.locator('.st-credit')).toBeInViewport({ ratio: 1 });
  await page.tap('.st-tab[data-t="glow"]');
  const coins0 = (await progress(page)).coins;
  expect(coins0).toBeGreaterThanOrEqual(150);
  const before = await previewShare(page, LIME);
  // TRY-ON: the preview wears it before it is bought
  await page.tap('.st-card[data-id="glow_lime"]');
  await expect(page.locator('#stTry')).toBeVisible();
  await expect(page.locator('#stName')).toHaveText('Lime Light');
  await expect(page.locator('#stRar')).toHaveText('COMMON');
  await expect(page.locator('#stPrice')).toContainText('150');
  await expect(page.locator('#stBuy')).toHaveText('BUY');
  await expect(page.locator('#stBuy')).toBeInViewport({ ratio: 1 });
  await expect.poll(() => previewShare(page, LIME), { message: 'the lime underglow shows in the preview' }).toBeGreaterThan(before + 0.004);
  expect((await progress(page)).owned).not.toContain('glow_lime');
  // BUY
  await page.tap('#stBuy');
  await expect(page.locator('#stBuy')).toHaveText('EQUIP');
  await expect(page.locator('.st-card[data-id="glow_lime"] .st-badge')).toHaveText('OWNED');
  let p = await progress(page);
  expect(p.coins).toBe(coins0 - 150);
  expect(p.owned).toContain('glow_lime');
  await expect(page.locator('#stCoins')).toHaveText(String(coins0 - 150));
  // EQUIP (on the car being dressed: your driver, ARCWIRE)
  await expect(page.locator('#stCar')).toHaveText('ARCWIRE');
  await page.tap('#stBuy');
  await expect(page.locator('#stBuy')).toHaveText('EQUIPPED');
  await expect(page.locator('.st-card[data-id="glow_lime"] .st-badge')).toHaveText('EQUIPPED');
  await expect(page.locator('#stTry')).toBeHidden();
  p = await progress(page);
  expect(p.race.cos.volt.glow).toBe('glow_lime');
  // another car keeps its own look; the stock card is the default there
  await page.tap('#stNext');
  await expect(page.locator('#stCar')).toHaveText('WARHOG');
  await expect(page.locator('.st-card[data-id=""] .st-badge')).toHaveText('EQUIPPED');
  await expect(page.locator('.st-card[data-id="glow_lime"] .st-badge')).toHaveText('OWNED');
  // a legendary costs gems: a guest's 20 test gems are not enough, nothing is charged
  await page.tap('.st-card[data-id="glow_goldrush"]');
  await expect(page.locator('#stPrice')).toContainText('60');
  await page.tap('#stBuy');
  await expect(page.locator('#toast')).toHaveText(/Not enough gems/);
  expect((await progress(page)).gems).toBe(p.gems);
  // CARS: the six starters, owned, with their stats, then the 8 unlockable cars (locked: their price
  // or progress, see overnight-cars-unlock.spec.js); DRIVE picks one
  await page.tap('.st-tab[data-t="cars"]');
  await expect(page.locator('.st-card[data-kind="car"]')).toHaveCount(14);
  await expect(page.locator('.st-card[data-kind="car"] .st-nm')).toHaveText(['ARCWIRE', 'WARHOG', 'PHANTOM', 'SANDVIPER', 'COBRA', 'RAZOR', 'VOIDRUNNER', 'SOLAR FANG', 'FROSTBYTE', 'GRAVITON', 'PHANTOM VX', 'REDLINE ZERO', 'HELIX', 'OBLIVION PRIME']);
  await expect(page.locator('.st-card[data-kind="car"] .st-badge')).toHaveText(['DRIVING', 'OWNED', 'OWNED', 'OWNED', 'OWNED', 'OWNED']);
  await page.tap('.st-card[data-id="rook"]');
  await page.tap('#stBuy');
  await expect(page.locator('#stBuy')).toHaveText('DRIVING');
  // SKINS: three per car, rarity-coloured, the legendary one animated
  await page.tap('.st-tab[data-t="skin"]');
  await expect(page.locator('.st-card[data-kind="skin"]')).toHaveCount(4); // stock + 3
  await expect(page.locator('.st-card.r-legendary .st-tag')).toContainText('ANIMATED');
  await page.tap('.ui-screen .back');
  await expect(page.locator('#npName')).toHaveText('COBRA');
  expect(errors).toEqual([]);
  await ph.ctx.close();
});

test('daily shop: six deals, a live countdown to 00:00 UTC, a new set right after midnight', async ({ browser }) => {
  const ph = await phone(browser, 844, 390);
  const { page } = ph;
  const errors = trackErrors(page);
  // the fake clock runs from 23:58 while the page loads and the store opens (a slow load must not
  // cross midnight early), then the test sets the time: 23:59:56 UTC, the shop refreshes 4 s later
  await page.clock.install({ time: new Date(Date.UTC(2026, 10, 16, 23, 58, 0)) });
  await page.goto('/');
  await page.waitForSelector('#playBtn');
  await page.tap('#rail_store');
  const ids = () => page.locator('.st-grid .st-card').evaluateAll((els) => els.map((e) => e.dataset.id));
  await expect(page.locator('.st-grid .st-card')).toHaveCount(6);
  await expect(page.locator('.st-grid .st-card s')).toHaveCount(6); // each with its list price struck out
  const day1 = await ids();
  const want = await page.evaluate(() => import('/race/garage.js').then((m) => m.dailyShop(m.shopDay()).map((d) => d.id)));
  expect(day1).toEqual(want);
  const at = (s) => page.clock.setFixedTime(new Date(Date.UTC(2026, 10, 16, 23, 59, 56) + s * 1000));
  await at(0);
  await expect(page.locator('#stCount')).toHaveText('00:00:04');
  await at(1);
  await expect(page.locator('#stCount')).toHaveText('00:00:03');
  await at(5.5);
  await expect(page.locator('#stCount')).toHaveText(/^2[34]:(59|00):\d\d$/);
  await expect.poll(ids).not.toEqual(day1);
  const day2 = await ids();
  expect(day2).toEqual(await page.evaluate(() => import('/race/garage.js').then((m) => m.dailyShop(m.shopDay(Date.UTC(2026, 10, 17, 0, 0, 1))).map((d) => d.id))));
  expect(errors).toEqual([]);
  await ph.ctx.close();
});

test('two phones in one race: your equipped underglow is in the other phone\'s roster, and your HORN reaches them', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'CDP touch phones');
  test.setTimeout(150_000);
  const A = await phone(browser, 844, 390), B = await phone(browser, 667, 375);
  const errs = [trackErrors(A.page, { allowHttp: /400 POST \/api\/shop/ }), trackErrors(B.page)];
  await Promise.all([A.page.goto('/'), B.page.goto('/')]);
  for (const P of [A, B]) await P.page.waitForFunction(() => import('/account.js').then((m) => !!m.ACC.user));
  // A buys and equips the lime underglow on WARHOG in the store
  await A.page.evaluate(async () => {
    const m = await import('/account.js');
    await m.shop({ action: 'gbuy', id: 'glow_lime' });
    await m.shop({ action: 'gequip', car: 'brick', slot: 'glow', id: 'glow_lime' });
  });
  const room = roomCode('S');
  await A.page.goto(`/?race=1&room=${room}&lobby=3&laps=1&track=desert&driver=brick&bots=0`);
  await B.page.goto(`/?race=1&room=${room}&lobby=3&laps=1&track=desert&driver=volt&bots=0`);
  await Promise.all([waitPhase(A.page, 'race', 60_000), waitPhase(B.page, 'race', 60_000)]);
  const aId = await A.page.evaluate(() => window.__race.rc.id);
  // touch controls hold the throttle down, so both cars would drive off (and apart) while the
  // checks below run, more so on a slow machine. A key press switches each phone to key
  // controls (no key held = no throttle): wait until both cars sit still, next to each other.
  for (const P of [A, B]) {
    await P.page.keyboard.press('ArrowDown');
    await expect.poll(() => P.page.evaluate(() => window.__race.session.ctrl.mode)).toBe('keys');
  }
  await expect.poll(() => B.page.evaluate(() => Math.max(...window.__race.session.view.cars.map((c) => Math.abs(c.spd || 0)))), { message: 'both cars stopped', timeout: 20_000 }).toBeLessThan(5);
  // B sees A's look from shared data: the roster row and the look it resolves to
  await expect.poll(() => B.page.evaluate((id) => window.__race.rc.roster.get(id)?.cos, aId)).toEqual([0, 'glow_lime', 0, 0, 0, 0]); // (SLOTS order: skin glow wheel flame trail horn)
  const look = await B.page.evaluate((id) => Promise.all([import('/ui/platform.js'), import('/race/garage.js')]).then(([P]) => {
    const r = window.__race.rc.roster.get(id), L = P.lookOf(r.driver, Object.fromEntries(['skin', 'glow', 'wheel', 'flame', 'trail', 'horn'].map((s, i) => [s, r.cos[i] || null])));
    return { name: L.name, glow: L.glow, driver: r.driver };
  }), aId);
  expect(look).toEqual({ name: 'WARHOG', glow: '#7dff3a', driver: 'brick' });
  // ...and B's renderer DRAWS it: lime-green pixels around A's car on B's canvas, none around B's own (blue) car
  const greenNear = (id) => B.page.evaluate((id) => {
    const s = window.__race.session, R = s.renderer, v = s.view, c = v && R.carAt(v, id), M = R.M;
    if (!c || !M) return -1;
    const p = R.toCanvas(c.x, c.y, {}), cx = p.x * R.dpr, cy = p.y * R.dpr, rad = Math.round(70 * M.s); // (canvas pixels, any camera view)
    const g = R.cv.getContext('2d'), x0 = Math.max(0, Math.round(cx - rad)), y0 = Math.max(0, Math.round(cy - rad));
    const d = g.getImageData(x0, y0, Math.min(R.cv.width - x0, rad * 2), Math.min(R.cv.height - y0, rad * 2)).data;
    // green dominance (night roads, the cars' own neons and the HUD are never green-dominant; lime light adds it)
    let n = 0;
    for (let i = 0; i < d.length; i += 4) n += Math.max(0, d[i + 1] - Math.max(d[i], d[i + 2]));
    return n / (d.length / 4);
  }, id);
  await expect.poll(() => greenNear(aId), { message: "A's lime underglow drawn on B's screen", timeout: 15_000 }).toBeGreaterThan(0.15);
  // control: on B, give A's roster row no cosmetics (a new row object, as when cosmetics change): the lime goes
  await B.page.evaluate((id) => { const rc = window.__race.rc, r = rc.roster.get(id); window.__aRow = r; rc.roster.set(id, { ...r, cos: null }); }, aId);
  await expect.poll(() => greenNear(aId), { message: 'default look: no lime', timeout: 10_000 }).toBeLessThan(0.05);
  await B.page.evaluate((id) => window.__race.rc.roster.set(id, { ...window.__aRow }), aId);
  await expect.poll(() => greenNear(aId), { timeout: 10_000 }).toBeGreaterThan(0.15);
  // B is a guest with nothing equipped: everyone sees the default look
  const bId = await B.page.evaluate(() => window.__race.rc.id);
  expect(await A.page.evaluate((id) => window.__race.rc.roster.get(id)?.cos, bId)).toEqual([0, 0, 0, 0, 0, 0]);
  // HORN: A taps the button; B gets the horn event for A
  await B.page.evaluate(() => { window.__horns = []; window.__race.rc.on('s', (m) => { for (const e of m.ev || []) if (e[0] === 'horn') window.__horns.push(e[1]); }); });
  await expect(A.page.locator('.rc-horn')).toBeVisible();
  const hb = await A.page.locator('.rc-horn').boundingBox();
  expect(hb.width).toBeGreaterThanOrEqual(44);
  await A.page.tap('.rc-horn');
  await expect.poll(() => B.page.evaluate(() => window.__horns)).toEqual([aId]);
  // a second press right away is ignored (1.5 s apart); the key works too
  await A.page.tap('.rc-horn');
  await A.page.waitForTimeout(1700);
  await A.page.keyboard.press('KeyH');
  await expect.poll(() => B.page.evaluate(() => window.__horns.length)).toBe(2);
  // the credit is still on top in the race
  await expect(A.page.locator('.rc-credit')).toBeVisible();
  for (const e of errs) expect(e).toEqual([]);
  await A.ctx.close(); await B.ctx.close();
});

// The HORN sits beside pause, clear of RESET (even at its big "stuck" size), the minimap and the
// thumb buttons, on small and big phones and an iPad, right- and left-handed.
for (const [w, h] of [[667, 375], [932, 430], [1180, 820]]) for (const left of [false, true]) {
  test(`horn button layout ${w}x${h}${left ? ' (left-handed)' : ''}: 44 px, clear of pause, RESET, minimap and the thumb buttons`, async ({ browser }) => {
    const ph = await phone(browser, w, h);
    const { page } = ph;
    await page.addInitScript((l) => { try { localStorage.setItem('hunt-settings', JSON.stringify({ leftHanded: l })); } catch {} }, left);
    await page.goto('/?race=1&mode=trial&track=neon&laps=1');
    await waitPhase(page, 'race', 60_000);
    await expect(page.locator('.rc-horn')).toBeVisible();
    await page.waitForTimeout(400); // (placed a few times a second)
    const r = await page.evaluate(() => {
      const h = document.querySelector('.rc-horn').getBoundingClientRect(), L = window.__race.layout(), s = window.__race.session;
      const size = Math.round(Math.min(180, Math.max(96, L.H * 0.34))), mm = { x0: L.W - s.SA.r - 32 - 2 * L.btn.reset.r1 - size, y0: s.SA.t + 6 }; mm.x1 = mm.x0 + size; mm.y1 = mm.y0 + size;
      const hc = { x: h.left + h.width / 2, y: h.top + h.height / 2, r: h.width / 2 };
      const gap = (b, r = b.r) => Math.hypot(b.x - hc.x, b.y - hc.y) - r - hc.r;
      const out = { w: h.width, h: h.height, inView: h.left >= 0 && h.top >= 0 && h.right <= innerWidth && h.bottom <= innerHeight };
      for (const k of ['menu', 'drift', 'fire', 'item', 'brake']) out[k] = gap(L.btn[k]);
      out.resetBig = gap(L.btn.reset, L.btn.reset.r1);
      out.minimap = !(h.right > mm.x0 && h.left < mm.x1 && h.bottom > mm.y0 && h.top < mm.y1);
      return out;
    });
    expect(r.w).toBeGreaterThanOrEqual(44); expect(r.h).toBeGreaterThanOrEqual(44);
    expect(r.inView).toBe(true);
    for (const k of ['menu', 'resetBig', 'drift', 'fire', 'item', 'brake']) expect(r[k], `clear of ${k}`).toBeGreaterThanOrEqual(2);
    expect(r.minimap, 'clear of the minimap').toBe(true);
    await ph.ctx.close();
  });
}

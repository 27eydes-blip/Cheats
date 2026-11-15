// Controls: real multi-touch (CDP Input.dispatchTouchEvent) at phone size, and mouse / keyboard on
// desktop. Inputs are checked where they leave the client: the 'in' messages sent to the server
// (f = fire, u = super, gd = gadget, w = weapon slot), plus window.__hunt / window.__huntInput.
import { test, expect } from '@playwright/test';
import { trackErrors, waitMe, G } from './helpers.js';

const RANGE = '/?world=meadow&mode=range&wpn=stormline&pw=7&gd=volt_jolt';
// record every input message the client sends
const recordInputs = () => {
  window.__sent = [];
  const send = WebSocket.prototype.send;
  WebSocket.prototype.send = function (d) { try { const m = JSON.parse(d); if (m.t === 'in') window.__sent.push(m); } catch {} return send.call(this, d); };
};
const sentSince = (page, i) => page.evaluate((i) => window.__sent.slice(i), i);
const mark = (page) => page.evaluate(() => window.__sent.length);
const fires = (msgs) => msgs.filter((m) => m.f != null).length;
const supers = (msgs) => msgs.filter((m) => m.u != null).length;
// the server never charged the super in these tests: keep a local value set while we look
const holdSc = (page, v) => page.evaluate((v) => { clearInterval(window.__scT); window.__scT = setInterval(() => { if (window.__hunt.me) window.__hunt.me.sc = v; }, 10); }, v);

// ---------------------------------------------------------------- touch
async function phone(browser, { width = 667, height = 375, lefty = false, url = RANGE } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ctx.addInitScript(recordInputs);
  if (lefty) await ctx.addInitScript(() => localStorage.setItem('hunt-settings', JSON.stringify({ leftHanded: true })));
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  await page.goto(url);
  await waitMe(page);
  await page.waitForFunction(() => window.__hunt.phase === 'play' && window.__huntInput.enabled);
  await page.waitForTimeout(600);
  const cdp = await ctx.newCDPSession(page);
  const down = new Map(); // id -> [x, y]
  const pt = ([id, [x, y]]) => ({ x, y, id, radiusX: 5, radiusY: 5, force: 1 });
  // touchStart / touchMove carry every finger that is down; touchEnd carries the one that lifts
  const send = (type, pts = [...down]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(pt) });
  const T = {
    async start(id, x, y) { down.set(id, [x, y]); await send('touchStart'); },
    async move(id, x, y) { down.set(id, [x, y]); await send('touchMove'); },
    async end(id) { const p = down.get(id); down.delete(id); await send('touchEnd', [[id, p]]); },
    async drag(id, x0, y0, x1, y1, steps = 6, ms = 120) { for (let i = 1; i <= steps; i++) { await T.move(id, x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps); await page.waitForTimeout(ms / steps); } },
    async tap(id, x, y) { await T.start(id, x, y); await page.waitForTimeout(60); await T.end(id); },
  };
  const inp = (fn) => page.evaluate(fn);
  return { ctx, page, T, errors, inp };
}
const settle = (page) => page.waitForTimeout(250); // (a couple of 20 Hz input ticks)

test.describe('touch controls at phone size', () => {
  test('move + aim with two thumbs, tap to auto-fire, drag-release, long still press', async ({ browser }) => {
    const { ctx, page, T, errors } = await phone(browser);
    // move (left thumb) while aiming and firing (right thumb)
    const x0 = await G(page, () => window.__hunt.pred.x);
    let i = await mark(page);
    await T.start(1, 140, 290);
    await T.drag(1, 140, 290, 210, 290);
    await T.start(2, 560, 180);
    await T.drag(2, 560, 180, 620, 170);
    await page.waitForTimeout(400);
    expect(await G(page, () => window.__huntInput.getMove().x)).toBeGreaterThan(0.5);
    await T.end(2);
    await settle(page);
    await T.end(1);
    expect(await G(page, () => window.__hunt.pred.x)).toBeGreaterThan(x0 + 20);
    let sent = await sentSince(page, i);
    expect(fires(sent)).toBe(1);
    const f = sent.find((m) => m.f != null).f;
    expect(Math.abs(f - Math.atan2(-10, 60))).toBeLessThan(0.15); // fired the way it was dragged
    await page.waitForTimeout(700); // (reload)

    // quick tap: auto-aim shot
    i = await mark(page);
    await T.tap(3, 540, 140);
    await settle(page);
    expect(fires(await sentSince(page, i))).toBe(1);
    await page.waitForTimeout(700);

    // thumb held still for over a second, then lifted: still a shot (it used to be dropped after 0.78 s)
    i = await mark(page);
    await T.start(4, 540, 140);
    await page.waitForTimeout(1200);
    await T.end(4);
    await settle(page);
    expect(fires(await sentSince(page, i))).toBe(1);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test('SUPER drag, SWAP and GADGET buttons; unready SUPER says so and its edge still fires', async ({ browser }) => {
    const { ctx, page, T, errors, inp } = await phone(browser);
    await page.waitForFunction(() => window.__hunt.me.w2 && window.__hunt.me.gu > 0);
    const L = await inp(() => { const i = window.__huntInput; return { sb: i.superBtn, wp: i.weaponPanel, gb: i.gadgetBtn }; });

    // SUPER not charged: a press on it says NOT READY and fires nothing
    await holdSc(page, 0.3);
    let i = await mark(page);
    await T.tap(1, L.sb.x, L.sb.y);
    await settle(page);
    expect(await G(page, () => window.__hunt.notReady?.what)).toBe('super');
    let sent = await sentSince(page, i);
    expect(fires(sent) + supers(sent)).toBe(0);
    // ...but a drag that starts just outside the drawn button (inside its old 14 px slop) is a normal aimed shot
    i = await mark(page);
    const ex = L.sb.x + L.sb.r + 8, ey = L.sb.y;
    await T.start(2, ex, ey);
    await T.drag(2, ex, ey, ex + 50, ey - 40);
    await T.end(2);
    await settle(page);
    sent = await sentSince(page, i);
    expect(fires(sent)).toBe(1);
    expect(supers(sent)).toBe(0);
    await page.waitForTimeout(700);

    // SUPER charged: drag from the button aims and releases a super
    await holdSc(page, 1);
    await page.waitForTimeout(100);
    i = await mark(page);
    await T.start(3, L.sb.x, L.sb.y);
    await T.drag(3, L.sb.x, L.sb.y, L.sb.x + 60, L.sb.y - 60);
    expect(await G(page, () => window.__huntInput.getAim()?.kind)).toBe('super');
    await T.end(3);
    await settle(page);
    sent = await sentSince(page, i);
    expect(supers(sent)).toBe(1);
    expect(fires(sent)).toBe(0);
    await holdSc(page, 0);

    // SWAP: tap the weapon panel
    i = await mark(page);
    await T.tap(4, L.wp.x, L.wp.y);
    await page.waitForFunction(() => window.__hunt.me.ws === 1);
    sent = await sentSince(page, i);
    expect(sent.some((m) => m.w === 1)).toBe(true);
    expect(fires(sent)).toBe(0);
    // GADGET
    const gu = await G(page, () => window.__hunt.me.gu);
    i = await mark(page);
    await T.tap(5, L.gb.x, L.gb.y);
    await page.waitForFunction((g) => window.__hunt.me.gu === g - 1, gu);
    sent = await sentSince(page, i);
    expect(sent.some((m) => m.gd)).toBe(true);
    expect(fires(sent)).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test('a second thumb takes over the move stick when the first lifts (and the aim stick too)', async ({ browser }) => {
    const { ctx, page, T, inp } = await phone(browser);
    await T.start(1, 150, 300);
    await T.drag(1, 150, 300, 210, 300);
    await T.start(2, 120, 240); // second finger lands on the move side while the first still holds it
    await T.drag(2, 120, 240, 175, 240);
    await T.end(1);
    await page.waitForTimeout(100);
    const m = await inp(() => ({ id: window.__huntInput.moveT?.id, mv: window.__huntInput.getMove() }));
    expect(m.id).toBe(2);
    expect(m.mv.x).toBeGreaterThan(0.5); // its drag so far counts: still walking right
    const x0 = await G(page, () => window.__hunt.pred.x);
    await T.drag(2, 175, 240, 185, 240);
    await page.waitForTimeout(400);
    expect(await G(page, () => window.__hunt.pred.x)).toBeGreaterThan(x0 + 20);
    await T.end(2);
    expect(await inp(() => window.__huntInput.moveT)).toBeNull();

    // aim side: first thumb fires on release, the second one becomes the aim stick and fires on its own release
    let i = await mark(page);
    await T.start(3, 520, 160);
    await T.start(4, 600, 150);
    await T.drag(4, 600, 150, 640, 150);
    await T.end(3);
    await page.waitForTimeout(700);
    expect(await inp(() => window.__huntInput.aimT?.id)).toBe(4);
    await T.end(4);
    await settle(page);
    expect(fires(await sentSince(page, i))).toBe(2);
    await ctx.close();
  });

  test('left-handed: the whole cluster is mirrored and works, and the DOM HUD moves out of its way', async ({ browser }) => {
    const { ctx, page, T, inp, errors } = await phone(browser, { lefty: true, url: '/?world=meadow&mode=bounty&wpn=stormline' });
    await page.waitForFunction(() => window.__hunt.me.w2);
    const L = await inp(() => { const i = window.__huntInput; return { sb: i.superBtn, wp: i.weaponPanel, fire: i.atkHint, W: i.W }; });
    expect(L.fire.x).toBeLessThan(L.W / 2);
    expect(L.sb.x).toBeLessThan(L.W / 2);
    expect(L.wp.x).toBeLessThan(L.W * 0.55);
    // move with the right thumb
    await T.start(1, 520, 300);
    await T.drag(1, 520, 300, 470, 300);
    await page.waitForTimeout(200);
    expect(await G(page, () => window.__huntInput.getMove().x)).toBeLessThan(-0.5);
    await T.end(1);
    // fire with the left thumb
    let i = await mark(page);
    await T.tap(2, 140, 160);
    await settle(page);
    expect(fires(await sentSince(page, i))).toBe(1);
    // swap on the mirrored weapon panel
    await T.tap(3, L.wp.x, L.wp.y);
    await page.waitForFunction(() => window.__hunt.me.ws === 1);
    // the leaderboard sits on the right, clear of the mirrored fire stick
    await expect(page.locator('#leader')).toBeVisible({ timeout: 5000 });
    const lb = await page.locator('#leader').boundingBox();
    expect(lb.x).toBeGreaterThan(L.W / 2);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  for (const [mode, url] of [['showdown', '/?world=meadow&mode=showdown&wpn=stormline&pw=7&gd=volt_jolt'], ['big hunt', '/?world=meadow&mode=bighunt&wpn=stormline'], ['squad', '/?world=meadow&mode=squad&wpn=stormline'], ['free play', '/?free=1']]) {
    for (const lefty of [false, true]) {
      test(`${mode}${lefty ? ' (left-handed)' : ''}: no control under the DOM HUD, none in the firing lane`, async ({ browser }) => {
        const { ctx, page, inp } = await phone(browser, { lefty, url });
        await page.waitForTimeout(800);
        const L = await inp(() => { const i = window.__huntInput; return { sb: i.superBtn, wp: i.weaponPanel, gb: i.gadgetBtn, fire: i.atkHint, W: i.W, H: i.H, g: i.gadgetOn }; });
        const rects = [
          { x: L.wp.x - L.wp.w / 2, y: L.wp.y - L.wp.h / 2, width: L.wp.w, height: L.wp.h },
          { x: L.sb.x - L.sb.r, y: L.sb.y - L.sb.r, width: L.sb.r * 2, height: L.sb.r * 2 },
          { x: L.fire.x - L.fire.r, y: L.fire.y - L.fire.r, width: L.fire.r * 2, height: L.fire.r * 2 },
        ];
        if (L.g) rects.push({ x: L.gb.x - L.gb.r, y: L.gb.y - L.gb.r, width: L.gb.r * 2, height: L.gb.r * 2 });
        for (const sel of ['#leader', '#hubPanel', '#topbar', '#modeBanner', '#creditGame', '#menuBtn', '#feed']) {
          const el = page.locator(sel);
          if (!(await el.isVisible())) continue;
          const b = await el.boundingBox();
          // (in the safe hub you can't fire, super or gadget: the hub panel only has to clear what works there)
          for (const r of sel === '#hubPanel' && lefty ? rects.slice(0, 1) : rects) expect(r.x < b.x + b.width && b.x < r.x + r.width && r.y < b.y + b.height && b.y < r.y + r.height, `${sel} over a control`).toBe(false);
        }
        // the firing lane: the band at your hunter's height (screen middle), between you and the edge
        for (const r of rects.slice(0, 2)) expect(r.y, 'controls stay below the lane').toBeGreaterThan(L.H / 2 + 30);
        // and the weapon panel never sits under the fire stick's travel
        const wpc = { x: Math.max(rects[0].x, Math.min(L.fire.x, rects[0].x + rects[0].width)), y: Math.max(rects[0].y, Math.min(L.fire.y, rects[0].y + rects[0].height)) };
        expect(Math.hypot(wpc.x - L.fire.x, wpc.y - L.fire.y)).toBeGreaterThan(L.fire.r);
        await ctx.close();
      });
    }
  }

  test('in-match text is readable at 667x375 (nameplates, HP, damage numbers)', async ({ browser }) => {
    const { ctx, page } = await phone(browser, { url: '/?world=meadow&mode=range' });
    // record the on-screen size of every text the canvas draws in the world
    await page.evaluate(() => {
      const P = CanvasRenderingContext2D.prototype, ft = P.fillText;
      window.__txt = {};
      P.fillText = function (t, ...a) {
        if (this.canvas.id === 'game') { const px = parseFloat(this.font) * Math.hypot(this.getTransform().a, this.getTransform().b) / devicePixelRatio; window.__txt[t] = Math.min(window.__txt[t] ?? 99, px); }
        return ft.call(this, t, ...a);
      };
    });
    await page.waitForTimeout(400);
    const txt = await page.evaluate(() => window.__txt);
    const me = await page.evaluate(() => window.__hunt.roster[window.__hunt.myId][0]);
    expect(txt[me], 'own name').toBeGreaterThanOrEqual(11);
    expect(txt.Dummy, 'other names').toBeGreaterThanOrEqual(11);
    const hp = Object.keys(txt).filter((k) => /^\d{3,5}$/.test(k));
    expect(hp.length).toBeGreaterThan(0);
    for (const k of hp) expect(txt[k], `HP ${k}`).toBeGreaterThanOrEqual(10);
    expect(txt.SUPER).toBeGreaterThanOrEqual(10);
    await ctx.close();
  });
});

// ---------------------------------------------------------------- mouse + keyboard
test.describe('mouse and keyboard', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(async ({ page }) => { await page.addInitScript(recordInputs); });

  test('clicking HUD controls on the canvas uses them and never fires', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto(RANGE);
    await waitMe(page);
    await page.waitForFunction(() => window.__hunt.me.w2);
    await page.waitForTimeout(300);
    const wp = await G(page, () => window.__huntInput.weaponPanel);
    let i = await mark(page);
    await page.mouse.click(wp.x, wp.y);
    await page.waitForFunction(() => window.__hunt.me.ws === 1);
    await settle(page);
    expect(fires(await sentSince(page, i))).toBe(0);
    // the emote button beside the minimap
    const em = await G(page, () => window.__huntInput.taps.find((t) => t.r < 30));
    i = await mark(page);
    await page.mouse.click(em.x, em.y);
    await settle(page);
    expect(await G(page, () => window.__hunt.emoteOpen)).toBe(true);
    expect(fires(await sentSince(page, i))).toBe(0);
    // the DOM buttons (desktop SWAP / GADGET / SUPER, menu): never a shot either
    i = await mark(page);
    await page.locator('#abSwap').click();
    await page.locator('#abGadget').click();
    await page.locator('#abSuper').click(); // (not charged: it shakes)
    await expect(page.locator('#abSuper')).toHaveClass(/nope/);
    await settle(page);
    expect(fires(await sentSince(page, i))).toBe(0);
    // and a plain click on the world does fire
    i = await mark(page);
    await page.mouse.click(900, 300);
    await settle(page);
    expect(fires(await sentSince(page, i))).toBe(1);
    expect(errors).toEqual([]);
  });

  test('keys follow physical positions (AZERTY), arrows still move, key caps follow the layout', async ({ page }) => {
    await page.goto(RANGE);
    await waitMe(page);
    const key = (type, code, k) => page.evaluate(([type, code, k]) => dispatchEvent(new KeyboardEvent(type, { code, key: k, bubbles: true })), [type, code, k]);
    const mv = () => G(page, () => window.__huntInput.getMove());
    // AZERTY: the key in the W position types 'z', the A position types 'q'
    await key('keydown', 'KeyW', 'z'); expect((await mv()).y).toBeLessThan(-0.9); await key('keyup', 'KeyW', 'z');
    await holdSc(page, 1);
    await page.waitForTimeout(100);
    const i = await mark(page);
    await key('keydown', 'KeyA', 'q'); expect((await mv()).x).toBeLessThan(-0.9);
    await settle(page);
    expect(supers(await sentSince(page, i))).toBe(0); // ('q' here is the left key, not super)
    await key('keyup', 'KeyA', 'q');
    await holdSc(page, 0);
    expect(await mv()).toEqual({ x: 0, y: 0 });
    // keyup with a different character than keydown (Shift released first): still released
    await key('keydown', 'KeyD', 'd'); await key('keyup', 'KeyD', 'D');
    expect(await mv()).toEqual({ x: 0, y: 0 });
    for (const [code, axis, sign] of [['ArrowLeft', 'x', -1], ['ArrowRight', 'x', 1], ['ArrowUp', 'y', -1], ['ArrowDown', 'y', 1]]) {
      await key('keydown', code, code); expect(Math.sign((await mv())[axis])).toBe(sign); await key('keyup', code, code);
    }
    // the swap key by position (R on QWERTY, P on Dvorak) swaps; its cap shows what the keyboard prints
    await key('keydown', 'KeyR', 'p'); await key('keyup', 'KeyR', 'p');
    await page.waitForFunction(() => window.__hunt.me.ws === 1);
    await expect(page.locator('#abSwapKey')).toHaveText('P');
    // Ctrl+R is the browser's, not a swap
    await page.evaluate(() => dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', key: 'r', ctrlKey: true })));
    await settle(page);
    expect(await G(page, () => window.__hunt.me.ws)).toBe(1);
  });

  test('fire is never stuck on: release off the canvas, window blur, tab hidden', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('hunt-settings', JSON.stringify({ holdFire: true })));
    await page.goto(RANGE);
    await waitMe(page);
    await page.waitForTimeout(300);
    const firesFor = async (ms) => { const i = await mark(page); await page.waitForTimeout(ms); return fires(await sentSince(page, i)); };
    // held on the canvas: keeps firing (hold to fire)
    await page.mouse.move(900, 300); await page.mouse.down();
    expect(await firesFor(1500)).toBeGreaterThan(1);
    // released over a DOM button (the menu): stops
    const mb = await page.locator('#menuBtn').boundingBox();
    await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2); await page.mouse.up();
    expect(await G(page, () => window.__huntInput.mouse.down)).toBe(0);
    expect(await firesFor(1200)).toBe(0);
    // held, then the window loses focus (alt-tab): stops
    await page.mouse.move(900, 300); await page.mouse.down();
    await page.evaluate(() => dispatchEvent(new Event('blur')));
    expect(await G(page, () => window.__huntInput.mouse.down)).toBe(0);
    await settle(page); // (the press itself fires once)
    expect(await firesFor(1200)).toBe(0);
    await page.mouse.up();
    // held, then the tab is hidden: stops, and held keys are let go
    await page.mouse.down();
    await page.keyboard.down('d');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    expect(await G(page, () => [window.__huntInput.mouse.down, window.__huntInput.keys.size])).toEqual([0, 0]);
    await page.evaluate(() => { delete document.hidden; });
    await settle(page);
    expect(await firesFor(1200)).toBe(0);
    await page.mouse.up(); await page.keyboard.up('d');
  });
});

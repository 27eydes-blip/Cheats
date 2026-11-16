// Race immersion (Part 1): the three camera views, steering in each, haptics / sound / music
// settings, the no-motion rule, and the race moments (grid revs, slow-mo, crash replay) never
// desyncing the race.
//  - a lap with the real touch joystick in Chase, Top-down and Cockpit (the steering hint gives the
//    stick's SCREEN direction; the controls turn it into the world heading): the lap is finished,
//    the minimap is drawn, the car stays on screen, stick up = the camera's heading
//  - no device motion / orientation listener and no motion-permission request, ever
//  - Haptics off = navigator.vibrate never called; on = called for a wreck; Sound off = no engine
//    voice, no race music, no oscillator at all; Music 0 = no music; the music heats up on the final
//    lap and ducks under your wreck
//  - grid revs: the engine revs while the car stays on its grid spot; slow-mo: the race clock and
//    the inputs keep going at full speed underneath; the crash replay plays on the results screen
// Chromium only (CDP touch, autoplay without a gesture for the audio checks).
import { test, expect, chromium } from '@playwright/test';
import { trackErrors } from './helpers.js';
import { phone, roomCode, raceUrl, waitPhase, drive, creditVisible } from './race-helpers.js';

const settings = (ctx, s) => ctx.addInitScript((s) => { localStorage.setItem('hunt-settings', JSON.stringify(s)); localStorage.setItem('hunt-race-tut', '1'); }, s);
const NO_MOTION_SPY = () => {
  window.__motion = [];
  const add = window.addEventListener;
  window.addEventListener = function (type, ...a) { if (/devicemotion|deviceorientation/i.test(String(type))) window.__motion.push('listen:' + type); return add.call(this, type, ...a); };
  for (const k of ['DeviceMotionEvent', 'DeviceOrientationEvent']) {
    const C = window[k] || (window[k] = function () {});
    C.requestPermission = () => { window.__motion.push('permission:' + k); return Promise.resolve('denied'); };
  }
  Object.defineProperty(window, 'ondevicemotion', { set() { window.__motion.push('prop:ondevicemotion'); }, get() { return null; }, configurable: true });
  Object.defineProperty(window, 'ondeviceorientation', { set() { window.__motion.push('prop:ondeviceorientation'); }, get() { return null; }, configurable: true });
};
const VIBRATE_SPY = () => { window.__buzz = []; navigator.vibrate = (p) => { window.__buzz.push(p); return true; }; };

for (const cam of ['chase', 'top', 'cockpit']) {
  test(`${cam} camera: a lap with the joystick, minimap and HUD intact, no motion APIs`, async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP touch input');
    test.setTimeout(180_000);
    const P = await phone(browser, 667, 375), page = P.page;
    await settings(P.ctx, { raceView: cam });
    await P.ctx.addInitScript(NO_MOTION_SPY);
    const errs = trackErrors(page);
    await page.goto(raceUrl({ room: roomCode('I'), bots: '1', laps: '1', lobby: '1.5' }));
    await waitPhase(page, 'race');
    const c0 = await page.evaluate(() => window.__race.camera());
    expect(c0.mode).toBe(cam);
    expect(c0.rotate).toBe(cam !== 'top');
    if (cam === 'top') expect(c0.css).toBe(''); else expect(c0.css).toMatch(/perspective\(\d+px\) rotateX\(/);
    // watch every frame: the car on screen, the minimap drawn on the (un-tilted) HUD canvas
    await page.evaluate(() => {
      const W = (window.__imm = { n: 0, off: 0, mapBlank: 0, upErr: 0 });
      const tick = () => {
        const r = window.__race;
        if (r && r.rc.phase === 'race' && r.rc.latest && r.rc.latest.tm > 0) {
          const s = r.carOnScreen();
          if (s && !(s.f & 32)) { W.n++; if (s.x < 0 || s.x > s.W || s.y < 0 || s.y > s.H) W.off++; }
          const c = r.camera();
          if (c.rotate) W.upErr = Math.max(W.upErr, Math.abs(Math.atan2(Math.sin(c.stickUp - c.h), Math.cos(c.stickUp - c.h))));
          else W.upErr = Math.max(W.upErr, Math.abs(c.stickUp + Math.PI / 2));
        }
        if (window.__imm === W) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const t0 = Date.now();
    await drive(P, { until: (s) => s.fin > 0 || s.phase === 'end', maxMs: 120_000 });
    const st = await page.evaluate(() => ({ fin: window.__race.rc.me.fin, w: window.__imm, motion: window.__motion }));
    console.log(`${cam}: lap in ${((Date.now() - t0) / 1000).toFixed(1)} s`, JSON.stringify(st.w));
    expect(st.fin, `${cam}: finished the lap steering with the joystick`).toBeGreaterThan(0);
    expect(st.w.n).toBeGreaterThan(100);
    expect(st.w.off, `${cam}: own car on screen`).toBe(0);
    expect(st.w.upErr, `${cam}: stick up = forward`).toBeLessThan(1e-6);
    // the minimap: drawn on the HUD canvas (Top-down: on the world canvas, there is no tilt to
    // keep it off), top right, not blank (its track outline is bright)
    const map = await page.evaluate(() => {
      const s = window.__race.session, g = s.flat ? s.renderer.g : s.hg, d = s.dpr, L = window.__race.layout(), size = Math.round(Math.max(96, Math.min(180, s.H * 0.34)));
      const x = (L.W - s.SA.r - 32 - 2 * s.ctrl.btn.reset.r1 - size) * d, y = (s.SA.t + 6) * d, px = g.getImageData(x, y, size * d, size * d).data;
      let bright = 0; for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 200 && px[i] + px[i + 1] + px[i + 2] > 600) bright++;
      return bright;
    });
    expect(map, `${cam}: minimap drawn`).toBeGreaterThan(200);
    expect(st.motion, 'no motion listeners / permission requests').toEqual([]);
    await creditVisible(page);
    expect(errs).toEqual([]);
    await P.ctx.close();
  });
}

test('pause menu CAMERA button cycles the view and saves it; Settings has Camera and Haptics rows', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'touch context');
  test.setTimeout(90_000);
  const P = await phone(browser, 844, 390), page = P.page;
  await settings(P.ctx, {});
  await page.goto(raceUrl({ room: roomCode('M'), bots: '1', laps: '1', lobby: '1.5' }));
  await waitPhase(page, 'race');
  expect((await page.evaluate(() => window.__race.camera())).mode, 'Top-down is the default').toBe('top');
  await page.evaluate(() => window.__race.session.toggleMenu(true));
  await expect(page.locator('.rc-cam')).toHaveText('CAMERA: TOP-DOWN');
  await page.tap('.rc-cam');
  await expect(page.locator('.rc-cam')).toHaveText('CAMERA: COCKPIT');
  expect(await page.evaluate(() => [window.__race.camera().mode, JSON.parse(localStorage.getItem('hunt-settings')).raceView])).toEqual(['cockpit', 'cockpit']);
  await page.tap('.rc-cam');
  await expect(page.locator('.rc-cam')).toHaveText('CAMERA: CHASE');
  await page.tap('.rc-cam');
  await expect(page.locator('.rc-cam')).toHaveText('CAMERA: TOP-DOWN');
  expect(await page.evaluate(() => [window.__race.camera().mode, window.__race.camera().css, JSON.parse(localStorage.getItem('hunt-settings')).raceView])).toEqual(['top', '', 'top']);
  await creditVisible(page);
  await P.ctx.close();
  // the lobby's Settings screen (racing): CAMERA chips and the Haptics switch
  const Q = await phone(browser, 844, 390), q = Q.page;
  await settings(Q.ctx, {});
  await q.goto('/');
  await q.tap('#rail_settings');
  await expect(q.locator('#setCam [data-k="top"]')).toHaveClass(/on/);
  await q.tap('#setCam [data-k="cockpit"]');
  await expect(q.locator('#setCam [data-k="cockpit"]')).toHaveClass(/on/);
  await expect(q.locator('#setHaptics')).toBeChecked();
  await q.locator('#setHaptics').uncheck();
  expect(await q.evaluate(() => JSON.parse(localStorage.getItem('hunt-settings')))).toMatchObject({ raceView: 'cockpit', haptics: false });
  await Q.ctx.close();
});

// audio checks need an AudioContext that runs without a tap: a browser with autoplay allowed
async function audioPhone(s, baseURL) {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 667, height: 375 }, hasTouch: true, isMobile: true, baseURL });
  await settings(ctx, s);
  await ctx.addInitScript(VIBRATE_SPY);
  await ctx.addInitScript(() => {
    window.__osc = 0;
    const C = window.AudioContext || window.webkitAudioContext, o = C.prototype.createOscillator;
    C.prototype.createOscillator = function (...a) { window.__osc++; return o.apply(this, a); };
  });
  const page = await ctx.newPage();
  return { b, ctx, page };
}
const audio = (page) => page.evaluate(() => ({ ...window.__race.audio(), osc: window.__osc, buzz: window.__buzz.length, state: window.__race.rc.phase }));

test('settings: Haptics off and Sound off really are off; on, they work (vibrate / engine / music / duck)', async ({ browserName, baseURL }) => {
  test.skip(browserName !== 'chromium', 'autoplay flag');
  test.setTimeout(150_000);
  const run = async (s, check) => {
    const { b, page } = await audioPhone(s, baseURL);
    try {
      await page.goto(raceUrl({ room: roomCode('A'), bots: '1', laps: '1', lobby: '1.5' }));
      await waitPhase(page, 'race');
      await page.waitForFunction(() => window.__race.rc.latest && window.__race.rc.latest.tm > 1, null, { timeout: 30_000 });
      await page.evaluate(() => window.__race.auto(true));
      await page.waitForTimeout(1500);
      const before = await audio(page);
      await page.evaluate(() => window.__race.dev('wreck'));
      await page.waitForFunction(() => (window.__race.mine.ko || []).length > 0, null, { timeout: 10_000 });
      await page.waitForTimeout(150);
      await check(before, await audio(page), page);
    } finally { await b.close(); }
  };
  // everything on (the defaults)
  await run({}, async (a, b) => {
    expect(a.engine, 'engine voice').toBe(true);
    expect(a.music.playing, 'race music').toBe(true);
    expect(a.music.intensity, 'one lap = the final lap: the music is up').toBe(1);
    expect(b.music.ducked, 'ducked under your wreck').toBe(true);
    expect(b.buzz, 'a buzz for the wreck').toBeGreaterThan(a.buzz);
  });
  // Haptics off: never a buzz; sound still on
  await run({ haptics: false }, async (a, b) => { expect(b.buzz).toBe(0); expect(a.engine).toBe(true); });
  // Music 0: no race music, the engine still runs
  await run({ musicVol: 0 }, async (a, b) => { expect(a.music.playing).toBe(false); expect(b.music.playing).toBe(false); expect(a.engine).toBe(true); });
  // Sound off: no engine voice, no music, not a single oscillator made, haptics unaffected
  await run({ sound: false }, async (a, b) => { expect([a.engine, a.music.playing, b.engine, b.music.playing]).toEqual([false, false, false, false]); expect(b.osc).toBe(0); expect(b.buzz).toBeGreaterThan(0); });
});

test('grid revs, slow-mo and the crash replay never desync the race', async ({ browserName, baseURL }) => {
  test.skip(browserName !== 'chromium', 'autoplay flag');
  test.setTimeout(150_000);
  const { b, page } = await audioPhone({}, baseURL);
  const errs = trackErrors(page);
  try {
    await page.goto(raceUrl({ room: roomCode('R'), bots: '1', laps: '1', lobby: '1.5' }));
    await waitPhase(page, 'race');
    // GRID REVS: the engine revs during the countdown while the car sits still on its spot
    await page.waitForFunction(() => window.__race.rc.latest && window.__race.rc.latest.tm < -0.5 && window.__race.rc.car, null, { timeout: 20_000 });
    const g0 = await page.evaluate(() => ({ x: window.__race.rc.car.x, y: window.__race.rc.car.y, eng: window.__race.audio().engine }));
    await page.waitForFunction(() => window.__race.rc.latest.tm > -0.2, null, { timeout: 10_000 });
    const g1 = await page.evaluate(() => ({ x: window.__race.rc.car.x, y: window.__race.rc.car.y }));
    expect(g0.eng, 'engine revving on the grid').toBe(true);
    expect(Math.hypot(g1.x - g0.x, g1.y - g0.y), 'still on the grid spot').toBeLessThan(0.5);
    await page.evaluate(() => window.__race.auto(true));
    await page.waitForFunction(() => window.__race.rc.latest.tm > 4, null, { timeout: 20_000 });
    // SLOW-MO (forced): the replay runs at 40% while the race clock and our inputs run at full speed
    const s0 = await page.evaluate(() => { window.__race.slowmo(); return { tm: window.__race.rc.latest.tm, seq: window.__race.rc.seq, t: performance.now() }; });
    expect((await page.evaluate(() => window.__race.moments())).slow).toBe(true);
    await page.waitForTimeout(1500);
    const s1 = await page.evaluate(() => ({ tm: window.__race.rc.latest.tm, seq: window.__race.rc.seq, t: performance.now(), slow: window.__race.moments().slow, drawn: window.__race.session.renderer.meCar && window.__race.session.renderer.meCar.predicted }));
    const real = (s1.t - s0.t) / 1000;
    expect(s1.slow).toBe(true);
    expect(s1.drawn, 'the slow-mo draws the recording, not the live car').toBeFalsy();
    expect(s1.tm - s0.tm, 'race clock at full speed').toBeGreaterThan(real * 0.8);
    expect(s1.seq - s0.seq, 'inputs still sent 30 times a second').toBeGreaterThan(real * 30 * 0.7);
    await page.waitForFunction(() => !window.__race.moments().slow, null, { timeout: 15_000 });
    // back to live: the drawn car is the predicted one again, exactly where the client has it
    await page.waitForTimeout(100);
    const live = await page.evaluate(() => { const R = window.__race.session.renderer, v = window.__race.rc.view(), m = v.cars.find((c) => c.me); return { pred: R.meCar.predicted, d: Math.hypot(R.meCar.x - m.x, R.meCar.y - m.y) }; });
    expect(live.pred).toBe(true);
    expect(live.d).toBeLessThan(40);
    // CRASH REPLAY: wreck our own car; the clip is kept and replayed on the results screen
    await page.evaluate(() => window.__race.dev('wreck'));
    await page.waitForFunction(() => { const m = window.__race.moments(); return m.clip && m.clip.label === 'YOUR WRECK'; }, null, { timeout: 15_000 });
    await page.waitForFunction(() => window.__race.finishShown(), null, { timeout: 90_000 }).catch(async (e) => {
      throw new Error(`no finish screen: ${JSON.stringify(await page.evaluate(() => { const r = window.__race, s = r.session; return { phase: r.phase, tm: r.rc.latest.tm, me: r.rc.me && { fin: r.rc.me.fin, lap: r.rc.me.lap, rt: r.rc.me.rt }, endAt: s.endAt, mom: r.moments(), md: r.rc.latest.md }; }))} ${e.message.split('\n')[0]}`);
    });
    await expect(page.locator('.rc-res .rc-replay canvas')).toBeVisible();
    await expect(page.locator('.rc-res .rc-rplabel')).toHaveText(/REPLAY · YOUR WRECK/);
    await page.waitForTimeout(600);
    const lit = await page.evaluate(() => { const cv = document.querySelector('.rc-replay canvas'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i] + d[i + 1] + d[i + 2] > 120) n++; return n; });
    expect(lit, 'the replay is drawn').toBeGreaterThan(200);
    expect((await page.evaluate(() => window.__race.moments())).replay).toBe(true);
    await creditVisible(page);
    expect(errs).toEqual([]);
  } finally { await b.close(); }
});

test('Low Graphics: no replay recording', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'touch context');
  const P = await phone(browser, 667, 375), page = P.page;
  await settings(P.ctx, { lowGfx: true });
  await page.goto(raceUrl({ room: roomCode('L'), bots: '1', laps: '1', lobby: '1.5' }));
  await waitPhase(page, 'race');
  await page.waitForFunction(() => window.__race.rc.latest && window.__race.rc.latest.tm > 1, null, { timeout: 30_000 });
  expect((await page.evaluate(() => window.__race.moments())).rec).toBe(0);
  await P.ctx.close();
});

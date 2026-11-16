// Helpers for the Hunt Racers browser tests (tests/e2e/race-*.spec.js).
// Phones drive with REAL touch input through CDP (Input.dispatchTouchEvent): a steering thumb on
// the left-hand joystick (pointing where the car should go), taps / holds on the right-hand buttons, several fingers at once by identifier. The page
// only supplies a steering hint (where the racing line is); the input path is the real one.
import { expect } from '@playwright/test';

export const roomCode = (p = 'E') => p + Math.random().toString(36).slice(2, 9).toUpperCase();
export const raceUrl = (o) => '/?race=1&' + new URLSearchParams({ lobby: '3', laps: '1', track: 'desert', mode: 'grand', ...o });

export async function phone(browser, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  // CDP (multi-touch through Fingers) is Chromium-only; on WebKit a phone still taps (page.tap)
  const cdp = browser.browserType().name() === 'chromium' ? await ctx.newCDPSession(page) : null;
  return { ctx, page, cdp, W: width, H: height };
}

export async function waitPhase(page, phase, timeout = 30_000) {
  try { await page.waitForFunction((ph) => window.__race && window.__race.phase === ph, phase, { timeout, polling: 200 }); }
  catch (e) { throw new Error(`race phase never became ${phase} (${e.message.split("\n")[0]}): ${await page.evaluate(() => (window.__race ? window.__race.phase : 'no race layer')).catch(() => '?')}`); }
}
export const raceState = (page) => page.evaluate(() => {
  const r = window.__race, me = r.rc.me;
  return { phase: r.phase, id: r.rc.id, lap: me?.lap ?? 0, fin: me?.fin ?? 0, rt: me?.rt ?? 0, it: me?.it ?? -1, wc: me?.wc ?? 0, tm: r.rc.latest?.tm ?? -9, mine: r.mine };
});

// A touch driver: keeps a set of active fingers and sends the full set on every change.
export class Fingers {
  constructor(ph) { this.ph = ph; this.active = new Map(); }
  points() { return [...this.active.entries()].map(([id, p]) => ({ x: p.x, y: p.y, id, radiusX: 8, radiusY: 8, force: 1 })); }
  async send(type, touchPoints = this.points()) { await this.ph.cdp.send('Input.dispatchTouchEvent', { type, touchPoints }); }
  async down(id, x, y) { this.active.set(id, { x, y }); await this.send('touchStart'); }
  async move(id, x, y) { const p = this.active.get(id); if (!p) return; p.x = x; p.y = y; await this.send('touchMove'); }
  // Chrome lifts exactly the fingers listed in a touchEnd (the others stay down)
  async up(id) { const p = this.active.get(id); if (!p) return; this.active.delete(id); await this.send('touchEnd', [{ x: p.x, y: p.y, id }]); }
  async tap(id, x, y) { await this.down(id, x, y); await this.up(id); }
}
export const layout = (page) => page.evaluate(() => { const l = window.__race.layout(); const b = {}; for (const k in l.btn) b[k] = { x: l.btn[k].x, y: l.btn[k].y, r: l.btn[k].r }; return { W: l.W, H: l.H, btn: b, mode: l.mode, stick: l.stick }; });

// Drive one phone for a while: the steering thumb holds the joystick and points it where the
// page's racing-line hint wants to go (screen direction = world direction: the camera never
// rotates), DRIFT is held in corners, BRAKE/REVERSE for hairpins and to get unstuck. One page round trip per tick (the
// hint and a little state), so the thumb reacts quickly. onTick(F, L, state) runs extra fingers;
// until(state) stops the loop.
export async function drive(ph, { until, maxMs = 60_000, onTick } = {}) {
  const F = ph.fingers || (ph.fingers = new Fingers(ph));
  const L = await layout(ph.page);
  const { cx, cy, r } = L.stick;
  let drifting = false, braking = false, heading = null, ticks = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const h = await ph.page.evaluate(() => {
      const r = window.__race, me = r.rc.me;
      const s = r.rc.phase === 'race' && r.rc.car ? r.hint() : { st: 0, th: 1, dr: 0, spd: 0, ha: null, rev: false };
      return { st: s.st, th: s.th, dr: s.dr, spd: s.spd, ha: s.ha ?? null, rev: !!s.rev, phase: r.rc.phase, tm: r.rc.latest ? r.rc.latest.tm : -9, rt: me?.rt || 0, it: me?.it ?? -1, fin: me?.fin || 0, lap: me?.lap || 0 };
    });
    ticks++;
    const brake = h.th < 0;
    if (brake !== braking) { braking = brake; if (brake) await F.down(5, L.btn.brake.x, L.btn.brake.y); else await F.up(5); }
    // the thumb lands on the stick, then slides to the rim in the hint's direction; it lets go to back off
    const want = h.ha == null || h.rev ? null : h.ha;
    if (want == null) { if (F.active.has(1)) { await F.up(1); heading = null; } }
    else if (!F.active.has(1)) { await F.down(1, cx, cy); heading = null; }
    if (want != null && (heading == null || Math.abs(Math.atan2(Math.sin(want - heading), Math.cos(want - heading))) > 0.03)) {
      heading = want; await F.move(1, cx + Math.cos(want) * r * 0.9, cy + Math.sin(want) * r * 0.9);
    }
    if (h.dr && !drifting && !brake) { drifting = true; await F.down(4, L.btn.drift.x, L.btn.drift.y); }
    else if ((!h.dr || brake) && drifting) { drifting = false; await F.up(4); }
    if (onTick) await onTick(F, L, h);
    if (until && until(h)) break;
    await ph.page.waitForTimeout(8);
  }
  if (drifting) await F.up(4);
  if (braking) await F.up(5);
  return ticks / ((Date.now() - t0) / 1000);
}

// the finish screen rows as shown: [place, name]
export const finishRows = (page) => page.evaluate(() => [...document.querySelectorAll('.rc-res .rlist li')].map((li) => [Number(li.querySelector('.r').textContent), li.childNodes[2]?.textContent?.trim() || li.textContent]));

export async function creditVisible(page) {
  const c = page.locator('.rc-credit');
  await expect(c).toHaveText('Made by Gleyde Technologies');
  await expect(c).toBeVisible();
  const ok = await page.evaluate(() => {
    const el = document.querySelector('.rc-credit'), r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    // inside the screen, opaque enough, and above every other race layer
    const others = [...document.querySelectorAll('.rc-root > *')].filter((e) => e !== el && getComputedStyle(e).display !== 'none');
    const z = (e) => Number(getComputedStyle(e).zIndex) || 0;
    return r.width > 50 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && r.top >= 0 && Number(cs.opacity) >= 0.6 && others.every((e) => z(e) < z(el));
  });
  expect(ok).toBe(true);
}

// Through the lobby like a player: pick a driver on the driver select, open RACE WITH FRIENDS,
// type the room code, pick mode / track / bots there (the host's choices count) and tap GO.
export async function lobbyJoinRoom(page, { room, driver, mode = 'grand', track = 'desert', bots = true }) {
  await page.waitForSelector('#playBtn');
  await page.tap('.nameplate #stage');
  await page.tap(`.dcard[data-b="${driver}"]`);
  await page.tap('.detail [data-sel]');
  await expect(page.locator('.detail')).toHaveCount(0);
  await page.tap('.ui-screen .back');
  await expect(page.locator('.ui-screen')).toHaveCount(0);
  await page.tap('#rail_friends');
  await page.fill('#room', room);
  await page.tap(`#roomModes [data-k="${mode}"]`);
  await page.tap(`#roomTracks [data-k="${track}"]`);
  if ((await page.getAttribute('#rfBots', 'aria-checked')) !== String(bots)) await page.tap('#rfBots');
  await expect(page.locator('#rfBots')).toHaveAttribute('aria-checked', String(bots));
  await page.tap('#roomPlay');
}

// CAMERA SAFE BOX: records where your own car is drawn, every frame, inside the page
export const watchCar = (page) => page.evaluate(() => {
  const W = (window.__carWatch = { n: 0, x0: 1, x1: 0, y0: 1, y1: 0, air: 0, back: 0, hud: [], sawDead: false });
  const tick = () => {
    const r = window.__race, s = r && r.carOnScreen && r.carOnScreen();
    if (s && r.rc.phase === 'race' && r.rc.latest && r.rc.latest.tm > 0) {
      const dead = !!(s.f & 32), fx = s.x / s.W, fy = s.y / s.H;
      if (!dead) {
        W.n++; W.x0 = Math.min(W.x0, fx); W.x1 = Math.max(W.x1, fx); W.y0 = Math.min(W.y0, fy); W.y1 = Math.max(W.y1, fy);
        if (s.f & 4) W.air++;
        if (W.sawDead) W.back++; // frames drawn after a wreck: the respawned car
        // never under the speedometer, the credit line or a thumb button
        const L = r.layout(), g = L.gauge;
        if (g && Math.hypot(s.x - g.x, s.y - g.y) < g.r) W.hud.push('speedometer');
        if (s.y > s.H - 18) W.hud.push('credit');
        for (const k of ['drift', 'fire', 'item', 'brake', 'reset']) { const b = L.btn[k]; if (L.mode === 'touch' && Math.hypot(s.x - b.x, s.y - b.y) < b.r) W.hud.push(k); }
        if (L.mode === 'touch' && Math.hypot(s.x - L.stick.cx, s.y - L.stick.cy) < L.stick.r) W.hud.push('joystick');
      }
      if (dead) W.sawDead = true;
    }
    if (window.__carWatch === W) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
export const carWatch = (page) => page.evaluate(() => ({ ...window.__carWatch, hud: [...new Set(window.__carWatch.hud)] }));

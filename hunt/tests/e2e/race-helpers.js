// Helpers for the Hunt Racers browser tests (tests/e2e/race-*.spec.js).
// Phones drive with REAL touch input through CDP (Input.dispatchTouchEvent): a steering thumb on
// the left, taps / holds on the right-hand buttons, several fingers at once by identifier. The page
// only supplies a steering hint (where the racing line is); the input path is the real one.
import { expect } from '@playwright/test';

export const roomCode = (p = 'E') => p + Math.random().toString(36).slice(2, 9).toUpperCase();
export const raceUrl = (o) => '/?race=1&' + new URLSearchParams({ lobby: '3', laps: '1', track: 'desert', mode: 'grand', ...o });

export async function phone(browser, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
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
export const layout = (page) => page.evaluate(() => { const l = window.__race.layout(); const b = {}; for (const k in l.btn) b[k] = { x: l.btn[k].x, y: l.btn[k].y, r: l.btn[k].r }; return { W: l.W, H: l.H, btn: b, mode: l.mode }; });

// Drive one phone for a while: the steering thumb follows the page's racing-line hint, DRIFT is
// held in corners, BRAKE/REVERSE for hairpins and to get unstuck. One page round trip per tick (the
// hint and a little state), so the thumb reacts quickly. onTick(F, L, state) runs extra fingers;
// until(state) stops the loop.
export async function drive(ph, { until, maxMs = 60_000, onTick } = {}) {
  const F = ph.fingers || (ph.fingers = new Fingers(ph));
  const L = await layout(ph.page);
  const sx = L.W * 0.2, sy = L.H * 0.72, M = Math.min(70, Math.max(40, L.W * 0.08));
  if (!F.active.has(1)) await F.down(1, sx, sy);
  let drifting = false, braking = false, steer = 0, ticks = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const h = await ph.page.evaluate(() => {
      const r = window.__race, me = r.rc.me;
      const s = r.rc.phase === 'race' && r.rc.car ? r.hint() : { st: 0, th: 1, dr: 0, spd: 0 };
      return { st: s.st, th: s.th, dr: s.dr, spd: s.spd, phase: r.rc.phase, tm: r.rc.latest ? r.rc.latest.tm : -9, rt: me?.rt || 0, it: me?.it ?? -1, fin: me?.fin || 0, lap: me?.lap || 0 };
    });
    ticks++;
    const brake = h.th < 0;
    if (brake !== braking) { braking = brake; if (brake) await F.down(5, L.btn.brake.x, L.btn.brake.y); else await F.up(5); }
    if (Math.abs(h.st - steer) > 0.04) { steer = h.st; await F.move(1, sx + steer * M * 0.9 + Math.sign(steer) * 0.08 * M, sy); }
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
  await expect(c).toHaveText('Created by Sam Eyde III');
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

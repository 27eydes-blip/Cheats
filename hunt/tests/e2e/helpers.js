import { test } from '@playwright/test';

// A failed request from the game's own server (a 404 asset, an /api 500). In the console it only
// shows up as "Failed to load resource", which the filter below has to drop because third-party
// fonts produce it too, so watch the responses themselves. `allow` (a RegExp tested against
// "404 GET /path") lets a test name the failures it causes on purpose.
export function trackHttp(page, errors, allow) {
  const origin = new URL(test.info().project.use.baseURL).origin;
  page.on('response', (r) => {
    if (r.status() < 400) return;
    const u = new URL(r.url());
    if (u.origin !== origin) return;
    const line = `${r.status()} ${r.request().method()} ${u.pathname}`; // no query: it can hold a token
    if (!allow || !allow.test(line)) errors.push('HTTP ' + line);
  });
  return errors;
}
export function trackErrors(page, { allowHttp } = {}) {
  const errors = [];
  trackHttp(page, errors, allowHttp);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if ((m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) || /frame error/.test(m.text())) errors.push(m.text()); });
  return errors;
}
export const G = (page, fn) => page.evaluate(fn);
export async function waitMe(page) { await page.waitForFunction(() => window.__hunt && window.__hunt.me, null, { timeout: 30_000 }); }
// Wait until the screen / popup / card entry animations are done. The check has to hold across a few
// animation frames: on a busy machine WebKit can report no animations for a moment right after a
// screen opens, before its entry animation is registered.
export const ENTRY_ANIMS = ['screen-in', 'pop-in', 'flip-in'];
export const waitSettled = async (page) => {
  await page.evaluate(() => { window.__settled = 0; });
  // polled once per animation frame: three frames in a row with no entry animation running
  await page.waitForFunction((names) => {
    const busy = document.getAnimations().some((a) => names.includes(a.animationName) && a.playState !== 'finished');
    window.__settled = busy ? 0 : window.__settled + 1;
    return window.__settled >= 3;
  }, ENTRY_ANIMS);
};
// Public races (LAUNCH from the lobby) of this browser context get their own matchmaker (dev-only
// ?mmpool, see src/race/room.js): two tests waiting in a bots-off public race at the same time
// would otherwise be matched together and start racing.
export const isolateRaces = (ctx) => ctx.addInitScript((pool) => {
  const WS = window.WebSocket;
  window.WebSocket = class extends WS { constructor(u, p) { super(/\/race\?/.test(String(u)) ? u + '&mmpool=' + pool : u, p); } };
}, Math.random().toString(36).slice(2, 12));

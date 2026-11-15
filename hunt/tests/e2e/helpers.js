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

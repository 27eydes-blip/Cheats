export function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return errors;
}
export const G = (page, fn) => page.evaluate(fn);
export async function waitMe(page) { await page.waitForFunction(() => window.__hunt && window.__hunt.me, null, { timeout: 30_000 }); }

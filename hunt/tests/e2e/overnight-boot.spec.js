// Never a black page: the loading splash, the boot watchdog, stale-version banner, guest-account
// bootstrap (retry, PLAY waits, "not saved" notice) and install-to-home-screen files.
import { test, expect } from '@playwright/test';
import { trackErrors, waitMe } from './helpers.js';

const CREDIT = 'Created by Sam Eyde III';
const END = () => { const G = window.__hunt; window.__huntMsg({ t: 'end', mode: G.modeKey, rank: 3, kills: 0, bounty: 0, winner: 'X', results: [['Me', G.brawler, 3, 0, 0, G.myId, 0, 0]] }); };
// forward a match socket, letting the test rewrite what the server says (a "newer server")
const rewriteWs = (page, rewrite) => page.routeWebSocket(/\/ws\?/, (ws) => {
  const server = ws.connectToServer();
  server.onMessage((msg) => { try { ws.send(JSON.stringify(rewrite(JSON.parse(msg)))); } catch { ws.send(msg); } });
  ws.onMessage((msg) => server.send(msg));
});
const wsUrls = (page) => { const urls = []; page.on('websocket', (ws) => urls.push(ws.url())); return urls; };

// ---------------------------------------------------------------- splash + watchdog (B1-1, B1-5)
test('a healthy boot shows the lobby and removes the splash', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.locator('#playBtn')).toBeVisible();
  await expect(page.locator('#splash')).toHaveCount(0);
  await expect(page.locator('#lobby #credit')).toBeVisible();
  await expect(page.locator('#notes .note:visible')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the splash is plain HTML: it shows (with the credit) while the game modules are still loading', async ({ page }) => {
  let release; const held = new Promise((r) => { release = r; });
  await page.route('**/weapons.js', async (r) => { await held; await r.continue(); });
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.locator('#splash .sp-word')).toHaveText('HUNT');
  await expect(page.locator('#splash .sp-credit')).toBeVisible();
  await expect(page.locator('#splash .sp-credit')).toHaveText(CREDIT);
  await expect(page.locator('#splash .sp-dots')).toBeVisible();
  await expect(page.locator('#splashFail')).toBeHidden();
  release();
  await expect(page.locator('#playBtn')).toBeVisible();
  await expect(page.locator('#splash')).toHaveCount(0);
});

for (const [what, broken] of [
  ['is missing (404)', { status: 404, contentType: 'text/plain', body: 'gone' }],
  ['comes from an older build (export mismatch)', { status: 200, contentType: 'text/javascript', body: 'export const OLD = 1;' }],
]) {
  test(`a module that ${what}: one automatic retry, then a reload panel with the credit; RELOAD recovers`, async ({ page }) => {
    let hits = 0;
    await page.route('**/power.js', (r) => { hits++; return r.fulfill(broken); });
    await page.goto('/', { waitUntil: 'commit' });
    await expect(page.locator('#splash.fail')).toBeVisible();
    await expect(page.locator('#splash .sp-title .sp-t-fail')).toBeVisible();
    await expect(page.locator('#splash .sp-title .sp-t-fail')).toHaveText('Could not load the game');
    await expect(page.locator('#splash .sp-title .sp-t-slow')).toBeHidden();
    await expect(page.locator('#splash .sp-hint .sp-t-fail')).toContainText('connection');
    await expect(page.locator('#splashReload')).toBeVisible();
    await expect(page.locator('#splash .sp-credit')).toBeVisible();
    await expect(page.locator('#splash .sp-credit')).toHaveText(CREDIT);
    expect(hits, 'the page reloaded itself once before asking').toBe(2);
    expect(page.url()).toMatch(/[?&]r=/);
    // the panel and the credit fit on a phone, in both orientations
    for (const vp of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(vp);
      for (const sel of ['#splash .sp-word', '#splash .sp-title', '#splashReload', '#splash .sp-credit']) {
        const b = await page.locator(sel).boundingBox();
        expect(b.x >= 0 && b.y >= 0 && b.x + b.width <= vp.width && b.y + b.height <= vp.height, `${sel} fits ${vp.width}x${vp.height}`).toBe(true);
      }
      const btn = await page.locator('#splashReload').boundingBox(), cr = await page.locator('#splash .sp-credit').boundingBox();
      expect(btn.y + btn.height, 'the button does not cover the credit').toBeLessThanOrEqual(cr.y);
      expect(btn.height).toBeGreaterThanOrEqual(48);
    }
    // the network is fine again: RELOAD brings the game up with a cache-busting address
    await page.unroute('**/power.js');
    const before = page.url();
    await page.click('#splashReload');
    await expect(page.locator('#playBtn')).toBeVisible();
    await expect(page.locator('#splash')).toHaveCount(0);
    expect(page.url()).not.toBe(before);
    expect(page.url()).toMatch(/[?&]r=/);
  });
}

test('a boot that takes over 10 seconds offers a reload, and still finishes by itself if the modules arrive', async ({ page }) => {
  await page.clock.install();
  let release; const held = new Promise((r) => { release = r; });
  await page.route('**/weapons.js', async (r) => { await held; await r.continue(); });
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.locator('#splash .sp-dots')).toBeVisible();
  await page.clock.runFor(9000);
  await expect(page.locator('#splashFail')).toBeHidden();
  await page.clock.runFor(1500);
  await expect(page.locator('#splash.slow')).toBeVisible();
  await expect(page.locator('#splash .sp-title .sp-t-slow')).toBeVisible();
  await expect(page.locator('#splash .sp-title .sp-t-slow')).toHaveText('Still loading…');
  await expect(page.locator('#splash .sp-title .sp-t-fail')).toBeHidden();
  await expect(page.locator('#splashReload')).toBeVisible();
  await expect(page.locator('#splash .sp-credit')).toHaveText(CREDIT);
  release();
  await page.clock.resume();
  await expect(page.locator('#playBtn')).toBeVisible();
  await expect(page.locator('#splash')).toHaveCount(0);
});

test('web fonts that never answer do not hold up the lobby', async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, () => {}); // hangs forever
  const t0 = Date.now();
  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.locator('#playBtn')).toBeVisible({ timeout: 8000 });
  expect(Date.now() - t0).toBeLessThan(8000);
  // text falls back to a system face rather than staying invisible
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('playBtn')).fontFamily)).toMatch(/Arial Black|system-ui/);
});

// ---------------------------------------------------------------- stale client (B1-3)
test('the server reports its build id over HTTP and in the welcome message', async ({ page, request }) => {
  const r = await request.get('/api/version');
  expect(r.ok()).toBe(true);
  expect(r.headers()['cache-control']).toContain('no-store');
  const { version } = await r.json();
  expect(version).toBeTruthy();
  let welcome = null;
  page.on('websocket', (ws) => ws.on('framereceived', (f) => { try { const m = JSON.parse(f.payload); if (m.t === 'welcome') welcome = m; } catch {} }));
  await page.goto('/?world=meadow&mode=bounty');
  await waitMe(page);
  expect(welcome.v).toBe(version);
  await expect(page.locator('#updateNote')).toBeHidden();
});

test('a newer server build shows "New version ready" in the lobby; RELOAD reloads once and does not nag again', async ({ page }) => {
  const errors = trackErrors(page);
  await page.route('**/api/version', (r) => r.fulfill({ json: { version: 'next-build' } }));
  await page.goto('/');
  await expect(page.locator('#updateNote')).toBeVisible();
  await expect(page.locator('#updateNote')).toContainText('New version ready');
  await expect(page.locator('#lobby #credit')).toBeVisible();
  // the banner covers neither PLAY nor the credit
  const n = await page.locator('#updateNote').boundingBox();
  for (const sel of ['#playBtn', '#lobby #credit']) {
    const b = await page.locator(sel).boundingBox();
    expect(n.x + n.width <= b.x || b.x + b.width <= n.x || n.y + n.height <= b.y || b.y + b.height <= n.y, `banner clear of ${sel}`).toBe(true);
  }
  await page.click('#updateBtn');
  await page.waitForURL(/[?&]r=/);
  await expect(page.locator('#playBtn')).toBeVisible();
  // still "different" after the reload (as on a slow rollout): no endless prompt
  await page.waitForTimeout(500);
  await expect(page.locator('#updateNote')).toBeHidden();
  expect(errors).toEqual([]);
});

test('a deploy while the page is open: the next match join goes back to the lobby with the reload banner', async ({ page }) => {
  const errors = trackErrors(page);
  await rewriteWs(page, (m) => { if (m.t === 'welcome') m.v = 'next-build'; return m; });
  await page.goto('/');
  await expect(page.locator('#updateNote')).toBeHidden();
  await page.click('#playBtn');
  await expect(page.locator('#updateNote')).toBeVisible();
  await expect(page.locator('#playBtn')).toBeVisible();
  expect(await page.evaluate(() => window.__hunt.phase)).toBe('menu');
  expect(errors).toEqual([]);
});

test('a version change seen during a match waits: no banner over the game, it shows back in the lobby', async ({ page }) => {
  const errors = trackErrors(page);
  let version = 'dev';
  await page.route('**/api/version', async (r) => { if (version === 'dev') await r.continue(); else await r.fulfill({ json: { version } }); });
  await page.goto('/?world=meadow&mode=bounty');
  await waitMe(page);
  version = 'next-build';
  await page.evaluate(() => window.__huntMsg({ t: 'welcome', rejoin: 1, id: window.__hunt.myId, v: 'next-build', mode: window.__hunt.modeKey, world: window.__hunt.world }));
  expect(await page.evaluate(() => window.__hunt.phase)).toBe('play');
  await expect(page.locator('#updateNote')).toBeHidden(); // never over a running match
  await expect(page.locator('#creditGame')).toBeVisible();
  await page.evaluate(END);
  await page.click('#rsLobby');
  await expect(page.locator('#updateNote')).toBeVisible();
  expect(errors).toEqual([]);
});

test('ids from a newer server (hunter, mode) never break the match', async ({ page }) => {
  const errors = trackErrors(page);
  await rewriteWs(page, (m) => {
    if (m.t === 'ro' && m.add) for (const k of Object.keys(m.add)) if (Array.isArray(m.add[k])) m.add[k][1] = 'hunter_from_the_future';
    if (m.t === 'start' || m.t === 'lobby') m.mode = 'mode_from_the_future';
    return m;
  });
  await page.goto('/?world=meadow&mode=bounty');
  await waitMe(page);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__hunt.view.others.length)).toBeGreaterThan(0);
  await page.evaluate(() => { const G = window.__hunt; window.__huntMsg({ t: 'end', mode: 'mode_from_the_future', rank: 1, kills: 0, bounty: 0, winner: 'Me', results: [['Me', G.brawler, 1, 0, 0, G.myId, 0, 0]] }); });
  await expect(page.locator('#rsRank')).toBeVisible();
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------- guest account (B1-2, B1-4)
test('a failed first guest request is retried: the notice shows, then clears, and the match carries the account', async ({ page }) => {
  const errors = trackErrors(page);
  const urls = wsUrls(page);
  let calls = 0, fail = true;
  await page.route('**/api/guest', (r) => { calls++; return fail ? r.abort('internetdisconnected') : r.continue(); });
  await page.goto('/');
  await expect(page.locator('#saveNote')).toBeVisible();
  await expect(page.locator('#saveNote')).toHaveText('Progress will not be saved right now');
  await expect(page.locator('#playBtn')).toBeVisible();
  await expect.poll(() => calls, { timeout: 8000 }).toBeGreaterThanOrEqual(2); // it keeps trying by itself
  fail = false;
  await expect(page.locator('#saveNote')).toBeHidden({ timeout: 15000 });
  expect(await page.evaluate(() => localStorage.getItem('hunt-token'))).toBeTruthy();
  await page.click('#playBtn');
  await expect.poll(() => urls.find((u) => u.includes('/ws?'))).toBeTruthy();
  expect(urls.find((u) => u.includes('/ws?'))).toContain('token=');
  expect(errors).toEqual([]);
});

test('PLAY pressed before the guest account exists waits for it ("Getting ready…"), so the first match is recorded', async ({ page }) => {
  const errors = trackErrors(page);
  const urls = wsUrls(page);
  // the account request is held until PLAY has been seen waiting (a fixed delay can run out before
  // a slow browser even gets to the click)
  let release; const held = new Promise((ok) => { release = ok; });
  await page.route('**/api/guest', async (r) => { await held; await r.continue(); });
  await page.goto('/');
  await page.click('#playBtn');
  await expect(page.locator('#playBtn')).toHaveText('Getting ready…');
  expect(urls.filter((u) => u.includes('/ws?'))).toEqual([]); // not joined yet
  release();
  await expect.poll(() => urls.find((u) => u.includes('/ws?')), { timeout: 8000 }).toBeTruthy();
  expect(urls.find((u) => u.includes('/ws?'))).toContain('token=');
  expect(urls.filter((u) => u.includes('/ws?')).length).toBe(1);
  await expect(page.locator('#saveNote')).toBeHidden();
  expect(errors).toEqual([]);
});

test('accounts unreachable: PLAY lets the player in after a short wait, and both lobby and results say it is not saved', async ({ page }) => {
  const urls = wsUrls(page);
  await page.route('**/api/guest', (r) => r.fulfill({ status: 503, json: { error: 'Accounts are not set up' } }));
  await page.route('**/api/me', (r) => r.fulfill({ status: 503, json: { error: 'Accounts are not set up' } }));
  await page.goto('/');
  await expect(page.locator('#saveNote')).toBeVisible();
  const t0 = Date.now();
  await page.click('#playBtn');
  await expect.poll(() => urls.find((u) => u.includes('/ws?')), { timeout: 8000 }).toBeTruthy();
  expect(Date.now() - t0).toBeLessThan(6000);
  expect(urls.find((u) => u.includes('/ws?'))).not.toContain('token=');
  await expect(page.locator('#playBtn')).toHaveText('PLAY');
  await page.waitForFunction(() => window.__hunt.myId);
  await page.evaluate(END);
  await expect(page.locator('#rsTro')).toHaveText('Not saved');
  await page.click('#rsLobby');
  await expect(page.locator('#saveNote')).toBeVisible();
});

// ---------------------------------------------------------------- install to home screen (B1-6)
test('manifest, icons and iOS tags are served for installing to the home screen', async ({ page, request }) => {
  const m = await request.get('/manifest.webmanifest');
  expect(m.ok()).toBe(true);
  expect(m.headers()['content-type']).toContain('application/manifest+json');
  const man = await m.json();
  expect(man).toMatchObject({ name: 'Hunt', display: 'fullscreen', orientation: 'landscape' });
  for (const i of man.icons) {
    const r = await request.get('/' + i.src);
    expect(r.ok(), i.src).toBe(true);
    expect(r.headers()['content-type']).toContain('image/png');
  }
  await page.goto('/');
  expect(await page.getAttribute('link[rel="manifest"]', 'href')).toBe('manifest.webmanifest');
  const touch = await page.getAttribute('link[rel="apple-touch-icon"]', 'href');
  expect((await request.get('/' + touch)).ok()).toBe(true);
  expect(await page.getAttribute('meta[name="apple-mobile-web-app-capable"]', 'content')).toBe('yes');
  expect(await page.getAttribute('meta[name="apple-mobile-web-app-title"]', 'content')).toBe('Hunt');
});

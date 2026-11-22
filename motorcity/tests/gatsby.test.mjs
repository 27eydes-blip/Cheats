// The Gatsby (iPhone 13 portrait): garage listing, unlock by winning every cup, purchase, fixed paint,
// deep horn, gold sparkles on boost, Legendary stats. Usage: npm run build && node tests/gatsby.test.mjs [--shots]
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', 'dist');
const out = join(here, 'out');
const shots = process.argv.includes('--shots');
await mkdir(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try { const b = await readFile(join(root, p)); res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('nf'); }
}).listen(0);
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
let failures = 0;
const check = (ok, msg, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}${detail ? ' — ' + detail : ''}`); if (!ok) failures++; };
const boot = async () => { await page.goto(url); await page.waitForFunction(() => !!window.__mc); await page.waitForTimeout(300); };

await boot();
await page.evaluate(() => localStorage.clear());
await boot();

// garage listing
await page.evaluate(() => window.__mc.screens.garage('cars', 'gatsby'));
await page.waitForTimeout(300);
const body = await page.textContent('body');
check(body.includes('Gatsby — Legendary'), 'garage shows "Gatsby — Legendary"');
check(/25,000/.test(body), 'big coin price shown', (body.match(/Buy for [\d,]+ coins/) ?? [''])[0]);
check(/win every career cup/i.test(body), 'garage explains it can be won by winning every cup');
if (shots) await page.screenshot({ path: join(out, 'gatsby-garage.png') });

// stats: legendary top speed, slightly weaker handling than the top cars

// unlock by winning every cup (save from a finished career), on load
await page.evaluate(() => {
  const s = JSON.parse(JSON.stringify(window.__mc.app.save)); // a real, versioned save
  s.cups = { detroit: { results: [1], points: 30, done: true, best: 1 }, motor: { results: [1], points: 30, done: true, best: 1 }, empire: { results: [1], points: 30, done: true, best: 1 }, grandprix: { results: [1], points: 30, done: true, best: 1 } };
  localStorage.setItem('motorcity1915.save', JSON.stringify(s));
});
await boot();
const owned = await page.evaluate(() => window.__mc.app.save.owned.includes('gatsby'));
check(owned, 'winning every cup unlocks the Gatsby');

// not unlocked with one cup short; buyable instead
await page.evaluate(() => {
  const s = JSON.parse(JSON.stringify(window.__mc.app.save));
  s.owned = ['runabout']; s.car = 'runabout'; s.cups.grandprix.best = 2; s.coins = 30000;
  localStorage.setItem('motorcity1915.save', JSON.stringify(s));
});
await boot();
const notYet = await page.evaluate(() => window.__mc.app.save.owned.includes('gatsby'));
check(!notYet, 'one cup short: not unlocked');
await page.evaluate(() => window.__mc.screens.garage('cars', 'gatsby'));
await page.waitForTimeout(200);
await page.locator('button', { hasText: 'Buy for 25,000 coins' }).click();
await page.waitForTimeout(300);
const bought = await page.evaluate(() => ({ owned: window.__mc.app.save.owned.includes('gatsby'), car: window.__mc.app.save.car, coins: window.__mc.app.save.coins }));
check(bought.owned && bought.car === 'gatsby' && bought.coins === 5000, 'can be bought for 25,000 coins', JSON.stringify(bought));
await page.locator('button', { hasText: 'Paint' }).click();
await page.waitForTimeout(200);
check((await page.textContent('body')).includes('comes only in its own rich cream-yellow'), 'paint is fixed cream-yellow');

// in a race: deep horn, gold sparkles on boost, stays yellow in the sepia world
const race = await page.evaluate(async () => {
  const { app, screens } = window.__mc; screens.clear();
  const calls = [];
  const audio = window.__mc.audio;
  const orig = { horn: audio.horn, hornDeep: audio.hornDeep };
  audio.horn = () => calls.push('horn'); audio.hornDeep = () => calls.push('hornDeep');
  app.startRace({ track: window.__mc.tracks('woodward'), weather: 'clear', mode: 'quick', car: 'gatsby', paint: app.paintHex('gatsby'), upgrades: {}, rivals: 3, difficulty: 1, laps: 3 }, () => {});
  const r = app.race; r.countdown = 0.01;
  await new Promise((res) => setTimeout(res, 600));
  r.horn();
  r.player.boost = 3; r.player.speed = r.player.stats.top * 0.9;
  await new Promise((res) => setTimeout(res, 50));
  r.player.ev.push('boost'); r.player.boostT = 1.7;
  await new Promise((res) => setTimeout(res, 350));
  const gold = r.parts.filter((q) => ['#ffd860', '#fff2b0', '#e8b830', '#fffbe0'].includes(q.tone)).length;
  Object.assign(audio, orig);
  return { calls, gold, topMph: r.player.stats.top / 120 };
});
check(race.calls.includes('hornDeep') && !race.calls.includes('horn'), 'Gatsby uses the deep two-tone horn', race.calls.join(','));
check(race.gold > 10, 'gold sparkles while boosting', `${race.gold} gold particles`);
check(race.topMph >= 98, 'highest top speed of any car', `${race.topMph} mph`);
if (shots) { await page.waitForTimeout(150); await page.screenshot({ path: join(out, 'gatsby-race.png') }); }
await page.evaluate(() => window.__mc.app.endRace());

const credits = await page.evaluate(() => { window.__mc.screens.title(); return document.body.textContent; });
check(credits.includes('Gleyde Technologies, LLC') && credits.includes('Created by Sam Eyde III'), 'credits intact');
check(errors.length === 0, 'no page errors', errors.join(' | '));
await browser.close();
server.close();
if (failures) { console.error(`${failures} Gatsby check(s) failed`); process.exit(1); }
console.log('gatsby OK');

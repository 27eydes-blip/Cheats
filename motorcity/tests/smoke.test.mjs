// Smoke test: boots the built game in phone (portrait + landscape) and desktop viewports,
// starts a race, drives it, and checks for console errors and the credits.
// Usage: npm run build && node tests/smoke.test.mjs [--shots]
import { createRequire } from 'node:module';
const { chromium, devices } = createRequire(import.meta.url)('playwright');
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const out = join(dirname(fileURLToPath(import.meta.url)), 'out');
const shots = process.argv.includes('--shots');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
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
let failures = 0;
const fail = (m) => { failures++; console.error('FAIL', m); };

async function run(name, ctxOpts, fn) {
  if (only && !name.includes(only)) return;
  const ctx = await browser.newContext({ ...ctxOpts, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|net::/.test(m.text())) errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => !!window.__mc, null, { timeout: 15000 });
  try { await fn(page); } catch (e) { fail(`${name}: ${e.message}`); }
  if (errors.length) fail(`${name}: console errors:\n  ${errors.join('\n  ')}`);
  await ctx.close();
}

const snap = async (page, n) => { if (shots) await page.screenshot({ path: join(out, `${n}.png`) }); };

async function race(page, name) {
  const text = await page.textContent('body');
  if (!text.includes('Gleyde Technologies, LLC') || !text.includes('Created by Sam Eyde III') || !text.includes('Juwon Shon, COO')) fail(`${name}: credits missing on title`);
  await page.waitForTimeout(800);
  await snap(page, `${name}-title`);
  await page.evaluate(() => window.__mc.screens.quick());
  await page.waitForTimeout(4500);
  await snap(page, `${name}-start`);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(700); await snap(page, `${name}-steer`); await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowLeft'); await page.keyboard.down('Space'); await page.waitForTimeout(900); await snap(page, `${name}-drift`);
  await page.keyboard.up('ArrowLeft'); await page.keyboard.up('Space');
  await page.keyboard.press('KeyH'); await page.waitForTimeout(500); await snap(page, `${name}-horn`);
  await page.waitForTimeout(4000); await snap(page, `${name}-race`);
  const st = await page.evaluate(() => { const r = window.__mc.app.race; return r && { z: r.player.z, v: r.player.speed, state: r.state, fps: 0 }; });
  if (!st || st.v < 1000) fail(`${name}: car not moving ${JSON.stringify(st)}`);
}

await run('phone-portrait', { ...devices['iPhone 13'], isMobile: true, hasTouch: true }, (p) => race(p, 'phone-portrait'));
await run('phone-landscape', { ...devices['iPhone 13 landscape'], isMobile: true, hasTouch: true }, (p) => race(p, 'phone-landscape'));
await run('desktop', { viewport: { width: 1280, height: 720 } }, (p) => race(p, 'desktop'));

const clickText = async (page, t) => { await page.locator('button, .tile', { hasText: t }).first().click(); await page.waitForTimeout(350); };
const finishRace = async (page) => {
  await page.waitForFunction(() => window.__mc.app.race && window.__mc.app.race.state === 'racing', null, { timeout: 8000 });
  await page.evaluate(() => { const r = window.__mc.app.race; r.lap = r.laps; r.player.z = r.track.length - 300; r.player.speed = 9000; });
  await page.waitForFunction(() => !window.__mc.app.race, null, { timeout: 12000 });
  await page.waitForTimeout(900);
};
async function flow(page, name) {
  await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForFunction(() => !!window.__mc);
  await page.waitForTimeout(500);
  await clickText(page, 'Career');
  await snap(page, `${name}-howto`); await clickText(page, 'Onward');
  await snap(page, `${name}-career`); await clickText(page, 'The Detroit Cup');
  await snap(page, `${name}-cup`); await clickText(page, 'Begin');
  await snap(page, `${name}-chapter`);
  if (!(await page.textContent('body')).includes('CHAPTER I')) fail(`${name}: no chapter card`);
  await page.click('.screen'); await page.waitForTimeout(300);
  await finishRace(page);
  await snap(page, `${name}-results`);
  const body = await page.textContent('body');
  if (!body.includes('Gleyde Technologies, LLC') || !body.includes('Created by Sam Eyde III') || !body.includes('Juwon Shon, COO')) fail(`${name}: credits missing on results`);
  if (!/coins/.test(body)) fail(`${name}: no coins on results`);
  const coins = await page.evaluate(() => window.__mc.app.save.coins);
  if (coins <= 250) fail(`${name}: no coins earned (${coins})`);
  await clickText(page, 'Next Chapter'); await snap(page, `${name}-chapter2`);
  if (!(await page.textContent('body')).includes('CHAPTER II')) fail(`${name}: chapter II missing`);
  // pause menu during a race
  await page.click('.screen'); await page.waitForTimeout(1500);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400); await snap(page, `${name}-pause`);
  if (!(await page.textContent('body')).includes('Intermission')) fail(`${name}: pause menu missing`);
  await clickText(page, 'Quit Race');
  // garage: buy and tune
  await page.evaluate(() => { window.__mc.app.save.coins = 5000; });
  await clickText(page, 'Garage'); await clickText(page, 'Stutz Bearcat'); await snap(page, `${name}-garage`);
  await clickText(page, 'Buy for'); await clickText(page, 'Tuning'); await clickText(page, '300c'); await clickText(page, 'Paint'); await snap(page, `${name}-paint`);
  const sv = await page.evaluate(() => JSON.parse(localStorage.getItem('motorcity1915.save')));
  if (!sv.owned.includes('stutz') || sv.upgrades.stutz?.engine !== 1) fail(`${name}: purchase not saved ${JSON.stringify(sv.owned)}`);
  await page.click('.back'); await page.waitForTimeout(300);
  // settings
  await clickText(page, 'Settings'); await snap(page, `${name}-settings`); await page.click('.back'); await page.waitForTimeout(300);
  // time trial
  await clickText(page, 'Time Trial'); await snap(page, `${name}-trial`); await clickText(page, 'Woodward');
  await finishRace(page); await snap(page, `${name}-trialresult`);
  if (!(await page.textContent('body')).includes('Record')) fail(`${name}: trial result missing`);
  // reload keeps progress
  await page.reload(); await page.waitForFunction(() => !!window.__mc);
  const car = await page.evaluate(() => window.__mc.app.save.car);
  if (car !== 'stutz') fail(`${name}: save not restored (${car})`);
}
await run('flow-portrait', { ...devices['iPhone 13'], isMobile: true, hasTouch: true }, (p) => flow(p, 'flow-portrait'));
await run('flow-landscape', { ...devices['iPhone 13 landscape'], isMobile: true, hasTouch: true }, (p) => flow(p, 'flow-landscape'));

await browser.close();
server.close();
if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log('smoke OK');

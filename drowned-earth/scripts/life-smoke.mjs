// Plays whole lives through the life-sim UI with random choices (phone viewport)
// and fails on console errors.  node scripts/life-smoke.mjs [lives=3] [shotPrefix]
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('playwright')); }
const lives = +(process.argv[2] || 3), shot = process.argv[3];
const server = await createServer({ server: { port: 5195, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e.stack || e)));
await page.goto(server.resolvedUrls.local[0] + '?life=1&quality=low');
await page.waitForFunction(() => window.__game?.ctx.lifeUI?.visible, null, { timeout: 120000 });
if (shot) await page.screenshot({ path: `${shot}-create.png` });
const stats = [];
for (let n = 0; n < lives; n++) {
  const r = await page.evaluate(async ({ n, shot }) => {
    const g = window.__game, ui = g.ctx.lifeUI, L = g.ctx.life;
    const q = (s) => ui.root.querySelector(s);
    const pickRandom = (sel) => { const all = [...ui.root.querySelectorAll(sel)]; return all[Math.floor(Math.random() * all.length)]; };
    if (!L.s || !L.alive) { q('[data-birth]') && pickRandom('[data-birth]').click(); q('[data-go]')?.click(); }
    let cards = 0, scenes = 0, guard = 0;
    while (L.alive && guard++ < 140) {
      // a few actions most years
      if (Math.random() < 0.5 && !g.ctx.scenarios.active) { ui.tab = ['people', 'work', 'do'][Math.floor(Math.random() * 3)]; ui.render(); const b = pickRandom('.life-body button:not([data-do="sea"])'); b?.click(); }
      q('[data-age]')?.click();
      for (let k = 0; k < 6; k++) {
        const c = pickRandom('[data-c]'); if (c) { cards++; c.click(); continue; }
        const a = q('[data-auto]'); if (a) { a.click(); continue; }
        const s = q('[data-skip]'); if (s && !s.closest('.scene-banner')) { scenes++; s.click(); continue; }
        const o = q('[data-ok]'); if (o) { o.click(); continue; }
        break;
      }
    }
    return { age: L.s.age, alive: L.alive, cause: L.s.cause, cards, scenes, log: L.s.log.length, gen: L.s.generation };
  }, { n, shot });
  stats.push(r);
  console.log('life', n, JSON.stringify(r));
  if (shot && n === 0) await page.screenshot({ path: `${shot}-death.png` });
  await page.waitForTimeout(1000);
  await page.evaluate(() => { const ui = window.__game.ctx.lifeUI; const c = ui.root.querySelector('[data-child]') || ui.root.querySelector('[data-new]'); c?.click(); if (ui.root.querySelector('[data-go]')) ui.root.querySelector('[data-go]').click(); });
}
if (shot) { await page.evaluate(() => { const c = window.__game.ctx; if (c.scenarios.active) c.scenarios.finish('success'); }); await page.waitForTimeout(2500);
  await page.evaluate(() => { const ui = window.__game.ctx.lifeUI; for (let i = 0; i < 12; i++) window.__game.ctx.life.ageUp(); ui.root.querySelectorAll('.life-card-wrap').forEach((n) => n.remove()); ui.card = null; ui.tab = 'log'; ui.render(); }); await page.screenshot({ path: `${shot}-main.png` });
  await page.evaluate(() => { const ui = window.__game.ctx.lifeUI; const ev = window.__game.ctx.data.life.events.find((e) => e.id === 'a_festival'); ui.showCard(ev); }); await page.screenshot({ path: `${shot}-card.png` }); }
await browser.close(); await server.close();
if (errors.length) { console.log('ERRORS:\n' + [...new Set(errors)].slice(0, 20).join('\n')); process.exit(1); }
console.log('life smoke ok');

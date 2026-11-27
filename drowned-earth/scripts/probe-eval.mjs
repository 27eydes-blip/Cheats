// node scripts/probe-eval.mjs "<params>" "<js expression evaluated with g = window.__game>"
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const server = await createServer({ server: { port: 5196, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type(), m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.goto(server.resolvedUrls.local[0] + '?' + process.argv[2]);
await page.waitForFunction(() => window.__game?.frame > 8, null, { timeout: 120000 });
const r = await page.evaluate((src) => { const g = window.__game; return JSON.stringify((0, eval)(src)); }, `(()=>{ const g = window.__game; ${process.argv[3]} })()`);
console.log(r);
if (process.argv[4]) { await page.evaluate(() => new Promise((res) => { let n = 0; const t = () => (++n > 4 ? res() : requestAnimationFrame(t)); t(); })); await page.screenshot({ path: process.argv[4] }); }
await browser.close(); await server.close();

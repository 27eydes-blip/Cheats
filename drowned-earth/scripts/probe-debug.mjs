// node scripts/probe-debug.mjs "<params>" "<js>"  — like probe-eval but waits only for boot, so it works when the frame loop throws
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const server = await createServer({ server: { port: 5197, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.goto(server.resolvedUrls.local[0] + '?' + process.argv[2]);
await page.waitForFunction(() => window.__game?.ctx?.camera && window.__game.running, null, { timeout: 180000 });
console.log(await page.evaluate((src) => JSON.stringify((0, eval)(`(()=>{ const g = window.__game; ${src} })()`)), process.argv[3]));
await browser.close(); await server.close();

// Debug probe: node scripts/probe.mjs "<url params>" [waitMs] [screenshot.png]
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
process.chdir('/workspace/Cheats/drowned-earth');
const server = await createServer({ root: '/workspace/Cheats/drowned-earth', server: { port: 5198 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
page.on('console', (m) => console.log(m.type(), m.text().slice(0, 300)));
page.on('pageerror', (e) => console.log('PAGEERR', e.message, e.stack?.slice(0, 500)));
await page.goto(server.resolvedUrls.local[0] + '?' + process.argv[2]);
await page.waitForTimeout(parseInt(process.argv[3] || '15000'));
console.log(await page.evaluate(() => window.__game ? 'frame ' + window.__game.frame : 'no game'));
if (process.argv[4]) await page.screenshot({ path: process.argv[4] });
await browser.close(); await server.close();

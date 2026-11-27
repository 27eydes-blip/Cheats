// Headless screenshot + console-error pass.  npm run test:shots
// Starts a Vite dev server, opens a set of scripted viewpoints in Chromium,
// waits for streaming to settle, saves PNGs to shots/, and fails on errors.
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('playwright')); }
import fs from 'node:fs';

const SHOTS = JSON.parse(fs.readFileSync(new URL('./shots.json', import.meta.url)));
const only = process.argv[2];
const server = await createServer({ server: { port: 5199, strictPort: false, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
fs.mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failures = 0;
for (const shot of SHOTS) {
  if (only && !shot.name.includes(only)) continue;
  // VIEW=1920x1080 overrides the viewport; DSF sets the device pixel ratio
  // (phone: VIEW=412x915 DSF=2.625 → 1081×2402); QUALITY forces a preset.
  const [vw, vh] = (process.env.VIEW || '').split('x').map(Number);
  const viewport = vw ? { width: vw, height: vh } : shot.viewport || { width: 1280, height: 720 };
  const page = await browser.newPage({ viewport, deviceScaleFactor: +(process.env.DSF || 1), isMobile: !!process.env.MOBILE, hasTouch: !!process.env.MOBILE });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning' && process.env.WARN) console.log('  warn:', m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const params = { dynres: '0', ...(shot.title ? { freeze: '1' } : { skipintro: '1', freeze: '1' }), ...shot.params };
  if (process.env.QUALITY) params.quality = process.env.QUALITY;
  const q = new URLSearchParams(params).toString();
  await page.goto(`${url}?${q}`);
  await page.waitForFunction(() => window.__game && window.__game.frame > 5, null, { timeout: 300000 });
  // let chunks stream in and the pipeline settle
  await page.evaluate(async (frames) => {
    const g = window.__game;
    const start = g.frame;
    await new Promise((res) => { const t = () => (g.frame - start > frames ? res() : requestAnimationFrame(t)); t(); });
  }, process.env.FRAMES ? +process.env.FRAMES : shot.frames || 40);
  if (shot.eval) await page.evaluate(shot.eval);
  if (shot.eval) await page.waitForTimeout(shot.wait || 1500);
  // freeze the loop so the capture isn't racing a slow software-rendered frame
  await page.evaluate(() => { const g = window.__game; g.ctx.renderer.setAnimationLoop(null); g.render(0); });
  await page.screenshot({ path: `shots/${shot.name}.png`, timeout: 600000 });
  if (process.env.OUT) { fs.mkdirSync(process.env.OUT, { recursive: true }); fs.copyFileSync(`shots/${shot.name}.png`, `${process.env.OUT}/${shot.name}.png`); }
  const info = await page.evaluate(() => { const g = window.__game; const r = g.ctx.renderer.info; return { fps: g.fps.toFixed(1), calls: r.render.calls, tris: r.render.triangles, chunks: g.ctx.chunks.stats.loaded }; });
  console.log(`${shot.name}: ${JSON.stringify(info)}${errors.length ? ' ERRORS:\n  ' + errors.join('\n  ') : ''}`);
  if (errors.length) failures++;
  await page.close();
}
await browser.close();
await server.close();
process.exit(failures ? 1 : 0);

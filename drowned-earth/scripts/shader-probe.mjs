// node scripts/shader-probe.mjs [quality] — boats from the start toward Cask Street and reports whether
// shader programs get (re)compiled on the way: that's what froze the game on laptop GPUs.
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const q = process.argv[2] || 'low';
const server = await createServer({ server: { port: 5192, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 480, height: 270 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(server.resolvedUrls.local[0] + `?quality=${q}&skipintro&agegate=off`);
await p.waitForFunction(() => window.__game?.frame > 5, null, { timeout: 300000 });
const r = await p.evaluate(async (dest) => {
  const g = window.__game, c = g.ctx; c.renderer.setAnimationLoop(null);
  const progs = () => c.renderer.info.programs.length;
  const lights = () => { let n = 0; c.scene.traverseVisible((o) => { if (o.isLight && o.layers.test(c.camera.layers)) n++; }); return n; };
  g.render(1 / 30); const p0 = progs(), l0 = lights();
  c.player.mode = 'boat'; c.boat.tied = false;
  const from = c.boat.pos.clone(), log = [];
  const N = 120;
  for (let i = 0; i <= N; i++) {
    const k = i / N; c.boat.pos.set(from.x + (dest[0] - from.x) * k, c.boat.pos.y, from.z + (dest[1] - from.z) * k);
    g.update(1 / 30);
    if (i % 4 === 0) { const before = progs(); const t = performance.now(); g.render(1 / 30); const ms = performance.now() - t; const after = progs(); if (after > before) log.push({ step: i, newPrograms: after - before, ms: Math.round(ms) }); }
    c.input.endFrame();
    if (i % 10 === 0) await new Promise((res) => setTimeout(res, 0));
  }
  return { start: { programs: p0, lights: l0 }, end: { programs: progs(), lights: lights() }, compilesOnTheWay: log, poolSize: c.lightPool?.pool.length, virtualLights: c.lightPool?.list.length };
}, [48, 70]);
console.log(JSON.stringify(r, null, 1)); if (errs.length) console.log('ERRORS', errs.slice(0, 3));
await b.close(); await server.close();

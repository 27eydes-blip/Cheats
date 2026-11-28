// node scripts/drive-probe.mjs [quality] — drives the boat across the bay and reports the worst
// frame spikes (update vs render) and what streamed in on those frames.
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const q = process.argv[2] || 'low';
const server = await createServer({ server: { port: 5193, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(server.resolvedUrls.local[0] + `?quality=${q}&skipintro&agegate=off`);
await p.waitForFunction(() => window.__game?.frame > 20, null, { timeout: 300000 });
const r = await p.evaluate(async () => {
  const g = window.__game, c = g.ctx; c.renderer.setAnimationLoop(null);
  const ev = []; c.events.on('landmark:loaded', (x) => ev.push('L:' + x.def.id)); c.events.on('chunk:built', (x) => ev.push('C'));
  // board the boat and drive: hold throttle, steer gently
  c.player.mode = 'boat'; c.boat.tied = false; c.boat.engineOff = false; c.boat.fuel = c.boat.fuelMax;
  const frames = []; const V = c.player.position.constructor;
  const start = c.boat.pos.clone();
  for (let i = 0; i < 900; i++) {
    c.input.move.y = 1; c.input.move.x = Math.sin(i / 120) * 0.3;
    c.boat.boostLeft = 0;
    const n0 = ev.length;
    let t = performance.now(); g.update(1 / 30); const u = performance.now() - t;
    t = performance.now(); g.render(1 / 30); const rd = performance.now() - t;
    frames.push({ i, u, rd, ev: ev.slice(n0).reduce((a, x) => (x === 'C' ? (a.c++, a) : (a.l.push(x), a)), { c: 0, l: [] }) });
    c.input.endFrame();
    if (i % 15 === 0) await new Promise((res) => setTimeout(res, 0));
  }
  const med = (k) => { const a = frames.map((f) => f[k]).sort((x, y) => x - y); return +a[Math.floor(a.length / 2)].toFixed(1); };
  const worst = [...frames].sort((a, b) => b.u + b.rd - (a.u + a.rd)).slice(0, 8).map((f) => ({ i: f.i, update: +f.u.toFixed(0), render: +f.rd.toFixed(0), chunks: f.ev.c, landmarks: f.ev.l.join(' ') }));
  return { travelled: Math.round(c.boat.pos.distanceTo(start)), medianUpdate: med('u'), medianRender: med('rd'), worst, boatY: +c.boat.pos.y.toFixed(2), waterY: +c.waves.height(c.boat.pos.x, c.boat.pos.z).toFixed(2) };
});
console.log(JSON.stringify(r, null, 1)); if (errs.length) console.log('ERRORS', errs.slice(0, 3));
await b.close(); await server.close();

// node scripts/perf-probe.mjs [quality] — per-frame cost breakdown: draw calls, triangles,
// JS update time per system, and render time (render time is inflated: this box renders on the CPU).
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const q = process.argv[2] || 'low';
const server = await createServer({ server: { port: 5198, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(server.resolvedUrls.local[0] + `?quality=${q}&skipintro&agegate=off`);
await p.waitForFunction(() => window.__game?.frame > 30, null, { timeout: 300000 });
const r = await p.evaluate(async () => {
  const g = window.__game, c = g.ctx; c.renderer.setAnimationLoop(null);
  const sys = {}; const wrap = (name, o) => { if (!o?.update || o.__w) return; const f = o.update.bind(o); o.__w = 1; o.update = (...a) => { const t = performance.now(); const v = f(...a); sys[name] = (sys[name] || 0) + performance.now() - t; return v; }; };
  for (const [k, v] of Object.entries(c)) if (v && typeof v === 'object' && typeof v.update === 'function') wrap(k, v);
  let up = 0, rd = 0; const N = 30;
  for (let i = 0; i < N; i++) { c.input.poll(); let t = performance.now(); g.update(1 / 30); up += performance.now() - t; t = performance.now(); g.render(1 / 30); rd += performance.now() - t; c.input.endFrame(); await new Promise((r) => setTimeout(r, 0)); }
  const info = c.renderer.info.render;
  let meshes = 0, visible = 0; c.scene.traverse((o) => { if (o.isMesh) { meshes++; if (o.visible) visible++; } });
  return { quality: c.settings.quality, calls: info.calls, tris: info.triangles, meshes, visible, updateMs: +(up / N).toFixed(1), renderMs: +(rd / N).toFixed(1), top: Object.entries(sys).map(([k, v]) => [k, +(v / N).toFixed(2)]).sort((a, b) => b[1] - a[1]).slice(0, 14) };
});
console.log(JSON.stringify(r, null, 1));
await b.close(); await server.close();

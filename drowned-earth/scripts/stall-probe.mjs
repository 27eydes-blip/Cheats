// node scripts/stall-probe.mjs — the first five minutes of a new game, from the menu: every frame
// whose game-logic time exceeds 200 ms is listed with what caused it (slowest system, chunks or
// landmarks that streamed in), and every render that had to compile new shaders is listed too.
// Rendering here is software (no GPU), so render times are not representative; logic times and
// shader-compile counts are.
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const server = await createServer({ server: { port: 5189, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
await server.listen();
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 640, height: 360 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(server.resolvedUrls.local[0] + '?agegate=off');
await p.waitForFunction(() => document.querySelector('.title .menu button'), null, { timeout: 120000 });
await p.click('[data-c="story"]');
await p.waitForFunction(() => window.__game?.worldLoaded && window.__game.ctx.mode === 'play', null, { timeout: 400000 });
const r = await p.evaluate(async () => {
  const g = window.__game, c = g.ctx; c.renderer.setAnimationLoop(null);
  const sys = {}; const wrap = (name, o) => { if (!o?.update || o.__w) return; const f = o.update.bind(o); o.__w = 1; o.update = (...a) => { const t = performance.now(); const v = f(...a); sys[name] = (sys[name] || 0) + performance.now() - t; return v; }; };
  for (const [k, v] of Object.entries(c)) if (v && typeof v === 'object' && typeof v.update === 'function') wrap(k, v);
  const ev = []; c.events.on('chunk:built', () => ev.push('chunk')); c.events.on('landmark:loaded', (x) => ev.push('landmark ' + x.def.id));
  const V = c.player.position.constructor;
  const stalls = [], compiles = []; let maxU = 0, sumU = 0;
  const FPS = 30, T = 300, N = FPS * T;
  const act = (sec) => {
    if (sec === 15) { c.interact.use(); }                                         // tie up and climb in (the first prompt)
    if (sec === 25) { c.player.mode = 'foot'; c.input.touchMove.y = 1; }          // walk
    if (sec === 45) { c.input.touchMove.y = 0; c.player.mode = 'swim'; c.player.teleport(c.player.position.clone().add(new V(4, -1, 0))); c.input.held.dive = true; }   // swim + dive
    if (sec === 70) { c.input.held.dive = false; }
    if (sec === 90) { c.player.mode = 'boat'; c.boat.tied = null; c.boat.engineOff = false; c.boat.fuel = c.boat.fuelMax; }   // back aboard
    if (sec >= 92 && sec < 260) { c.input.move.y = 1; c.input.move.x = Math.sin(sec / 9) * 0.35; }   // drive toward Portage and around
    if (sec === 150) c.ui.openInventory();
    if (sec === 153) c.ui.close();
    if (sec === 200) c.ui.openJournal('map');
    if (sec === 203) c.ui.close();
    if (sec === 290) c.save.save('manual');
  };
  for (let i = 0; i < N; i++) {
    const sec = i / FPS;
    if (i % FPS === 0) act(sec);
    for (const k in sys) sys[k] = 0;
    const n0 = ev.length;
    c.input.poll(); if (sec >= 92 && sec < 260) { c.input.move.y = 1; }
    const t = performance.now(); g.update(1 / FPS); c.ui.update(1 / FPS); const u = performance.now() - t;
    maxU = Math.max(maxU, u); sumU += u;
    if (u > 200) { const top = Object.entries(sys).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${Math.round(v)}ms`); stalls.push({ at: +sec.toFixed(1), ms: Math.round(u), top, streamed: ev.slice(n0) }); }
    if (i % FPS === 0) {   // one rendered frame per game second: catches shader compiles
      const p0 = c.renderer.info.programs.length, t2 = performance.now(); g.render(1 / FPS); const rm = performance.now() - t2; const p1 = c.renderer.info.programs.length;
      if (p1 > p0) compiles.push({ at: Math.round(sec), newPrograms: p1 - p0, renderMs: Math.round(rm), streamedThisSecond: ev.slice(Math.max(0, ev.length - 6)).join(', ') });
    }
    c.input.endFrame();
    if (i % 60 === 0) await new Promise((res) => setTimeout(res, 0));
  }
  return { gameSeconds: T, avgLogicMs: +(sumU / N).toFixed(2), maxLogicMs: Math.round(maxU), logicStallsOver200ms: stalls, renderFramesWithShaderCompiles: compiles, mode: c.player.mode, pos: c.player.position.toArray().map((v) => Math.round(v)), programs: c.renderer.info.programs.length };
});
console.log(JSON.stringify(r, null, 1)); if (errs.length) console.log('ERRORS', errs.slice(0, 5));
await b.close(); await server.close();

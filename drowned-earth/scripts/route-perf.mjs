// node scripts/route-perf.mjs [url] [--limit=ms] [--quality=laptop|low|medium|high]
// The scripted route, in the game's real render loop (requestAnimationFrame), from the menu:
//   standing  — on foot at Linden Court, still
//   walking   — on foot, moving and turning
//   boat      — driving across open water
//   raft city — sailing into Portage
//   cask      — sailing to Cask Street
// Frame times come from rAF timestamps (works on any build, old or new). Reports per phase: average
// fps, 1% low, worst frame; and the 10 worst frames overall with what was happening.
// With --limit=MS it exits non-zero if any frame after warm-up exceeds MS (the performance test).
// NOTE: headless Chromium here renders on the CPU (SwiftShader). Absolute numbers are far below a
// real GPU; use them to compare builds, not to predict the frame rate on a player's PC.
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const limit = +(args.find((a) => a.startsWith('--limit='))?.slice(8) || 0);
let url = args.find((a) => /^https?:/.test(a)), server = null;
if (!url) { server = await createServer({ server: { port: 5188, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' }); await server.listen(); url = server.resolvedUrls.local[0]; }
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 640, height: 360 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(url + (url.includes('?') ? '&' : '?') + 'agegate=off&quality=' + (args.find((a) => a.startsWith('--quality='))?.slice(10) || 'low'));
await p.waitForFunction(() => document.querySelector('.title .menu button'), null, { timeout: 300000 });
await p.evaluate(() => setTimeout(() => document.querySelector('[data-c="story"]').click(), 0));
await p.waitForFunction(() => window.__game?.ctx?.mode === 'play' && window.__game.ctx.player, null, { timeout: 400000 });
const r = await p.evaluate(async () => {
  const g = window.__game, c = g.ctx, V = c.player.position.constructor;
  const snap = {};
  const frames = []; let phase = 'warmup', last = performance.now(), running = true;
  const evs = []; c.events.on('chunk:built', () => evs.push('chunk')); c.events.on('landmark:loaded', (x) => evs.push('landmark ' + (x?.def?.id || '')));
  const progs = () => c.renderer.info.programs?.length || 0;
  let lastProgs = progs();
  const tick = (now) => {
    if (!running) return;
    const ms = now - last; last = now;
    const pr = progs(); const shaders = pr - lastProgs; lastProgs = pr;
    const ri = c.renderer.info.render;
    frames.push({ phase, ms, shaders, calls: ri.calls, tris: ri.triangles, ev: evs.splice(0).join(' '), doing: c.player.mode + (c.player.mode === 'boat' ? ' ' + c.boat.vel.length().toFixed(1) + 'm/s' : '') });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const wait = (s) => new Promise((res) => setTimeout(res, s * 1000));
  // autopilot: steer the boat toward a point by feeding the stick each frame
  let target = null;
  const up = c.boat.update.bind(c.boat);
  c.boat.update = (dt) => {
    if (target && c.player.mode === 'boat') {
      const want = Math.atan2(-(target[0] - c.boat.pos.x), -(target[1] - c.boat.pos.z));
      let d = want - c.boat.heading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      c.input.move.y = Math.hypot(target[0] - c.boat.pos.x, target[1] - c.boat.pos.z) > 25 ? 1 : 0.2;
      c.input.move.x = Math.max(-1, Math.min(1, -d * 2));
    }
    up(dt);
  };
  const put = (x, z, heading) => { c.player.mode = 'boat'; c.boat.tied = null; c.boat.pos.set(x, c.boat.pos.y, z); c.boat.vel.set(0, 0, 0); c.boat.heading = heading; c.boat.fuel = c.boat.fuelMax; c.boat.engineOff = false; };
  await wait(4);
  // standing: on foot at Linden Court
  const lc = c.worldMap.landmarks.find((l) => l.id === 'linden_court');
  if (c.player.mode === 'boat') { if (c.interact.focus) c.interact.use(); }
  if (c.player.mode !== 'foot') { c.player.mode = 'foot'; }
  phase = 'standing'; await wait(15); snap['standing'] = { memMB: c.perf?.memory ? +c.perf.memory().toFixed(0) : null, textures: c.renderer.info.memory.textures, geometries: c.renderer.info.memory.geometries };
  // walking in Portage: on the market deck, moving and turning
  { const po0 = c.state.communities?.portage, mk = po0?.rafts.get('market');
    if (mk) { c.player.mode = 'foot'; c.player.teleport(mk.worldPoint(new V(0, mk.deck + 0.2, 0))); } }
  phase = 'walking'; c.input.touchMove.y = 1; const turn = setInterval(() => { c.player.yaw += 0.15; }, 500); await wait(15); clearInterval(turn); c.input.touchMove.y = 0;
  // boat across open water
  put(lc.pos[0] - 40, lc.pos[1] + 60, Math.PI); target = [lc.pos[0] - 40, lc.pos[1] + 400];
  phase = 'boat'; await wait(20); snap['boat'] = { memMB: c.perf?.memory ? +c.perf.memory().toFixed(0) : null, textures: c.renderer.info.memory.textures, geometries: c.renderer.info.memory.geometries };
  // sail into the raft city
  const po = c.worldMap.landmarks.find((l) => l.id === 'portage');
  put(po.pos[0] - 220, po.pos[1], -Math.PI / 2); target = [po.pos[0], po.pos[1]];
  phase = 'raft city'; await wait(25); snap['raft city'] = { memMB: c.perf?.memory ? +c.perf.memory().toFixed(0) : null, textures: c.renderer.info.memory.textures, geometries: c.renderer.info.memory.geometries };
  // on to Cask Street
  const ck = c.worldMap.landmarks.find((l) => l.id === 'cask_street');
  put(ck.pos[0] - 200, ck.pos[1] + 120, 0); target = [ck.pos[0], ck.pos[1]];
  phase = 'cask street'; await wait(25); snap['cask street'] = { memMB: c.perf?.memory ? +c.perf.memory().toFixed(0) : null, textures: c.renderer.info.memory.textures, geometries: c.renderer.info.memory.geometries };
  running = false; target = null;
  const stats = {};
  for (const ph of ['standing', 'walking', 'boat', 'raft city', 'cask street']) {
    const f = frames.filter((x) => x.phase === ph).slice(2);   // the first frames after a teleport are the teleport itself
    if (!f.length) continue;
    const ms = f.map((x) => x.ms).sort((a, b) => b - a), k = Math.max(1, Math.floor(ms.length / 100));
    const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
    const avgOf = (k) => Math.round(f.reduce((a, x) => a + (x[k] || 0), 0) / f.length);
    stats[ph] = { calls: avgOf('calls'), tris: avgOf('tris'), frames: f.length, avgFps: +(1000 / avg).toFixed(1), low1Fps: +(1000 / (ms.slice(0, k).reduce((a, b) => a + b, 0) / k)).toFixed(1), worstMs: Math.round(ms[0]), shaderCompiles: f.reduce((a, x) => a + x.shaders, 0), ...(snap[ph] || {}) };
  }
  const worst = frames.filter((x) => x.phase !== 'warmup').sort((a, b) => b.ms - a.ms).slice(0, 10).map((x) => ({ phase: x.phase, ms: Math.round(x.ms), doing: x.doing, cause: x.shaders ? `${x.shaders} shader compile(s)` : x.ev || 'render/logic' }));
  return { quality: c.settings.quality, stats, worst };
});
console.log(JSON.stringify(r, null, 1));
if (errs.length) console.log('PAGE ERRORS', errs.slice(0, 3));
let fail = errs.length > 0;
if (limit) { const over = r.worst.filter((w) => w.ms > limit); if (over.length) { console.log(`FAIL: ${over.length} frame(s) over ${limit} ms`); fail = true; } else console.log(`PASS: no frame over ${limit} ms`); }
await b.close(); if (server) await server.close();
process.exit(fail ? 1 : 0);

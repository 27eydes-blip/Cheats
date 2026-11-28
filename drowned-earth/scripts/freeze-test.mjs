// node scripts/freeze-test.mjs — nothing can freeze the game. Worst cases for the boat, each run with 200 ms
// frames and full throttle: jammed into a raft corner, wedged between two rafts, against a parked boat, hull at
// 0, fuel at 0, a NaN position. Fails if any single frame spends over 50 ms in game logic, if the boat ends up
// with a bad position, or ends up inside a raft. Also: losing the graphics context pauses and saves, a
// restore resumes; the watchdog records a long frame with a stack; F3 has a memory estimate.
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const server = await createServer({ server: { port: 5193, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 400, height: 240 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(server.resolvedUrls.local[0] + '?skipintro&noassets&nohumans&quality=low&agegate=off&time=12&freeze=1');
await page.waitForFunction(() => window.__game?.worldLoaded, null, { timeout: 200000 });
const results = await page.evaluate(async () => {
  const g = window.__game, c = g.ctx, B = c.boat, V = c.player.position.constructor, out = {};
  c.renderer.setAnimationLoop(null);
  const yieldNow = () => new Promise((r) => setTimeout(r, 0));
  c.player.teleport(new V(318, 1, 250)); for (let i = 0; i < 20; i++) { g.update(1 / 30); await yieldNow(); }
  const com = c.state.communities.portage;
  const drive = async (name, setup, frames = 60) => {
    B.tied = null; c.player.mode = 'boat'; B.engineOff = false; B.fuel = B.fuelMax; B.hull = 100; B.swamped = false; B.vel.set(0, 0, 0);
    setup();
    let worst = 0, bad = 0;
    for (let i = 0; i < frames; i++) {
      c.input.move.y = 1; c.input.move.x = i % 40 < 20 ? 0.6 : -0.6; c.input.held.sprint = true;
      const t0 = performance.now(); g.update(0.2); const ms = performance.now() - t0;   // 200 ms frames
      if (i > 2) worst = Math.max(worst, ms);
      if (!Number.isFinite(B.pos.x + B.pos.z + B.vel.x + B.heading)) bad++;
      if (i % 10 === 0) await yieldNow();
    }
    const inside = c.collision.hullBlocked(B.pos.x, B.pos.z, (B.type?.hull?.beam ?? 1.9) * 0.4);
    out[name] = { pass: worst < 50 && !bad && !inside, detail: `worst frame ${worst.toFixed(1)} ms of logic; bad positions ${bad}; left inside something ${inside}; hull ${B.hull.toFixed(0)}` };
  };
  // aim the boat at a point at full speed from a few metres away
  const aimAt = (p, from) => { B.pos.set(from.x, B.pos.y, from.z); const d = p.clone().sub(from).setY(0).normalize(); B.heading = Math.atan2(-d.x, -d.z); B.vel.copy(d).multiplyScalar(9); };
  // 1. a raft corner: the corner of the market raft's footprint
  const mk = com.rafts.get('market'); let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const q of mk.rects) { x0 = Math.min(x0, q.x0); x1 = Math.max(x1, q.x1); z0 = Math.min(z0, q.z0); z1 = Math.max(z1, q.z1); }
  const corner = mk.worldPoint(new V(x1, 0, z1)), cOut = mk.worldPoint(new V(x1 + 6, 0, z1 + 6));
  await drive('raftCorner', () => aimAt(corner, cOut));
  // 2. wedged between the two nearest rafts
  const rs = [...com.rafts.values()]; let best = null, bd = 1e9;
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i].root.getWorldPosition(new V()), b = rs[j].root.getWorldPosition(new V()), d = a.distanceTo(b); if (d < bd && d > 6) { bd = d; best = [a, b]; } }
  const mid = best[0].clone().add(best[1]).multiplyScalar(0.5);
  await drive('betweenRafts', () => { B.pos.set(mid.x, B.pos.y, mid.z); B.heading = Math.atan2(-(best[1].x - best[0].x), -(best[1].z - best[0].z)); });
  // 3. against a parked boat
  const pk = c.fleet?.parked?.[0];
  if (pk) await drive('parkedBoat', () => aimAt(pk.pos.clone(), pk.pos.clone().add(new V(7, 0, 0))));
  // 4. hull at 0: she settles and stops, nothing freezes
  await drive('hullZero', () => { aimAt(corner, cOut); B.hull = 0; });
  out.hullZero.pass = out.hullZero.pass && B.swamped && B.engineOff;
  out.hullZero.detail += `; swamped ${!!B.swamped}, engine ${B.engineOff ? 'drowned' : 'running'}, sitting ${(B.sinkK || 0).toFixed(2)} low`;
  // 5. fuel at 0
  await drive('fuelZero', () => { aimAt(corner, cOut); B.fuel = 0; });
  // 6. a NaN sneaks into the position
  await drive('nanPosition', () => { B.pos.set(318, 0, 300); B.vel.set(NaN, 0, Infinity); }, 20);
  // context loss: pause + save, restore resumes
  const ext = c.renderer.getContext().getExtension('WEBGL_lose_context');
  let lost = null, resumed = null;
  if (ext) {
    sessionStorage.removeItem('de.autocontinue');
    ext.loseContext(); await new Promise((r) => setTimeout(r, 300));
    lost = { flag: !!g.contextLost, paused: !!c.paused, saved: sessionStorage.getItem('de.autocontinue') === '1', msg: !!document.querySelector('.gpu-msg') };
    ext.restoreContext(); await new Promise((r) => setTimeout(r, 600));
    resumed = { flag: !g.contextLost, paused: !c.paused, msg: !document.querySelector('.gpu-msg') };
    sessionStorage.removeItem('de.autocontinue');
  }
  out.contextLoss = { pass: !!ext && lost.flag && lost.paused && lost.saved && lost.msg && resumed.flag && resumed.paused && resumed.msg, detail: ext ? `lost: paused ${lost.paused}, saved ${lost.saved}, message ${lost.msg}; restored: resumed ${resumed.paused}, message gone ${resumed.msg}` : 'no WEBGL_lose_context here' };
  // watchdog: a 600 ms frame is written down with a stack and the last actions
  const P = g.perf; const n0 = P.watchdog.length;
  c.events.emit('boat:impact', { speed: 3 }); P.sample(0.6, 40, 'play');
  const w = P.watchdog[P.watchdog.length - 1];
  out.watchdog = { pass: P.watchdog.length === n0 + 1 && w.stack.length > 0 && w.lastActions.length > 0, detail: `${w?.why}; stack ${w?.stack.length} lines; last actions: ${w?.lastActions.slice(-3).join(' / ')}; slowest systems: ${w?.slowestSystems.slice(0, 2).join(', ')}` };
  const mem = P.memory();
  out.memory = { pass: mem > 0, detail: `graphics memory estimate ${mem.toFixed(0)} MB (textures ${P.mem.texMB.toFixed(0)}, geometry ${P.mem.geoMB.toFixed(0)}, targets ${P.mem.rtMB.toFixed(0)})` };
  return out;
});
let fails = 0;
for (const [k, r] of Object.entries(results)) { console.log(`${r.pass ? 'PASS' : 'FAIL'} ${k}: ${r.detail}`); if (!r.pass) fails++; }
if (errs.length) { console.log('PAGE ERRORS:', errs.slice(0, 5).join(' | ')); fails++; }
await browser.close(); await server.close();
process.exit(fails ? 1 : 0);

// node scripts/boat-test.mjs — getting off the boat: at rest, at speed, next to a dock; boarding again;
// save/load while aboard; the E key and its prompt; the hold-Esc emergency exit. Prints PASS/FAIL.
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const server = await createServer({ server: { port: 5187, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(server.resolvedUrls.local[0] + '?skipintro&noassets&nohumans&quality=low&agegate=off&time=12&freeze=1');
await page.waitForFunction(() => window.__game?.ctx?.boat && window.__game.worldLoaded, null, { timeout: 200000 });
const results = await page.evaluate(async () => {
  const g = window.__game, c = g.ctx, B = c.boat, P = c.player, V = P.position.constructor, out = {};
  c.renderer.setAnimationLoop(null);
  const tick = async (n = 1) => { for (let i = 0; i < n; i++) { c.input.poll(); g.update(1 / 30); c.ui.update(1 / 30); c.input.endFrame(); if (i % 15 === 0) await new Promise((r) => setTimeout(r, 0)); } };
  const aboard = async (x, z, heading = 0) => { B.tied = null; B.pos.set(x, B.pos.y, z); B.vel.set(0, 0, 0); B.heading = heading; B.throttle = 0; P.mode = 'boat'; B.board(); await tick(3); };
  // open water well away from everything
  // open water: search outward from the start for a spot with no ground or raft within 6 m
  let OPEN = null;
  for (let r = 60; r < 900 && !OPEN; r += 40) for (let k = 0; k < 12 && !OPEN; k++) { const x = -262 + Math.cos(k / 12 * 6.283) * r, z = 222 + Math.sin(k / 12 * 6.283) * r; B.pos.set(x, B.pos.y, z); c.chunks.update(x, z, true); if (c.worldMap.seabedAt(x, z) < -3 && !B.findLanding(6)) OPEN = [x, z]; }
  // 1. at rest in open water → in the water beside the boat, swimming
  await aboard(...OPEN);
  const how1 = B.leave(); await tick(2);
  out.restOpenWater = { pass: how1 === 'water' && P.mode === 'swim' && P.position.distanceTo(B.pos) < 3, detail: `${how1}; mode ${P.mode}; ${P.position.distanceTo(B.pos).toFixed(1)} m from the boat` };
  // 2. re-entry: the Board prompt is offered and boarding works
  await tick(2);
  const boardItem = [...c.interact.items.values()].find((i) => i.id === 'boat:board');
  const offered = !!boardItem && boardItem.enabled(c);
  B.board(); await tick(2);
  out.reEnter = { pass: offered && P.mode === 'boat', detail: `board prompt offered ${offered}; mode ${P.mode}` };
  // 3. at speed → dives off, boat coasts on
  await aboard(...OPEN); B.vel.set(0, 0, -9);
  const how3 = B.leave(); const v3 = B.vel.length(); await tick(2);
  out.atSpeed = { pass: how3 === 'dive' && P.mode === 'swim' && v3 > 5, detail: `${how3}; mode ${P.mode}; boat still moving ${v3.toFixed(1)} m/s` };
  // 4. next to a dock: the start building's mooring (a breach in the wall with a floor behind it)
  const moor = [...c.interact.items.values()].find((i) => i.kind === 'mooring' && i.pos && (typeof i.pos === 'function' ? i.pos(new V()) : i.pos).distanceTo(new V(-262, 0, 222)) < 80);
  const mp = typeof moor.pos === 'function' ? moor.pos(new V()) : moor.pos.clone();
  await aboard(mp.x, mp.z);
  const spot = B.findLanding(6); const how4 = B.leave(); await tick(2);
  out.nextToDock = { pass: how4 === 'land' && P.mode === 'foot', detail: `${how4}; mode ${P.mode}; landing ${spot ? spot.pos.toArray().map((v) => v.toFixed(1)).join(',') : 'none'}` };
  // 5. the E key on a boat with nothing in focus gets you off, and the prompt says so
  await aboard(...OPEN); c.interact.focus = null; c.ui.update(1 / 30);
  const prompt = c.ui.promptEl.textContent;
  dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })); await tick(1); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' })); await tick(1);
  out.eKey = { pass: /Leave boat/.test(prompt) && P.mode !== 'boat', detail: `prompt "${prompt}"; mode after E: ${P.mode}` };
  // 6. save and load while aboard: still aboard after loading, and you can still get off
  await aboard(...OPEN); c.save.save('manual'); P.mode = 'foot'; c.save.load(); await tick(2);
  const loadedAboard = P.mode === 'boat'; const how6 = B.leave(); await tick(1);
  out.saveLoadAboard = { pass: loadedAboard && !!how6 && P.mode !== 'boat', detail: `aboard after load ${loadedAboard}; then left: ${how6}` };
  // 7. emergency exit: hold Esc for a second while driving
  await aboard(...OPEN); B.vel.set(0, 0, -6); c.input.enabled = false;   // simulate stuck input
  dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
  await new Promise((r) => setTimeout(r, 1300));
  dispatchEvent(new KeyboardEvent('keyup', { code: 'Escape' }));
  await tick(2);
  out.emergencyExit = { pass: P.mode !== 'boat' && B.vel.length() < 0.5 && c.input.enabled && !c.ui.panel, detail: `mode ${P.mode}; boat speed ${B.vel.length().toFixed(2)}; input re-enabled ${c.input.enabled}; menu closed ${!c.ui.panel}` };
  return out;
});
let fails = 0;
for (const [k, r] of Object.entries(results)) { console.log(`${r.pass ? 'PASS' : 'FAIL'} ${k}: ${r.detail}`); if (!r.pass) fails++; }
if (errs.length) { console.log('PAGE ERRORS:', errs.slice(0, 5).join(' | ')); fails++; }
await browser.close(); await server.close();
process.exit(fails ? 1 : 0);

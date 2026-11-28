// node scripts/killer-shots.mjs [out] — four 960×540 shots: the Netmaker's lair, the Lamplighter's wall of
// lanterns, a clue board, and a night approach (silhouette only).
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = process.argv[2] || 'shots/killers';
fs.mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 5191, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(server.resolvedUrls.local[0] + '?skipintro&agegate=off&quality=medium&nohumans&freeze=1&time=13&dynres=0');
await page.waitForFunction(() => window.__game?.worldLoaded, null, { timeout: 400000 });
await page.evaluate(() => { window.__game.ctx.killers.bind(); document.querySelectorAll('.hud,.hint,.toast').forEach((e) => (e.style.display = 'none')); });
const settle = (n = 16) => page.evaluate((n) => new Promise((r) => { const g = window.__game; const f0 = g.frame; const t = () => (g.frame - f0 > n ? r() : requestAnimationFrame(t)); t(); }), n);
const look = (x, y, z) => page.evaluate(([x, y, z]) => { const c = window.__game.ctx, p = c.player, e = p.position.clone().setY(p.position.y + 1.6); const dx = x - e.x, dy = y - e.y, dz = z - e.z; p.yaw = Math.atan2(-dx, -dz); p.pitch = Math.atan2(dy, Math.hypot(dx, dz)); }, [x, y, z]);
const shot = async (name) => { await settle(); await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 600000 }); console.log(name); };

// 1. the Netmaker's lair: inside the hull, looking forward through the nets and cages
let p = await page.evaluate(() => {
  const c = window.__game.ctx, K = c.killers, k = K.k.netmaker; c.time.hour = 13;
  for (const cl of k.d.clues.slice(0, 5)) K.state.clues[cl.id] = { day: 1, title: cl.title, text: cl.text };
  const rec = K.loadLair(k, 'main'); K.enterLair(rec, 'safe');
  c.player.teleport(rec.spots.far.clone()); c.player.flashlight = true; c.ui.close?.();
  const t = rec.spots.centre; return [t.x, t.y - 0.2, t.z];
});
await settle(30); await look(...p); await page.evaluate(() => window.__game.ctx.ui.close?.()); await shot('1-netmaker-lair');
await page.evaluate(() => { const K = window.__game.ctx.killers; K.leaveLair(); });

// 2. the Lamplighter's wall of lanterns: flooded floor, light on, facing a shelf wall
p = await page.evaluate(() => {
  const c = window.__game.ctx, K = c.killers, k = K.k.lamplighter;
  for (const cl of k.d.clues.slice(0, 5)) K.state.clues[cl.id] = { day: 1, title: cl.title, text: cl.text };
  const rec = K.loadLair(k, 'main'); K.enterLair(rec, 'safe');
  const g = rec.group, at = new g.position.constructor(1.5, -5.6, 3.5).applyMatrix4(g.matrixWorld), tgt = new g.position.constructor(-5.6, -6.4, 0).applyMatrix4(g.matrixWorld);
  c.player.mode = 'swim'; c.player.teleport(at); c.player.flashlight = true; c.ui.close?.();
  return [tgt.x, tgt.y, tgt.z];
});
await settle(30); await look(...p); await page.evaluate(() => window.__game.ctx.ui.close?.()); await shot('2-lamplighter-lanterns');
await page.evaluate(() => { const K = window.__game.ctx.killers; K.leaveLair(); });

// 3. a clue board
await page.evaluate(() => {
  const c = window.__game.ctx, K = c.killers, k = K.k.netmaker;
  K.state.clues = {}; for (const cl of k.d.clues.filter((x) => x.kind !== 'lair').slice(0, 6)) K.state.clues[cl.id] = { day: 4 + cl.id.length % 5, title: cl.title, text: cl.text.replace('{victim}', 'Sal').replace('{spot}', 'the end of the main dock') };
  K.state.opened.netmaker = true; c.state.met = { ...(c.state.met || {}), garrick: 4, sal: 2, corr: 3, kit: 1 };
  c.ui.openJournal('investigation');
});
await shot('3-clue-board');
await page.evaluate(() => window.__game.ctx.ui.close?.());

// 4. a night approach: across the water to the end of a dock, a shape dragging someone to the edge
p = await page.evaluate(() => {
  const c = window.__game.ctx, K = c.killers, k = K.k.netmaker, S = c.society, V = c.player.position.constructor;
  c.time.hour = 23.6; c.weather.cur.rain = 0; c.player.flashlight = false;
  const sp = k.d.planning.spots[0], pos = K.spotPos(k, sp, new V());
  const a = [...S.agents.values()].find((x) => !x.dead && K.score(k, x) > 0);
  // out on the water, looking back at the dock end from the open side (the raft's centre is behind the spot)
  const r = c.state.communities.portage.rafts.get(sp.raft), ctr = r.root.getWorldPosition(new V());
  const outward = pos.clone().sub(ctr).setY(0).normalize();
  c.player.mode = 'swim'; c.player.teleport(pos.clone().addScaledVector(outward, 16).add(new V(3, 0, 3)).setY(0.2));
  K.strike(k, a, sp, pos, true); K.witness.t = 1.8;
  return [pos.x, pos.y + 1, pos.z];
});
await look(...p); await settle(8); await page.evaluate(() => { const W = window.__game.ctx.killers.witness; if (W) W.t = Math.min(W.t, 2.4); });
await shot('4-night-silhouette');
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 4).join(' | '));
await browser.close(); await server.close();

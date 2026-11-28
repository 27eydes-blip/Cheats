// node scripts/ix-shots.mjs [out] — four 960×540 shots of the interaction layer: things to pick up (prompt,
// glints, the in-reach list), the pack, picking a lock, and a hold-up (hands up, the till prompt).
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = process.argv[2] || 'shots/interaction';
fs.mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 5197, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(server.resolvedUrls.local[0] + '?skipintro&agegate=off&quality=medium&freeze=1&time=12&dynres=0');
await page.waitForFunction(() => window.__game?.worldLoaded, null, { timeout: 400000 });
const settle = (n = 20) => page.evaluate((n) => new Promise((r) => { const g = window.__game; const f0 = g.frame; const t = () => (g.frame - f0 > n ? r() : requestAnimationFrame(t)); t(); }), n);
const shot = async (name) => { await settle(); await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 600000 }); console.log(name); };
// on the market raft, looking down at a few things on the deck
await page.evaluate(() => {
  const c = window.__game.ctx, V = c.player.position.constructor, r = c.state.communities.portage.rafts.get('market');
  const p = r.worldPoint(new V(-2.5, r.deck + 0.1, 2.2)); c.player.mode = 'foot'; c.player.teleport(p); c.player.yaw = r.root.rotation.y + Math.PI * 0.15; c.player.pitch = -0.55;
  const f = new V(-Math.sin(c.player.yaw), 0, -Math.cos(c.player.yaw));
  ['ration_bar', 'rope', 'silver_ring', 'clean_water', 'lockpick'].forEach((id, i) => c.ix.items.drop(id, 1, p.clone().addScaledVector(f, 1.2 + (i % 2) * 0.35).add(new V((i - 2) * 0.28, 0.02, 0)), { owner: i === 2 ? 'oru' : null }));
});
await settle(40); await shot('1-pickup');
// the pack, with some stolen goods in it
await page.evaluate(() => { const c = window.__game.ctx; c.inventory.add('silver_ring', 1, true, { stolen: true }); c.inventory.add('salt', 3, true, { stolen: true }); c.inventory.add('rum', 2, true); c.inventory.add('fish_cake', 2, true); c.inventory.add('lockpick', 2, true); c.ix.state.hotbar = ['fish_cake', 'rum', null, null, null]; c.ui.openInventory(); });
await shot('2-pack');
await page.evaluate(() => window.__game.ctx.ui.close());
// picking a lock
await page.evaluate(() => { const c = window.__game.ctx; const L = c.ix.items.addContainer({ id: 'shot:locker', kind: 'locker', label: 'Locker', owner: 'ruel', lock: { kind: 'pick', level: 0.5 }, items: { scrap: 3 }, rolled: true }); c.ix.crime.unlock(L); });
await shot('3-lockpick');
await page.evaluate(() => { const g = window.__game.ctx.ix.crime.activeGame; g?.finish(null); });
// a hold-up: the trader with her hands up, the till prompt
await page.evaluate(() => {
  const c = window.__game.ctx, V = c.player.position.constructor, com = c.state.communities.portage, npc = com.npcs.find((n) => n.def.id === 'oru');
  const np = npc.worldPos(new V()); const h = npc.heading + npc.raft.root.rotation.y;
  c.player.teleport(np.clone().add(new V(Math.sin(h) * 2.2, 0.2, Math.cos(h) * 2.2))); c.player.yaw = Math.atan2(Math.sin(h), Math.cos(h)); c.player.pitch = -0.08;
  c.arms.give('flare_pistol'); c.arms.draw(c.arms.state.owned.length - 1); c.ix.surrender(npc);
});
await settle(40); await shot('4-holdup');
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 4).join(' | '));
await browser.close(); await server.close();

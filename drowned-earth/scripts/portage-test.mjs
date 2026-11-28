// node scripts/portage-test.mjs — Portage life: the three hidden things can be found, market vendors call out
// in the daytime, and found things survive save/load. Prints PASS/FAIL.
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const server = await createServer({ server: { port: 5186, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(server.resolvedUrls.local[0] + '?skipintro&noassets&nohumans&quality=low&agegate=off&time=10&freeze=1');
await page.waitForFunction(() => window.__game?.worldLoaded, null, { timeout: 200000 });
const results = await page.evaluate(async () => {
  const g = window.__game, c = g.ctx, L = c.portageLife, out = {}, V = c.player.position.constructor;
  c.renderer.setAnimationLoop(null);
  const tick = async (n = 1) => { for (let i = 0; i < n; i++) { c.input.poll(); g.update(1 / 30); c.ui.update(1 / 30); c.input.endFrame(); if (i % 30 === 0) await new Promise((r) => setTimeout(r, 0)); } };
  const goTo = async (raftId, x, z) => { const r = L.raft(raftId); c.player.mode = 'foot'; c.player.teleport(r.worldPoint(new V(x, r.deck + 0.2, z))); await tick(3); };
  const use = (id) => { const it = [...c.interact.items.values()].find((i) => i.id === id); return it && it.enabled(c) ? (it.onUse(c), true) : false; };
  c.player.teleport(new V(318, 1, 250)); await tick(5);
  // the note
  await goTo('chapel', 1.4, -1.2); const n = use('secret:note');
  out.note = { pass: n && L.st.note && c.ui.panelKind === 'log' && c.story.flag('secret_note'), detail: `found ${n}; panel ${c.ui.panelKind}` }; c.ui.close();
  // the tin
  const s0 = c.inventory.count('scrap'); await goTo('sleep1', -1.6, 0.9); const t = use('secret:tin');
  out.stash = { pass: t && c.inventory.count('scrap') === s0 + 6 && c.inventory.has('flare'), detail: `scrap ${s0} → ${c.inventory.count('scrap')}` };
  // the figure: not there at noon, there at 2am
  await goTo('water', 0, 1.6); const noon = use('secret:figure');
  c.time.hour = 2; await tick(2); const night = use('secret:figure');
  out.figure = { pass: !noon && night && c.story.flag('secret_figure'), detail: `at 10:00 ${noon}; at 02:00 ${night}` };
  // vendors call out near the market in the daytime
  c.time.hour = 11; let heard = ''; const sub = c.ui.subtitle.bind(c.ui); c.ui.subtitle = (txt, ...a) => { if (/vendor/i.test(txt)) heard = txt; return sub(txt, ...a); };
  await goTo('market', 0, 0); L.callT = 0.5; await tick(40);
  out.callouts = { pass: !!heard, detail: heard || 'none' };
  // persistence
  c.save.save('manual'); L.reset(); c.save.load();
  out.saved = { pass: L.st.note && L.st.tin && L.st.figure, detail: JSON.stringify(L.st) };
  return out;
});
let fails = 0;
for (const [k, r] of Object.entries(results)) { console.log(`${r.pass ? 'PASS' : 'FAIL'} ${k}: ${r.detail}`); if (!r.pass) fails++; }
if (errs.length) { console.log('PAGE ERRORS:', errs.slice(0, 5).join(' | ')); fails++; }
await browser.close(); await server.close();
process.exit(fails ? 1 : 0);

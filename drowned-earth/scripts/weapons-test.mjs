// node scripts/weapons-test.mjs — weapon systems: damage, noise waking creatures, jam/wear,
// NPC reaction to a drawn weapon, the bar weapon rule, the Club's door. Prints PASS/FAIL per test.
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const server = await createServer({ server: { port: 5194, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 400, height: 240 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(server.resolvedUrls.local[0] + '?skipintro&noassets&nohumans&quality=low&agegate=off&time=21&freeze=1');
await page.waitForFunction(() => window.__game?.ctx?.arms, null, { timeout: 120000 });
const results = await page.evaluate(async () => {
  const g = window.__game, c = g.ctx, A = c.arms, V = c.player.position.constructor;
  const tick = async (n) => { for (let i = 0; i < n; i++) { g.step(1); if (i % 30 === 0) await new Promise((r) => setTimeout(r, 0)); } };
  const out = {};
  const home = async (cr) => { for (let i = 0; i < 200 && cr.place.roof && !cr.homed; i++) { c.player.teleport(cr.home.clone().add(new V(20, 30, 0))); g.step(2); await new Promise((r) => setTimeout(r, 0)); } };
  // 1. damage + wounded reaction
  { const cr = c.creatures.byId('sw_court'); await home(cr); c.player.mode = 'foot'; c.player.teleport(cr.home.clone().add(new V(3, 0.1, 0))); await tick(5);
    A.give('pipe_wrench'); A.draw(0); const h0 = cr.health; A.hitTarget({ type: 'creature', obj: cr, pos: cr.pos }, 28, 0, false); const h1 = cr.health; A.hitTarget({ type: 'creature', obj: cr, pos: cr.pos }, 28, 0, true);
    out.damage = { pass: h1 === h0 - 28 && cr.health < h1, detail: `health ${h0}→${h1}→${cr.health}, state ${cr.state} (${cr.reason})` };
    out.wounded = { pass: cr.state === 'return' || cr.state === 'attack', detail: `wolf at ${Math.round(cr.health)}hp chose ${cr.state} (${cr.reason})` }; }
  // 2. noise → creature wake: a rifle shot wakes the pack, a sling doesn't
  { const cr = c.creatures.byId('ls_cask'); cr.state = 'idle'; cr.threat = 0; cr.wary = 0; cr.pos.copy(cr.home); c.state.playTime = 100;
    c.player.mode = 'swim'; const hold = cr.home.clone().add(new V(25, 2, 0)); c.player.teleport(hold); const up = c.player.update.bind(c.player); c.player.update = (dt) => { up(dt); c.player.position.copy(hold); c.player.velocity.set(0, 0, 0); }; await tick(90);
    const quiet0 = cr.state; c.creatures.log.length = 0;
    A.noise(2); await tick(20); const afterQuiet = cr.state;
    A.noise(90); await tick(20); const afterLoud = c.creatures.log.filter((e) => e.id === cr.id).map((e) => `${e.from}→${e.to}(${e.why})`);
    c.player.update = up;
    out.noiseWake = { pass: afterQuiet === quiet0 && afterLoud.some((s) => /noise/.test(s)), detail: `sling: ${quiet0}→${afterQuiet}; rifle: ${afterLoud.join(', ') || 'no reaction'}` }; }
  // 3. jam and wear
  { const mk = c.state.communities.portage.rafts.get('market'); c.player.mode = 'foot'; c.player.teleport(mk.worldPoint(new V(0, mk.deck + 0.2, 0))); await tick(5);
    A.give('pipe_shotgun'); A.state.drawn = -1; A.draw(1); const w = A.cur; w.salt = 1; w.cond = 0.1; c.inventory.add('shell', 40, true); let jams = 0, shots = 0;
    for (let i = 0; i < 30; i++) { A.jammed = false; A.cool = 0; A.reloadT = 0; w.loaded = 2; const before = w.loaded; A.fire(); if (A.jammed) jams++; else if (w.loaded < before) shots++; }
    const c0 = 0.9; w.cond = c0; A.cool = 0; A.jammed = false; w.loaded = 2; w.salt = 0; let fired = 0; for (let i = 0; i < 10; i++) { A.cool = 0; A.jammed = false; w.loaded = 2; A.fire(); fired++; }
    out.jam = { pass: jams >= 3, detail: `${jams} jams in 30 pulls with salt 100% and wear 90%` };
    out.wear = { pass: w.cond < c0, detail: `condition ${c0} → ${w.cond.toFixed(3)} after ${fired} pulls` }; }
  // 4. NPCs react to a drawn weapon
  { const com = c.state.communities.portage; const n = com.npcs.find((x) => x.def.id === 'odile'); const a = c.society.agents.get('odile');
    let ev = null; c.events.on('people:weapon', (e) => (ev = e));
    c.player.mode = 'foot'; c.player.teleport(n.worldPos(new V()).add(new V(1.5, 0.3, 0))); A.state.drawn = -1; A.draw(0); a._wpn = null; await tick(70);
    out.npcReaction = { pass: !!ev, detail: ev ? `${a.name} reacted: ${ev.reaction}; memory ${a.memory.at(-1)?.type}` : 'no reaction' }; }
  // 5. the bar rule: the bouncer warns, refuses service, then throws you out
  { const nl = c.nightlife; const d = [...nl.dressed.values()].find((x) => x.anchors.some((q) => q.id === 'brass_anchor')); const anc = d.anchors.find((q) => q.id === 'brass_anchor');
    let ejected = false; c.events.on('weapon:ejected', () => (ejected = true));
    const p0 = d.world(anc); c.player.teleport(p0.clone().setY(p0.y - 0.4)); A.state.drawn = -1; A.draw(0); A.barT = 0; A.lawT = 0;
    nl.open('brass_anchor'); const refused = c.ui.panelKind === 'log' || /Not with that out/.test(document.querySelector('.panel')?.textContent || ''); c.ui.close();
    for (let i = 0; i < 8 * 30 && !ejected; i++) { c.player.teleport(p0.clone().setY(p0.y - 0.4)); g.step(1); if (i % 30 === 0) await new Promise((r) => setTimeout(r, 0)); }
    out.barRule = { pass: refused && ejected, detail: `service refused: ${refused}; thrown out: ${ejected}; drawn after: ${A.drawn}` }; }
  // 6. the Club takes your weapons at the door
  { const cl = c.club; for (const f of ['lamp_map', 'has_pin']) c.story.setFlag(f); c.heat.value = 0; cl.enter(); A.state.drawn = -1; A.draw(0); cl.doorCheck();
    const btn = [...document.querySelectorAll('[data-o]')].find((b) => b.textContent.includes('fish wears brass')); btn?.click(); const conf = A.state.confiscated && !A.drawn; A.state.drawn = -1; A.draw(0); const still = !A.drawn; cl.exit();
    out.clubDoor = { pass: conf && still && !A.state.confiscated, detail: `confiscated at door: ${conf}; can't draw inside: ${still}; returned on exit: ${!A.state.confiscated}` }; }
  return out;
});
let fails = 0;
for (const [k, r] of Object.entries(results)) { console.log(`${r.pass ? 'PASS' : 'FAIL'} ${k}: ${r.detail}`); if (!r.pass) fails++; }
if (errs.length) { console.log('PAGE ERRORS:', errs.slice(0, 5).join(' | ')); fails++; }
await browser.close(); await server.close();
process.exit(fails ? 1 : 0);

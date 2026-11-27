// Gameplay smoke test: drives the main loop through the stage-1 systems
// (tie-up, loot, craft, logs, trade, swim, radio, save/load, finale) and fails
// on any console error.  node scripts/smoke.mjs
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('playwright')); }

const server = await createServer({ server: { port: 5197, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e.stack || e)));
await page.goto(server.resolvedUrls.local[0] + '?skipintro=1&quality=low');
await page.waitForFunction(() => window.__game?.frame > 3, null, { timeout: 120000 });
const step = (name, fn, frames = 5) => page.evaluate(async ([fnSrc, frames]) => {
  const g = window.__game, ctx = g.ctx;
  g.fixedDt = 0.1;
  const r = await (0, eval)(fnSrc)(ctx, g);
  const start = g.frame;
  await new Promise((res) => { const t = () => (g.frame - start >= frames ? res() : requestAnimationFrame(t)); t(); });
  return r;
}, [fn.toString(), frames]).then((r) => console.log('✓', name, r ?? ''), (e) => { errors.push(name + ': ' + e.message); console.log('✗', name, e.message); });

await step('start audio', (ctx) => { ctx.audio.start(); return ctx.audio.started; }, 10);
await step('climb into Linden Court', (ctx) => { const it = [...ctx.interact.items.values()].find((i) => i.kind === 'mooring' && i.prompt === 'Tie up and climb in' && i.pos.distanceTo(ctx.boat.pos) < 10); it.onUse(ctx, it); return ctx.player.mode; }, 10);
await step('loot lobby bag', (ctx) => { ctx.loot.open('c:linden:lobby', 'gobag'); return Object.keys(ctx.inventory.items).join(','); });
await step('read recording', (ctx) => { ctx.story.openLog('linden_01'); ctx.ui.close(); return ctx.story.current; });
await step('craft rope', (ctx) => { ctx.boatStorage.remove('fibre'); ctx.inventory.add('fibre', 1); return ctx.crafting.craft('rope'); });
await step('use items', (ctx) => ctx.survival.useItem('kelp'));
await step('walk forward', (ctx) => { ctx.input.touchMove.y = 1; return ctx.player.position.toArray().map((v) => v.toFixed(1)).join(','); }, 20);
await step('stop + jump into water', (ctx) => { ctx.input.touchMove.y = 0; ctx.player.teleport(new ctx.player.position.constructor(-262, 1, 240)); return ctx.player.mode; }, 20);
await step('swim + dive', (ctx) => { ctx.input.held.dive = true; return ctx.player.mode; }, 30);
await step('oxygen dropping', (ctx) => { ctx.input.held.dive = false; return `${ctx.player.mode} depth=${ctx.player.depth.toFixed(1)} o2=${ctx.survival.oxygen.toFixed(0)}`; }, 5);
await step('board boat', (ctx) => { ctx.boat.board(); return ctx.player.mode; });
await step('radio', (ctx) => { ctx.radio.cycle(); ctx.radio.cycle(); return ctx.radio.station?.id; }, 40);
await step('drive boat', (ctx) => { ctx.boat.tied = null; ctx.input.touchMove.y = 1; return 0; }, 30);
await step('boat moved', (ctx) => { ctx.input.touchMove.y = 0; return ctx.boat.pos.toArray().map((v) => v.toFixed(1)).join(','); });
await step('go to Kettle Drift', (ctx) => { ctx.boat.pos.set(270, 0, 258); return 0; }, 30);
await step('dock', (ctx) => { const it = [...ctx.interact.items.values()].find((i) => i.kind === 'mooring' && typeof i.prompt === 'function' && String(i.prompt(ctx)).includes('Quarantine Dock')); it.onUse(ctx, it); return ctx.player.mode + ' ' + ctx.state.flags.visited_kettle; }, 20);
await step('talk + shop', (ctx) => { const npc = ctx.state.community.npcs.find((n) => n.def.id === 'odile'); ctx.dialogue.talk(npc); return npc.activity; }, 10);
await step('trade', (ctx) => { ctx.ui.openShop('odile_stall'); const ok = ctx.trade.buy('odile_stall', 'kelp'); ctx.ui.close(); return ok; });
await step('to Rusthold', (ctx) => { ctx.player.mode = 'boat'; ctx.boat.tied = null; ctx.boat.pos.set(485, 0, 580); return 0; }, 30);
await step('workbench craft hook', (ctx) => { ctx.ui.openCraft('workbench'); const ok = ctx.crafting.craft('rope_hook'); ctx.ui.close(); return ok; });
await step('walk on raft', (ctx) => { ctx.input.touchMove.y = 1; return 0; }, 30);
await step('raft position', (ctx) => { ctx.input.touchMove.y = 0; return `${ctx.player.mode} ${ctx.player.position.toArray().map((v) => v.toFixed(1)).join(',')} body=${!!ctx.player.groundBody}`; });
await step('back to Portage', (ctx) => { ctx.boat.pos.set(300, 0, 300); ctx.player.mode = 'boat'; return 0; }, 30);
await step('patrol chase + inspection', (ctx) => { ctx.time.hour = 22.5; const p = ctx.patrol; p.forceActive = true; p.pos.set(ctx.boat.pos.x + 10, 0, ctx.boat.pos.z); ctx.boat.vel.set(0,0,0); p.startStop(); const r = p.inspect(); ctx.ui.close(); p.endStop('clean'); return r.lines.length; }, 10);
await step('standing step', (ctx) => { ctx.inventory.add('scrap', 10); return ctx.standing.step('drifter_tag') && ctx.standing.shown; });
await step('deep zone + listener', (ctx) => { ctx.player.mode = 'swim'; ctx.player.teleport(new ctx.player.position.constructor(100, -30, -140)); ctx.input.held.sprint = true; return 0; }, 40);
await step('deep state', (ctx) => { ctx.input.held.sprint = false; return ctx.abyss.zone.id + ' ' + ctx.abyss.listeners[0].state; });
await step('journal + photo', (ctx) => { ctx.ui.openJournal('map'); ctx.ui.close(); ctx.photo.enter(); ctx.photo.shoot(); ctx.photo.exit(); return ctx.photo.list().length; });
await step('life sim scene', async (ctx) => { ctx.life.create({ seed: 'smoke' }); for (let i = 0; i < 20; i++) ctx.life.ageUp(); return ctx.life.s.age; });
await step('sleep', (ctx) => { ctx.survival.sleep(); return ctx.time.hour.toFixed(1); }, 30);
await step('save + load', (ctx) => { ctx.save.save('test'); return ctx.save.load(); }, 10);
await step('ask Ansel after signal', (ctx) => { ctx.story.setFlag('heard_signal'); const npc = ctx.state.community.npcs.find((n) => n.def.id === 'keeper'); for (let i = 0; i < 4; i++) ctx.dialogue.talk(npc); return ctx.story.flag('signal_decoded'); });
await step('night + storm', (ctx) => { ctx.time.hour = 23; ctx.weather.set('storm', true); return ctx.weather.state; }, 30);
await step('finale', (ctx) => { ctx.player.mode = 'boat'; ctx.boat.tied = null; ctx.boat.pos.set(60, 0, -150); return 0; }, 20);
await step('lower hydrophone', (ctx) => { ctx.story.startFinale(); return 0; }, 320);
await step('finale done', (ctx) => ctx.story.flag('finale_done'));
await step('quality reset path', (ctx) => { ctx.chunks.reset(); ctx.chunks.update(ctx.player.position.x, ctx.player.position.z, true); return ctx.chunks.stats.loaded; });
await browser.close();
await server.close();
if (errors.length) { console.log('\nERRORS:\n' + [...new Set(errors)].join('\n')); process.exit(1); }
console.log('\nsmoke ok');

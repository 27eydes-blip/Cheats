// node scripts/people-test.mjs — forces each emergent-incident scenario next to the player and
// runs the simulation, printing the creature's state log, the NPC's reaction, outcome, memory and grief.
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const server = await createServer({ server: { port: 5195, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [name, sid, hour] of [['wolf', 'wolf_roof', 18.6], ['netweaver', 'drunk_dive', 23.2], ['crab', 'crab_nest', 16]]) {
  const page = await browser.newPage({ viewport: { width: 400, height: 240 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(server.resolvedUrls.local[0] + `?skipintro&noassets&nohumans&quality=low&agegate=off&time=${hour}&freeze=1&peoplelog`);
  await page.waitForFunction(() => window.__game?.ctx?.society, null, { timeout: 120000 });
  const r = await page.evaluate(async ([sid]) => {
    const g = window.__game, c = g.ctx, S = c.society;
    const cr = c.creatures.byId(S.d.scenarios[sid].creature);
    for (let i = 0; i < 200 && cr.place.roof && !cr.homed; i++) { c.player.teleport(cr.home.clone().add({ x: 20, y: 30, z: 0 })); g.step(2); await new Promise((q) => setTimeout(q, 0)); }
    c.creatures.log.length = 0;
    const actor = S.forceScenario(sid, true);
    if (!actor) return { err: 'no actor' };
    const who = actor.a;
    for (let i = 0; i < 2400 && !actor.done; i++) { g.step(1); if (i % 60 === 0) await new Promise((q) => setTimeout(q, 0)); }
    await new Promise((q) => setTimeout(q, 3000));
    const inc = S.state.incidents.at(-1);
    const griefs = [...S.agents.values()].filter((a) => a.grief).map((a) => `${a.name} grieves ${a.grief.who}`);
    return { who: who.name, reaction: actor.react, hp: Math.round(actor.hp), outcome: inc?.outcome, creature: c.creatures.log.filter((e) => e.id === cr.id).map((e) => `${e.from}→${e.to} (${e.why})`).slice(0, 8), memory: who.memory.map((m) => m.type), caution: +who.traits.caution.toFixed(2), injury: who.injury?.kind || null, dead: who.dead, griefs, rumour: c.economy.rumours[0]?.text };
  }, [sid]);
  console.log(name, JSON.stringify({ ...r, errors: errs.slice(0, 3) }, null, 1));
  await page.close();
}
await browser.close(); await server.close();

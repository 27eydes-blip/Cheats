// Behaviour tests for the territorial bestiary.  node scripts/creature-test.mjs [name]
// Each test places the player, scripts an approach (walk, sprint, crouch,
// light, back off), steps the simulation at a fixed dt and checks the state
// transitions the creature went through. Prints the transition log.
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const server = await createServer({ server: { port: 5197, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const only = process.argv[2];

// Each test runs inside the page. `S` is a little scripting kit.
const TESTS = {
  // walk calmly toward the den and stop at the warning: it should warn, then let you back off
  wolf_backoff: `
    const c = S.c('sw_court'); await S.homed(c);
    S.place(c, 34, 'foot'); S.time(13);
    await S.walk(c, 3.0, 'toward', 26);        // into the alert ring
    await S.walk(c, 3.0, 'toward', 13.5);       // to the edge of its warning radius
    await S.idle(1.5);
    await S.walk(c, 1.6, 'away', 30);          // back away slowly
    await S.idle(3);
    return S.result(c, { mustSee: ['alert', 'warning', 'return'], mustNot: ['attack'] });`,
  // sprinting across the territory reads as prey: they come
  wolf_run: `
    const c = S.c('sw_court'); await S.homed(c);
    S.place(c, 32, 'foot'); S.time(13); S.ctx.state.playTime = 4000;
    await S.walk(c, 5.6, 'toward', 10, true);
    await S.idle(5);
    return S.result(c, { mustSee: ['warning', 'attack'] });`,
  // crouch-walking past keeps you under notice for longer than walking
  wolf_crouch: `
    const c = S.c('sw_court'); await S.homed(c);
    S.place(c, 36, 'foot'); S.time(22);
    await S.walk(c, 1.6, 'toward', 22, false, true);
    return S.result(c, { mustNot: ['attack', 'warning'] });`,
  // the gullrat raid: open food on the deck at night; a flashlight scatters them
  raid: `
    const c = S.c('gr_portage'); await S.homed(c);
    S.time(23.5); S.ctx.inventory.add('canned_fish', 3);
    S.place(c, 3, 'foot');
    await S.idle(4);
    S.ctx.player.flashlight = true; S.aim(c);
    await S.idle(4);
    return S.result(c, { mustSee: ['warning', 'return'] });`,
  // the street dive: brushing the Net-Weaver's threads stings and steals breath
  netweaver: `
    const c = S.c('nw_street');
    S.place(c, 14, 'swim', -9); S.time(14);
    await S.idle(1);
    const o0 = S.ctx.survival.oxygen;
    await S.swim(c, 1.2, 'toward', 0.5);
    await S.idle(2);
    return S.result(c, { mustSee: ['attack'], extra: { oxygenLost: +(o0 - S.ctx.survival.oxygen).toFixed(1), hurt: S.ctx.state.bestiary?.netweaver?.hurt } });`,
  // the silent crawl: slow and quiet past a Listener survives; a sprint does not
  listener_quiet: `
    const c = S.c('ls_cask');
    S.place(c, 30, 'swim', -12); S.time(14); S.ctx.state.playTime = 4000;
    await S.swim(c, 0.4, 'past', 30, false);
    return S.result(c, { mustNot: ['attack'], extra: { dead: S.ctx.injury.dead } });`,
  listener_loud: `
    const c = S.c('ls_cask');
    S.place(c, 30, 'swim', -12); S.time(14); S.ctx.state.playTime = 4000;
    await S.swim(c, 2.6, 'toward', 2, true);
    await S.idle(4);
    return S.result(c, { mustSee: ['attack'], extra: { dead: S.ctx.injury.dead, deaths: S.ctx.state.deaths } });`,
  // a bloomwalker: shine a light on it and stand still; it grabs; struggle breaks it
  bloom: `
    const c = S.c('bw_street');
    S.place(c, 8, 'swim', -9); S.time(14); S.ctx.player.flashlight = true; S.aim(c);
    await S.idle(14);
    const grabbed = !!S.mgr.struggle;
    for (let i = 0; i < 16; i++) { S.press('use'); await S.idle(0.12); }
    await S.idle(1);
    return S.result(c, { mustSee: ['alert'], extra: { grabbed, stillHeld: !!S.mgr.struggle } });`,
  // needlefish: a bleeding splasher draws them, a slow swimmer does not
  needle: `
    const c = S.c('nf_court');
    S.place(c, 10, 'swim', -1.2); S.time(14); S.ctx.injury.bleeding = 0.5;
    await S.swim(c, 2.6, 'toward', 1, true);
    await S.idle(3);
    return S.result(c, { mustSee: ['attack'], extra: { health: Math.round(S.ctx.injury.health) } });`,
  // first-hour grace: lethal contact spares you
  grace: `
    const c = S.c('ls_cask');
    S.place(c, 30, 'swim', -12); S.time(14); S.ctx.state.playTime = 100;
    await S.swim(c, 2.6, 'toward', 2, true);
    await S.idle(4);
    return S.result(c, { mustSee: ['attack'], extra: { dead: S.ctx.injury.dead, health: Math.round(S.ctx.injury.health) } });`,
};

const KIT = `
  const g = window.__game, ctx = g.ctx, mgr = ctx.creatures;
  const V = ctx.player.position.constructor;
  const S = {
    ctx, mgr, log: [],
    c: (id) => mgr.byId(id),
    time(h) { ctx.time.hour = h; ctx.time.frozen = true; ctx.time.update(0); },
    place(c, d, mode, y) {
      const a = 0.6;
      const p = new V(c.home.x + Math.cos(a) * d, y ?? (c.home.y + 0.1), c.home.z + Math.sin(a) * d);
      ctx.player.mode = mode; ctx.player.teleport(p); S.aim(c);
      mgr.log.length = 0; for (const k of mgr.list) { k.state = 'idle'; k.threat = 0; }
      ctx.injury.health = 100; ctx.injury.dead = false;
    },
    aim(c) { const p = ctx.player.position; const v = c.pos.clone().sub(p); ctx.player.yaw = Math.atan2(-v.x, -v.z); ctx.player.pitch = Math.atan2(v.y, Math.hypot(v.x, v.z)); },
    async homed(c) { for (let i = 0; i < 300 && !c.homed; i++) { ctx.player.teleport(new V(c.home.x + 20, 30, c.home.z)); g.step(3); await new Promise(r => setTimeout(r, 0)); } },
    press(a) { ctx.input.justPressed.add(a); g.update(1/30); ctx.input.justPressed.delete(a); },
    async idle(sec) { const n = Math.round(sec * 30); const hold = ctx.player.position.clone(); for (let i = 0; i < n; i++) { ctx.input.move.x = ctx.input.move.y = 0; g.step(1); ctx.player.position.copy(hold); ctx.player.velocity.set(0, 0, 0); if (i % 30 === 0) await new Promise(r => setTimeout(r, 0)); } },
    // move the player directly (keeps the test independent of collision): toward / away / past
    async walk(c, speed, how, until, sprint = false, crouch = false) {
      ctx.input.held.sprint = sprint; ctx.input.held.crouch = crouch;
      for (let i = 0; i < 1800; i++) {
        const p = ctx.player.position, d = Math.hypot(p.x - c.home.x, p.z - c.home.z);
        if ((how === 'toward' && d <= until) || (how === 'away' && d >= until)) break;
        const dir = new V(c.home.x - p.x, 0, c.home.z - p.z).normalize().multiplyScalar(how === 'away' ? -1 : 1);
        if (how === 'away') S.aim(c);
        else ctx.player.yaw = Math.atan2(-dir.x, -dir.z);
        p.addScaledVector(dir, speed / 30); ctx.player.velocity.set(dir.x * speed, 0, dir.z * speed);
        g.update(1/30); ctx.player.position.copy(p);
        if (i % 30 === 0) await new Promise(r => setTimeout(r, 0));
      }
      ctx.input.held.sprint = false; ctx.input.held.crouch = false; ctx.player.velocity.set(0, 0, 0);
    },
    async swim(c, speed, how, until, sprint = false) {
      ctx.input.held.sprint = sprint;
      const start = ctx.player.position.clone();
      for (let i = 0; i < 2400; i++) {
        const p = ctx.player.position; const d = p.distanceTo(c.pos);
        if (how === 'toward' && d <= until) break;
        if (how === 'past' && start.distanceTo(p) >= until * 2) break;
        let dir = how === 'past' ? new V(-Math.sin(0.6), 0, Math.cos(0.6)) : c.pos.clone().sub(p).normalize();
        if (how === 'past') { const off = p.clone().sub(c.home).setY(0); if (off.length() < 18) dir.add(off.normalize().multiplyScalar(0.5)).normalize(); }
        p.addScaledVector(dir, speed / 30); ctx.player.velocity.copy(dir).multiplyScalar(speed);
        const keep = p.clone(); g.update(1/30); ctx.player.position.copy(keep);
        if (ctx.injury.dead) break;
        if (i % 30 === 0) await new Promise(r => setTimeout(r, 0));
      }
      ctx.input.held.sprint = false; ctx.player.velocity.set(0, 0, 0);
    },
    result(c, { mustSee = [], mustNot = [], extra = {} }) {
      const seen = new Set(mgr.log.filter(e => e.id === c.id).map(e => e.to));
      const ok = mustSee.every(s => seen.has(s)) && !mustNot.some(s => seen.has(s));
      return { ok, log: mgr.log.filter(e => e.id === c.id).map(e => e.t.toFixed(1) + 's ' + e.from + '→' + e.to + ' (' + e.why + ')'), ...extra };
    },
  };
  ctx.state.playTime = ctx.state.playTime || 0;
`;

let fails = 0;
for (const [name, body] of Object.entries(TESTS)) {
  if (only && !name.includes(only)) continue;
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack || '').split('\n').slice(1, 4).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await page.goto(server.resolvedUrls.local[0] + '?skipintro&noassets&nohumans&dynres=0&quality=low&pause');
  await page.waitForFunction(() => window.__game?.ctx?.creatures, null, { timeout: 120000 });
  let r;
  try { r = await page.evaluate(`(async () => { ${KIT} ${body} })()`); } catch (e) { r = { ok: false, err: e.message }; }
  if (errs.length) { r.ok = false; r.errors = errs.slice(0, 4); }
  console.log((r.ok ? 'PASS ' : 'FAIL ') + name, JSON.stringify(r, null, 1));
  if (!r.ok) fails++;
  await page.close();
}
await browser.close(); await server.close();
process.exit(fails ? 1 : 0);

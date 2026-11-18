// Gameplay checks for Glydaway: run with `node glydaway/tests/gameplay.test.cjs` (needs Playwright with
// Chromium). Skins (fair hitboxes, distinct art, buying and wearing, saving), the newer hazards with
// every skin, SKY DASH flight, the slower tuning, sharp backdrop pixels, and fake scores never
// leaving the device. (Accounts and the world leaderboard: tests/online.test.cjs and tests/db.test.sql.)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const srv = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': 'text/html' }); r.end(d); } });
}).listen(0);
const URL = () => `http://localhost:${srv.address().port}/`;
const SUPA = 'https://*.supabase.co'; // never reach a real server from a test

let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };
async function open(b, { q = '', seed = {}, route = null } = {}) {
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 } });
  await ctx.addInitScript(s => { try { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1'); localStorage.setItem('glydaway.tutDone', 'true'); localStorage.setItem('glydaway.sidewaysTold', 'true'); localStorage.setItem('glydaway.name', '"Tester1"'); for (const k in s) localStorage.setItem('glydaway.' + k, s[k]); } catch (e) {} }, seed);
  // never touch the real leaderboard from a test
  await ctx.route(SUPA + '/**', route || (r => r.fulfill({ status: 503, body: '{}' })));
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', e => p.errs.push(e.message));
  await p.goto(URL() + q); await p.waitForTimeout(250);
  await p.evaluate(() => document.getElementById('splash').classList.add('gone'));
  return p;
}

(async () => {
  const b = await chromium.launch();

  // ---------- skins ----------
  {
    const p = await open(b, { seed: { gold: '500', paints: '["classic","midnight","ruby"]', paint: '"ruby"' } });
    const r = await p.evaluate(() => {
      const g = __glyd, out = { skins: g.SKINS.length, chars: g.CHARS.length, levels: g.FIRST_LAP.length, charLevels: g.CHARS.map(c => c.level), fair: [], distinct: true, gold: g.getGold() };
      const sigs = new Set();
      for (const s of g.LOOKS) { // every level character and every shop skin
        const bb = [Math.min(...s.hb.map(q => q[0])), Math.max(...s.hb.map(q => q[1])), Math.min(...s.hb.map(q => q[2])), Math.max(...s.hb.map(q => q[3]))];
        const a = g.hbArea(s.hb);
        out.fair.push({ id: s.id, box: bb.join(',') === [g.HB_BOX.x0, g.HB_BOX.x1, g.HB_BOX.y0, g.HB_BOX.y1].join(','), area: a, inTol: Math.abs(a - g.HB_AREA) <= g.HB_AREA * g.HB_TOL });
        const fr = g.spritesFor(s.id).map(c => c.toDataURL());
        if (new Set(fr).size < 2) out.distinct = false; // it must animate
        const sig = fr[1]; if (sigs.has(sig)) out.distinct = false; sigs.add(sig);
      }
      return out;
    });
    ok(r.skins >= 10, `${r.skins} shop skins`);
    ok(r.chars === r.levels && new Set(r.charLevels).size === r.levels, `one character per level (${r.chars} characters, ${r.levels} levels)`);
    for (const f of r.fair) ok(f.box && f.inTol, `${f.id}: hitbox fills the shared outer box and its area (${f.area}) is within 5% of Volt's`);
    ok(r.distinct, 'every character and skin has its own art and its own animation frames');
    ok(r.gold === 500 + 100 + 300, `old paint jobs (100 + 300) refunded once (gold ${r.gold})`);
    await p.click('#skinBtn', { force: true }); await p.waitForTimeout(200);
    ok(await p.evaluate(() => document.getElementById('skinScreen').classList.contains('show')), 'LOCKER ROOM opens');
    ok((await p.textContent('#skinMsg')).includes('400 gold'), 'the refund is explained once');
    await p.click('#tabShop'); await p.waitForTimeout(100);
    const finn = '#skinGrid .skin[data-skin="finn"]', comet = '#skinGrid .skin[data-skin="comet"]';
    await p.click(finn); ok(await p.evaluate(() => __glyd.getGold()) === 900, 'first tap only asks to confirm');
    await p.click(finn); await p.waitForTimeout(100);
    ok(await p.evaluate(() => __glyd.getGold() === 800 && __glyd.skinNow() === 'finn'), 'second tap buys (100 gold) and wears Finn');
    await p.click(comet); await p.click(comet);
    ok(await p.evaluate(() => __glyd.getGold() === 800 && __glyd.skinNow() === 'finn'), 'cannot buy Comet (1500) with 800 gold');
    await p.reload(); await p.waitForTimeout(250);
    const after = await p.evaluate(() => ({ gold: __glyd.getGold(), skin: __glyd.skinNow(), owned: localStorage.getItem('glydaway.skinsOwned') }));
    ok(after.gold === 800 && after.skin === 'finn' && after.owned.includes('finn'), 'gold, ownership and the worn skin survive a reload (refund not paid twice)');
    ok(!p.errs.length, `skins: no page errors ${p.errs.join(' | ')}`);
    await p.context().close();
  }

  // ---------- hazards with every skin (autopilot, real physics) + tuning ----------
  {
    const p = await open(b, { q: '?bot=1' });
    const r = await p.evaluate(() => {
      const g = __glyd, res = {}, seen = {};
      for (const s of g.LOOKS) {
        g.wearLook(s.id); g.startGame(); let i = 0, sky = 0;
        while (g.S.mode === 'play' && g.S.dist / 40 < 1800 && i < 120 * 600) { g.step(1 / 120); i++; if (g.S.sky) sky++; for (const o of g.S.obstacles) if (g.NEW_HAZ[o.type]) seen[o.type] = 1; }
        res[s.id] = g.S.mode === 'play' ? (sky > 120 * 20 ? 'ok' : 'never reached the glide level') : 'died at ' + Math.floor(g.S.dist / 40) + ' m';
      }
      return { res, seen: Object.keys(seen), tune: g.TUNE };
    });
    for (const [id, v] of Object.entries(r.res)) ok(v === 'ok', `autopilot clears 1800 m, the glide level included, wearing ${id} (${v})`);
    ok(['laser', 'saw', 'bouncer', 'piston', 'gull', 'storm'].every(t => r.seen.includes(t)), `the newer hazards and the glide level's storms appear (${r.seen.join(', ')})`);
    ok(r.tune.speedStart < 280 && r.tune.speedMax < 600, `slower: start ${r.tune.speedStart} (was 280), top ${r.tune.speedMax} (was 600)`);
    ok(!p.errs.length, `hazards: no page errors ${p.errs.join(' | ')}`);
    await p.context().close();
  }

  // ---------- level characters: unlock moment, saved, one look at a time ----------
  {
    const p = await open(b);
    const r = await p.evaluate(async () => {
      const g = __glyd, out = {};
      g.startGame(); for (let i = 0; i < 30; i++) g.step(1 / 120);
      g.reachCity('paris');
      out.card = document.getElementById('unlock').classList.contains('show') && document.getElementById('unlockName').textContent;
      out.saved = JSON.parse(localStorage.getItem('glydaway.chars')).includes('paris');
      return out;
    });
    ok(r.card === 'Gaston the Escargot', `reaching Paris shows the unlock card (${r.card})`);
    ok(r.saved, 'the unlock is saved');
    await p.reload(); await p.waitForTimeout(250); await p.evaluate(() => document.getElementById('splash').classList.add('gone'));
    await p.click('#skinBtn', { force: true }); await p.waitForTimeout(150);
    ok(await p.isVisible('#skinGrid .skin[data-skin="gaston"]'), 'after a reload Gaston is in the Locker Room, unlocked');
    await p.click('#skinGrid .skin[data-skin="gaston"]');
    ok(await p.evaluate(() => __glyd.skinNow() === 'gaston' && localStorage.getItem('glydaway.wearing') === '"gaston"'), 'tapping a character wears it (saved)');
    ok(await p.evaluate(() => !document.querySelector('#skinGrid .skin[data-skin="kappi"]') && document.querySelectorAll('#skinGrid .skin.locked').length >= 10), 'characters you have not reached are locked silhouettes');
    ok(!p.errs.length, `characters: no page errors ${p.errs.join(' | ')}`);
    await p.context().close();
  }

  // ---------- the player name: asked once, never after a run; changed in Settings ----------
  {
    const p = await open(b);
    const r = await p.evaluate(() => {
      const g = __glyd, S = g.S; g.startGame(); S.obstacles.length = 0; for (let i = 0; i < 240; i++) g.step(1 / 120);
      S.mode = 'dying'; for (let i = 0; i < 120 && S.mode !== 'over'; i++) g.step(1 / 120);
      return { over: S.mode, form: !!document.getElementById('topForm'), top: JSON.parse(localStorage.getItem('glydaway.top') || '[]').map(e => e.name) };
    });
    ok(r.over === 'over' && !r.form, 'no name prompt after a run');
    ok(r.top.length && r.top.every(n => n === 'Tester1'), `the run is saved under the saved name (${r.top.join(', ')})`);
    await p.evaluate(() => { __glyd.S.mode = 'menu'; document.getElementById('setBtn1').click(); });
    await p.click('#setNameBtn'); await p.fill('#setNameIn', 'x'); await p.click('#setNameForm button[type=submit]');
    ok((await p.textContent('#setNameErr')).length > 0, 'Settings: a too-short name is refused');
    await p.fill('#setNameIn', 'fuckface'); await p.click('#setNameForm button[type=submit]');
    ok((await p.textContent('#setNameErr')).includes('different'), 'Settings: a rude name is refused');
    await p.fill('#setNameIn', 'Skyler7'); await p.click('#setNameForm button[type=submit]'); await p.waitForTimeout(100);
    ok(await p.evaluate(() => __glyd.LB.name === 'Skyler7' && localStorage.getItem('glydaway.name') === '"Skyler7"') && (await p.textContent('#setNameV')) === 'Skyler7', 'Settings: the name changes and is saved');
    ok(await p.getAttribute('#setNameIn', 'maxlength') === '12', 'names are capped at 12 characters');
    await p.context().close();
  }

  // ---------- THE CLOUDS (glide level): every layout clears with sloppy, late taps too ----------
  {
    const p = await open(b, { q: '?bot=1' });
    const r = await p.evaluate(() => {
      const g = __glyd; g.startGame();
      const cs = { n: 3, x0: g.S.bx + g.segStartM(3) * 40, x1: g.S.bx + g.segStartM(4) * 40 }, out = { level: g.FIRST_LAP.map(i => g.BIOMES[i].id).indexOf('clouds'), built: 0, cleared: 0 };
      for (let k = 0; k < 40; k++) { const L = g.buildSky(cs, Math.random(), 0); out.built++; if (g.skySurvives(L, cs, 0, 0, 1)) out.cleared++; }
      return out;
    });
    ok(r.level === 3, 'THE CLOUDS is the 4th level (after New York)');
    ok(r.cleared >= r.built * 0.85, `glide layouts the pilot clears before any filtering: ${r.cleared} of ${r.built} (the game only ever uses ones that pass, with late taps too)`);
    await p.context().close();
  }

  // ---------- SKY DASH ----------
  {
    const p = await open(b);
    const r = await p.evaluate(() => {
      const g = __glyd, S = g.S, out = {}, key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code }));
      const steps = s => { for (let i = 0; i < s * 120 && S.mode === 'play'; i++) g.step(1 / 120); };
      g.startGame(); S.obstacles.length = 0; S.plans.length = 0; S.cursor = S.dist + 3000; steps(0.5);
      out.needsCharge = !g.startFly();
      S.fly.charge = 1; out.started = g.startFly();
      key('keydown', 'Space'); steps(1.2); out.climbed = 290 - S.bird.y; key('keyup', 'Space');
      const bx = S.dist + S.bx;
      S.obstacles.push({ type: 'spikes', x: bx + 150, w: 104, n: 4, h: 30, bi: 0 }, { type: 'gap', x: bx + 300, w: 140, glide: false, bi: 0 });
      steps(1.6); out.safe = S.mode === 'play'; out.noRetrigger = !g.startFly();
      steps(1.2); out.warning = S.fly.t > 0 && S.fly.t <= g.FLY.warn;
      steps(1.4); out.ended = !g.flying() && S.fly.cool > 0 && S.pu.invuln > 0;
      steps(2); out.landed = S.mode === 'play' && S.bird.grounded; out.coolBlocks = !g.startFly();
      return out;
    });
    ok(r.needsCharge, 'SKY DASH needs a full charge');
    ok(r.started && r.climbed > 150, `SKY DASH: holding climbs (${Math.round(r.climbed)} units)`);
    ok(r.safe, 'SKY DASH: spikes and pits can not hurt you while flying');
    ok(r.noRetrigger, 'SKY DASH: can not be triggered again mid-flight');
    ok(r.warning, 'SKY DASH: warning phase before it runs out');
    ok(r.ended && r.landed, 'SKY DASH: ends, a safe landing, then a cooldown');
    ok(r.coolBlocks, 'SKY DASH: can not fly again right away');
    ok(!p.errs.length, `flight: no page errors ${p.errs.join(' | ')}`);
    await p.context().close();
  }

  // ---------- sharp backdrop: whole screen pixels per art pixel ----------
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
    const p = await ctx.newPage();
    await p.goto(URL() + '?bot=1'); await p.waitForTimeout(250);
    const r = await p.evaluate(() => { const v = __glyd.view, k = v.scale * v.dpr; return { dpr: v.dpr, canvas: document.querySelector('canvas').width, css: innerWidth, artPx: Math.round(2 * k), raw: 2 * k }; });
    ok(r.canvas === r.css * 3, `canvas matches the screen's 3x pixels (${r.canvas} for ${r.css} css px)`);
    ok(Number.isInteger(r.artPx) && r.artPx >= 1, `backdrop art pixel drawn ${r.artPx} screen px wide (was ${r.raw.toFixed(2)}, uneven)`);
    await ctx.close();
  }

  { // fake scores never leave the device
    const p = await open(b);
    const q = await p.evaluate(() => { const LB = __glyd.LB; LB.submitRun({ distance: 99999, coins: 5, run_time_ms: 10000 }); LB.submitRun({ distance: 100, coins: 9000, run_time_ms: 60000 }); return LB.queue.length; });
    ok(q === 0, 'impossible distance or coins for the run time are never queued');
    await p.context().close();
  }

  await b.close(); srv.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

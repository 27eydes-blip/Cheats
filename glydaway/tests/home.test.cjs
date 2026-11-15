// Home screen checks for Glydaway: run with `node glydaway/tests/home.test.cjs` (needs Playwright with
// WebKit, Chromium and Firefox). Layout on iPhone SE / 15 / 17 Pro Max / iPad in both orientations, in
// Safari and as a home-screen app (with the notch / Dynamic Island / home-bar safe areas), plus the
// tutorial, keyboard hint, one-time tips, the board, takeoff, planes and frame rate on all three engines.
// SHOTS=<dir> also saves a screenshot of every layout.
const { webkit, chromium, firefox, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.SHOTS;
const CREDIT = 'Gleyde Technologies, LLC · Created by Sam Eyde III · Produced by Juwon Shon';
const srv = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': 'text/html' }); r.end(d); } });
}).listen(0);
const URL = () => `http://localhost:${srv.address().port}/`;

let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };
const SEED = () => { try {
  localStorage.setItem('glydaway.tutDone', 'true'); localStorage.setItem('glydaway.sidewaysTold', 'true');
  localStorage.setItem('glydaway.best', '{"m":1234,"coins":87}'); localStorage.setItem('glydaway.skins', '["volt","airport","paris","nyc","tokyo"]');
} catch (e) {} };
async function open(ctx, { seed = true, q = '' } = {}) {
  if (seed) await ctx.addInitScript(SEED);
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', e => p.errs.push(e.message)); p.on('crash', () => p.errs.push('crashed'));
  await p.goto(URL() + q); await p.waitForTimeout(250);
  await p.evaluate(() => document.getElementById('splash').classList.add('gone'));
  await p.waitForTimeout(500);
  return p;
}
const onHome = p => p.evaluate(() => document.getElementById('startScreen').classList.contains('show'));
const mode = p => p.evaluate(() => __glyd.S.mode);

// ---------- layout ----------
// browser = Safari's visible area (Playwright's device viewports); app = full screen from the home screen
const PHONES = [
  ['iPhone SE', 'iPhone SE (3rd gen)', { w: 375, h: 667, p: [20, 0, 0, 0], l: [0, 0, 0, 0] }],
  ['iPhone 15', 'iPhone 15', { w: 393, h: 852, p: [59, 0, 34, 0], l: [0, 59, 21, 59] }],
  ['iPhone 17 Pro Max', 'iPhone 17 Pro Max', { w: 440, h: 956, p: [62, 0, 34, 0], l: [0, 62, 21, 62] }],
  ['iPad', 'iPad (gen 11)', { w: 820, h: 1180, p: [24, 0, 20, 0], l: [24, 0, 20, 0] }],
];
const overlap = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
async function layout(p, tag, inset) {
  if (inset) await p.evaluate(([t, r, b, l]) => { const s = document.documentElement.style; s.setProperty('--sat', t + 'px'); s.setProperty('--sar', r + 'px'); s.setProperty('--sab', b + 'px'); s.setProperty('--sal', l + 'px'); }, inset);
  await p.waitForTimeout(250);
  const r = await p.evaluate(() => {
    const box = el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
    const vis = el => el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
    const pick = { coins: '.stat-pill.coins', best: '.stat-pill.dist', title: '.logo', tagline: '.tagline', board: '#board', hero: '#heroBtn',
      play: '#playBtn', lb: '#lbBtn1', locker: '#skinBtn', settings: '#setBtn1', kb: '.kb-hint', tip: '#sideTip', credit: '.credit-foot' };
    const els = {};
    for (const [k, sel] of Object.entries(pick)) { const el = document.querySelector('#startScreen ' + sel); if (vis(el)) els[k] = box(el); }
    const cs = getComputedStyle(document.documentElement), px = v => parseFloat(cs.getPropertyValue(v)) || 0;
    const clipped = [...document.querySelectorAll('#startScreen .nav-btn span, #startScreen .board, #startScreen .stat-pill, #startScreen #playBtn')]
      .filter(e => e.scrollWidth > e.clientWidth + 1 || (e.closest('.nav-btn') && e.getBoundingClientRect().right > e.closest('.nav-btn').getBoundingClientRect().right + 0.5)).map(e => e.id || e.className || e.textContent);
    const area = document.getElementById('homeHero').getBoundingClientRect();
    const g = __glyd, inGame = 26 * 1.45 * g.view.scale;
    return { els, vw: innerWidth, vh: innerHeight, safe: [px('--sat'), px('--sar'), px('--sab'), px('--sal')], clipped, ground: area.bottom,
      heroX: els.hero ? els.hero.w / inGame : 0, chips: document.querySelectorAll('#startScreen .chip').length,
      credit: document.querySelector('#startScreen .credit-foot').textContent, world: g.S.obstacles.length + g.S.coinList.length + g.S.pickups.length };
  });
  const [st, sr, sb, sl] = r.safe, names = Object.keys(r.els);
  const out = names.filter(k => { const b = r.els[k]; return b.x < sl - 0.5 || b.y < st - 0.5 || b.x + b.w > r.vw - sr + 0.5 || b.y + b.h > r.vh - sb + 0.5; });
  ok(!out.length, `${tag}: everything on screen and inside the safe area ${out.join(',')}`);
  const hits = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (overlap(r.els[names[i]], r.els[names[j]])) hits.push(names[i] + '/' + names[j]);
  ok(!hits.length, `${tag}: nothing overlaps ${hits.join(' ')}`);
  ok(!r.clipped.length, `${tag}: no clipped text ${r.clipped.join(',')}`);
  const below = ['play', 'lb', 'locker', 'settings'].filter(k => r.els[k] && r.els[k].y < r.ground - 0.5);
  ok(!below.length && r.els.hero.y + r.els.hero.h <= r.ground + 0.5, `${tag}: buttons sit on the tarmac below the runway line, the hero above it ${below.join(',')}`);
  ok(r.world === 0, `${tag}: no hazards, coins or power-ups behind the menu`);
  ok(r.heroX >= 2.2, `${tag}: hero is ${r.heroX.toFixed(1)}x its in-game size`);
  ok(r.chips === 0, `${tag}: no how-to chips on the home screen`);
  ok(r.credit === CREDIT, `${tag}: credit line exact`);
  if (r.vw > r.vh) {
    const mid = r.vw / 2;
    ok(['title', 'board', 'hero'].every(k => r.els[k].x + r.els[k].w <= mid + 1) && ['play', 'lb', 'locker', 'settings'].every(k => r.els[k].x >= mid - 1), `${tag}: title + hero on the left, PLAY + buttons on the right`);
  }
  return r;
}

(async () => {
  // ----- layouts (WebKit, the iPhone/iPad engine) -----
  const wk = await webkit.launch();
  for (const [name, dev, app] of PHONES) for (const land of [false, true]) for (const kind of ['browser', 'app']) {
    const d = devices[dev], o = land ? 'landscape' : 'portrait';
    const vp = kind === 'browser' ? (land ? { width: d.viewport.height, height: d.viewport.width } : d.viewport) : (land ? { width: app.h, height: app.w } : { width: app.w, height: app.h });
    const ctx = await wk.newContext({ ...d, viewport: vp, deviceScaleFactor: 2 });
    const p = await open(ctx);
    await layout(p, `${name} ${o} (${kind} ${vp.width}x${vp.height})`, kind === 'app' ? (land ? app.l : app.p) : null);
    if (SHOTS && kind === 'browser') await p.screenshot({ path: path.join(SHOTS, `${name.toLowerCase().replace(/ /g, '-')}-${o}.png`) });
    ok(!p.errs.length, `${name} ${o} ${kind}: no page errors ${p.errs.join(' | ')}`);
    await ctx.close();
  }

  // ----- touch phone: no keyboard hint; the sideways tip once; tutorial by touch; hero opens the Locker Room -----
  {
    const ctx = await wk.newContext({ ...devices['iPhone 15'] });
    await ctx.addInitScript(() => localStorage.setItem('glydaway.best', '{"m":40,"coins":3}'));
    let p = await open(ctx, { seed: false });
    ok(await p.evaluate(() => getComputedStyle(document.querySelector('.kb-hint')).display === 'none'), 'iPhone: keyboard hint hidden on a touch device');
    ok(await p.evaluate(() => getComputedStyle(document.getElementById('sideTip')).display !== 'none'), 'iPhone: "turn sideways" tip shows on the first launch');
    await p.tap('#heroBtn'); await p.waitForTimeout(300);
    ok(await p.evaluate(() => document.getElementById('skinScreen').classList.contains('show')), 'iPhone: tapping the hero opens the Locker Room');
    await p.tap('#skinClose'); await p.waitForTimeout(300);
    await p.tap('#playBtn', { force: true }); await p.waitForTimeout(400);
    ok(await p.evaluate(() => document.getElementById('tutScreen').classList.contains('show')) && await mode(p) === 'menu', 'iPhone: the first PLAY opens the tutorial, not a run');
    const stage = await p.locator('#tutStage').boundingBox(), cx = stage.x + stage.width / 2, cy = stage.y + stage.height / 2;
    const step = () => p.evaluate(() => [...document.querySelectorAll('#tutDots i')].findIndex(i => i.classList.contains('on')));
    await p.touchscreen.tap(cx, cy); await p.waitForTimeout(1100);
    ok(await step() === 1, 'tutorial: tap to jump → next step');
    await p.dispatchEvent('#tutStage', 'pointerdown', { pointerId: 7, isPrimary: true }); await p.waitForTimeout(150);
    await p.dispatchEvent('#tutStage', 'pointerup', { pointerId: 7, isPrimary: true }); await p.waitForTimeout(400);
    ok(await step() === 1, 'tutorial: a short tap does not count as a hold');
    await p.dispatchEvent('#tutStage', 'pointerdown', { pointerId: 7, isPrimary: true }); await p.waitForTimeout(650);
    await p.dispatchEvent('#tutStage', 'pointerup', { pointerId: 7, isPrimary: true }); await p.waitForTimeout(1100);
    ok(await step() === 2, 'tutorial: hold to glide → next step');
    await p.touchscreen.tap(cx, cy); await p.waitForTimeout(120); await p.touchscreen.tap(cx, cy); await p.waitForTimeout(1100);
    ok(await step() === 3, 'tutorial: double-tap to flip → power-ups');
    ok(await p.evaluate(() => getComputedStyle(document.getElementById('tutPus')).display !== 'none' && document.getElementById('tutPus').textContent.replace(/\s+/g, ' ').includes('MAGNET')), 'tutorial: shows MAGNET / SHIELD / BOOST');
    await p.tap('#tutNext'); await p.waitForTimeout(1200);
    ok(await mode(p) === 'play' && await p.evaluate(() => localStorage.getItem('glydaway.tutDone') === 'true'), 'tutorial: LET\'S FLY takes off into the run, and it\'s remembered');
    await p.reload(); await p.waitForTimeout(300); await p.evaluate(() => document.getElementById('splash').classList.add('gone')); await p.waitForTimeout(400);
    ok(await p.evaluate(() => getComputedStyle(document.getElementById('sideTip')).display === 'none'), 'iPhone: the sideways tip never shows again');
    await p.tap('#playBtn', { force: true }); await p.waitForTimeout(150);
    ok(await p.evaluate(() => !document.getElementById('tutScreen').classList.contains('show') && __glyd.home.launching), 'second PLAY: no tutorial, the hero takes off');
    await ctx.close();
  }

  // ----- desktop browsers -----
  for (const [name, bt] of [['Chromium', chromium], ['Firefox', firefox], ['WebKit', webkit]]) {
    const b = name === 'WebKit' ? wk : await bt.launch();
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await open(ctx);
    await layout(p, `${name} desktop`);
    ok(await p.evaluate(() => getComputedStyle(document.querySelector('.kb-hint')).display !== 'none'), `${name}: keyboard hint shows with a keyboard`);
    // the board shows real data
    const msgs = await p.evaluate(() => __glyd.boardMessages());
    ok(JSON.stringify(msgs) === JSON.stringify([['NEXT FLIGHT', 'PARIS'], ['CITIES REACHED', '4 OF 13'], ['NEXT NEW CITY', 'LONDON']]), `${name}: board lines ${JSON.stringify(msgs)}`);
    await p.waitForTimeout(900);
    ok(await p.evaluate(() => document.getElementById('boardV').textContent.includes('PARIS') && document.getElementById('boardK').textContent === 'NEXT FLIGHT'), `${name}: board flips to NEXT FLIGHT PARIS`);
    // a plane takes off, then the next one is 10-15 s later
    await p.evaluate(() => { __glyd.home.nextPlane = 0; }); await p.waitForTimeout(200);
    const pl = await p.evaluate(() => [!!__glyd.home.plane, __glyd.home.nextPlane]);
    ok(pl[0] && pl[1] + 7.5 >= 10 && pl[1] + 7.5 <= 15, `${name}: a plane takes off; the next one in ${(pl[1] + 7.5).toFixed(1)} s`);
    // smooth: frame rate on the home screen with everything moving
    const fps = await p.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now(); const f = t => { n++; if (t - t0 < 2500) requestAnimationFrame(f); else res(n / ((t - t0) / 1000)); }; requestAnimationFrame(f); }));
    p.fps = fps;
    if (name !== 'WebKit') ok(fps >= 55, `${name}: ${fps.toFixed(1)} fps on the home screen`);
    else console.log(`INFO  WebKit (software rendering here): ${fps.toFixed(1)} fps on the home screen`);
    // Settings > How to play, keyboard, Esc back to Settings
    await p.click('#setBtn1'); await p.waitForTimeout(250); await p.click('#howBtn'); await p.waitForTimeout(300);
    ok(await p.evaluate(() => document.getElementById('tutScreen').classList.contains('show')), `${name}: Settings > HOW TO PLAY opens the tutorial`);
    await p.keyboard.press('Space'); await p.waitForTimeout(1100);
    await p.keyboard.down('Space'); await p.waitForTimeout(600); await p.keyboard.up('Space'); await p.waitForTimeout(1100);
    ok(await p.evaluate(() => [...document.querySelectorAll('#tutDots i')].findIndex(i => i.classList.contains('on'))) === 2, `${name}: tutorial works with Space (tap, then hold)`);
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    ok(await p.evaluate(() => document.getElementById('setScreen').classList.contains('show')) && await mode(p) === 'menu', `${name}: Esc returns to Settings without starting a run`);
    await p.click('#setClose'); await p.waitForTimeout(300);
    // PLAY: the hero dashes down the runway and the run carries straight on
    await p.click('#playBtn', { force: true }); await p.waitForTimeout(250);
    ok(await p.evaluate(() => __glyd.home.launching && __glyd.S.mode === 'menu' && __glyd.S.speed > 0), `${name}: PLAY starts the takeoff`);
    await p.waitForTimeout(700);
    const run = await p.evaluate(() => [__glyd.S.mode, __glyd.S.dist, __glyd.S.speed, __glyd.home.camT]);
    ok(run[0] === 'play' && run[1] >= 0 && run[1] < 400 && run[2] >= 280 && run[3] === 0, `${name}: takeoff hands over to the run (${run.map(v => typeof v === 'number' ? v.toFixed(0) : v).join(', ')})`);
    await p.waitForTimeout(1500);
    ok(await p.evaluate(() => __glyd.S.obstacles.length > 0 && __glyd.S.dist > 300), `${name}: the run plays as before`);
    ok(!p.errs.length, `${name}: no page errors ${p.errs.join(' | ')}`);
    await ctx.close(); if (b !== wk) await b.close();
  }
  // Reduce Motion: no takeoff animation, still starts
  {
    const ctx = await chromium.launch().then(b => b.newContext({ viewport: { width: 900, height: 700 }, reducedMotion: 'reduce' }));
    const p = await open(ctx);
    await p.click('#playBtn', { force: true }); await p.waitForTimeout(150);
    ok(await mode(p) === 'play', 'Reduce Motion: PLAY starts the run right away');
    await ctx.browser().close();
  }
  await wk.close(); srv.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

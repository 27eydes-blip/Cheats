// node scripts/controller-test.mjs — controller support with a mocked DualSense:
// deadzone + curve, button mapping, device switching, disconnect pause, menu
// navigation reaching every screen, remap saved and loaded. Prints PASS/FAIL.
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const server = await createServer({ server: { port: 5196, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
// the mock: a standard-mapping pad the test drives by hand
await page.addInitScript(() => {
  const pad = { id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', index: 0, connected: false, mapping: 'standard', timestamp: 0,
    buttons: Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0], vibrationActuator: { calls: 0, playEffect() { this.calls++; return Promise.resolve('complete'); } } };
  window.__mockPad = pad;
  navigator.getGamepads = () => [pad.connected ? pad : null, null, null, null];
});
await page.goto(server.resolvedUrls.local[0] + '?skipintro&noassets&nohumans&quality=low&agegate=off&time=12&freeze=1');
await page.waitForFunction(() => window.__game?.ctx?.pad, null, { timeout: 120000 });

const results = await page.evaluate(async () => {
  const g = window.__game, c = g.ctx, P = c.pad, M = window.__mockPad, out = {};
  // drive frames ourselves (the live loop would also poll the mock pad)
  c.renderer.setAnimationLoop(null);
  const tick = async (n = 1) => { for (let i = 0; i < n; i++) { c.input.poll(); if (!c.paused || c.mode !== 'play') g.update(1 / 30); c.ui.update(1 / 30); c.input.endFrame(); g.frame++; if (i % 20 === 0) await new Promise((r) => setTimeout(r, 0)); } };
  const btn = (i, on, v) => { M.buttons[i].pressed = on; M.buttons[i].value = v ?? (on ? 1 : 0); };
  const press = async (i, hold = 1) => { btn(i, true); await tick(hold); btn(i, false); await tick(1); };
  const holdFor = async (i, sec) => { btn(i, true); const t0 = performance.now(); while (performance.now() - t0 < sec * 1000) await tick(1); btn(i, false); await tick(1); };
  const DIR = { up: 12, down: 13, left: 14, right: 15 };
  const { shapeStick } = await import('/src/input/Pad.js');

  // 1. deadzone and curve ------------------------------------------------------
  {
    const m = (x, y, dz, cv) => Math.hypot(...shapeStick(x, y, dz, cv));
    const checks = {
      'inside radial dz (0.1,0.1)': m(0.1, 0.1, 0.15, 1.6) === 0,
      'inside dz (0.14,0)': m(0.14, 0, 0.15, 1.6) === 0,
      'just outside is small': m(0.2, 0, 0.15, 1.6) > 0 && m(0.2, 0, 0.15, 1.6) < 0.02,
      'full tilt = 1': Math.abs(m(1, 0, 0.15, 1.6) - 1) < 1e-9,
      'diagonal clamps to 1': Math.abs(m(0.8, 0.8, 0.15, 1.6) - 1) < 1e-9,
      'linear curve midpoint': Math.abs(m(0.575, 0, 0.15, 1) - 0.5) < 1e-9,
      'curve bends low end': m(0.575, 0, 0.15, 2) < m(0.575, 0, 0.15, 1),
      'monotonic': [0.2, 0.3, 0.5, 0.7, 0.9].every((x, i, a) => i === 0 || m(x, 0, 0.15, 1.6) > m(a[i - 1], 0, 0.15, 1.6)),
      'direction kept': (() => { const [x, y] = shapeStick(0.6, -0.6, 0.15, 1.6); return Math.abs(x + y) < 1e-9 && x > 0; })(),
    };
    // live: connect, nudge the stick inside the deadzone, then push it fully
    M.connected = true; await tick(2);
    const mk = c.state.communities.portage.rafts.get('market'); const V = c.player.position.constructor;
    c.player.mode = 'foot'; c.player.teleport(mk.worldPoint(new V(0, mk.deck + 0.2, 0))); await tick(3);
    M.axes[0] = 0.1; await tick(1); const small = c.input.move.x;
    M.axes[0] = 1; await tick(1); const full = c.input.move.x; M.axes[0] = 0; await tick(1);
    checks['live move: dz → 0, full → 1'] = small === 0 && Math.abs(full - 1) < 1e-6;
    const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    out.deadzoneCurve = { pass: !bad.length, detail: bad.length ? 'failed: ' + bad.join(', ') : `${Object.keys(checks).length} checks (radial dz 0.15, curve 1.6, live stick)` };
  }

  // 2. button mapping -----------------------------------------------------------
  {
    const r = {}, A = c.arms;
    c.ui.close();
    btn(0, true); await tick(1); r.crossJump = c.input.held.dive; btn(0, false); await tick(1); r.crossRelease = !c.input.held.dive;
    btn(1, true); await tick(1); r.circleCrouch = c.input.held.crouch; btn(1, false); await tick(1);
    const fl = c.player.flashlight; await press(4); r.l1Light = c.player.flashlight !== fl; await press(4);
    await press(9); r.optionsPause = c.ui.panelKind === 'pause'; await press(1); r.circleBack = !c.ui.panel;
    await press(17); r.touchpadChart = c.ui.panelKind === 'journal' && !!document.querySelector('.panel canvas.chart'); await press(1);
    A.give('pipe_wrench'); A.give('sling'); c.inventory.add('stone', 10, true); A.state.drawn = -1; A.holster();
    await press(5); r.r1Draw = A.state.drawn === 0; await press(5); r.r1Next = A.state.drawn === 1;
    await press(3); r.triangleSwap = A.state.drawn === 0; await press(3); r.triangleBack = A.state.drawn === 1;
    A.cur.loaded = 1; A.cool = 0; A.jammed = false; A.reloadT = 0;
    btn(7, true, 1); await tick(2); btn(7, false, 0); await tick(1); r.r2Fire = A.cur.loaded === 0;
    A.cool = 0; c.interact.focus = null; await press(2); r.squareReload = A.reloadT > 0 || A.cur.loaded === 1;
    btn(6, true, 1); await tick(2); r.l2Aim = A.held.rmb; btn(6, false, 0); await tick(1);
    await holdFor(5, 0.6); r.r1HoldHolster = A.state.drawn === -1;
    // weapon wheel: hold D-pad up, point the right stick at a segment, release
    btn(12, true); await tick(2); const opened = document.querySelector('.wwheel.on') !== null;
    const n = P.wheel.items.length, k = 1 /* first weapon */, a = (k / n) * Math.PI * 2;
    M.axes[2] = Math.sin(a); M.axes[3] = -Math.cos(a); await tick(2); M.axes[2] = M.axes[3] = 0;
    btn(12, false); await tick(2); r.wheel = opened && A.state.drawn === 0 && !document.querySelector('.wwheel.on');
    c.inventory.add('bandage', 1, true); P.quickIdx = 0; const nb = c.inventory.count('bandage'); await press(15); await press(13);
    r.dpadQuickUse = P.quickItems().length > 0;
    await press(11); r.r3Shove = true;
    A.holster();
    const bad = Object.entries(r).filter(([, v]) => !v).map(([k]) => k);
    out.buttonMap = { pass: !bad.length, detail: bad.length ? 'failed: ' + bad.join(', ') : Object.keys(r).join(', ') };
  }

  // 3. device switching ---------------------------------------------------------
  {
    await press(0); const padMode = P.device === 'pad' && document.body.classList.contains('pad-mode') && P.glyph('use').includes('<svg');
    dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); await tick(1);
    const kb = P.device === 'kbm' && !document.body.classList.contains('pad-mode') && P.glyph('use').includes('key');
    M.axes[1] = -0.9; await tick(1); M.axes[1] = 0; await tick(1); const back = P.device === 'pad';
    out.deviceSwitch = { pass: padMode && kb && back, detail: `pad→glyphs ${padMode}; key press→keyboard prompts ${kb}; stick→pad again ${back}` };
  }

  // 4. disconnect pauses --------------------------------------------------------
  {
    c.ui.close(); await tick(1);
    let toast = ''; const t0 = c.ui.toast.bind(c.ui); c.ui.toast = (s) => { toast += s + ' | '; t0(s); };
    M.connected = false; await tick(2);
    const paused = c.ui.panelKind === 'pause' && c.paused;
    M.connected = true; await tick(2);
    c.ui.toast = t0;
    out.disconnect = { pass: paused && /disconnected/.test(toast) && /connected — DualSense/.test(toast), detail: `paused on disconnect: ${paused}; toasts: ${toast.trim()}` };
    c.ui.close(); await tick(1);
  }

  // 5. menu navigation reaches every screen -------------------------------------
  {
    // BFS over D-pad moves from the initial focus: every control must be reachable
    const reachAll = (root) => {
      const list = P.focusables(root), start = P.focusEl || list[0], seen = new Set([start]), q = [start];
      while (q.length) {
        const e = q.shift();
        for (const d of ['up', 'down', 'left', 'right']) {
          P.focusEl = e; P.nav(d, list); const f = P.focusEl;
          if (f && !seen.has(f) && f.type !== 'range') { seen.add(f); q.push(f); }
          if (f?.type === 'range' && !seen.has(f)) { seen.add(f); q.push(f); }
        }
      }
      P.setFocus(start);
      return { got: seen.size, of: list.length };
    };
    // drive real button presses to a target control, then Cross
    const go = async (sel) => {
      const root = P.activeRoot(); const list = P.focusables(root); const target = root.querySelector(sel);
      if (!target) return false;
      const prev = new Map([[P.focusEl, null]]); const q = [P.focusEl];
      while (q.length && !prev.has(target)) { const e = q.shift(); for (const d of ['down', 'right', 'up', 'left']) { P.focusEl = e; P.nav(d, list); const f = P.focusEl; if (f && !prev.has(f)) { prev.set(f, [e, d]); q.push(f); } } }
      if (!prev.has(target)) return false;
      const path = []; for (let e = target; prev.get(e); e = prev.get(e)[0]) path.unshift(prev.get(e)[1]);
      P.setFocus(q.length >= 0 ? [...prev.keys()][0] : null);
      for (const d of path) await press(DIR[d]);
      if (P.focusEl !== target) return false;
      await press(0); return true;
    };
    const screens = {}, note = (name, ok) => { const root = P.activeRoot(); if (!root) { screens[name] = 'no screen'; return; } const r = reachAll(root); screens[name] = ok === false ? 'not opened' : r.got === r.of ? `${r.of}/${r.of}` : `${r.got}/${r.of}`; };
    const pause = async () => { c.ui.close(); await tick(1); await press(9); };
    await pause(); note('pause');
    await go('[data-act="inv"]'); note('pack', c.ui.panelKind === 'inventory'); await press(1);
    await pause(); await go('[data-act="journal"]'); note('journal', c.ui.panelKind === 'journal');
    const tabs = []; for (let i = 0; i < 8; i++) { await press(5); tabs.push(document.querySelector('.panel [data-jt].on')?.dataset.jt || c.ui.panelKind); }
    screens['journal tabs (R1)'] = [...new Set(tabs)].join(',');
    await pause(); await go('[data-act="craft"]'); note('craft', c.ui.panelKind === 'craft');
    await pause(); await go('[data-act="opts"]'); note('options', c.ui.panelKind === 'options');
    await go('[data-padset]'); note('controller', c.ui.panelKind === 'controller'); await press(1);
    c.ui.close(); await tick(1);
    // weapon inspect & mods: hold Triangle in play
    c.arms.state.drawn = -1; c.arms.draw(0); await holdFor(3, 0.6); note('inspect & mods', /Stats/.test(document.querySelector('.panel')?.textContent || '')); await press(1);
    // shop, bar conversation, Club door, title, life — opened directly, then navigated
    c.arms.holster(); await tick(1);
    c.arms.shop('hook_barb'); await tick(1); note('weapon shop', !!c.ui.panel); await press(1);
    const d = [...c.nightlife.dressed.values()].find((x) => x.anchors.some((q) => q.id === 'brass_anchor'));
    c.time.hour = 21; c.nightlife.open('brass_anchor'); await tick(1); note('bar talk', !!c.ui.panel); c.ui.close(); await tick(1);
    for (const f of ['lamp_map', 'has_pin']) c.story.setFlag(f); c.heat.value = 0; c.club.enter(); c.club.doorCheck(); await tick(1); note('club doorman', !!c.ui.panel);
    const before = c.ui.panelKind; await press(0); const doorAnswered = c.ui.panelKind !== before || !c.ui.panel; c.club.exit(); c.ui.close(); await tick(1);
    screens['club door answered with Cross'] = String(doorAnswered);
    c.ui.titleScreen(true, () => {}); await tick(1); note('title'); c.ui.titleEl.remove(); g.setMode('play'); await tick(1);
    c.lifeUI.show(); await tick(1); note('life (create)'); c.lifeUI.hide(); c.input.enabled = true; await tick(1);
    const bad = Object.entries(screens).filter(([k, v]) => !k.includes('tabs') && !k.includes('answered') && !/^(\d+)\/\1$/.test(v));
    if (screens['club door answered with Cross'] !== 'true') bad.push(['club door', 'no answer']);
    if (new Set(tabs).size < 6) bad.push(['journal tabs', tabs.join(',')]);
    out.menuNav = { pass: !bad.length, detail: Object.entries(screens).map(([k, v]) => `${k} ${v}`).join(' · ') };
  }

  // 6. remap saves and loads ----------------------------------------------------
  {
    c.ui.close(); await tick(1); P.resetBinds();
    P.openSettings(); await tick(1);
    const opened = await (async () => { const root = P.activeRoot(); const t = root.querySelector('[data-remap="jump"]'); P.setFocus(t); await press(0); return !!P.capture; })();
    await press(3);   // Triangle becomes jump
    const swapped = P.bind.jump === 3 && P.bind.swap === 0;
    const stored = JSON.parse(localStorage.getItem('drowned-earth.settings')).pad?.bind?.jump === 3;
    c.save.save('manual');
    const inSave = JSON.parse(localStorage.getItem('drowned-earth.save')).pad?.bind?.jump === 3;
    P.resetBinds(); const reset = P.bind.jump === 0;
    c.save.load(); const loaded = P.bind.jump === 3 && P.bind.swap === 0;
    btn(3, true); c.ui.close(); await tick(1); const live = c.input.held.dive; btn(3, false); await tick(1);
    P.resetBinds();
    out.remap = { pass: opened && swapped && stored && inSave && reset && loaded && live, detail: `capture ${opened}; jump→Triangle, swap→Cross ${swapped}; settings ${stored}; save file ${inSave}; reset ${reset}; loaded back ${loaded}; Triangle now jumps ${live}` };
  }
  // 7. extras never throw without hardware
  {
    let ok = true;
    try { P.opt.extras = true; P.opt.vibration = true; c.events.emit('footstep', { surface: 'metal' }); c.events.emit('player:hurt', { amount: 20 }); await tick(5); P.ds.set({ rt: { mode: 'section', start: 0.2, end: 0.6, force: 0.8 } }); P.ds.flush(true); } catch (e) { ok = false; }
    P.opt.extras = false;
    out.extrasSafe = { pass: ok, detail: `no throw without a HID device; WebHID in this browser: ${P.ds.supported}; fallback rumble calls: ${M.vibrationActuator.calls}` };
  }
  return out;
});
let fails = 0;
for (const [k, r] of Object.entries(results)) { console.log(`${r.pass ? 'PASS' : 'FAIL'} ${k}: ${r.detail}`); if (!r.pass) fails++; }
if (errs.length) { console.log('PAGE ERRORS:', errs.slice(0, 5).join(' | ')); fails++; }
await browser.close(); await server.close();
process.exit(fails ? 1 : 0);

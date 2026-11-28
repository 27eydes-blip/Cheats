// Controller support (Gamepad API, standard mapping — tuned for a PS5 DualSense
// on PC). Three jobs:
//  1. gameplay: sticks move/look with a radial deadzone and response curve,
//     buttons drive the same actions as the keyboard (remappable, saved);
//  2. menus: every DOM screen becomes focus-navigable — D-pad / left stick moves
//     a visible highlight, Cross confirms, Circle goes back, L1/R1 switch tabs;
//  3. prompts: the last device used (keyboard+mouse, pad, touch) decides which
//     glyphs the HUD shows.
// DualSense extras (adaptive triggers, haptics, light bar) live in DualSense.js
// and only run when the toggle in Controller settings is on.
import * as THREE from 'three';
import { PAD_GLYPH, PAD_NAME, key, GLYPH_CSS } from './glyphs.js';
import { DualSense } from './DualSense.js';

export const DEFAULT_BIND = { jump: 0, crouch: 1, use: 2, swap: 3, light: 4, next: 5, aim: 6, attack: 7, photo: 8, pause: 9, sprint: 10, melee: 11, wheel: 12, quick: 13, quickPrev: 14, quickNext: 15, map: 17 };
export const ACTION_LABEL = {
  jump: 'Jump · swim down', crouch: 'Crouch · swim up · cut engine', use: 'Interact · reload', swap: 'Last weapon (hold: inspect & mods)',
  light: 'Flashlight · boat lantern', next: 'Next weapon (hold: holster)', aim: 'Aim · block', attack: 'Attack · fire (hold: heavy)',
  sprint: 'Sprint · boost', melee: 'Shove · boat camera', wheel: 'Weapon wheel (hold)', quick: 'Use quick item',
  quickPrev: 'Previous quick item · radio', quickNext: 'Next quick item · radio', pause: 'Pause menu', map: 'Chart (journal)', photo: 'Photo',
};
const KB = { jump: 'Space', crouch: 'C', use: 'E', swap: '1–4', light: 'F', next: '1–4', aim: 'RMB', attack: 'LMB', sprint: 'Shift', melee: 'Y', wheel: '1–4', quick: 'G', quickPrev: 'R', quickNext: 'R', pause: 'Esc', map: 'J', photo: 'K', reload: 'T', inspect: 'O' };
const QUICK = ['flare', 'noisemaker', 'bait', 'spear', 'salt', 'bandage', 'throw_net'];
const DEFAULTS = { dz: 0.15, curve: 1.6, sensX: 1, sensY: 1, invertY: false, assist: 'light', vibration: true, extras: false };
const HOLD = 0.45;

// radial deadzone + power curve; returns the shaped [x, y]
export function shapeStick(x, y, dz = 0.15, curve = 1.6) {
  const m = Math.hypot(x, y);
  if (m <= dz || m === 0) return [0, 0];
  const n = Math.min(1, (m - dz) / (1 - dz));
  const s = Math.pow(n, curve) / m;
  return [x * s, y * s];
}

const _v = new THREE.Vector3();

export class Pad {
  constructor(ctx) {
    this.ctx = ctx;
    const st = ctx.settings.pad || {};
    this.opt = { ...DEFAULTS, ...st };
    this.bind = { ...DEFAULT_BIND, ...(st.bind || {}) };
    this.device = ctx.input.usingTouch ? 'touch' : 'kbm';
    this.connected = false; this.name = '';
    this.prev = []; this.held = {}; this.holdT = {}; this.padHeld = {};
    this.focusEl = null; this.navDir = null; this.navT = 0; this.capture = null;
    this.lastT = performance.now(); this.quickIdx = 0; this.lastDrawn = -1;
    this.wheel = { open: false, sel: -1, items: [] };
    this.ds = new DualSense();
    this.fx = { pulses: [], beatT: 0, rainT: 0, trig: '', bar: '' };
    ctx.input.pad = this;
    // styles + HUD pieces
    const css = document.createElement('style'); css.textContent = GLYPH_CSS + '.wwheel .seg{transform:var(--t)}.wwheel .seg.sel{transform:var(--t) scale(1.08)}'; document.head.appendChild(css);
    this.bar = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'padbar' }));
    this.wheelEl = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'wwheel' }));
    // last-used device: any keyboard/mouse/touch activity switches back
    addEventListener('keydown', () => this.setDevice('kbm'), true);
    addEventListener('mousedown', () => this.setDevice('kbm'), true);
    addEventListener('mousemove', (e) => { if (Math.abs(e.movementX) + Math.abs(e.movementY) > 3) this.setDevice('kbm'); }, true);
    addEventListener('touchstart', () => this.setDevice('touch'), { capture: true, passive: true });
    addEventListener('gamepadconnected', () => { this.prev = []; });
    // keep the weapon system's hook pointing here
    if (ctx.arms) ctx.arms.pad = { setTrigger: () => {}, rumble: (ms) => this.rumble(ms > 50 ? 0.7 : 0.4, 0.5, ms) };
    // haptic events (only with extras on)
    const ev = ctx.events;
    ev.on('footstep', (e) => { if (this.fxOn() && ctx.player.mode !== 'boat') this.pulse(0, { metal: 0.35, wood: 0.22, water: 0.12, concrete: 0.28 }[e?.surface] ?? 0.18, 45); });
    ev.on('player:hurt', (e) => this.rumble(0.9, 0.6, 180 + Math.min(200, (e?.amount || 10) * 4)));
    ev.on('boat:impact', (e) => this.rumble(Math.min(1, (e?.speed || 2) / 6), 0.4, 160));
    ev.on('shake', (v) => this.rumble(Math.min(1, v), 0.3, 90));
    ev.on('weapon:jam', () => this.rumble(0, 0.5, 60));
    if (this.opt.extras) setTimeout(() => this.ds.restore(), 0);
  }

  // ------------------------------------------------------------ settings
  save() {
    const s = this.ctx.settings;
    s.pad = { ...this.opt, bind: { ...this.bind } };
    s.save();
  }
  toJSON() { return { ...this.opt, bind: { ...this.bind } }; }
  load(o) { if (!o) return; const { bind, ...rest } = o; Object.assign(this.opt, rest); if (bind) this.bind = { ...DEFAULT_BIND, ...bind }; this.save(); }
  setDevice(d) {
    if (this.device === d) return;
    this.device = d;
    document.body.classList.toggle('pad-mode', d === 'pad');
    if (d !== 'pad') { this.clearFocus(); this.closeWheel(false); }
    this.ctx.events.emit('input:device', d);
  }
  glyph(action) {
    if (this.device === 'pad') {
      if (action === 'reload') action = 'use';
      if (action === 'inspect') action = 'swap';
      return PAD_GLYPH[this.bind[action]] || '';
    }
    return key(KB[action] || action);
  }

  // ------------------------------------------------------------ reading
  readPad() {
    let list = [];
    try { list = navigator.getGamepads ? [...navigator.getGamepads()] : []; } catch { list = []; }
    const pads = list.filter((g) => g && g.connected);
    return pads.find((g) => /054c|dualsense|wireless controller/i.test(g.id)) || pads[0] || null;
  }
  poll() {
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0.001, (now - this.lastT) / 1000)); this.lastT = now;
    const p = this.readPad();
    if (p && !this.connected) this.onConnect(p);
    else if (!p && this.connected) this.onDisconnect();
    if (!p) { this.updateFx(dt, null); return null; }
    const b = [], v = [], down = [], up = [];
    for (let i = 0; i < Math.max(18, p.buttons.length); i++) {
      const bt = p.buttons[i];
      v[i] = bt ? (typeof bt === 'object' ? bt.value ?? (bt.pressed ? 1 : 0) : +bt) : 0;
      b[i] = bt ? !!(bt.pressed || v[i] > 0.5) : false;
      down[i] = b[i] && !this.prev[i]; up[i] = !b[i] && this.prev[i];
      if (b[i]) this.holdT[i] = (this.holdT[i] || 0) + dt; else if (!up[i]) this.holdT[i] = 0;
    }
    const ax = p.axes || [];
    const active = down.some(Boolean) || ax.some((a) => Math.abs(a) > 0.5);
    if (active) this.setDevice('pad');
    const S = { b, v, down, up, ax, dt };
    this.S = S;
    let move = null;
    if (this.capture) this.doCapture(S);
    else {
      // Options and the touchpad work everywhere
      if (down[this.bind.pause] && (this.ctx.mode === 'play' || this.ctx.ui.panel)) this.ctx.input.press('pause');
      if (up[this.bind.pause]) this.ctx.input.release('pause');
      if (down[this.bind.map] && this.ctx.mode === 'play' && !this.ctx.lifeActive) { if (this.ctx.ui.panelKind === 'journal') this.ctx.ui.close(); else this.ctx.ui.openJournal('map'); }
      const root = this.activeRoot();
      if (root) { this.releaseGameplay(); this.menu(root, S); }
      else { this.clearFocus(); if (this.ctx.mode === 'play' && !this.ctx.paused) move = this.gameplay(S); else this.releaseGameplay(); }
    }
    for (let i = 0; i < b.length; i++) { this.prev[i] = b[i]; if (up[i]) this.holdT[i] = 0; }
    this.updateFx(dt, p);
    return move;
  }
  onConnect(p) {
    this.connected = true; this.name = p.id || 'controller'; this.prev = p.buttons.map((x) => !!x?.pressed);
    const nice = /054c|dualsense/i.test(this.name) ? 'DualSense' : this.name.replace(/\(.*\)/, '').trim() || 'Controller';
    this.ctx.ui.toast(`Controller connected — ${nice}.`);
    this.setDevice('pad');
    this.ctx.events.emit('pad:connected', this.name);
    if (this.opt.extras && !this.ds.connected) this.ds.restore();
  }
  onDisconnect() {
    this.connected = false;
    this.releaseGameplay(); this.closeWheel(false);
    const c = this.ctx;
    c.ui.toast('Controller disconnected — game paused.');
    if (c.mode === 'play' && !c.ui.panel && !c.lifeActive) c.ui.openPause();
    this.setDevice(c.input.usingTouch ? 'touch' : 'kbm');
    c.events.emit('pad:disconnected');
  }

  // ------------------------------------------------------------ gameplay
  setHeld(action, on) {
    if (!!this.padHeld[action] === !!on) return;
    this.padHeld[action] = !!on;
    on ? this.ctx.input.press(action) : this.ctx.input.release(action);
  }
  releaseGameplay() {
    for (const a of Object.keys(this.padHeld)) this.setHeld(a, false);
    const A = this.ctx.arms;
    if (A && (this.armLmb || this.armRmb)) { A.held.lmb = false; A.held.rmb = false; }
    this.armLmb = this.armRmb = false; this.sprintLatch = false;
  }
  gameplay(S) {
    const c = this.ctx, B = this.bind, A = c.arms, { b, v, down, up, ax, dt } = S;
    const o = this.opt;
    let [mx, my] = shapeStick(ax[0] || 0, ax[1] || 0, o.dz, 1);
    let [lx, ly] = shapeStick(ax[2] || 0, ax[3] || 0, o.dz, o.curve);
    // weapon wheel takes the right stick while open
    if (b[B.wheel]) { if (!this.wheel.open) this.openWheel(); this.wheelSelect(ax[2] || 0, ax[3] || 0, ax[0] || 0, ax[1] || 0); c.hitStop = Math.max(c.hitStop || 0, 0.03); lx = ly = 0; }
    else if (this.wheel.open) this.closeWheel(true);
    // look: px/s scaled to match the mouse path (Player.look multiplies by 0.0022)
    const ads = A?.ads > 0.5 ? 0.6 : 1;
    let k = ads, pull = [0, 0];
    if (o.assist !== 'off' && A?.cur) ({ k, pull } = this.assist(k, Math.hypot(lx, ly), dt));
    const speed = 1150;
    c.input.addLook(lx * speed * o.sensX * dt * k + pull[0], ly * speed * o.sensY * dt * k * (o.invertY ? -1 : 1) + pull[1]);
    // held actions
    this.setHeld('dive', b[B.jump]);
    this.setHeld('crouch', b[B.crouch]);
    if (down[B.sprint]) this.sprintLatch = !this.sprintLatch;
    if (Math.hypot(mx, my) < 0.2 && c.player.mode !== 'boat') this.sprintLatch = false;
    this.setHeld('sprint', this.sprintLatch);
    this.setHeld('light', b[B.light]);
    // interact, or reload when a gun is out and there's nothing to use
    if (down[B.use]) { if (!c.interact.focus && A?.cur && A.kind(A.cur.id) === 'ranged') A.reload(); else this.setHeld('use', true); }
    if (up[B.use]) this.setHeld('use', false);
    if (A) {
      const has = !!A.cur;
      const aim = has && v[B.aim] > 0.25;
      if (aim !== this.armRmb) { A.held.rmb = aim; this.armRmb = aim; }
      const fire = has && v[B.attack] > 0.45;
      if (fire && !this.armLmb) { A.held.lmb = true; A.lmbT = 0; this.armLmb = true; }
      else if (!fire && this.armLmb) { A.held.lmb = false; this.armLmb = false; A.release(); }
      // R1: tap next weapon, hold to holster
      if (b[B.next] && this.holdT[B.next] >= HOLD && !this.nextHeld) { this.nextHeld = true; if (A.state.drawn >= 0) { this.lastDrawn = A.state.drawn; A.holster(); } }
      if (up[B.next]) { if (!this.nextHeld) this.cycleWeapon(1); this.nextHeld = false; }
      // Triangle: tap last weapon, hold to inspect
      if (b[B.swap] && this.holdT[B.swap] >= HOLD && !this.swapHeld) { this.swapHeld = true; A.inspect(); }
      if (up[B.swap]) { if (!this.swapHeld) this.swapWeapon(); this.swapHeld = false; }
      if (down[B.melee]) { if (c.player.mode === 'boat') c.input.press('view'); else if (has) A.shove(); else c.input.press('view'); }
      if (up[B.melee]) c.input.release('view');
    }
    // quick items / radio on the D-pad
    const aboard = c.player.mode === 'boat';
    if (down[B.quickNext]) aboard ? c.radio?.cycle() : this.cycleQuick(1);
    if (down[B.quickPrev]) aboard ? this.radioPrev() : this.cycleQuick(-1);
    if (down[B.quick]) this.useQuick();
    if (down[B.photo]) this.photo();
    return { x: mx, y: -my };
  }
  owned() { return this.ctx.arms?.state.owned || []; }
  cycleWeapon(dir) {
    const A = this.ctx.arms, n = this.owned().length; if (!n) { this.ctx.ui.toast('No weapons yet. Vendors in Portage and Rusthold sell them.'); return; }
    const cur = A.state.drawn;
    const i = cur < 0 ? (dir > 0 ? 0 : n - 1) : (cur + dir + n) % n;
    if (cur >= 0) this.lastDrawn = cur;
    if (i !== cur) A.draw(i);
  }
  swapWeapon() {
    const A = this.ctx.arms, n = this.owned().length; if (!n) { this.ctx.ui.toast('No weapons yet.'); return; }
    const cur = A.state.drawn;
    if (cur < 0) { A.draw(this.lastDrawn >= 0 && this.lastDrawn < n ? this.lastDrawn : 0); return; }
    const to = this.lastDrawn >= 0 && this.lastDrawn < n && this.lastDrawn !== cur ? this.lastDrawn : -1;
    this.lastDrawn = cur;
    to < 0 ? A.holster() : A.draw(to);
  }
  quickItems() { const inv = this.ctx.inventory; return QUICK.filter((k) => inv.has(k)); }
  cycleQuick(dir) {
    const list = this.quickItems();
    if (!list.length) { this.ctx.ui.toast('No quick-use items. Flares, bait, salt and bandages go here.'); return; }
    this.quickIdx = (this.quickIdx + dir + list.length) % list.length;
    this.ctx.ui.toast(`Quick item: ${this.ctx.inventory.def(list[this.quickIdx])?.name || list[this.quickIdx]}`);
  }
  useQuick() {
    const list = this.quickItems(); if (!list.length) { this.ctx.ui.toast('No quick-use items.'); return; }
    const k = list[Math.min(this.quickIdx, list.length - 1)];
    if (k === 'throw_net') this.ctx.arms?.throwNet(); else this.ctx.survival.useItem(k);
  }
  radioPrev() {
    const r = this.ctx.radio; if (!r) return;
    const n = r.stations.length;
    // cycle() moves forward; stepping n times lands one back (including "off")
    for (let i = 0; i < n; i++) r.cycle();
  }
  photo() {
    const ph = this.ctx.photo; if (!ph) return;
    try { ph.shoot(); this.ctx.ui.toast('Photo saved to your journal.'); } catch { /* render not ready */ }
  }
  // aim assist: slow the camera near a target and pull gently toward it while the stick moves
  assist(k, stickMag, dt) {
    const c = this.ctx, lvl = this.opt.assist === 'standard' ? 1 : 0.55;
    const cone = (this.opt.assist === 'standard' ? 8 : 5) * Math.PI / 180;
    const cam = c.camera; let best = null, bestA = cone;
    const cands = [];
    for (const cr of c.creatures?.list || []) if (cr.active && cr.health > 0) cands.push(cr.body?.focus ? cr.body.focus() : cr.pos);
    for (const a of c.society?.actors || []) if (a.alive) cands.push(_v.copy(a.pos).setY(a.pos.y + 1.2).clone());
    cam.updateMatrixWorld();
    for (const pos of cands) {
      const l = cam.worldToLocal(_v.copy(pos));
      if (l.z > -0.5 || -l.z > 45) continue;
      const ang = Math.atan2(Math.hypot(l.x, l.y), -l.z);
      if (ang < bestA) { bestA = ang; best = { yaw: Math.atan2(l.x, -l.z), pitch: Math.atan2(l.y, -l.z) }; }
    }
    this.assistTarget = best;
    if (!best) return { k, pull: [0, 0] };
    const s = 0.0022 * (c.settings.lookSensitivity || 1);
    const near = 1 - bestA / cone;
    const slow = 1 - (0.25 + 0.2 * lvl) * near;
    if (stickMag < 0.08) return { k: k * slow, pull: [0, 0] };   // never auto-aims on its own
    const cap = 0.004;                                          // radians per frame, max
    const py = THREE.MathUtils.clamp(best.yaw * lvl * 2.2 * dt, -cap, cap), pp = THREE.MathUtils.clamp(best.pitch * lvl * 2.2 * dt, -cap, cap);
    return { k: k * slow, pull: [py / s, -pp / s] };
  }

  // ------------------------------------------------------------ weapon wheel
  openWheel() {
    const A = this.ctx.arms; if (!A) return;
    const items = [{ i: -1, name: 'Holster', sub: 'hands free' }, ...this.owned().map((w, i) => {
      const d = A.def(w.id), ranged = A.kind(w.id) === 'ranged';
      return { i, name: d.name, sub: ranged ? `${w.loaded}/${d.mag} · ${A.ammoCount(w)} spare` : `cond ${Math.round(w.cond * 100)}%` };
    })];
    this.wheel = { open: true, sel: A.state.drawn + 1, items };
    const n = items.length, R = 132;
    this.wheelEl.innerHTML = `<div class="hub">Right stick<br>to choose<br><small style="opacity:.7">release ${PAD_GLYPH[this.bind.wheel]}</small></div>` + items.map((it, k) => {
      const a = (k / n) * Math.PI * 2;
      return `<div class="seg" data-k="${k}" style="--t:translate(${Math.sin(a) * R}px,${-Math.cos(a) * R - 18}px)">${it.name}<small>${it.sub}</small></div>`;
    }).join('');
    this.wheelEl.classList.add('on');
    document.body.classList.add('wheel-open');
    this.paintWheel();
  }
  wheelSelect(rx, ry, lx, ly) {
    let x = rx, y = ry;
    if (Math.hypot(x, y) < 0.5) { x = lx; y = ly; }
    if (Math.hypot(x, y) < 0.5) return;
    const n = this.wheel.items.length;
    let a = Math.atan2(x, -y); if (a < 0) a += Math.PI * 2;
    const sel = Math.round(a / (Math.PI * 2 / n)) % n;
    if (sel !== this.wheel.sel) { this.wheel.sel = sel; this.paintWheel(); this.pulse(0, 0.15, 25); }
  }
  paintWheel() { this.wheelEl.querySelectorAll('.seg').forEach((s) => s.classList.toggle('sel', +s.dataset.k === this.wheel.sel)); }
  closeWheel(apply) {
    if (!this.wheel.open) return;
    this.wheel.open = false; this.wheelEl.classList.remove('on');
    document.body.classList.remove('wheel-open');
    const A = this.ctx.arms, it = this.wheel.items[this.wheel.sel];
    if (!apply || !A || !it) return;
    if (it.i < 0) { if (A.state.drawn >= 0) { this.lastDrawn = A.state.drawn; A.holster(); } }
    else if (it.i !== A.state.drawn) { if (A.state.drawn >= 0) this.lastDrawn = A.state.drawn; A.draw(it.i); }
  }

  // ------------------------------------------------------------ menus
  activeRoot() {
    const ui = this.ctx.ui;
    const gate = document.querySelector('.age-gate'); if (gate) return gate;
    const card = [...document.querySelectorAll('.life-card-wrap')].pop(); if (card) return card;
    if (ui.panel) return ui.panel;
    if (this.ctx.photo?.active) return this.ctx.photo.bar;
    if (this.ctx.lifeUI?.visible) return this.ctx.lifeUI.root;
    if (ui.titleEl && document.body.contains(ui.titleEl) && this.ctx.mode !== 'play') return ui.titleEl;
    return null;
  }
  focusables(root) {
    return [...root.querySelectorAll('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')]
      .filter((e) => !e.disabled && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
  }
  sig(e) { return e ? [...e.attributes].filter((a) => a.name.startsWith('data-')).map((a) => a.name + '=' + a.value).join('&') + '|' + e.textContent.trim().slice(0, 30) : ''; }
  setFocus(e) {
    if (this.focusEl === e) return;
    this.focusEl?.classList.remove('padfocus');
    this.focusEl = e;
    if (!e) return;
    e.classList.add('padfocus');
    try { e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* old browsers */ }
    if (this.device === 'pad' && (e.tagName !== 'INPUT' || e.type === 'range')) try { e.focus({ preventScroll: true }); } catch { /* ignore */ }
  }
  clearFocus() { this.focusEl?.classList.remove('padfocus'); this.focusEl = null; }
  menu(root, S) {
    const { down, b, ax, dt } = S;
    const list = this.focusables(root);
    if (!list.length) return;
    if (this.device === 'pad' && !root.querySelector(':scope > .padhint')) {
      const h = document.createElement('div'); h.className = 'padhint';
      const tabs = root.querySelector('.tabs .btn.on, .life-tabs button.on') ? `<span>${PAD_GLYPH[4]}${PAD_GLYPH[5]}Tabs</span>` : '';
      h.innerHTML = `<span>${PAD_GLYPH[12]}Move</span><span>${PAD_GLYPH[0]}Select</span><span>${PAD_GLYPH[1]}Back</span>${tabs}<span>${PAD_GLYPH[11].replace('R3', 'R')}Scroll</span>`;
      root.appendChild(h);
    }
    if (!this.focusEl || !root.contains(this.focusEl) || !this.focusEl.isConnected) {
      const again = this.lastSig && list.find((e) => this.sig(e) === this.lastSig);
      const pick = again || list.find((e) => !e.matches('[data-close],[data-x],.close') && e.tagName !== 'INPUT') || list[0];
      this.setFocus(pick);
    }
    // direction: D-pad or left stick, with key-repeat
    const sx = ax[0] || 0, sy = ax[1] || 0;
    const dir = b[12] || sy < -0.6 ? 'up' : b[13] || sy > 0.6 ? 'down' : b[14] || sx < -0.6 ? 'left' : b[15] || sx > 0.6 ? 'right' : null;
    if (dir !== this.navDir) { this.navDir = dir; this.navT = 0.38; if (dir) this.nav(dir, list); }
    else if (dir) { this.navT -= dt; if (this.navT <= 0) { this.navT = 0.12; this.nav(dir, list); } }
    // right stick scrolls long panels
    const ry = ax[3] || 0;
    if (Math.abs(ry) > 0.25) { const sc = root.querySelector('.panel') || root.querySelector('.life-scroll, .life-body') || root; sc.scrollTop += ry * 900 * dt; }
    if (down[0] && this.focusEl) this.confirm(this.focusEl);
    if (down[1]) this.back(root);
    if (down[4] || down[5]) this.tab(root, down[5] ? 1 : -1);
  }
  nav(dir, list) {
    const cur = this.focusEl;
    if (!cur) { this.setFocus(list[0]); return; }
    if (cur.type === 'range' && (dir === 'left' || dir === 'right')) {
      const st = +cur.step || (+cur.max - +cur.min) / 20, d = dir === 'right' ? st : -st;
      cur.value = String(Math.max(+cur.min, Math.min(+cur.max, +cur.value + d)));
      cur.dispatchEvent(new Event('input', { bubbles: true })); cur.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const r0 = cur.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    let best = null, bs = Infinity;
    for (const e of list) {
      if (e === cur) continue;
      const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const dx = x - cx, dy = y - cy;
      const prim = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
      const orth = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
      // overlap along the cross axis counts as aligned
      const overlap = dir === 'up' || dir === 'down' ? Math.max(0, Math.min(r.right, r0.right) - Math.max(r.left, r0.left)) : Math.max(0, Math.min(r.bottom, r0.bottom) - Math.max(r.top, r0.top));
      if (prim < 4) continue;
      const score = prim + (overlap > 0 ? 0 : orth * 2.5);
      if (score < bs) { bs = score; best = e; }
    }
    // wrap in reading order when nothing lies that way
    if (!best) { const i = list.indexOf(cur); best = dir === 'down' || dir === 'right' ? (i === list.length - 1 ? list[0] : null) : (i === 0 ? list[list.length - 1] : null); }
    if (best) { this.setFocus(best); this.pulse(0, 0.06, 15); }
  }
  confirm(e) {
    this.lastSig = this.sig(e);
    if (e.tagName === 'INPUT' && e.type !== 'range' && e.type !== 'button') { e.focus(); return; }
    e.click();
  }
  back(root) {
    const b = root.querySelector('[data-close], [data-x], [data-back]');
    if (b) { b.click(); return; }
    if (this.ctx.ui.panel === root) this.ctx.ui.close();
  }
  tab(root, dir) {
    const on = root.querySelector('.tabs .btn.on, .life-tabs button.on, [data-w].on');
    const row = on?.parentElement; if (!row) return;
    const sibs = [...row.querySelectorAll(':scope > button')]; const i = sibs.indexOf(on);
    const nx = sibs[(i + dir + sibs.length) % sibs.length];
    if (nx && nx !== on) { this.lastSig = this.sig(nx); nx.click(); }
  }

  // ------------------------------------------------------------ remap
  startCapture(action, after) { this.capture = { action, after, t: performance.now() }; }
  doCapture(S) {
    const i = S.down.findIndex(Boolean);
    if (i < 0) return;
    const { action, after } = this.capture; this.capture = null;
    if (i === this.bind.pause && action !== 'pause') { after?.(false); return; }   // Options cancels
    this.remap(action, i);
    after?.(true);
  }
  remap(action, index) {
    const other = Object.keys(this.bind).find((a) => this.bind[a] === index && a !== action);
    if (other) this.bind[other] = this.bind[action];   // swap so nothing is left unbound
    this.bind[action] = index;
    this.save();
  }
  resetBinds() { this.bind = { ...DEFAULT_BIND }; this.save(); }

  // the Controller settings screen
  openSettings(fromTitle) {
    const ui = this.ctx.ui, o = this.opt;
    const tog = (k, on) => `<button class="btn ${o[k] === on ? 'on' : ''}" data-po="${k}" data-pv="${on}">${on === true ? 'On' : on === false ? 'Off' : on[0].toUpperCase() + on.slice(1)}</button>`;
    const slider = (k, label, min, max, step, fmt) => `<h3>${label} <span class="dim" data-pvv="${k}">${fmt(o[k])}</span></h3><input type="range" min="${min}" max="${max}" step="${step}" value="${o[k]}" data-ps="${k}" style="width:260px;max-width:100%;pointer-events:auto">`;
    const pct = (x) => Math.round(x * 100) + '%', mul = (x) => '×' + (+x).toFixed(2);
    const conn = this.connected ? `Connected: ${this.name.replace(/</g, '')}` : 'No controller detected yet — press any button on it.';
    const rows = Object.keys(DEFAULT_BIND).map((a) => `<tr><td>${ACTION_LABEL[a]}</td><td>${PAD_GLYPH[this.bind[a]]} <span class="dim">${PAD_NAME[this.bind[a]]}</span></td><td><button class="btn" data-remap="${a}">Change</button></td></tr>`).join('');
    const html = `<button class="btn close" data-close>Close</button><h2>Controller</h2><div class="sub">${conn}</div>
      ${slider('dz', 'Stick deadzone', 0.05, 0.4, 0.01, pct)}
      ${slider('curve', 'Response curve', 1, 3, 0.1, (x) => (+x).toFixed(1))}
      ${slider('sensX', 'Look sensitivity — horizontal', 0.2, 3, 0.05, mul)}
      ${slider('sensY', 'Look sensitivity — vertical', 0.2, 3, 0.05, mul)}
      <h3>Invert vertical look</h3><div class="tabs">${tog('invertY', false)}${tog('invertY', true)}</div>
      <h3>Aim assist</h3><div class="tabs">${tog('assist', 'off')}${tog('assist', 'light')}${tog('assist', 'standard')}</div><div class="sub">Slows the camera near a target and nudges gently while you aim. It never aims for you.</div>
      <h3>Vibration</h3><div class="tabs">${tog('vibration', true)}${tog('vibration', false)}</div>
      <h3>DualSense extras</h3><div class="tabs">${tog('extras', false)}${tog('extras', true)}${this.ds.supported ? '<button class="btn" data-link>Link DualSense</button>' : ''}</div>
      <div class="sub">Adaptive triggers, surface haptics, heartbeat, rain and a light bar that follows your Heat. ${this.ds.status()} The controller speaker stays off — the game never uses it.</div>
      <h3>Buttons</h3><table class="remap" style="border-collapse:collapse;font-size:14px">${rows}</table>
      <div class="tabs"><button class="btn" data-preset>Reset to defaults</button></div>
      <div class="sub">In menus: D-pad or left stick to move, ${PAD_GLYPH[0]} confirm, ${PAD_GLYPH[1]} back, L1 / R1 switch tabs, right stick scrolls. Choose “Change”, then press the new button (Options cancels).</div>`;
    const p = ui.openPanel('controller', html, (p) => {
      p.querySelectorAll('[data-ps]').forEach((s) => s.addEventListener('input', () => {
        const k = s.dataset.ps; o[k] = +s.value; this.save();
        const f = k === 'dz' ? pct : k === 'curve' ? (x) => (+x).toFixed(1) : mul;
        p.querySelector(`[data-pvv="${k}"]`).textContent = f(o[k]);
      }));
      p.querySelectorAll('[data-po]').forEach((bt) => bt.addEventListener('click', () => {
        let v = bt.dataset.pv; if (v === 'true' || v === 'false') v = v === 'true';
        o[bt.dataset.po] = v; this.save();
        if (bt.dataset.po === 'extras') { if (v) this.ds.restore(); else { this.ds.reset(); this.ds.flush(true); } }
        this.openSettings(fromTitle);
      }));
      p.querySelector('[data-link]')?.addEventListener('click', async () => { o.extras = true; this.save(); await this.ds.request(); this.openSettings(fromTitle); });
      p.querySelector('[data-preset]')?.addEventListener('click', () => { this.resetBinds(); this.openSettings(fromTitle); });
      p.querySelectorAll('[data-remap]').forEach((bt) => bt.addEventListener('click', () => {
        bt.textContent = 'Press a button…'; bt.classList.add('on');
        this.startCapture(bt.dataset.remap, (ok) => { this.lastSig = `data-remap=${bt.dataset.remap}|Change`; this.openSettings(fromTitle); if (!ok) this.ctx.ui.toast('Kept the old button.'); });
      }));
    });
    if (fromTitle) this.ctx.paused = false;
    return p;
  }

  layoutHTML() {
    const g = (a) => PAD_GLYPH[this.bind[a]];
    return `<div class="sub" style="font-style:normal;line-height:1.9">Left stick move · right stick look · ${g('jump')}jump / swim down · ${g('crouch')}crouch / swim up / engine · ${g('use')}use / reload · ${g('swap')}last weapon, hold to inspect · ${g('light')}light · ${g('next')}next weapon, hold to holster · ${g('aim')}aim / block · ${g('attack')}attack / fire · ${g('sprint')}sprint · ${g('melee')}shove / boat camera · ${g('wheel')}hold for the weapon wheel · ${g('quickPrev')}${g('quickNext')}quick item (radio on the boat) · ${g('quick')}use it · ${g('map')}chart · ${g('photo')}photo · ${g('pause')}menu.</div>`;
  }

  // ------------------------------------------------------------ HUD prompts
  hud() {
    const c = this.ctx;
    if (this.device !== 'pad' || c.mode !== 'play' || c.ui.panel || c.photo?.active) { this.bar.classList.remove('on'); return; }
    if (c.game.frame % 10) return;
    const g = (a) => this.glyph(a), A = c.arms, w = A?.cur, P = c.player;
    let parts;
    if (P.mode === 'boat') parts = [[g('sprint'), 'Boost'], [g('crouch'), c.boat.engineOff ? 'Start engine' : 'Cut engine'], [g('light'), 'Lantern'], [PAD_GLYPH[this.bind.quickPrev] + PAD_GLYPH[this.bind.quickNext], 'Radio'], [g('melee'), 'Camera']];
    else if (w && A.kind(w.id) === 'ranged') parts = [[g('attack'), A.jammed ? 'Clear jam' : 'Fire'], [g('aim'), 'Aim'], [g('use'), c.interact.focus ? 'Use' : 'Reload'], [g('swap'), 'Swap · hold Inspect'], [g('next'), 'Next'], [g('wheel'), 'Wheel']];
    else if (w) parts = [[g('attack'), 'Swing · hold Heavy'], [g('aim'), 'Block'], [g('melee'), 'Shove'], [g('swap'), 'Swap · hold Inspect'], [g('next'), 'Next'], [g('wheel'), 'Wheel']];
    else if (P.mode === 'swim') parts = [[g('jump'), 'Dive'], [g('crouch'), 'Surface'], [g('light'), 'Light'], [g('sprint'), 'Fast']];
    else parts = [[g('jump'), 'Jump'], [g('crouch'), 'Crouch'], [g('sprint'), 'Sprint'], [g('light'), 'Light'], [g('wheel'), 'Weapons']];
    const q = this.quickItems(); if (q.length && P.mode !== 'boat') parts.push([g('quick'), c.inventory.def(q[Math.min(this.quickIdx, q.length - 1)])?.name || 'Item']);
    parts.push([g('pause'), 'Menu']);
    const html = parts.map(([gl, t]) => `<span>${gl}${t}</span>`).join('');
    if (html !== this._bar) { this._bar = html; this.bar.innerHTML = html; }
    this.bar.classList.add('on');
  }

  // ------------------------------------------------------------ haptics, triggers, light bar
  fxOn() { return this.opt.extras && this.opt.vibration && this.connected && this.device === 'pad'; }
  pulse(strong, weak, ms) { if (!this.fxOn()) return; this.fx.pulses.push({ s: strong, w: weak, t: ms / 1000 }); }
  rumble(strong, weak, ms) {
    if (!this.opt.vibration || !this.connected || this.device !== 'pad') return;
    if (this.ds.connected) { this.fx.pulses.push({ s: strong, w: weak, t: ms / 1000 }); return; }
    try { this.readPad()?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch?.(() => {}); } catch { /* not supported */ }
  }
  updateFx(dt, p) {
    this.hud();
    if (!this.fxOn()) { if (this.ds.connected && this.fx.trig) { this.ds.reset(); this.ds.flush(true); this.fx.trig = ''; } return; }
    try {
      const c = this.ctx, F = this.fx;
      // continuous layers: boat engine hum, creature heartbeat, rain
      let s = 0, w = 0;
      if (c.player.mode === 'boat' && c.boat && !c.boat.engineOff && !c.boat.tied) { const thr = Math.min(1, Math.abs(c.input.move.y)); s = 0.05 + thr * 0.1; w = 0.04 + thr * 0.06; }
      let near = Infinity;
      for (const cr of c.creatures?.list || []) if (cr.active && cr.health > 0 && (cr.state === 'warning' || cr.state === 'attack')) near = Math.min(near, cr.pos.distanceTo(c.player.position));
      if (near < 30) {
        const per = 0.45 + (near / 30) * 0.8; F.beatT += dt;
        if (F.beatT > per) { F.beatT = 0; F.pulses.push({ s: 0.55, w: 0, t: 0.07 }); F.pulses.push({ s: 0.3, w: 0, t: 0.07, delay: 0.16 }); }
      }
      if (/rain|storm/.test(c.weather?.state || '') && !c.player.headUnder) { F.rainT -= dt; if (F.rainT <= 0) { F.rainT = 0.25 + Math.random() * 0.7; F.pulses.push({ s: 0, w: 0.07, t: 0.03 }); } }
      for (const q of F.pulses) { if (q.delay > 0) { q.delay -= dt; continue; } s = Math.max(s, q.s); w = Math.max(w, q.w); q.t -= dt; }
      F.pulses = F.pulses.filter((q) => q.t > 0);
      if (!this.ds.connected) {
        // standard vibration fallback: short refreshes while anything is playing
        F.vibT = (F.vibT || 0) - dt;
        if ((s > 0.02 || w > 0.02) && F.vibT <= 0) { F.vibT = 0.09; try { p?.vibrationActuator?.playEffect?.('dual-rumble', { duration: 100, strongMagnitude: Math.min(1, s), weakMagnitude: Math.min(1, w) }).catch?.(() => {}); } catch { /* ignore */ } }
        return;
      }
      // adaptive triggers from weapons.json
      const A = c.arms, T = c.data.weapons?.triggers || {};
      const id = A?.cur ? (A.jammed ? '_jammed' : A.kind(A.cur.id) === 'melee' ? '_melee' : A.cur.id) : '_none';
      const eff = { ...(T._none || {}), ...(T[id] || {}) };
      const key = id + JSON.stringify(eff);
      const patch = { motorL: s, motorR: w };
      if (key !== F.trig) { F.trig = key; patch.rt = eff.R2 || null; patch.lt = eff.L2 || null; }
      // light bar: calm blue → red, flashing at five stars; dim in the dark lairs below the shelf
      const stars = Math.min(5, Math.ceil((c.heat?.value || 0) / 20));
      const pal = [[0, 50, 150], [0, 130, 130], [190, 170, 0], [230, 110, 0], [240, 40, 0], [255, 0, 0]];
      let rgb = pal[stars];
      if (stars >= 5 && Math.floor(performance.now() / 160) % 2) rgb = [40, 0, 0];
      const lair = c.player.headUnder && (c.abyss?.zone?.from ?? 0) >= 20;
      patch.rgb = rgb; patch.bright = lair ? 0.2 : 1;
      const bk = rgb.join() + patch.bright + s.toFixed(2) + w.toFixed(2);
      if (bk !== F.bar || patch.rt !== undefined) { F.bar = bk; this.ds.set(patch); }
      this.ds.flush();
    } catch { /* the device refused; extras are best-effort */ }
  }
}

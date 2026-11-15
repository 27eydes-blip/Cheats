// Touch twin-stick + keyboard/mouse input.
import { SETTINGS } from './settings.js';
// Produces a move vector every tick and a queue of discrete actions (fire / super / swap / gadget).

const STICK_R = 62; // css px
const AIM_DEADZONE = 16;
const sens = () => Math.max(0.5, Math.min(2, SETTINGS.aimSens || 1));

// Keyboard bindings by PHYSICAL key (event.code), so WASD sits under the same fingers on AZERTY,
// QWERTZ, Dvorak or a Cyrillic layout. Arrows always move.
export const BINDS = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  super: ['KeyE', 'KeyQ'], swap: ['KeyR', 'Tab', 'Digit2'], gadget: ['KeyF', 'KeyG'], fire: ['Space'],
};
const ACTION_OF = {};
for (const a of ['super', 'swap', 'gadget', 'fire']) for (const c of BINDS[a]) ACTION_OF[c] = a;
// browsers that leave event.code empty (some virtual keyboards): work it out from the character
const CODE_OF_KEY = { ' ': 'Space', tab: 'Tab', arrowup: 'ArrowUp', arrowdown: 'ArrowDown', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight' };
const codeOf = (e) => e.code || CODE_OF_KEY[(e.key || '').toLowerCase()] || (/^[a-z]$/i.test(e.key || '') ? 'Key' + e.key.toUpperCase() : /^[0-9]$/.test(e.key || '') ? 'Digit' + e.key : e.key || '');
// the key cap shown for an action: the label that physical key has on THIS keyboard
const HINT_CODES = { super: 'KeyE', gadget: 'KeyF', swap: 'KeyR' };
const capOf = (code) => code.replace(/^Key|^Digit/, '');

export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set(); // held keys, by event.code
    this.actions = [];
    this.moveT = null; // {id, bx, by, x, y}
    this.aimT = null; // {id, kind, bx, by, x, y, t0, aiming}
    this.spare = []; // other fingers down on a stick side while that stick is taken: {id, side, sx, sy, x, y, t0}
    this.mouse = { x: 0, y: 0, active: false, down: 0, holdFired: false, charge: false };
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    this.enabled = false;
    this.superReady = false; this.gadgetReady = false; this.gadgetOn = false; // (set by the game every tick)
    this.taps = []; // tappable HUD circles drawn on the canvas: {x, y, r, on()} (e.g. the minimap)
    this.hints = Object.fromEntries(Object.entries(HINT_CODES).map(([a, c]) => [a, capOf(c)]));
    this.readLayout();
    this.layout(innerWidth, innerHeight);

    const opts = { passive: false };
    el.addEventListener('touchstart', (e) => this.onTouchStart(e), opts);
    el.addEventListener('touchmove', (e) => this.onTouchMove(e), opts);
    el.addEventListener('touchend', (e) => this.onTouchEnd(e), opts);
    el.addEventListener('touchcancel', (e) => this.onTouchEnd(e, true), opts);

    el.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.active = true; });
    // released anywhere (over a DOM panel, outside the window): never left firing
    addEventListener('mouseup', (e) => {
      if (e.button !== 0 || !this.mouse.down) return;
      const held = (performance.now() - this.mouse.down) / 1000;
      this.mouse.down = 0;
      if (this.enabled && !this.mouse.holdFired && this.mouse.charge) this.actions.push({ type: 'fire', mode: 'mouse', held });
    });
    el.addEventListener('pointercancel', () => this.releaseMouse());
    el.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      // a HUD control drawn on the canvas: use it, and never shoot or aim at it
      if (this.press(e.clientX, e.clientY, 'mouse')) { e.preventDefault(); return; }
      this.mouse.active = true;
      if (e.button === 0) { this.mouse.down = performance.now(); this.mouse.holdFired = false; if (!this.mouse.charge) this.actions.push({ type: 'fire', mode: 'mouse' }); }
      if (e.button === 2) this.actions.push({ type: 'super', mode: 'mouse' });
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      const code = codeOf(e);
      this.learnCap(code, e.key);
      if (e.ctrlKey || e.metaKey || e.altKey) return; // (browser shortcuts: reload, tabs, ...)
      this.keys.add(code);
      const a = ACTION_OF[code];
      if (a === 'swap' || a === 'fire') e.preventDefault(); // (Tab would move focus, Space would scroll)
      if (!this.enabled || e.repeat || !a) return;
      this.actions.push(a === 'swap' || a === 'gadget' ? { type: a } : { type: a, mode: 'mouse' });
    });
    addEventListener('keyup', (e) => this.keys.delete(codeOf(e)));
    const drop = () => { this.keys.clear(); this.moveT = null; this.aimT = null; this.spare.length = 0; this.releaseMouse(); };
    addEventListener('blur', drop);
    document.addEventListener('visibilitychange', () => { if (document.hidden) drop(); });
  }

  // focus lost / cancelled: let go of the mouse button without firing
  releaseMouse() { this.mouse.down = 0; this.mouse.holdFired = false; }

  // key caps for the desktop ability buttons, in the player's keyboard layout
  readLayout() {
    try {
      navigator.keyboard?.getLayoutMap?.().then((m) => {
        const h = { ...this.hints };
        for (const [a, c] of Object.entries(HINT_CODES)) { const k = m.get(c); if (k) h[a] = k.toUpperCase(); }
        this.hints = h;
      }).catch(() => {});
    } catch {}
  }
  learnCap(code, key) { // (no Keyboard Layout Map: learn a cap the first time that key is pressed)
    for (const [a, c] of Object.entries(HINT_CODES)) {
      if (c === code && key && key.length === 1 && this.hints[a] !== key.toUpperCase()) this.hints = { ...this.hints, [a]: key.toUpperCase() };
    }
  }
  keyHints() { return this.hints; }

  layout(W, H, sa = this.sa || { t: 0, r: 0, b: 0, l: 0 }) {
    this.W = W; this.H = H; this.sa = sa;
    const s = Math.min(1, H / 400);
    // keep the buttons clear of the notch / home bar; left-handed mirrors the whole cluster
    const L = !!SETTINGS.leftHanded, X = (x) => (L ? W - x : x);
    this.superBtn = { x: X(W - 205 * s - 10 - sa.r), y: H - 70 * s - 10 - sa.b, r: 38 * s };
    this.atkHint = { x: X(W - 95 * s - 10 - sa.r), y: H - 100 * s - 10 - sa.b, r: STICK_R };
    // Bottom row of the corner cluster, from the corner in: fire stick, SUPER, GADGET, then what you
    // hold (tap it to swap). All of it stays low, out of the lane in front of your hunter (mid-height),
    // out of the fire stick's travel, and on the thumb's side of the screen.
    const gr = 27 * s, row = H - 56 * s - 10 - sa.b, superL = W - 205 * s - 10 - sa.r - 38 * s;
    const gx = superL - 6 * s - gr;
    this.gadgetBtn = { x: X(gx), y: row, r: gr };
    const rightOf = (this.gadgetOn ? gx - gr : superL) - 6 * s;
    const ph = 40 * s, pw = Math.max(72 * s, Math.min(112 * s, rightOf - W * 0.45 - 2)); // (wider where the screen allows)
    this.weaponPanel = { x: X(rightOf - pw / 2), y: row, w: pw, h: ph, s, L, compact: true };
    // mouse + keyboard: the abilities are DOM buttons in the bottom-right corner (#abilities);
    // what you're holding sits right above them
    if (!this.isTouch) this.weaponPanel = { x: W - 66 - sa.r, y: H - 142 - sa.b, w: 104, h: 46, s: 1, L: false };
    // idle move-stick hint: on short phones sit it lower so it clears the leaderboard
    this.moveHint = { x: X(110 + sa.l), y: (H < 430 ? H - STICK_R - 14 : H - 105) - sa.b };
  }
  // the game says whether a gadget is equipped: without one, the weapon panel takes the gadget's place
  setGadget(on) { if (this.gadgetOn !== on) { this.gadgetOn = on; this.layout(this.W, this.H); } }

  reset() { this.actions.length = 0; this.moveT = null; this.aimT = null; this.spare.length = 0; this.releaseMouse(); }
  tapAt(x, y) { return this.taps.find((b) => Math.hypot(x - b.x, y - b.y) <= b.r) || null; }

  // Which HUD control is at (x, y)? Checked before any stick or shot, for touch and mouse alike.
  // A control that can't be used right now (super not charged, no gadget uses left) only claims a
  // press on the button itself, and says so; its slop ring falls through to aim / fire.
  hudAt(x, y) {
    const tap = this.tapAt(x, y);
    if (tap) return { kind: 'tap', on: tap.on };
    const wp = this.weaponPanel;
    if (this.panelOn && wp && Math.abs(x - wp.x) <= wp.w / 2 + 4 && Math.abs(y - wp.y) <= wp.h / 2 + 4) return { kind: this.swapOn ? 'swap' : 'panel' };
    if (!this.isTouch) return null; // (desktop: swap / gadget / super are DOM buttons)
    const near = (b, slop) => b && Math.hypot(x - b.x, y - b.y) < b.r + slop;
    if (this.gadgetOn && (this.gadgetReady ? near(this.gadgetBtn, 6) : near(this.gadgetBtn, 0))) return { kind: this.gadgetReady ? 'gadget' : 'notready', what: 'gadget' };
    if (this.superReady ? near(this.superBtn, 14) : near(this.superBtn, 0)) return { kind: this.superReady ? 'super' : 'notready', what: 'super' };
    return null;
  }
  // a press on a HUD control: do it. Returns true if (x, y) was a control (and so not a shot),
  // or the hit itself for a touch on a charged SUPER (the caller starts a super drag).
  press(x, y, from) {
    const h = this.hudAt(x, y);
    if (!h) return false;
    if (h.kind === 'tap') h.on();
    else if (h.kind === 'swap') this.actions.push({ type: 'swap' });
    else if (h.kind === 'gadget') this.actions.push({ type: 'gadget' });
    else if (h.kind === 'notready') this.actions.push({ type: 'notready', what: h.what });
    else if (h.kind === 'super' && from === 'mouse') this.actions.push({ type: 'super', mode: 'auto' });
    else if (h.kind === 'super') return h;
    return true;
  }

  onTouchStart(e) {
    e.preventDefault();
    if (!this.isTouch) { this.isTouch = true; this.layout(this.W, this.H); } // (a touch laptop: switch to the touch layout)
    if (!this.enabled) return;
    // a lost touchend (notification shade, system gesture) must not leave a stick stuck down
    const live = new Set([...e.touches].map((t) => t.identifier));
    if (this.moveT && !live.has(this.moveT.id)) this.moveT = null;
    if (this.aimT && !live.has(this.aimT.id)) this.aimT = null;
    if (this.spare.length) this.spare = this.spare.filter((sp) => live.has(sp.id));
    for (const t of e.changedTouches) {
      const x = t.clientX, y = t.clientY, now = performance.now();
      const hit = this.press(x, y, 'touch');
      if (hit === true) continue; // a HUD button, not a stick
      if (hit) { // charged SUPER: drag to aim it
        if (!this.aimT) this.aimT = { id: t.identifier, kind: 'super', bx: this.superBtn.x, by: this.superBtn.y, x, y, t0: now, aiming: false };
        continue;
      }
      const moveSide = SETTINGS.leftHanded ? x > this.W * 0.55 : x < this.W * 0.45;
      if (moveSide) {
        if (!this.moveT) this.moveT = { id: t.identifier, bx: x, by: y, x, y };
        else this.spare.push({ id: t.identifier, side: 'move', sx: x, sy: y, x, y, t0: now });
      } else if (!this.aimT) {
        this.aimT = { id: t.identifier, kind: 'fire', bx: x, by: y, x, y, t0: now, aiming: false };
      } else this.spare.push({ id: t.identifier, side: 'aim', sx: x, sy: y, x, y, t0: now });
    }
  }

  onTouchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.moveT && t.identifier === this.moveT.id) {
        const m = this.moveT;
        m.x = t.clientX; m.y = t.clientY;
        this.follow(m);
      }
      if (this.aimT && t.identifier === this.aimT.id) {
        const a = this.aimT;
        a.x = t.clientX; a.y = t.clientY;
        this.checkAiming(a);
      }
      for (const sp of this.spare) if (sp.id === t.identifier) { sp.x = t.clientX; sp.y = t.clientY; }
    }
  }
  // drag the move stick's base along if the thumb wanders far (floating stick)
  follow(m) {
    const dx = m.x - m.bx, dy = m.y - m.by, d = Math.hypot(dx, dy);
    if (d > STICK_R * 1.6) { m.bx = m.x - (dx / d) * STICK_R * 1.6; m.by = m.y - (dy / d) * STICK_R * 1.6; }
  }
  checkAiming(a) {
    if (!a.aiming && Math.hypot(a.x - a.bx, a.y - a.by) > AIM_DEADZONE / sens()) { a.aiming = true; a.aimAt = performance.now(); }
  }

  onTouchEnd(e, cancel = false) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const si = this.spare.findIndex((sp) => sp.id === t.identifier);
      if (si >= 0) this.spare.splice(si, 1);
      if (this.moveT && t.identifier === this.moveT.id) { this.moveT = null; this.adopt('move'); }
      if (this.aimT && t.identifier === this.aimT.id) {
        const a = this.aimT;
        this.aimT = null;
        this.adopt('aim');
        if (cancel || !this.enabled) continue;
        const dx = a.x - a.bx, dy = a.y - a.by, d = Math.hypot(dx, dy);
        const held = (performance.now() - (a.aimAt || a.t0)) / 1000; // how long it was aimed (charge shots)
        if (a.holdFired) continue; // hold-to-fire already fired while it was held
        // never dragged (a tap, or a thumb held still however long): auto-aim, for fire and super alike
        if (!a.aiming) this.actions.push({ type: a.kind, mode: 'auto', held: 0 });
        else if (d > AIM_DEADZONE * 0.75 / sens()) {
          this.actions.push({ type: a.kind, mode: 'angle', ang: Math.atan2(dy, dx), mag: Math.min(1, d / (STICK_R / sens())), held });
        } // dragged back to centre = cancel
      }
    }
  }
  // the stick's thumb lifted while another finger is down on that side: that finger takes over,
  // as if it had started the stick where it landed (so its drag so far counts)
  adopt(side) {
    const i = this.spare.findIndex((sp) => sp.side === side);
    if (i < 0) return;
    const [sp] = this.spare.splice(i, 1);
    if (side === 'move') { this.moveT = { id: sp.id, bx: sp.sx, by: sp.sy, x: sp.x, y: sp.y }; this.follow(this.moveT); }
    else { this.aimT = { id: sp.id, kind: 'fire', bx: sp.sx, by: sp.sy, x: sp.x, y: sp.y, t0: sp.t0, aiming: false }; this.checkAiming(this.aimT); }
  }

  getMove() {
    let x = 0, y = 0;
    const k = this.keys, any = (codes) => codes.some((c) => k.has(c));
    if (any(BINDS.left)) x -= 1;
    if (any(BINDS.right)) x += 1;
    if (any(BINDS.up)) y -= 1;
    if (any(BINDS.down)) y += 1;
    if (x || y) { const l = Math.hypot(x, y); return { x: x / l, y: y / l }; }
    if (this.moveT) {
      const m = this.moveT;
      let dx = (m.x - m.bx) / STICK_R, dy = (m.y - m.by) / STICK_R;
      const l = Math.hypot(dx, dy);
      if (l < 0.15) return { x: 0, y: 0 };
      if (l > 1) { dx /= l; dy /= l; }
      // feel: any real push means near-full speed
      const s = Math.min(1, 0.35 + l);
      const n = Math.hypot(dx, dy);
      return { x: (dx / n) * s, y: (dy / n) * s };
    }
    return { x: 0, y: 0 };
  }

  // current drag-aim, for drawing the aim indicator
  getAim() {
    const a = this.aimT;
    if (!a || !a.aiming) return null;
    const dx = a.x - a.bx, dy = a.y - a.by, d = Math.hypot(dx, dy);
    return { kind: a.kind, ang: Math.atan2(dy, dx), mag: Math.min(1, d / (STICK_R / sens())), cancel: d <= AIM_DEADZONE * 0.75 / sens(), held: (performance.now() - (a.aimAt || a.t0)) / 1000, touch: a };
  }

  takeActions() { const a = this.actions; this.actions = []; return a; }
}

export { STICK_R };

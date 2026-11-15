// Touch twin-stick + keyboard/mouse input.
import { SETTINGS } from './settings.js';
// Produces a move vector every tick and a queue of discrete actions (fire / super).

const STICK_R = 62; // css px
const AIM_DEADZONE = 16;
const TAP_MS = 260;
const KEY_HINTS = { super: 'E', gadget: 'F', swap: 'R' };
const sens = () => Math.max(0.5, Math.min(2, SETTINGS.aimSens || 1));

export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set();
    this.actions = [];
    this.moveT = null; // {id, bx, by, x, y}
    this.aimT = null; // {id, kind, bx, by, x, y, t0, aiming}
    this.mouse = { x: 0, y: 0, active: false, down: 0, holdFired: false, charge: false };
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    this.enabled = false;
    this.taps = []; // tappable HUD circles drawn on the canvas: {x, y, r, on()} (e.g. the minimap)
    this.layout(innerWidth, innerHeight);

    const opts = { passive: false };
    el.addEventListener('touchstart', (e) => this.onTouchStart(e), opts);
    el.addEventListener('touchmove', (e) => this.onTouchMove(e), opts);
    el.addEventListener('touchend', (e) => this.onTouchEnd(e), opts);
    el.addEventListener('touchcancel', (e) => this.onTouchEnd(e, true), opts);

    el.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.active = true; });
    el.addEventListener('mouseup', (e) => {
      if (e.button !== 0 || !this.mouse.down) return;
      const held = (performance.now() - this.mouse.down) / 1000;
      this.mouse.down = 0;
      if (this.enabled && !this.mouse.holdFired && this.mouse.charge) this.actions.push({ type: 'fire', mode: 'mouse', held });
    });
    el.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      const hit = this.tapAt(e.clientX, e.clientY);
      if (hit) { hit.on(); return; }
      this.mouse.active = true;
      if (e.button === 0) { this.mouse.down = performance.now(); this.mouse.holdFired = false; if (!this.mouse.charge) this.actions.push({ type: 'fire', mode: 'mouse' }); }
      if (e.button === 2) this.actions.push({ type: 'super', mode: 'mouse' });
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (!this.enabled || e.repeat) return;
      if (k === 'e' || k === 'q') this.actions.push({ type: 'super', mode: 'mouse' });
      if (k === 'r' || k === 'tab' || k === '2') { this.actions.push({ type: 'swap' }); e.preventDefault(); }
      if (k === 'f' || k === 'g') this.actions.push({ type: 'gadget' });
      if (k === ' ') { this.actions.push({ type: 'fire', mode: 'mouse' }); e.preventDefault(); }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => { this.keys.clear(); this.moveT = null; this.aimT = null; });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.keys.clear(); this.moveT = null; this.aimT = null; } });
  }

  layout(W, H, sa = this.sa || { t: 0, r: 0, b: 0, l: 0 }) {
    this.W = W; this.H = H; this.sa = sa;
    const s = Math.min(1, H / 400);
    // keep the buttons clear of the notch / home bar; left-handed mirrors the whole layout
    const L = !!SETTINGS.leftHanded, X = (x) => (L ? W - x : x);
    this.superBtn = { x: X(W - 205 * s - 10 - sa.r), y: H - 70 * s - 10 - sa.b, r: 38 * s };
    this.atkHint = { x: X(W - 95 * s - 10 - sa.r), y: H - 100 * s - 10 - sa.b, r: STICK_R };
    // swap button right above the fire button; the current weapon (icon + ammo) beside it;
    // the gadget button next to SUPER
    this.swapBtn = { x: X(W - 95 * s - 10 - sa.r), y: H - 196 * s - 10 - sa.b, r: 28 * s };
    this.weaponPanel = { x: X(W - 95 * s - 10 - sa.r) + (L ? 1 : -1) * 92 * s, y: H - 196 * s - 10 - sa.b, s, L };
    this.gadgetBtn = { x: X(W - 290 * s - 10 - sa.r), y: H - 56 * s - 10 - sa.b, r: 27 * s };
    // mouse + keyboard: the abilities are DOM buttons in the bottom-right corner (#abilities);
    // what you're holding sits right above them
    if (!this.isTouch) this.weaponPanel = { x: W - 66 - sa.r, y: H - 142 - sa.b, s: 1, L: false };
    // idle move-stick hint: on short phones sit it lower so it clears the leaderboard
    this.moveHint = { x: X(110 + sa.l), y: (H < 430 ? H - STICK_R - 14 : H - 105) - sa.b };
  }

  // the key shown on each desktop ability button
  keyHints() { return KEY_HINTS; }

  reset() { this.actions.length = 0; this.moveT = null; this.aimT = null; }
  tapAt(x, y) { return this.taps.find((b) => Math.hypot(x - b.x, y - b.y) <= b.r) || null; }

  onTouchStart(e) {
    e.preventDefault();
    if (!this.isTouch) { this.isTouch = true; this.layout(this.W, this.H); } // (a touch laptop: switch to the touch layout)
    if (!this.enabled) return;
    // a lost touchend (notification shade, system gesture) must not leave a stick stuck down
    const live = new Set([...e.touches].map((t) => t.identifier));
    if (this.moveT && !live.has(this.moveT.id)) this.moveT = null;
    if (this.aimT && !live.has(this.aimT.id)) this.aimT = null;
    for (const t of e.changedTouches) {
      const x = t.clientX, y = t.clientY;
      const hit = this.tapAt(x, y);
      if (hit) { hit.on(); continue; } // a HUD button, not a stick
      const sb = this.superBtn, wb = this.swapBtn;
      if (this.swapOn && wb && Math.hypot(x - wb.x, y - wb.y) < wb.r + 8) { this.actions.push({ type: 'swap' }); continue; }
      const gb = this.gadgetBtn;
      if (this.gadgetOn && gb && Math.hypot(x - gb.x, y - gb.y) < gb.r + 8) { this.actions.push({ type: 'gadget' }); continue; }
      const moveSide = SETTINGS.leftHanded ? x > this.W * 0.55 : x < this.W * 0.45;
      if (!this.aimT && Math.hypot(x - sb.x, y - sb.y) < sb.r + 14) {
        this.aimT = { id: t.identifier, kind: 'super', bx: sb.x, by: sb.y, x, y, t0: performance.now(), aiming: false };
      } else if (moveSide) {
        if (!this.moveT) this.moveT = { id: t.identifier, bx: x, by: y, x, y };
      } else if (!this.aimT) {
        this.aimT = { id: t.identifier, kind: 'fire', bx: x, by: y, x, y, t0: performance.now(), aiming: false };
      }
    }
  }

  onTouchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.moveT && t.identifier === this.moveT.id) {
        const m = this.moveT;
        m.x = t.clientX; m.y = t.clientY;
        // drag the base along if the thumb wanders far (floating stick)
        const dx = m.x - m.bx, dy = m.y - m.by, d = Math.hypot(dx, dy);
        if (d > STICK_R * 1.6) { m.bx = m.x - (dx / d) * STICK_R * 1.6; m.by = m.y - (dy / d) * STICK_R * 1.6; }
      }
      if (this.aimT && t.identifier === this.aimT.id) {
        const a = this.aimT;
        a.x = t.clientX; a.y = t.clientY;
        if (!a.aiming && Math.hypot(a.x - a.bx, a.y - a.by) > AIM_DEADZONE / sens()) { a.aiming = true; a.aimAt = performance.now(); }
      }
    }
  }

  onTouchEnd(e, cancel = false) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.moveT && t.identifier === this.moveT.id) this.moveT = null;
      if (this.aimT && t.identifier === this.aimT.id) {
        const a = this.aimT;
        this.aimT = null;
        if (cancel || !this.enabled) continue;
        const dx = a.x - a.bx, dy = a.y - a.by, d = Math.hypot(dx, dy);
        const held = (performance.now() - (a.aimAt || a.t0)) / 1000; // how long it was aimed (charge shots)
        if (a.holdFired) continue; // hold-to-fire already fired while it was held
        if (!a.aiming) {
          if (performance.now() - a.t0 < TAP_MS * 3) this.actions.push({ type: a.kind, mode: 'auto', held: 0 });
        } else if (d > AIM_DEADZONE * 0.75 / sens()) {
          this.actions.push({ type: a.kind, mode: 'angle', ang: Math.atan2(dy, dx), mag: Math.min(1, d / (STICK_R / sens())), held });
        } // dragged back to centre = cancel
      }
    }
  }

  getMove() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) y -= 1;
    if (k.has('s') || k.has('arrowdown')) y += 1;
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

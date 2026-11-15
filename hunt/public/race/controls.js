// Hunt Racers controls. Touch (landscape): a floating horizontal steer stick under the left thumb,
// automatic throttle, and big thumb buttons on the right (DRIFT hold, FIRE, ITEM, BRAKE / REVERSE);
// mirrored for left-handed players. Every finger is tracked by its touch identifier, so steering,
// drifting and firing at once all work. Desktop: keys by event.code, mouse buttons for weapon /
// item, Escape for the menu. Gamepads are read when one is connected.
import { SETTINGS } from '../settings.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const STEER_KEYS = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };

export class Controls {
  constructor(el, { onMenu } = {}) {
    this.el = el; this.onMenu = onMenu || (() => {});
    this.W = 0; this.H = 0; this.SA = { t: 0, r: 0, b: 0, l: 0 };
    this.btn = { drift: { x: 0, y: 0, r: 40, down: false }, fire: { x: 0, y: 0, r: 32, down: false }, item: { x: 0, y: 0, r: 32, down: false }, brake: { x: 0, y: 0, r: 30, down: false }, menu: { x: 0, y: 0, r: 22, down: false } };
    this.stick = { id: null, ox: 0, oy: 0, x: 0, y: 0, v: 0, max: 50 };
    this.touches = new Map(); // identifier -> role
    this.keys = new Set();
    this.out = { st: 0, th: 1, dr: 0 };
    this.fireQ = 0; this.itemQ = 0;
    this.mode = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window ? 'touch' : 'keys';
    this.kSteer = 0; this.pad = false; this.padPrev = 0; this.enabled = true;
    this.h = {
      ts: (e) => this.touch(e, 'start'), tm: (e) => this.touch(e, 'move'), te: (e) => this.touch(e, 'end'),
      kd: (e) => this.key(e, true), ku: (e) => this.key(e, false),
      md: (e) => this.mouse(e), cm: (e) => e.preventDefault(), blur: () => this.reset(),
      gp: () => { this.pad = true; },
    };
    el.addEventListener('touchstart', this.h.ts, { passive: false });
    el.addEventListener('touchmove', this.h.tm, { passive: false });
    el.addEventListener('touchend', this.h.te, { passive: false });
    el.addEventListener('touchcancel', this.h.te, { passive: false });
    el.addEventListener('mousedown', this.h.md);
    el.addEventListener('contextmenu', this.h.cm);
    addEventListener('keydown', this.h.kd);
    addEventListener('keyup', this.h.ku);
    addEventListener('blur', this.h.blur);
    addEventListener('gamepadconnected', this.h.gp);
  }
  destroy() {
    const el = this.el;
    el.removeEventListener('touchstart', this.h.ts); el.removeEventListener('touchmove', this.h.tm);
    el.removeEventListener('touchend', this.h.te); el.removeEventListener('touchcancel', this.h.te);
    el.removeEventListener('mousedown', this.h.md); el.removeEventListener('contextmenu', this.h.cm);
    removeEventListener('keydown', this.h.kd); removeEventListener('keyup', this.h.ku); removeEventListener('blur', this.h.blur); removeEventListener('gamepadconnected', this.h.gp);
  }
  reset() {
    this.touches.clear(); this.keys.clear(); this.stick.id = null; this.stick.v = 0; this.kSteer = 0;
    for (const k in this.btn) this.btn[k].down = false;
  }

  // thumb button layout (CSS px) for this screen; mirrored for left-handed players
  layout(W, H, SA) {
    this.W = W; this.H = H; this.SA = SA;
    const L = !!SETTINGS.leftHanded, X = (x) => (L ? W - x : x);
    const r = clamp(H * 0.12, 32, 46), r2 = clamp(r * 0.8, 29, 38), R = W - SA.r, B = H - SA.b;
    const b = this.btn;
    Object.assign(b.drift, { x: X(R - r - 14), y: B - r - 14, r });
    Object.assign(b.fire, { x: X(R - r2 - 12), y: B - 2 * r - r2 - 38, r: r2 });
    Object.assign(b.item, { x: X(R - 2 * r - r2 - 36), y: B - 2 * r - 26, r: r2 });
    Object.assign(b.brake, { x: X(R - 2 * r - r2 - 50), y: B - r2 - 8, r: r2 });
    Object.assign(b.menu, { x: X(W - SA.r - 24), y: SA.t + 24, r: 22 });
    this.stick.max = clamp(W * 0.08, 40, 70);
  }
  steerSide(x) { return SETTINGS.leftHanded ? x > this.W * 0.55 : x < this.W * 0.45; }
  hit(x, y) {
    let best = null, bd = Infinity;
    for (const k of ['drift', 'fire', 'item', 'brake', 'menu']) {
      const b = this.btn[k], d = Math.hypot(x - b.x, y - b.y);
      if (d < b.r * 1.3 && d < bd) { bd = d; best = k; }
    }
    return best;
  }

  touch(e, phase) {
    if (!this.enabled) return;
    e.preventDefault();
    this.mode = 'touch';
    const rect = this.el.getBoundingClientRect();
    for (const t of e.changedTouches) {
      const x = t.clientX - rect.left, y = t.clientY - rect.top, id = t.identifier;
      if (phase === 'start') {
        const b = this.hit(x, y);
        if (b) {
          this.touches.set(id, b); this.btn[b].down = true;
          if (b === 'fire') this.fireQ = 1;
          if (b === 'item') this.itemQ = 1;
          if (b === 'menu') this.onMenu();
        } else if (this.steerSide(x) && this.stick.id == null) {
          this.touches.set(id, 'steer'); Object.assign(this.stick, { id, ox: x, oy: y, x, y, v: 0 });
        }
      } else if (phase === 'move') {
        if (this.touches.get(id) === 'steer') {
          const s = this.stick, m = s.max;
          s.x = x; s.y = y;
          // floating origin: drag past the edge and the centre follows, so reversing is instant
          if (x - s.ox > m) s.ox = x - m; else if (x - s.ox < -m) s.ox = x + m;
          const v = (x - s.ox) / m;
          s.v = Math.abs(v) < 0.08 ? 0 : Math.sign(v) * Math.min(1, (Math.abs(v) - 0.08) / 0.82);
        }
      } else {
        const role = this.touches.get(id);
        this.touches.delete(id);
        if (role === 'steer') { this.stick.id = null; this.stick.v = 0; } else if (role && ![...this.touches.values()].includes(role)) this.btn[role].down = false;
      }
    }
  }
  key(e, down) {
    if (!this.enabled) return;
    const c = e.code;
    if (down && c === 'Escape') { this.onMenu(); return; }
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    const used = c in STEER_KEYS || ['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyJ', 'KeyK'].includes(c);
    if (!used) return;
    e.preventDefault();
    this.mode = 'keys';
    if (down) {
      if (!e.repeat && c === 'KeyJ') this.fireQ = 1;
      if (!e.repeat && c === 'KeyK') this.itemQ = 1;
      this.keys.add(c);
    } else this.keys.delete(c);
  }
  mouse(e) {
    if (!this.enabled || this.mode === 'touch') return;
    if (e.button === 0) this.fireQ = 1;
    if (e.button === 2) this.itemQ = 1;
  }

  // the held controls for this frame (reused object) plus one-shot presses (cleared on read)
  poll(dt) {
    const o = this.out, k = this.keys;
    if (this.mode === 'touch') {
      o.st = this.stick.v;
      o.th = this.btn.brake.down ? -1 : 1;
      o.dr = this.btn.drift.down ? 1 : 0;
    } else {
      const want = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
      // keys ramp in quickly (no twitchy full-lock taps) and centre instantly
      this.kSteer = want === 0 ? 0 : Math.sign(want) !== Math.sign(this.kSteer) ? want * 0.35 : clamp(this.kSteer + want * dt * 7, -1, 1);
      o.st = this.kSteer;
      o.th = (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0) - (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0);
      o.dr = k.has('ShiftLeft') || k.has('ShiftRight') || k.has('Space') ? 1 : 0;
    }
    if (this.pad) this.gamepad(o);
    return o;
  }
  gamepad(o) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : null;
    if (!pads) return;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (!p || !p.connected) continue;
      const b = (n) => (p.buttons[n] ? p.buttons[n].value || (p.buttons[n].pressed ? 1 : 0) : 0);
      const ax = p.axes[0] || 0, thr = Math.max(b(7), b(0)), brk = Math.max(b(6), b(1));
      if (Math.abs(ax) < 0.15 && thr < 0.1 && brk < 0.1 && !b(5) && !b(2) && !b(3)) continue;
      this.mode = 'pad';
      o.st = Math.abs(ax) < 0.15 ? 0 : ax; o.th = thr > brk ? thr : -brk; o.dr = b(5) > 0.5 || b(4) > 0.5 ? 1 : 0;
      const bits = (b(2) > 0.5 ? 1 : 0) | (b(3) > 0.5 ? 2 : 0) | (b(9) > 0.5 ? 4 : 0);
      if (bits & 1 && !(this.padPrev & 1)) this.fireQ = 1;
      if (bits & 2 && !(this.padPrev & 2)) this.itemQ = 1;
      if (bits & 4 && !(this.padPrev & 4)) this.onMenu();
      this.padPrev = bits;
      return;
    }
  }
  takeFire() { const f = this.fireQ; this.fireQ = 0; return f; }
  takeItem() { const f = this.itemQ; this.itemQ = 0; return f; }
}

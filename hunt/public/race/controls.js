// Hunt Racers controls. Touch (landscape): a big always-drawn steering joystick on the left. It points
// where the car should go: the camera never rotates, so the stick's screen direction is the world
// heading `ha` and its deflection the magnitude `hm` (see PROTOCOL.md). Throttle is automatic; big
// thumb buttons on the right (DRIFT hold, FIRE, ITEM, BRAKE / REVERSE) and a RESET under the pause
// button. Mirrored for left-handed players. Every finger is tracked by its touch identifier, so steering,
// drifting and firing at once all work. Desktop: keys by event.code, mouse buttons for weapon /
// item, Escape for the menu. Gamepads are read when one is connected.
import { SETTINGS } from '../settings.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const STEER_KEYS = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export const STICK_SIZES = { s: 0.85, m: 1, l: 1.18 };
// steering sensitivity label for the Settings slider
export const sensName = (v) => (v < 0.7 ? 'Very gentle' : v < 0.9 ? 'Gentle' : v <= 1.1 ? 'Normal' : v <= 1.3 ? 'Quick' : 'Very quick');

export class Controls {
  constructor(el, { onMenu } = {}) {
    this.el = el; this.onMenu = onMenu || (() => {});
    this.W = 0; this.H = 0; this.SA = { t: 0, r: 0, b: 0, l: 0 };
    this.btn = { drift: { x: 0, y: 0, r: 40, down: false }, fire: { x: 0, y: 0, r: 32, down: false }, item: { x: 0, y: 0, r: 32, down: false }, brake: { x: 0, y: 0, r: 30, down: false }, menu: { x: 0, y: 0, r: 22, down: false }, reset: { x: 0, y: 0, r: 22, r0: 22, r1: 34, down: false } };
    // the joystick: idle centre (cx, cy), ring radius r; while a thumb holds it, its centre (ox, oy)
    // (the idle centre when grabbed, the touch point when the thumb landed elsewhere in the zone), the
    // knob (x, y), heading ha (radians, world frame) and magnitude hm 0..1
    this.stick = { id: null, cx: 0, cy: 0, r: 70, ox: 0, oy: 0, x: 0, y: 0, ha: 0, hm: 0, v: 0, held: false };
    this.touches = new Map(); // identifier -> role
    this.keys = new Set();
    this.out = { st: 0, th: 1, dr: 0, ha: null, hm: 0 };
    this.fireQ = 0; this.itemQ = 0; this.resetQ = 0;
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
    this.touches.clear(); this.keys.clear(); this.release(); this.kSteer = 0;
    for (const k in this.btn) this.btn[k].down = false;
  }

  // thumb control layout (CSS px) for this screen; the joystick and the thumb buttons swap sides for
  // left-handed players (pause and RESET stay top right, next to the minimap)
  layout(W, H, SA) {
    this.W = W; this.H = H; this.SA = SA;
    const L = !!SETTINGS.leftHanded, X = (x) => (L ? W - x : x);
    const r = clamp(H * 0.12, 32, 58), r2 = clamp(r * 0.8, 29, 48), R = W - SA.r, B = H - SA.b;
    const b = this.btn;
    Object.assign(b.drift, { x: X(R - r - 14), y: B - r - 14, r });
    Object.assign(b.fire, { x: X(R - r2 - 12), y: B - 2 * r - r2 - 38, r: r2 });
    Object.assign(b.item, { x: X(R - 2 * r - r2 - 36), y: B - 3 * r2 - 20, r: r2 }); // stacked over BRAKE with a gap at any size
    Object.assign(b.brake, { x: X(R - 2 * r - r2 - 50), y: B - r2 - 8, r: r2 });
    Object.assign(b.menu, { x: W - SA.r - 24, y: SA.t + 24, r: 22 });
    const r1 = clamp(H * 0.09, 32, 44);
    Object.assign(b.reset, { x: W - SA.r - r1 - 14, y: SA.t + 54 + r1, r0: 22, r1, r: b.reset.big ? r1 : 22 });
    // the joystick: ~160 px across on a small phone, up to ~280 on a tablet (Settings: size)
    const s = this.stick, k = STICK_SIZES[SETTINGS.raceStick] || 1;
    s.r = Math.round(clamp(Math.min(W, H) * 0.21, 70, 120) * k);
    s.cx = X(SA.l + s.r + 26); s.cy = B - s.r - 22;
    if (s.id == null) { s.ox = s.x = s.cx; s.oy = s.y = s.cy; }
  }
  steerSide(x) { return SETTINGS.leftHanded ? x > this.W * 0.55 : x < this.W * 0.45; }
  release() { const s = this.stick; s.id = null; s.hm = 0; s.v = 0; s.held = false; s.ox = s.x = s.cx; s.oy = s.y = s.cy; }
  // the thumb at (x, y): knob, heading and magnitude
  aim(x, y) {
    const s = this.stick, dx = x - s.ox, dy = y - s.oy, d = Math.hypot(dx, dy), k = d > s.r ? s.r / d : 1;
    s.x = s.ox + dx * k; s.y = s.oy + dy * k;
    s.hm = clamp(d / (s.r * 0.75), 0, 1);
    if (d > 2) s.ha = Math.atan2(dy, dx);
  }
  hit(x, y) {
    let best = null, bd = Infinity;
    for (const k of ['drift', 'fire', 'item', 'brake', 'menu', 'reset']) {
      const b = this.btn[k], d = Math.hypot(x - b.x, y - b.y);
      if (d < b.r * 1.3 && d < bd) { bd = d; best = k; }
    }
    return best;
  }

  touch(e, phase) {
    if (!this.enabled) return;
    // (touch-action: none already stops panning and zooming; a non-blocking touch can't be cancelled
    // and Chrome logs an intervention if we try)
    if (e.cancelable) e.preventDefault();
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
          if (b === 'reset') this.resetQ = 1;
        } else if (this.steerSide(x) && this.stick.id == null) {
          // on (or near) the ring: grab the stick where it is; anywhere else in the zone: the stick
          // comes to the thumb, so a first-time player can't miss it
          const s = this.stick, grab = Math.hypot(x - s.cx, y - s.cy) < s.r * 1.25;
          this.touches.set(id, 'steer');
          s.id = id; s.held = true;
          if (grab) { s.ox = s.cx; s.oy = s.cy; } else { s.ox = clamp(x, s.r * 0.6, this.W - s.r * 0.6); s.oy = clamp(y, s.r * 0.6, this.H - s.r * 0.6); }
          this.aim(x, y);
        }
      } else if (phase === 'move') {
        if (this.touches.get(id) === 'steer') this.aim(x, y);
      } else {
        const role = this.touches.get(id);
        this.touches.delete(id);
        if (role === 'steer') this.release(); else if (role && ![...this.touches.values()].includes(role)) this.btn[role].down = false;
      }
    }
  }
  key(e, down) {
    const c = e.code;
    if (down && c === 'Escape') { this.onMenu(); return; } // also closes the menu again
    if (!this.enabled) return;
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    const used = c in STEER_KEYS || ['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyJ', 'KeyK', 'KeyR'].includes(c);
    if (!used) return;
    e.preventDefault();
    this.mode = 'keys';
    if (down) {
      if (!e.repeat && c === 'KeyJ') this.fireQ = 1;
      if (!e.repeat && c === 'KeyK') this.itemQ = 1;
      if (!e.repeat && c === 'KeyR') this.resetQ = 1;
      this.keys.add(c);
    } else this.keys.delete(c);
  }
  mouse(e) {
    if (this.mode === 'touch') return;
    const r = this.el.getBoundingClientRect(), b = this.btn.menu, x = e.clientX - r.left, y = e.clientY - r.top;
    if (e.button === 0 && Math.hypot(x - b.x, y - b.y) < b.r * 1.2) { this.onMenu(); return; }
    if (!this.enabled) return;
    const rb = this.btn.reset;
    if (e.button === 0 && Math.hypot(x - rb.x, y - rb.y) < rb.r * 1.2) { this.resetQ = 1; return; }
    if (e.button === 0) this.fireQ = 1;
    if (e.button === 2) this.itemQ = 1;
  }

  // the held controls for this frame (reused object) plus one-shot presses (cleared on read).
  // heading: your car's current angle. The stick sends ha / hm (the physics steers toward ha); it
  // also sends the equivalent st, which the physics ignores whenever ha is used, so a server
  // without ha steering still drives the same way.
  poll(dt, heading = null) {
    const o = this.out, k = this.keys, sens = clamp(SETTINGS.raceSens ?? 1, 0.5, 1.5);
    o.ha = null; o.hm = 0; // ha null: no heading steering (keys, gamepad), st as always
    if (this.mode === 'touch') {
      const s = this.stick;
      if (s.id != null && s.hm > 0) {
        o.ha = s.ha; o.hm = Math.min(1, s.hm * sens);
        const d = heading == null ? 0 : wrap(s.ha - heading);
        s.v = o.hm < 0.15 ? 0 : clamp(d * 2.5, -1, 1) * Math.min(1, o.hm * 1.4);
      } else s.v = 0;
      o.st = s.v;
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
  takeReset() { const f = this.resetQ; this.resetQ = 0; return f; }
}

// Touch twin-stick + keyboard/mouse input.
// Produces a move vector every tick and a queue of discrete actions (fire / super).

const STICK_R = 62; // css px
const AIM_DEADZONE = 16;
const TAP_MS = 260;

export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set();
    this.actions = [];
    this.moveT = null; // {id, bx, by, x, y}
    this.aimT = null; // {id, kind, bx, by, x, y, t0, aiming}
    this.mouse = { x: 0, y: 0, active: false };
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    this.enabled = false;
    this.layout(innerWidth, innerHeight);

    const opts = { passive: false };
    el.addEventListener('touchstart', (e) => this.onTouchStart(e), opts);
    el.addEventListener('touchmove', (e) => this.onTouchMove(e), opts);
    el.addEventListener('touchend', (e) => this.onTouchEnd(e), opts);
    el.addEventListener('touchcancel', (e) => this.onTouchEnd(e, true), opts);

    el.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.active = true; });
    el.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      this.mouse.active = true;
      if (e.button === 0) this.actions.push({ type: 'fire', mode: 'mouse' });
      if (e.button === 2) this.actions.push({ type: 'super', mode: 'mouse' });
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      if (e.target && e.target.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (!this.enabled || e.repeat) return;
      if (k === 'e' || k === 'q') this.actions.push({ type: 'super', mode: 'mouse' });
      if (k === ' ') { this.actions.push({ type: 'fire', mode: 'mouse' }); e.preventDefault(); }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => { this.keys.clear(); this.moveT = null; this.aimT = null; });
  }

  layout(W, H) {
    this.W = W; this.H = H;
    const s = Math.min(1, H / 400);
    this.superBtn = { x: W - 205 * s - 10, y: H - 70 * s - 10, r: 38 * s };
    this.atkHint = { x: W - 95 * s - 10, y: H - 100 * s - 10, r: STICK_R };
  }

  reset() { this.actions.length = 0; this.moveT = null; this.aimT = null; }

  onTouchStart(e) {
    e.preventDefault();
    this.isTouch = true;
    if (!this.enabled) return;
    for (const t of e.changedTouches) {
      const x = t.clientX, y = t.clientY;
      const sb = this.superBtn;
      if (!this.aimT && Math.hypot(x - sb.x, y - sb.y) < sb.r + 14) {
        this.aimT = { id: t.identifier, kind: 'super', bx: sb.x, by: sb.y, x, y, t0: performance.now(), aiming: false };
      } else if (x < this.W * 0.45) {
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
        if (Math.hypot(a.x - a.bx, a.y - a.by) > AIM_DEADZONE) a.aiming = true;
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
        if (!a.aiming) {
          if (performance.now() - a.t0 < TAP_MS * 3) this.actions.push({ type: a.kind, mode: 'auto' });
        } else if (d > AIM_DEADZONE * 0.75) {
          this.actions.push({ type: a.kind, mode: 'angle', ang: Math.atan2(dy, dx) });
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
    return { kind: a.kind, ang: Math.atan2(dy, dx), mag: Math.min(1, d / STICK_R), cancel: d <= AIM_DEADZONE * 0.75 };
  }

  takeActions() { const a = this.actions; this.actions = []; return a; }
}

export { STICK_R };

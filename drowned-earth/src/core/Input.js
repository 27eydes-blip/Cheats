// Unified input: keyboard/mouse and touch both write into the same action state.
// Gameplay code only reads `input.move`, `input.look` and `input.pressed(action)`.
export const ACTIONS = ['sprint', 'crouch', 'use', 'light', 'dive', 'view', 'inventory', 'journal', 'pause', 'radio', 'craft'];

const KEYMAP = {
  ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyC: 'crouch', ControlLeft: 'crouch',
  KeyE: 'use', KeyF: 'light', Space: 'dive', KeyV: 'view', Tab: 'inventory', KeyI: 'inventory',
  KeyJ: 'journal', Escape: 'pause', KeyP: 'pause', KeyR: 'radio', KeyQ: 'craft',
};

export class Input {
  constructor(canvas, events) {
    this.canvas = canvas;
    this.events = events;
    this.keys = new Set();
    this.move = { x: 0, y: 0 };      // strafe / forward, -1..1
    this.look = { x: 0, y: 0 };      // accumulated pixels since last frame
    this.touchMove = { x: 0, y: 0 };
    this.held = Object.fromEntries(ACTIONS.map((a) => [a, false]));
    this.justPressed = new Set();
    this.enabled = true;
    this.pointerLocked = false;
    this.usingTouch = false;

    addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      const a = KEYMAP[e.code];
      if (a) this.press(a);
      this.events.emit('key', e.code);
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      const a = KEYMAP[e.code];
      if (a) this.release(a);
    });
    addEventListener('blur', () => { this.keys.clear(); for (const a of ACTIONS) this.held[a] = false; });
    canvas.addEventListener('mousedown', () => {
      if (!this.usingTouch && this.enabled && !this.pointerLocked) canvas.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
      this.events.emit('pointerlock', this.pointerLocked);
    });
    addEventListener('mousemove', (e) => {
      if (this.pointerLocked && this.enabled) { this.look.x += e.movementX; this.look.y += e.movementY; }
    });
  }
  press(a) { if (!this.held[a]) this.justPressed.add(a); this.held[a] = true; }
  release(a) { this.held[a] = false; }
  pressed(a) { return this.justPressed.has(a); }
  addLook(dx, dy) { if (this.enabled) { this.look.x += dx; this.look.y += dy; } }

  // Called once per frame before gameplay update.
  poll() {
    const k = this.keys;
    let x = 0, y = 0;
    if (this.enabled) {
      if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
      x += this.touchMove.x; y += this.touchMove.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    this.move.x = x; this.move.y = y;
  }
  // Called at the end of the frame.
  endFrame() { this.justPressed.clear(); this.look.x = 0; this.look.y = 0; }
}

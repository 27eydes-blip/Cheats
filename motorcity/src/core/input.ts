/** Unified input: keyboard, on-screen touch buttons, tilt and gamepad all write into one state. */
export type Btn = 'left' | 'right' | 'brake' | 'boost' | 'horn' | 'pause';

class Input {
  held: Record<Btn, boolean> = { left: false, right: false, brake: false, boost: false, horn: false, pause: false };
  private touchHeld: Record<Btn, number> = { left: 0, right: 0, brake: 0, boost: 0, horn: 0, pause: 0 };
  private keyHeld: Record<Btn, boolean> = { left: false, right: false, brake: false, boost: false, horn: false, pause: false };
  private pressedQ = new Set<Btn>();
  tiltEnabled = false;
  tilt = 0; // -1..1
  private padSteer = 0;
  private padHeld: Partial<Record<Btn, boolean>> = {};
  /** Analog steer -1..1 after combining sources. */
  steer = 0;
  anyKeyListeners: ((e: KeyboardEvent) => void)[] = [];

  constructor() {
    const map: Record<string, Btn> = {
      ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
      ArrowDown: 'brake', KeyS: 'brake', Space: 'brake',
      ShiftLeft: 'boost', ShiftRight: 'boost', KeyX: 'boost', ArrowUp: 'boost', KeyW: 'boost',
      KeyH: 'horn', KeyZ: 'horn', KeyQ: 'horn',
      Escape: 'pause', KeyP: 'pause',
    };
    window.addEventListener('keydown', (e) => {
      const b = map[e.code];
      for (const l of this.anyKeyListeners) l(e);
      if (!b) return;
      if (!this.keyHeld[b]) this.pressedQ.add(b);
      this.keyHeld[b] = true;
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const b = map[e.code];
      if (b) this.keyHeld[b] = false;
    });
    window.addEventListener('blur', () => {
      for (const k of Object.keys(this.keyHeld) as Btn[]) { this.keyHeld[k] = false; this.touchHeld[k] = 0; }
    });
    window.addEventListener('deviceorientation', (e) => {
      if (!this.tiltEnabled) return;
      const landscape = Math.abs((window.screen.orientation?.angle ?? (window as any).orientation ?? 0)) === 90;
      let v = landscape ? (e.beta ?? 0) : (e.gamma ?? 0);
      const ang = window.screen.orientation?.angle ?? (window as any).orientation ?? 0;
      if (ang === -90 || ang === 270) v = -v;
      this.tilt = Math.max(-1, Math.min(1, v / 22));
    });
  }

  async requestTilt(): Promise<boolean> {
    const DOE = (window as any).DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      try { return (await DOE.requestPermission()) === 'granted'; } catch { return false; }
    }
    return 'DeviceOrientationEvent' in window;
  }

  touchDown(b: Btn) { if (!this.touchHeld[b]) this.pressedQ.add(b); this.touchHeld[b]++; }
  touchUp(b: Btn) { this.touchHeld[b] = Math.max(0, this.touchHeld[b] - 1); }
  releaseAllTouch() { for (const k of Object.keys(this.touchHeld) as Btn[]) this.touchHeld[k] = 0; }

  /** Call once per fixed step. */
  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    this.padSteer = 0; const prev = this.padHeld; this.padHeld = {};
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] ?? 0;
      if (Math.abs(ax) > 0.15) this.padSteer = ax;
      const b = (i: number) => !!p.buttons[i]?.pressed;
      if (b(14)) this.padHeld.left = true;
      if (b(15)) this.padHeld.right = true;
      if (b(0) || b(6) || b(13)) this.padHeld.brake = true;
      if (b(2) || b(7) || b(12)) this.padHeld.boost = true;
      if (b(1) || b(3)) this.padHeld.horn = true;
      if (b(9)) this.padHeld.pause = true;
      break;
    }
    for (const k of Object.keys(this.held) as Btn[]) {
      const h = this.keyHeld[k] || this.touchHeld[k] > 0 || !!this.padHeld[k];
      if (this.padHeld[k] && !prev[k]) this.pressedQ.add(k);
      this.held[k] = h;
    }
    let s = (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0);
    if (this.padSteer) s = this.padSteer;
    if (this.tiltEnabled && !this.held.left && !this.held.right) s = Math.abs(this.tilt) < 0.06 ? 0 : this.tilt;
    this.steer = s;
  }
  pressed(b: Btn) { const had = this.pressedQ.has(b); this.pressedQ.delete(b); return had; }
  clearPressed() { this.pressedQ.clear(); }
}

export const input = new Input();

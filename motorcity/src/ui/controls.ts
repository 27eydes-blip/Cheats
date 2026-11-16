/** On-screen controls. Each finger is tracked separately (steer with one thumb, brake/boost with the other).
 *  A press registers on pointerdown immediately; sliding between the steering buttons switches direction;
 *  sliding a finger off a button releases it, so nothing can stay stuck down. */
import { input, type Btn } from '../core/input';
import { haptic } from './dom';

const SLOP = 14; // px of forgiveness before a drifting finger counts as having left its button

export class TouchControls {
  root: HTMLElement;
  private owner = new Map<number, Btn>();
  private btns: Partial<Record<Btn, HTMLElement>> = {};

  constructor() {
    this.root = document.getElementById('controls')!;
    this.root.querySelectorAll<HTMLElement>('[data-btn]').forEach((b) => (this.btns[b.dataset.btn as Btn] = b));
    const hitTest = (x: number, y: number): Btn | null => {
      const el = document.elementFromPoint(x, y)?.closest?.('[data-btn]') as HTMLElement | null;
      return el && this.root.contains(el) ? (el.dataset.btn as Btn) : null;
    };
    const inside = (b: Btn, x: number, y: number) => {
      const r = this.btns[b]?.getBoundingClientRect();
      return !!r && x >= r.left - SLOP && x <= r.right + SLOP && y >= r.top - SLOP && y <= r.bottom + SLOP;
    };
    const press = (id: number, b: Btn | null) => {
      const prev = this.owner.get(id) ?? null;
      if (prev === b) return;
      if (prev) { this.owner.delete(id); input.touchUp(prev); if (!this.owned(prev)) this.btns[prev]?.classList.remove('down'); }
      if (b) { this.owner.set(id, b); input.touchDown(b); this.btns[b]?.classList.add('down'); haptic(b === 'horn' || b === 'boost' ? 14 : 6); }
    };
    const down = (e: PointerEvent) => {
      if (this.root.hidden) return;
      const b = hitTest(e.clientX, e.clientY);
      if (!b) return;
      e.preventDefault();
      press(e.pointerId, b);
    };
    const move = (e: PointerEvent) => {
      const cur = this.owner.get(e.pointerId);
      if (!cur) return;
      if (inside(cur, e.clientX, e.clientY)) return;
      // left its button: switch to whatever is under the finger now, or release
      press(e.pointerId, hitTest(e.clientX, e.clientY));
    };
    const up = (e: PointerEvent) => press(e.pointerId, null);
    window.addEventListener('pointerdown', down, { passive: false });
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
    // no scrolling, zooming, callouts or selection from touches on the controls or the game view
    const block = (e: Event) => { if ((e as TouchEvent).touches?.length || e.type === 'touchmove') e.preventDefault(); };
    for (const el of [this.root, document.getElementById('game')!, document.getElementById('hud')!]) {
      el.addEventListener('touchstart', block, { passive: false });
      el.addEventListener('touchmove', block, { passive: false });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  }

  private owned(b: Btn) { for (const v of this.owner.values()) if (v === b) return true; return false; }

  releaseAll() {
    for (const b of this.owner.values()) { input.touchUp(b); this.btns[b]?.classList.remove('down'); }
    this.owner.clear();
    input.releaseAllTouch();
  }

  show(on: boolean, tilt: boolean) {
    this.root.hidden = !on;
    this.root.classList.toggle('tilt', tilt);
    if (!on) this.releaseAll();
  }

  cooldown(btn: 'horn' | 'boost', frac: number, ready = false) {
    const el = this.btns[btn];
    if (!el) return;
    el.style.setProperty('--p', `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`);
    el.classList.toggle('ready', ready);
  }
}

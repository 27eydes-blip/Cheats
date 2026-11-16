/** On-screen controls: multi-touch, slide between buttons, haptic-feel press states, cooldown rings. */
import { input, type Btn } from '../core/input';
import { haptic } from './dom';

export class TouchControls {
  root: HTMLElement;
  private owner = new Map<number, Btn | null>();
  private btns: Record<string, HTMLElement> = {};
  constructor() {
    this.root = document.getElementById('controls')!;
    this.root.querySelectorAll<HTMLElement>('[data-btn]').forEach((b) => (this.btns[b.dataset.btn!] = b));
    const at = (x: number, y: number): Btn | null => {
      const el = document.elementFromPoint(x, y)?.closest?.('[data-btn]') as HTMLElement | null;
      return el && this.root.contains(el) ? (el.dataset.btn as Btn) : null;
    };
    const set = (id: number, b: Btn | null) => {
      const prev = this.owner.get(id) ?? null;
      if (prev === b) return;
      if (prev) { input.touchUp(prev); this.btns[prev]?.classList.remove('down'); }
      if (b) { input.touchDown(b); this.btns[b]?.classList.add('down'); haptic(b === 'horn' || b === 'boost' ? 14 : 6); }
      this.owner.set(id, b);
    };
    const down = (e: PointerEvent) => {
      const b = at(e.clientX, e.clientY);
      if (!b) return;
      e.preventDefault();
      set(e.pointerId, b);
    };
    const move = (e: PointerEvent) => {
      if (!this.owner.has(e.pointerId)) return;
      const b = at(e.clientX, e.clientY);
      // allow sliding between the two steering buttons, and off a button to release it
      const prev = this.owner.get(e.pointerId);
      if (b && prev && (prev === 'left' || prev === 'right') && (b === 'left' || b === 'right')) set(e.pointerId, b);
      else if (!b && prev) { /* keep holding while finger drifts a little */ }
    };
    const up = (e: PointerEvent) => { if (this.owner.has(e.pointerId)) { set(e.pointerId, null); this.owner.delete(e.pointerId); } };
    window.addEventListener('pointerdown', down, { passive: false });
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  show(on: boolean, tilt: boolean) {
    this.root.hidden = !on;
    this.root.classList.toggle('tilt', tilt);
    if (!on) { for (const id of [...this.owner.keys()]) { const b = this.owner.get(id); if (b) { input.touchUp(b); this.btns[b]?.classList.remove('down'); } } this.owner.clear(); input.releaseAllTouch(); }
  }
  cooldown(btn: 'horn' | 'boost', frac: number, ready = false) {
    const el = this.btns[btn];
    if (!el) return;
    el.style.setProperty('--p', `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`);
    el.classList.toggle('ready', ready);
  }
}

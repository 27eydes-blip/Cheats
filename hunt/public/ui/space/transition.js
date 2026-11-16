// Light-sweep screen transition: a bright diagonal band sweeps across; the screen swaps while the
// band covers the middle, and the new screen slides in. Reduce Flashing: a short plain fade.
//   lightSweep(swap, {root, calm}) -> Promise (resolves when the sweep has finished)
//   slideIn(el) adds the slide-in entrance to a new screen element
import { quality } from './quality.js';

let layer = null, busy = null;
export const SWEEP_MS = 520;
export function lightSweep(swap = () => {}, { root = document.body, calm = quality().calm } = {}) {
  if (!layer || !layer.isConnected) {
    layer = document.createElement('div');
    layer.className = 'sp-sweep';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = '<i></i>';
    root.appendChild(layer);
  }
  const run = () => new Promise((done) => {
    const ms = calm ? 220 : SWEEP_MS;
    layer.classList.toggle('calm', calm);
    layer.classList.remove('go'); void layer.offsetWidth; layer.classList.add('go');
    setTimeout(() => { try { swap(); } catch (e) { console.error(e); } }, ms * 0.45);
    setTimeout(() => { layer.classList.remove('go'); done(); }, ms);
  });
  // a second sweep waits for the first (two quick taps never tear the screen)
  busy = (busy || Promise.resolve()).then(run);
  return busy;
}
export function slideIn(el) {
  if (!el) return;
  el.classList.remove('sp-enter'); void el.offsetWidth; el.classList.add('sp-enter');
  el.addEventListener('animationend', () => el.classList.remove('sp-enter'), { once: true });
}

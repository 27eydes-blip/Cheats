// The curved bottom dock: five glowing icon orbs on a glass arc (Profile, Garage, Race, Pass, Crew).
// The middle orbs ride higher, following the curve. Arrow keys move between orbs.
//   createDock({items, active, onSelect(key)}) -> {el, setActive(key), setBadge(key, text|bool), destroy()}
import { spIcon } from './icons.js';

export const DOCK_ITEMS = [
  { k: 'profile', label: 'PROFILE', icon: 'profile' },
  { k: 'garage', label: 'GARAGE', icon: 'garage' },
  { k: 'race', label: 'RACE', icon: 'race' },
  { k: 'pass', label: 'PASS', icon: 'pass' },
  { k: 'crew', label: 'CREW', icon: 'crew' },
];
// height of the arc above its ends at fraction x (0..1) of the dock: the same curve the SVG draws
export const dockLift = (x) => 4 * x * (1 - x);

export function createDock({ items = DOCK_ITEMS, active = 'race', onSelect = () => {} } = {}) {
  const el = document.createElement('nav');
  el.className = 'sp-dock';
  el.setAttribute('aria-label', 'Main menu');
  const n = items.length;
  el.innerHTML = `<svg class="sp-dock-bg" viewBox="0 0 400 64" preserveAspectRatio="none" aria-hidden="true"><path class="sp-dock-fill" d="M2 64V40Q200 -4 398 40V64z"/><path class="sp-dock-rim" d="M2 40Q200 -4 398 40" vector-effect="non-scaling-stroke"/><path class="sp-dock-rim2" d="M30 48Q200 12 370 48" vector-effect="non-scaling-stroke"/></svg>`
    + items.map((it, i) => {
      const x = (i + 0.5) / n;
      return `<button type="button" class="sp-orb" data-k="${it.k}" style="--lift:${dockLift(x).toFixed(3)}" aria-label="${it.label}"><span class="sp-orb-ball">${spIcon(it.icon)}</span><span class="sp-orb-label">${it.label}</span><span class="sp-orb-badge" hidden></span></button>`;
    }).join('');
  const orbs = [...el.querySelectorAll('.sp-orb')];
  const api = {
    el,
    setActive(k) {
      for (const b of orbs) {
        const on = b.dataset.k === k;
        b.classList.toggle('on', on);
        if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
        b.tabIndex = on ? 0 : -1;
      }
      if (!orbs.some((b) => b.dataset.k === k) && orbs[0]) orbs[0].tabIndex = 0;
    },
    setBadge(k, v) {
      const b = el.querySelector(`.sp-orb[data-k="${k}"] .sp-orb-badge`);
      if (!b) return;
      b.hidden = !v;
      b.textContent = typeof v === 'string' || typeof v === 'number' ? String(v) : '';
      b.classList.toggle('dot', v === true);
    },
    destroy() { el.remove(); },
  };
  el.addEventListener('click', (e) => { const b = e.target.closest('.sp-orb'); if (b) onSelect(b.dataset.k); });
  el.addEventListener('keydown', (e) => {
    const i = orbs.indexOf(document.activeElement);
    if (i < 0) return;
    const j = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (j < 0) return;
    e.preventDefault(); orbs[i].tabIndex = -1; orbs[j].tabIndex = 0; orbs[j].focus();
  });
  api.setActive(active);
  return api;
}

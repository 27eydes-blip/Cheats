// HORN in a race: a small round button beside the pause button (top right) and
// the H key. Your own horn plays at once; the server rate-limits it and sends a 'horn' event to
// everyone, so other racers hear it, louder the closer they are. The sound is the horn you equipped
// in the store (race/garage.js), read from the race roster.
import { horn } from './sound.js';
import { resolveCos } from './garage.js';
import { SETTINGS } from '../settings.js';
import { setCosResolver } from './looks.js';

// race roster rows carry equipped ids: the renderer draws every racer's look through this
setCosResolver(resolveCos);

export const HORN_GAP_MS = 1500; // same gap as the server (sim.js HORN_GAP)
const hornOf = (rc, id) => { const r = rc.roster.get(id); return r ? resolveCos(r.cos, r.driver).horn : null; };

// s: the RaceSession (s.root, s.rc). -> {destroy}
export function mountHorn(s) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'rc-horn'; b.hidden = true;
  b.setAttribute('aria-label', 'Horn');
  b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h4l6-4v14l-6-4H3z" fill="currentColor"/><path d="M16 8c1.4 1.1 1.4 6.9 0 8M19 5.5c2.6 2.4 2.6 10.6 0 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  s.root.appendChild(b);
  let last = 0;
  const honk = () => {
    const rc = s.rc, now = performance.now();
    if (!rc || rc.phase !== 'race' || now - last < HORN_GAP_MS) return;
    last = now;
    rc.horn();
    horn(hornOf(rc, rc.id), 1);
    b.classList.add('cd');
    setTimeout(() => b.classList.remove('cd'), HORN_GAP_MS);
  };
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); honk(); });
  const key = (e) => { if (e.code === 'KeyH' && !e.repeat && !e.target.closest?.('input, textarea')) honk(); };
  addEventListener('keydown', key);
  // shown only while racing, placed just left of the pause button: the column under pause holds
  // RESET (controls.js), so the horn sits beside pause, clear of RESET, the minimap and the thumb
  // buttons at every size. Checked a few times a second (no per-frame DOM work).
  let at = '';
  const place = () => {
    const on = s.rc?.phase === 'race';
    if (b.hidden === on) b.hidden = !on;
    const m = s.ctrl?.btn?.menu;
    if (!m || !m.x) return;
    const left = SETTINGS.leftHanded && m.x < (s.W || innerWidth) / 2, x = left ? m.x + m.r + 8 : m.x - m.r - 8 - 44, y = m.y - 22;
    const k = `${Math.round(x)},${Math.round(y)}`;
    if (k !== at) { at = k; b.style.left = Math.round(x) + 'px'; b.style.top = Math.round(y) + 'px'; }
  };
  place();
  const iv = setInterval(place, 250);
  return { destroy() { clearInterval(iv); removeEventListener('keydown', key); b.remove(); } };
}

// a 'horn' event from the server: someone else's horn, vol from their distance (0 = too far to hear)
export function hornEvent(rc, id, vol) {
  if (id === rc.id || vol <= 0.05) return; // (your own already played when you pressed it)
  horn(hornOf(rc, id), vol);
}

// Crew pods: a row of round pods that light up when a friend joins, showing their car and a READY
// ring, plus a labelled FILL WITH BOTS ON/OFF switch.
//   createCrew({slots, bots, onBots(on), onPod(i, slot)})
//     slots: [{state: 'empty' | 'joined' | 'ready', name, drawCar(g, w, h, t)}]
//     -> {el, setSlots(slots), setBots(on), bots(), layout(), destroy()}
// Pod cars are drawn once per change into small canvases (never per frame); the READY ring spins
// in CSS (steady under Reduce Flashing).
import { spIcon } from './icons.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const podLabel = (s) => (!s || s.state === 'empty' ? 'INVITE' : s.state === 'ready' ? 'READY' : 'JOINED');

export function createCrew({ slots = [], bots = true, onBots = () => {}, onPod = () => {}, title = 'CREW' } = {}) {
  const el = document.createElement('section');
  el.className = 'sp-crew sp-glass';
  el.setAttribute('aria-label', 'Crew');
  el.innerHTML = `<header class="sp-crew-head"><span class="sp-head">${esc(title)}</span><span class="sp-ticks" aria-hidden="true"></span></header>
    <div class="sp-pods"></div>
    <button type="button" class="sp-switch" role="switch" aria-checked="false"><span class="sp-switch-label">FILL WITH BOTS</span><span class="sp-switch-track" aria-hidden="true"><span class="sp-switch-on">ON</span><span class="sp-switch-off">OFF</span><span class="sp-switch-knob"></span></span></button>`;
  const podsEl = el.querySelector('.sp-pods'), sw = el.querySelector('.sp-switch');
  let on = !!bots, cur = [];

  function drawPods() {
    for (const p of podsEl.querySelectorAll('.sp-pod')) {
      const s = cur[Number(p.dataset.i)], cv = p.querySelector('canvas');
      if (!cv || !s || !s.drawCar) continue;
      const r = cv.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
      if (!r.width) continue;
      cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d);
      const g = cv.getContext('2d');
      g.setTransform(d, 0, 0, d, 0, 0);
      try { s.drawCar(g, r.width, r.height, 0); } catch {}
    }
  }
  const api = {
    el,
    setSlots(list) {
      cur = list || [];
      podsEl.innerHTML = cur.map((s, i) => {
        const st = s && s.state ? s.state : 'empty', lab = podLabel(s);
        return `<button type="button" class="sp-pod ${st}" data-i="${i}" aria-label="${st === 'empty' ? 'Invite a friend' : esc(s.name || 'Friend') + ', ' + lab.toLowerCase()}">
          <span class="sp-pod-ring" aria-hidden="true"><svg viewBox="0 0 100 100"><circle class="sp-pod-track" cx="50" cy="50" r="46"/><circle class="sp-pod-ready" cx="50" cy="50" r="46" pathLength="100"/></svg></span>
          <span class="sp-pod-core">${st === 'empty' ? spIcon('plus', 'sp-pod-plus') : '<canvas aria-hidden="true"></canvas>'}</span>
          <span class="sp-pod-name">${st === 'empty' ? '' : esc(s.name || 'Friend')}</span><span class="sp-pod-state">${lab}</span></button>`;
      }).join('');
      requestAnimationFrame(drawPods);
    },
    setBots(v) { on = !!v; sw.setAttribute('aria-checked', String(on)); sw.classList.toggle('on', on); },
    bots: () => on,
    layout() { drawPods(); },
    destroy() { el.remove(); },
  };
  sw.onclick = () => { api.setBots(!on); onBots(on); };
  podsEl.addEventListener('click', (e) => { const p = e.target.closest('.sp-pod'); if (p) onPod(Number(p.dataset.i), cur[Number(p.dataset.i)]); });
  api.setSlots(slots);
  api.setBots(on);
  return api;
}

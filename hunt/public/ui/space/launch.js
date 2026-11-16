// The LAUNCH button: big, glowing, bottom centre, with a burst when pressed (an expanding ring and
// light rays in CSS; a soft glow only under Reduce Flashing).
//   createLaunch({label, sub, onLaunch}) -> {el, burst(), setLabel(label, sub), setEnabled(on), destroy()}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function createLaunch({ label = 'LAUNCH', sub = '', onLaunch = () => {} } = {}) {
  const el = document.createElement('div');
  el.className = 'sp-launch-wrap';
  el.innerHTML = `<button type="button" class="sp-launch"><span class="sp-launch-glow" aria-hidden="true"></span><span class="sp-launch-txt"><b></b><small></small></span></button><span class="sp-launch-burst" aria-hidden="true"><i></i><i></i></span>`;
  const btn = el.querySelector('.sp-launch'), fx = el.querySelector('.sp-launch-burst');
  const api = {
    el, button: btn,
    burst() {
      fx.classList.remove('go');
      void fx.offsetWidth; // restart the animation (a click, not a frame: one reflow is fine)
      fx.classList.add('go');
    },
    setLabel(l, s = '') { btn.querySelector('b').textContent = l; const sm = btn.querySelector('small'); sm.textContent = s; sm.hidden = !s; btn.setAttribute('aria-label', s ? `${l}: ${s}` : l); },
    setEnabled(v) { btn.disabled = !v; },
    destroy() { el.remove(); },
  };
  fx.addEventListener('animationend', (e) => { if (e.target === fx.lastElementChild) fx.classList.remove('go'); });
  btn.onclick = () => { if (btn.disabled) return; api.burst(); onLaunch(); };
  api.setLabel(label, sub);
  return api;
}

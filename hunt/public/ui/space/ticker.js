// News ticker under the status bar: real items (see feed-items.js) scroll slowly right to left.
// Tap an item with a target to jump to its screen.
//   createTicker({items, onTap(item), speed, low, calm})
//     -> {el, setItems(items), pause(reason), resume(reason), paused(), setQuality({low, calm}), layout(), destroy()}
// Scrolling is one CSS transform animation, measured once per change (never per frame). Pause
// reasons stack (a popup, the page hidden, ...): it moves again only when every reason is gone.
// Low Graphics and Reduce Flashing: no scrolling; one item at a time, swapped every few seconds.
// With nothing true to show, the ticker hides itself.
import { tickItems } from './feed-items.js';
import { quality } from './quality.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const TICKER_SPEED = 36; // px per second: slow enough to read on a phone
export const STEP_MS = 4500;
const itemHtml = (it, copy) => {
  const inner = `<small>${esc(it.label)}</small><b>${esc(it.value)}</b>`;
  return it.target && !copy ? `<button type="button" class="sp-tk-item tap" data-id="${esc(it.id)}">${inner}</button>`
    : `<span class="sp-tk-item${it.target ? ' tap' : ''}" data-id="${esc(it.id)}">${inner}</span>`;
};

export function createTicker({ items = [], onTap = () => {}, speed = TICKER_SPEED, low, calm } = {}) {
  const el = document.createElement('div');
  el.className = 'sp-ticker';
  el.setAttribute('role', 'region');
  el.setAttribute('aria-label', 'News');
  el.innerHTML = `<span class="sp-tk-live" aria-hidden="true"><i></i>LIVE</span><div class="sp-tk-view"><div class="sp-tk-strip"></div></div>`;
  const view = el.querySelector('.sp-tk-view'), strip = el.querySelector('.sp-tk-strip');
  const reasons = new Set();
  let list = [], reps = 1, q = low != null || calm != null ? { low: !!low, calm: !!calm } : quality(), step = 0, stepTimer = 0, tickTimer = 0;
  const stepMode = () => q.low || q.calm;

  function render() {
    el.hidden = !list.length;
    el.classList.toggle('step', stepMode());
    if (!list.length) { strip.innerHTML = ''; return; }
    if (stepMode()) {
      step %= list.length;
      strip.innerHTML = `<div class="sp-tk-one">${itemHtml(list[step], false)}</div>`;
      strip.style.removeProperty('--tk-dist');
      return;
    }
    // two copies back to back: when the first has scrolled off, the loop restarts seamlessly
    // a short list is repeated so one run is at least as wide as the band (no long empty gap)
    const sep = '<i class="sp-tk-sep" aria-hidden="true"></i>';
    const run = list.map((it) => itemHtml(it, false)).join(sep) + (sep + list.map((it) => itemHtml(it, true)).join(sep)).repeat(reps - 1);
    const copy = Array(reps).fill(list.map((it) => itemHtml(it, true)).join(sep)).join(sep);
    strip.innerHTML = `<div class="sp-tk-run">${run}<i class="sp-tk-sep" aria-hidden="true"></i></div><div class="sp-tk-run" aria-hidden="true">${copy}<i class="sp-tk-sep" aria-hidden="true"></i></div>`;
    api.layout();
  }
  function stepNext() {
    if (document.hidden || reasons.size || !stepMode() || list.length < 2) return;
    step = (step + 1) % list.length;
    const one = strip.querySelector('.sp-tk-one');
    if (one) { one.innerHTML = itemHtml(list[step], false); one.classList.remove('in'); void one.offsetWidth; one.classList.add('in'); }
  }
  function timers() {
    clearInterval(stepTimer); clearInterval(tickTimer);
    stepTimer = stepMode() ? setInterval(stepNext, STEP_MS) : 0;
    // countdowns tick in place every 30 s (same width text, so the scroll is not re-measured)
    tickTimer = list.some((it) => it.until) ? setInterval(() => {
      const next = tickItems(list);
      if (next.length !== list.length) { list = next; render(); return; }
      list = next;
      for (const it of list) if (it.until) for (const b of strip.querySelectorAll(`[data-id="${CSS.escape(it.id)}"] b`)) b.textContent = it.value;
    }, 30000) : 0;
  }
  const api = {
    el,
    items: () => list,
    setItems(next) { list = Array.isArray(next) ? next.slice() : []; step = 0; reps = 1; render(); timers(); },
    // measure one run: distance and duration of the scroll (call on resize)
    layout() {
      if (stepMode() || !list.length) return;
      const run = strip.querySelector('.sp-tk-run');
      if (!run) return;
      const vw = view.clientWidth;
      for (const r of strip.querySelectorAll('.sp-tk-run')) r.style.minWidth = '';
      let w = run.getBoundingClientRect().width;
      if (!w) return;
      if (w < vw && reps < 8) { reps = Math.min(8, reps * Math.ceil(vw / w)); render(); return; }
      if (w < vw) { for (const r of strip.querySelectorAll('.sp-tk-run')) r.style.minWidth = vw + 'px'; w = vw; }
      strip.style.setProperty('--tk-dist', `${-w}px`);
      strip.style.setProperty('--tk-dur', `${(w / speed).toFixed(1)}s`);
    },
    pause(reason = 'api') { reasons.add(reason); el.classList.add('paused'); },
    resume(reason = 'api') { reasons.delete(reason); el.classList.toggle('paused', reasons.size > 0); },
    paused: () => reasons.size > 0,
    setQuality(nq) { q = nq; render(); timers(); },
    destroy() { clearInterval(stepTimer); clearInterval(tickTimer); el.remove(); },
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('.sp-tk-item');
    if (!b) return;
    const it = list.find((x) => x.id === b.dataset.id);
    if (it && it.target) onTap(it);
  });
  api.setItems(items);
  return api;
}

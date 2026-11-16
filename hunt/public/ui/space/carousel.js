// Mode carousel: holographic cards you swipe through; the centred card is bigger and glows.
// Touch/mouse swipe, the arrow buttons, and the keyboard (Left/Right, Home/End, Enter) all work.
// Tapping a side card brings it to the centre; tapping the centred card picks it.
//   createCarousel({cards, index, onChange(i, card), onPick(card)})
//     -> {el, index(), setIndex(i, {silent}), next(), prev(), layout(), destroy()}
// Card positions are pure CSS transforms (compositor only); layout() measures once per resize.
import { cardArt } from './cardart.js';
import { spIcon } from './icons.js';

export const MODE_CARDS = [
  { id: 'grand', name: 'GRAND RACE', sub: '3 laps · first past the flag', hue: '#34e7ff', tag: '01' },
  { id: 'elim', name: 'ELIMINATION', sub: 'Last place out every 18 s', hue: '#ff3fb8', tag: '02' },
  { id: 'battle', name: 'BATTLE ARENA', sub: 'Most takedowns in 2 min', hue: '#a77bff', tag: '03' },
  { id: 'trial', name: 'TIME TRIAL', sub: 'Just you and the clock', hue: '#ffc84a', tag: '04' },
];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// where card i sits when `at` is centred (offset in card slots, clamped so far cards stack out of view)
export const slotOffset = (i, at) => Math.max(-2, Math.min(2, i - at));
// swipe -> step: far enough or fast enough
export const swipeStep = (dx, ms, width) => (Math.abs(dx) > Math.max(36, width * 0.12) || (Math.abs(dx) > 16 && Math.abs(dx) / Math.max(1, ms) > 0.45) ? (dx < 0 ? 1 : -1) : 0);

export function createCarousel({ cards = MODE_CARDS, index = 0, onChange = () => {}, onPick = () => {} } = {}) {
  const el = document.createElement('section');
  el.className = 'sp-carousel';
  el.setAttribute('aria-roledescription', 'carousel');
  el.setAttribute('aria-label', 'Game mode');
  el.innerHTML = `<button type="button" class="sp-car-arrow prev" aria-label="Previous mode">${spIcon('left')}</button>
    <div class="sp-car-view" tabindex="0" aria-live="polite"><div class="sp-car-glow" aria-hidden="true"></div>${cards.map((c, i) => `<button type="button" class="sp-card" data-i="${i}" data-id="${c.id}" style="--hc:${c.hue}" aria-label="${esc(c.name)}: ${esc(c.sub)}">
      <span class="sp-card-art">${cardArt(c.id)}</span><span class="sp-card-scan" aria-hidden="true"></span>
      <span class="sp-card-tag" aria-hidden="true">${esc(c.tag || String(i + 1).padStart(2, '0'))}</span>
      <span class="sp-card-txt"><b class="sp-card-name">${esc(c.name)}</b><small class="sp-card-sub">${esc(c.sub)}</small></span></button>`).join('')}</div>
    <button type="button" class="sp-car-arrow next" aria-label="Next mode">${spIcon('right')}</button>
    <div class="sp-car-dots" aria-hidden="true">${cards.map(() => '<i></i>').join('')}</div>`;
  const view = el.querySelector('.sp-car-view'), cardEls = [...el.querySelectorAll('.sp-card')], dots = [...el.querySelectorAll('.sp-car-dots i')];
  const prevB = el.querySelector('.prev'), nextB = el.querySelector('.next'), glow = el.querySelector('.sp-car-glow');
  let at = Math.max(0, Math.min(cards.length - 1, index)), cw = 140, gap = 100, drag = 0;

  function place() {
    for (let i = 0; i < cardEls.length; i++) {
      const c = cardEls[i], o = slotOffset(i, at), centre = o === 0;
      const x = (o * gap) + drag, s = centre ? 1 : 0.76, op = Math.abs(o) > 1 ? 0 : 1;
      c.style.transform = `translate3d(${x.toFixed(1)}px,0,0) scale(${s})`;
      c.style.opacity = String(op);
      c.style.zIndex = String(10 - Math.abs(o));
      c.classList.toggle('on', centre);
      c.setAttribute('aria-current', centre ? 'true' : 'false');
      c.tabIndex = -1;
      c.inert = op === 0;
    }
    glow.style.setProperty('--hc', cards[at].hue);
    dots.forEach((d, i) => d.classList.toggle('on', i === at));
    prevB.disabled = at === 0; nextB.disabled = at === cards.length - 1;
  }
  const api = {
    el,
    index: () => at,
    card: () => cards[at],
    setIndex(i, { silent = false } = {}) {
      const j = Math.max(0, Math.min(cards.length - 1, i));
      const moved = j !== at;
      at = j; drag = 0; place();
      if (moved && !silent) onChange(at, cards[at]);
      return moved;
    },
    next() { return api.setIndex(at + 1); },
    prev() { return api.setIndex(at - 1); },
    // size the cards to the view (call after the view is in the page, and on resize)
    layout() {
      const r = view.getBoundingClientRect();
      if (!r.width) return;
      cw = Math.min(r.width / 2.1, r.height / 1.08, 280); // the side cards stay inside the view (under the arrows)
      gap = cw * 0.74;
      el.style.setProperty('--cw', cw.toFixed(1) + 'px');
      place();
    },
    destroy() { el.remove(); },
  };
  prevB.onclick = () => api.prev();
  nextB.onclick = () => api.next();
  view.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft') api.prev(); else if (k === 'ArrowRight') api.next(); else if (k === 'Home') api.setIndex(0); else if (k === 'End') api.setIndex(cards.length - 1);
    else if (k === 'Enter' || k === ' ') onPick(cards[at]); else return;
    e.preventDefault();
  });
  // swipe: the cards follow the finger (no transition), then settle
  let down = null, swallowClick = false;
  view.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    swallowClick = false; // (a drag that produced no click must not eat this tap)
    down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, moved: false };
  });
  view.addEventListener('pointermove', (e) => {
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x;
    if (!down.moved && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(e.clientY - down.y)) { down.moved = true; el.classList.add('dragging'); try { view.setPointerCapture(e.pointerId); } catch {} }
    if (down.moved) {
      const edge = (at === 0 && dx > 0) || (at === cards.length - 1 && dx < 0);
      drag = edge ? dx * 0.3 : dx; // rubber band at the ends
      place();
    }
  });
  const up = (e) => {
    if (!down || e.pointerId !== down.id) return;
    const d = down; down = null;
    el.classList.remove('dragging');
    if (!d.moved) return; // a tap: the click handler below decides
    const step = swipeStep(e.clientX - d.x, performance.now() - d.t, view.clientWidth);
    swallowClick = true;
    if (!step || !api.setIndex(at + step)) { drag = 0; place(); }
  };
  view.addEventListener('pointerup', up);
  view.addEventListener('pointercancel', (e) => { if (down && e.pointerId === down.id) { down = null; drag = 0; el.classList.remove('dragging'); place(); } });
  view.addEventListener('click', (e) => {
    if (swallowClick) { swallowClick = false; return; }
    const c = e.target.closest('.sp-card');
    if (!c) return;
    const i = Number(c.dataset.i);
    if (i === at) onPick(cards[at]); else api.setIndex(i);
  });
  place();
  return api;
}

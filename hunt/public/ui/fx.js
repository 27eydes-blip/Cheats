// Motion + feedback shared by every screen: button squash/bounce + click sound, screen
// slide/scale transitions, reward bursts (light rays + confetti), coins flying to the top bar.
import { sfx } from '../audio.js';
import { SETTINGS } from '../settings.js';
import { duck } from './music.js';

// ---------- buttons: press squash, release bounce, click sound (event delegation) ----------
let pressed = null;
addEventListener('pointerdown', (e) => {
  const b = e.target.closest?.('.btn, .chipbtn, .tap');
  if (!b || b.disabled) return;
  pressed = b; b.classList.add('pressed'); b.classList.remove('released');
  sfx('press', 0.6);
}, { passive: true });
const release = (e) => {
  const b = pressed; pressed = null;
  if (!b) return;
  b.classList.remove('pressed'); b.classList.add('released');
  setTimeout(() => b.classList.remove('released'), 280);
  if (e.type === 'pointerup' && b.contains(e.target)) sfx(b.dataset.sfx || 'click', 0.7);
};
addEventListener('pointerup', release, { passive: true });
addEventListener('pointercancel', release, { passive: true });

// ---------- screens ----------
const stack = [];
// The creator credit sits above every menu screen, popup and detail card (they cover the lobby's
// own credit line). CSS shows it only while one of them is open and keeps a strip free for it.
function overlayCredit() {
  if (document.getElementById('ovCredit')) return;
  const c = document.createElement('div');
  c.id = 'ovCredit'; c.className = 'ov-credit'; c.textContent = 'Made by Gleyde Technologies';
  document.body.appendChild(c);
}
export function openScreen(el, { pop = false } = {}) {
  overlayCredit();
  el.hidden = false;
  el.classList.remove('leave'); void el.offsetWidth; el.classList.add('enter');
  // keyboard: remember where focus was, and move it into the new screen
  el._from = document.activeElement;
  stack.push(el);
  makeFocusable(el);
  // screens fill and re-render their content after opening: keep new cards focusable (batched)
  if (!el._mo) { let q = false; el._mo = new MutationObserver(() => { if (q) return; q = true; queueMicrotask(() => { q = false; makeFocusable(el); }); }); }
  el._mo.observe(el, { childList: true, subtree: true });
  const first = focusables(el)[0];
  (first || el).focus({ preventScroll: true });
  sfx('whoosh', 0.5);
  if (pop) duck(true);
}
export function closeScreen(el) {
  if (!el || el.hidden) return Promise.resolve();
  const i = stack.indexOf(el); if (i >= 0) stack.splice(i, 1);
  el._mo?.disconnect();
  el.classList.remove('enter'); el.classList.add('leave');
  if (!stack.some((s) => s.classList.contains('ui-pop'))) duck(false);
  // focus goes back to what opened it (or into whatever screen is now on top)
  const back = el._from && el._from.isConnected && !el._from.closest('[hidden]') ? el._from : focusables(topScreen() || document.getElementById('lobby') || document.body)[0];
  if (el.contains(document.activeElement)) back?.focus({ preventScroll: true });
  return new Promise((r) => setTimeout(() => { el.hidden = true; el.classList.remove('leave'); r(); }, 190));
}

// ---------- keyboard: everything tappable is focusable; Escape closes the top-most screen ----------
const FOCUSABLE = 'button:not([disabled]), input:not([type="hidden"]):not([disabled]), select, textarea, summary, a[href], [tabindex="0"]';
const focusables = (root) => (root ? [...root.querySelectorAll(FOCUSABLE)].filter((e) => !e.closest('[hidden]') && e.getClientRects().length) : []);
// tappable divs (cards, tiles, the nameplate) get a tab stop and act like buttons
export function makeFocusable(root) {
  for (const e of root.querySelectorAll('.tap:not(button):not(a):not(input), .lsec[data-open], .lsec[data-armory]')) {
    if (e.hasAttribute('tabindex') || e.dataset.notab != null) continue;
    if (e.matches('.lsec') && e.querySelector('.tap')) continue; // its tiles are the tab stops
    e.tabIndex = 0;
    if (!e.getAttribute('role')) e.setAttribute('role', 'button');
  }
}
addEventListener('keydown', (e) => {
  const top = topScreen();
  if (e.key === 'Escape') {
    const mm = document.querySelector('.mm:not([hidden]) #mmCancel');
    const close = top ? top.querySelector(':scope > .ui-head .back, :scope > .card-a > [data-close], [data-close], .detail-actions [data-x]:not([data-sel])') : mm;
    if (close) { e.preventDefault(); close.click(); }
    return;
  }
  const t = e.target;
  if ((e.key === 'Enter' || e.key === ' ') && t && t.getAttribute?.('role') === 'button' && !/^(BUTTON|A|INPUT|SUMMARY)$/.test(t.tagName)) {
    if (e.repeat) return;
    e.preventDefault(); t.click();
    return;
  }
  // Tab stays inside the top-most screen or popup while one is open
  if (e.key === 'Tab' && top) {
    const f = focusables(top);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (i < 0 || (e.shiftKey && i === 0) || (!e.shiftKey && i === f.length - 1)) { e.preventDefault(); f[i < 0 ? 0 : e.shiftKey ? f.length - 1 : 0].focus(); }
  }
});
export const topScreen = () => stack[stack.length - 1] || null;
// generic popup: returns the card element
export function popup(html, { onClose } = {}) {
  const el = document.createElement('div');
  el.className = 'ui-pop'; el.hidden = true;
  el.innerHTML = `<div class="card-a">${html}</div>`;
  document.body.appendChild(el);
  let closed = false;
  const close = async () => { if (closed) return; closed = true; await closeScreen(el); onClose?.(); el.remove(); };
  el.addEventListener('pointerdown', (e) => { if (e.target === el) close(); });
  for (const b of el.querySelectorAll('[data-close]')) b.addEventListener('click', close);
  openScreen(el, { pop: true });
  return { el, card: el.firstElementChild, close };
}

// ---------- reward burst ----------
const COLS = ['#ff4d5e', '#4be06e', '#3a86ff', '#ffd23f', '#c04dff', '#4be0c8'];
export function rewardBurst(x = innerWidth / 2, y = innerHeight / 2) {
  sfx('reward');
  const rays = document.createElement('div');
  rays.className = 'rays'; rays.style.left = x + 'px'; rays.style.top = y + 'px';
  document.body.appendChild(rays);
  setTimeout(() => rays.remove(), 1200);
  if (SETTINGS.reduceFlash || SETTINGS.lowGfx) return;
  for (let i = 0; i < 28; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.background = COLS[i % COLS.length];
    c.style.left = x + 'px'; c.style.top = y + 'px';
    document.body.appendChild(c);
    const a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 220;
    c.animate([
      { transform: 'translate(-50%,-50%) rotate(0)', opacity: 1 },
      { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d - 60}px) rotate(${Math.random() * 720}deg)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${Math.cos(a) * d * 1.1}px, ${Math.sin(a) * d + 140}px) rotate(${Math.random() * 900}deg)`, opacity: 0 },
    ], { duration: 1200 + Math.random() * 500, easing: 'cubic-bezier(.2,.8,.4,1)' }).onfinish = () => c.remove();
  }
}

// ---------- coins fly from a point to the top bar coin chip ----------
export function flyCoins(fromEl, toSel = '#tbCoins', n = 8, iconHtml = '') {
  const to = document.querySelector(toSel);
  if (!fromEl || !to) return;
  const a = fromEl.getBoundingClientRect(), b = to.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const c = document.createElement('div');
    c.className = 'flycoin'; c.innerHTML = iconHtml;
    c.style.left = a.left + a.width / 2 - 13 + (Math.random() - 0.5) * 30 + 'px';
    c.style.top = a.top + a.height / 2 - 13 + (Math.random() - 0.5) * 20 + 'px';
    document.body.appendChild(c);
    setTimeout(() => {
      c.style.transform = `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(.6)`;
      c.style.opacity = '0.2';
    }, 40 + i * 45);
    setTimeout(() => { c.remove(); to.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.2)' }, { transform: 'scale(1)' }], { duration: 180 }); sfx('pickup', 0.4); }, 800 + i * 45);
  }
}

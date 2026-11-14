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
export function openScreen(el, { pop = false } = {}) {
  el.hidden = false;
  el.classList.remove('leave'); void el.offsetWidth; el.classList.add('enter');
  stack.push(el);
  sfx('whoosh', 0.5);
  if (pop) duck(true);
}
export function closeScreen(el) {
  if (!el || el.hidden) return Promise.resolve();
  const i = stack.indexOf(el); if (i >= 0) stack.splice(i, 1);
  el.classList.remove('enter'); el.classList.add('leave');
  if (!stack.some((s) => s.classList.contains('ui-pop'))) duck(false);
  return new Promise((r) => setTimeout(() => { el.hidden = true; el.classList.remove('leave'); r(); }, 190));
}
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

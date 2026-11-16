// Hexagonal glass currency badges (coins: warm gold, gems: magenta). Test currency only.
//   createHexBadge({kind: 'coin' | 'gem', value, onTap}) -> {el, set(value)}
import { spIcon } from './icons.js';
import { fmtCount } from './feed-items.js';

export function createHexBadge({ kind = 'coin', value = 0, onTap = null } = {}) {
  const el = document.createElement(onTap ? 'button' : 'div');
  if (onTap) { el.type = 'button'; el.onclick = () => onTap(kind); }
  el.className = `sp-hex sp-hex-${kind}`;
  el.innerHTML = `<span class="sp-hex-ic">${spIcon(kind === 'gem' ? 'gem' : 'coin')}</span><b class="sp-hex-val"></b>`;
  const api = {
    el,
    set(v) { el.querySelector('b').textContent = fmtCount(v); el.setAttribute('aria-label', `${kind === 'gem' ? 'Gems' : 'Coins'}: ${fmtCount(v)}`); },
  };
  api.set(value);
  return api;
}

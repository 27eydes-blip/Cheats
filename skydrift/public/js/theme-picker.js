// TEMPORARY theme picker for comparing sky themes live. Delete this file, its two lines in app.js
// and the "THEME PICKER" block at the end of style.css once a theme is chosen.
//
// Ways in:
//   ?theme=night   or  #theme-night   start on a theme (artifact links only keep the #hash form)
//   ?themes        or  #themes        open the picker panel on load
//   ?alt=350                          preview the sky at that altitude (0-700 points)
//   T / Shift+T    next / previous theme (when not typing); P opens or closes the panel
import { THEMES, THEME_ORDER, at } from '../themes.js';
import { applyTheme, getThemeId, setAltitude, getAltitude } from './sky.js';

const PICK_KEY = 'skydrift.themePreview';

export function initialTheme(fallback) {
  const q = new URLSearchParams(location.search).get('theme');
  const h = (location.hash.match(/^#theme-([a-z]+)$/) || [])[1];
  let saved = null;
  try { saved = localStorage.getItem(PICK_KEY); } catch {}
  return [q, h, saved].find((id) => id && THEMES[id]) || fallback;
}

let panel = null;
let previewAlt = null;
let realAlt = 0;

function choose(id) {
  applyTheme(id);
  try { localStorage.setItem(PICK_KEY, id); } catch {}
  if (previewAlt != null) setAltitude(previewAlt);
  render();
}

function strip(theme) {
  const stops = [0, 175, 350, 525, 700].map((a) => at(theme.sky, a)[2]);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

function render() {
  if (!panel) return;
  const cur = getThemeId();
  panel.querySelector('.tp-list').innerHTML = THEME_ORDER.map((id) => {
    const t = THEMES[id];
    return `<button class="tp-card ${id === cur ? 'on' : ''}" data-id="${id}" aria-pressed="${id === cur}">
      <span class="tp-strip" style="background:${strip(t)}"></span>
      <span class="tp-name">${t.name}</span>
      <span class="tp-mood">${t.mood}</span>
      <span class="tp-sw">${t.swatches.map((c) => `<i style="background:${c}" title="${c}"></i>`).join('')}<small>cost: ${t.cost}</small></span>
    </button>`;
  }).join('');
}

function open() {
  if (panel) { panel.hidden = !panel.hidden; if (panel.hidden) endPreview(); return; }
  panel = document.createElement('aside');
  panel.className = 'theme-picker';
  panel.setAttribute('aria-label', 'Theme picker (temporary)');
  panel.innerHTML = `
    <header><b>Sky variations</b><small>temporary picker · T / Shift+T to cycle</small><button class="tp-x" aria-label="Close theme picker">✕</button></header>
    <div class="tp-list"></div>
    <label class="tp-alt" for="tp-alt">Preview altitude <output id="tp-alt-out">live</output>
      <input id="tp-alt" type="range" min="0" max="700" step="5" value="${Math.round(getAltitude())}"></label>`;
  document.body.appendChild(panel);
  panel.querySelector('.tp-list').onclick = (e) => { const b = e.target.closest('[data-id]'); if (b) choose(b.dataset.id); };
  panel.querySelector('.tp-x').onclick = () => { panel.hidden = true; endPreview(); };
  const range = panel.querySelector('#tp-alt');
  range.oninput = () => {
    if (previewAlt == null) realAlt = getAltitude();
    previewAlt = +range.value;
    panel.querySelector('#tp-alt-out').textContent = `${previewAlt} pts`;
    setAltitude(previewAlt);
  };
  render();
}

function endPreview() {
  if (previewAlt == null) return;
  previewAlt = null;
  setAltitude(realAlt);
  if (panel) panel.querySelector('#tp-alt-out').textContent = 'live';
}

function cycle(dir) {
  const i = THEME_ORDER.indexOf(getThemeId());
  const id = THEME_ORDER[(i + dir + THEME_ORDER.length) % THEME_ORDER.length];
  choose(id);
  toastName(id);
}

let nameEl = null;
function toastName(id) {
  if (!nameEl) { nameEl = document.createElement('div'); nameEl.className = 'tp-flash'; document.body.appendChild(nameEl); }
  nameEl.textContent = `🎨 ${THEMES[id].name}`;
  nameEl.classList.remove('show'); void nameEl.offsetWidth; nameEl.classList.add('show');
}

export function initThemePicker() {
  const btn = document.createElement('button');
  btn.className = 'tp-open';
  btn.setAttribute('aria-label', 'Open theme picker');
  btn.textContent = '🎨';
  btn.onclick = open;
  document.body.appendChild(btn);
  document.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 't' || e.key === 'T') cycle(e.shiftKey ? -1 : 1);
    if (e.key === 'p' || e.key === 'P') open();
  });
  const params = new URLSearchParams(location.search);
  if (params.has('themes') || location.hash === '#themes') open();
  const alt = Number(params.get('alt'));
  if (alt > 0) setTimeout(() => { realAlt = getAltitude(); previewAlt = Math.min(700, alt); setAltitude(previewAlt, { instant: true }); }, 300);
}

// The sky behind every screen: gradient, clouds, islands and the glider all respond to altitude (points).
import { LANDMARKS, LAYERS, layerFor } from '../shared/score.js';

const PX_PER_POINT = 2.7;
const root = document.documentElement;
const world = document.getElementById('world');

// Colour stops by altitude in points: [top, mid, bottom]
const PALETTE = [
  [0, ['#9fc4f0', '#c9dcf7', '#ffe0ec']],
  [175, ['#8798d6', '#b4bde6', '#f0cfe6']],
  [350, ['#24447a', '#4a67a8', '#9b8bd3']],
  [525, ['#0f1640', '#24306a', '#5a4a98']],
  [700, ['#070a24', '#151d4a', '#43357d']],
];

function hex(c) { return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); }
function mix(a, b, t) {
  const A = hex(a), B = hex(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function colorsAt(alt) {
  for (let i = 0; i < PALETTE.length - 1; i++) {
    const [a0, c0] = PALETTE[i], [a1, c1] = PALETTE[i + 1];
    if (alt <= a1) {
      const t = clamp01((alt - a0) / (a1 - a0));
      return c0.map((c, k) => mix(c, c1[k], t));
    }
  }
  return PALETTE[PALETTE.length - 1][1];
}

// --- islands ---
const ISLE_COLORS = {
  meadows: ['#9be59b', '#5fbf7a', '#c79a6a'],
  reefs: ['#b9a6f0', '#7f71c9', '#8a7aa8'],
  aurora: ['#8ff0d2', '#43b39c', '#6a6f9e'],
  harbor: ['#f6d98a', '#c79a3a', '#4b4f86'],
};

function rand(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export function islandSVG(seed, layerId, extras = '') {
  const [grass, grassDark, rock] = ISLE_COLORS[layerId] || ISLE_COLORS.meadows;
  const r = rand(seed * 977 + 13);
  let rockPath = 'M10 40 ';
  const n = 9;
  for (let i = 1; i < n; i++) {
    const x = 10 + (i * 180) / n;
    const y = 40 + 18 + r() * 50 * Math.sin((i / n) * Math.PI);
    rockPath += `L${x.toFixed(1)} ${y.toFixed(1)} `;
  }
  rockPath += 'L190 40 Z';
  const trees = Array.from({ length: 2 + Math.floor(r() * 3) }, () => {
    const x = 30 + r() * 140, h = 14 + r() * 14;
    return `<g transform="translate(${x.toFixed(0)} 34)"><rect x="-1.5" y="${-h / 2}" width="3" height="${h / 2}" fill="${rock}"/><circle cy="${-h / 2}" r="${(h / 2.4).toFixed(1)}" fill="${grassDark}"/></g>`;
  }).join('');
  return `<svg viewBox="0 0 200 130" xmlns="http://www.w3.org/2000/svg">
    <path d="${rockPath}" fill="${rock}"/>
    <path d="${rockPath}" fill="url(#rockshade)" opacity=".35"/>
    <ellipse cx="100" cy="40" rx="92" ry="12" fill="${grassDark}"/>
    <ellipse cx="100" cy="36" rx="90" ry="11" fill="${grass}"/>
    ${trees}${extras}
    <defs><linearGradient id="rockshade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient></defs>
  </svg>`;
}

const ISLE_DECOR = {
  '🎈': '<g transform="translate(140 0)"><line x1="0" y1="34" x2="4" y2="6" stroke="#888"/><circle cx="4" cy="0" r="9" fill="#ff8fb0"/><circle cx="-8" cy="6" r="7" fill="#9fd4ff"/><line x1="0" y1="34" x2="-8" y2="12" stroke="#888"/></g>',
  '🪁': '<g transform="translate(150 -30)"><path d="M0 0 L12 14 L0 30 L-12 14 Z" fill="#ff9f5a"/><path d="M0 30 q-14 20 -40 64" stroke="#b07d22" fill="none"/></g>',
  '🐋': '<g transform="translate(70 18)"><ellipse cx="30" cy="8" rx="32" ry="13" fill="#6f8fd6"/><path d="M58 6 L74 -6 L70 10 Z" fill="#6f8fd6"/><circle cx="12" cy="6" r="2" fill="#223"/><text x="44" y="-10" font-size="10" fill="#fff">z z</text></g>',
  '🏮': '<g transform="translate(96 -40)"><rect x="-6" y="0" width="12" height="74" fill="#fff4dc"/><rect x="-9" y="-10" width="18" height="12" fill="#f5c542"/><circle cx="0" cy="-4" r="16" fill="#fff3b0" opacity=".45"/></g>',
};

export function buildWorld() {
  world.innerHTML = '';
  const home = document.createElement('div');
  home.className = 'isle home';
  home.style.left = '50%';
  home.style.bottom = 'calc(40vh - 215px)';
  home.innerHTML = islandSVG(3, 'meadows', '<g transform="translate(86 10)"><rect x="0" y="0" width="28" height="22" fill="#fff6e6"/><path d="M-4 2 L14 -14 L32 2 Z" fill="#f08fb5"/><rect x="11" y="10" width="7" height="12" fill="#b07d22"/></g>');
  world.appendChild(home);
  LANDMARKS.forEach((lm, i) => {
    const el = document.createElement('div');
    el.className = 'isle';
    el.dataset.at = lm.at;
    el.style.left = i % 2 ? '76%' : '24%';
    el.style.bottom = `calc(40vh + ${lm.at * PX_PER_POINT + 30}px)`;
    el.style.animationDelay = `${-i * 1.3}s`;
    const layer = layerFor(lm.at).id;
    el.innerHTML = `<span class="isle-label">${lm.icon} ${lm.name}</span>` + islandSVG(i + 7, layer, ISLE_DECOR[lm.icon] || '');
    world.appendChild(el);
  });
}

let current = 0;
export function setAltitude(points, { instant = false } = {}) {
  current = points;
  if (instant) document.body.classList.add('no-sky-anim');
  root.style.setProperty('--world-y', `${points * PX_PER_POINT}px`);
  const [top, mid, bottom] = colorsAt(points);
  root.style.setProperty('--sky-top', top);
  root.style.setProperty('--sky-mid', mid);
  root.style.setProperty('--sky-bottom', bottom);
  root.style.setProperty('--star-alpha', clamp01((points - 260) / 260).toFixed(2));
  root.style.setProperty('--aurora-alpha', (clamp01((points - 280) / 120) * (1 - clamp01((points - 600) / 100) * 0.6)).toFixed(2));
  root.style.setProperty('--sun-alpha', (1 - clamp01(points / 300)).toFixed(2));
  document.querySelectorAll('#sky .clouds').forEach((c, i) => {
    c.style.setProperty('--cy', `${points * PX_PER_POINT * [0.25, 0.6, 1.4][i]}px`);
  });
  document.body.classList.toggle('night', points >= 330);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', top);
  world.querySelectorAll('.isle[data-at]').forEach((el) => {
    el.classList.toggle('passed', points >= +el.dataset.at);
    el.classList.toggle('near', Math.abs(points - el.dataset.at) <= 45);
  });
  if (instant) requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('no-sky-anim')));
}

export function getAltitude() { return current; }

export function sparkle(count = 14) {
  const trail = document.getElementById('trail');
  for (let i = 0; i < count; i++) {
    const s = document.createElement('i');
    s.className = 'spark';
    s.style.setProperty('--dx', `${-40 - Math.random() * 90}px`);
    s.style.setProperty('--dy', `${30 + Math.random() * 80}px`);
    s.style.animationDelay = `${i * 40}ms`;
    trail.appendChild(s);
    setTimeout(() => s.remove(), 1400 + i * 40);
  }
  const g = document.getElementById('glider');
  g.classList.remove('climb');
  void g.offsetWidth;
  g.classList.add('climb');
  setTimeout(() => g.classList.remove('climb'), 1700);
}

export async function mountGlider() {
  try {
    const svg = await (await fetch('art/glider.svg')).text();
    document.getElementById('glider').innerHTML = svg;
  } catch {
    document.getElementById('glider').innerHTML = '<img src="art/glider.svg" alt="" style="width:100%">';
  }
}

export { LAYERS };

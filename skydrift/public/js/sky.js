// The sky behind every screen. Everything here is decoration driven by the active theme (../themes.js):
// gradient, sun/moon/rays, stars, aurora, three parallax cloud layers, particles, drifting debris, birds,
// distant lightning and the islands. Gameplay never reads anything from this file.
//
// Performance rules this file follows:
// - Moving layers are composited: they move with transform only (one rAF loop), never background-position,
//   filters or layout. Twinkles are opacity animations. No blur filters on anything that moves.
// - Positions are snapped to whole device pixels so vector art stays crisp while it scrolls.
// - The loop sleeps with the tab, and stops scrolling when the viewer prefers reduced motion.
import { LANDMARKS, layerFor } from '../shared/score.js';
import { THEMES, at, readability, resolveThemeId } from '../themes.js';

const PX_PER_POINT = 2.7;
const root = document.documentElement;
const sky = document.getElementById('sky');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

let theme = null;
let themeId = null;
let world = null;
let current = 0; // altitude in points
let night = false;
const layers = []; // scrolling tiled layers driven by the loop
let birds = null;
let lightningTimer = 0;
let lightningOn = true;

// ---------- small helpers ----------
const svgUri = (svg) => `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
function rand(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
const el = (cls, parent = sky, tag = 'div') => { const e = document.createElement(tag); e.className = cls; parent.appendChild(e); return e; };
const snap = (v) => { const d = window.devicePixelRatio || 1; return Math.round(v * d) / d; };
const f1 = (n) => n.toFixed(1);

// ---------- cloud tiles (one SVG per layer, generated per theme) ----------
function cloudTile(style, depth, c, seed) {
  const r = rand(seed);
  const W = Math.round([520, 640, 760][depth] * c.scale), H = Math.round([420, 520, 640][depth] * c.scale);
  const count = [3, 2, 2][depth];
  const grad = `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.top}"/><stop offset="1" stop-color="${c.bottom}"/></linearGradient>`;
  let shapes = '';
  for (let i = 0; i < count; i++) {
    // keep each cloud fully inside the tile so the tile repeats seamlessly
    const s = (0.55 + r() * 0.45) * c.scale * (depth === 2 ? 1.25 : 1);
    const x = W * (0.2 + 0.6 * ((i + r() * 0.5) / count)), y = H * (0.18 + 0.64 * r());
    if (style === 'puffy') {
      const puffs = [[0, 0, 1], [-0.9, 0.25, 0.7], [0.9, 0.2, 0.75], [-0.45, -0.35, 0.75], [0.4, -0.45, 0.85], [1.6, 0.4, 0.5], [-1.6, 0.45, 0.45]];
      shapes += `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s)})">${puffs.map(([a, b, q]) => `<circle cx="${a * 40}" cy="${b * 40}" r="${q * 40}"/>`).join('')}<rect x="-72" y="8" width="144" height="30" rx="15"/></g>`;
    } else if (style === 'wisp') {
      const len = 160 + r() * 140;
      shapes += `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s)})"><ellipse rx="${f1(len / 2)}" ry="7"/><ellipse cx="${f1(len * 0.15)}" cy="-9" rx="${f1(len * 0.32)}" ry="5"/><ellipse cx="${f1(-len * 0.2)}" cy="8" rx="${f1(len * 0.28)}" ry="4"/></g>`;
    } else if (style === 'heavy') {
      const w = 190 + r() * 80;
      const bumps = Array.from({ length: 6 }, (_, k) => `<circle cx="${f1(-w / 2 + 20 + (k * (w - 40)) / 5)}" cy="${f1(-18 - r() * 26)}" r="${f1(28 + r() * 20)}"/>`).join('');
      shapes += `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s)})">${bumps}<rect x="${f1(-w / 2)}" y="-30" width="${f1(w)}" height="42" rx="6"/></g>`;
    } else if (style === 'bubble') {
      const n = 4 + Math.floor(r() * 3);
      shapes += `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s)})">${Array.from({ length: n }, (_, k) => `<circle cx="${f1((k - n / 2) * 30)}" cy="${f1(Math.sin(k * 1.3) * 10)}" r="${f1(26 + (k % 2) * 10)}"/>`).join('')}</g>`;
    } else if (style === 'thin') {
      const len = 200 + r() * 160;
      shapes += `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(s)})"><rect x="${f1(-len / 2)}" y="-8" width="${f1(len)}" height="16" rx="8"/><rect x="${f1(-len * 0.3)}" y="-20" width="${f1(len * 0.5)}" height="14" rx="7"/><rect x="${f1(-len * 0.32)}" y="-20" width="${f1(len * 0.5)}" height="2" rx="1" fill="#b9c8f0" opacity=".8"/></g>`;
    }
  }
  return { uri: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${grad}</defs><g fill="url(#g)">${shapes}</g></svg>`), W, H };
}

// ---------- particle tiles ----------
function particleTile(kind, color, seed, variant) {
  const r = rand(seed + variant * 101);
  const W = 300, H = 300;
  let s = '';
  const N = { motes: 9, glints: 8, wind: 4, sparkles: 7, fireflies: 7, shards: 4, rocks: 4, bubbles: 5, stars: 22 }[kind] || 0;
  for (let i = 0; i < N; i++) {
    const x = 12 + r() * (W - 24), y = 12 + r() * (H - 24);
    if (kind === 'motes') s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(1.4 + r() * 1.6)}" fill="${color}"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(4 + r() * 2)}" fill="${color}" opacity=".18"/>`;
    else if (kind === 'glints' || kind === 'sparkles') {
      const q = 2.5 + r() * 3.5;
      s += `<path d="M${f1(x)} ${f1(y - q)} L${f1(x + q * 0.28)} ${f1(y - q * 0.28)} L${f1(x + q)} ${f1(y)} L${f1(x + q * 0.28)} ${f1(y + q * 0.28)} L${f1(x)} ${f1(y + q)} L${f1(x - q * 0.28)} ${f1(y + q * 0.28)} L${f1(x - q)} ${f1(y)} L${f1(x - q * 0.28)} ${f1(y - q * 0.28)} Z" fill="${color}"/>`;
    } else if (kind === 'wind') {
      const len = 40 + r() * 70;
      s += `<rect x="${f1(x - len / 2)}" y="${f1(y)}" width="${f1(len)}" height="1.4" rx=".7" fill="${color}"/>`;
    } else if (kind === 'fireflies') s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(5 + r() * 2)}" fill="${color}" opacity=".22"/><circle cx="${f1(x)}" cy="${f1(y)}" r="1.8" fill="${color}"/>`;
    else if (kind === 'shards') {
      const q = 4 + r() * 5;
      s += `<path d="M${f1(x)} ${f1(y - q * 1.6)} L${f1(x + q * 0.7)} ${f1(y)} L${f1(x)} ${f1(y + q * 1.6)} L${f1(x - q * 0.7)} ${f1(y)} Z" fill="${color}"/><path d="M${f1(x)} ${f1(y - q * 1.6)} L${f1(x + q * 0.7)} ${f1(y)} L${f1(x)} ${f1(y)} Z" fill="#fff" opacity=".6"/>`;
    } else if (kind === 'rocks') {
      const q = 3 + r() * 4;
      s += `<path d="M${f1(x - q)} ${f1(y)} L${f1(x - q * 0.3)} ${f1(y - q)} L${f1(x + q)} ${f1(y - q * 0.4)} L${f1(x + q * 0.6)} ${f1(y + q * 0.8)} Z" fill="${color}"/>`;
    } else if (kind === 'bubbles') s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(4 + r() * 6)}" fill="none" stroke="${color}" stroke-width="1.2"/>`;
    else if (kind === 'stars') s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(0.6 + r() * 1.1)}" fill="${r() < 0.2 ? '#fff1c4' : '#ffffff'}"/>`;
  }
  return { uri: svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${s}</svg>`), W, H };
}

// A layer of one repeating tile. Three nested boxes, each one tile larger than the screen so it wraps seamlessly:
//   .sky-layer   fixed to the screen
//   .sky-alt     follows altitude (the loop sets its translateY, only while the sky is climbing)
//   .sky-drift   drifts forever with a CSS animation stepped one CSS pixel at a time (compositor, no JS)
function tiledLayer(cls, tile, { vx = 0, vy = 0, parallax = 0, opacity = 1, twinkle = 0, z = 0 } = {}) {
  const wrap = el(`sky-layer ${cls}`);
  wrap.style.zIndex = z;
  wrap.style.opacity = opacity;
  const alt = el('sky-alt', wrap);
  alt.style.height = `calc(100% + ${tile.H}px)`;
  const drift = el('sky-drift', alt);
  drift.style.width = `calc(100% + ${tile.W}px)`;
  drift.style.height = `calc(100% + ${tile.H}px)`;
  drift.style.backgroundImage = tile.uri;
  drift.style.backgroundSize = `${tile.W}px ${tile.H}px`;
  const anims = [];
  if (vx || vy) {
    // whichever axis moves, one step per pixel; vertical drift goes up for negative vy
    const dist = vx ? tile.W : tile.H;
    const dur = dist / Math.abs(vx || vy);
    drift.style.setProperty('--dx', vx ? `${-tile.W}px` : '0px');
    drift.style.setProperty('--dy', vx ? `${vy ? (vy / vx) * tile.W : 0}px` : `${vy < 0 ? -tile.H : tile.H}px`);
    anims.push(`drift ${dur.toFixed(2)}s steps(${dist}) ${(-Math.random() * dur).toFixed(2)}s infinite`);
  }
  if (twinkle) anims.push(`twinkle ${twinkle}s ease-in-out ${(-Math.random() * twinkle).toFixed(2)}s infinite alternate`);
  drift.style.animation = anims.join(', ');
  const L = { wrap, alt, H: tile.H, parallax, y: current * PX_PER_POINT * parallax };
  layers.push(L);
  placeLayer(L);
  return L;
}

function placeLayer(L) {
  const oy = (((L.y % L.H) + L.H) % L.H) - L.H;
  L.alt.style.transform = `translate3d(0, ${snap(oy)}px, 0)`;
}

// ---------- islands ----------
function islandSVG(seed, layerId, extras = '') {
  const isl = theme.islands;
  const [top, topDark, rock, rockDark] = isl.layers[layerId] || isl.layers.meadows;
  const r = rand(seed * 977 + 13);
  const id = `${themeId}${seed}`;
  const defs = `<linearGradient id="rk${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${rock}"/><stop offset="1" stop-color="${rockDark}"/></linearGradient>`
    + `<linearGradient id="wf${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${isl.water || '#cfeaff'}" stop-opacity=".95"/><stop offset="1" stop-color="${isl.water || '#cfeaff'}" stop-opacity="0"/></linearGradient>`;
  const waterfall = (x, len = 70, w = 9) => isl.waterfall
    ? `<rect x="${x}" y="38" width="${w}" height="${len}" rx="${w / 2}" fill="url(#wf${id})"/><rect x="${x + 2}" y="44" width="1.5" height="${len * 0.6}" fill="#fff" opacity=".7"/>` : '';
  let body = '';

  if (isl.style === 'meadow' || isl.style === 'night') {
    let rockPath = 'M10 40 ';
    for (let i = 1; i < 9; i++) rockPath += `L${f1(10 + (i * 180) / 9)} ${f1(58 + r() * 50 * Math.sin((i / 9) * Math.PI))} `;
    rockPath += 'L190 40 Z';
    const trees = Array.from({ length: 2 + Math.floor(r() * 3) }, () => {
      const x = 30 + r() * 140, h = 14 + r() * 14;
      return isl.style === 'night'
        ? `<g transform="translate(${f1(x)} 34)"><rect x="-1" y="${f1(-h / 2)}" width="2" height="${f1(h / 2)}" fill="${rockDark}"/><circle cy="${f1(-h / 2)}" r="${f1(h / 3)}" fill="${topDark}"/></g>`
        : `<g transform="translate(${f1(x)} 34)"><rect x="-1.5" y="${f1(-h / 2)}" width="3" height="${f1(h / 2)}" fill="${rockDark}"/><circle cy="${f1(-h / 2)}" r="${f1(h / 2.4)}" fill="${topDark}"/></g>`;
    }).join('');
    const sideShade = isl.longShadow
      ? `<path d="${rockPath}" fill="url(#ls${id})"/><linearGradient id="ls${id}" x1="1" y1="0" x2="0" y2="0"><stop offset=".35" stop-color="${rockDark}" stop-opacity="0"/><stop offset="1" stop-color="${rockDark}" stop-opacity=".75"/></linearGradient>` : '';
    let glow = '';
    if (isl.style === 'night') {
      const g = isl.glow;
      glow = Array.from({ length: 5 }, (_, k) => {
        const x = 24 + r() * 152, c = g[k % 2];
        return `<g transform="translate(${f1(x)} 32)"><rect x="-.6" y="-7" width="1.2" height="7" fill="${topDark}"/><circle cy="-8" r="5" fill="${c}" opacity=".25"/><circle cy="-8" r="1.8" fill="${c}"/></g>`;
      }).join('') + `<g transform="translate(${f1(40 + r() * 120)} 18)"><rect x="-.8" y="0" width="1.6" height="18" fill="${rockDark}"/><circle cy="-2" r="10" fill="${g[2]}" opacity=".22"/><rect x="-3.5" y="-6" width="7" height="8" rx="1.5" fill="${g[2]}"/></g>`;
    }
    body = `<path d="${rockPath}" fill="url(#rk${id})"/>${sideShade}${waterfall(150)}
      <ellipse cx="100" cy="40" rx="92" ry="12" fill="${topDark}"/><ellipse cx="100" cy="36" rx="90" ry="11" fill="${top}"/>${trees}${glow}`;
  } else if (isl.style === 'crystal') {
    let shards = '';
    const n = 8;
    for (let i = 0; i < n; i++) {
      const x0 = 14 + (i * 172) / n, x1 = 14 + ((i + 1) * 172) / n, mid = (x0 + x1) / 2 + (r() - 0.5) * 6;
      const len = 26 + r() * 60 * Math.sin(((i + 0.5) / n) * Math.PI) + 10;
      shards += `<path d="M${f1(x0)} 40 L${f1(x1)} 40 L${f1(mid)} ${f1(40 + len)} Z" fill="url(#rk${id})"/><path d="M${f1(x0)} 40 L${f1((x0 + x1) / 2)} 40 L${f1(mid)} ${f1(40 + len)} Z" fill="#fff" opacity=".28"/>`;
    }
    const spires = Array.from({ length: 2 + Math.floor(r() * 2) }, () => {
      const x = 30 + r() * 140, h = 16 + r() * 22, w = 5 + r() * 4;
      return `<path d="M${f1(x - w)} 36 L${f1(x)} ${f1(36 - h)} L${f1(x + w)} 36 Z" fill="${rock}" stroke="#fff" stroke-opacity=".7" stroke-width=".8"/><path d="M${f1(x)} ${f1(36 - h)} L${f1(x + w)} 36 L${f1(x)} 36 Z" fill="${rockDark}" opacity=".5"/>`;
    }).join('');
    body = `${shards}<path d="M8 40 L30 30 L170 30 L192 40 L170 46 L30 46 Z" fill="${topDark}"/><path d="M12 38 L32 28 L168 28 L188 38 L168 42 L32 42 Z" fill="${top}" stroke="#fff" stroke-width=".8"/>${spires}`;
  } else if (isl.style === 'storm') {
    let p = 'M8 40 ';
    for (let i = 1; i < 14; i++) p += `L${f1(8 + (i * 184) / 14)} ${f1(46 + (i % 2 ? 30 + r() * 46 : 8 + r() * 14) * Math.sin((i / 14) * Math.PI))} `;
    p += 'L192 40 Z';
    let topEdge = 'M10 40 ';
    for (let i = 1; i < 10; i++) topEdge += `L${f1(10 + i * 18)} ${f1(31 + r() * 5)} `;
    topEdge += 'L190 40 Z';
    const px = 40 + r() * 60;
    const ruins = `<g fill="${rock}" stroke="${rockDark}" stroke-width="1"><path d="M${f1(px)} 34 L${f1(px)} 10 L${f1(px + 4)} 6 L${f1(px + 8)} 12 L${f1(px + 8)} 34 Z"/><path d="M${f1(px + 26)} 34 L${f1(px + 26)} 18 L${f1(px + 34)} 22 L${f1(px + 34)} 34 Z"/><rect x="${f1(px - 4)}" y="8" width="18" height="3" transform="rotate(-8 ${f1(px)} 8)"/></g>`;
    const tx = 130 + r() * 40;
    const tree = `<path d="M${f1(tx)} 34 L${f1(tx)} 14 M${f1(tx)} 22 L${f1(tx - 8)} 14 M${f1(tx)} 18 L${f1(tx + 7)} 10 M${f1(tx - 8)} 14 L${f1(tx - 11)} 9" stroke="${rockDark}" stroke-width="2" stroke-linecap="round" fill="none"/>`;
    body = `<path d="${p}" fill="url(#rk${id})"/>${waterfall(52, 60, 6)}<path d="${topEdge}" fill="${top}"/><path d="M10 40 L190 40 L190 43 L10 43 Z" fill="${topDark}"/>${ruins}${tree}`;
  } else if (isl.style === 'pastel') {
    const under = 'M14 40 C 14 74, 52 98, 100 100 C 148 98, 186 74, 186 40 Z';
    const dots = Array.from({ length: 7 }, () => `<circle cx="${f1(40 + r() * 120)}" cy="${f1(50 + r() * 34)}" r="${f1(2 + r() * 3)}" fill="#fff" opacity=".45"/>`).join('');
    const scallops = Array.from({ length: 9 }, (_, k) => `<circle cx="${f1(22 + k * 19.5)}" cy="42" r="9" fill="${topDark}"/>`).join('');
    const trees = Array.from({ length: 2 + Math.floor(r() * 2) }, (_, k) => {
      const x = 40 + r() * 120;
      return k % 2
        ? `<g transform="translate(${f1(x)} 34)"><rect x="-1.5" y="-18" width="3" height="18" rx="1.5" fill="#fff"/><circle cy="-22" r="8" fill="${rock}"/><path d="M-4 -22 a4 4 0 1 1 4 4" stroke="#fff" stroke-width="1.6" fill="none"/></g>`
        : `<g transform="translate(${f1(x)} 34)"><rect x="-2.5" y="-8" width="5" height="8" rx="2" fill="#fff6ee"/><path d="M-11 -8 a11 9 0 0 1 22 0 Z" fill="${rock}"/><circle cx="-4" cy="-12" r="1.6" fill="#fff"/><circle cx="4" cy="-11" r="1.3" fill="#fff"/></g>`;
    }).join('');
    body = `<path d="${under}" fill="url(#rk${id})"/>${dots}${waterfall(140, 60, 10)}${scallops}<ellipse cx="100" cy="36" rx="88" ry="12" fill="${top}"/>${trees}`;
  }
  return `<svg viewBox="0 0 200 130" xmlns="http://www.w3.org/2000/svg" overflow="visible"><defs>${defs}</defs>${body}${extras}</svg>`;
}

const ISLE_DECOR = {
  '🎈': '<g transform="translate(140 0)"><line x1="0" y1="34" x2="4" y2="6" stroke="#888"/><circle cx="4" cy="0" r="9" fill="#ff8fb0"/><circle cx="-8" cy="6" r="7" fill="#9fd4ff"/><line x1="0" y1="34" x2="-8" y2="12" stroke="#888"/></g>',
  '🪁': '<g transform="translate(150 -30)"><path d="M0 0 L12 14 L0 30 L-12 14 Z" fill="#ff9f5a"/><path d="M0 30 q-14 20 -40 64" stroke="#b07d22" fill="none"/></g>',
  '🐋': '<g transform="translate(70 18)"><ellipse cx="30" cy="8" rx="32" ry="13" fill="#6f8fd6"/><path d="M58 6 L74 -6 L70 10 Z" fill="#6f8fd6"/><circle cx="12" cy="6" r="2" fill="#223"/></g>',
  '🏮': '<g transform="translate(96 -40)"><rect x="-6" y="0" width="12" height="74" fill="#fff4dc"/><rect x="-9" y="-10" width="18" height="12" fill="#f5c542"/><circle cx="0" cy="-4" r="16" fill="#fff3b0" opacity=".45"/></g>',
};
const HOUSE = '<g transform="translate(86 10)"><rect x="0" y="0" width="28" height="22" fill="#fff6e6"/><path d="M-4 2 L14 -14 L32 2 Z" fill="#f08fb5"/><rect x="11" y="10" width="7" height="12" fill="#b07d22"/></g>';

function buildWorld() {
  world.innerHTML = '';
  const add = (cls, left, bottom, svg, delay = 0, label = '') => {
    const e = el(cls, world);
    e.style.left = left;
    e.style.bottom = bottom;
    const bob = el('isle-bob', e);
    bob.style.animationDelay = `${delay}s`;
    bob.innerHTML = label + svg;
    return e;
  };
  add('isle home', '50%', 'calc(40vh - 215px)', islandSVG(3, 'meadows', HOUSE));
  LANDMARKS.forEach((lm, i) => {
    const e = add('isle', i % 2 ? '76%' : '24%', `calc(40vh + ${lm.at * PX_PER_POINT + 30}px)`,
      islandSVG(i + 7, layerFor(lm.at).id, ISLE_DECOR[lm.icon] || ''), -i * 1.3,
      `<span class="isle-label">${lm.icon} ${lm.name}</span>`);
    e.dataset.at = lm.at;
  });
}

// ---------- birds (an occasional small flock crossing the sky; one compositor animation per crossing) ----------
let birdTimer = 0;
function makeBirds(color) {
  const b = el('birds');
  const r = rand(Date.now() & 0xffff);
  b.innerHTML = `<svg width="90" height="40" viewBox="0 0 90 40" xmlns="http://www.w3.org/2000/svg">${Array.from({ length: 4 }, (_, i) => {
    const x = 8 + i * 20 + r() * 6, y = 10 + (i % 2) * 12 + r() * 5;
    return `<path class="wing" style="animation-delay:${(-r()).toFixed(2)}s" d="M${f1(x - 6)} ${f1(y - 2)} Q${f1(x - 3)} ${f1(y - 5)} ${f1(x)} ${f1(y)} Q${f1(x + 3)} ${f1(y - 5)} ${f1(x + 6)} ${f1(y - 2)}" stroke="${color}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
  }).join('')}</svg>`;
  const fly = () => {
    clearTimeout(birdTimer);
    if (!b.isConnected) return;
    if (!reduceMotion.matches && !document.hidden) {
      const y = Math.round(innerHeight * (0.1 + Math.random() * 0.25));
      const dist = innerWidth + 220;
      b.animate([
        { transform: `translate3d(${innerWidth + 40}px, ${y}px, 0)`, opacity: 1 },
        { transform: `translate3d(${innerWidth / 2}px, ${y - 14}px, 0)`, opacity: 1, offset: 0.5 },
        { transform: `translate3d(-180px, ${y + 6}px, 0)`, opacity: 1 },
      ], { duration: (dist / 34) * 1000, easing: `steps(${Math.round(dist)})` });
    }
    birdTimer = setTimeout(fly, 20000 + Math.random() * 20000);
  };
  birdTimer = setTimeout(fly, 3000 + Math.random() * 6000);
  return b;
}

// ---------- lightning (storm only; subtle, optional) ----------
function scheduleLightning() {
  clearTimeout(lightningTimer);
  const cfg = theme.lightning;
  const flash = sky.querySelector('.lightning');
  if (!cfg || !flash || !lightningOn || reduceMotion.matches) return;
  lightningTimer = setTimeout(() => {
    if (!document.hidden) {
      flash.style.setProperty('--lx', `${15 + Math.random() * 70}%`);
      const m = cfg.maxOpacity;
      flash.animate([{ opacity: 0 }, { opacity: m, offset: 0.12 }, { opacity: m * 0.3, offset: 0.3 }, { opacity: m * 0.75, offset: 0.42 }, { opacity: 0 }],
        { duration: 900, easing: 'ease-out' });
    }
    scheduleLightning();
  }, (cfg.minGap + Math.random() * (cfg.maxGap - cfg.minGap)) * 1000);
}
export function setLightning(on) {
  lightningOn = on;
  try { localStorage.setItem('skydrift.lightning', on ? 'on' : 'off'); } catch {}
  scheduleLightning();
}
export function lightningEnabled() { return lightningOn; }

// ---------- theme ----------
export function applyTheme(id) {
  themeId = resolveThemeId(id);
  theme = THEMES[themeId];
  document.body.dataset.theme = themeId;
  layers.length = 0;
  clearTimeout(lightningTimer);
  const glider = document.getElementById('glider-wrap');
  sky.innerHTML = '';

  el('sky-grad');
  if (theme.celestial.kind !== 'none') el(`celestial c-${theme.celestial.kind}`);
  const stars = el('stars');
  // two star fields twinkling out of step = cheap twinkle
  [0, 1].forEach((v) => {
    const L = tiledLayer('stars-field', particleTile('stars', '#fff', 7, v), { parallax: 0.06, twinkle: v ? 4.5 : 6 });
    stars.appendChild(L.wrap);
  });
  if (theme.aurora) {
    const a = el('aurora');
    a.style.setProperty('--a1', theme.aurora.colors[0]);
    a.style.setProperty('--a2', theme.aurora.colors[1]);
    a.style.setProperty('--a3', theme.aurora.colors[2]);
    for (let i = 0; i < 3; i++) el('', a, 'i');
  }
  const c = theme.clouds;
  tiledLayer('clouds far', cloudTile(c.style, 0, { ...c, ...c.layers.far }, 11), { vx: c.layers.far.speed, parallax: 0.25, opacity: c.layers.far.opacity });
  if (theme.debris.kind !== 'none') {
    const d = theme.debris;
    tiledLayer('debris', particleTile(d.kind, d.color, 23, 0), { vx: d.speed, vy: d.kind === 'bubbles' ? -d.speed : d.speed * 0.3, parallax: 0.45, opacity: d.opacity });
  }
  world = el('world');
  world.id = 'world';
  tiledLayer('clouds mid', cloudTile(c.style, 1, { ...c, ...c.layers.mid }, 29), { vx: c.layers.mid.speed, parallax: 0.6, opacity: c.layers.mid.opacity });
  if (theme.particles.kind !== 'none') {
    const p = theme.particles;
    const motion = { motes: [p.speed * 0.4, -p.speed], glints: [p.speed, 0], wind: [p.speed, 0], sparkles: [p.speed * 0.3, p.speed], fireflies: [p.speed * 0.6, -p.speed * 0.4] }[p.kind] || [0, 0];
    const tw = p.kind === 'wind' ? 0 : 3.5;
    tiledLayer('particles', particleTile(p.kind, p.color, 41, 0), { vx: motion[0], vy: motion[1], parallax: 0.9, opacity: p.opacity, twinkle: tw });
    if (tw) tiledLayer('particles', particleTile(p.kind, p.color, 41, 1), { vx: motion[0] * 0.8, vy: motion[1] * 0.8, parallax: 0.9, opacity: p.opacity, twinkle: tw * 1.3 });
  }
  if (glider) sky.appendChild(glider);
  tiledLayer('clouds near', cloudTile(c.style, 2, { ...c, ...c.layers.near }, 47), { vx: c.layers.near.speed, parallax: 1.4, opacity: c.layers.near.opacity, z: 3 });
  if (theme.lightning) {
    const f = el('lightning');
    f.innerHTML = '<svg viewBox="0 0 40 120" class="bolt"><path d="M22 0 L12 50 L22 52 L8 120 L30 44 L19 42 L28 0 Z" fill="#efeaff"/></svg>';
  }
  clearTimeout(birdTimer);
  birds = theme.birds ? makeBirds(theme.birds.color) : null;

  root.style.setProperty('--spark', theme.spark);
  root.style.setProperty('--g-dark', theme.glider.outlineDark);
  root.style.setProperty('--g-light', theme.glider.outlineLight);
  root.style.setProperty('--isle-shadow', theme.islands.shadow);
  buildWorld();
  setAltitude(current, { instant: true });
  try { lightningOn = localStorage.getItem('skydrift.lightning') !== 'off'; } catch {}
  if (theme.lightning && !theme.lightning.enabled) lightningOn = false;
  scheduleLightning();
  document.dispatchEvent(new CustomEvent('sky-theme', { detail: { id: themeId } }));
}

export function getThemeId() { return themeId; }

// ---------- altitude ----------
export function setAltitude(points, { instant = false } = {}) {
  current = points;
  if (!theme) return;
  if (instant) document.body.classList.add('no-sky-anim');
  root.style.setProperty('--world-y', `${points * PX_PER_POINT}px`);
  const read = readability(theme, points);
  const [top, mid, bottom] = read.colors;
  root.style.setProperty('--sky-top', top);
  root.style.setProperty('--sky-mid', mid);
  root.style.setProperty('--sky-bottom', bottom);
  root.style.setProperty('--star-alpha', at(theme.stars, points).toFixed(2));
  root.style.setProperty('--aurora-alpha', theme.aurora ? at(theme.aurora.alpha, points).toFixed(2) : '0');
  root.style.setProperty('--celestial-alpha', theme.celestial.alpha ? at(theme.celestial.alpha, points).toFixed(2) : '0');
  root.style.setProperty('--celestial-y', `${(points * 0.18).toFixed(0)}px`);
  root.style.setProperty('--sky-halo', read.halo + 'b3');
  root.style.setProperty('--glass-a', read.glass);
  night = read.night;
  document.body.classList.toggle('night', night);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', top);
  for (const L of layers) if (instant || reduceMotion.matches) { L.y = points * PX_PER_POINT * L.parallax; placeLayer(L); }
  wake();
  world?.querySelectorAll('.isle[data-at]').forEach((e) => e.classList.toggle('passed', points >= +e.dataset.at));
  if (instant) requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('no-sky-anim')));
}

export function getAltitude() { return current; }
export function isNight() { return night; }

// ---------- the climb loop: runs only while layers are easing to a new altitude, then sleeps ----------
let running = false;
let last = 0;
function wake() {
  if (running) return;
  running = true;
  last = 0;
  requestAnimationFrame(frame);
}
function frame(t) {
  const dt = Math.min(0.1, (t - (last || t)) / 1000);
  last = t;
  const ease = 1 - Math.exp(-dt * 2.6);
  let moving = false;
  for (const L of layers) {
    const target = current * PX_PER_POINT * L.parallax;
    const d = target - L.y;
    if (Math.abs(d) < 0.3) { if (d) { L.y = target; placeLayer(L); } continue; }
    L.y += d * ease;
    placeLayer(L);
    moving = true;
  }
  if (moving) requestAnimationFrame(frame);
  else running = false;
}

export function initSky(id) {
  const wrap = document.getElementById('glider-wrap');
  if (wrap) wrap.remove();
  const g = document.createElement('div');
  g.id = 'glider-wrap';
  g.innerHTML = '<div id="glider"></div><div id="trail"></div>';
  sky.appendChild(g);
  applyTheme(id);
  reduceMotion.addEventListener?.('change', scheduleLightning);
}

// ---------- glider ----------
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

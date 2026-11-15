// Sky creatures and map fragments: what rare answers and streaks unlock.
import { LAYERS } from '../shared/score.js';

export const CREATURES = [
  // Befriended by legendary answers (90+ pts), in an order picked per answer
  { id: 'moonmoth', name: 'Moonmoth', emoji: '🦋', via: 'legendary', blurb: 'Only flies on Tuesdays nobody remembers.', m: ['#e9e3ff', '#a990f0'] },
  { id: 'thunder-otter', name: 'Thunder Otter', emoji: '🦦', via: 'legendary', blurb: 'Juggles lightning. Drops it a lot.', m: ['#ffe9b8', '#e8a64a'] },
  { id: 'aurora-fox', name: 'Aurora Fox', emoji: '🦊', via: 'legendary', blurb: 'Its tail is where the colours come from.', m: ['#d4fff0', '#57d1a8'] },
  { id: 'comet-koi', name: 'Comet Koi', emoji: '🐠', via: 'legendary', blurb: 'Swims upstream through meteor showers.', m: ['#ffe0d0', '#ff8f6a'] },
  { id: 'hoot-of-stars', name: 'Starling Owl', emoji: '🦉', via: 'legendary', blurb: 'Counts the stars. Gets a different number every night.', m: ['#e2e6ff', '#7d89d6'] },
  { id: 'nimbus-jelly', name: 'Nimbus Jelly', emoji: '🪼', via: 'legendary', blurb: 'A jellyfish made of drizzle.', m: ['#e0f4ff', '#7cc7f0'] },
  { id: 'gale-dragonling', name: 'Gale Dragonling', emoji: '🐉', via: 'legendary', blurb: 'Sneezes breezes. Very polite about it.', m: ['#e6ffd6', '#7fcf6a'] },
  { id: 'lantern-turtle', name: 'Lantern Turtle', emoji: '🐢', via: 'legendary', blurb: 'Carries a lighthouse on its shell.', m: ['#fff6cc', '#e8c24a'] },
  { id: 'calf-whale', name: 'Sky Whale Calf', emoji: '🐋', via: 'legendary', blurb: 'Still learning which way is up.', m: ['#dfeaff', '#6f8fd6'] },
  { id: 'hum-bee', name: 'Hum-Hum Bee', emoji: '🐝', via: 'legendary', blurb: 'Hums in the key of thunder.', m: ['#fff3c4', '#f5b842'] },
  { id: 'prism-snail', name: 'Prism Snail', emoji: '🐌', via: 'legendary', blurb: 'Leaves rainbows instead of slime.', m: ['#ffe6f5', '#d68fd0'] },
  { id: 'cirrus-crane', name: 'Cirrus Crane', emoji: '🕊️', via: 'legendary', blurb: 'Folds itself out of clouds each morning.', m: ['#ffffff', '#b9c6e6'] },
  // Earned by showing up
  { id: 'pip', name: 'Pip the Cloud Puff', emoji: '☁️', via: 'first', blurb: 'Joined you on your very first flight.', m: ['#ffffff', '#a9c8f5'] },
  { id: 'ember-finch', name: 'Ember Finch', emoji: '🐤', via: 'streak', streak: 3, blurb: 'Follows pilots who fly 3 days running.', m: ['#fff0c4', '#ffb347'] },
  { id: 'zephyr-seal', name: 'Zephyr Seal', emoji: '🦭', via: 'streak', streak: 7, blurb: 'Barks at the wind. A 7-day streak friend.', m: ['#e6f0ff', '#8aa7d6'] },
  { id: 'tide-kite', name: 'Tidekite', emoji: '🪁', via: 'streak', streak: 14, blurb: 'A kite that flies itself. 14-day streak.', m: ['#ffe6d6', '#ff8f6a'] },
  { id: 'grand-whale', name: 'The Grandmother Whale', emoji: '🐳', via: 'streak', streak: 30, blurb: 'She remembers every pilot. 30-day streak.', m: ['#d6e6ff', '#3b4ba8'] },
];

export const FRAGMENTS_PER_MAP = 6;
export const MAPS = LAYERS.map((l, i) => ({ id: l.id, name: `${l.name} Chart`, index: i }));

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Decide what a scored answer unlocks. Mutates profile; returns the list of new finds.
export function awardForAnswer(profile, { date, idx, points, practice }) {
  const finds = [];
  if (practice) return finds;
  if (points >= 75) {
    const total = MAPS.length * FRAGMENTS_PER_MAP;
    if (profile.fragments < total) {
      profile.fragments += 1;
      const mapIdx = Math.floor((profile.fragments - 1) / FRAGMENTS_PER_MAP);
      finds.push({ kind: 'fragment', map: MAPS[mapIdx], n: ((profile.fragments - 1) % FRAGMENTS_PER_MAP) + 1 });
    } else {
      profile.stardust = (profile.stardust || 0) + 1;
    }
  }
  if (points >= 90) {
    const pool = CREATURES.filter((c) => c.via === 'legendary' && !profile.creatures[c.id]);
    if (pool.length) {
      const c = pool[hash(`${date}#${idx}`) % pool.length];
      profile.creatures[c.id] = date;
      finds.push({ kind: 'creature', creature: c });
    } else {
      profile.stardust = (profile.stardust || 0) + 3;
    }
  }
  return finds;
}

export function awardForDay(profile, date) {
  const finds = [];
  const give = (id) => {
    if (profile.creatures[id]) return;
    profile.creatures[id] = date;
    finds.push({ kind: 'creature', creature: CREATURES.find((c) => c.id === id) });
  };
  give('pip');
  for (const c of CREATURES) if (c.via === 'streak' && profile.streak >= c.streak) give(c.id);
  return finds;
}

export function medalHTML(c, locked = false) {
  return `<div class="medal" style="--m1:${c.m[0]};--m2:${c.m[1]}">${locked ? '?' : c.emoji}</div>`;
}

export function renderCreatures(el, profile) {
  el.innerHTML = CREATURES.map((c) => {
    const got = !!profile.creatures[c.id];
    const hint = c.via === 'streak' ? `${c.streak}-day streak` : c.via === 'first' ? 'First flight' : 'Legendary answer';
    return `<div class="creature ${got ? '' : 'locked'} ${c.via === 'legendary' ? 'legendary' : ''}" title="${got ? c.blurb : hint}">
      ${medalHTML(c, !got)}${got ? c.name : '???'}<small>${got ? c.blurb : hint}</small></div>`;
  }).join('');
}

// Hand-drawn-ish treasure chart per sky layer, revealed tile by tile.
function mapSVG(map) {
  const pal = [
    ['#fbf1d8', '#9be59b', '#5fbf7a'],
    ['#f1ebfb', '#b9a6f0', '#7f71c9'],
    ['#e4f6f1', '#8ff0d2', '#43b39c'],
    ['#efeaf8', '#f6d98a', '#c79a3a'],
  ][map.index];
  let s = map.index * 9301 + 49297;
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const isles = Array.from({ length: 6 }, (_, i) => {
    const x = 40 + (i % 3) * 100 + r() * 30, y = 40 + Math.floor(i / 3) * 90 + r() * 26, rx = 22 + r() * 18;
    return { x, y, rx };
  });
  const route = isles.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(0)} ${p.y.toFixed(0)}`).join(' ');
  return `<svg viewBox="0 0 360 240" xmlns="http://www.w3.org/2000/svg">
    <rect width="360" height="240" fill="${pal[0]}"/>
    <g stroke="rgba(120,90,40,.12)">${Array.from({ length: 8 }, (_, i) => `<line x1="${i * 50}" y1="0" x2="${i * 50}" y2="240"/>`).join('')}</g>
    ${isles.map((p) => `<ellipse cx="${p.x}" cy="${p.y + 6}" rx="${p.rx}" ry="${p.rx * 0.45}" fill="${pal[2]}"/><ellipse cx="${p.x}" cy="${p.y}" rx="${p.rx}" ry="${p.rx * 0.45}" fill="${pal[1]}"/>`).join('')}
    <path d="${route}" fill="none" stroke="#b0442c" stroke-width="2.5" stroke-dasharray="6 6"/>
    <text x="${isles[5].x - 8}" y="${isles[5].y + 6}" font-size="22" font-weight="700" fill="#b0442c">✕</text>
    <g transform="translate(322 200)"><circle r="20" fill="none" stroke="#8a5a10"/><path d="M0 -18 L5 0 L0 18 L-5 0 Z" fill="#8a5a10"/><text y="-23" text-anchor="middle" font-size="10" fill="#8a5a10">N</text></g>
  </svg>`;
}

export function renderMaps(el, profile) {
  el.innerHTML = MAPS.map((m) => {
    const got = Math.max(0, Math.min(FRAGMENTS_PER_MAP, profile.fragments - m.index * FRAGMENTS_PER_MAP));
    const tiles = Array.from({ length: FRAGMENTS_PER_MAP }, (_, i) => `<i class="${i < got ? 'got' : ''}">${i < got ? '' : '?'}</i>`).join('');
    return `<div class="card map-card"><h4>${m.name}<small>${got}/${FRAGMENTS_PER_MAP}</small></h4>
      <div class="map-frame">${mapSVG(m)}<div class="map-fog">${tiles}</div></div></div>`;
  }).join('');
}

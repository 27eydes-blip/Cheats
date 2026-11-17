// Visual themes for the sky level (everything behind the UI: sky, clouds, islands, light, particles).
// Visual only: nothing here touches scoring, timing or gameplay.
//
// THE ONE SETTING: change ACTIVE_THEME to switch the game's look.
// While comparing, you can also override it live: ?theme=night (or #theme-night), or press T in the game.
export const ACTIVE_THEME = 'classic';

// Altitude is measured in points (0-700). Values written as [[points, value], ...] are interpolated between stops.
// sky: [top, mid, bottom] gradient colours at each altitude stop.
// clouds.layers: far/mid/near tiles; speed in px per second (parallax: far slowest), opacity, scale.
// particles / debris: cheap tiled layers; kind names map to generators in js/sky.js.
export const THEMES = {
  classic: {
    name: 'Original',
    mood: 'The current look: bright pastel day climbing into a starry night.',
    cost: 'light',
    swatches: ['#9fc4f0', '#ffe0ec', '#24447a', '#e8b84a'],
    sky: [
      [0, ['#9fc4f0', '#c9dcf7', '#ffe0ec']],
      [175, ['#8798d6', '#b4bde6', '#f0cfe6']],
      [350, ['#24447a', '#4a67a8', '#9b8bd3']],
      [525, ['#0f1640', '#24306a', '#5a4a98']],
      [700, ['#070a24', '#151d4a', '#43357d']],
    ],
    celestial: { kind: 'sun', alpha: [[0, 1], [300, 0]] },
    stars: [[0, 0], [260, 0], [520, 1]],
    aurora: { colors: ['#7dffcf', '#8fd3ff', '#c79bff'], alpha: [[0, 0], [280, 0], [400, 0.85], [600, 0.85], [700, 0.4]] },
    clouds: {
      style: 'puffy', top: '#ffffff', bottom: '#e6eaff',
      layers: { far: { speed: 10, opacity: 0.55, scale: 0.6 }, mid: { speed: 16, opacity: 0.8, scale: 1 }, near: { speed: 26, opacity: 0.9, scale: 1.4 } },
    },
    islands: {
      style: 'meadow', waterfall: false,
      layers: {
        meadows: ['#9be59b', '#5fbf7a', '#c79a6a', '#9c7448'],
        reefs: ['#b9a6f0', '#7f71c9', '#8a7aa8', '#655785'],
        aurora: ['#8ff0d2', '#43b39c', '#6a6f9e', '#4a4f7c'],
        harbor: ['#f6d98a', '#c79a3a', '#4b4f86', '#353863'],
      },
      shadow: 'rgba(60, 70, 140, .2)',
    },
    particles: { kind: 'none' },
    debris: { kind: 'none' },
    birds: false,
    lightning: null,
    glider: { outlineDark: '#26305c', outlineLight: '#fff8e6' },
    spark: '#e8b84a',
  },

  golden: {
    name: 'Golden Hour',
    mood: 'Warm and nostalgic: a long sunset that deepens into a rose-and-violet dusk as you climb.',
    cost: 'light',
    swatches: ['#ffb27e', '#ffd9a6', '#b0567c', '#5aa64e'],
    sky: [
      [0, ['#ffb27e', '#ffc99a', '#ffe3b0']],
      [175, ['#f2907c', '#f9ae8e', '#ffd09a']],
      [350, ['#a6567e', '#d97578', '#ffad84']],
      [525, ['#4b2f68', '#874677', '#df8169']],
      [700, ['#1f1840', '#47295c', '#a95462']],
    ],
    celestial: { kind: 'sunset', alpha: [[0, 1], [420, 0.75], [700, 0.25]] },
    stars: [[0, 0], [450, 0], [700, 0.7]],
    aurora: null,
    clouds: {
      style: 'puffy', top: '#fff2dc', bottom: '#f3a58e',
      layers: { far: { speed: 8, opacity: 0.5, scale: 0.7 }, mid: { speed: 13, opacity: 0.75, scale: 1.05 }, near: { speed: 21, opacity: 0.85, scale: 1.5 } },
    },
    islands: {
      style: 'meadow', waterfall: true, water: '#ffe3a8', longShadow: true,
      layers: {
        meadows: ['#9edb6a', '#5ea84c', '#d08a58', '#9b5d3a'],
        reefs: ['#b8d86a', '#78a04a', '#c7795c', '#8d4f42'],
        aurora: ['#d8c86a', '#a08a44', '#a8606a', '#71404e'],
        harbor: ['#f2c46a', '#b88838', '#6e4a6a', '#48304c'],
      },
      shadow: 'rgba(120, 50, 40, .25)',
    },
    particles: { kind: 'motes', color: '#fff0b8', opacity: 0.55, speed: 6 },
    debris: { kind: 'none' },
    birds: { color: '#5a2e3e' },
    lightning: null,
    glider: { outlineDark: '#3a2340', outlineLight: '#fff4dc' },
    spark: '#ffd36b',
  },

  crystal: {
    name: 'Crystal Skies',
    mood: 'Crisp and clean: icy teal air, faceted crystal islands, slow light rays and glinting shards.',
    cost: 'light',
    swatches: ['#bfe8f6', '#f1fbfb', '#2a8aa3', '#8fe3ff'],
    sky: [
      [0, ['#bfe8f6', '#d9f3f7', '#f1fbfb']],
      [175, ['#93d4e8', '#bbe9f0', '#e2f7f4']],
      [350, ['#52b2ca', '#8ad2de', '#cdeff0']],
      [525, ['#2a7f96', '#4fa8ba', '#a6dfe2']],
      [700, ['#0f4458', '#21728a', '#6cc2c9']],
    ],
    celestial: { kind: 'rays', alpha: [[0, 0.9], [525, 0.6], [700, 0.3]] },
    stars: [[0, 0], [500, 0], [700, 0.5]],
    aurora: null,
    clouds: {
      style: 'wisp', top: '#ffffff', bottom: '#d6f2f7',
      layers: { far: { speed: 7, opacity: 0.6, scale: 0.7 }, mid: { speed: 12, opacity: 0.75, scale: 1 }, near: { speed: 20, opacity: 0.8, scale: 1.3 } },
    },
    islands: {
      style: 'crystal', waterfall: false,
      layers: {
        meadows: ['#f4fdff', '#cdeef6', '#7fd0e4', '#3c95b3'],
        reefs: ['#f0fbff', '#c4e6f6', '#86b8ee', '#4a74c0'],
        aurora: ['#ecfffa', '#bff3e6', '#6fdcc4', '#2a9c8e'],
        harbor: ['#fffaf0', '#f3e6c4', '#b9a7f0', '#6a5ac0'],
      },
      shadow: 'rgba(20, 90, 120, .22)',
    },
    particles: { kind: 'glints', color: '#ffffff', opacity: 0.6, speed: 3 },
    debris: { kind: 'shards', color: '#9fe6f5', opacity: 0.45, speed: 5 },
    birds: false,
    lightning: null,
    glider: { outlineDark: '#12304a', outlineLight: '#f4fdff' },
    spark: '#8fe3ff',
  },

  storm: {
    name: 'Storm Drift',
    mood: 'Moody and dramatic: heavy violet-grey clouds, wind streaks, ruined islands and far-off lightning.',
    cost: 'medium (one extra lightning layer; off by default for reduced-motion users)',
    swatches: ['#7e7f9a', '#3e3860', '#141226', '#cfc6ff'],
    sky: [
      [0, ['#73748f', '#8f90a7', '#b9b7c4']],
      [175, ['#56537a', '#6f6b94', '#9f99b2']],
      [350, ['#3c365e', '#544d7c', '#857ba2']],
      [525, ['#25213f', '#38325e', '#665a8a']],
      [700, ['#141226', '#231f3f', '#4a3e6c']],
    ],
    celestial: { kind: 'none' },
    stars: [[0, 0], [600, 0], [700, 0.3]],
    aurora: null,
    clouds: {
      style: 'heavy', top: '#8e8aa6', bottom: '#4a4666',
      layers: { far: { speed: 14, opacity: 0.6, scale: 0.8 }, mid: { speed: 24, opacity: 0.7, scale: 1.1 }, near: { speed: 40, opacity: 0.75, scale: 1.5 } },
    },
    islands: {
      style: 'storm', waterfall: true, water: '#a8b4d6',
      layers: {
        meadows: ['#7f9a74', '#56704e', '#5e5a6e', '#3a3648'],
        reefs: ['#768c78', '#4e644e', '#55506a', '#34304a'],
        aurora: ['#6c7f80', '#465a5c', '#4a4564', '#2c2844'],
        harbor: ['#7d7896', '#56506e', '#3e3858', '#24203a'],
      },
      shadow: 'rgba(10, 8, 30, .35)',
    },
    particles: { kind: 'wind', color: '#e6e2ff', opacity: 0.35, speed: 90 },
    debris: { kind: 'rocks', color: '#3a3550', opacity: 0.6, speed: 10 },
    birds: false,
    // Distant and soft: at most a 12% brightening of the far sky, about once every 9-16 s. Toggle in the picker.
    lightning: { enabled: true, maxOpacity: 0.12, minGap: 9, maxGap: 16 },
    glider: { outlineDark: '#1b1830', outlineLight: '#fff4dc' },
    spark: '#cfc6ff',
  },

  pastel: {
    name: 'Dreamy Pastel',
    mood: 'Soft and cosy: pink, lavender and mint all the way up, round candy islands and gentle sparkles.',
    cost: 'light',
    swatches: ['#ffd6e8', '#e6d4ff', '#d4f7ea', '#ff9cc6'],
    sky: [
      [0, ['#ffd6e8', '#f1e0ff', '#d6faee']],
      [175, ['#efc8fb', '#f7d8f2', '#d2f4ea']],
      [350, ['#d3c2ff', '#ead0f6', '#cbf0e6']],
      [525, ['#bdb2f6', '#dcc6f2', '#c3ebe4']],
      [700, ['#a99fe8', '#cdb8ec', '#bde6e6']],
    ],
    celestial: { kind: 'sun', alpha: [[0, 0.9], [700, 0.5]] },
    stars: [[0, 0], [700, 0]],
    aurora: null,
    clouds: {
      style: 'bubble', top: '#ffffff', bottom: '#fbe3f2',
      layers: { far: { speed: 8, opacity: 0.6, scale: 0.65 }, mid: { speed: 12, opacity: 0.8, scale: 1 }, near: { speed: 19, opacity: 0.85, scale: 1.35 } },
    },
    islands: {
      style: 'pastel', waterfall: true, water: '#bfefff',
      layers: {
        meadows: ['#b8f2d4', '#86dcb4', '#ffc4dc', '#f39cc0'],
        reefs: ['#c6f0dc', '#94d8bc', '#e3c6ff', '#c19ef0'],
        aurora: ['#bdeef0', '#8ad6dc', '#ffd3b8', '#f0aa8a'],
        harbor: ['#fff0b8', '#f2d47e', '#cbc3ff', '#9f94ec'],
      },
      shadow: 'rgba(170, 110, 170, .2)',
    },
    particles: { kind: 'sparkles', color: '#ffffff', opacity: 0.6, speed: 4 },
    debris: { kind: 'bubbles', color: '#ffffff', opacity: 0.35, speed: 6 },
    birds: { color: '#8e5fa8' },
    lightning: null,
    glider: { outlineDark: '#4a2f63', outlineLight: '#ffffff' },
    spark: '#ff9cc6',
  },

  night: {
    name: 'Night Sky',
    mood: 'Calm and magical: deep blue night from the first island, a big moon, aurora ribbons and glowing gardens.',
    cost: 'light',
    swatches: ['#1b2a5c', '#050a24', '#f6eecb', '#7dffcf'],
    sky: [
      [0, ['#1c2b5e', '#29417c', '#3d5c98']],
      [175, ['#16245a', '#233a72', '#36528e']],
      [350, ['#101b48', '#1c2e62', '#2d467c']],
      [525, ['#0a1238', '#152150', '#243a6a']],
      [700, ['#050a24', '#0c1438', '#1a2a55']],
    ],
    celestial: { kind: 'moon', alpha: [[0, 1], [700, 1]] },
    stars: [[0, 0.65], [700, 1]],
    aurora: { colors: ['#7dffcf', '#8fd3ff', '#c79bff'], alpha: [[0, 0.25], [200, 0.5], [450, 0.8], [700, 0.8]] },
    clouds: {
      style: 'thin', top: '#5d72ad', bottom: '#22305e',
      layers: { far: { speed: 6, opacity: 0.5, scale: 0.7 }, mid: { speed: 10, opacity: 0.6, scale: 1 }, near: { speed: 16, opacity: 0.65, scale: 1.4 } },
    },
    islands: {
      style: 'night', waterfall: true, water: '#9fd8ff',
      layers: {
        meadows: ['#3f8a86', '#2a6164', '#4a5478', '#2e3656'],
        reefs: ['#4a7c9a', '#2f5878', '#46507a', '#2b3258'],
        aurora: ['#3f9a88', '#296a62', '#3e4672', '#262c50'],
        harbor: ['#6b6aa8', '#47467e', '#363a6a', '#20244a'],
      },
      shadow: 'rgba(0, 0, 10, .35)',
      glow: ['#7dffcf', '#9fe6ff', '#ffe08a'],
    },
    particles: { kind: 'fireflies', color: '#e8ff9a', opacity: 0.6, speed: 4 },
    debris: { kind: 'none' },
    birds: false,
    lightning: null,
    glider: { outlineDark: '#0c1438', outlineLight: '#fff4dc' },
    spark: '#ffe08a',
  },
};

export const THEME_ORDER = ['classic', 'golden', 'crystal', 'storm', 'pastel', 'night'];

// ---------- colour helpers (also used by the contrast tests) ----------
export function hexToRgb(c) { return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)); }
export function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
export function luminance(c) {
  const [r, g, b] = hexToRgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Interpolate [[alt, value]] stops: value may be a number or an array of hex colours.
export function at(stops, alt) {
  if (!stops || !stops.length) return 0;
  if (alt <= stops[0][0]) return stops[0][1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [a0, v0] = stops[i], [a1, v1] = stops[i + 1];
    if (alt <= a1) {
      const t = clamp01((alt - a0) / (a1 - a0));
      return Array.isArray(v0) ? v0.map((c, k) => mixHex(c, v1[k], t)) : v0 + (v1 - v0) * t;
    }
  }
  return stops[stops.length - 1][1];
}

export const INK = '#26305c';
export const INK_SOFT = '#55608f';
export const INK_LIGHT = '#f4f1ff';
export const DANGER = '#c2405a';

// How readable the foreground is against the sky at this altitude.
// - Text drawn straight on the sky (HUD altitude, results title) picks dark or light ink, whichever reads better,
//   and carries a soft halo in the other colour for the mid-brightness band where neither alone reaches 4.5:1.
// - The glider has a two-tone outline (dark line, light edge), so one of the two always stands out from the sky.
// - Frosted UI cards get more opaque over dark sky, so card text and the red "wrong answer" hint stay readable.
export function readability(theme, alt) {
  const colors = at(theme.sky, alt);
  const [top, mid, bottom] = colors;
  const worst = (ink) => Math.min(contrast(ink, top), contrast(ink, mid));
  const dark = worst(INK) >= worst(INK_LIGHT);
  const text = dark ? INK : INK_LIGHT;
  const g = theme.glider;
  const outlineContrast = Math.min(...[mid, bottom].map((bg) => Math.max(contrast(g.outlineDark, bg), contrast(g.outlineLight, bg))));
  const glass = cardAlpha(colors);
  const card = colors.map((c) => mixHex(c, '#ffffff', glass));
  const cardContrast = Math.min(...card.map((c) => Math.min(contrast(DANGER, c), contrast(INK_SOFT, c))));
  return { colors, night: !dark, text, halo: dark ? INK_LIGHT : INK, textContrast: worst(text), outlineContrast, glass, cardContrast };
}

// Smallest card opacity (from the design's .62) that keeps danger red and secondary text at 4.5:1 over this sky.
export function cardAlpha(colors) {
  for (let a = 0.62; a < 0.97; a += 0.02) {
    const ok = colors.every((c) => { const bg = mixHex(c, '#ffffff', a); return contrast(DANGER, bg) >= 4.5 && contrast(INK_SOFT, bg) >= 4.5; });
    if (ok) return +a.toFixed(2);
  }
  return 0.96;
}

export function resolveThemeId(id) {
  return THEMES[id] ? id : ACTIVE_THEME;
}

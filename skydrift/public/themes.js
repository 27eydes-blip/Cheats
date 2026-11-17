// Visual variations for the sky level. Visual only: nothing here touches scoring, timing or gameplay.
//
// THE ONE SETTING: change ACTIVE_THEME to switch the game's look.
// While comparing, override it live with ?theme=ember (or #theme-ember), or press T in the game.
export const ACTIVE_THEME = 'golden';

// All three share one art direction (mythic, painterly, one clear light source) and differ in palette,
// light, sky feature, island culture and atmosphere.
// sky: [[altitude, [zenith, mid, horizon]], ...]; colours are interpolated as you climb (0-700 points).
// light.side: 1 = light comes from the right, -1 = from the left. Every painted sprite is shaded for it.
export const THEMES = {
  golden: {
    name: 'Golden Ruins',
    mood: 'Late afternoon over a fallen empire: a huge low sun, sandstone and marble ruins, gold-lit clouds over violet shadow.',
    cost: 'normal',
    swatches: ['#2c2a5a', '#8a5a7a', '#f2b46a', '#d9b48a', '#ffe2a0'],
    sky: [
      [0, ['#2c2a5c', '#8b5b7c', '#f3b56b']],
      [175, ['#262558', '#7a4d79', '#e8a061']],
      [350, ['#1e1d4c', '#5e3d70', '#c97f5c']],
      [525, ['#15153e', '#3e2c60', '#9a5e5c']],
      [700, ['#0c0c2c', '#251d4a', '#5e3f5c']],
    ],
    light: { side: 1, color: '#ffe2a0', rim: '#ffd38a', shadow: '#2a1636' },
    celestial: { kind: 'sun', x: 0.8, y: 0.66, r: 70, core: '#fff3cf', color: '#ffd27a', glow: '#ff9f4a', alpha: [[0, 1], [700, 0.75]], sink: 0.22 },
    rays: { color: '#ffd89a', alpha: 0.2 },
    stars: [[0, 0], [380, 0], [700, 0.85]],
    haze: '#e3a06e',
    farTint: '#b88aa0',
    feature: 'megaisland',
    clouds: { lit: '#ffe4b4', mid: '#e3998a', shadow: '#5e4272', under: '#3a2c58' },
    rock: { light: '#dcb68a', mid: '#a97c5c', dark: '#5b3f48', crevice: '#2e2030' },
    top: { grass: '#a9b84c', grassDark: '#6c8638', moss: '#7f9c48', soil: '#7a5a3c' },
    stone: { light: '#f1e2c4', mid: '#cdb48e', dark: '#7d6650', trim: '#d9a441' },
    glow: '#ffd27a',
    details: ['columns', 'arch', 'stairs', 'tree', 'columns', 'statue', 'tree'],
    particles: [{ kind: 'mote', color: '#ffe6a8', count: 20 }, { kind: 'leaf', color: '#d29a44', count: 7 }],
    creatures: { flock: '#3a2440', giant: null },
    vignette: '#1a0c24',
    glider: { outlineDark: '#24152e', outlineLight: '#ffe9c2' },
  },

  twilight: {
    name: 'Twilight Mythic',
    mood: 'A hushed night of old magic: twin moons, slate islands carved with softly lit runes, lanterns, and a sky whale drifting far away.',
    cost: 'normal',
    swatches: ['#141433', '#3b2f6b', '#8f6fa6', '#efe6d2', '#ffcf7a'],
    sky: [
      [0, ['#151436', '#3c306d', '#9272a8']],
      [175, ['#11112e', '#33285f', '#7a5e98']],
      [350, ['#0d0c27', '#2a2154', '#64508a']],
      [525, ['#09081f', '#201945', '#4c3d74']],
      [700, ['#05040f', '#151034', '#352a5c']],
    ],
    light: { side: 1, color: '#e4defc', rim: '#d8d2ff', shadow: '#0c0a20' },
    celestial: { kind: 'moons', x: 0.8, y: 0.3, r: 54, core: '#f3ead6', color: '#e7dcc4', glow: '#a99be0', second: { dx: -0.34, dy: -0.06, r: 20, color: '#e9aca2' }, alpha: [[0, 1], [700, 1]], sink: 0 },
    rays: { color: '#cbc5ff', alpha: 0.1 },
    stars: [[0, 0.55], [700, 1]],
    haze: '#5c4f8a',
    farTint: '#4a4278',
    feature: 'whale',
    clouds: { lit: '#d4cdf2', mid: '#7468aa', shadow: '#2d2654', under: '#1b1639' },
    rock: { light: '#9395b6', mid: '#5b5b84', dark: '#2f2d4e', crevice: '#16142a' },
    top: { grass: '#557f6e', grassDark: '#2f5248', moss: '#5f8f72', soil: '#3a3550' },
    stone: { light: '#c9c6dc', mid: '#8e8bab', dark: '#46435f', trim: '#d9b46a' },
    glow: '#ffcf7a',
    details: ['stones', 'lantern', 'shrine', 'tree', 'stones', 'lantern', 'arch'],
    particles: [{ kind: 'spore', color: '#a8ecd6', count: 16 }, { kind: 'spore', color: '#ffd98a', count: 9 }],
    creatures: { flock: '#1c1838', giant: '#2c2756' },
    vignette: '#05040f',
    glider: { outlineDark: '#120f26', outlineLight: '#fff1d6' },
  },

  ember: {
    name: 'Ember Dusk',
    mood: 'The last red light after a storm: a giant ringed world on the horizon, basalt islands, iron chains, braziers and drifting embers.',
    cost: 'normal',
    swatches: ['#2a0f2e', '#8a2f4a', '#f0794a', '#e8a27a', '#ffb25c'],
    sky: [
      [0, ['#2b102f', '#8b304b', '#f17b4b']],
      [175, ['#240d2a', '#762a46', '#d9643f']],
      [350, ['#1d0a24', '#5c2240', '#b04a3a']],
      [525, ['#150719', '#3e1834', '#7a3434']],
      [700, ['#0c040f', '#261024', '#4a2030']],
    ],
    light: { side: 1, color: '#ffb27a', rim: '#ff9a5c', shadow: '#16060f' },
    celestial: { kind: 'planet', x: 0.28, y: 0.34, r: 96, core: '#f1b48a', color: '#d98466', glow: '#ff8a5c', alpha: [[0, 1], [700, 0.85]], sink: 0.12 },
    rays: { color: '#ff9f6a', alpha: 0.15 },
    stars: [[0, 0.12], [700, 0.75]],
    haze: '#b04a48',
    farTint: '#7a2f42',
    feature: 'spires',
    clouds: { lit: '#ffb684', mid: '#b4505c', shadow: '#40193b', under: '#26102a' },
    rock: { light: '#93605c', mid: '#4d3039', dark: '#27161f', crevice: '#12080e' },
    top: { grass: '#a0813e', grassDark: '#6a4c2a', moss: '#6a6a34', soil: '#3a2420' },
    stone: { light: '#8a7a80', mid: '#4a3f48', dark: '#221a22', trim: '#c9874a' },
    glow: '#ffb25c',
    details: ['pillar', 'brazier', 'chains', 'tree', 'pillar', 'bridge', 'brazier'],
    particles: [{ kind: 'ember', color: '#ffb25c', count: 18 }, { kind: 'ash', color: '#cdbab2', count: 10 }],
    creatures: { flock: '#2a0f22', giant: '#3a1430', winged: true },
    vignette: '#0c0308',
    glider: { outlineDark: '#1a0a14', outlineLight: '#ffe0c2' },
  },
};

export const THEME_ORDER = ['golden', 'twilight', 'ember'];

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

// UI palette (shared by all variations): parchment panels, iron-gall ink, aged brass.
export const INK = '#2b1d12';
export const INK_SOFT = '#5a4430';
export const INK_LIGHT = '#f6ecd6';
export const PARCHMENT = '#f2e4c4';
export const DANGER = '#a32a2a';

// How readable the foreground is at this altitude.
// - Text drawn straight on the sky picks dark or light ink, whichever reads better, and carries a halo
//   in the other colour.
// - The glider has a two-tone outline (dark line, light edge), so one of the two always stands out.
// - UI panels are opaque parchment, so their text and the red "wrong answer" hint never depend on the sky.
export function readability(theme, alt) {
  const colors = at(theme.sky, alt);
  const [top, mid, bottom] = colors;
  const worst = (ink) => Math.min(contrast(ink, top), contrast(ink, mid));
  const dark = worst(INK) >= worst(INK_LIGHT);
  const text = dark ? INK : INK_LIGHT;
  const outlineContrast = Math.min(...[mid, bottom].map((bg) => gliderContrast(theme, bg)));
  const cardContrast = Math.min(contrast(DANGER, PARCHMENT), contrast(INK_SOFT, PARCHMENT));
  return { colors, night: !dark, text, halo: dark ? INK_LIGHT : INK, textContrast: worst(text), outlineContrast, cardContrast };
}

export function gliderContrast(theme, bg) {
  const g = theme.glider;
  return Math.max(contrast(g.outlineDark, bg), contrast(g.outlineLight, bg));
}

export function resolveThemeId(id) {
  return THEMES[id] ? id : ACTIVE_THEME;
}

// Night palettes for the new tracks (track def `art`). They are painted with the city world's
// scenery and code paths (trackart.js), in their own colours, so each new track reads as its own
// place: SYNTH (Skyline Crossover) is a magenta and amber sunset skyline, AURORA (Starfall
// Speedway) a teal and violet sky-light glow. Same keys as trackart's THEMES / NIGHT entries.
export const ART_THEMES = {
  synth: {
    th: {
      bg: '#1a0c2a', ground: ['#1f1030', '#170a26', '#28133c'], speck: 'rgba(255,120,200,0.06)',
      wall: '#2e1640', wallTop: '#4e2766', wallLine: '#ff4fd8', shoulder: '#2a1540', shoulderSpeck: 'rgba(255,200,240,0.05)',
      road: '#22163a', roadSpeck: 'rgba(255,190,240,0.05)', line: 'rgba(255,176,74,0.55)', curbA: '#ff4fd8', curbB: '#ffe2f5',
      mini: '#2a1440', miniRoad: '#0e0618', sky: 'rgba(255,80,180,0.06)',
    },
    nt: { night: '#a688c8', line: '#ffb04a', edge: '#ff4fd8', curbA: '#ff4fd8', curbB: '#ffe2f5', wall: '#ff8a3c', pole: '#ff4fd8', pole2: '#ffb04a', puddles: 0.8 },
    groundSpecks: ['#3a1a52', '#12071e'],
  },
  aurora: {
    th: {
      bg: '#0a1826', ground: ['#0c1c2a', '#081522', '#112538'], speck: 'rgba(120,255,220,0.05)',
      wall: '#142a3c', wallTop: '#23445e', wallLine: '#5effc8', shoulder: '#13283a', shoulderSpeck: 'rgba(200,255,240,0.05)',
      road: '#141e32', roadSpeck: 'rgba(190,255,240,0.05)', line: 'rgba(94,255,200,0.5)', curbA: '#7a5cff', curbB: '#d8fff4',
      mini: '#12283a', miniRoad: '#060e18', sky: 'rgba(80,255,200,0.05)',
    },
    nt: { night: '#8ab0c8', line: '#5effc8', edge: '#3ff5ff', curbA: '#7a5cff', curbB: '#d8fff4', wall: '#5effc8', pole: '#7a5cff', pole2: '#3ff5ff', puddles: 0.7 },
    groundSpecks: ['#1c3a50', '#050c16'],
  },
};
const mul = (a, b) => '#' + [1, 3, 5].map((i) => Math.round((parseInt(a.slice(i, i + 2), 16) * parseInt(b.slice(i, i + 2), 16)) / 255).toString(16).padStart(2, '0')).join('');
for (const k in ART_THEMES) ART_THEMES[k].th.bg = mul(ART_THEMES[k].th.bg, ART_THEMES[k].nt.night); // (as trackart does for THEMES)
// the palette for a built track, or null (the classic tracks use their world's)
export const artTheme = (T) => (T && T.def && ART_THEMES[T.def.art]) || null;

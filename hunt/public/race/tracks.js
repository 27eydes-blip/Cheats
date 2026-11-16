// Hunt Racers tracks and battle arenas (data). All layouts are original.
// Track def:
//   main: closed loop {pts: [[x, y, halfWidth?]...], hw, sh (shoulder px), surf, shoulder}
//   shortcuts: open paths that leave and rejoin the main road (first/last point on the main road)
//   zones: {c: corridor (0 = main, 1.. = shortcuts), s0, s1 (fraction of that corridor's length),
//           d0, d1 (px across, + = right of the driving direction; omit = full width),
//           kind: 'surf' (with surf) | 'pad' | 'ramp' (pow scales air time)}
//   circles: world-space round zones {x, y, r, kind, surf}; obstacles: solid pillars {x, y, r}
//   hazards: timed dangers {kind, x, y | c, s, d, r, period, on, phase}: active `on` s every `period`
//   checkpoints: fractions of the main loop (first = 0 = start/finish line)
//   boxes: item box rows {c, s (fraction), n}
// Arena def: {arena: true, w, h, obstacles, circles, hazards, boxes: [{x, y}], spawns?}
import { buildTrack } from './trackgeom.js';

export const TRACK_DEFS = {
  desert: {
    key: 'desert', name: 'Desert Mirage Canyon', world: 'desert', laps: 3,
    main: {
      hw: 165, sh: 70, surf: 'road', shoulder: 'sand',
      pts: [[900, 700], [2000, 640], [3100, 690], [3950, 860], [4550, 1350], [4700, 2050], [4350, 2650], [3700, 2800],
        [3300, 2480], [2950, 2120], [2500, 2000], [2100, 2250], [1950, 2700], [2150, 3150], [1800, 3650], [1100, 3700],
        [580, 3250], [430, 2300], [530, 1350]],
    },
    shortcuts: [
      { name: 'Canyon Cut', hw: 82, sh: 26, surf: 'sand', shoulder: 'sand', pts: [[3720, 2795], [3250, 3180], [2650, 3290], [2170, 3150]] },
    ],
    zones: [
      { c: 0, s0: 0.105, s1: 0.112, kind: 'pad', d0: -60, d1: 60 },
      { c: 0, s0: 0.17, s1: 0.176, kind: 'ramp' },
      { c: 0, s0: 0.43, s1: 0.437, kind: 'pad', d0: -150, d1: -30 },
      { c: 0, s0: 0.70, s1: 0.707, kind: 'pad', d0: 30, d1: 150 },
      { c: 0, s0: 0.30, s1: 0.33, kind: 'surf', surf: 'sand', d0: 40, d1: 170 },
      { c: 0, s0: 0.78, s1: 0.81, kind: 'surf', surf: 'sand', d0: -170, d1: -40 },
      { c: 1, s0: 0.45, s1: 0.5, kind: 'pad' },
    ],
    obstacles: [],
    hazards: [],
    checkpoints: [0, 0.14, 0.27, 0.36, 0.7, 0.8, 0.9],
    boxes: [{ s: 0.06, n: 4 }, { s: 0.34, n: 4 }, { s: 0.66, n: 4 }, { c: 1, s: 0.3, n: 1 }],
  },
  frozen: {
    key: 'frozen', name: 'Frozen Lake Circuit', world: 'frozen', laps: 3,
    main: {
      hw: 170, sh: 70, surf: 'road', shoulder: 'snow',
      pts: [[900, 850], [2000, 680], [3200, 680], [4450, 720], [5250, 1150], [5200, 2150], [4700, 2950], [3900, 3350],
        [3250, 3050], [2650, 3400], [1900, 3420], [1150, 3150], [650, 2550], [520, 1650]],
    },
    shortcuts: [
      { name: 'Thin Ice', hw: 95, sh: 20, surf: 'ice', shoulder: 'ice', pts: [[3500, 690], [4000, 1250], [4500, 1800], [5140, 2120]] },
    ],
    zones: [
      { c: 0, s0: 0.53, s1: 0.62, kind: 'surf', surf: 'ice' },
      { c: 0, s0: 0.86, s1: 0.9, kind: 'surf', surf: 'ice', d0: -170, d1: 0 },
      { c: 0, s0: 0.08, s1: 0.087, kind: 'pad', d0: 20, d1: 140 },
      { c: 0, s0: 0.47, s1: 0.477, kind: 'pad', d0: -60, d1: 60 },
      { c: 0, s0: 0.70, s1: 0.706, kind: 'ramp' },
    ],
    obstacles: [{ x: 2600, y: 690, r: 46 }],
    hazards: [],
    checkpoints: [0, 0.12, 0.45, 0.58, 0.7, 0.84],
    boxes: [{ s: 0.05, n: 4 }, { s: 0.4, n: 4 }, { s: 0.75, n: 4 }, { c: 1, s: 0.5, n: 1 }],
  },
  ashlands: {
    key: 'ashlands', name: 'Ashlands Inferno', world: 'ashlands', laps: 3,
    main: {
      hw: 160, sh: 60, surf: 'road', shoulder: 'offroad',
      pts: [[1500, 1080], [2300, 1060], [3200, 1120], [3900, 1550], [3850, 2200], [3150, 2450], [2500, 2300], [1900, 2600],
        [2050, 3200], [2900, 3450], [3900, 3420], [4700, 3520], [5150, 2900], [5200, 1700], [4950, 700], [4200, 300],
        [3000, 200], [1700, 250], [700, 350], [300, 720], [650, 1090]],
    },
    shortcuts: [
      { name: 'Lava Leap', needsBoost: true, hw: 105, sh: 20, surf: 'road', shoulder: 'lava', pts: [[4250, 3460], [4550, 3050], [4850, 2650], [5160, 2350]] },
    ],
    zones: [
      { c: 0, s0: 0.2, s1: 0.27, kind: 'surf', surf: 'lava', d0: 120, d1: 999 },
      { c: 0, s0: 0.36, s1: 0.4, kind: 'surf', surf: 'lava', d0: -40, d1: 40 },
      { c: 0, s0: 0.55, s1: 0.62, kind: 'surf', surf: 'lava', d0: -999, d1: -120 },
      { c: 0, s0: 0.1, s1: 0.106, kind: 'pad', d0: -50, d1: 50 },
      { c: 0, s0: 0.165, s1: 0.171, kind: 'pad', d0: -60, d1: 60 },
      { c: 0, s0: 0.5, s1: 0.506, kind: 'pad', d0: -140, d1: -20 },
      { c: 0, s0: 0.82, s1: 0.826, kind: 'ramp' },
      { c: 1, s0: 0.2, s1: 0.23, kind: 'ramp' },
      { c: 1, s0: 0.25, s1: 0.75, kind: 'surf', surf: 'pit' },
    ],
    obstacles: [],
    hazards: [
      { kind: 'geyser', s: 0.425, d: -70, r: 75, period: 5, on: 1.3, phase: 0 },
      { kind: 'geyser', s: 0.86, d: 70, r: 75, period: 5, on: 1.3, phase: 2.5 },
      { kind: 'geyser', s: 0.63, d: 75, r: 70, period: 6, on: 1.4, phase: 1 },
    ],
    checkpoints: [0, 0.12, 0.24, 0.36, 0.6, 0.7, 0.8, 0.9],
    boxes: [{ s: 0.05, n: 4 }, { s: 0.33, n: 4 }, { s: 0.58, n: 4 }, { s: 0.8, n: 4 }],
  },
  neon: {
    key: 'neon', name: 'Neon City Night', world: 'city', laps: 3,
    main: {
      hw: 140, sh: 45, surf: 'road', shoulder: 'offroad',
      pts: [[800, 650], [1800, 650], [2550, 660], [2760, 820], [2780, 1450], [2950, 1680], [3700, 1700], [4350, 1720],
        [4560, 1950], [4560, 2850], [4350, 3150], [3950, 3180], [3850, 3500], [3600, 3820], [3200, 3870], [2900, 3650],
        [2750, 3330], [2500, 3130], [2330, 2950], [2310, 2550], [2100, 2330],
        [1100, 2320], [820, 2120], [640, 1700], [620, 900]],
    },
    shortcuts: [
      { name: 'Back Alley', hw: 72, sh: 18, surf: 'road', shoulder: 'offroad', pts: [[3990, 3175], [3500, 3230], [3000, 3230], [2620, 3190]] },
    ],
    zones: [
      { c: 0, s0: 0.09, s1: 0.096, kind: 'pad', d0: -40, d1: 60 },
      { c: 0, s0: 0.3, s1: 0.306, kind: 'pad', d0: -60, d1: 60 },
      { c: 0, s0: 0.54, s1: 0.546, kind: 'ramp' },
      { c: 0, s0: 0.62, s1: 0.626, kind: 'pad', d0: -60, d1: 60 },
      { c: 1, s0: 0.5, s1: 0.53, kind: 'pad' },
    ],
    obstacles: [{ x: 3700, y: 1700, r: 40 }, { x: 4560, y: 2400, r: 40 }],
    hazards: [
      { kind: 'arc', s: 0.06, d: -60, r: 65, period: 4, on: 1.2, phase: 0 },
      { kind: 'arc', s: 0.6, d: 60, r: 65, period: 4, on: 1.2, phase: 2 },
    ],
    checkpoints: [0, 0.12, 0.22, 0.33, 0.44, 0.72, 0.82, 0.92],
    boxes: [{ s: 0.05, n: 4 }, { s: 0.37, n: 4 }, { s: 0.68, n: 3 }, { c: 1, s: 0.3, n: 1 }],
  },
};

// Battle arenas, one per world. Closed boxes with pillars, pads and item boxes.
const ring = (cx, cy, r, n, a0 = 0) => Array.from({ length: n }, (_, i) => ({ x: Math.round(cx + Math.cos(a0 + (i / n) * 6.2832) * r), y: Math.round(cy + Math.sin(a0 + (i / n) * 6.2832) * r) }));
export const ARENA_DEFS = {
  desert: {
    key: 'desert_arena', name: 'Mirage Bowl', world: 'desert', arena: true, w: 2600, h: 2600, surf: 'road',
    obstacles: [{ x: 1300, y: 1300, r: 150 }, ...ring(1300, 1300, 720, 4, 0.785).map((p) => ({ ...p, r: 70 }))],
    circles: [{ x: 420, y: 420, r: 260, kind: 'surf', surf: 'sand' }, { x: 2180, y: 2180, r: 260, kind: 'surf', surf: 'sand' },
      ...ring(1300, 1300, 470, 4, 0).map((p) => ({ ...p, r: 46, kind: 'pad' }))],
    hazards: [],
    boxes: [...ring(1300, 1300, 1000, 8, 0.39)],
  },
  frozen: {
    key: 'frozen_arena', name: 'Icebreak Rink', world: 'frozen', arena: true, w: 2600, h: 2400, surf: 'road',
    obstacles: [...ring(1300, 1200, 520, 6, 0).map((p) => ({ ...p, r: 60 }))],
    circles: [{ x: 1300, y: 1200, r: 360, kind: 'surf', surf: 'ice' }, ...ring(1300, 1200, 900, 4, 0.785).map((p) => ({ ...p, r: 46, kind: 'pad' }))],
    hazards: [],
    boxes: [{ x: 1300, y: 1200 }, ...ring(1300, 1200, 760, 6, 0.52)],
  },
  ashlands: {
    key: 'ashlands_arena', name: 'Cinder Pit', world: 'ashlands', arena: true, w: 2600, h: 2600, surf: 'road',
    obstacles: [...ring(1300, 1300, 600, 4, 0).map((p) => ({ ...p, r: 90 }))],
    circles: [{ x: 1300, y: 1300, r: 200, kind: 'surf', surf: 'lava' }, ...ring(1300, 1300, 950, 4, 0.785).map((p) => ({ ...p, r: 46, kind: 'pad' }))],
    hazards: [...ring(1300, 1300, 860, 4, 0).map((p, i) => ({ kind: 'geyser', ...p, r: 80, period: 5, on: 1.3, phase: i * 1.25 }))],
    boxes: [...ring(1300, 1300, 420, 4, 0.785), ...ring(1300, 1300, 1080, 4, 0)],
  },
  neon: {
    key: 'neon_arena', name: 'Rooftop Grid', world: 'city', arena: true, w: 2800, h: 2200, surf: 'road',
    obstacles: [{ x: 900, y: 750, r: 110 }, { x: 1900, y: 750, r: 110 }, { x: 900, y: 1450, r: 110 }, { x: 1900, y: 1450, r: 110 }],
    circles: [...ring(1400, 1100, 330, 4, 0.785).map((p) => ({ ...p, r: 46, kind: 'pad' }))],
    hazards: [{ kind: 'arc', x: 1400, y: 1100, r: 110, period: 4, on: 1.2, phase: 0 }],
    boxes: [{ x: 1400, y: 400 }, { x: 1400, y: 1800 }, { x: 400, y: 1100 }, { x: 2400, y: 1100 }, { x: 1400, y: 760 }, { x: 1400, y: 1440 }],
  },
};

// The training track for the first-race tutorial (mode `tutorial` only; not in TRACK_IDS, so never
// in the track picker or a random pick): a cone slalom on the first straight, one long drift curve,
// a row of item boxes and a parked target car on the back straight. `tut` marks the sections
// (main-loop fractions) the server's step checks use; cones are small pillars flagged `cone`.
const TUT_CONES = [1000, 1220, 1440, 1660, 1880].map((x, i) => ({ x, y: i % 2 ? 665 : 535, r: 18, cone: 1 }));
export const TUTORIAL_DEF = {
  key: 'tutorial', name: 'Training Track', world: 'desert', laps: 1,
  main: {
    hw: 175, sh: 60, surf: 'road', shoulder: 'sand',
    pts: [[400, 600], [900, 600], [1400, 600], [1900, 600], [2400, 600], [2900, 700], [3150, 1050], [2950, 1450],
      [2450, 1580], [1900, 1600], [1300, 1600], [800, 1580], [380, 1400], [230, 1000]],
  },
  zones: [],
  obstacles: TUT_CONES,
  hazards: [],
  checkpoints: [0, 0.25, 0.5, 0.75],
  boxes: [{ s: 0.6, n: 4 }],
  tut: { cones: [900, 1990], drift: [2400, 2450], dummy: 0.72 }, // cones: x span on the first straight; drift: x where the curve starts / ends
};
export const TRACK_IDS = Object.keys(TRACK_DEFS);
const cache = new Map();
const defOf = (key, arena) => (arena ? ARENA_DEFS[key] : key === 'tutorial' ? TUTORIAL_DEF : TRACK_DEFS[key]);
// built (runtime) track for a track key ('tutorial' = the training track); arena = true gives that world's battle arena
export function getTrack(key, arena = false) {
  const k = (arena ? 'A:' : 'T:') + key;
  if (!cache.has(k)) {
    const def = defOf(key, arena);
    if (!def) return null;
    cache.set(k, buildTrack(def));
  }
  return cache.get(k);
}
export const trackName = (key, arena = false) => defOf(key, arena)?.name || null;

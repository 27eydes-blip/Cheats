// Hunt Racers tracks and battle arenas (data). All layouts are original.
// (6 tracks; 4 arenas, one per world: the new tracks use their world's arena)
// Track def:
//   main: closed loop {pts: [[x, y, halfWidth?]...], hw, sh (shoulder px), surf, shoulder}
//   shortcuts: open paths that leave and rejoin the main road (first/last point on the main road)
//   zones: {c: corridor (0 = main, 1.. = shortcuts), s0, s1 (fraction of that corridor's length),
//           d0, d1 (px across, + = right of the driving direction; omit = full width),
//           kind: 'surf' (with surf) | 'pad' | 'ramp' (pow scales air time)}
//           kind 'paint' (with surf) = a themed patch drawn on the road that drives like road
//   look: a corridor drawn as another surface (paint only: it drives as its `surf`)
//   circles: world-space round zones {x, y, r, kind, surf}; obstacles: solid pillars {x, y, r}
//   hazards: timed dangers {kind, x, y | c, s, d, r, period, on, phase}: active `on` s every `period`
// The tracks and their arenas are CLEAR: no obstacles, no hazards, no hazard surfaces on the road
// (lava, pits, ice, sand), roads at least MIN_HW wide; only racers and dropped weapon items are hit.
// trackcheck.js enforces it. (The engine keeps obstacles for the tutorial's cones.)
//   cross: [[x, y]] points where the main loop crosses itself (a figure-8; trackcheck checks them)
//   checkpoints: fractions of the main loop (first = 0 = start/finish line)
//   boxes: item box rows {c, s (fraction), n}
// Arena def: {arena: true, w, h, obstacles, circles, hazards, boxes: [{x, y}], spawns?}
import { buildTrack } from './trackgeom.js';

export const TRACK_DEFS = {
  desert: {
    key: 'desert', name: 'Desert Mirage Canyon', world: 'desert', laps: 3,
    main: {
      hw: 180, sh: 70, surf: 'road', shoulder: 'sand',
      pts: [[900, 700], [2000, 640], [3100, 690], [3950, 860], [4550, 1350], [4700, 2050], [4350, 2650], [3700, 2800],
        [3300, 2480], [2950, 2120], [2500, 2000], [2100, 2250], [1950, 2700], [2150, 3150], [1800, 3650], [1100, 3700],
        [580, 3250], [430, 2300], [530, 1350]],
    },
    shortcuts: [
      { name: 'Canyon Cut', hw: 112, sh: 26, surf: 'road', look: 'sand', shoulder: 'sand', pts: [[3720, 2795], [3250, 3180], [2650, 3290], [2170, 3150]] },
    ],
    zones: [
      { c: 0, s0: 0.105, s1: 0.112, kind: 'pad', d0: -60, d1: 60 },
      { c: 0, s0: 0.17, s1: 0.176, kind: 'ramp' },
      { c: 0, s0: 0.43, s1: 0.437, kind: 'pad', d0: -150, d1: -30 },
      { c: 0, s0: 0.70, s1: 0.707, kind: 'pad', d0: 30, d1: 150 },
      { c: 0, s0: 0.30, s1: 0.33, kind: 'paint', surf: 'sand', d0: 40, d1: 180 },
      { c: 0, s0: 0.78, s1: 0.81, kind: 'paint', surf: 'sand', d0: -180, d1: -40 },
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
      hw: 185, sh: 70, surf: 'road', shoulder: 'snow',
      pts: [[900, 850], [2000, 680], [3200, 680], [4450, 720], [5250, 1150], [5200, 2150], [4700, 2950], [3900, 3350],
        [3250, 3050], [2650, 3400], [1900, 3420], [1150, 3150], [650, 2550], [520, 1650]],
    },
    shortcuts: [
      { name: 'Thin Ice', hw: 115, sh: 20, surf: 'road', look: 'ice', shoulder: 'snow', pts: [[3500, 690], [3900, 1350], [4500, 1820], [5140, 2120]] },
    ],
    zones: [
      { c: 0, s0: 0.53, s1: 0.62, kind: 'paint', surf: 'ice' },
      { c: 0, s0: 0.86, s1: 0.9, kind: 'paint', surf: 'ice', d0: -185, d1: 0 },
      { c: 0, s0: 0.08, s1: 0.087, kind: 'pad', d0: 20, d1: 140 },
      { c: 0, s0: 0.47, s1: 0.477, kind: 'pad', d0: -60, d1: 60 },
      { c: 0, s0: 0.70, s1: 0.706, kind: 'ramp' },
    ],
    obstacles: [],
    hazards: [],
    checkpoints: [0, 0.12, 0.45, 0.58, 0.7, 0.84],
    boxes: [{ s: 0.05, n: 4 }, { s: 0.4, n: 4 }, { s: 0.75, n: 4 }, { c: 1, s: 0.5, n: 1 }],
  },
  ashlands: {
    key: 'ashlands', name: 'Ashlands Inferno', world: 'ashlands', laps: 3,
    main: {
      hw: 180, sh: 60, surf: 'road', shoulder: 'offroad',
      pts: [[1500, 1080], [2300, 1060], [3200, 1120], [3900, 1550], [3850, 2200], [3150, 2450], [2500, 2300], [1900, 2600],
        [2050, 3200], [2900, 3450], [3900, 3420], [4700, 3520], [5150, 2900], [5200, 1700], [4950, 700], [4200, 300],
        [3000, 200], [1700, 250], [700, 350], [300, 720], [650, 1090]],
    },
    shortcuts: [
      { name: 'Lava Leap', hw: 115, sh: 20, surf: 'road', shoulder: 'offroad', pts: [[4250, 3460], [4540, 3040], [4800, 2640], [5160, 2350]] },
    ],
    zones: [
      { c: 0, s0: 0.1, s1: 0.106, kind: 'pad', d0: -50, d1: 50 },
      { c: 0, s0: 0.165, s1: 0.171, kind: 'pad', d0: -60, d1: 60 },
      { c: 0, s0: 0.5, s1: 0.506, kind: 'pad', d0: -140, d1: -20 },
      { c: 0, s0: 0.82, s1: 0.826, kind: 'ramp' },
      { c: 1, s0: 0.2, s1: 0.23, kind: 'ramp' },
    ],
    obstacles: [],
    hazards: [],
    checkpoints: [0, 0.12, 0.24, 0.36, 0.6, 0.7, 0.8, 0.9],
    boxes: [{ s: 0.05, n: 4 }, { s: 0.33, n: 4 }, { s: 0.58, n: 4 }, { s: 0.8, n: 4 }],
  },
  neon: {
    key: 'neon', name: 'Neon City Night', world: 'city', laps: 3,
    main: {
      hw: 170, sh: 45, surf: 'road', shoulder: 'offroad',
      pts: [[800, 650], [1800, 650], [2550, 660], [2760, 820], [2780, 1450], [2950, 1680], [3700, 1700], [4350, 1720],
        [4560, 1950], [4560, 2850], [4350, 3150], [3950, 3180], [3850, 3500], [3600, 3820], [3200, 3870], [2900, 3650],
        [2750, 3330], [2500, 3130], [2330, 2950], [2310, 2550], [2100, 2330],
        [1100, 2320], [820, 2120], [640, 1700], [620, 900]],
    },
    shortcuts: [
      { name: 'Back Alley', hw: 110, sh: 18, surf: 'road', shoulder: 'offroad', pts: [[3990, 3175], [3500, 3200], [3000, 3195], [2620, 3190]] },
    ],
    zones: [
      { c: 0, s0: 0.09, s1: 0.096, kind: 'pad', d0: -40, d1: 60 },
      { c: 0, s0: 0.3, s1: 0.306, kind: 'pad', d0: -60, d1: 60 },
      { c: 0, s0: 0.54, s1: 0.546, kind: 'ramp' },
      { c: 0, s0: 0.62, s1: 0.626, kind: 'pad', d0: -60, d1: 60 },
      { c: 1, s0: 0.5, s1: 0.53, kind: 'pad' },
    ],
    obstacles: [],
    hazards: [],
    checkpoints: [0, 0.12, 0.22, 0.33, 0.44, 0.72, 0.82, 0.92],
    boxes: [{ s: 0.05, n: 4 }, { s: 0.37, n: 4 }, { s: 0.68, n: 3 }, { c: 1, s: 0.3, n: 1 }],
  },  // OBLIVION GP new tracks (neon night). `art`: the night palette trackart paints them in (on the
  // city world's scenery); `arenaOf`: the world arena Battle uses when this track is picked.
  // SKYLINE CROSSOVER: a figure-8. The loop crosses itself at one X: the first pass is flat (watch
  // the cross traffic), the second jumps clean over it off a big ramp. Sky Drop cuts the right lobe.
  // STARFALL SPEEDWAY: one huge sweeping loop round the city's core, a jump off the start, and the
  // twisting Comet Jump shortcut across the inside of the loop.
  skyline: {
    key: 'skyline', name: 'Skyline Crossover', world: 'city', art: 'synth', arenaOf: 'neon', laps: 3,
    cross: [[3500, 2100]], // the figure-8's X (see trackcheck crossErrors)
    main: {
      hw: 185, sh: 55, surf: 'road', shoulder: 'offroad',
      pts: [[5220, 982], [5822, 1197], [6123, 1756], [6123, 2444], [5822, 3003], [5220, 3218], [4575, 3089], [4059, 2659], [3500, 2100], [2941, 1541], [2425, 1111], [1780, 982], [1178, 1197], [877, 1756], [877, 2444], [1178, 3003], [1780, 3218], [2425, 3089], [2941, 2659], [3500, 2100], [4059, 1541], [4575, 1111]],
    },
    shortcuts: [
      { name: 'Sky Drop', hw: 115, sh: 22, surf: 'road', shoulder: 'offroad', pts: [[5480, 1040], [5560, 1600], [5560, 2600], [5400, 3170]] },
    ],
    zones: [
      { c: 0, s0: 0.235, s1: 0.241, kind: 'pad', d0: -60, d1: 60 },
      { c: 0, s0: 0.478, s1: 0.484, kind: 'pad', d0: -150, d1: -30 },
      { c: 0, s0: 0.725, s1: 0.731, kind: 'pad', d0: 30, d1: 150 },
      { c: 0, s0: 0.814, s1: 0.82, kind: 'ramp', pow: 1.8 },
      { c: 0, s0: 0.6, s1: 0.606, kind: 'ramp' },
      { c: 1, s0: 0.3, s1: 0.33, kind: 'pad' },
      { c: 1, s0: 0.55, s1: 0.56, kind: 'ramp' },
    ],
    obstacles: [],
    hazards: [],
    checkpoints: [0, 0.25, 0.44, 0.56, 0.68, 0.78, 0.94],
    boxes: [{ s: 0.1, n: 4 }, { s: 0.5, n: 4 }, { s: 0.66, n: 4 }, { s: 0.94, n: 4 }, { c: 1, s: 0.42, n: 1 }],
  },
  starfall: {
    key: 'starfall', name: 'Starfall Speedway', world: 'city', art: 'aurora', arenaOf: 'neon', laps: 3,
    main: {
      hw: 190, sh: 55, surf: 'road', shoulder: 'offroad',
      pts: [[1800, 3450], [2900, 3450], [4000, 3420], [4900, 3200, 245], [5500, 2600, 235], [5650, 1800], [5400, 1050], [4750, 560], [3900, 420], [3100, 620], [2650, 1150, 215], [2150, 1450, 225], [1450, 1250, 215], [850, 800, 225], [380, 1050, 215], [300, 1750], [700, 2250, 215], [1250, 2400, 215], [1450, 2850, 215], [1150, 3250]],
    },
    shortcuts: [
      { name: 'Comet Jump', hw: 115, sh: 22, surf: 'road', shoulder: 'offroad', pts: [[4250, 3290], [4000, 2900], [3700, 2550], [3350, 2100], [3750, 1650], [3450, 1320], [2640, 1170]] },
    ],
    zones: [
      { c: 0, s0: 0.1, s1: 0.106, kind: 'pad', d0: -60, d1: 60 },
      { c: 0, s0: 0.04, s1: 0.046, kind: 'ramp' },
      { c: 0, s0: 0.3, s1: 0.306, kind: 'pad', d0: -160, d1: -40 },
      { c: 0, s0: 0.45, s1: 0.456, kind: 'pad', d0: -60, d1: 60 },
      { c: 0, s0: 0.64, s1: 0.646, kind: 'ramp' },
      { c: 0, s0: 0.78, s1: 0.786, kind: 'pad', d0: 30, d1: 150 },
      { c: 1, s0: 0.12, s1: 0.15, kind: 'pad' },
      { c: 1, s0: 0.2, s1: 0.21, kind: 'ramp' },
    ],
    obstacles: [],
    hazards: [],
    checkpoints: [0, 0.12, 0.62, 0.7, 0.78, 0.86, 0.93],
    boxes: [{ s: 0.06, n: 4 }, { s: 0.36, n: 4 }, { s: 0.6, n: 4 }, { s: 0.84, n: 4 }, { c: 1, s: 0.5, n: 1 }],
  },
};

// Battle arenas, one per world. Open floors (no pillars, no hazards) with pads, item boxes and
// themed paint.
const ring = (cx, cy, r, n, a0 = 0) => Array.from({ length: n }, (_, i) => ({ x: Math.round(cx + Math.cos(a0 + (i / n) * 6.2832) * r), y: Math.round(cy + Math.sin(a0 + (i / n) * 6.2832) * r) }));
export const ARENA_DEFS = {
  desert: {
    key: 'desert_arena', name: 'Mirage Bowl', world: 'desert', arena: true, w: 2600, h: 2600, surf: 'road',
    obstacles: [],
    circles: [{ x: 420, y: 420, r: 260, kind: 'paint', surf: 'sand' }, { x: 2180, y: 2180, r: 260, kind: 'paint', surf: 'sand' },
      ...ring(1300, 1300, 470, 4, 0).map((p) => ({ ...p, r: 46, kind: 'pad' }))],
    hazards: [],
    boxes: [...ring(1300, 1300, 1000, 8, 0.39)],
  },
  frozen: {
    key: 'frozen_arena', name: 'Icebreak Rink', world: 'frozen', arena: true, w: 2600, h: 2400, surf: 'road',
    obstacles: [],
    circles: [{ x: 1300, y: 1200, r: 360, kind: 'paint', surf: 'ice' }, ...ring(1300, 1200, 900, 4, 0.785).map((p) => ({ ...p, r: 46, kind: 'pad' }))],
    hazards: [],
    boxes: [{ x: 1300, y: 1200 }, ...ring(1300, 1200, 760, 6, 0.52)],
  },
  ashlands: {
    key: 'ashlands_arena', name: 'Cinder Pit', world: 'ashlands', arena: true, w: 2600, h: 2600, surf: 'road',
    obstacles: [],
    circles: [...ring(1300, 1300, 950, 4, 0.785).map((p) => ({ ...p, r: 46, kind: 'pad' }))],
    hazards: [],
    boxes: [...ring(1300, 1300, 420, 4, 0.785), ...ring(1300, 1300, 1080, 4, 0)],
  },
  neon: {
    key: 'neon_arena', name: 'Rooftop Grid', world: 'city', arena: true, w: 2800, h: 2200, surf: 'road',
    obstacles: [],
    circles: [...ring(1400, 1100, 330, 4, 0.785).map((p) => ({ ...p, r: 46, kind: 'pad' }))],
    hazards: [],
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
// the four tracks the game launched with (goals written for "all 4 tracks" keep counting these)
export const CLASSIC_TRACK_IDS = ['desert', 'frozen', 'ashlands', 'neon'];
export const ARENA_IDS = Object.keys(ARENA_DEFS);
// a track key -> the key of its world's battle arena (new tracks borrow their world's arena)
export const arenaKey = (key) => (ARENA_DEFS[key] ? key : TRACK_DEFS[key]?.arenaOf && ARENA_DEFS[TRACK_DEFS[key].arenaOf] ? TRACK_DEFS[key].arenaOf : null);
const cache = new Map();
const defOf = (key, arena) => (arena ? ARENA_DEFS[arenaKey(key)] : key === 'tutorial' ? TUTORIAL_DEF : TRACK_DEFS[key]);
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

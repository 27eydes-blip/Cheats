import type { Section, TrackDef, Zone } from './types';

const s = (len: number, curve = 0, hill = 0, zone: Zone = 'city', extra: Partial<Section> = {}): Section => ({ len, curve, hill, zone, ...extra });
const rails = { rails: true };

export const TRACKS: TrackDef[] = [
  {
    id: 'depot', name: 'Michigan Central Depot', chapterTitle: 'The Depot Dash', city: 'detroit', skyline: 'detroit', laps: 3, seed: 1915,
    blurb: 'Out of the shadow of the grandest station in the world, under the railway, and down Michigan Avenue.',
    sections: [
      s(60, 0, 0, 'plaza', { feature: 'stands' }), s(50, 0, 0, 'plaza', { feature: 'depot' }), s(40, 1.5, 0, 'plaza'),
      s(60, 0, 1200, 'city', rails), s(50, -2.5, 0, 'city', rails), s(40, 0, -1200, 'city', rails),
      s(36, 0, 0, 'city', { feature: 'trestle' }), s(70, 3, 0, 'city'), s(50, 0, 2000, 'city'), s(40, -1.5, 0, 'city'),
      s(60, 0, -2000, 'tunnel'), s(30, 0, 0, 'city'), s(70, -3.5, 0, 'city'), s(60, 0, 0, 'city', rails),
      s(50, 2, 1500, 'city', rails), s(60, 2.5, -1500, 'city', rails), s(80, 0, 0, 'city', rails), s(60, -2, 0, 'plaza'), s(40, 0, 0, 'plaza'),
    ],
  },
  {
    id: 'woodward', name: 'Woodward Avenue', chapterTitle: 'Woodward Avenue', city: 'detroit', skyline: 'detroit', laps: 3, seed: 1701,
    blurb: 'The spine of the Motor City. Trolleys, delivery wagons, and every newsboy in town.',
    sections: [
      s(80, 0, 0, 'city', { ...rails, feature: 'stands' }), s(60, 1, 800, 'city', rails), s(80, 0, -800, 'city', rails), s(60, -2.2, 0, 'city', rails),
      s(100, 0, 1800, 'city', rails), s(60, 3.2, 0, 'city'), s(50, 0, -1800, 'city'), s(80, -1.2, 0, 'city', rails),
      s(40, 0, 2600, 'city', rails), s(40, 0, -2600, 'city', rails), s(70, 2.6, 0, 'city'), s(70, -2.6, 0, 'city'),
      s(100, 0, 0, 'city', rails), s(60, 1.8, 1000, 'city', rails), s(60, 0, -1000, 'city', rails), s(50, -3, 0, 'city'), s(60, 0, 0, 'city', rails),
    ],
  },
  {
    id: 'belleisle', name: 'Belle Isle', chapterTitle: 'Belle Isle Park', city: 'detroit', skyline: 'river', laps: 3, seed: 1883,
    blurb: 'Across the river bridge to the island park: elms, fountains, parasols and a riverfront sweep.',
    sections: [
      s(60, 0, 0, 'city', { feature: 'stands' }), s(40, 1.2, 0, 'city'), s(90, 0, 600, 'bridge', { feature: 'trestle' }), s(30, 0, -600, 'bridge'),
      s(70, -2, 0, 'park'), s(60, 2.8, 0, 'park', { feature: 'fountain' }), s(90, 0, 0, 'river'), s(70, -1.5, 900, 'river'),
      s(60, -3.2, -900, 'park'), s(60, 3.4, 0, 'park'), s(100, 1, 0, 'river'), s(60, -2, 0, 'park', { feature: 'fountain' }),
      s(60, 0, 0, 'park'), s(80, 0, 0, 'bridge'), s(50, -1.2, 0, 'city'),
    ],
  },
  {
    id: 'grandblvd', name: 'Grand Boulevard', chapterTitle: 'The Grand Boulevard', city: 'detroit', skyline: 'detroit', laps: 3, seed: 1891,
    blurb: 'A rolling crescent around the young city: mansions, motor showrooms and the Michigan Central line.',
    sections: [
      s(70, 0, 0, 'city', { feature: 'stands' }), s(70, 1.6, 2400, 'city'), s(60, 0, -2400, 'city'), s(50, -2.8, 0, 'city'),
      s(40, 0, 0, 'industrial', { feature: 'trestle' }), s(80, 2.2, 1600, 'industrial'), s(60, -1, -1600, 'industrial'),
      s(90, 0, 3000, 'city'), s(60, 3.6, -3000, 'city'), s(70, -3.6, 0, 'city'), s(60, 0, 1400, 'park'), s(60, 1.4, -1400, 'park'),
      s(80, 0, 0, 'city', rails), s(60, -2, 0, 'city', rails), s(50, 0, 0, 'city'),
    ],
  },
  {
    id: 'highland', name: 'Highland Park Ford Plant', chapterTitle: 'Highland Park', city: 'detroit', skyline: 'ford', laps: 3, seed: 1910,
    blurb: 'Past the Crystal Palace where a car rolls off the line every ninety-three minutes. Mind the trucks.',
    sections: [
      s(60, 0, 0, 'industrial', { feature: 'stands' }), s(100, 0, 0, 'industrial', { feature: 'ford' }), s(50, 2.5, 0, 'industrial'),
      s(60, 0, 1200, 'industrial'), s(50, -3.2, -1200, 'industrial'), s(40, 0, 0, 'industrial', { feature: 'trestle' }),
      s(80, 1.4, 0, 'city', rails), s(60, -1.4, 2000, 'city', rails), s(60, 3, -2000, 'city'), s(80, 0, 0, 'industrial'),
      s(60, -2.4, 0, 'industrial'), s(50, 0, 0, 'tunnel'), s(60, 2, 0, 'industrial'), s(60, 0, 0, 'industrial'),
    ],
  },
  {
    id: 'wallst', name: 'Wall Street', chapterTitle: 'Wall Street', city: 'ny', skyline: 'ny', laps: 3, seed: 1792,
    blurb: 'Canyons of granite and money. Tight corners between the banks, and a crowd on every step.',
    sections: [
      s(60, 0, 0, 'city', { feature: 'stands' }), s(60, 2.8, 0, 'city'), s(50, -2.8, 0, 'city'), s(80, 0, 900, 'city'),
      s(50, 3.8, -900, 'city'), s(40, 0, 0, 'city'), s(50, -3.8, 0, 'city'), s(70, 1.2, 0, 'city', rails), s(60, 0, 1400, 'city', rails),
      s(60, -2, -1400, 'city'), s(50, 3.2, 0, 'city'), s(60, 0, 0, 'city'), s(50, -2.4, 0, 'city'), s(60, 0, 0, 'city'),
    ],
  },
  {
    id: 'fifth', name: 'Flatiron & Fifth Avenue', chapterTitle: 'Fifth Avenue', city: 'ny', skyline: 'ny', laps: 3, seed: 1902,
    blurb: 'Up Fifth Avenue, under the Washington Arch and round the prow of the Flatiron. Hold onto your hat.',
    sections: [
      s(60, 0, 0, 'city', { feature: 'stands' }), s(40, 0, 0, 'plaza', { feature: 'arch' }), s(30, 0, 0, 'plaza'), s(80, 1, 600, 'city', rails),
      s(50, 0, -600, 'city', { feature: 'flatiron' }), s(50, -3, 0, 'city'), s(70, 0, 0, 'city'), s(60, 2.4, 1600, 'city'),
      s(60, 0, -1600, 'city'), s(60, 3.4, 0, 'park'), s(60, -1, 0, 'park', { feature: 'fountain' }), s(60, -2.6, 0, 'city'),
      s(80, 0, 0, 'city', rails), s(60, 1.8, 0, 'city'), s(40, 0, 0, 'plaza'),
    ],
  },
  {
    id: 'brooklyn', name: 'Brooklyn Bridge', chapterTitle: 'The Brooklyn Bridge', city: 'ny', skyline: 'ny', laps: 3, seed: 1883,
    blurb: 'Over the East River between the great Gothic towers, and back through the streets of Brooklyn.',
    sections: [
      s(60, 0, 0, 'city', { feature: 'stands' }), s(50, -1.6, 0, 'city'), s(240, 0, 0, 'bridge', { feature: 'bridge' }),
      s(60, 2.6, 0, 'city'), s(60, 0, 1200, 'city', rails), s(60, -3.2, -1200, 'city'), s(70, 0, 0, 'industrial'),
      s(60, 2.8, 0, 'industrial'), s(50, 0, 0, 'tunnel'), s(60, -2, 1000, 'city'), s(60, 1.6, -1000, 'city'), s(60, 0, 0, 'city'),
    ],
  },
];

/** Hills within bridge sections are applied after the builder: the deck rises to mid-span. */
export const trackById = (id: string) => TRACKS.find((t) => t.id === id) ?? TRACKS[0];

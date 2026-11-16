import type { WeatherId } from './weather';

export interface CupRace { track: string; weather: WeatherId; laps: number; rivals: number; difficulty: number; chapter: string }
export interface Cup { id: string; name: string; subtitle: string; prize: number; races: CupRace[]; requires?: string }

export const POINTS = [10, 6, 4, 3, 2, 1];
export const PRIZE = [500, 320, 220, 140, 100, 70]; // coins by finishing place

export const CUPS: Cup[] = [
  {
    id: 'detroit', name: 'The Detroit Cup', subtitle: 'In which a young mechanic tries his luck', prize: 800,
    races: [
      { track: 'depot', weather: 'overcast', laps: 2, rivals: 5, difficulty: 0.9, chapter: 'I' },
      { track: 'woodward', weather: 'clear', laps: 3, rivals: 5, difficulty: 0.92, chapter: 'II' },
      { track: 'belleisle', weather: 'clear', laps: 3, rivals: 5, difficulty: 0.94, chapter: 'III' },
    ],
  },
  {
    id: 'motor', name: 'The Motor Cup', subtitle: 'Smoke, steel and the river wind', prize: 1400, requires: 'detroit',
    races: [
      { track: 'grandblvd', weather: 'dusk', laps: 3, rivals: 5, difficulty: 0.97, chapter: 'IV' },
      { track: 'highland', weather: 'rain', laps: 3, rivals: 5, difficulty: 0.99, chapter: 'V' },
      { track: 'woodward', weather: 'night', laps: 3, rivals: 5, difficulty: 1.0, chapter: 'VI' },
    ],
  },
  {
    id: 'empire', name: 'The Empire Cup', subtitle: 'A Detroit lad in Gotham', prize: 2200, requires: 'motor',
    races: [
      { track: 'wallst', weather: 'overcast', laps: 3, rivals: 5, difficulty: 1.02, chapter: 'VII' },
      { track: 'fifth', weather: 'rain', laps: 3, rivals: 5, difficulty: 1.04, chapter: 'VIII' },
      { track: 'brooklyn', weather: 'dusk', laps: 3, rivals: 5, difficulty: 1.05, chapter: 'IX' },
    ],
  },
  {
    id: 'grandprix', name: 'Grand Prix of 1915', subtitle: 'The greatest motor race the world has seen', prize: 4000, requires: 'empire',
    races: [
      { track: 'belleisle', weather: 'fog', laps: 3, rivals: 6, difficulty: 1.07, chapter: 'X' },
      { track: 'brooklyn', weather: 'night', laps: 3, rivals: 6, difficulty: 1.09, chapter: 'XI' },
      { track: 'depot', weather: 'rain', laps: 4, rivals: 6, difficulty: 1.1, chapter: 'XII' },
    ],
  },
];

export const DIFFICULTY = { easy: 0.92, normal: 1, hard: 1.06 };

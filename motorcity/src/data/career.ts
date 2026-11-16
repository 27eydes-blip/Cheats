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
      { track: 'belleisle', weather: 'fog', laps: 3, rivals: 5, difficulty: 1.07, chapter: 'X' },
      { track: 'brooklyn', weather: 'night', laps: 3, rivals: 5, difficulty: 1.09, chapter: 'XI' },
      { track: 'depot', weather: 'rain', laps: 4, rivals: 5, difficulty: 1.1, chapter: 'XII' },
    ],
  },
];

import type { Level } from '../game/ai';
export type LevelId = 'easy' | 'normal' | 'hard';
/** Difficulty setting. Normal: the fastest rival matches your car's top speed (cup pace +15%);
 *  Hard: rivals a touch quicker than your car and boost more; Easy: gentler on every count.
 *  On every level a rival is never allowed more than ~8 s ahead of you. */
export const LEVELS: Record<LevelId, Level> = {
  easy: { cap: 0.93, cup: 0.94, maxLead: 6, catchUp: 0.03, boostMul: 0.6 },
  normal: { cap: 1.0, cup: 1.0, maxLead: 8, catchUp: 0.06, boostMul: 1 },
  hard: { cap: 1.03, cup: 1.05, maxLead: 8, catchUp: 0.08, boostMul: 1.4 },
};

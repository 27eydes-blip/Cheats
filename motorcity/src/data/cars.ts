import type { ModelId } from '../art/cars';

/** World units per second per mile-per-hour. 12 000 u/s (one segment per frame) = 100 mph. */
export const MPH = 120;

export interface CarSpec {
  id: ModelId;
  name: string;
  year: number;
  price: number;
  top: number;      // mph
  accel: number;    // 0..1.5
  grip: number;     // 0.8..1.3
  handling: number; // 0.8..1.3
  blurb: string;
}

export const CARS: CarSpec[] = [
  { id: 'runabout', name: 'Detroit Runabout', year: 1909, price: 0, top: 62, accel: 0.9, grip: 0.95, handling: 1.0, blurb: 'A plucky two-seater. Every legend starts somewhere.' },
  { id: 'modelT', name: 'Tin Lizzie Racer', year: 1912, price: 600, top: 66, accel: 1.05, grip: 1.0, handling: 1.05, blurb: 'Stripped-down Highland Park special. Light, cheap, eager.' },
  { id: 'packard', name: 'Packard Six', year: 1913, price: 1800, top: 71, accel: 0.95, grip: 1.15, handling: 0.95, blurb: 'Heavy and planted. Shrugs off a bump like a gentleman.' },
  { id: 'stutz', name: 'Stutz Bearcat', year: 1914, price: 3200, top: 76, accel: 1.1, grip: 1.05, handling: 1.08, blurb: 'The car that won in a day. Bolster tank, monocle screen.' },
  { id: 'mercer', name: 'Mercer Raceabout', year: 1913, price: 4400, top: 80, accel: 1.15, grip: 1.1, handling: 1.15, blurb: 'Light, nimble, and fast as rumour on Woodward.' },
  { id: 'buick', name: 'Buick Bug', year: 1910, price: 6000, top: 85, accel: 1.1, grip: 1.05, handling: 1.1, blurb: 'Boat-tailed brute built to break records.' },
  { id: 'special', name: 'Motor City Special', year: 1915, price: 9500, top: 92, accel: 1.25, grip: 1.2, handling: 1.2, blurb: 'One of a kind. Built in a Brush Park carriage house.' },
];

export type UpgradeKind = 'engine' | 'tires' | 'handling';
export const UPGRADE_MAX = 4;
export const UPGRADES: Record<UpgradeKind, { name: string; desc: string; cost: number[] }> = {
  engine: { name: 'Engine', desc: 'Bored cylinders and a hotter magneto: top speed and pull.', cost: [300, 700, 1400, 2600] },
  tires: { name: 'Tyres', desc: 'Pneumatic racing tyres with non-skid tread: grip in corners and rain.', cost: [250, 600, 1200, 2200] },
  handling: { name: 'Steering', desc: 'Stiffer springs and a quicker steering box: sharper turn-in, longer drifts.', cost: [250, 600, 1200, 2200] },
};

export interface Paint { id: string; name: string; hex: string; price: number }
export const PAINTS: Paint[] = [
  { id: 'carmine', name: 'Carmine Red', hex: '#a3242b', price: 0 },
  { id: 'brewster', name: 'Brewster Green', hex: '#2f5a3a', price: 150 },
  { id: 'royal', name: 'Royal Blue', hex: '#2b4a8c', price: 150 },
  { id: 'cream', name: 'Ivory Cream', hex: '#e6d7aa', price: 200 },
  { id: 'canary', name: 'Canary Yellow', hex: '#d9b02a', price: 250 },
  { id: 'black', name: 'Japan Black', hex: '#1c1b1a', price: 100 },
  { id: 'claret', name: 'Claret', hex: '#5e1e2e', price: 300 },
  { id: 'robin', name: 'Robin\'s Egg', hex: '#6fa8a6', price: 400 },
];

export interface Stats { top: number; accel: number; grip: number; handling: number }

export function statsFor(id: ModelId, up: Partial<Record<UpgradeKind, number>> = {}): Stats {
  const c = CARS.find((x) => x.id === id) ?? CARS[0];
  const e = up.engine ?? 0, t = up.tires ?? 0, h = up.handling ?? 0;
  return {
    top: (c.top + e * 3) * MPH,
    accel: c.accel * (1 + e * 0.06),
    grip: c.grip * (1 + t * 0.06),
    handling: c.handling * (1 + h * 0.06),
  };
}

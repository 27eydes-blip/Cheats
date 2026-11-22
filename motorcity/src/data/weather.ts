export type WeatherId = 'clear' | 'overcast' | 'rain' | 'fog' | 'dusk' | 'night';

export interface Weather {
  id: WeatherId;
  name: string;
  skyTop: string; skyBot: string;
  fog: string;
  /** Distance haze 0..1 at draw distance. */
  haze: number;
  /** Fraction of draw distance visible (fog shortens). */
  view: number;
  /** Multiply tint applied over the world ('' = none). */
  tint: string;
  lamps: boolean;
  rain: boolean;
  wet: boolean;
  grip: number;
  cloud: number;
}

export const WEATHER: Record<WeatherId, Weather> = {
  clear: { id: 'clear', name: 'Fair', skyTop: '#c9b48e', skyBot: '#eadbb8', fog: '#e2d2ae', haze: 0.55, view: 1, tint: '', lamps: false, rain: false, wet: false, grip: 1, cloud: 0.6 },
  overcast: { id: 'overcast', name: 'Overcast', skyTop: '#a79a84', skyBot: '#d6cbb5', fog: '#cfc3ab', haze: 0.7, view: 0.9, tint: '', lamps: false, rain: false, wet: false, grip: 1, cloud: 1 },
  rain: { id: 'rain', name: 'Rain', skyTop: '#6e6a62', skyBot: '#a7a296', fog: '#9d998e', haze: 0.85, view: 0.7, tint: '#c8c8c8', lamps: true, rain: true, wet: true, grip: 0.82, cloud: 1 },
  fog: { id: 'fog', name: 'Fog', skyTop: '#bdb6a6', skyBot: '#d2ccbd', fog: '#cdc7b8', haze: 1, view: 0.38, tint: '', lamps: true, rain: false, wet: true, grip: 0.92, cloud: 0 },
  dusk: { id: 'dusk', name: 'Dusk', skyTop: '#4d3b33', skyBot: '#d89a5a', fog: '#a87a52', haze: 0.7, view: 0.9, tint: '#c09a80', lamps: true, rain: false, wet: false, grip: 1, cloud: 0.8 },
  night: { id: 'night', name: 'Night', skyTop: '#07070c', skyBot: '#2a2630', fog: '#1e1b20', haze: 0.9, view: 0.75, tint: '#625e7a', lamps: true, rain: false, wet: false, grip: 0.97, cloud: 0.3 },
};

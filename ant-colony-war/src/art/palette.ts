export type Palette = {
  bg0: string;
  bg1: string;
  dirt: string;
  dirtFar: string;
  strata: string;
  cavity0: string;
  cavity1: string;
  light: string;
  fog: string;
  dust: string;
  rim: string;
  antFill: string;
  /** Colour used for the overall grade (soft-light overlay). */
  grade: string;
};

export const AMBER: Palette = {
  bg0: '#060302',
  bg1: '#140a04',
  dirt: '#0b0603',
  dirtFar: '#1c1008',
  strata: '#3a2412',
  cavity0: '#7a4a1c',
  cavity1: '#2c180a',
  light: '#ffb35c',
  fog: '#8a5a2c',
  dust: '#ffd59a',
  rim: '#ffb066',
  antFill: '#0d0805',
  grade: '#ff9a3c',
};

export const FIRE: Palette = {
  bg0: '#090201',
  bg1: '#200602',
  dirt: '#0c0201',
  dirtFar: '#2c0a03',
  strata: '#5a1a08',
  cavity0: '#9a3008',
  cavity1: '#320b04',
  light: '#ff5a1a',
  fog: '#a3341a',
  dust: '#ffb070',
  rim: '#ff7a2e',
  antFill: '#1a0502',
  grade: '#ff4a10',
};

export const GREEN: Palette = {
  bg0: '#010403',
  bg1: '#04110a',
  dirt: '#020805',
  dirtFar: '#0a1d12',
  strata: '#123a22',
  cavity0: '#185a34',
  cavity1: '#07190e',
  light: '#6dff8a',
  fog: '#2a8a4a',
  dust: '#b8ffc8',
  rim: '#7dffa0',
  antFill: '#030604',
  grade: '#39ff6a',
};

export const NIGHT: Palette = {
  bg0: '#03050a',
  bg1: '#0b1421',
  dirt: '#030407',
  dirtFar: '#0d141e',
  strata: '#1c2635',
  cavity0: '#1a2433',
  cavity1: '#070b12',
  light: '#a9c4d8',
  fog: '#3a4a5c',
  dust: '#cfe0ee',
  rim: '#9fb8cc',
  antFill: '#05070a',
  grade: '#5a7aa0',
};

export const VOID: Palette = {
  ...AMBER,
  bg0: '#020101',
  bg1: '#070403',
  cavity0: '#140c06',
  cavity1: '#050302',
  fog: '#4a3220',
  dust: '#d9b48a',
};

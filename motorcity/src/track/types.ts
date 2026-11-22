export const SEG_LEN = 200;
export const ROAD_W = 1000; // half-width of the carriageway in world units
// Lateral layout, in road half-widths from the centre line. The carriageway is ±1; the kerb runs to KERB;
// nothing solid stands inside CLEAR, which leaves a clear sidewalk run-off strip between kerb and obstacles.
export const KERB = 1.07;
export const CLEAR = 1.6;
/** Street furniture line (lamp posts, poles, hydrants). */
export const PROP_X = 1.66;
/** Building fronts. */
export const FACADE_X = 2.0;
/** Tunnel walls and the inside of bridge railings. */
export const TUNNEL_X = 1.6;
export const RAIL_X = 1.62;
/** How far the car's centre may get from a wall: the soft invisible wall. */
export const WALL_GAP = 0.27;

export type Zone = 'city' | 'park' | 'bridge' | 'tunnel' | 'industrial' | 'river' | 'plaza';
export type Ground = 'cobble' | 'park' | 'bridge' | 'tunnel' | 'brick' | 'finish';

export interface Facade {
  tex: HTMLCanvasElement;
  /** Building frontage in segments. */
  segs: number;
  /** Height in world units. */
  height: number;
  /** Optional side/end texture. */
  side?: HTMLCanvasElement;
  night?: HTMLCanvasElement;
  sideNight?: HTMLCanvasElement;
}

export interface WallPiece { f: Facade; u0: number; u1: number; start: boolean; end: boolean; x: number }

export interface SpriteInst {
  id: string;
  /** Lateral offset in road half-widths (negative = left). */
  x: number;
  /** Height above ground, world units. */
  y?: number;
  /** Solid: collides using the sprite's visible solid width (see art registry `solid`). */
  hit?: number;
  flip?: boolean;
  /** Index into the race's pedestrian list when animated. */
  ped?: number;
  /** Pole: marks this sprite as a wire anchor (left/right). */
  pole?: 'tele' | 'trolley';
  /** Glows at night. */
  lamp?: boolean;
  /** Seed for per-instance variation. */
  seed?: number;
}

export interface ProjPt { x: number; y: number; w: number; s: number; z: number }

export interface Segment {
  i: number;
  z1: number; z2: number;
  y1: number; y2: number;
  curve: number;
  zone: Zone;
  ground: Ground;
  rails: boolean;
  wallL?: WallPiece; wallR?: WallPiece;
  sprites: SpriteInst[];
  /** Portal spanning the road (tunnel mouth, bridge tower, finish banner, depot arch). */
  portal?: { kind: 'tunnel' | 'tower' | 'banner' | 'arch' | 'trestle'; h: number };
  tunnel: boolean;
  bunting: boolean;
  /** Water both sides (bridge) or one side (river). */
  waterL: boolean; waterR: boolean;
  finish: boolean;
  /** Height of the suspension cable above the deck (bridges). */
  cable?: number;
  /** Per-frame projection cache. */
  p1: ProjPt; p2: ProjPt; fog: number; vis: boolean; clipY: number;
  /** Cars currently on this segment (rebuilt each frame). */
  cars: any[];
}

export interface Section {
  len: number;
  curve?: number;
  /** Height change across this section (world units). */
  hill?: number;
  zone?: Zone;
  rails?: boolean;
  /** One-off features. */
  feature?: 'tunnel' | 'bridge' | 'depot' | 'flatiron' | 'ford' | 'finish' | 'fountain' | 'stands' | 'trestle' | 'arch';
}

export interface TrackDef {
  id: string;
  name: string;
  chapterTitle: string;
  blurb: string;
  city: 'detroit' | 'ny';
  skyline: 'detroit' | 'ny' | 'river' | 'ford';
  laps: number;
  seed: number;
  sections: Section[];
}

export interface Track {
  def: TrackDef;
  segs: Segment[];
  length: number;
  /** Minimap polyline (normalized 0..1), one point per 8 segments. */
  map: { x: number; y: number }[];
}

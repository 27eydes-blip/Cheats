/** Sprite registry. Each sprite: a canvas plus its scale in world units per pixel. Anchor = bottom centre. */
export interface Spr {
  img: HTMLCanvasElement; upp: number; flip?: HTMLCanvasElement; ax?: number; topY?: number; topX?: number[];
  /** Width in pixels of the solid, collidable part (e.g. a lamp's pole), centred on the sprite. */
  solid?: number;
}

const reg = new Map<string, Spr[]>();
export function register(id: string, s: Spr | Spr[]) { reg.set(id, Array.isArray(s) ? s : [s]); }
export function spr(id: string, variant = 0): Spr | undefined {
  const v = reg.get(id);
  if (!v) return undefined;
  return v[((variant % v.length) + v.length) % v.length];
}
export function variants(id: string) { return reg.get(id)?.length ?? 0; }

const HIT_SCALE = 0.9; // hitboxes are a little smaller than the art, never bigger
/** Collision half-width in road half-widths (ROAD_W = 1000 world units), or 0 if not solid. */
export function hitHalf(id: string, variant = 0): number {
  const s = spr(id, variant);
  if (!s || !s.solid) return 0;
  return ((s.solid * s.upp) / 2 / 1000) * HIT_SCALE;
}

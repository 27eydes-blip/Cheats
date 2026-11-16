/** Sprite registry. Each sprite: a canvas plus its scale in world units per pixel. Anchor = bottom centre. */
export interface Spr { img: HTMLCanvasElement; upp: number; flip?: HTMLCanvasElement; ax?: number; topY?: number; topX?: number[] }

const reg = new Map<string, Spr[]>();
export function register(id: string, s: Spr | Spr[]) { reg.set(id, Array.isArray(s) ? s : [s]); }
export function spr(id: string, variant = 0): Spr | undefined {
  const v = reg.get(id);
  if (!v) return undefined;
  return v[((variant % v.length) + v.length) % v.length];
}
export function variants(id: string) { return reg.get(id)?.length ?? 0; }

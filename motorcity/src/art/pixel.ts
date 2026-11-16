/** Pixel-art helpers: canvases, palette maths, a 3x5 bitmap font and string-grid sprites. */
export type Ctx = CanvasRenderingContext2D;

export function canvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

export const hexToRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const rgbToHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
/** Multiply brightness (f<1 darker, f>1 lighter). */
export const shade = (h: string, f: number) => { const [r, g, b] = hexToRgb(h); return rgbToHex(r * f, g * f, b * f); };
export const mix = (a: string, b: string, t: number) => {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
};

/** Sepia ramp, darkest to lightest. */
export const S = ['#140d08', '#21170f', '#2f2216', '#3e2e1f', '#4f3c29', '#634c34', '#7a5f41', '#927451', '#aa8b63', '#c1a379', '#d5ba92', '#e6d1ad', '#f3e6cb'];
/** Slightly cooler and warmer sepia families for material variety. */
export const STONE = ['#24201b', '#38322a', '#4d463b', '#655c4e', '#7e7462', '#988d78', '#b2a690', '#c9bea8', '#ddd3be'];
export const BRICK = ['#1f130c', '#321e13', '#46291a', '#5a3622', '#6f442c', '#855438', '#9a6646', '#b07c5a'];

export function rect(ctx: Ctx, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
export function px(ctx: Ctx, x: number, y: number, c: string) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); }
export function hline(ctx: Ctx, x: number, y: number, w: number, c: string) { rect(ctx, x, y, w, 1, c); }
export function vline(ctx: Ctx, x: number, y: number, h: number, c: string) { rect(ctx, x, y, 1, h, c); }

const G: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010', '8': '111101111101111',
  '9': '111101111001110', ' ': '000000000000000', '.': '000000000000010', ',': '000000000010100', '!': '010010010000010',
  $: '011110010011110', '&': '010101010101011', '-': '000000111000000', "'": '010010000000000', ':': '000010000010000',
  '?': '110001010000010', '/': '001001010100100', '%': '101001010100101', '#': '101111101111101',
};
export const textWidth = (s: string, scale = 1) => (s.length * 4 - 1) * scale;
export function text(ctx: Ctx, s: string, x: number, y: number, c: string, scale = 1) {
  ctx.fillStyle = c;
  let cx = Math.round(x);
  for (const ch of s.toUpperCase()) {
    const g = G[ch] ?? G[' '];
    for (let i = 0; i < 15; i++) if (g[i] === '1') ctx.fillRect(cx + (i % 3) * scale, Math.round(y) + Math.floor(i / 3) * scale, scale, scale);
    cx += 4 * scale;
  }
}
export function textCentered(ctx: Ctx, s: string, cx: number, y: number, c: string, scale = 1) {
  text(ctx, s, cx - textWidth(s, scale) / 2, y, c, scale);
}

/** Build a sprite from rows of palette characters ('.' = transparent). */
export function fromGrid(rows: string[], pal: Record<string, string>): HTMLCanvasElement {
  const w = Math.max(...rows.map((r) => r.length));
  const [c, ctx] = canvas(w, rows.length);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = pal[row[x]];
      if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
    }
  });
  return c;
}

export function flipH(src: HTMLCanvasElement): HTMLCanvasElement {
  const [c, ctx] = canvas(src.width, src.height);
  ctx.translate(src.width, 0); ctx.scale(-1, 1); ctx.drawImage(src, 0, 0);
  return c;
}

/** Ordered-dither noise speckle over a region (adds photographic texture). */
export function speckle(ctx: Ctx, x: number, y: number, w: number, h: number, seed: number, amt = 0.08, dark = '#000', light = '#fff') {
  let s = seed >>> 0 || 1;
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const r = s / 4294967296;
    if (r < amt * 0.5) { ctx.globalAlpha = 0.18; px(ctx, x + xx, y + yy, dark); }
    else if (r > 1 - amt * 0.5) { ctx.globalAlpha = 0.14; px(ctx, x + xx, y + yy, light); }
  }
  ctx.globalAlpha = 1;
}

/** Downscale by 2 with box filter (used for distant mip levels). */
export function halve(src: HTMLCanvasElement): HTMLCanvasElement {
  const [c, ctx] = canvas(Math.max(1, src.width >> 1), Math.max(1, src.height >> 1));
  ctx.imageSmoothingEnabled = true;
  (ctx as any).imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

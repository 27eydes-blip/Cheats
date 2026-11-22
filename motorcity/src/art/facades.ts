import { Rng } from '../core/rng';
import { canvas, rect, hline, vline, px, text, textWidth, textCentered, S, STONE, BRICK, shade, mix, speckle, type Ctx } from './pixel';
import type { Facade } from '../track/types';
import { SEG_LEN } from '../track/types';

export type FacadeStyle =
  | 'brick' | 'stone' | 'arcade' | 'store' | 'hotel' | 'office' | 'tenement' | 'bank'
  | 'factory' | 'warehouse' | 'depot' | 'flatiron' | 'ford' | 'stands';

/** World units per texture pixel. */
export const FPX = 25;

interface Win { x: number; y: number; w: number; h: number }
interface Mat { base: string[]; kind: 'brick' | 'stone' | 'smooth'; trim: string[] }

const SHOPS = ['DRY GOODS', 'HARDWARE', 'PHARMACY', 'TAILOR', 'BAKERY', 'CIGARS', 'LUNCH ROOM', 'OYSTERS', 'SHOES', 'PIANOS',
  'HATTER', 'GROCER', 'MILLINERY', 'NOTIONS', 'BARBER', 'JEWELER', 'BICYCLES', 'TEA & COFFEE', 'CANDY', 'BOOKS', 'GARAGE', 'TIRES', 'DRUGS', 'CHOP HOUSE'];
const ADS = ['TO LET', 'OFFICES TO LET', 'ROOMS 50C', 'DRINK SARSAPARILLA', 'DR. MILLER\'S TONIC', 'MOTOR OIL', 'PIANOS & ORGANS', 'STORAGE', 'FINE CIGARS 5C', 'SODA WATER', 'LAUNDRY', 'SPARK PLUGS'];

function material(style: FacadeStyle, rng: Rng): Mat {
  switch (style) {
    case 'stone': case 'bank': case 'depot': case 'flatiron':
      return { base: STONE.slice(4), kind: 'stone', trim: STONE.slice(5) };
    case 'office': return { base: rng.chance(0.5) ? STONE.slice(5) : S.slice(7), kind: 'smooth', trim: STONE.slice(6) };
    case 'hotel': return rng.chance(0.5) ? { base: BRICK.slice(3), kind: 'brick', trim: STONE.slice(5) } : { base: S.slice(6), kind: 'smooth', trim: S.slice(8) };
    default: {
      const dark = rng.chance(0.4);
      return { base: dark ? BRICK.slice(1) : BRICK.slice(3), kind: 'brick', trim: STONE.slice(rng.chance(0.5) ? 5 : 4) };
    }
  }
}

function wallFill(ctx: Ctx, x: number, y: number, w: number, h: number, m: Mat, rng: Rng) {
  const b = m.base;
  rect(ctx, x, y, w, h, b[1]);
  if (m.kind === 'brick') {
    // running bond: 4x2 bricks with mortar
    for (let yy = 0; yy < h; yy += 2) {
      const off = (yy >> 1) & 1 ? 2 : 0;
      hline(ctx, x, y + yy + 1, w, shade(b[1], 0.82));
      for (let xx = -off; xx < w; xx += 4) {
        const v = rng.next();
        rect(ctx, x + Math.max(0, xx), y + yy, Math.min(3, w - Math.max(0, xx)), 1, v < 0.18 ? b[0] : v > 0.85 ? b[2] : b[1]);
      }
    }
  } else if (m.kind === 'stone') {
    for (let yy = 0; yy < h; yy += 6) {
      hline(ctx, x, y + yy, w, shade(b[1], 0.8));
      const off = (yy / 6) % 2 ? 6 : 0;
      for (let xx = off; xx < w; xx += 12) vline(ctx, x + xx, y + yy, 6, shade(b[1], 0.86));
    }
    speckle(ctx, x, y, w, h, rng.int(1, 1e9), 0.06);
  } else {
    speckle(ctx, x, y, w, h, rng.int(1, 1e9), 0.05);
    for (let yy = 4; yy < h; yy += 10) hline(ctx, x, y + yy, w, shade(b[1], 0.93));
  }
}

function windowAt(ctx: Ctx, w: Win, m: Mat, rng: Rng, kind: 'rect' | 'arch' | 'pair' | 'tall', wins: Win[]) {
  const t = m.trim;
  const { x, y } = w;
  // lintel + sill
  if (kind === 'arch') {
    rect(ctx, x - 1, y + 2, w.w + 2, w.h - 1, t[0]);
    for (let i = 0; i < w.w + 2; i++) {
      const dx = i - (w.w + 1) / 2;
      const hh = Math.round(Math.sqrt(Math.max(0, ((w.w + 2) / 2) ** 2 - dx * dx)) * 0.7);
      vline(ctx, x - 1 + i, y + 3 - hh, hh, t[1]);
    }
    px(ctx, x + Math.floor(w.w / 2), y - 2, t[3] ?? t[2]); // keystone
  } else {
    rect(ctx, x - 1, y - 2, w.w + 2, 2, t[1]);
    hline(ctx, x - 1, y - 2, w.w + 2, t[2]);
  }
  rect(ctx, x - 1, y + w.h, w.w + 2, 2, t[1]);
  hline(ctx, x - 1, y + w.h + 1, w.w + 2, shade(t[0], 0.7));
  // glass
  const g0 = S[1], g1 = S[2], g2 = S[4];
  rect(ctx, x, y, w.w, w.h, g0);
  rect(ctx, x, y, w.w, Math.ceil(w.h / 2), g1);
  // reflection streak
  for (let i = 0; i < w.h; i += 1) if ((i + x) % 7 < 2) px(ctx, x + ((i >> 1) % w.w), y + i, g2);
  // shade drawn down
  if (rng.chance(0.35)) {
    const sh = Math.floor(w.h * rng.range(0.15, 0.6));
    rect(ctx, x, y, w.w, sh, S[rng.int(6, 9)]);
    hline(ctx, x, y + sh, w.w, S[4]);
  }
  // sash bars
  if (w.w >= 4) vline(ctx, x + Math.floor(w.w / 2), y, w.h, t[0]);
  hline(ctx, x, y + Math.floor(w.h / 2), w.w, t[0]);
  if (kind === 'tall' && w.h > 14) { hline(ctx, x, y + Math.floor(w.h / 4), w.w, t[0]); hline(ctx, x, y + Math.floor((w.h * 3) / 4), w.w, t[0]); }
  if (rng.chance(0.08)) { rect(ctx, x, y + w.h - 3, w.w, 3, S[9]); } // flower box
  wins.push(w);
}

function cornice(ctx: Ctx, W: number, y: number, m: Mat, rng: Rng, big = false) {
  const t = m.trim;
  const h = big ? 10 : 7;
  rect(ctx, 0, y, W, h, t[1]);
  hline(ctx, 0, y, W, t[2] ?? t[1]);
  hline(ctx, 0, y + 1, W, t[2] ?? t[1]);
  // dentils
  for (let x = 0; x < W; x += 3) rect(ctx, x, y + 3, 2, 2, t[2] ?? t[1]);
  hline(ctx, 0, y + h - 1, W, shade(t[0], 0.6));
  // brackets
  for (let x = 2; x < W; x += big ? 10 : 14) { rect(ctx, x, y + h, 2, 3, t[1]); px(ctx, x, y + h + 3, t[0]); }
  // shadow under
  ctx.globalAlpha = 0.35; rect(ctx, 0, y + h, W, 3, S[0]); ctx.globalAlpha = 1;
  void rng;
}

function storefront(ctx: Ctx, x0: number, gy: number, w: number, gh: number, m: Mat, rng: Rng, wins: Win[], sign?: string) {
  const t = m.trim;
  // sign band
  const sb = 9;
  rect(ctx, x0, gy, w, sb, S[2]);
  hline(ctx, x0, gy, w, t[1]);
  hline(ctx, x0, gy + sb - 1, w, t[0]);
  const word = sign ?? rng.pick(SHOPS);
  const tw = textWidth(word);
  if (tw < w - 2) textCentered(ctx, word, x0 + w / 2, gy + 2, S[11]);
  else if (word.length > 4) textCentered(ctx, word.split(' ')[0].slice(0, Math.floor((w - 2) / 4)), x0 + w / 2, gy + 2, S[11]);
  // piers
  const y = gy + sb;
  const h = gh - sb;
  rect(ctx, x0, y, w, h, t[0]);
  // display windows + door
  const door = rng.int(0, 2);
  const panes = Math.max(2, Math.floor(w / 9));
  const pw = Math.floor((w - 4) / panes);
  for (let i = 0; i < panes; i++) {
    const px0 = x0 + 2 + i * pw;
    if (i === door % panes) {
      // recessed door with transom
      rect(ctx, px0 + 1, y + 2, pw - 2, h - 2, S[1]);
      rect(ctx, px0 + 2, y + 3, pw - 4, 3, S[5]);
      rect(ctx, px0 + 2, y + 7, pw - 4, h - 8, S[3]);
      vline(ctx, px0 + pw - 4, y + 12, 2, S[9]);
      continue;
    }
    rect(ctx, px0, y + 1, pw - 1, h - 5, S[2]);
    rect(ctx, px0 + 1, y + 2, pw - 3, Math.floor((h - 7) / 2), S[3]);
    // goods in window
    for (let k = 0; k < 3; k++) rect(ctx, px0 + 1 + rng.int(0, Math.max(0, pw - 5)), y + h - 9 - rng.int(0, 4), 2, rng.int(2, 4), S[rng.int(6, 10)]);
    for (let r = 0; r < h - 5; r += 3) if ((r + px0) % 5 === 0) px(ctx, px0 + (r % (pw - 1)), y + 1 + r, S[6]);
    rect(ctx, px0, y + h - 4, pw - 1, 4, t[1]); // stallriser
    wins.push({ x: px0, y: y + 1, w: pw - 1, h: h - 5 });
  }
  // awning (striped canvas, sepia)
  if (rng.chance(0.7)) {
    const ay = y - 1;
    const ah = 8;
    for (let i = 0; i < ah; i++) {
      const ww = w + Math.floor(i * 0.3);
      for (let xx = 0; xx < ww; xx++) {
        const stripe = Math.floor(xx / 3) % 2;
        px(ctx, x0 + xx - Math.floor(i * 0.15), ay + i, stripe ? S[10 - (i >> 2)] : S[5 - (i >> 2)]);
      }
    }
    // scalloped valance
    for (let xx = 0; xx < w; xx += 3) { px(ctx, x0 + xx, ay + ah, S[4]); px(ctx, x0 + xx + 1, ay + ah, S[4]); }
    ctx.globalAlpha = 0.4; rect(ctx, x0, ay + ah + 1, w, 6, S[0]); ctx.globalAlpha = 1;
  }
}

function wallAd(ctx: Ctx, x: number, y: number, w: number, h: number, rng: Rng) {
  const word = rng.pick(ADS);
  ctx.globalAlpha = 0.75;
  rect(ctx, x, y, w, h, S[rng.chance(0.5) ? 9 : 2]);
  ctx.globalAlpha = 1;
  const light = ctx.getImageData(x + 1, y + 1, 1, 1).data[0] > 120;
  const col = light ? S[1] : S[11];
  const words = word.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (textWidth(t, 2) > w - 4 && cur) { lines.push(cur); cur = wd; } else cur = t; }
  if (cur) lines.push(cur);
  const scale = lines.every((l) => textWidth(l, 2) <= w - 4) && lines.length * 12 <= h ? 2 : 1;
  const lh = scale * 6;
  const top = y + (h - lines.length * lh) / 2;
  lines.forEach((l, i) => textCentered(ctx, l, x + w / 2, top + i * lh, col, scale));
  // weathering
  speckle(ctx, x, y, w, h, rng.int(1, 1e9), 0.25, S[1], S[11]);
}

function fireEscape(ctx: Ctx, x: number, y0: number, y1: number, fh: number, w: number) {
  for (let y = y0; y < y1; y += fh) {
    hline(ctx, x - 2, y, w + 4, S[0]);
    hline(ctx, x - 2, y - 4, w + 4, S[1]);
    for (let xx = -2; xx < w + 2; xx += 2) vline(ctx, x + xx, y - 4, 4, S[1]);
    // ladder diagonal
    for (let i = 0; i < fh - 2; i++) px(ctx, x + Math.floor((i / fh) * w), y + i + 1, S[0]);
  }
}

function shading(ctx: Ctx, W: number, H: number) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(255,240,210,0.10)');
  g.addColorStop(0.6, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(20,10,5,0.28)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function nightVersion(src: HTMLCanvasElement, wins: Win[], rng: Rng, litChance: number): HTMLCanvasElement {
  const [c, ctx] = canvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalAlpha = 0.55; rect(ctx, 0, 0, c.width, c.height, '#0a0806'); ctx.globalAlpha = 1;
  for (const w of wins) {
    if (!rng.chance(litChance)) continue;
    const warm = rng.chance(0.7);
    rect(ctx, w.x, w.y, w.w, w.h, warm ? '#f0c878' : '#e8dcb0');
    rect(ctx, w.x, w.y + Math.floor(w.h * 0.6), w.w, Math.ceil(w.h * 0.4), warm ? '#d8a050' : '#c8bc90');
    if (w.w >= 4) vline(ctx, w.x + Math.floor(w.w / 2), w.y, w.h, '#5a4020');
    if (rng.chance(0.3)) rect(ctx, w.x + 1, w.y + Math.floor(w.h * 0.3), Math.max(1, w.w >> 1), Math.ceil(w.h * 0.6), '#4a3418'); // silhouette
  }
  return c;
}

function sideTex(m: Mat, H: number, rng: Rng): HTMLCanvasElement {
  const W = 40;
  const [c, ctx] = canvas(W, H);
  wallFill(ctx, 0, 0, W, H, { ...m, base: m.base.map((b) => shade(b, 0.72)) }, rng);
  const wins: Win[] = [];
  for (let y = 50; y < H - 30; y += 34) if (rng.chance(0.5)) windowAt(ctx, { x: 18, y, w: 6, h: 14 }, m, rng, 'rect', wins);
  if (H > 120 && rng.chance(0.6)) wallAd(ctx, 4, 60, W - 8, Math.min(60, H - 100), rng);
  shading(ctx, W, H);
  return c;
}

export function makeFacade(style: FacadeStyle, segs: number, height: number, seed: number): Facade & { night: HTMLCanvasElement; sideNight?: HTMLCanvasElement } {
  const rng = new Rng(seed);
  const W = Math.round((segs * SEG_LEN) / FPX);
  const H = Math.round(height / FPX);
  const [c, ctx] = canvas(W, H);
  const m = material(style, rng);
  const wins: Win[] = [];
  wallFill(ctx, 0, 0, W, H, m, rng);

  if (style === 'stands') { paintStands(ctx, W, H, rng); const night = nightVersion(c, [], rng, 0); return { tex: c, night, segs, height }; }
  const special = style === 'depot' || style === 'flatiron' || style === 'ford' || style === 'factory' || style === 'warehouse';
  if (!special) paintCommercial(ctx, W, H, m, style, rng, wins);
  else if (style === 'depot') paintDepot(ctx, W, H, m, rng, wins);
  else if (style === 'flatiron') paintFlatiron(ctx, W, H, m, rng, wins);
  else paintIndustrial(ctx, W, H, m, style, rng, wins);

  shading(ctx, W, H);
  // roof line silhouette: water tanks / chimneys
  const night = nightVersion(c, wins, rng, style === 'factory' || style === 'ford' ? 0.75 : 0.4);
  const side = sideTex(m, H, rng);
  return { tex: c, night, segs, height, side, sideNight: nightVersion(side, [], rng, 0) };
}

function paintCommercial(ctx: Ctx, W: number, H: number, m: Mat, style: FacadeStyle, rng: Rng, wins: Win[]) {
  const GF = style === 'arcade' || style === 'bank' ? 58 : 46;
  const top = 14;
  const fh = style === 'office' ? 30 : style === 'tenement' ? 30 : 34;
  const floors = Math.max(1, Math.floor((H - GF - top) / fh));
  const bayW = style === 'office' ? 14 : style === 'tenement' ? 16 : rng.int(16, 22);
  const nb = Math.max(1, Math.floor((W - 4) / bayW));
  const margin = Math.floor((W - nb * bayW) / 2);
  const gTop = H - GF;
  // rusticated / contrasting base
  if (style === 'stone' || style === 'bank' || style === 'arcade') {
    wallFill(ctx, 0, gTop, W, GF, { ...m, kind: 'stone', base: STONE.slice(3) }, rng);
  }
  // belt course above ground floor
  rect(ctx, 0, gTop - 3, W, 3, m.trim[1]);
  hline(ctx, 0, gTop - 3, W, m.trim[2] ?? m.trim[1]);
  // upper floors
  const archTop = style === 'arcade' || (style === 'stone' && rng.chance(0.5));
  const adBay = rng.chance(style === 'store' || style === 'brick' ? 0.6 : 0.15) ? rng.int(0, Math.max(0, nb - 3)) : -1;
  for (let f = 0; f < floors; f++) {
    const y = gTop - 6 - (f + 1) * fh + 6;
    const isTop = f === floors - 1;
    if (style === 'office' || (f % 2 === 1 && style !== 'tenement')) {
      hline(ctx, 0, y + fh - 3, W, shade(m.base[1], 0.85));
    }
    for (let b = 0; b < nb; b++) {
      if (adBay >= 0 && b >= adBay && b < adBay + 3 && f >= floors - 3 && floors >= 3) continue;
      const bx = margin + b * bayW;
      if (style === 'office') {
        windowAt(ctx, { x: bx + 2, y: y + 6, w: bayW - 4, h: fh - 12 }, m, rng, 'pair', wins);
        // pier between bays
        vline(ctx, bx, y, fh, m.trim[1]);
        continue;
      }
      const ww = Math.max(4, Math.floor(bayW * 0.45));
      const kind = isTop && archTop ? 'arch' : rng.chance(0.06) ? 'arch' : 'rect';
      windowAt(ctx, { x: bx + Math.floor((bayW - ww) / 2), y: y + 8, w: ww, h: fh - 16 }, m, rng, kind as any, wins);
    }
  }
  if (adBay >= 0 && floors >= 3) {
    const x = margin + adBay * bayW + 1;
    const y = gTop - 3 * fh - 2;
    wallAd(ctx, x, y, bayW * 3 - 2, fh * 3 - 8, rng);
  }
  // pilasters on stone/bank
  if (style === 'bank') {
    for (let b = 0; b <= nb; b++) {
      const x = margin + b * bayW - 2;
      rect(ctx, x, gTop + 4, 4, GF - 4, STONE[7]);
      vline(ctx, x + 3, gTop + 4, GF - 4, STONE[5]);
      rect(ctx, x - 1, gTop + 2, 6, 3, STONE[8]);
    }
    for (let b = 0; b < nb; b++) {
      const x = margin + b * bayW + 3;
      windowAt(ctx, { x, y: gTop + 10, w: bayW - 6, h: GF - 18 }, m, rng, 'arch', wins);
    }
    rect(ctx, 0, gTop + 2, W, 4, STONE[7]);
    textCentered(ctx, rng.pick(['SAVINGS BANK', 'TRUST CO.', 'NATIONAL BANK', 'EXCHANGE']), W / 2, gTop - 1 - 8, S[1]);
  } else if (style === 'arcade') {
    const aw = Math.max(12, bayW);
    for (let x = margin; x + aw <= W; x += aw) {
      rect(ctx, x + 2, gTop + 10, aw - 4, GF - 10, S[1]);
      for (let i = 0; i < aw - 4; i++) {
        const dx = i - (aw - 5) / 2;
        const hh = Math.round(Math.sqrt(Math.max(0, ((aw - 4) / 2) ** 2 - dx * dx)));
        vline(ctx, x + 2 + i, gTop + 10 - hh + 2, hh, S[1]);
      }
      rect(ctx, x + 4, gTop + 16, aw - 8, GF - 22, S[3]);
      hline(ctx, x + 4, gTop + 30, aw - 8, S[1]);
      wins.push({ x: x + 4, y: gTop + 16, w: aw - 8, h: GF - 22 });
      px(ctx, x + aw / 2, gTop + 1, m.trim[2] ?? m.trim[1]);
    }
  } else {
    // storefronts in groups of bays
    let b = 0;
    const per = Math.max(1, rng.int(2, 3));
    const hotelSign = style === 'hotel';
    while (b < nb) {
      const n = Math.min(per, nb - b);
      storefront(ctx, margin + b * bayW, gTop, n * bayW, GF, m, rng, wins, hotelSign && b === 0 ? 'HOTEL' : undefined);
      b += n;
    }
  }
  if (style === 'hotel' && H > 140) {
    // vertical projecting sign
    const x = Math.floor(W * 0.35);
    const word = rng.pick(['HOTEL', 'TOURAINE', 'PONTCH', 'STATLER', 'CADILLAC', 'BRUNSWICK']).slice(0, 8);
    const hgt = word.length * 7 + 6;
    const y = gTop - 20 - hgt;
    rect(ctx, x, y, 9, hgt, S[1]);
    rect(ctx, x + 1, y + 1, 7, hgt - 2, S[3]);
    for (let i = 0; i < word.length; i++) text(ctx, word[i], x + 3, y + 4 + i * 7, S[12]);
  }
  if (style === 'tenement') for (let k = 0; k < Math.max(1, Math.floor(nb / 4)); k++) fireEscape(ctx, margin + (k * 4 + 1) * bayW, gTop - fh + 4, gTop - 6 - (floors - 1) * fh, -fh, bayW * 2);
  if (style === 'tenement') {
    // drying laundry lines
    for (let f = 1; f < floors; f += 2) {
      const y = gTop - f * fh - 3;
      hline(ctx, margin, y, Math.min(W - margin * 2, bayW * 3), S[0]);
      for (let x = margin + 2; x < margin + bayW * 3 - 3; x += 5) rect(ctx, x, y + 1, 3, 4, S[rng.int(8, 12)]);
    }
  }
  cornice(ctx, W, 2, m, rng, style === 'bank' || style === 'office' || style === 'stone');
  // parapet / roof clutter
  rect(ctx, 0, 0, W, 2, m.trim[0]);
  if (style !== 'office' && rng.chance(0.5)) {
    const x = rng.int(4, Math.max(5, W - 20));
    textCentered(ctx, String(rng.int(1868, 1912)), x + 8, 6, S[1]);
  }
}

function paintDepot(ctx: Ctx, W: number, H: number, m: Mat, rng: Rng, wins: Win[]) {
  // Beaux-Arts station: three giant arched windows over the concourse, office tower above
  const baseH = 150;
  const gTop = H - baseH;
  wallFill(ctx, 0, gTop, W, baseH, { ...m, kind: 'stone', base: STONE.slice(4) }, rng);
  // columns
  const archW = Math.floor(W / 3.6);
  const startX = Math.floor((W - archW * 3) / 2);
  for (let a = 0; a < 3; a++) {
    const x = startX + a * archW + 8;
    const w = archW - 16;
    const y = gTop + 34;
    rect(ctx, x, y, w, baseH - 46, S[1]);
    for (let i = 0; i < w; i++) {
      const dx = i - (w - 1) / 2;
      const hh = Math.round(Math.sqrt(Math.max(0, (w / 2) ** 2 - dx * dx)) * 0.9);
      vline(ctx, x + i, y - hh + 1, hh, S[1]);
      if (i % 6 === 0) vline(ctx, x + i, y - hh + 2, baseH - 46 + hh - 2, S[3]);
    }
    for (let yy = y - 20; yy < y + baseH - 46; yy += 10) hline(ctx, x, yy, w, S[3]);
    wins.push({ x: x + 2, y, w: w - 4, h: baseH - 50 });
    // keystone + voussoirs
    rect(ctx, x + w / 2 - 3, y - w / 2 * 0.9 - 4, 6, 8, STONE[8]);
  }
  // paired columns between arches
  for (let a = 0; a <= 3; a++) {
    const x = startX + a * archW - 3;
    for (const dx of [0, 6]) {
      rect(ctx, x + dx, gTop + 18, 4, baseH - 24, STONE[7]);
      vline(ctx, x + dx + 3, gTop + 18, baseH - 24, STONE[5]);
      rect(ctx, x + dx - 1, gTop + 16, 6, 3, STONE[8]);
    }
  }
  // entablature with lettering
  rect(ctx, 0, gTop + 4, W, 12, STONE[6]);
  hline(ctx, 0, gTop + 4, W, STONE[8]);
  textCentered(ctx, 'MICHIGAN CENTRAL STATION', W / 2, gTop + 8, S[1]);
  cornice(ctx, W, gTop - 6, { ...m, trim: STONE.slice(5) }, rng, true);
  // tower: dense grid of windows
  const tx = Math.floor(W * 0.08), tw = W - tx * 2;
  for (let y = 14; y < gTop - 14; y += 16) {
    for (let x = tx + 3; x < tx + tw - 6; x += 9) windowAt(ctx, { x, y, w: 4, h: 9 }, m, rng, 'rect', wins);
  }
  vline(ctx, tx, 0, gTop, STONE[3]); vline(ctx, tx + tw, 0, gTop, STONE[3]);
  cornice(ctx, W, 2, m, rng, true);
}

function paintFlatiron(ctx: Ctx, W: number, H: number, m: Mat, rng: Rng, wins: Win[]) {
  const GF = 60;
  const gTop = H - GF;
  wallFill(ctx, 0, gTop, W, GF, { ...m, kind: 'stone', base: STONE.slice(4) }, rng);
  // the rounded prow at the start of the facade (u = 0)
  const prow = 18;
  for (let x = 0; x < prow; x++) {
    const sh = 0.55 + 0.45 * (x / prow);
    vline(ctx, x, 0, H, shade(STONE[6], sh));
  }
  for (let y = 20; y < gTop - 10; y += 24) for (let x = 3; x < prow - 3; x += 6) windowAt(ctx, { x, y: y + 4, w: 3, h: 12 }, m, rng, 'rect', wins);
  const bay = 12;
  for (let y = 26; y < gTop - 12; y += 24) {
    const tri = Math.floor((y / gTop) * 3);
    for (let x = prow + 4; x < W - 6; x += bay) windowAt(ctx, { x, y, w: 5, h: tri === 1 ? 14 : 12 }, m, rng, tri === 0 && y < 60 ? 'arch' : 'rect', wins);
    if (tri !== 1) hline(ctx, prow, y - 4, W - prow, shade(m.base[1], 0.88));
  }
  // tripartite bands
  rect(ctx, prow, Math.floor(gTop * 0.33), W - prow, 4, STONE[7]);
  rect(ctx, prow, Math.floor(gTop * 0.82), W - prow, 4, STONE[7]);
  for (let b = 0; b < Math.floor((W - prow) / 30); b++) storefront(ctx, prow + 4 + b * 30, gTop + 6, 28, GF - 6, m, rng, wins);
  cornice(ctx, W, 2, m, rng, true);
  cornice(ctx, W, 14, m, rng, false);
}

function paintIndustrial(ctx: Ctx, W: number, H: number, m: Mat, style: FacadeStyle, rng: Rng, wins: Win[]) {
  const ford = style === 'ford';
  const fh = ford ? 48 : 40;
  const floors = Math.max(1, Math.floor((H - 16) / fh));
  const bay = ford ? 26 : 22;
  const nb = Math.floor(W / bay);
  for (let f = 0; f < floors; f++) {
    const y = H - (f + 1) * fh + 6;
    for (let b = 0; b < nb; b++) {
      const x = b * bay + 3;
      if (style === 'warehouse' && rng.chance(0.5)) continue;
      // multi-pane factory window
      const ww = bay - 6, wh = fh - (ford ? 10 : 16);
      rect(ctx, x - 1, y - 1, ww + 2, wh + 2, m.trim[0]);
      rect(ctx, x, y, ww, wh, S[2]);
      for (let yy = 0; yy < wh; yy++) for (let xx = 0; xx < ww; xx++) {
        if (xx % 4 === 0 || yy % 4 === 0) px(ctx, x + xx, y + yy, S[0]);
        else if ((xx + yy * 3) % 11 === 0) px(ctx, x + xx, y + yy, S[5]);
        else if (rng.chance(0.03)) px(ctx, x + xx, y + yy, S[4]);
      }
      rect(ctx, x - 1, y + wh + 1, ww + 2, 2, m.trim[1]);
      wins.push({ x, y, w: ww, h: wh });
    }
    hline(ctx, 0, y + fh - 6, W, shade(m.base[1], 0.75));
  }
  // pilasters
  for (let b = 0; b <= nb; b++) rect(ctx, b * bay - 1, 10, 3, H - 10, shade(m.base[1], 1.15));
  // loading doors at ground level
  if (style === 'warehouse') for (let b = 1; b < nb; b += 4) { rect(ctx, b * bay + 2, H - 34, bay - 4, 34, S[1]); for (let y = H - 34; y < H; y += 3) hline(ctx, b * bay + 2, y, bay - 4, S[3]); }
  // big painted name
  const name = ford ? 'HIGHLAND PARK WORKS' : style === 'warehouse' ? rng.pick(['STORAGE & CARTAGE', 'COLD STORAGE', 'FREIGHT DEPOT']) : rng.pick(['MOTOR CAR CO.', 'CARRIAGE WORKS', 'STOVE WORKS', 'PARTS & BODIES', 'FOUNDRY', 'SPRING CO.']);
  const sc = textWidth(name, 3) < W - 10 ? 3 : 2;
  rect(ctx, 0, 2, W, 12 + sc * 2, shade(m.base[1], 0.6));
  textCentered(ctx, name, W / 2, 5, S[11], sc);
  if (ford) {
    // repeat name along the long frontage
    for (let x = W / 6; x < W; x += W / 3) textCentered(ctx, 'MODEL T', x, 9 + sc * 5, S[9], 2);
  }
  // sawtooth roof hint
  for (let x = 0; x < W; x += 12) for (let i = 0; i < 6; i++) hline(ctx, x + i, i, 12 - i * 2, S[2]);
  void mix;
}

function paintStands(ctx: Ctx, W: number, H: number, rng: Rng) {
  ctx.clearRect(0, 0, W, H);
  // striped canvas roof on posts, tiers of spectators, bunting rail
  const roofH = 14;
  rect(ctx, 0, 0, W, roofH, S[2]);
  for (let x = 0; x < W; x += 8) for (let y = 2; y < roofH; y++) hline(ctx, x, y, 4, S[10 - (y >> 2)]);
  hline(ctx, 0, roofH, W, S[1]);
  for (let x = 0; x < W; x += 6) { for (let i = 0; i < 3; i++) hline(ctx, x + i, roofH + 1 + i, 6 - i * 2, (x / 6) % 2 ? S[11] : S[3]); }
  rect(ctx, 0, roofH + 4, W, H - roofH - 4, S[1]);
  const tiers = Math.floor((H - roofH - 20) / 10);
  for (let t = 0; t < tiers; t++) {
    const y = roofH + 8 + t * 10;
    rect(ctx, 0, y + 8, W, 2, S[4]);
    for (let x = 1; x < W - 2; x += 3) {
      if (rng.chance(0.08)) continue;
      const body = rng.pick([S[1], S[2], S[3], S[7], S[9], S[10]]);
      rect(ctx, x, y + 3, 2, 5, body);
      px(ctx, x, y + 1, S[9]); px(ctx, x + 1, y + 1, S[9]); px(ctx, x, y + 2, S[8]);
      if (rng.chance(0.5)) hline(ctx, x - 1, y, 4, rng.chance(0.3) ? S[10] : S[0]);
      if (rng.chance(0.12)) { vline(ctx, x + 2, y - 3, 3, S[11]); }
      if (rng.chance(0.04)) { rect(ctx, x + 2, y - 4, 3, 2, S[12]); }
    }
  }
  for (let x = 0; x < W; x += 40) rect(ctx, x, roofH, 2, H - roofH, S[0]);
  rect(ctx, 0, H - 10, W, 10, S[3]);
  for (let x = 0; x < W; x += 3) vline(ctx, x, H - 10, 10, S[2]);
  hline(ctx, 0, H - 10, W, S[6]);
  shading(ctx, W, H);
}

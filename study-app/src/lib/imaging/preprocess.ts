/**
 * Photo cleanup before any reading happens. Pure functions over RGBA pixel
 * buffers so they run in the browser (canvas) and in unit tests alike.
 *
 * Pipeline (see cleanPage):
 *   1. autoCrop        find the bright sheet of paper and crop to it
 *   2. estimateSkew    find the text-line angle with a projection profile
 *      rotate          straighten
 *   3. flattenLighting divide by a smooth background estimate, which removes
 *                      shadows, uneven lighting and most glare
 *   4. stretchContrast spread the tones so ink is dark and paper is white
 * Color is kept (highlighters and diagrams matter).
 */

export interface Img {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function createImg(width: number, height: number, fill = 255): Img {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i + 1] = data[i + 2] = fill;
    data[i + 3] = 255;
  }
  return { width, height, data };
}

export function toGray(img: Img): Float32Array {
  const g = new Float32Array(img.width * img.height);
  for (let i = 0, p = 0; p < g.length; i += 4, p++) {
    g[p] = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
  }
  return g;
}

/** Otsu's threshold over a grayscale buffer (0-255). */
export function otsu(gray: Float32Array): number {
  const hist = new Array(256).fill(0);
  for (const v of gray) hist[Math.max(0, Math.min(255, v | 0))]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

export function crop(img: Img, r: Rect): Img {
  const out = createImg(r.width, r.height);
  for (let y = 0; y < r.height; y++) {
    const src = ((r.y + y) * img.width + r.x) * 4;
    out.data.set(img.data.subarray(src, src + r.width * 4), y * r.width * 4);
  }
  return out;
}

/**
 * Finds the sheet of paper: the band of rows and columns that are mostly
 * bright. Returns null when there's no clear sheet (e.g. the photo is
 * already just the page, or the background is as bright as the paper).
 */
export function findPaper(img: Img): Rect | null {
  const gray = toGray(img);
  const t = otsu(gray);
  const { width: w, height: h } = img;
  // Need a real contrast between paper and background.
  let bright = 0;
  for (const v of gray) if (v > t) bright++;
  const brightFrac = bright / gray.length;
  if (brightFrac > 0.97 || brightFrac < 0.15) return null;

  const rowFrac = new Float32Array(h);
  const colFrac = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (gray[y * w + x] > t) {
        rowFrac[y]++;
        colFrac[x]++;
      }
    }
  }
  for (let y = 0; y < h; y++) rowFrac[y] /= w;
  for (let x = 0; x < w; x++) colFrac[x] /= h;

  const edge = (arr: Float32Array, fromStart: boolean) => {
    const n = arr.length;
    for (let k = 0; k < n; k++) {
      const i = fromStart ? k : n - 1 - k;
      if (arr[i] > 0.5) return i;
    }
    return fromStart ? 0 : n - 1;
  };
  const top = edge(rowFrac, true);
  const bottom = edge(rowFrac, false);
  const left = edge(colFrac, true);
  const right = edge(colFrac, false);
  const rect = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  const area = (rect.width * rect.height) / (w * h);
  // Too small means we probably latched onto something else; nearly full
  // means there's nothing to crop.
  if (area < 0.25 || area > 0.96) return null;
  return rect;
}

export function autoCrop(img: Img): { img: Img; rect: Rect | null } {
  const rect = findPaper(img);
  if (!rect) return { img, rect: null };
  // Shrink slightly so the background edge doesn't leak in.
  const m = Math.round(Math.min(rect.width, rect.height) * 0.01);
  const r = { x: rect.x + m, y: rect.y + m, width: rect.width - 2 * m, height: rect.height - 2 * m };
  return { img: crop(img, r), rect: r };
}

/** Bilinear rotation about the center; corners fill with white. */
export function rotate(img: Img, degrees: number): Img {
  if (Math.abs(degrees) < 0.05) return img;
  const { width: w, height: h, data } = img;
  const out = createImg(w, h);
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = w / 2;
  const cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Inverse map destination -> source.
      const dx = x - cx;
      const dy = y - cy;
      const sx = cos * dx + sin * dy + cx;
      const sy = -sin * dx + cos * dy + cy;
      if (sx < 0 || sy < 0 || sx >= w - 1 || sy >= h - 1) continue;
      const x0 = sx | 0;
      const y0 = sy | 0;
      const fx = sx - x0;
      const fy = sy - y0;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const p00 = data[(y0 * w + x0) * 4 + c];
        const p10 = data[(y0 * w + x0 + 1) * 4 + c];
        const p01 = data[((y0 + 1) * w + x0) * 4 + c];
        const p11 = data[((y0 + 1) * w + x0 + 1) * 4 + c];
        out.data[o + c] = p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) + p01 * (1 - fx) * fy + p11 * fx * fy;
      }
    }
  }
  return out;
}

/** Nearest-neighbour downscale of a gray buffer to at most `max` px wide. */
function downGray(gray: Float32Array, w: number, h: number, max: number) {
  const s = Math.min(1, max / Math.max(w, h));
  const nw = Math.max(1, Math.round(w * s));
  const nh = Math.max(1, Math.round(h * s));
  const out = new Float32Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      out[y * nw + x] = gray[Math.min(h - 1, Math.floor(y / s)) * w + Math.min(w - 1, Math.floor(x / s))];
    }
  }
  return { gray: out, width: nw, height: nh };
}

/**
 * Estimates text skew in degrees (-maxAngle..maxAngle). Rotating ink pixels so
 * text lines are horizontal makes the row-sum histogram spikiest, so we pick
 * the angle with the highest variance of row sums.
 */
export function estimateSkew(img: Img, maxAngle = 12, step = 0.5): number {
  const small = downGray(toGray(img), img.width, img.height, 500);
  const t = otsu(small.gray);
  const ink: [number, number][] = [];
  for (let y = 0; y < small.height; y++) {
    for (let x = 0; x < small.width; x++) {
      if (small.gray[y * small.width + x] < t - 10) ink.push([x - small.width / 2, y - small.height / 2]);
    }
  }
  if (ink.length < 50 || ink.length > small.gray.length * 0.5) return 0;
  const rows = small.height * 2;
  let bestAngle = 0;
  let bestScore = -1;
  for (let a = -maxAngle; a <= maxAngle + 1e-9; a += step) {
    const rad = (a * Math.PI) / 180;
    const sin = Math.sin(rad);
    const cos = Math.cos(rad);
    const hist = new Float32Array(rows);
    for (const [x, y] of ink) {
      // Row of this ink pixel after rotating by -a.
      const ry = Math.round(-sin * x + cos * y + small.height);
      if (ry >= 0 && ry < rows) hist[ry]++;
    }
    let mean = 0;
    for (const v of hist) mean += v;
    mean /= rows;
    let score = 0;
    for (const v of hist) score += (v - mean) ** 2;
    if (score > bestScore + 1e-6) {
      bestScore = score;
      bestAngle = a;
    }
  }
  return bestAngle;
}

/** Separable box blur on a gray buffer. */
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < w) {
          s += src[y * w + xx];
          n++;
        }
      }
      tmp[y * w + x] = s / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < h) {
          s += tmp[yy * w + x];
          n++;
        }
      }
      out[y * w + x] = s / n;
    }
  }
  return out;
}

/** Max filter (dilation): erases thin dark ink so only the paper's lighting remains. */
function maxFilter(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) m = Math.max(m, src[y * w + k]);
      tmp[y * w + x] = m;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) m = Math.max(m, tmp[k * w + x]);
      out[y * w + x] = m;
    }
  }
  return out;
}

/**
 * Removes shadows, uneven light and glare: estimate the paper's brightness at
 * every point (ink removed with a max filter, then smoothed) and divide it out.
 */
export function flattenLighting(img: Img): Img {
  const { width: w, height: h } = img;
  // Estimate the paper's color at every point, per channel, so a tinted
  // sheet or warm lamp light comes out white without bleaching ink colors.
  const channel = (c: number) => {
    const ch = new Float32Array(w * h);
    for (let i = 0, p = 0; p < ch.length; i += 4, p++) ch[p] = img.data[i + c];
    const small = downGray(ch, w, h, 160);
    return { bg: boxBlur(maxFilter(small.gray, small.width, small.height, 3), small.width, small.height, 4), sw: small.width, sh: small.height };
  };
  const bgs = [channel(0), channel(1), channel(2)];
  const { sw, sh } = bgs[0];
  const out = createImg(w, h);
  const sx = sw / w;
  const sy = sh / h;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(sh - 1.001, Math.max(0, y * sy - 0.5));
    const y0 = fy | 0;
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(sw - 1.001, Math.max(0, x * sx - 0.5));
      const x0 = fx | 0;
      const tx = fx - x0;
      const i00 = y0 * sw + x0;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const bg = bgs[c].bg;
        const b =
          bg[i00] * (1 - tx) * (1 - ty) + bg[i00 + 1] * tx * (1 - ty) + bg[i00 + sw] * (1 - tx) * ty + bg[i00 + sw + 1] * tx * ty;
        out.data[o + c] = img.data[o + c] * (255 / Math.max(40, b));
      }
    }
  }
  return out;
}

/** Percentile contrast stretch with a slight gamma so faint pencil gets darker. */
export function stretchContrast(img: Img, lowPct = 0.01, highPct = 0.9, gamma = 1.35): Img {
  const gray = toGray(img);
  const sorted = Float32Array.from(gray).sort();
  const lo = sorted[Math.floor(lowPct * (sorted.length - 1))];
  const hi = Math.max(lo + 30, sorted[Math.floor(highPct * (sorted.length - 1))]);
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const n = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
    lut[v] = Math.round(255 * n ** gamma);
  }
  const out = createImg(img.width, img.height);
  for (let i = 0; i < img.data.length; i += 4) {
    out.data[i] = lut[img.data[i]];
    out.data[i + 1] = lut[img.data[i + 1]];
    out.data[i + 2] = lut[img.data[i + 2]];
  }
  return out;
}

export interface CleanResult {
  img: Img;
  cropped: Rect | null;
  angle: number;
}

export function cleanPage(input: Img, opts: { crop?: boolean; straighten?: boolean } = {}): CleanResult {
  let img = input;
  let cropped: Rect | null = null;
  if (opts.crop !== false) {
    const c = autoCrop(img);
    img = c.img;
    cropped = c.rect;
  }
  img = flattenLighting(img);
  let angle = 0;
  if (opts.straighten !== false) {
    angle = estimateSkew(img);
    // Rotate by the opposite angle to level the text lines.
    if (Math.abs(angle) >= 0.5) img = rotate(img, -angle);
  }
  img = stretchContrast(img);
  return { img, cropped, angle };
}

/**
 * Rules for the compact sponsored banner, with no database, image library or
 * browser code, so the editor, the server and the tests share them.
 */

export const BANNER_HEADLINE_WORDS = 8;
export const BANNER_TEXT_CHARS = 40;
/** The banner crop: 16:5 (about 140px tall on a 448px phone column, 160px on desktop). */
export const BANNER_ASPECT = 16 / 5;
export const BANNER_WIDTHS = [800, 1600] as const;
export const MOTION_MAX_BYTES = 2 * 1024 * 1024;
/** Sponsored items never sit in the first this-many feed slots… */
export const AD_FIRST_SLOT = 3;
/** …and at most one appears in any run of this many items. */
export const AD_MIN_GAP = 8;

export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Check a banner headline and subtext; returns an error message or null. */
export function bannerCopyError(headline: string, text: string): string | null {
  if (wordCount(headline) > BANNER_HEADLINE_WORDS) return `Keep the banner headline to ${BANNER_HEADLINE_WORDS} words or fewer.`;
  if ([...text.trim()].length > BANNER_TEXT_CHARS) return `Keep the banner line to ${BANNER_TEXT_CHARS} characters or fewer.`;
  return null;
}

/** The banner's words: the sponsor's banner headline and line, or (until they write them) a shortened headline and body. */
export function bannerCopy(s: { bannerHeadline?: string | null; bannerText?: string | null; headline: string; body: string }): { headline: string; text: string } {
  const headline = s.bannerHeadline?.trim() || shortenWords(s.headline, BANNER_HEADLINE_WORDS);
  const text = s.bannerText?.trim() || (s.bannerHeadline?.trim() ? "" : shortenChars(s.body, BANNER_TEXT_CHARS));
  return { headline, text };
}

export function shortenWords(s: string, n: number) {
  const w = s.trim().split(/\s+/).filter(Boolean);
  return w.length <= n ? w.join(" ") : `${w.slice(0, n).join(" ").replace(/[,.;:!?-]+$/, "")}…`;
}
export function shortenChars(s: string, n: number) {
  const t = s.trim();
  if ([...t].length <= n) return t;
  const cut = [...t].slice(0, n - 1).join("");
  const sp = cut.lastIndexOf(" ");
  return `${(sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[,.;:!?-]+$/, "")}…`;
}

/** Clamp a focal point to 0..1 (default: the middle). */
export const clampFocal = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
};

/**
 * The largest `aspect` (w/h) rectangle inside a `srcW`×`srcH` image, centered
 * on the focal point (fx, fy in 0..1) as far as the edges allow.
 */
export function focalCrop(srcW: number, srcH: number, aspect: number, fx: number, fy: number) {
  let width = srcW;
  let height = Math.round(srcW / aspect);
  if (height > srcH) {
    height = srcH;
    width = Math.round(srcH * aspect);
  }
  const left = Math.round(Math.min(srcW - width, Math.max(0, clampFocal(fx) * srcW - width / 2)));
  const top = Math.round(Math.min(srcH - height, Math.max(0, clampFocal(fy) * srcH - height / 2)));
  return { left, top, width, height };
}

/** CSS object-position for the same focal point (used in previews before saving). */
export const focalPosition = (fx: number, fy: number) => `${Math.round(clampFocal(fx) * 100)}% ${Math.round(clampFocal(fy) * 100)}%`;

// ------------------------------------------------------------------ color

type RGB = [number, number, number];
const lum = ([r, g, b]: RGB) => {
  const f = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
export const contrast = (a: RGB, b: RGB) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
export const hex = ([r, g, b]: RGB) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
export const parseHex = (h: string): RGB | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** The app's blue, used when a sponsor has no image color yet. */
export const DEFAULT_ACCENT = "#2c68fa";

/**
 * A button color from an image's dominant color: saturated enough to feel like
 * the brand, then darkened step by step until white text on it passes WCAG AA
 * (4.5:1). Grays and near-blacks fall back to the app's blue.
 */
export function accessibleAccent(dominant: string | null | undefined): string {
  const rgb = dominant ? parseHex(dominant) : null;
  if (!rgb) return DEFAULT_ACCENT;
  const max = Math.max(...rgb), min = Math.min(...rgb);
  if (max - min < 28 || max < 40) return DEFAULT_ACCENT; // no real color to borrow
  let c: RGB = [...rgb] as RGB;
  for (let i = 0; i < 40 && contrast(c, [255, 255, 255]) < 4.5; i++) c = c.map((v) => v * 0.92) as RGB;
  return hex(c);
}

// ------------------------------------------------------------------ feed slots

/** Feed positions (0-based) that carry a sponsored item: the 4th, then every 10th (never in the first two, never closer than 8 apart). */
export const isAdSlot = (index: number) => index >= AD_FIRST_SLOT && index % 10 === 3;

/** True when a list of item kinds keeps the ad rules (none in the first two, at most one per 8 in a row). */
export function adSpacingOk(kinds: ("ad" | "item")[]) {
  if (kinds.slice(0, 2).includes("ad")) return false;
  let last = -Infinity;
  for (let i = 0; i < kinds.length; i++) {
    if (kinds[i] !== "ad") continue;
    if (i - last < AD_MIN_GAP) return false;
    last = i;
  }
  return true;
}

/** Whether motion may play: not for reduced motion, data saver, or slow connections. */
export function motionAllowed(env: { reducedMotion: boolean; saveData?: boolean; effectiveType?: string }) {
  if (env.reducedMotion || env.saveData) return false;
  return !["slow-2g", "2g", "3g"].includes(env.effectiveType ?? "");
}

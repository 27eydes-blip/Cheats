/**
 * The Gleyde mark: shared geometry and colours.
 *
 * A sharp Art Deco diamond around a medallion "G" with a fine sunburst.
 * Used by the on-page logo (components/GleydeMark.tsx), the favicon, the
 * Apple icon and the Open Graph image, so all of them match exactly.
 *
 * Coordinate system: viewBox "0 0 120 160", centre (60, 80).
 */

/** Champagne palette. Keep in sync with the tokens in app/globals.css. */
export const colors = {
  ink: "#0B0B0C",
  ivory: "#F2EFEA",
  champagne: "#D8C8A0",
  champagneLight: "#EFE3C4",
} as const;

/** Gradient stops for the mark (light → mid → light). */
export const markStops = [colors.champagneLight, colors.champagne, colors.champagneLight] as const;

export const DIAMOND = "M60 3 L117 80 L60 157 L3 80 Z";
export const RING = { cx: 60, cy: 80, r: 26 } as const;

/** The G: Cinzel SemiBold's glyph outlined to a path, centred on the ring. */
export const G_PATH =
  "M75.17 83.27V90.98Q74.1 92.38 72.02 93.78Q69.94 95.18 67 96.09Q64.06 97 60.32 97Q55.18 96.95 51.26 94.88Q47.34 92.8 45.16 88.99Q42.99 85.18 42.99 79.95Q42.99 74.82 45.14 70.99Q47.29 67.16 51.26 65.08Q55.23 63 60.51 63Q63.08 63 65.39 63.37Q67.7 63.75 69.64 64.38Q71.58 65.01 72.93 65.76L73.3 73.27H72.88Q72.04 70.24 70.38 68.39Q68.73 66.55 66.44 65.66Q64.15 64.77 61.49 64.77Q57.61 64.77 54.88 66.67Q52.15 68.56 50.7 71.99Q49.25 75.42 49.25 80.14Q49.25 84.72 50.63 88.1Q52.01 91.49 54.6 93.33Q57.19 95.18 60.74 95.23Q62.61 95.23 64.29 94.71Q65.97 94.2 67.35 93.19Q68.73 92.19 69.52 90.79L69.57 83.27Q69.57 81.17 67.19 81.17H66.44V80.7H78.21V81.17H77.51Q76.11 81.17 75.55 81.87Q75.12 82.38 75.17 83.27Z";

/**
 * 16 rays between the ring and the diamond, alternating long and short,
 * starting straight up and going clockwise.
 */
export const RAYS: string[] = Array.from({ length: 16 }, (_, i) => {
  const a = (i * Math.PI) / 8;
  const r1 = 31;
  const r2 = i % 2 === 0 ? 44 : 39;
  const p = (r: number) => `${(60 + r * Math.sin(a)).toFixed(2)} ${(80 - r * Math.cos(a)).toFixed(2)}`;
  return `M${p(r1)} L${p(r2)}`;
});

/** The whole mark as a standalone SVG string (for generated images). */
export function markSvg({ compact = false }: { compact?: boolean } = {}) {
  const [s0, s1, s2] = markStops;
  const rays = compact ? "" : `<path d="${RAYS.join(" ")}" stroke-width="0.7"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 160" fill="none">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="120" y2="160" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="${s0}"/><stop offset=".5" stop-color="${s1}"/><stop offset="1" stop-color="${s2}"/></linearGradient></defs>` +
    `<g stroke="url(#g)"><path d="${DIAMOND}" stroke-width="${compact ? 5 : 1.4}"/>${rays}` +
    `<circle cx="${RING.cx}" cy="${RING.cy}" r="${compact ? 31 : RING.r}" stroke-width="${compact ? 4.5 : 1.1}"/></g>` +
    `<path d="${G_PATH}" fill="url(#g)"/></svg>`;
}

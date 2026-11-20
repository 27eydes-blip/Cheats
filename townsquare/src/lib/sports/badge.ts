/**
 * Colors for the generated team badge (used whenever no licensed logo is
 * cached). Picks the text color with the best contrast against the team's
 * primary color, and an outline that keeps the badge visible on both the
 * dark and light themes. Pure, unit-tested.
 */
const hex = (h: string) => {
  const m = h.replace("#", "");
  const v = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
};
export function luminance(h: string) {
  const [r, g, b] = hex(h).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const DARK_BG = "#070b14";
const LIGHT_BG = "#ffffff";

export type BadgeColors = { fill: string; text: string; accent: string; ringDark: string; ringLight: string };

export function badgeColors(primary: string, secondary: string): BadgeColors {
  // Text: secondary if it reads well on the primary (≥4.5), else white or black, whichever is stronger
  // (one of the two always clears 4.5:1).
  const candidates = [secondary, "#ffffff", "#000000"];
  const text = contrast(secondary, primary) >= 4.5 ? secondary : candidates.slice(1).sort((a, b) => contrast(b, primary) - contrast(a, primary))[0];
  // Accent stripe: secondary unless it vanishes into the fill.
  const accent = contrast(secondary, primary) >= 1.4 ? secondary : text;
  // Outlines: needed when the fill is close to the page background.
  const ringDark = contrast(primary, DARK_BG) < 1.6 ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.12)";
  const ringLight = contrast(primary, LIGHT_BG) < 1.6 ? "rgba(10,18,34,0.45)" : "rgba(10,18,34,0.10)";
  return { fill: primary, text, accent, ringDark, ringLight };
}

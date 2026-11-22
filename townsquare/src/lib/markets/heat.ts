import type { Quote } from "./provider";
import type { Ticker } from "./universe";

/**
 * Client-safe math for the 3D heatmap: how tall and how bright each tile is,
 * how big it is in each mode, the sector averages, the biggest movers, and the
 * pointer tilt. No DOM, so it is easy to test.
 */

/** A move of this size or more gets the full height and glow. */
export const FULL_MOVE_PCT = 3;
/** Moves smaller than this read as flat (dim, no glow). */
export const FLAT_PCT = 0.1;
/** Tallest tile lift, in px of translateZ (desktop). */
export const MAX_LIFT_PX = 18;
/** Pointer tilt limit, in degrees. */
export const MAX_TILT_DEG = 3;

export type HeatMode = "change" | "cap";
export const HEAT_MODES: { key: HeatMode; label: string }[] = [
  { key: "change", label: "Day change" },
  { key: "cap", label: "Market cap" },
];

/** 0 (flat) to 1 (a move of 3% or more), on a square-root curve so small moves still show. */
export function magnitude(pct: number): number {
  const a = Math.abs(pct);
  if (!Number.isFinite(a) || a < FLAT_PCT) return 0;
  return Math.min(1, Math.sqrt(a / FULL_MOVE_PCT));
}

export type Glow = { m: number; dir: 1 | -1 | 0; lift: number; alpha: number; fill: string };

/**
 * Tile look for a move: direction, lift (px), glow strength (0 to 0.75), and a
 * fill dark enough that white text keeps WCAG AA contrast (checked in tests).
 */
export function glowFor(pct: number): Glow {
  const m = magnitude(pct);
  const dir = m === 0 ? 0 : pct > 0 ? 1 : -1;
  return { m, dir, lift: Math.round(m * MAX_LIFT_PX * 10) / 10, alpha: Math.round(m * 0.75 * 100) / 100, fill: tileFill(dir, m) };
}

const BASE = [16, 24, 40]; // #101828, the floor's tile color
const UP = [18, 140, 96];
const DOWN = [176, 38, 64];
/** Mix the base tile color toward green or red, never past 62%, so white text stays readable. */
export function tileFill(dir: 1 | -1 | 0, m: number): string {
  const to = dir > 0 ? UP : dir < 0 ? DOWN : BASE;
  const k = dir === 0 ? 0 : 0.22 + 0.4 * m;
  const c = BASE.map((b, i) => Math.round(b + (to[i] - b) * k));
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

/** WCAG contrast ratio of white text on an "rgb(r g b)" color. */
export function whiteContrast(rgb: string): number {
  const [r, g, b] = (rgb.match(/\d+/g) ?? ["0", "0", "0"]).map((v) => Number(v) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (L + 0.05);
}

/** Grid span of a tile: equal tiles for Day change, sized by company size for Market cap. */
export function tileSpan(size: Ticker["size"], mode: HeatMode): { cols: number; rows: number } {
  if (mode === "change") return { cols: 1, rows: 1 };
  return size === 3 ? { cols: 2, rows: 2 } : size === 2 ? { cols: 2, rows: 1 } : { cols: 1, rows: 1 };
}

/** Average move of a sector's quoted stocks (null when none are quoted). */
export function sectorAverage(list: Ticker[], quotes: Record<string, Pick<Quote, "changePct"> | undefined>): number | null {
  const v = list.map((t) => quotes[t.symbol]?.changePct).filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** The `n` biggest movers either way (they get a thin pulsing outline). */
export function topMovers(quotes: Pick<Quote, "symbol" | "changePct">[], n = 3): Set<string> {
  return new Set([...quotes].filter((q) => Math.abs(q.changePct) >= FLAT_PCT).sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, n).map((q) => q.symbol));
}

/** Pointer position inside the heatmap (0..1 each way) to a tilt, at most ±3° each way. */
export function tiltFrom(x: number, y: number): { rx: number; ry: number } {
  const cx = Math.min(1, Math.max(0, x)) - 0.5;
  const cy = Math.min(1, Math.max(0, y)) - 0.5;
  return { rx: Math.round(-cy * 2 * MAX_TILT_DEG * 100) / 100, ry: Math.round(cx * 2 * MAX_TILT_DEG * 100) / 100 };
}

/** "▲ +1.23%" / "▼ -0.40%" / "■ 0.00%" — the arrow means color is never the only signal. */
export const moveText = (pct: number) => `${pct >= FLAT_PCT ? "▲" : pct <= -FLAT_PCT ? "▼" : "■"} ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;

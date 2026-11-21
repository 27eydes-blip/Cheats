import type { Lean } from "./outlets";

/**
 * Coverage spread: which sides of the spectrum are covering a story.
 * Left = Left + Lean Left, Center = Center, Right = Lean Right + Right, using
 * the approximate outlet ratings. Unrated outlets (sports, tech) count toward
 * the total but not the shares. Each outlet counts once per story.
 */
export type Side = "left" | "center" | "right";
export const SIDE_LABEL: Record<Side, string> = { left: "Left", center: "Center", right: "Right" };
export const sideOf = (l: Lean | null | undefined): Side | null => (!l ? null : l === "Left" || l === "Lean Left" ? "left" : l === "Center" ? "center" : "right");

export type CoverageFlag = { kind: "lopsided" | "missing"; side: Side; text: string };
export type Coverage = { total: number; rated: number; left: number; center: number; right: number; unrated: number; shares: Record<Side, number>; flag: CoverageFlag | null };

/** Below this many rated outlets the spread is shown but never flagged: too few to say anything. */
export const MIN_RATED_FOR_FLAG = 4;
export const LOPSIDED_SHARE = 0.7;
export const MISSING_SHARE = 0.1;

export function computeCoverage(outlets: { lean: Lean | null }[]): Coverage {
  const c = { left: 0, center: 0, right: 0, unrated: 0 };
  for (const o of outlets) {
    const s = sideOf(o.lean);
    if (s) c[s]++;
    else c.unrated++;
  }
  const rated = c.left + c.center + c.right;
  const shares = { left: rated ? c.left / rated : 0, center: rated ? c.center / rated : 0, right: rated ? c.right / rated : 0 };
  return { total: outlets.length, rated, ...c, shares, flag: coverageFlag(shares, rated) };
}

/**
 * Neutral, factual flags. Only Left and Right are flagged (Center-heavy
 * coverage is normal for wire-driven news):
 *  - "Mostly covered by Right-leaning outlets" when one side has 70%+ of the
 *    rated outlets;
 *  - otherwise "Few Left-leaning outlets covering this" when a side has 10%
 *    or less and there are at least 5 rated outlets.
 */
export function coverageFlag(shares: Record<Side, number>, rated: number): CoverageFlag | null {
  if (rated < MIN_RATED_FOR_FLAG) return null;
  for (const side of ["left", "right"] as const) {
    if (shares[side] >= LOPSIDED_SHARE) return { kind: "lopsided", side, text: `Mostly covered by ${SIDE_LABEL[side]}-leaning outlets` };
  }
  if (rated >= 5) {
    for (const side of ["left", "right"] as const) {
      if (shares[side] <= MISSING_SHARE) return { kind: "missing", side, text: `Few ${SIDE_LABEL[side]}-leaning outlets covering this` };
    }
  }
  return null;
}

export const EMPTY_COVERAGE: Coverage = { total: 0, rated: 0, left: 0, center: 0, right: 0, unrated: 0, shares: { left: 0, center: 0, right: 0 }, flag: null };

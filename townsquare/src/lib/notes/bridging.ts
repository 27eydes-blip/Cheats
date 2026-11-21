/**
 * Bridging score for context notes.
 *
 * The question it answers: "Do people who usually DISAGREE with each other
 * both find this note helpful?" A note that only one side likes stays hidden,
 * however many votes it gets.
 *
 * Step 1, find viewpoints. We fit a one-dimensional matrix factorization over
 * everyone's past ratings (note ratings, plus agree/disagree stances on
 * stories and dispatches, which helps before there are many notes):
 *
 *     rating(u, i) ≈ μ + b_u + b_i + f_u × f_i
 *
 *   b_u   how generous rater u is overall
 *   b_i   how well item i is received by everyone (the "bridging" part)
 *   f_u   where rater u sits on the main axis of disagreement
 *   f_i   which side of that axis item i appeals to
 *
 * Fitting is alternating ridge regression (each step is a 2×2 linear solve),
 * deterministic, and fast: 50 rounds over tens of thousands of ratings take
 * milliseconds. Intercepts are regularized more strongly than factors, so
 * one-sided enthusiasm is explained by f_u × f_i rather than by b_i. The
 * rater factors are then scaled to standard deviation 1.
 *
 * Step 2, group raters. Raters with at least MIN_RATER_RATINGS ratings and
 * |f_u| ≥ GROUP_MARGIN join group A (f_u < 0) or group B (f_u > 0). Raters
 * near the middle, or with too little history, still rate, but don't count
 * toward the cross-group test.
 *
 * Step 3, publish only notes with cross-group agreement. Helpful = 1,
 * Somewhat helpful = 0.5, Not helpful = 0. A note is published when:
 *   - it has at least MIN_RATINGS ratings from grouped raters,
 *   - each group has at least MIN_PER_GROUP raters, and
 *   - each group's average is at least PUBLISH_AT (0.6), and
 *   - its intercept b_i is not negative (it isn't liked less than average).
 * A published note stays published until a group's average drops below
 * KEEP_AT (0.5) or b_i drops below -0.05, so a note doesn't flicker on and
 * off with each new rating. A note both groups rate at or below 0.3 is marked
 * "not helpful".
 */
export const MIN_RATINGS = 5;
export const MIN_PER_GROUP = 2;
export const PUBLISH_AT = 0.6;
export const KEEP_AT = 0.5;
export const NOT_HELPFUL_AT = 0.3;
export const MIN_RATER_RATINGS = 3;
export const GROUP_MARGIN = 0.25;
const LAMBDA_B = 2.0;
const LAMBDA_F = 0.3;
const ROUNDS = 50;

export type Obs = { rater: string; item: string; value: number };
export type Model = { mu: number; raterB: Map<string, number>; raterF: Map<string, number>; itemB: Map<string, number>; itemF: Map<string, number>; raterN: Map<string, number> };

/** Deterministic small starting factor from the id (so results don't change from run to run). */
function seed(id: string) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (((h >>> 0) % 2000) / 1000 - 1) * 0.1;
}

/** Ridge regression of y on [1, x]: returns (intercept, slope). */
function solve(ys: number[], xs: number[], lb: number, lf: number): [number, number] {
  let n = 0, sx = 0, sxx = 0, sy = 0, sxy = 0;
  for (let k = 0; k < ys.length; k++) {
    n++;
    sx += xs[k];
    sxx += xs[k] * xs[k];
    sy += ys[k];
    sxy += xs[k] * ys[k];
  }
  const a = n + lb, b = sx, c = sx, d = sxx + lf;
  const det = a * d - b * c || 1e-9;
  return [(d * sy - b * sxy) / det, (a * sxy - c * sy) / det];
}

export function factorize(obs: Obs[]): Model {
  const raters = new Map<string, Obs[]>();
  const items = new Map<string, Obs[]>();
  for (const o of obs) {
    (raters.get(o.rater) ?? raters.set(o.rater, []).get(o.rater)!).push(o);
    (items.get(o.item) ?? items.set(o.item, []).get(o.item)!).push(o);
  }
  const mu0 = obs.length ? obs.reduce((s, o) => s + o.value, 0) / obs.length : 0;
  let mu = mu0;
  const raterB = new Map([...raters.keys()].map((k) => [k, 0]));
  const raterF = new Map([...raters.keys()].map((k) => [k, seed(k)]));
  const itemB = new Map([...items.keys()].map((k) => [k, 0]));
  const itemF = new Map([...items.keys()].map((k) => [k, seed(`i${k}`)]));
  for (let round = 0; round < ROUNDS; round++) {
    for (const [i, os] of items) {
      const [b, f] = solve(os.map((o) => o.value - mu - raterB.get(o.rater)!), os.map((o) => raterF.get(o.rater)!), LAMBDA_B, LAMBDA_F);
      itemB.set(i, b);
      itemF.set(i, f);
    }
    for (const [u, os] of raters) {
      const [b, f] = solve(os.map((o) => o.value - mu - itemB.get(o.item)!), os.map((o) => itemF.get(o.item)!), LAMBDA_B, LAMBDA_F);
      raterB.set(u, b);
      raterF.set(u, f);
    }
    if (obs.length) mu = obs.reduce((s, o) => s + o.value - raterB.get(o.rater)! - itemB.get(o.item)! - raterF.get(o.rater)! * itemF.get(o.item)!, 0) / obs.length;
  }
  // Scale rater factors to unit spread (item factors inversely), so GROUP_MARGIN means the same thing at any size.
  const fs = [...raterF.values()];
  const mean = fs.reduce((a, b) => a + b, 0) / (fs.length || 1);
  const sd = Math.sqrt(fs.reduce((a, b) => a + (b - mean) ** 2, 0) / (fs.length || 1)) || 1;
  for (const [k, v] of raterF) raterF.set(k, (v - mean) / sd);
  for (const [k, v] of itemF) itemF.set(k, v * sd);
  return { mu, raterB, raterF, itemB, itemF, raterN: new Map([...raters].map(([k, v]) => [k, v.length])) };
}

export type Group = -1 | 0 | 1;
export function raterGroup(m: Model, rater: string): Group {
  const f = m.raterF.get(rater);
  if (f === undefined || (m.raterN.get(rater) ?? 0) < MIN_RATER_RATINGS || Math.abs(f) < GROUP_MARGIN) return 0;
  return f < 0 ? -1 : 1;
}

export type NoteStatus = "needs_ratings" | "published" | "not_helpful";
export type NoteVerdict = { status: NoteStatus; intercept: number; factor: number; grouped: number; groups: { a: { n: number; avg: number }; b: { n: number; avg: number } } };

/** Decide a note's status from its ratings, given the fitted model and its current status. */
export function judgeNote(m: Model, noteItem: string, ratings: { rater: string; value: number }[], current: NoteStatus): NoteVerdict {
  const acc = { a: { n: 0, sum: 0 }, b: { n: 0, sum: 0 } };
  for (const r of ratings) {
    const g = raterGroup(m, r.rater);
    if (g === 0) continue;
    const k = g < 0 ? "a" : "b";
    acc[k].n++;
    acc[k].sum += r.value;
  }
  const avg = (x: { n: number; sum: number }) => (x.n ? x.sum / x.n : 0);
  const groups = { a: { n: acc.a.n, avg: avg(acc.a) }, b: { n: acc.b.n, avg: avg(acc.b) } };
  const grouped = acc.a.n + acc.b.n;
  const intercept = m.itemB.get(noteItem) ?? 0;
  const factor = m.itemF.get(noteItem) ?? 0;
  const enough = grouped >= MIN_RATINGS && groups.a.n >= MIN_PER_GROUP && groups.b.n >= MIN_PER_GROUP;
  let status: NoteStatus = "needs_ratings";
  if (enough && current === "published" && groups.a.avg >= KEEP_AT && groups.b.avg >= KEEP_AT && intercept >= -0.05) status = "published";
  else if (enough && groups.a.avg >= PUBLISH_AT && groups.b.avg >= PUBLISH_AT && intercept >= 0) status = "published";
  else if (grouped >= MIN_RATINGS && groups.a.avg <= NOT_HELPFUL_AT && groups.b.avg <= NOT_HELPFUL_AT && (groups.a.n + groups.b.n) > 0) status = "not_helpful";
  return { status, intercept, factor, grouped, groups };
}

export const VALUE = { helpful: 1, somewhat: 0.5, not_helpful: 0 } as const;

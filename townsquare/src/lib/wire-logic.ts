import type { TeamView } from "./sports/teams";

/**
 * The "Latest" ticker's rules, with no database or browser code so the server
 * and the client agree (and tests can check them directly).
 */
export type WireItem = {
  text: string;
  href: string | null;
  at: number;
  /** Section or kind ("Politics", "Live", "Breaking"…), used for screen readers. */
  label?: string;
  /** The outlet (or "WorldNet" for the newsroom's own alerts). */
  source?: string | null;
  /** Set by the server (isBreaking); callers that leave it out can pass label "Breaking" or "Alert". */
  breaking?: boolean;
  teams?: TeamView[];
};

/** How long each headline stays up (and the progress line's length). */
export const ROTATE_MS = 6_000;
/** With reduced motion: a slower, unanimated swap. */
export const ROTATE_REDUCED_MS = 8_000;
/** A live story counts as breaking while its newest update is this fresh. */
export const BREAKING_FRESH_MS = 30 * 60_000;
/** Never flag more than this many items at once, so "Breaking" keeps its meaning. */
export const MAX_BREAKING = 3;

export type BreakingInput = {
  /** The Control Room alert level, when the item is the newsroom's banner. */
  bannerLevel?: "breaking" | "alert" | "info" | null;
  /** The story's status, when the item is a story. */
  storyStatus?: "live" | "developing" | "ended" | null;
  at: number;
};

/**
 * Breaking means: the newsroom's banner set to Breaking or Alert, or a live
 * story with an update in the last 30 minutes. Developing and ended stories,
 * "Update"-level banners, and stale live stories are not breaking.
 */
export function isBreaking(x: BreakingInput, now: number): boolean {
  if (x.bannerLevel) return x.bannerLevel === "breaking" || x.bannerLevel === "alert";
  return x.storyStatus === "live" && now - x.at >= -60_000 && now - x.at <= BREAKING_FRESH_MS;
}

/** Breaking items jump to the front (newest first, at most 3); the rest follow newest first. Duplicate links are dropped. */
export function orderWire<T extends WireItem>(items: T[]): T[] {
  const seen = new Set<string>();
  const uniq = items.filter((it) => {
    const k = it.href ?? `t:${it.text}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const flag = (it: T) => it.breaking ?? (it.label === "Breaking" || it.label === "Alert");
  const breaking = uniq.filter(flag).sort((a, b) => b.at - a.at);
  const capped = breaking.slice(0, MAX_BREAKING).map((it) => ({ ...it, breaking: true }));
  const rest = [...breaking.slice(MAX_BREAKING).map((it) => ({ ...it, breaking: false })), ...uniq.filter((it) => !flag(it)).map((it) => ({ ...it, breaking: false }))].sort((a, b) => b.at - a.at);
  return [...capped, ...rest];
}

/** "now", "2m ago", "3h ago", "2d ago". */
export function relTime(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

/** Where to go after headline `i` of `n`. */
export const nextIndex = (i: number, n: number) => (n ? (i + 1) % n : 0);

/** When a new list arrives: a new breaking item takes the stage at once; otherwise stay on the same headline if it's still there. */
export function indexAfterUpdate(prev: WireItem[], next: WireItem[], current: number): number {
  const lead = next[0];
  if (lead?.breaking && !prev.some((p) => (p.href ?? p.text) === (lead.href ?? lead.text) && p.breaking)) return 0;
  const cur = prev[current];
  const j = cur ? next.findIndex((n) => (n.href ?? n.text) === (cur.href ?? cur.text)) : -1;
  return j >= 0 ? j : 0;
}

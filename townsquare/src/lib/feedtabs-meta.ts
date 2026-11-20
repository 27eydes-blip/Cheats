/** Home feed tabs (client-safe): parsing the ?tab= value and topic labels. */
export const TOPIC_LABEL: Record<string, string> = { politics: "Politics", markets: "Markets", sports: "Sports", tech: "Tech", world: "World", culture: "Culture", national: "National" };
export const DEFAULT_TOPIC_TABS = ["politics", "markets", "sports", "tech", "world"];
export const MAX_FEED_TABS = 12;

export type HomeTab = { kind: "foryou" } | { kind: "friends" } | { kind: "topic"; key: string } | { kind: "team"; key: string };

/** `/?tab=friends`, `/?tab=t-politics`, `/?tab=team-nfl-kc`; anything else is For You. */
export function parseHomeTab(raw: string | undefined | null): HomeTab {
  if (raw === "friends" || raw === "following") return { kind: "friends" };
  if (raw?.startsWith("t-") && raw.slice(2) in TOPIC_LABEL) return { kind: "topic", key: raw.slice(2) };
  if (raw?.startsWith("team-") && /^[a-z0-9-]{3,24}$/.test(raw.slice(5))) return { kind: "team", key: raw.slice(5) };
  return { kind: "foryou" };
}

export const tabParam = (t: HomeTab) => (t.kind === "foryou" ? "" : t.kind === "friends" ? "friends" : t.kind === "topic" ? `t-${t.key}` : `team-${t.key}`);
export const tabHref = (t: HomeTab) => (t.kind === "foryou" ? "/" : `/?tab=${tabParam(t)}`);

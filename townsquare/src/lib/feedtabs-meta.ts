/**
 * Home feed tabs (client-safe). The home page has two feed tabs: For You and
 * Friends. Topics and teams have their own pages (/topics/<slug>, /sports/<id>);
 * old ?tab=t-… and ?tab=team-… links are redirected there.
 */
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
/** URL slug of a topic page. Topic keys follow the feed's topics; "markets" is the Business section, "national" is U.S. */
export const TOPIC_SLUG: Record<string, string> = { politics: "politics", world: "world", markets: "business", tech: "tech", sports: "sports", culture: "culture", national: "us" };
export const SLUG_TOPIC: Record<string, string> = Object.fromEntries(Object.entries(TOPIC_SLUG).map(([k, v]) => [v, k]));
/** Page label of a topic (Business, not Markets, because Markets is the stock board). */
export const TOPIC_PAGE_LABEL: Record<string, string> = { ...TOPIC_LABEL, markets: "Business", national: "U.S." };
export const topicHref = (topic: string) => `/topics/${TOPIC_SLUG[topic] ?? topic}`;
export const tabHref = (t: HomeTab) => (t.kind === "foryou" ? "/" : t.kind === "friends" ? "/?tab=friends" : t.kind === "topic" ? topicHref(t.key) : `/sports/${t.key}`);

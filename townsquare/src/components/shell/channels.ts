import { topicHref } from "@/lib/feedtabs-meta";

/**
 * The one top nav: topics (each opens its own filtered page), then Markets,
 * Live and Desks. The home feed itself only has For You and Friends tabs.
 */
export const CHANNELS = [
  { key: "politics", label: "Politics", href: topicHref("politics") },
  { key: "world", label: "World", href: topicHref("world") },
  { key: "markets", label: "Business", href: topicHref("markets") },
  { key: "tech", label: "Tech", href: topicHref("tech") },
  { key: "sports", label: "Sports", href: topicHref("sports") },
  { key: "culture", label: "Culture", href: topicHref("culture") },
  { key: "stockboard", label: "Markets", href: "/markets" },
  { key: "live", label: "Live", href: "/live" },
  { key: "desks", label: "Desks", href: "/communities" },
] as const;

export const CHANNEL_KEYS = CHANNELS.map((c) => c.key);
/** Index where the topic list ends (a thin divider separates topics from Markets, Live, Desks). */
export const TOPICS_END = 6;

export function activeChannel(path: string, _c?: string | null) {
  void _c;
  const t = CHANNELS.find((c) => c.href.startsWith("/topics/") && (path === c.href || path.startsWith(c.href + "/")));
  if (t) return t.key;
  if (path.startsWith("/sports")) return "sports";
  if (path.startsWith("/live")) return "live";
  if (path.startsWith("/markets")) return "stockboard";
  if (path.startsWith("/communities") || path.startsWith("/c/")) return "desks";
  return null;
}

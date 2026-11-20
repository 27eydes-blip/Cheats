/** The channel dial under the masthead. National channels filter the Front Page. */
export const CHANNELS = [
  { key: "front", label: "Front Page", href: "/" },
  { key: "Politics", label: "Politics", href: "/?c=Politics" },
  { key: "World", label: "World", href: "/?c=World" },
  { key: "Business", label: "Business", href: "/?c=Business" },
  { key: "Tech", label: "Tech", href: "/?c=Tech" },
  { key: "Sports", label: "Sports", href: "/?c=Sports" },
  { key: "Culture", label: "Culture", href: "/?c=Culture" },
  { key: "live", label: "Live", href: "/live" },
  { key: "desks", label: "Desks", href: "/communities" },
] as const;

export const CHANNEL_KEYS = CHANNELS.map((c) => c.key);

export function activeChannel(path: string, c: string | null) {
  if (path === "/") return c && CHANNELS.some((x) => x.key === c) ? c : "front";
  if (path.startsWith("/live")) return "live";
  if (path.startsWith("/communities") || path.startsWith("/c/")) return "desks";
  return null;
}

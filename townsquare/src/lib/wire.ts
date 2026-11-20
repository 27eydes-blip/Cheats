import { all } from "./db";
import { getBanner } from "./moderation";
import { listStories } from "./news";
import type { TeamView } from "./sports/teams";

export type WireEntry = { text: string; href: string | null; at: number; label?: string; teams?: TeamView[] };

/** The breaking ticker's items: the admin's breaking item first, then the latest updates from live stories. */
export function wireItems(): WireEntry[] {
  const banner = getBanner();
  const live = listStories(8).filter((x) => x.status === "live");
  const updates = live.length
    ? all<{ body: string; story_key: string; created_at: number }>(
        `SELECT body, story_key, created_at FROM story_updates WHERE story_key IN (${live.map(() => "?").join(",")}) ORDER BY created_at DESC LIMIT 6`,
        live.map((x) => x.key),
      )
    : [];
  return [
    ...(banner ? [{ text: banner.text, href: banner.url, at: banner.setAt, label: banner.level === "info" ? "Update" : banner.level === "alert" ? "Alert" : "Breaking" }] : []),
    ...updates.map((u) => {
      const st = live.find((x) => x.key === u.story_key);
      return { text: u.body, href: `/news/story/${u.story_key}`, at: u.created_at, label: st?.section ?? "Live", teams: st?.teams.slice(0, 2) };
    }),
  ];
}

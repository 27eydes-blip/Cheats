import { all, get } from "./db";
import { demoEnabled } from "./newsroom/settings";
import { getBanner } from "./moderation";
import { listStories } from "./news";
import type { TeamView } from "./sports/teams";

export type WireEntry = { text: string; href: string | null; at: number; label?: string; teams?: TeamView[] };

/** The breaking ticker's items: the admin's breaking item first, then the latest updates from live stories. */
export function wireItems(): WireEntry[] {
  const b0 = getBanner();
  // A banner pointing at a fictional demo story is demo content too: hide it when demo data is off.
  const demoKey = b0?.url?.match(/^\/news\/story\/([^/?#]+)/)?.[1];
  const banner = b0 && demoKey && !demoEnabled() && get("SELECT 1 FROM stories WHERE key = ? AND origin = 'demo'", [decodeURIComponent(demoKey)]) ? null : b0;
  const top = listStories(12);
  const live = top.filter((x) => x.status === "live");
  // Real headlines: the most important stories still developing, newest coverage first.
  const real = top.filter((x) => x.origin === "real" && x.status !== "ended" && x.outlets >= 2).slice(0, 6);
  const updates = live.length
    ? all<{ body: string; story_key: string; created_at: number }>(
        `SELECT body, story_key, created_at FROM story_updates WHERE story_key IN (${live.map(() => "?").join(",")}) ORDER BY created_at DESC LIMIT 6`,
        live.map((x) => x.key),
      )
    : [];
  return [
    ...(banner ? [{ text: banner.text, href: banner.url, at: banner.setAt, label: banner.level === "info" ? "Update" : banner.level === "alert" ? "Alert" : "Breaking" }] : []),
    ...real.map((st) => ({ text: st.title, href: `/news/story/${st.key}`, at: st.updatedAt, label: st.category ?? "News", teams: st.teams.slice(0, 2) })),
    ...updates.map((u) => {
      const st = live.find((x) => x.key === u.story_key);
      return { text: u.body, href: `/news/story/${u.story_key}`, at: u.created_at, label: st?.section ?? "Live", teams: st?.teams.slice(0, 2) };
    }),
  ];
}

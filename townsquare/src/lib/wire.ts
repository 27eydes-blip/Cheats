import { all, get } from "./db";
import { demoEnabled } from "./newsroom/settings";
import { getBanner } from "./moderation";
import { listStories } from "./news";
import { isBreaking, orderWire, type WireItem } from "./wire-logic";

export type WireEntry = WireItem;

/**
 * The "Latest" ticker's items: the newsroom's banner, the most important real
 * stories, and the newest updates from live stories, each with its outlet.
 * Breaking items (see wire-logic.ts) are flagged and moved to the front.
 */
export function wireItems(t = Date.now()): WireEntry[] {
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
  return orderWire([
    ...(banner ? [{ text: banner.text, href: banner.url, at: banner.setAt, label: banner.level === "info" ? "Update" : banner.level === "alert" ? "Alert" : "Breaking", source: "WorldNet", breaking: isBreaking({ bannerLevel: banner.level as "breaking" | "alert" | "info", at: banner.setAt }, t) }] : []),
    ...real.map((st) => ({ text: st.title, href: `/news/story/${st.key}`, at: st.updatedAt, label: st.category ?? "News", source: st.source, teams: st.teams.slice(0, 2), breaking: isBreaking({ storyStatus: st.status, at: st.updatedAt }, t) })),
    ...updates.map((u) => {
      const st = live.find((x) => x.key === u.story_key);
      return { text: u.body, href: `/news/story/${u.story_key}`, at: u.created_at, label: st?.section ?? "Live", source: st?.source ?? "WorldNet", teams: st?.teams.slice(0, 2), breaking: isBreaking({ storyStatus: "live", at: u.created_at }, t) };
    }),
  ]);
}

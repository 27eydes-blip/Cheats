import { all, now } from "./db";
import { hiddenAuthorsSql, hiddenParams, hydrate, type PostView } from "./posts";
import { liveEvents, listStories, type LiveEventView, type StorySummary } from "./news";

export type RundownItem =
  | { kind: "story"; at: number; story: StorySummary }
  | { kind: "take"; at: number; post: PostView; amplifiedBy?: string }
  | { kind: "show"; at: number; event: LiveEventView }
  | { kind: "saved"; at: number; post: PostView };

export type Rundown = { now: RundownItem[]; next: RundownItem[]; later: RundownItem[]; earlier: RundownItem[] };

const HOUR = 3_600_000;

/**
 * Your personal lineup, ordered like a TV rundown:
 * Now (live stories + the last 2 hours from people you follow), Next (shows in
 * the next 6 hours + developing stories), Later today (later shows + what you
 * saved), Earlier (older takes from people you follow).
 */
export function rundown(viewerId: string): Rundown {
  const t = now();
  const stories = listStories(20, { viewerId });
  const events = liveEvents();

  const followed = all<{ id: string; created_at: number; via: string | null }>(
    `SELECT * FROM (
       SELECT p.id, p.created_at, NULL via FROM posts p
       WHERE p.author_id IN (SELECT followee_id FROM follows WHERE follower_id = ?) AND p.reply_to_id IS NULL
         AND p.deleted_at IS NULL AND p.removed_at IS NULL AND p.community_id IS NULL
       UNION ALL
       SELECT r.post_id, r.created_at, u.display_name FROM reposts r JOIN users u ON u.id = r.user_id JOIN posts p ON p.id = r.post_id
       WHERE r.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ?) AND p.deleted_at IS NULL AND p.removed_at IS NULL
     ) f WHERE (SELECT author_id FROM posts WHERE id = f.id) NOT IN (${hiddenAuthorsSql})
     ORDER BY f.created_at DESC LIMIT 40`,
    [viewerId, viewerId, ...hiddenParams(viewerId)],
  );
  const posts = new Map(hydrate(followed.map((f) => f.id), viewerId).map((p) => [p.id, p]));
  const seen = new Set<string>();
  const takes: RundownItem[] = [];
  for (const f of followed) {
    const post = posts.get(f.id);
    if (!post || post.gone || seen.has(f.id)) continue;
    seen.add(f.id);
    takes.push({ kind: "take", at: f.created_at, post, amplifiedBy: f.via ?? undefined });
  }

  const savedRows = all<{ post_id: string; created_at: number }>("SELECT post_id, created_at FROM bookmarks WHERE user_id = ? ORDER BY created_at DESC LIMIT 5", [viewerId]);
  const savedPosts = new Map(hydrate(savedRows.map((r) => r.post_id), viewerId).map((p) => [p.id, p]));
  const saved: RundownItem[] = savedRows.flatMap((r) => {
    const post = savedPosts.get(r.post_id);
    return post && !post.gone ? [{ kind: "saved" as const, at: r.created_at, post }] : [];
  });

  const endOfDay = new Date(t);
  endOfDay.setHours(23, 59, 59, 999);
  const horizon = Math.max(endOfDay.getTime(), t + 12 * HOUR);

  const byTime = (a: RundownItem, b: RundownItem) => b.at - a.at;
  return {
    now: [
      ...stories.filter((s) => s.status === "live").map((s): RundownItem => ({ kind: "story", at: s.updatedAt, story: s })),
      ...events.filter((e) => e.isLive).map((e): RundownItem => ({ kind: "show", at: e.startsAt, event: e })),
      ...takes.filter((x) => x.at > t - 2 * HOUR),
    ].sort(byTime),
    next: [
      ...events.filter((e) => !e.isLive && e.startsAt <= t + 6 * HOUR).map((e): RundownItem => ({ kind: "show", at: e.startsAt, event: e })),
      ...stories.filter((s) => s.status === "developing").slice(0, 3).map((s): RundownItem => ({ kind: "story", at: s.updatedAt, story: s })),
    ],
    later: [
      ...events.filter((e) => e.startsAt > t + 6 * HOUR && e.startsAt <= horizon).map((e): RundownItem => ({ kind: "show", at: e.startsAt, event: e })),
      ...saved,
    ],
    earlier: takes.filter((x) => x.at <= t - 2 * HOUR).slice(0, 20),
  };
}

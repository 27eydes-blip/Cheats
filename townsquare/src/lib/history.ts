import { all, get, run } from "./db";
import { listStories, type StorySummary } from "./news";
import { hydrate, type PostView } from "./posts";

export type HistoryItem = { at: number } & ({ kind: "story"; story: StorySummary } | { kind: "post"; post: PostView });

/** Stories and dispatches you opened, most recent first (only you can see this). */
export function recentHistory(userId: string, limit = 60): HistoryItem[] {
  const rows = all<{ target_type: "post" | "story"; target_id: string; at: number }>(
    `SELECT target_type, target_id, max(created_at) at FROM engagement_events WHERE user_id = ? AND kind = 'click'
     GROUP BY target_type, target_id ORDER BY at DESC LIMIT ?`,
    [userId, limit],
  );
  const posts = new Map(hydrate(rows.filter((r) => r.target_type === "post").map((r) => r.target_id), userId).map((p) => [p.id, p]));
  const stories = new Map(rows.some((r) => r.target_type === "story") ? listStories(200, { viewerId: userId }).map((s) => [s.key, s]) : []);
  return rows.flatMap((r): HistoryItem[] => {
    if (r.target_type === "story") {
      const story = stories.get(r.target_id);
      return story ? [{ kind: "story", at: r.at, story }] : [];
    }
    const post = posts.get(r.target_id);
    return post && !post.gone ? [{ kind: "post", at: r.at, post }] : [];
  });
}

/** Clear History: the events stay as anonymous counts, but are no longer tied to you. */
export function clearHistory(userId: string) {
  run("UPDATE engagement_events SET user_id = NULL WHERE user_id = ?", [userId]);
}

export const historyCount = (userId: string) => get<{ n: number }>("SELECT count(DISTINCT target_type || target_id) n FROM engagement_events WHERE user_id = ? AND kind = 'click'", [userId])?.n ?? 0;

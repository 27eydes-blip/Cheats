import { all, get, now } from "./db";

export type CreatorStats = {
  days: number;
  dispatches: number; responsesIn: number; reactionsIn: number; relaysIn: number; views: number; newFollowers: number;
  top: { id: string; body: string; createdAt: number; reactions: number; responses: number; relays: number; views: number }[];
};

/** Creator Hub numbers for the last `days` days: what you posted and how people responded. */
export function creatorStats(userId: string, days = 28): CreatorStats {
  const since = now() - days * 86_400_000;
  const n = (sql: string, p: unknown[]) => get<{ n: number }>(sql, p as never)?.n ?? 0;
  const mine = "SELECT id FROM posts WHERE author_id = ? AND deleted_at IS NULL";
  const top = all<{ id: string; body: string; created_at: number; reactions: number; responses: number; relays: number; views: number }>(
    `SELECT p.id, p.body, p.created_at,
       (SELECT count(*) FROM reactions r WHERE r.post_id = p.id) reactions,
       (SELECT count(*) FROM posts c WHERE c.reply_to_id = p.id AND c.deleted_at IS NULL) responses,
       (SELECT count(*) FROM reposts x WHERE x.post_id = p.id) relays,
       (SELECT count(*) FROM engagement_events e WHERE e.target_type = 'post' AND e.target_id = p.id AND e.kind = 'view') views
     FROM posts p WHERE p.author_id = ? AND p.deleted_at IS NULL AND p.removed_at IS NULL AND p.reply_to_id IS NULL AND p.created_at > ?
     ORDER BY (reactions * 2 + responses * 3 + relays * 4 + views * 0.1) DESC, p.created_at DESC LIMIT 5`,
    [userId, since],
  );
  return {
    days,
    dispatches: n("SELECT count(*) n FROM posts WHERE author_id = ? AND deleted_at IS NULL AND reply_to_id IS NULL AND created_at > ?", [userId, since]),
    responsesIn: n(`SELECT count(*) n FROM posts WHERE reply_to_id IN (${mine}) AND author_id != ? AND deleted_at IS NULL AND created_at > ?`, [userId, userId, since]),
    reactionsIn: n(`SELECT count(*) n FROM reactions WHERE post_id IN (${mine}) AND created_at > ?`, [userId, since]),
    relaysIn: n(`SELECT count(*) n FROM reposts WHERE post_id IN (${mine}) AND created_at > ?`, [userId, since]),
    views: n(`SELECT count(*) n FROM engagement_events WHERE target_type = 'post' AND kind = 'view' AND target_id IN (${mine}) AND created_at > ?`, [userId, since]),
    newFollowers: n("SELECT count(*) n FROM follows WHERE followee_id = ? AND created_at > ?", [userId, since]),
    top: top.map((r) => ({ id: r.id, body: r.body, createdAt: r.created_at, reactions: r.reactions, responses: r.responses, relays: r.relays, views: r.views })),
  };
}

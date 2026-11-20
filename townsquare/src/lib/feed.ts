import { LIMITS } from "@/config";
import { all, get, now } from "./db";
import { hiddenAuthorsSql, hiddenParams, hydrate, type FeedItem } from "./posts";
import { toMini, type UserMini } from "./users";

export type FeedPage = { items: FeedItem[]; nextCursor: string | null };
export type FeedKind = "following" | "foryou";

type Row = { post_id: string; sort_at: number; k: string; reposter_id: string | null };

const LIVE = "p.deleted_at IS NULL AND p.removed_at IS NULL AND p.community_id IS NULL";

function parseCursor(c: string | null | undefined): [number, string] {
  if (!c) return [Number.MAX_SAFE_INTEGER, "~"];
  const i = c.indexOf("_");
  return [Number(c.slice(0, i)) || 0, c.slice(i + 1)];
}

function toItems(rows: Row[], viewerId: string | null): FeedItem[] {
  const posts = new Map(hydrate(rows.map((r) => r.post_id), viewerId).map((p) => [p.id, p]));
  const reposterIds = [...new Set(rows.flatMap((r) => (r.reposter_id ? [r.reposter_id] : [])))];
  const reposters = new Map<string, UserMini>(
    reposterIds.length
      ? all<{ id: string; handle: string; display_name: string; avatar_media_id: string | null; verified: number }>(
          `SELECT id, handle, display_name, avatar_media_id, verified FROM users WHERE id IN (${reposterIds.map(() => "?").join(",")})`,
          reposterIds,
        ).map((u) => [u.id, toMini(u)])
      : [],
  );
  const seen = new Set<string>();
  const out: FeedItem[] = [];
  for (const r of rows) {
    const post = posts.get(r.post_id);
    // The same post reposted by several people shows once per page.
    if (!post || post.gone || seen.has(r.post_id)) continue;
    seen.add(r.post_id);
    out.push({ key: `${r.sort_at}_${r.k}`, post, repostedBy: r.reposter_id ? (reposters.get(r.reposter_id) ?? null) : null });
  }
  return out;
}

/** Following: newest first, no ranking. Your posts, posts by people you follow, and their reposts. */
export function followingFeed(viewerId: string, cursor?: string | null, limit: number = LIMITS.feedPage): FeedPage {
  const [at, k] = parseCursor(cursor);
  const rows = all<Row>(
    `SELECT * FROM (
       SELECT p.id post_id, p.created_at sort_at, p.id k, NULL reposter_id FROM posts p
       WHERE ${LIVE} AND p.reply_to_id IS NULL
         AND p.author_id IN (SELECT followee_id FROM follows WHERE follower_id = ? UNION SELECT ?)
       UNION ALL
       SELECT r.post_id, r.created_at, r.user_id || r.post_id, r.user_id FROM reposts r JOIN posts p ON p.id = r.post_id
       WHERE ${LIVE} AND r.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ?)
     ) f
     WHERE (f.sort_at < ? OR (f.sort_at = ? AND f.k < ?))
       AND (SELECT author_id FROM posts WHERE id = f.post_id) NOT IN (${hiddenAuthorsSql})
     ORDER BY f.sort_at DESC, f.k DESC LIMIT ?`,
    [viewerId, viewerId, viewerId, at, at, k, ...hiddenParams(viewerId), limit],
  );
  const items = toItems(rows, viewerId);
  const last = rows.at(-1);
  return { items, nextCursor: rows.length === limit && last ? `${last.sort_at}_${last.k}` : null };
}

/**
 * For You: recent top-level posts ranked by engagement, recency, and whether
 * you follow the author. Simple on purpose; the "algorithm slider" (Stage 3)
 * will scale `followBoost` and the decay exponent.
 */
export function forYouFeed(viewerId: string | null, cursor?: string | null, limit: number = LIMITS.feedPage): FeedPage {
  const offset = Math.max(0, Number(cursor) || 0);
  const t = now();
  const candidates = all<{ id: string; author_id: string; created_at: number; like_count: number; reply_count: number; repost_count: number; quote_count: number; followed: number; has_media: number }>(
    `SELECT p.id, p.author_id, p.created_at, p.like_count, p.reply_count, p.repost_count, p.quote_count,
       EXISTS (SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = p.author_id) followed,
       EXISTS (SELECT 1 FROM media WHERE post_id = p.id) has_media
     FROM posts p JOIN users u ON u.id = p.author_id
     WHERE ${LIVE} AND p.reply_to_id IS NULL AND u.status = 'active' AND p.created_at > ?
       AND p.author_id NOT IN (${hiddenAuthorsSql})
     ORDER BY p.created_at DESC LIMIT 1000`,
    [viewerId ?? "", t - 7 * 86_400_000, ...hiddenParams(viewerId)],
  );
  const followBoost = 1.6;
  const scored = candidates
    .map((p) => {
      const engagement = 1 + p.like_count + 2 * p.repost_count + 1.5 * p.reply_count + 2 * p.quote_count;
      const ageHours = (t - p.created_at) / 3_600_000;
      let score = Math.log2(1 + engagement) / Math.pow(ageHours + 2, 1.2);
      if (p.followed) score *= followBoost;
      if (p.has_media) score *= 1.1;
      if (p.author_id === viewerId) score *= 0.3;
      return { id: p.id, author: p.author_id, score };
    })
    .sort((a, b) => b.score - a.score);

  // Diversity: no more than 2 posts in a row from the same author.
  const ordered: typeof scored = [];
  const deferred: typeof scored = [];
  for (const s of scored) {
    const tail = ordered.slice(-2);
    if (tail.length === 2 && tail.every((x) => x.author === s.author)) deferred.push(s);
    else ordered.push(s);
  }
  ordered.push(...deferred);

  const page = ordered.slice(offset, offset + limit);
  const items = toItems(
    page.map((s) => ({ post_id: s.id, sort_at: 0, k: s.id, reposter_id: null })),
    viewerId,
  ).map((it, i) => ({ ...it, key: `fy${offset + i}_${it.post.id}` }));
  return { items, nextCursor: offset + limit < ordered.length ? String(offset + limit) : null };
}

/** How many newer Following items exist (for the "new posts" pill). */
export function newFollowingCount(viewerId: string, since: number): number {
  return (
    get<{ n: number }>(
      `SELECT (SELECT count(*) FROM posts p WHERE ${LIVE} AND p.reply_to_id IS NULL AND p.created_at > ? AND p.author_id != ?
                 AND p.author_id IN (SELECT followee_id FROM follows WHERE follower_id = ?))
            + (SELECT count(*) FROM reposts r WHERE r.created_at > ? AND r.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ?)) n`,
      [since, viewerId, viewerId, since, viewerId],
    )?.n ?? 0
  );
}

export function newForYouCount(viewerId: string | null, since: number): number {
  return get<{ n: number }>(`SELECT count(*) n FROM posts p WHERE ${LIVE} AND p.reply_to_id IS NULL AND p.created_at > ? AND p.author_id != ?`, [since, viewerId ?? ""])?.n ?? 0;
}

export type ProfileTab = "posts" | "replies" | "media" | "likes";

export function profileFeed(userId: string, tab: ProfileTab, viewerId: string | null, cursor?: string | null, limit: number = LIMITS.feedPage): FeedPage {
  const [at, k] = parseCursor(cursor);
  let rows: Row[];
  if (tab === "likes") {
    rows = all<Row>(
      `SELECT l.post_id, l.created_at sort_at, l.post_id k, NULL reposter_id FROM likes l JOIN posts p ON p.id = l.post_id
       WHERE l.user_id = ? AND ${LIVE} AND (l.created_at < ? OR (l.created_at = ? AND l.post_id < ?))
       ORDER BY l.created_at DESC, l.post_id DESC LIMIT ?`,
      [userId, at, at, k, limit],
    );
  } else if (tab === "posts") {
    rows = all<Row>(
      `SELECT * FROM (
         SELECT p.id post_id, p.created_at sort_at, p.id k, NULL reposter_id FROM posts p WHERE p.author_id = ? AND ${LIVE} AND p.reply_to_id IS NULL
         UNION ALL
         SELECT r.post_id, r.created_at, r.user_id || r.post_id, r.user_id FROM reposts r JOIN posts p ON p.id = r.post_id WHERE r.user_id = ? AND ${LIVE}
       ) f WHERE (f.sort_at < ? OR (f.sort_at = ? AND f.k < ?)) ORDER BY f.sort_at DESC, f.k DESC LIMIT ?`,
      [userId, userId, at, at, k, limit],
    );
  } else {
    const extra = tab === "replies" ? "AND p.reply_to_id IS NOT NULL" : "AND EXISTS (SELECT 1 FROM media m WHERE m.post_id = p.id)";
    rows = all<Row>(
      `SELECT p.id post_id, p.created_at sort_at, p.id k, NULL reposter_id FROM posts p
       WHERE p.author_id = ? AND ${LIVE} ${extra} AND (p.created_at < ? OR (p.created_at = ? AND p.id < ?))
       ORDER BY p.created_at DESC, p.id DESC LIMIT ?`,
      [userId, at, at, k, limit],
    );
  }
  const last = rows.at(-1);
  return { items: toItems(rows, viewerId), nextCursor: rows.length === limit && last ? `${last.sort_at}_${last.k}` : null };
}

export function bookmarksFeed(viewerId: string, cursor?: string | null, limit: number = LIMITS.feedPage): FeedPage {
  const [at, k] = parseCursor(cursor);
  const rows = all<Row>(
    `SELECT b.post_id, b.created_at sort_at, b.post_id k, NULL reposter_id FROM bookmarks b
     WHERE b.user_id = ? AND (b.created_at < ? OR (b.created_at = ? AND b.post_id < ?)) ORDER BY b.created_at DESC, b.post_id DESC LIMIT ?`,
    [viewerId, at, at, k, limit],
  );
  const last = rows.at(-1);
  return { items: toItems(rows, viewerId), nextCursor: rows.length === limit && last ? `${last.sort_at}_${last.k}` : null };
}

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Post search: hashtag queries use the tag index; other text uses a substring match (Postgres full-text later). */
export function searchPosts(q: string, viewerId: string | null, cursor?: string | null, limit: number = LIMITS.feedPage): FeedPage {
  const query = q.trim().slice(0, 100);
  if (!query) return { items: [], nextCursor: null };
  const [at, k] = parseCursor(cursor);
  const tag = /^#[\p{L}\p{N}_]+$/u.test(query) ? query.slice(1) : null;
  const terms = query.split(/\s+/).filter(Boolean).slice(0, 5);
  const where = tag
    ? "p.id IN (SELECT post_id FROM post_hashtags WHERE tag = ?)"
    : terms.map(() => "p.body LIKE ? ESCAPE '\\'").join(" AND ");
  const params = tag ? [tag.toLowerCase()] : terms.map((t) => `%${likeEscape(t)}%`);
  const rows = all<Row>(
    `SELECT p.id post_id, p.created_at sort_at, p.id k, NULL reposter_id FROM posts p
     WHERE ${LIVE} AND ${where} AND p.author_id NOT IN (${hiddenAuthorsSql})
       AND (p.created_at < ? OR (p.created_at = ? AND p.id < ?))
     ORDER BY p.created_at DESC, p.id DESC LIMIT ?`,
    [...params, ...hiddenParams(viewerId), at, at, k, limit],
  );
  const last = rows.at(-1);
  return { items: toItems(rows, viewerId), nextCursor: rows.length === limit && last ? `${last.sort_at}_${last.k}` : null };
}

export function searchUsers(q: string, viewerId: string | null, limit = 20) {
  const query = q.trim().replace(/^@/, "").slice(0, 50);
  if (!query) return [];
  const like = `%${likeEscape(query)}%`;
  const rows = all<{ id: string; handle: string; display_name: string; avatar_media_id: string | null; verified: number; bio: string }>(
    `SELECT u.id, u.handle, u.display_name, u.avatar_media_id, u.verified, u.bio FROM users u
     WHERE u.status != 'deleted' AND (u.handle LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\')
       AND u.id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = ?)
     ORDER BY (u.handle = ?) DESC, u.verified DESC,
       (SELECT count(*) FROM follows WHERE followee_id = u.id) DESC LIMIT ?`,
    [like, like, viewerId ?? "", query, limit],
  );
  const following = viewerId ? new Set(all<{ followee_id: string }>("SELECT followee_id FROM follows WHERE follower_id = ?", [viewerId]).map((r) => r.followee_id)) : new Set<string>();
  return rows.map((r) => ({ ...toMini(r), bio: r.bio, viewerFollows: following.has(r.id) }));
}

export type Trend = { tag: string; posts: number };

/** Hashtags with the most posts lately; widens the window when things are quiet. */
export function trending(limit = 10): Trend[] {
  for (const hours of [24, 72, 24 * 7, 24 * 30]) {
    const rows = all<{ tag: string; n: number }>(
      `SELECT h.tag, count(*) n FROM post_hashtags h JOIN posts p ON p.id = h.post_id
       WHERE h.created_at > ? AND ${LIVE} GROUP BY lower(h.tag) ORDER BY n DESC, max(h.created_at) DESC LIMIT ?`,
      [now() - hours * 3_600_000, limit],
    );
    if (rows.length >= Math.min(5, limit) || hours === 24 * 30) return rows.map((r) => ({ tag: r.tag.toLowerCase(), posts: r.n }));
  }
  return [];
}

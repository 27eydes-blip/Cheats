import { APP_SHORT } from "@/config";
import { all, get, now } from "./db";
import { hiddenAuthorsSql, hiddenParams, hydrate, type PostView } from "./posts";
import { toMini, type UserMini } from "./users";

/** Top-level Takes on a Story, newest first (Answers are shown inside debate cards). */
export function storyTakes(storyKey: string, viewerId: string | null, limit = 60): PostView[] {
  const ids = all<{ id: string }>(
    `SELECT p.id FROM posts p WHERE p.story_key = ? AND p.reply_to_id IS NULL AND p.deleted_at IS NULL AND p.removed_at IS NULL
     AND p.author_id NOT IN (${hiddenAuthorsSql}) ORDER BY p.created_at DESC LIMIT ?`,
    [storyKey, ...hiddenParams(viewerId), limit],
  ).map((r) => r.id);
  return hydrate(ids, viewerId);
}

/** Latest Takes across all Stories (Quick Takes tile). */
export function latestTakes(viewerId: string | null, limit = 6, storyOnly = true): PostView[] {
  const ids = all<{ id: string }>(
    `SELECT p.id FROM posts p JOIN users u ON u.id = p.author_id WHERE p.reply_to_id IS NULL AND p.deleted_at IS NULL AND p.removed_at IS NULL
     AND p.community_id IS NULL ${storyOnly ? "AND p.story_key IS NOT NULL" : ""} AND u.status = 'active'
     AND p.author_id NOT IN (${hiddenAuthorsSql}) ORDER BY p.created_at DESC LIMIT ?`,
    [...hiddenParams(viewerId), limit],
  ).map((r) => r.id);
  return hydrate(ids, viewerId);
}

export type Debate = { left: PostView; right: PostView; story: { key: string; title: string } | null; startedAt: number; endsAt: number };

/**
 * A debate is a Take and an Answer to it with the opposite stance. Each side's
 * "votes" are readers who agree with that Take; voting stays open for 24 hours.
 */
export function debates(viewerId: string | null, limit = 3, storyKey?: string, authorId?: string): Debate[] {
  const rows = all<{ l_id: string; r_id: string; at: number }>(
    `SELECT p.id l_id, r.id r_id, r.created_at at FROM posts r JOIN posts p ON p.id = r.reply_to_id
     WHERE r.stance IN ('agree','disagree') AND p.stance IN ('agree','disagree') AND r.stance != p.stance
       AND p.deleted_at IS NULL AND r.deleted_at IS NULL AND p.removed_at IS NULL AND r.removed_at IS NULL
       AND p.author_id != r.author_id ${storyKey ? "AND p.story_key = ?" : ""} ${authorId ? "AND (p.author_id = ? OR r.author_id = ?)" : ""}
       AND p.author_id NOT IN (${hiddenAuthorsSql}) AND r.author_id NOT IN (${hiddenAuthorsSql})
     ORDER BY r.created_at DESC LIMIT ?`,
    [...(storyKey ? [storyKey] : []), ...(authorId ? [authorId, authorId] : []), ...hiddenParams(viewerId), ...hiddenParams(viewerId), limit * 3],
  );
  const seen = new Set<string>();
  const out: Debate[] = [];
  for (const r of rows) {
    if (seen.has(r.l_id) || out.length >= limit) continue;
    seen.add(r.l_id);
    const [left, right] = hydrate([r.l_id, r.r_id], viewerId);
    if (!left || !right) continue;
    out.push({ left, right, story: left.story, startedAt: r.at, endsAt: r.at + 24 * 3_600_000 });
  }
  return out;
}

export type Voice = UserMini & {
  bio: string;
  joinedAt: number;
  takes: number;
  contextNotes: number;
  followers: number;
  viewerFollows: boolean;
};

/**
 * Voices: people worth hearing on a topic. Ranked by verified status, then by a
 * record of Context takes, then by output. The credibility line is built from these.
 */
export function voices(viewerId: string | null, limit = 4, section?: string): Voice[] {
  const v = viewerId ?? "";
  const rows = all<{ id: string; handle: string; display_name: string; avatar_media_id: string | null; verified: number; bio: string; created_at: number; takes: number; ctx: number; followers: number; follows: number }>(
    `SELECT u.id, u.handle, u.display_name, u.avatar_media_id, u.verified, u.bio, u.created_at,
       (SELECT count(*) FROM posts p WHERE p.author_id = u.id AND p.story_key IS NOT NULL AND p.deleted_at IS NULL ${section ? "AND p.story_key IN (SELECT key FROM stories WHERE section = ?)" : ""}) takes,
       (SELECT count(*) FROM posts p WHERE p.author_id = u.id AND p.stance = 'context' AND p.deleted_at IS NULL) ctx,
       (SELECT count(*) FROM follows f WHERE f.followee_id = u.id) followers,
       EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followee_id = u.id) follows
     FROM users u
     WHERE u.status = 'active' AND u.id != ? AND u.role != 'admin'
       AND u.id NOT IN (${hiddenAuthorsSql})
     ORDER BY u.verified DESC, ctx DESC, takes DESC, followers DESC LIMIT ?`,
    [...(section ? [section] : []), v, v, ...hiddenParams(viewerId), limit],
  );
  return rows.map((r) => ({
    ...toMini(r), bio: r.bio, joinedAt: r.created_at, takes: r.takes, contextNotes: r.ctx, followers: r.followers, viewerFollows: !!r.follows,
  }));
}

/** One-line credibility note for a Voice ("Verified · 2 yrs on World Net · 14 context notes"). */
export function credibility(v: { verified: boolean; joinedAt: number; contextNotes: number; takes: number }) {
  const years = (now() - v.joinedAt) / (365 * 86_400_000);
  const age = years >= 1 ? `${Math.floor(years)} yr${years >= 2 ? "s" : ""}` : `${Math.max(1, Math.round(years * 12))} mo`;
  return [v.verified ? "Verified" : null, `${age} on ${APP_SHORT}`, v.contextNotes ? `${v.contextNotes} context note${v.contextNotes === 1 ? "" : "s"}` : `${v.takes} takes`]
    .filter(Boolean)
    .join(" · ");
}

export function storyExists(key: string) {
  return !!get("SELECT 1 FROM stories WHERE key = ?", [key]);
}

/** Credibility stats for a byline page. */
export function bylineStats(userId: string) {
  return get<{ takes: number; ctx: number; answers: number; amplified: number }>(
    `SELECT (SELECT count(*) FROM posts WHERE author_id = ? AND story_key IS NOT NULL AND reply_to_id IS NULL AND deleted_at IS NULL) takes,
            (SELECT count(*) FROM posts WHERE author_id = ? AND stance = 'context' AND deleted_at IS NULL) ctx,
            (SELECT count(*) FROM posts WHERE author_id = ? AND reply_to_id IS NOT NULL AND deleted_at IS NULL AND community_id IS NULL) answers,
            (SELECT count(*) FROM reposts WHERE user_id = ?) amplified`,
    [userId, userId, userId, userId],
  )!;
}

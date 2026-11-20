import { LIMITS } from "@/config";
import { all, now } from "./db";
import { getBanner } from "./moderation";
import { listStories, type StorySummary } from "./news";
import { hiddenAuthorsSql, hiddenParams, hydrate, type PostView } from "./posts";
import { loadProfile, mutedTopics } from "./interests";
import { diversify, scoreCandidate, SECTION_TOPIC, type Activity, type Candidate, type Topic } from "./ranking";

export type ForYouItem =
  | { key: string; kind: "post"; post: PostView; repostedBy: null; reason?: string; topic: string | null; promoted?: boolean }
  | { key: string; kind: "story"; story: StorySummary; reason?: string; topic: string | null };
export type ForYouPage = { items: ForYouItem[]; nextCursor: string | null };

const H = 3_600_000;
/** Bucketed counts → representative ages for the scorer (6h / 24h / older). */
const ages = (n6: number, n24: number, nOld: number) => [...Array(n6).fill(3), ...Array(n24).fill(15), ...Array(nOld).fill(48)];
const ph = (n: number) => Array(n).fill("?").join(",");

type Agg = { id: string; n6: number; n24: number; nOld: number };
function buckets(sql: string, params: unknown[]): Map<string, Agg> {
  return new Map(all<Agg>(sql, params as never).map((r) => [r.id, r]));
}
const fromAgg = (a?: Agg) => (a ? ages(a.n6, a.n24, a.nOld) : []);
const BUCKET = (col: string, t: number) =>
  `SUM(CASE WHEN ${col} > ${t - 6 * H} THEN 1 ELSE 0 END) n6, SUM(CASE WHEN ${col} <= ${t - 6 * H} AND ${col} > ${t - 24 * H} THEN 1 ELSE 0 END) n24, SUM(CASE WHEN ${col} <= ${t - 24 * H} THEN 1 ELSE 0 END) nOld`;

/**
 * Build, score, diversify and page the For You feed: recent top-level
 * Dispatches plus Stories. Logged-out and brand-new viewers have an empty
 * interest profile, which makes this a trending + breaking mix.
 */
export function forYou(viewerId: string | null, cursor?: string | null, limit: number = LIMITS.feedPage, opts: { excludeStory?: string } = {}): ForYouPage {
  const t = now();
  const offset = Math.max(0, Number(cursor) || 0);
  const profile = loadProfile(viewerId);
  const muted = new Set(mutedTopics(viewerId));
  const dismissed = new Set(
    viewerId ? all<{ k: string }>("SELECT target_type || ':' || target_id k FROM feed_dismissals WHERE user_id = ?", [viewerId]).map((r) => r.k) : [],
  );

  // ---- posts
  const posts = all<{ id: string; author_id: string; created_at: number; section: string | null; promoted: number }>(
    `SELECT p.id, p.author_id, p.created_at, s.section, p.promoted FROM posts p
     JOIN users u ON u.id = p.author_id LEFT JOIN stories s ON s.key = p.story_key
     WHERE p.deleted_at IS NULL AND p.removed_at IS NULL AND p.community_id IS NULL AND p.reply_to_id IS NULL
       AND u.status = 'active' AND p.created_at > ? AND p.author_id NOT IN (${hiddenAuthorsSql})
       ${viewerId ? "AND (u.is_private = 0 OR p.author_id = ? OR EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followee_id = p.author_id))" : "AND u.is_private = 0"}
     ORDER BY p.created_at DESC LIMIT 400`,
    [t - 7 * 24 * H, ...hiddenParams(viewerId), ...(viewerId ? [viewerId, viewerId] : [])],
  ).filter((p) => !dismissed.has(`post:${p.id}`));
  const ids = posts.map((p) => p.id);
  const q = ph(ids.length);
  const positive = ids.length ? buckets(`SELECT target_id id, ${BUCKET("created_at", t)} FROM (SELECT post_id target_id, created_at FROM likes WHERE post_id IN (${q}) UNION ALL SELECT post_id, created_at FROM reactions WHERE post_id IN (${q}) UNION ALL SELECT target_id, created_at FROM stances WHERE target_type = 'post' AND value = 'agree' AND target_id IN (${q})) GROUP BY target_id`, [...ids, ...ids, ...ids]) : new Map();
  const replies = ids.length ? buckets(`SELECT reply_to_id id, ${BUCKET("created_at", t)} FROM posts WHERE reply_to_id IN (${q}) AND deleted_at IS NULL GROUP BY reply_to_id`, ids) : new Map();
  const shares = ids.length ? buckets(`SELECT id, ${BUCKET("created_at", t)} FROM (SELECT post_id id, created_at FROM reposts WHERE post_id IN (${q}) UNION ALL SELECT quote_of_id, created_at FROM posts WHERE quote_of_id IN (${q}) UNION ALL SELECT target_id, created_at FROM engagement_events WHERE target_type = 'post' AND kind = 'share' AND target_id IN (${q})) GROUP BY id`, [...ids, ...ids, ...ids]) : new Map();
  const views = ids.length ? buckets(`SELECT target_id id, ${BUCKET("created_at", t)} FROM engagement_events WHERE target_type = 'post' AND kind = 'view' AND target_id IN (${q}) GROUP BY target_id`, ids) : new Map();
  const negative = new Map(ids.length ? all<{ id: string; n: number }>(`SELECT target_id id, count(*) n FROM stances WHERE target_type = 'post' AND value = 'disagree' AND target_id IN (${q}) GROUP BY target_id`, ids).map((r) => [r.id, r.n]) : []);
  const social = new Map(
    viewerId && ids.length
      ? all<{ id: string; n: number }>(
          `SELECT id, count(DISTINCT who) n FROM (
             SELECT post_id id, user_id who FROM likes WHERE post_id IN (${q})
             UNION ALL SELECT post_id, user_id FROM reactions WHERE post_id IN (${q})
             UNION ALL SELECT post_id, user_id FROM reposts WHERE post_id IN (${q})
             UNION ALL SELECT reply_to_id, author_id FROM posts WHERE reply_to_id IN (${q})
           ) WHERE who IN (SELECT followee_id FROM follows WHERE follower_id = ?) GROUP BY id`,
          [...ids, ...ids, ...ids, ...ids, viewerId],
        ).map((r) => [r.id, r.n])
      : [],
  );
  const tags = new Map<string, string[]>();
  if (ids.length) for (const r of all<{ post_id: string; tag: string }>(`SELECT post_id, tag FROM post_hashtags WHERE post_id IN (${q})`, ids)) tags.set(r.post_id, [...(tags.get(r.post_id) ?? []), r.tag]);

  const cands: (Candidate & { authorId: string | null; topic: Topic | null })[] = [];
  for (const p of posts) {
    const topic = p.section ? (SECTION_TOPIC[p.section] ?? "national") : null;
    if (topic && muted.has(topic)) continue;
    const activity: Activity = { positive: fromAgg(positive.get(p.id)), replies: fromAgg(replies.get(p.id)), shares: fromAgg(shares.get(p.id)), views: fromAgg(views.get(p.id)), negative: negative.get(p.id) ?? 0 };
    cands.push({ id: `post:${p.id}`, type: "post", ageHours: (t - p.created_at) / H, authorId: p.author_id, topic, tags: tags.get(p.id) ?? [], activity, socialProof: social.get(p.id) ?? 0, breaking: false, promoted: !!p.promoted });
  }

  // ---- stories
  const banner = getBanner();
  const stories = listStories(40, { viewerId }).filter((s) => !dismissed.has(`story:${s.key}`) && s.key !== opts.excludeStory);
  const skeys = stories.map((s) => s.key);
  const sq = ph(skeys.length);
  const sviews = skeys.length ? buckets(`SELECT target_id id, ${BUCKET("created_at", t)} FROM engagement_events WHERE target_type = 'story' AND kind IN ('view','click') AND target_id IN (${sq}) GROUP BY target_id`, skeys) : new Map();
  const stakes = skeys.length ? buckets(`SELECT story_key id, ${BUCKET("created_at", t)} FROM posts WHERE story_key IN (${sq}) AND deleted_at IS NULL GROUP BY story_key`, skeys) : new Map();
  const sagree = skeys.length ? buckets(`SELECT target_id id, ${BUCKET("created_at", t)} FROM stances WHERE target_type = 'story' AND value != 'disagree' AND target_id IN (${sq}) GROUP BY target_id`, skeys) : new Map();
  const storyMap = new Map<string, StorySummary>();
  for (const s of stories) {
    const topic = SECTION_TOPIC[s.section] ?? "national";
    if (muted.has(topic)) continue;
    storyMap.set(s.key, s);
    const breaking = s.status === "live" || !!banner?.url?.includes(`/news/story/${s.key}`);
    cands.push({
      id: `story:${s.key}`, type: "story", ageHours: (t - s.updatedAt) / H, authorId: null, topic, tags: s.tag ? [s.tag.toLowerCase()] : [],
      activity: { positive: fromAgg(sagree.get(s.key)), replies: fromAgg(stakes.get(s.key)), shares: [], views: fromAgg(sviews.get(s.key)), negative: s.split.disagree },
      socialProof: 0, breaking,
    });
  }

  const scored = cands.map((c) => ({ c, s: scoreCandidate(c, profile).score })).sort((a, b) => b.s - a.s).map((x) => x.c);
  const known = new Set(Object.entries(profile.topics).filter(([, w]) => (w ?? 0) > 0.5).map(([k]) => k));
  const ordered = diversify(scored, { maxRun: 2, exploreEvery: 6, knownTopics: known });
  const page = ordered.slice(offset, offset + limit);

  const postIds = page.filter((c) => c.type === "post").map((c) => c.id.slice(5));
  const views2 = new Map(hydrate(postIds, viewerId).map((p) => [p.id, p]));
  const items: ForYouItem[] = [];
  page.forEach((c, i) => {
    const reason = c.type === "story" && c.breaking ? "Breaking" : c.socialProof ? "People you follow are into this" : c.topic && known.has(c.topic) ? `Because you follow ${c.topic}` : c.topic && known.size && !known.has(c.topic) ? "Something new" : undefined;
    if (c.type === "post") {
      const post = views2.get(c.id.slice(5));
      if (post && !post.gone) items.push({ key: `fy${offset + i}_${post.id}`, kind: "post", post, repostedBy: null, reason: c.promoted ? undefined : reason, topic: c.topic, promoted: !!c.promoted });
    } else {
      const story = storyMap.get(c.id.slice(6));
      if (story) items.push({ key: `fy${offset + i}_${story.key}`, kind: "story", story, reason, topic: c.topic });
    }
  });
  return { items, nextCursor: offset + limit < ordered.length ? String(offset + limit) : null };
}

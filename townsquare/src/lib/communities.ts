import { AppError } from "./errors";
import { all, get, now, run, tx } from "./db";
import { hiddenAuthorsSql, hiddenParams, hydrate, type PostView } from "./posts";
import { rateLimit } from "./ratelimit";
import { assertCanAct, type UserRow } from "./users";

export type CommunityView = {
  id: string;
  slug: string;
  name: string;
  description: string;
  rules: string[];
  visibility: string;
  members: number;
  postsThisWeek: number;
  joined: boolean;
  role: string | null;
  createdAt: number;
};

type Row = { id: string; slug: string; name: string; description: string; rules: string; visibility: string; created_at: number; members: number; week: number; role: string | null };

const SELECT = `SELECT c.*, (SELECT count(*) FROM memberships m WHERE m.community_id = c.id AND m.role != 'banned') members,
  (SELECT count(*) FROM posts p WHERE p.community_id = c.id AND p.reply_to_id IS NULL AND p.created_at > ? AND p.deleted_at IS NULL) week,
  (SELECT role FROM memberships m WHERE m.community_id = c.id AND m.user_id = ?) role FROM communities c`;

function toView(r: Row): CommunityView {
  return {
    id: r.id, slug: r.slug, name: r.name, description: r.description, rules: JSON.parse(r.rules), visibility: r.visibility,
    members: r.members, postsThisWeek: r.week, joined: !!r.role && r.role !== "banned", role: r.role, createdAt: r.created_at,
  };
}

export function listCommunities(viewerId: string | null): CommunityView[] {
  return all<Row>(`${SELECT} WHERE c.visibility = 'public' OR EXISTS (SELECT 1 FROM memberships m WHERE m.community_id = c.id AND m.user_id = ?) ORDER BY members DESC`, [
    now() - 7 * 86_400_000, viewerId ?? "", viewerId ?? "",
  ]).map(toView);
}

export function getCommunity(slug: string, viewerId: string | null): CommunityView | null {
  const r = get<Row>(`${SELECT} WHERE c.slug = ?`, [now() - 7 * 86_400_000, viewerId ?? "", slug]);
  if (!r) return null;
  const v = toView(r);
  if (v.visibility !== "public" && !v.joined) return { ...v, description: "This community is private.", rules: [] };
  return v;
}

export function setMembership(user: UserRow, communityId: string, join: boolean) {
  assertCanAct(user);
  const c = get<{ visibility: string }>("SELECT visibility FROM communities WHERE id = ?", [communityId]);
  if (!c) throw new AppError("Community not found.", "not_found");
  const m = get<{ role: string }>("SELECT role FROM memberships WHERE community_id = ? AND user_id = ?", [communityId, user.id]);
  if (m?.role === "banned") throw new AppError("You're banned from this community.", "forbidden");
  if (join) {
    if (c.visibility !== "public") throw new AppError("This community is invite-only.");
    run("INSERT OR IGNORE INTO memberships (community_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)", [communityId, user.id, now()]);
  } else {
    if (m?.role === "owner") throw new AppError("Owners can't leave their own community.");
    run("DELETE FROM memberships WHERE community_id = ? AND user_id = ?", [communityId, user.id]);
  }
  return join;
}

export type CommunitySort = "hot" | "new" | "top";
export type CommunityPost = PostView & { score: number; myVote: number };

function withVotes(posts: PostView[], viewerId: string | null): CommunityPost[] {
  if (!posts.length) return [];
  const ids = posts.map((p) => p.id);
  const ph = ids.map(() => "?").join(",");
  const scores = new Map(all<{ id: string; score: number }>(`SELECT id, score FROM posts WHERE id IN (${ph})`, ids).map((r) => [r.id, r.score]));
  const mine = new Map(
    viewerId ? all<{ post_id: string; value: number }>(`SELECT post_id, value FROM community_votes WHERE user_id = ? AND post_id IN (${ph})`, [viewerId, ...ids]).map((r) => [r.post_id, r.value]) : [],
  );
  return posts.map((p) => ({ ...p, score: scores.get(p.id) ?? 0, myVote: mine.get(p.id) ?? 0 }));
}

/** Hot = score decayed by age (like Reddit), Top = score, New = time. */
export function communityPosts(communityId: string, sort: CommunitySort, viewerId: string | null): CommunityPost[] {
  const order =
    sort === "new" ? "p.created_at DESC" : sort === "top" ? "p.score DESC, p.created_at DESC" : "(p.score + p.reply_count * 0.5 + 1) / ((? - p.created_at) / 3600000.0 + 2) / ((? - p.created_at) / 3600000.0 + 2) DESC";
  const t = now();
  const ids = all<{ id: string }>(
    `SELECT p.id FROM posts p WHERE p.community_id = ? AND p.reply_to_id IS NULL AND p.deleted_at IS NULL AND p.removed_at IS NULL
     AND p.author_id NOT IN (${hiddenAuthorsSql}) ORDER BY ${order} LIMIT 50`,
    [communityId, ...hiddenParams(viewerId), ...(sort === "hot" ? [t, t] : [])],
  ).map((r) => r.id);
  return withVotes(hydrate(ids, viewerId), viewerId);
}

export type CommentNode = CommunityPost & { children: CommentNode[]; depth: number };

/** Every reply under a root post, as a tree sorted by score then age. */
export function commentTree(rootId: string, viewerId: string | null): CommentNode[] {
  const rows = all<{ id: string; reply_to_id: string }>(
    `SELECT p.id, p.reply_to_id FROM posts p WHERE p.root_id = ? AND p.removed_at IS NULL AND p.author_id NOT IN (${hiddenAuthorsSql})
     ORDER BY p.score DESC, p.created_at ASC LIMIT 500`,
    [rootId, ...hiddenParams(viewerId)],
  );
  const posts = new Map(withVotes(hydrate(rows.map((r) => r.id), viewerId), viewerId).map((p) => [p.id, p]));
  const nodes = new Map<string, CommentNode>();
  for (const r of rows) {
    const p = posts.get(r.id);
    if (p) nodes.set(r.id, { ...p, children: [], depth: 0 });
  }
  const roots: CommentNode[] = [];
  for (const r of rows) {
    const n = nodes.get(r.id);
    if (!n) continue;
    const parent = nodes.get(r.reply_to_id);
    if (parent) parent.children.push(n);
    else roots.push(n);
  }
  const setDepth = (list: CommentNode[], d: number) => list.forEach((n) => ((n.depth = d), setDepth(n.children, d + 1)));
  setDepth(roots, 0);
  return roots;
}

export function getCommunityPost(postId: string, viewerId: string | null): CommunityPost | null {
  const p = hydrate([postId], viewerId)[0];
  return p ? withVotes([p], viewerId)[0] : null;
}

/** Up/down vote on a community post or comment. value 0 clears the vote. Returns the new score. */
export function vote(user: UserRow, postId: string, value: -1 | 0 | 1): number {
  assertCanAct(user);
  const p = get<{ community_id: string | null; deleted_at: number | null; removed_at: number | null }>("SELECT community_id, deleted_at, removed_at FROM posts WHERE id = ?", [postId]);
  if (!p || !p.community_id || p.deleted_at || p.removed_at) throw new AppError("You can only vote on community posts.", "not_found");
  if (value !== 0) rateLimit("like", user.id);
  return tx(() => {
    const prev = get<{ value: number }>("SELECT value FROM community_votes WHERE user_id = ? AND post_id = ?", [user.id, postId])?.value ?? 0;
    if (value === 0) run("DELETE FROM community_votes WHERE user_id = ? AND post_id = ?", [user.id, postId]);
    else run("INSERT INTO community_votes (user_id, post_id, value, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, post_id) DO UPDATE SET value = excluded.value", [user.id, postId, value, now()]);
    run("UPDATE posts SET score = score + ? WHERE id = ?", [value - prev, postId]);
    return get<{ score: number }>("SELECT score FROM posts WHERE id = ?", [postId])!.score;
  });
}

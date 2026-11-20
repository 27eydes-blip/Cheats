import { LIMITS } from "@/config";
import { AppError } from "./errors";
import { all, get, newId, now, run, tx } from "./db";
import { rateLimit } from "./ratelimit";
import { spamCheck } from "./spam";
import { charCount, cleanText, extractHashtags, extractLinks, extractMentions } from "./text";
import { assertCanAct, mediaUrl, toMini, userById, type UserMini, type UserRow } from "./users";
import { pollSchema } from "./validate";
import { notify } from "./notifications";

export type PollView = {
  id: string;
  closesAt: number;
  closed: boolean;
  total: number;
  myVote: string | null;
  options: { id: string; label: string; votes: number }[];
};

export type PostView = {
  id: string;
  body: string;
  createdAt: number;
  editedAt: number | null;
  /** "deleted" by the author, "removed" by moderators, "unavailable" when blocked */
  gone: null | "deleted" | "removed" | "unavailable";
  author: UserMini;
  replyTo: { id: string; handle: string } | null;
  rootId: string | null;
  media: { id: string; url: string; alt: string; width: number | null; height: number | null }[];
  link: { url: string; title: string | null; domain: string } | null;
  poll: PollView | null;
  quote: PostView | null;
  counts: { likes: number; replies: number; reposts: number; quotes: number };
  viewer: { liked: boolean; reposted: boolean; bookmarked: boolean; isAuthor: boolean; canEdit: boolean };
};

/** A feed entry: a post, optionally shown because someone reposted it. */
export type FeedItem = { key: string; post: PostView; repostedBy: UserMini | null };

type PostRow = {
  id: string;
  author_id: string;
  body: string;
  reply_to_id: string | null;
  root_id: string | null;
  quote_of_id: string | null;
  link_url: string | null;
  link_title: string | null;
  link_domain: string | null;
  like_count: number;
  reply_count: number;
  repost_count: number;
  quote_count: number;
  created_at: number;
  edited_at: number | null;
  deleted_at: number | null;
  removed_at: number | null;
  // joined author columns
  a_handle: string;
  a_display_name: string;
  a_avatar: string | null;
  a_verified: number;
  a_status: string;
};

const placeholders = (n: number) => Array(n).fill("?").join(",");

/** Turn post ids into full views for one viewer, keeping the input order. */
export function hydrate(ids: string[], viewerId: string | null, depth = 0): PostView[] {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return [];
  const ph = placeholders(uniq.length);
  const rows = all<PostRow>(
    `SELECT p.*, u.handle a_handle, u.display_name a_display_name, u.avatar_media_id a_avatar, u.verified a_verified, u.status a_status
     FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id IN (${ph})`,
    uniq,
  );
  const byId = new Map(rows.map((r) => [r.id, r]));

  const media = all<{ id: string; post_id: string; alt: string; width: number | null; height: number | null }>(
    `SELECT id, post_id, alt, width, height FROM media WHERE post_id IN (${ph}) ORDER BY position`,
    uniq,
  );
  const polls = all<{ id: string; post_id: string; closes_at: number }>(`SELECT id, post_id, closes_at FROM polls WHERE post_id IN (${ph})`, uniq);
  const pollIds = polls.map((p) => p.id);
  const options = pollIds.length
    ? all<{ id: string; poll_id: string; label: string; votes: number }>(
        `SELECT id, poll_id, label, votes FROM poll_options WHERE poll_id IN (${placeholders(pollIds.length)}) ORDER BY idx`,
        pollIds,
      )
    : [];
  const myVotes = viewerId && pollIds.length
    ? all<{ poll_id: string; option_id: string }>(
        `SELECT poll_id, option_id FROM poll_votes WHERE user_id = ? AND poll_id IN (${placeholders(pollIds.length)})`,
        [viewerId, ...pollIds],
      )
    : [];
  const mine = (table: string) =>
    viewerId ? new Set(all<{ post_id: string }>(`SELECT post_id FROM ${table} WHERE user_id = ? AND post_id IN (${ph})`, [viewerId, ...uniq]).map((r) => r.post_id)) : new Set<string>();
  const liked = mine("likes");
  const reposted = mine("reposts");
  const bookmarked = mine("bookmarks");
  const blockedAuthors = viewerId
    ? new Set(
        all<{ id: string }>(
          "SELECT blocked_id id FROM blocks WHERE blocker_id = ? UNION SELECT blocker_id FROM blocks WHERE blocked_id = ?",
          [viewerId, viewerId],
        ).map((r) => r.id),
      )
    : new Set<string>();

  const replyParents = rows.filter((r) => r.reply_to_id).map((r) => r.reply_to_id!);
  const parentHandles = new Map(
    replyParents.length
      ? all<{ id: string; handle: string }>(
          `SELECT p.id, u.handle FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id IN (${placeholders(replyParents.length)})`,
          replyParents,
        ).map((r) => [r.id, r.handle])
      : [],
  );
  // Quotes are one level deep: a quote inside a quote shows as a link only.
  const quotes = depth === 0 ? new Map(hydrate(rows.filter((r) => r.quote_of_id).map((r) => r.quote_of_id!), viewerId, 1).map((q) => [q.id, q])) : new Map<string, PostView>();

  const t = now();
  const out: PostView[] = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) continue;
    const gone: PostView["gone"] = r.deleted_at || r.a_status === "deleted" ? "deleted" : r.removed_at ? "removed" : blockedAuthors.has(r.author_id) ? "unavailable" : null;
    const poll = polls.find((p) => p.post_id === r.id);
    const opts = poll ? options.filter((o) => o.poll_id === poll.id) : [];
    out.push({
      id: r.id,
      body: gone ? "" : r.body,
      createdAt: r.created_at,
      editedAt: r.edited_at,
      gone,
      author: toMini({ id: r.author_id, handle: r.a_handle, display_name: r.a_display_name, avatar_media_id: r.a_avatar, verified: r.a_verified }),
      replyTo: r.reply_to_id ? { id: r.reply_to_id, handle: parentHandles.get(r.reply_to_id) ?? "unknown" } : null,
      rootId: r.root_id,
      media: gone ? [] : media.filter((m) => m.post_id === r.id).map((m) => ({ id: m.id, url: mediaUrl(m.id)!, alt: m.alt, width: m.width, height: m.height })),
      link: !gone && r.link_url ? { url: r.link_url, title: r.link_title, domain: r.link_domain ?? "" } : null,
      poll:
        poll && !gone
          ? {
              id: poll.id,
              closesAt: poll.closes_at,
              closed: poll.closes_at < t,
              total: opts.reduce((s, o) => s + o.votes, 0),
              myVote: myVotes.find((v) => v.poll_id === poll.id)?.option_id ?? null,
              options: opts.map((o) => ({ id: o.id, label: o.label, votes: o.votes })),
            }
          : null,
      quote: !gone && r.quote_of_id ? (quotes.get(r.quote_of_id) ?? null) : null,
      counts: { likes: r.like_count, replies: r.reply_count, reposts: r.repost_count, quotes: r.quote_count },
      viewer: {
        liked: liked.has(r.id),
        reposted: reposted.has(r.id),
        bookmarked: bookmarked.has(r.id),
        isAuthor: viewerId === r.author_id,
        canEdit: viewerId === r.author_id && !gone && t - r.created_at < LIMITS.editWindowMs,
      },
    });
  }
  return out;
}

export function getPostView(id: string, viewerId: string | null) {
  return hydrate([id], viewerId)[0] ?? null;
}

export type NewPost = {
  body: string;
  replyToId?: string | null;
  quoteOfId?: string | null;
  mediaIds?: string[];
  alts?: string[];
  poll?: { options: string[]; durationHours: number } | null;
};

function linkCard(body: string) {
  const first = extractLinks(body)[0];
  if (!first) return null;
  const u = new URL(first);
  // Stage 1 does not fetch remote pages (avoids server-side request forgery);
  // the card shows the domain and path. Stage 2 adds a sandboxed preview fetcher.
  const title = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "").replace(/[-_]+/g, " ").replace(/\.\w+$/, "").slice(0, 120) || null;
  return { url: first, domain: u.hostname.replace(/^www\./, ""), title };
}

function visibleTarget(id: string, viewerId: string) {
  const p = get<{ id: string; author_id: string; root_id: string | null; deleted_at: number | null; removed_at: number | null }>(
    "SELECT id, author_id, root_id, deleted_at, removed_at FROM posts WHERE id = ?",
    [id],
  );
  if (!p || p.deleted_at || p.removed_at) throw new AppError("That post is no longer available.", "not_found");
  if (get("SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)", [p.author_id, viewerId, viewerId, p.author_id])) {
    throw new AppError("You can't interact with this account.", "blocked");
  }
  return p;
}

export function createPost(author: UserRow, input: NewPost): string {
  assertCanAct(author);
  const body = cleanText(input.body ?? "");
  const mediaIds = (input.mediaIds ?? []).slice(0, LIMITS.imagesPerPost + 1);
  const max = author.is_premium ? LIMITS.premiumPostChars : LIMITS.postChars;
  if (charCount(body) > max) throw new AppError(`Posts can be at most ${max} characters.`);
  if (mediaIds.length > LIMITS.imagesPerPost) throw new AppError(`You can attach up to ${LIMITS.imagesPerPost} images.`);
  const poll = input.poll ? pollSchema.parse(input.poll) : null;
  if (poll && mediaIds.length) throw new AppError("A post can have images or a poll, not both.");
  if (!body && !mediaIds.length && !input.quoteOfId) throw new AppError("Write something first.");
  if (poll && !body) throw new AppError("Add a question for your poll.");

  const spam = spamCheck(author.id, body, author.created_at);
  if (spam) throw new AppError(spam, "spam");
  rateLimit("post", author.id);

  const parent = input.replyToId ? visibleTarget(input.replyToId, author.id) : null;
  const quoted = input.quoteOfId ? visibleTarget(input.quoteOfId, author.id) : null;
  const link = mediaIds.length || poll ? null : linkCard(body);

  const id = newId();
  const t = now();
  tx(() => {
    run(
      `INSERT INTO posts (id, author_id, body, reply_to_id, root_id, quote_of_id, link_url, link_title, link_domain, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, author.id, body, parent?.id ?? null, parent ? (parent.root_id ?? parent.id) : null, quoted?.id ?? null, link?.url ?? null, link?.title ?? null, link?.domain ?? null, t],
    );
    mediaIds.forEach((mid, i) => {
      const res = run("UPDATE media SET post_id = ?, position = ?, alt = ? WHERE id = ? AND owner_id = ? AND post_id IS NULL AND kind = 'image'", [
        id,
        i,
        cleanText(input.alts?.[i] ?? "").slice(0, LIMITS.altChars),
        mid,
        author.id,
      ]);
      if (res.changes !== 1) throw new AppError("One of the images could not be attached. Please re-upload it.");
    });
    if (poll) {
      const pid = newId();
      run("INSERT INTO polls (id, post_id, closes_at) VALUES (?, ?, ?)", [pid, id, t + poll.durationHours * 3_600_000]);
      poll.options.forEach((label, idx) => run("INSERT INTO poll_options (id, poll_id, idx, label) VALUES (?, ?, ?, ?)", [newId(), pid, idx, label]));
    }
    for (const tag of extractHashtags(body)) run("INSERT OR IGNORE INTO post_hashtags (post_id, tag, created_at) VALUES (?, ?, ?)", [id, tag, t]);
    const mentioned = extractMentions(body);
    if (mentioned.length) {
      const users = all<{ id: string }>(`SELECT id FROM users WHERE status != 'deleted' AND handle IN (${placeholders(mentioned.length)})`, mentioned);
      for (const u of users) {
        run("INSERT OR IGNORE INTO mentions (post_id, user_id) VALUES (?, ?)", [id, u.id]);
        if (u.id !== parent?.author_id) notify(u.id, author.id, "mention", id);
      }
    }
    if (parent) {
      run("UPDATE posts SET reply_count = reply_count + 1 WHERE id = ?", [parent.id]);
      notify(parent.author_id, author.id, "reply", id);
    }
    if (quoted) {
      run("UPDATE posts SET quote_count = quote_count + 1 WHERE id = ?", [quoted.id]);
      notify(quoted.author_id, author.id, "quote", id);
    }
  });
  return id;
}

export function editPost(user: UserRow, postId: string, newBody: string) {
  assertCanAct(user);
  const p = get<{ author_id: string; body: string; created_at: number; deleted_at: number | null; removed_at: number | null }>(
    "SELECT author_id, body, created_at, deleted_at, removed_at FROM posts WHERE id = ?",
    [postId],
  );
  if (!p || p.author_id !== user.id || p.deleted_at || p.removed_at) throw new AppError("You can't edit this post.", "forbidden");
  if (now() - p.created_at > LIMITS.editWindowMs) throw new AppError("Posts can only be edited in the first 15 minutes.");
  const body = cleanText(newBody);
  const max = user.is_premium ? LIMITS.premiumPostChars : LIMITS.postChars;
  if (!body) throw new AppError("A post can't be empty.");
  if (charCount(body) > max) throw new AppError(`Posts can be at most ${max} characters.`);
  if (body === p.body) return;
  const spam = spamCheck(user.id, body, user.created_at);
  if (spam && !spam.startsWith("You already posted")) throw new AppError(spam, "spam");
  const t = now();
  tx(() => {
    // Keep the old version: the "edited" label links to a visible history later ("Receipts").
    run("INSERT INTO post_edits (post_id, body, edited_at) VALUES (?, ?, ?)", [postId, p.body, t]);
    run("UPDATE posts SET body = ?, edited_at = ? WHERE id = ?", [body, t, postId]);
    run("DELETE FROM post_hashtags WHERE post_id = ?", [postId]);
    for (const tag of extractHashtags(body)) run("INSERT OR IGNORE INTO post_hashtags (post_id, tag, created_at) VALUES (?, ?, ?)", [postId, tag, p.created_at]);
  });
}

export function deletePost(user: UserRow, postId: string) {
  const p = get<{ author_id: string; reply_to_id: string | null; quote_of_id: string | null; deleted_at: number | null }>(
    "SELECT author_id, reply_to_id, quote_of_id, deleted_at FROM posts WHERE id = ?",
    [postId],
  );
  if (!p || p.deleted_at) return;
  if (p.author_id !== user.id) throw new AppError("You can only delete your own posts.", "forbidden");
  tx(() => {
    // Soft delete keeps reply threads intact; the body and attachments are wiped.
    run("UPDATE posts SET deleted_at = ?, body = '', link_url = NULL, link_title = NULL, link_domain = NULL WHERE id = ?", [now(), postId]);
    run("DELETE FROM post_hashtags WHERE post_id = ?", [postId]);
    run("DELETE FROM reposts WHERE post_id = ?", [postId]);
    if (p.reply_to_id) run("UPDATE posts SET reply_count = max(reply_count - 1, 0) WHERE id = ?", [p.reply_to_id]);
    if (p.quote_of_id) run("UPDATE posts SET quote_count = max(quote_count - 1, 0) WHERE id = ?", [p.quote_of_id]);
    run("UPDATE users SET pinned_post_id = NULL WHERE pinned_post_id = ?", [postId]);
    run("DELETE FROM notifications WHERE post_id = ?", [postId]);
  });
  return all<{ path: string }>("SELECT path FROM media WHERE post_id = ?", [postId]);
}

export function pinPost(user: UserRow, postId: string | null) {
  if (postId) {
    const p = get<{ author_id: string; reply_to_id: string | null }>("SELECT author_id, reply_to_id FROM posts WHERE id = ? AND deleted_at IS NULL", [postId]);
    if (!p || p.author_id !== user.id) throw new AppError("You can only pin your own posts.");
  }
  run("UPDATE users SET pinned_post_id = ? WHERE id = ?", [postId, user.id]);
}

export function votePoll(user: UserRow, pollId: string, optionId: string) {
  assertCanAct(user);
  const poll = get<{ id: string; post_id: string; closes_at: number }>("SELECT * FROM polls WHERE id = ?", [pollId]);
  if (!poll) throw new AppError("Poll not found.", "not_found");
  visibleTarget(poll.post_id, user.id);
  if (poll.closes_at < now()) throw new AppError("This poll has closed.");
  if (!get("SELECT 1 FROM poll_options WHERE id = ? AND poll_id = ?", [optionId, pollId])) throw new AppError("Invalid option.");
  tx(() => {
    const res = run("INSERT OR IGNORE INTO poll_votes (poll_id, user_id, option_id, created_at) VALUES (?, ?, ?, ?)", [pollId, user.id, optionId, now()]);
    if (res.changes === 0) throw new AppError("You already voted.");
    run("UPDATE poll_options SET votes = votes + 1 WHERE id = ?", [optionId]);
  });
}

/** A post plus its ancestors (oldest first) and direct replies. */
export function getThread(postId: string, viewerId: string | null) {
  const post = getPostView(postId, viewerId);
  if (!post) return null;
  const ancestors: string[] = [];
  let cur = get<{ reply_to_id: string | null }>("SELECT reply_to_id FROM posts WHERE id = ?", [postId])?.reply_to_id;
  while (cur && ancestors.length < 20) {
    ancestors.unshift(cur);
    cur = get<{ reply_to_id: string | null }>("SELECT reply_to_id FROM posts WHERE id = ?", [cur])?.reply_to_id;
  }
  const replyIds = all<{ id: string }>(
    `SELECT p.id FROM posts p WHERE p.reply_to_id = ? AND p.deleted_at IS NULL AND p.removed_at IS NULL
     AND p.author_id NOT IN (${hiddenAuthorsSql}) ORDER BY (p.author_id = ?) DESC, p.like_count DESC, p.created_at ASC LIMIT 200`,
    [postId, ...hiddenParams(viewerId), post.author.id],
  ).map((r) => r.id);
  return { post, ancestors: hydrate(ancestors, viewerId), replies: hydrate(replyIds, viewerId) };
}

/** Authors a viewer never sees in lists: blocked either way, or muted. Uses 3 params. */
export const hiddenAuthorsSql =
  "SELECT blocked_id FROM blocks WHERE blocker_id = ? UNION SELECT blocker_id FROM blocks WHERE blocked_id = ? UNION SELECT muted_id FROM mutes WHERE muter_id = ?";
export const hiddenParams = (viewerId: string | null) => {
  const v = viewerId ?? "";
  return [v, v, v];
};

export function authorOf(postId: string) {
  const p = get<{ author_id: string }>("SELECT author_id FROM posts WHERE id = ?", [postId]);
  return p ? userById(p.author_id) : undefined;
}

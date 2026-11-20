import { AppError } from "./errors";
import { all, get, now, run, tx } from "./db";
import { notify, unnotify } from "./notifications";
import { rateLimit } from "./ratelimit";
import { assertCanAct, toMini, userById, type UserMini, type UserRow } from "./users";

function interactable(postId: string, userId: string) {
  const p = get<{ author_id: string }>("SELECT author_id FROM posts WHERE id = ? AND deleted_at IS NULL AND removed_at IS NULL", [postId]);
  if (!p) throw new AppError("That post is no longer available.", "not_found");
  if (isBlockedEitherWay(p.author_id, userId)) throw new AppError("You can't interact with this account.", "blocked");
  return p;
}

export function isBlockedEitherWay(a: string, b: string) {
  return !!get("SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)", [a, b, b, a]);
}

/** Toggle helpers return the new state so the UI can confirm its optimistic update. */
export function setLike(user: UserRow, postId: string, on: boolean): boolean {
  assertCanAct(user);
  const p = interactable(postId, user.id);
  if (on) rateLimit("like", user.id);
  tx(() => {
    if (on) {
      if (run("INSERT OR IGNORE INTO likes (user_id, post_id, created_at) VALUES (?, ?, ?)", [user.id, postId, now()]).changes) {
        run("UPDATE posts SET like_count = like_count + 1 WHERE id = ?", [postId]);
        notify(p.author_id, user.id, "like", postId);
      }
    } else if (run("DELETE FROM likes WHERE user_id = ? AND post_id = ?", [user.id, postId]).changes) {
      run("UPDATE posts SET like_count = max(like_count - 1, 0) WHERE id = ?", [postId]);
      unnotify(p.author_id, user.id, "like", postId);
    }
  });
  return on;
}

export function setRepost(user: UserRow, postId: string, on: boolean): boolean {
  assertCanAct(user);
  const p = interactable(postId, user.id);
  if (on) rateLimit("like", user.id);
  tx(() => {
    if (on) {
      if (run("INSERT OR IGNORE INTO reposts (user_id, post_id, created_at) VALUES (?, ?, ?)", [user.id, postId, now()]).changes) {
        run("UPDATE posts SET repost_count = repost_count + 1 WHERE id = ?", [postId]);
        notify(p.author_id, user.id, "repost", postId);
      }
    } else if (run("DELETE FROM reposts WHERE user_id = ? AND post_id = ?", [user.id, postId]).changes) {
      run("UPDATE posts SET repost_count = max(repost_count - 1, 0) WHERE id = ?", [postId]);
      unnotify(p.author_id, user.id, "repost", postId);
    }
  });
  return on;
}

export function setBookmark(user: UserRow, postId: string, on: boolean): boolean {
  if (on) {
    interactable(postId, user.id);
    run("INSERT OR IGNORE INTO bookmarks (user_id, post_id, created_at) VALUES (?, ?, ?)", [user.id, postId, now()]);
  } else run("DELETE FROM bookmarks WHERE user_id = ? AND post_id = ?", [user.id, postId]);
  return on;
}

export function setFollow(user: UserRow, targetId: string, on: boolean): boolean {
  assertCanAct(user);
  if (targetId === user.id) throw new AppError("You can't follow yourself.");
  const target = userById(targetId);
  if (!target || target.status === "deleted") throw new AppError("Account not found.", "not_found");
  if (on) {
    if (isBlockedEitherWay(user.id, targetId)) throw new AppError("You can't follow this account.", "blocked");
    rateLimit("follow", user.id);
    if (run("INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)", [user.id, targetId, now()]).changes) {
      notify(targetId, user.id, "follow");
    }
  } else {
    run("DELETE FROM follows WHERE follower_id = ? AND followee_id = ?", [user.id, targetId]);
    unnotify(targetId, user.id, "follow", null);
  }
  return on;
}

/** Blocking removes follows both ways, and hides each account from the other. */
export function setBlock(user: UserRow, targetId: string, on: boolean): boolean {
  if (targetId === user.id) throw new AppError("You can't block yourself.");
  if (!userById(targetId)) throw new AppError("Account not found.", "not_found");
  tx(() => {
    if (on) {
      run("INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)", [user.id, targetId, now()]);
      run("DELETE FROM follows WHERE (follower_id = ? AND followee_id = ?) OR (follower_id = ? AND followee_id = ?)", [user.id, targetId, targetId, user.id]);
    } else run("DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?", [user.id, targetId]);
  });
  return on;
}

export function setMute(user: UserRow, targetId: string, on: boolean): boolean {
  if (targetId === user.id) throw new AppError("You can't mute yourself.");
  if (on) run("INSERT OR IGNORE INTO mutes (muter_id, muted_id, created_at) VALUES (?, ?, ?)", [user.id, targetId, now()]);
  else run("DELETE FROM mutes WHERE muter_id = ? AND muted_id = ?", [user.id, targetId]);
  return on;
}

type MiniRow = { id: string; handle: string; display_name: string; avatar_media_id: string | null; verified: number; bio: string };
export type UserListItem = UserMini & { bio: string; viewerFollows: boolean };

function withFollowState(rows: MiniRow[], viewerId: string | null): UserListItem[] {
  const following = viewerId
    ? new Set(all<{ followee_id: string }>("SELECT followee_id FROM follows WHERE follower_id = ?", [viewerId]).map((r) => r.followee_id))
    : new Set<string>();
  return rows.map((r) => ({ ...toMini(r), bio: r.bio, viewerFollows: following.has(r.id) }));
}

export function listFollows(userId: string, which: "followers" | "following", viewerId: string | null) {
  const u = userById(userId);
  if (!u) return null;
  if (u.hide_follows && viewerId !== userId) return "hidden" as const;
  const rows = all<MiniRow>(
    which === "followers"
      ? `SELECT u.id, u.handle, u.display_name, u.avatar_media_id, u.verified, u.bio FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.followee_id = ? AND u.status != 'deleted' ORDER BY f.created_at DESC LIMIT 200`
      : `SELECT u.id, u.handle, u.display_name, u.avatar_media_id, u.verified, u.bio FROM follows f JOIN users u ON u.id = f.followee_id WHERE f.follower_id = ? AND u.status != 'deleted' ORDER BY f.created_at DESC LIMIT 200`,
    [userId],
  );
  return withFollowState(rows, viewerId);
}

export function listBlockedAndMuted(userId: string) {
  const q = (sql: string) => all<MiniRow>(sql, [userId]).map((r) => toMini(r));
  return {
    blocked: q("SELECT u.id, u.handle, u.display_name, u.avatar_media_id, u.verified, u.bio FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ?"),
    muted: q("SELECT u.id, u.handle, u.display_name, u.avatar_media_id, u.verified, u.bio FROM mutes m JOIN users u ON u.id = m.muted_id WHERE m.muter_id = ?"),
  };
}

/** "Who to follow": active accounts you don't follow, favoring ones your follows follow. */
export function whoToFollow(viewerId: string | null, limit = 3): UserListItem[] {
  const v = viewerId ?? "";
  const rows = all<MiniRow>(
    `SELECT u.id, u.handle, u.display_name, u.avatar_media_id, u.verified, u.bio,
       (SELECT count(*) FROM follows f2 WHERE f2.followee_id = u.id AND f2.follower_id IN (SELECT followee_id FROM follows WHERE follower_id = ?)) AS mutual,
       (SELECT count(*) FROM follows f3 WHERE f3.followee_id = u.id) AS followers
     FROM users u
     WHERE u.status = 'active' AND u.id != ?
       AND u.id NOT IN (SELECT followee_id FROM follows WHERE follower_id = ?)
       AND u.id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ? UNION SELECT blocker_id FROM blocks WHERE blocked_id = ? UNION SELECT muted_id FROM mutes WHERE muter_id = ?)
     ORDER BY mutual DESC, followers DESC LIMIT ?`,
    [v, v, v, v, v, v, limit],
  );
  return withFollowState(rows, viewerId);
}

import { recordSignal, signalAuthor } from "./interests";
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

/** Interest signals must never break the action they ride on. */
function safeSignal(fn: () => void) {
  try { fn(); } catch { /* ignore */ }
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
  if (on) safeSignal(() => recordSignal(user.id, { type: "post", id: postId }, "share"));
  return on;
}

export function setBookmark(user: UserRow, postId: string, on: boolean): boolean {
  if (on) {
    interactable(postId, user.id);
    run("INSERT OR IGNORE INTO bookmarks (user_id, post_id, created_at) VALUES (?, ?, ?)", [user.id, postId, now()]);
  } else run("DELETE FROM bookmarks WHERE user_id = ? AND post_id = ?", [user.id, postId]);
  if (on) safeSignal(() => recordSignal(user.id, { type: "post", id: postId }, "save"));
  return on;
}

export type FollowState = "none" | "following" | "requested";

export function followState(viewerId: string, targetId: string): FollowState {
  if (get("SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?", [viewerId, targetId])) return "following";
  if (get("SELECT 1 FROM follow_requests WHERE requester_id = ? AND target_id = ?", [viewerId, targetId])) return "requested";
  return "none";
}

/**
 * Follow / unfollow. Following a private account sends a request instead;
 * unfollowing also cancels a pending request. Returns the new state.
 */
export function setFollow(user: UserRow, targetId: string, on: boolean): FollowState {
  assertCanAct(user);
  if (targetId === user.id) throw new AppError("You can't follow yourself.");
  const target = userById(targetId) as (UserRow & { is_private?: number }) | undefined;
  if (!target || target.status === "deleted") throw new AppError("Account not found.", "not_found");
  if (on) {
    if (isBlockedEitherWay(user.id, targetId)) throw new AppError("You can't follow this account.", "blocked");
    const cur = followState(user.id, targetId);
    if (cur !== "none") return cur;
    rateLimit("follow", user.id);
    if (target.is_private) {
      run("INSERT OR IGNORE INTO follow_requests (requester_id, target_id, created_at) VALUES (?, ?, ?)", [user.id, targetId, now()]);
      notify(targetId, user.id, "follow_request");
      return "requested";
    }
    run("INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)", [user.id, targetId, now()]);
    notify(targetId, user.id, "follow");
    safeSignal(() => signalAuthor(user.id, targetId, "follow"));
    return "following";
  }
  run("DELETE FROM follows WHERE follower_id = ? AND followee_id = ?", [user.id, targetId]);
  run("DELETE FROM follow_requests WHERE requester_id = ? AND target_id = ?", [user.id, targetId]);
  unnotify(targetId, user.id, "follow", null);
  unnotify(targetId, user.id, "follow_request", null);
  return "none";
}

export function listFollowRequests(userId: string): UserListItem[] {
  return all<MiniRow>(
    `SELECT u.id, u.handle, u.display_name, u.avatar_media_id, u.verified, u.bio FROM follow_requests r JOIN users u ON u.id = r.requester_id
     WHERE r.target_id = ? AND u.status = 'active' ORDER BY r.created_at DESC LIMIT 200`,
    [userId],
  ).map((r) => ({ ...toMini(r), bio: r.bio, viewerFollows: false }));
}

/** Approve or decline someone's request to follow your private account. */
export function answerFollowRequest(user: UserRow, requesterId: string, approve: boolean) {
  if (!get("SELECT 1 FROM follow_requests WHERE requester_id = ? AND target_id = ?", [requesterId, user.id])) throw new AppError("That request is gone.", "not_found");
  tx(() => {
    run("DELETE FROM follow_requests WHERE requester_id = ? AND target_id = ?", [requesterId, user.id]);
    run("DELETE FROM notifications WHERE user_id = ? AND actor_id = ? AND type = 'follow_request'", [user.id, requesterId]);
    if (approve) {
      run("INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)", [requesterId, user.id, now()]);
      notify(requesterId, user.id, "follow_accept");
    }
  });
}

/** Mutual follows count as Friends. */
export function isFriend(a: string, b: string) {
  return !!get(
    "SELECT 1 FROM follows x JOIN follows y ON y.follower_id = x.followee_id AND y.followee_id = x.follower_id WHERE x.follower_id = ? AND x.followee_id = ?",
    [a, b],
  );
}

export function listFriends(userId: string, viewerId: string | null): UserListItem[] {
  return all<MiniRow & { vf: number }>(
    `SELECT u.id, u.handle, u.display_name, u.avatar_media_id, u.verified, u.bio,
       EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = ? AND f.followee_id = u.id) vf
     FROM follows a JOIN follows b ON b.follower_id = a.followee_id AND b.followee_id = a.follower_id
     JOIN users u ON u.id = a.followee_id WHERE a.follower_id = ? AND u.status = 'active' ORDER BY u.display_name LIMIT 500`,
    [viewerId ?? "", userId],
  ).map((r) => ({ ...toMini(r), bio: r.bio, viewerFollows: !!r.vf }));
}

/** Pin up to three dispatches to your profile (toggle). */
export const MAX_PINS = 3;
export function togglePin(user: UserRow, postId: string): boolean {
  const p = get<{ author_id: string; reply_to_id: string | null; deleted_at: number | null }>("SELECT author_id, reply_to_id, deleted_at FROM posts WHERE id = ?", [postId]);
  if (!p || p.deleted_at || p.author_id !== user.id) throw new AppError("You can only pin your own dispatches.");
  if (get("SELECT 1 FROM profile_pins WHERE user_id = ? AND post_id = ?", [user.id, postId])) {
    run("DELETE FROM profile_pins WHERE user_id = ? AND post_id = ?", [user.id, postId]);
    run("UPDATE users SET pinned_post_id = (SELECT post_id FROM profile_pins WHERE user_id = ? ORDER BY position, created_at LIMIT 1) WHERE id = ?", [user.id, user.id]);
    return false;
  }
  const n = get<{ n: number }>("SELECT count(*) n FROM profile_pins WHERE user_id = ?", [user.id])?.n ?? 0;
  if (n >= MAX_PINS) throw new AppError(`You can pin up to ${MAX_PINS} dispatches. Unpin one first.`);
  run("INSERT INTO profile_pins (user_id, post_id, position, created_at) VALUES (?, ?, ?, ?)", [user.id, postId, n, now()]);
  run("UPDATE users SET pinned_post_id = COALESCE(pinned_post_id, ?) WHERE id = ?", [postId, user.id]);
  return true;
}

export const pinnedIds = (userId: string) =>
  all<{ post_id: string }>("SELECT pp.post_id FROM profile_pins pp JOIN posts p ON p.id = pp.post_id WHERE pp.user_id = ? AND p.deleted_at IS NULL AND p.removed_at IS NULL ORDER BY pp.position, pp.created_at", [userId]).map((r) => r.post_id);

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

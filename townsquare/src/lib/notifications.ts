import { all, get, newId, now, run } from "./db";
import { toMini, type UserMini } from "./users";

export type NotificationType = "like" | "reply" | "repost" | "quote" | "follow" | "mention" | "warning" | "system";

export type NotificationView = {
  id: string;
  type: NotificationType;
  actor: UserMini | null;
  postId: string | null;
  postSnippet: string | null;
  message: string | null;
  createdAt: number;
  read: boolean;
};

/** Record a notification unless it is to yourself or the two accounts block/mute each other. */
export function notify(userId: string, actorId: string | null, type: NotificationType, postId: string | null = null, message: string | null = null) {
  if (actorId && userId === actorId) return;
  if (actorId) {
    const silenced = get(
      `SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
       UNION SELECT 1 FROM mutes WHERE muter_id = ? AND muted_id = ?`,
      [userId, actorId, actorId, userId, userId, actorId],
    );
    if (silenced) return;
    // Don't stack duplicates (like → unlike → like).
    if (get("SELECT 1 FROM notifications WHERE user_id = ? AND actor_id = ? AND type = ? AND post_id IS ?", [userId, actorId, type, postId])) return;
  }
  run("INSERT INTO notifications (id, user_id, actor_id, type, post_id, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
    newId(),
    userId,
    actorId,
    type,
    postId,
    message,
    now(),
  ]);
}

export function unnotify(userId: string, actorId: string, type: NotificationType, postId: string | null) {
  run("DELETE FROM notifications WHERE user_id = ? AND actor_id = ? AND type = ? AND post_id IS ? AND read_at IS NULL", [userId, actorId, type, postId]);
}

export const NOTIFICATION_FILTERS = {
  all: null,
  mentions: ["mention", "reply", "quote"],
  likes: ["like"],
  reposts: ["repost", "quote"],
  follows: ["follow"],
  account: ["warning", "system"],
} as const satisfies Record<string, readonly NotificationType[] | null>;

export function listNotifications(userId: string, filter: keyof typeof NOTIFICATION_FILTERS = "all", limit = 50): NotificationView[] {
  const types = NOTIFICATION_FILTERS[filter];
  const rows = all<{
    id: string; type: NotificationType; post_id: string | null; message: string | null; created_at: number; read_at: number | null;
    actor_id: string | null; handle: string | null; display_name: string | null; avatar_media_id: string | null; verified: number | null; body: string | null;
  }>(
    `SELECT n.*, u.handle, u.display_name, u.avatar_media_id, u.verified, p.body
     FROM notifications n LEFT JOIN users u ON u.id = n.actor_id LEFT JOIN posts p ON p.id = n.post_id
     WHERE n.user_id = ? ${types ? `AND n.type IN (${types.map(() => "?").join(",")})` : ""}
     ORDER BY n.created_at DESC LIMIT ?`,
    [userId, ...(types ?? []), limit],
  );
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    actor: r.actor_id && r.handle ? toMini({ id: r.actor_id, handle: r.handle, display_name: r.display_name!, avatar_media_id: r.avatar_media_id, verified: r.verified ?? 0 }) : null,
    postId: r.post_id,
    postSnippet: r.body ? r.body.slice(0, 140) : null,
    message: r.message,
    createdAt: r.created_at,
    read: !!r.read_at,
  }));
}

export function unreadCount(userId: string) {
  return get<{ n: number }>("SELECT count(*) n FROM notifications WHERE user_id = ? AND read_at IS NULL", [userId])?.n ?? 0;
}

export function markAllRead(userId: string) {
  run("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL", [now(), userId]);
}

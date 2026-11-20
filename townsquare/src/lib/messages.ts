import { AppError } from "./errors";
import { all, get, newId, now, run } from "./db";
import { rateLimit } from "./ratelimit";
import { cleanText } from "./text";
import { assertCanAct, toMini, userById, type UserMini, type UserRow } from "./users";

export const MESSAGE_MAX = 1000;
export type MessageView = { id: string; mine: boolean; body: string; createdAt: number; read: boolean };
export type Conversation = { peer: UserMini; last: { body: string; mine: boolean; createdAt: number }; unread: number };

const blocked = (a: string, b: string) => !!get("SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)", [a, b, b, a]);

/**
 * Who can message whom: never across a block; otherwise only when the
 * recipient follows you, or has already written to you. That keeps
 * strangers out of people's inboxes.
 */
export function canMessage(senderId: string, recipientId: string): { ok: true } | { ok: false; reason: string } {
  if (senderId === recipientId) return { ok: false, reason: "You can't message yourself." };
  const r = userById(recipientId);
  if (!r || r.status !== "active") return { ok: false, reason: "That account isn't available." };
  if (blocked(senderId, recipientId)) return { ok: false, reason: "You can't message this account." };
  const follows = !!get("SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?", [recipientId, senderId]);
  const wrote = !!get("SELECT 1 FROM messages WHERE sender_id = ? AND recipient_id = ? LIMIT 1", [recipientId, senderId]);
  return follows || wrote ? { ok: true } : { ok: false, reason: `You can message people who follow you. @${r.handle} doesn't follow you yet.` };
}

export function sendMessage(user: UserRow, recipientId: string, raw: string): MessageView {
  assertCanAct(user);
  const body = cleanText(raw ?? "");
  if (!body) throw new AppError("Write a message first.");
  if ([...body].length > MESSAGE_MAX) throw new AppError(`Messages can be at most ${MESSAGE_MAX} characters.`);
  const can = canMessage(user.id, recipientId);
  if (!can.ok) throw new AppError(can.reason, "forbidden");
  rateLimit("message", user.id);
  const id = newId();
  const t = now();
  run("INSERT INTO messages (id, sender_id, recipient_id, body, created_at) VALUES (?, ?, ?, ?, ?)", [id, user.id, recipientId, body, t]);
  return { id, mine: true, body, createdAt: t, read: false };
}

/** One row per person you've exchanged messages with, newest first. Blocked accounts are hidden. */
export function listConversations(userId: string): Conversation[] {
  const rows = all<{ peer: string; body: string; sender_id: string; created_at: number; unread: number; handle: string; display_name: string; avatar_media_id: string | null; verified: number }>(
    `SELECT x.peer, m.body, m.sender_id, m.created_at, u.handle, u.display_name, u.avatar_media_id, u.verified,
       (SELECT count(*) FROM messages n WHERE n.sender_id = x.peer AND n.recipient_id = ? AND n.read_at IS NULL) unread
     FROM (SELECT CASE WHEN sender_id = ? THEN recipient_id ELSE sender_id END peer, max(created_at) last_at FROM messages WHERE sender_id = ? OR recipient_id = ? GROUP BY peer) x
     JOIN messages m ON m.created_at = x.last_at AND ((m.sender_id = ? AND m.recipient_id = x.peer) OR (m.sender_id = x.peer AND m.recipient_id = ?))
     JOIN users u ON u.id = x.peer
     WHERE u.status != 'deleted'
       AND x.peer NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = ? UNION SELECT blocker_id FROM blocks WHERE blocked_id = ?)
     GROUP BY x.peer ORDER BY m.created_at DESC LIMIT 100`,
    [userId, userId, userId, userId, userId, userId, userId, userId],
  );
  return rows.map((r) => ({
    peer: toMini({ id: r.peer, handle: r.handle, display_name: r.display_name, avatar_media_id: r.avatar_media_id, verified: r.verified }),
    last: { body: r.body, mine: r.sender_id === userId, createdAt: r.created_at },
    unread: r.unread,
  }));
}

/** The conversation with one person (oldest first). Opening it marks their messages read. */
export function thread(userId: string, peerId: string, after = 0, limit = 200): MessageView[] {
  if (blocked(userId, peerId)) return [];
  const rows = all<{ id: string; sender_id: string; body: string; created_at: number; read_at: number | null }>(
    `SELECT * FROM (SELECT id, sender_id, body, created_at, read_at FROM messages
       WHERE ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)) AND created_at > ?
       ORDER BY created_at DESC LIMIT ?) ORDER BY created_at ASC`,
    [userId, peerId, peerId, userId, after, limit],
  );
  run("UPDATE messages SET read_at = ? WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL", [now(), peerId, userId]);
  return rows.map((r) => ({ id: r.id, mine: r.sender_id === userId, body: r.body, createdAt: r.created_at, read: !!r.read_at }));
}

/** Unread count for the tab-bar badge (muted and blocked senders don't count). */
export function unreadMessages(userId: string): number {
  return (
    get<{ n: number }>(
      `SELECT count(*) n FROM messages WHERE recipient_id = ? AND read_at IS NULL
         AND sender_id NOT IN (SELECT muted_id FROM mutes WHERE muter_id = ? UNION SELECT blocked_id FROM blocks WHERE blocker_id = ? UNION SELECT blocker_id FROM blocks WHERE blocked_id = ?)`,
      [userId, userId, userId, userId],
    )?.n ?? 0
  );
}

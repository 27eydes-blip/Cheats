import { LIMITS } from "@/config";
import { AppError } from "./errors";
import { all, get, newId, now, run } from "./db";
import type { FeedPage } from "./feed";
import { hiddenAuthorsSql, hiddenParams, hydrate } from "./posts";
import { cleanText } from "./text";
import { toMini, userByHandle, type UserMini, type UserRow } from "./users";

export type ListView = { id: string; name: string; members: number };
export const MAX_LISTS = 20;
export const MAX_LIST_MEMBERS = 200;

/** Lists are private collections of accounts with their own feed. Only the owner sees them. */
export function listsOf(userId: string): ListView[] {
  return all<ListView>("SELECT l.id, l.name, (SELECT count(*) FROM list_members m WHERE m.list_id = l.id) members FROM lists l WHERE l.owner_id = ? ORDER BY l.created_at", [userId]);
}

export function createList(user: UserRow, rawName: string): string {
  const name = cleanText(rawName ?? "").slice(0, 40);
  if (!name) throw new AppError("Give your list a name.");
  if ((get<{ n: number }>("SELECT count(*) n FROM lists WHERE owner_id = ?", [user.id])?.n ?? 0) >= MAX_LISTS) throw new AppError(`You can have up to ${MAX_LISTS} lists.`);
  const id = newId();
  run("INSERT INTO lists (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)", [id, user.id, name, now()]);
  return id;
}

function own(userId: string, listId: string) {
  const l = get<{ id: string; name: string; owner_id: string }>("SELECT id, name, owner_id FROM lists WHERE id = ?", [listId]);
  if (!l || l.owner_id !== userId) throw new AppError("List not found.", "not_found");
  return l;
}

export function getList(userId: string, listId: string): { id: string; name: string; members: UserMini[] } | null {
  const l = get<{ id: string; name: string; owner_id: string }>("SELECT id, name, owner_id FROM lists WHERE id = ?", [listId]);
  if (!l || l.owner_id !== userId) return null;
  const members = all<{ id: string; handle: string; display_name: string; avatar_media_id: string | null; verified: number }>(
    "SELECT u.id, u.handle, u.display_name, u.avatar_media_id, u.verified FROM list_members m JOIN users u ON u.id = m.user_id WHERE m.list_id = ? AND u.status = 'active' ORDER BY u.display_name",
    [listId],
  ).map(toMini);
  return { id: l.id, name: l.name, members };
}

export function deleteList(user: UserRow, listId: string) {
  own(user.id, listId);
  run("DELETE FROM lists WHERE id = ?", [listId]);
}

export function addListMember(user: UserRow, listId: string, handle: string) {
  own(user.id, listId);
  const u = userByHandle(String(handle ?? "").trim().replace(/^@/, ""));
  if (!u || u.status !== "active") throw new AppError("No account with that handle.");
  if ((get<{ n: number }>("SELECT count(*) n FROM list_members WHERE list_id = ?", [listId])?.n ?? 0) >= MAX_LIST_MEMBERS) throw new AppError(`A list can hold up to ${MAX_LIST_MEMBERS} accounts.`);
  run("INSERT OR IGNORE INTO list_members (list_id, user_id, created_at) VALUES (?, ?, ?)", [listId, u.id, now()]);
}

export function removeListMember(user: UserRow, listId: string, memberId: string) {
  own(user.id, listId);
  run("DELETE FROM list_members WHERE list_id = ? AND user_id = ?", [listId, memberId]);
}

/** Newest dispatches from a list's members (blocked, muted and private-not-followed accounts stay hidden). */
export function listFeed(userId: string, listId: string, cursor?: string | null, limit: number = LIMITS.feedPage): FeedPage {
  if (!getList(userId, listId)) return { items: [], nextCursor: null };
  const i = cursor ? cursor.indexOf("_") : -1;
  const at = cursor ? Number(cursor.slice(0, i)) || 0 : Number.MAX_SAFE_INTEGER;
  const k = cursor ? cursor.slice(i + 1) : "~";
  const rows = all<{ id: string; created_at: number }>(
    `SELECT p.id, p.created_at FROM posts p
     WHERE p.author_id IN (SELECT user_id FROM list_members WHERE list_id = ?) AND p.reply_to_id IS NULL AND p.community_id IS NULL
       AND p.deleted_at IS NULL AND p.removed_at IS NULL AND p.author_id NOT IN (${hiddenAuthorsSql})
       AND (p.created_at < ? OR (p.created_at = ? AND p.id < ?))
     ORDER BY p.created_at DESC, p.id DESC LIMIT ?`,
    [listId, ...hiddenParams(userId), at, at, k, limit],
  );
  const posts = new Map(hydrate(rows.map((r) => r.id), userId).map((p) => [p.id, p]));
  const items = rows.flatMap((r) => {
    const post = posts.get(r.id);
    return post && !post.gone ? [{ key: `${r.created_at}_${r.id}`, post, repostedBy: null }] : [];
  });
  const last = rows.at(-1);
  return { items, nextCursor: rows.length === limit && last ? `${last.created_at}_${last.id}` : null };
}

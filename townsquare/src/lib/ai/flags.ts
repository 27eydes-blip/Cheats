import type { DatabaseSync } from "node:sqlite";
import { all, db } from "../db";

/**
 * Which user ids are AI newsroom accounts. Cached per database handle and
 * refreshed every minute, so every name shown anywhere (posts, profiles,
 * search, notifications, lists) can carry the AI badge without changing each query.
 */
const cache = new WeakMap<DatabaseSync, { at: number; ids: Set<string> }>();

export function aiUserIds(): Set<string> {
  const d = db();
  const hit = cache.get(d);
  if (hit && Date.now() - hit.at < 60_000) return hit.ids;
  let ids = new Set<string>();
  try {
    ids = new Set(all<{ id: string }>("SELECT id FROM users WHERE is_ai = 1").map((r) => r.id));
  } catch {
    /* column missing on a database that has not migrated yet */
  }
  cache.set(d, { at: Date.now(), ids });
  return ids;
}

export const isAiUser = (id: string) => aiUserIds().has(id);

/** Served avatar for an AI account: an uploaded/generated image if present, else the illustrated SVG. */
export const aiAvatarUrl = (handle: string) => `/api/ai/avatar/${encodeURIComponent(handle.toLowerCase())}`;

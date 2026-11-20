import { AppError } from "./errors";
import { all, get, now, run } from "./db";
import { rateLimit } from "./ratelimit";
import { assertCanAct, type UserRow } from "./users";

export type StanceValue = "agree" | "disagree" | "unsure";
export type StanceTarget = "story" | "post";
/** The split shown by every stance meter. `mine` is the viewer's own stance. */
export type Split = { agree: number; disagree: number; unsure: number; total: number; mine: StanceValue | null };

export const EMPTY_SPLIT: Split = { agree: 0, disagree: 0, unsure: 0, total: 0, mine: null };
const VALUES = new Set<StanceValue>(["agree", "disagree", "unsure"]);

/** Stance counts for many targets at once (one query), keyed by target id. */
export function splits(type: StanceTarget, ids: string[], viewerId: string | null): Map<string, Split> {
  const out = new Map<string, Split>();
  if (!ids.length) return out;
  const uniq = [...new Set(ids)];
  const ph = uniq.map(() => "?").join(",");
  for (const r of all<{ target_id: string; value: StanceValue; n: number }>(
    `SELECT target_id, value, count(*) n FROM stances WHERE target_type = ? AND target_id IN (${ph}) GROUP BY target_id, value`,
    [type, ...uniq],
  )) {
    const s = out.get(r.target_id) ?? { ...EMPTY_SPLIT };
    s[r.value] = r.n;
    s.total += r.n;
    out.set(r.target_id, s);
  }
  if (viewerId) {
    for (const r of all<{ target_id: string; value: StanceValue }>(
      `SELECT target_id, value FROM stances WHERE user_id = ? AND target_type = ? AND target_id IN (${ph})`,
      [viewerId, type, ...uniq],
    )) {
      const s = out.get(r.target_id) ?? { ...EMPTY_SPLIT };
      s.mine = r.value;
      out.set(r.target_id, s);
    }
  }
  return out;
}

export function splitFor(type: StanceTarget, id: string, viewerId: string | null): Split {
  return splits(type, [id], viewerId).get(id) ?? { ...EMPTY_SPLIT };
}

/**
 * Cast, change, or clear (value = null) your stance on a Story or a Take.
 * Returns the new split so the meter can confirm its optimistic update.
 */
export function castStance(user: UserRow, type: StanceTarget, id: string, value: StanceValue | null): Split {
  assertCanAct(user);
  if (value !== null && !VALUES.has(value)) throw new AppError("Pick agree, disagree, or unsure.");
  if (type === "story") {
    if (!get("SELECT 1 FROM stories WHERE key = ?", [id])) throw new AppError("Story not found.", "not_found");
  } else {
    const p = get<{ author_id: string; deleted_at: number | null; removed_at: number | null }>("SELECT author_id, deleted_at, removed_at FROM posts WHERE id = ?", [id]);
    if (!p || p.deleted_at || p.removed_at) throw new AppError("That take is no longer available.", "not_found");
    if (get("SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)", [p.author_id, user.id, user.id, p.author_id])) {
      throw new AppError("You can't interact with this account.", "blocked");
    }
  }
  if (value) {
    rateLimit("like", user.id);
    run(
      `INSERT INTO stances (user_id, target_type, target_id, value, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, target_type, target_id) DO UPDATE SET value = excluded.value, created_at = excluded.created_at`,
      [user.id, type, id, value, now()],
    );
  } else {
    run("DELETE FROM stances WHERE user_id = ? AND target_type = ? AND target_id = ?", [user.id, type, id]);
  }
  return splitFor(type, id, user.id);
}

import { all, get, newId, now, run, tx } from "../db";
import { AppError } from "../errors";
import { rateLimit } from "../ratelimit";
import { safeHttpUrl } from "../text";
import { factorize, judgeNote, raterGroup, VALUE, type NoteStatus, type Obs } from "./bridging";

/**
 * Context notes: short, sourced notes that add context to a dispatch or a
 * story. Anyone signed in (with an account at least NOTE_MIN_ACCOUNT_DAYS
 * old) can write one; everyone else rates it; it shows publicly only when
 * raters from different viewpoint groups agree it's helpful (see bridging.ts).
 */
export const NOTE_MAX = 280;
export const NOTE_MIN = 20;
export const NOTE_MIN_ACCOUNT_DAYS = 3;
/** Ratings from accounts younger than this are saved but don't count yet. */
export const RATER_MIN_ACCOUNT_HOURS = 24;
/** Notes with this many open abuse flags are hidden until an admin reviews them. */
export const FLAG_HIDE_AT = 3;
const DAY = 24 * 3_600_000;

export const REASONS = {
  helpful: ["Cites a good source", "Gives important context", "Easy to understand", "Directly addresses the claim", "Neutral wording"],
  somewhat: ["Partly helpful", "Missing some context", "Source could be stronger"],
  not_helpful: ["Source missing or unreliable", "Incorrect", "Opinion or speculation", "Argumentative or loaded wording", "Off topic", "Spam or abuse"],
} as const;
export type RatingValue = keyof typeof VALUE;
export const FLAG_REASONS = ["Spam", "Harassment or hate", "Personal information", "Off topic", "Coordinated or fake ratings", "Something else"] as const;

type Actor = { id: string; role: string; status?: string; created_at: number };

export type NoteView = {
  id: string; body: string; sourceUrl: string; sourceDomain: string; status: NoteStatus | "removed"; createdAt: number; ratings: number;
  author: { handle: string } | null; mine: boolean; myRating: RatingValue | null;
  groups: { a: { n: number; avg: number }; b: { n: number; avg: number } } | null; hidden: boolean;
};

type NoteRow = { id: string; author_id: string; target_type: "post" | "story"; target_id: string; body: string; source_url: string; status: NoteStatus | "removed"; ratings: number; detail: string; created_at: number; handle: string | null; flags: number };

const domain = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

function view(r: NoteRow, viewerId: string | null, my: Map<string, RatingValue>): NoteView {
  const d = JSON.parse(r.detail || "{}") as { groups?: NoteView["groups"] };
  return {
    id: r.id, body: r.body, sourceUrl: r.source_url, sourceDomain: domain(r.source_url), status: r.status, createdAt: r.created_at, ratings: r.ratings,
    author: r.handle ? { handle: r.handle } : null, mine: r.author_id === viewerId, myRating: my.get(r.id) ?? null, groups: d.groups ?? null, hidden: r.flags >= FLAG_HIDE_AT,
  };
}

const NOTE_SQL = `SELECT n.*, u.handle, (SELECT count(*) FROM note_flags f WHERE f.note_id = n.id AND f.resolved_at IS NULL) flags FROM context_notes n LEFT JOIN users u ON u.id = n.author_id`;

function targetExists(type: "post" | "story", id: string) {
  return type === "post"
    ? get<{ author_id: string }>("SELECT author_id FROM posts WHERE id = ? AND deleted_at IS NULL AND removed_at IS NULL", [id])
    : get<{ author_id: string }>("SELECT NULL author_id FROM stories WHERE key = ?", [id]);
}

export function createNote(u: Actor, input: { targetType: string; targetId: string; body: string; sourceUrl: string }) {
  if (u.status && u.status !== "active") throw new AppError("Your account can't write notes right now.", "forbidden");
  const type = input.targetType === "story" ? "story" : input.targetType === "post" ? "post" : null;
  if (!type) throw new AppError("Notes go on a dispatch or a story.");
  if (u.role !== "admin" && now() - u.created_at < NOTE_MIN_ACCOUNT_DAYS * DAY) throw new AppError(`New accounts can write context notes after ${NOTE_MIN_ACCOUNT_DAYS} days. You can rate notes now.`, "forbidden");
  const target = targetExists(type, String(input.targetId));
  if (!target) throw new AppError("That dispatch or story isn't available.", "not_found");
  if (type === "post" && target.author_id === u.id) throw new AppError("You can't add a context note to your own dispatch.");
  const body = input.body.trim().replace(/\s+/g, " ");
  if (body.length < NOTE_MIN) throw new AppError(`Write at least ${NOTE_MIN} characters.`);
  if (body.length > NOTE_MAX) throw new AppError(`Keep it under ${NOTE_MAX + 1} characters.`);
  const src = safeHttpUrl(input.sourceUrl);
  if (!src) throw new AppError("Add a source link (starting with https://).");
  if (get("SELECT 1 FROM context_notes WHERE author_id = ? AND target_type = ? AND target_id = ? AND status != 'removed'", [u.id, type, input.targetId])) throw new AppError("You already wrote a note here.");
  rateLimit("note", u.id);
  const id = newId();
  run("INSERT INTO context_notes (id, author_id, target_type, target_id, body, source_url, created_at, status_changed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [id, u.id, type, input.targetId, body, src, now(), now()]);
  return id;
}

export function rateNote(u: Actor, noteId: string, value: string, reason: string) {
  if (u.status && u.status !== "active") throw new AppError("Your account can't rate notes right now.", "forbidden");
  const n = get<{ author_id: string; status: string }>("SELECT author_id, status FROM context_notes WHERE id = ?", [noteId]);
  if (!n || n.status === "removed") throw new AppError("That note isn't available.", "not_found");
  if (n.author_id === u.id) throw new AppError("You can't rate your own note.");
  if (!(value in VALUE)) throw new AppError("Pick Helpful, Somewhat helpful or Not helpful.");
  const reasons = REASONS[value as RatingValue] as readonly string[];
  if (!reasons.includes(reason)) throw new AppError("Pick a reason.");
  rateLimit("noteRating", u.id);
  run(
    "INSERT INTO note_ratings (note_id, rater_id, value, reason, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(note_id, rater_id) DO UPDATE SET value = excluded.value, reason = excluded.reason, created_at = excluded.created_at",
    [noteId, u.id, value, reason, now()],
  );
  scoreNotes();
  return get<{ status: string }>("SELECT status FROM context_notes WHERE id = ?", [noteId])!.status as NoteStatus;
}

export function flagNote(u: Actor, noteId: string, reason: string) {
  if (!(FLAG_REASONS as readonly string[]).includes(reason)) throw new AppError("Pick a reason.");
  if (!get("SELECT 1 FROM context_notes WHERE id = ?", [noteId])) throw new AppError("That note isn't available.", "not_found");
  if (get("SELECT 1 FROM note_flags WHERE note_id = ? AND reporter_id = ? AND resolved_at IS NULL", [noteId, u.id])) return;
  rateLimit("noteFlag", u.id);
  run("INSERT INTO note_flags (id, note_id, reporter_id, reason, created_at) VALUES (?, ?, ?, ?, ?)", [newId(), noteId, u.id, reason, now()]);
}

/**
 * Re-fit the bridging model and update every note's status. Inputs: note
 * ratings from active accounts at least a day old, plus agree/disagree
 * stances (most recent 50,000) so viewpoints are known before notes exist.
 */
export function scoreNotes() {
  const t = now();
  const ratings = all<{ note_id: string; rater_id: string; value: RatingValue }>(
    `SELECT r.note_id, r.rater_id, r.value FROM note_ratings r JOIN users u ON u.id = r.rater_id JOIN context_notes n ON n.id = r.note_id
     WHERE u.status = 'active' AND u.created_at < ? AND n.status != 'removed'`,
    [t - RATER_MIN_ACCOUNT_HOURS * 3_600_000],
  );
  const stances = all<{ user_id: string; target_type: string; target_id: string; value: string }>(
    `SELECT s.user_id, s.target_type, s.target_id, s.value FROM stances s JOIN users u ON u.id = s.user_id
     WHERE u.status = 'active' AND s.value IN ('agree','disagree') ORDER BY s.created_at DESC LIMIT 50000`,
  );
  const obs: Obs[] = [
    ...ratings.map((r) => ({ rater: r.rater_id, item: `note:${r.note_id}`, value: VALUE[r.value] })),
    ...stances.map((s) => ({ rater: s.user_id, item: `stance:${s.target_type}:${s.target_id}`, value: s.value === "agree" ? 1 : 0 })),
  ];
  const m = factorize(obs);
  const byNote = new Map<string, { rater: string; value: number }[]>();
  for (const r of ratings) (byNote.get(r.note_id) ?? byNote.set(r.note_id, []).get(r.note_id)!).push({ rater: r.rater_id, value: VALUE[r.value] });
  const changed: { id: string; from: string; to: NoteStatus }[] = [];
  tx(() => {
    for (const n of all<{ id: string; status: NoteStatus; ratings: number }>("SELECT id, status, ratings FROM context_notes WHERE status != 'removed'")) {
      const rs = byNote.get(n.id) ?? [];
      const v = judgeNote(m, `note:${n.id}`, rs, n.status);
      const total = get<{ c: number }>("SELECT count(*) c FROM note_ratings WHERE note_id = ?", [n.id])!.c;
      if (v.status !== n.status) changed.push({ id: n.id, from: n.status, to: v.status });
      run(
        `UPDATE context_notes SET status = ?, intercept = ?, factor = ?, ratings = ?, detail = ?,
           published_at = CASE WHEN ? = 'published' AND status != 'published' THEN ? ELSE published_at END,
           status_changed_at = CASE WHEN status != ? THEN ? ELSE status_changed_at END WHERE id = ?`,
        [v.status, v.intercept, v.factor, total, JSON.stringify({ groups: v.groups, grouped: v.grouped }), v.status, t, v.status, t, n.id],
      );
    }
    for (const [u, f] of m.raterF) {
      if (u.startsWith("stance:")) continue;
      run("INSERT INTO rater_scores (user_id, factor, grp, ratings, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET factor = excluded.factor, grp = excluded.grp, ratings = excluded.ratings, updated_at = excluded.updated_at", [
        u, f, raterGroup(m, u), m.raterN.get(u) ?? 0, t,
      ]);
    }
  });
  return changed;
}

/** Notes for one dispatch or story: the public ones, plus (for a signed-in viewer) the ones waiting for ratings. */
export function notesFor(type: "post" | "story", id: string, viewerId: string | null) {
  const rows = all<NoteRow>(`${NOTE_SQL} WHERE n.target_type = ? AND n.target_id = ? AND n.status != 'removed' ORDER BY n.status = 'published' DESC, n.created_at DESC`, [type, id]);
  const my = new Map<string, RatingValue>(viewerId && rows.length ? all<{ note_id: string; value: RatingValue }>(`SELECT note_id, value FROM note_ratings WHERE rater_id = ? AND note_id IN (${rows.map(() => "?").join(",")})`, [viewerId, ...rows.map((r) => r.id)]).map((r) => [r.note_id, r.value]) : []);
  const views = rows.map((r) => view(r, viewerId, my));
  return {
    published: views.filter((v) => v.status === "published" && !v.hidden),
    pending: viewerId ? views.filter((v) => v.status === "needs_ratings" && !v.hidden) : [],
    mine: views.filter((v) => v.mine),
  };
}

/** The public note (if any) for each of many dispatches, for feeds. */
export function publishedNotesForPosts(ids: string[]): Map<string, { id: string; body: string; sourceUrl: string; sourceDomain: string }> {
  if (!ids.length) return new Map();
  const rows = all<{ id: string; target_id: string; body: string; source_url: string }>(
    `SELECT n.id, n.target_id, n.body, n.source_url FROM context_notes n WHERE n.target_type = 'post' AND n.status = 'published' AND n.target_id IN (${ids.map(() => "?").join(",")})
       AND (SELECT count(*) FROM note_flags f WHERE f.note_id = n.id AND f.resolved_at IS NULL) < ${FLAG_HIDE_AT}
     ORDER BY n.published_at`,
    ids,
  );
  const out = new Map<string, { id: string; body: string; sourceUrl: string; sourceDomain: string }>();
  for (const r of rows) if (!out.has(r.target_id)) out.set(r.target_id, { id: r.id, body: r.body, sourceUrl: r.source_url, sourceDomain: domain(r.source_url) });
  return out;
}

export function getNote(id: string, viewerId: string | null) {
  const r = get<NoteRow>(`${NOTE_SQL} WHERE n.id = ?`, [id]);
  if (!r) return null;
  const my = new Map<string, RatingValue>();
  if (viewerId) {
    const m = get<{ value: RatingValue }>("SELECT value FROM note_ratings WHERE note_id = ? AND rater_id = ?", [id, viewerId]);
    if (m) my.set(id, m.value);
  }
  return { ...view(r, viewerId, my), targetType: r.target_type, targetId: r.target_id };
}

// ------------------------------------------------------------------ Control Room

export function abuseQueue() {
  const flagged = all<NoteRow & { reasons: string; first_flag: number }>(
    `${NOTE_SQL.replace("FROM context_notes n", ", (SELECT group_concat(reason, ' · ') FROM note_flags f WHERE f.note_id = n.id AND f.resolved_at IS NULL) reasons, (SELECT min(created_at) FROM note_flags f WHERE f.note_id = n.id AND f.resolved_at IS NULL) first_flag FROM context_notes n")}
     WHERE EXISTS (SELECT 1 FROM note_flags f WHERE f.note_id = n.id AND f.resolved_at IS NULL) ORDER BY flags DESC, first_flag`,
  );
  const hour = now() - 3_600_000;
  // Raters moving unusually fast, and accounts whose notes keep getting removed or rejected.
  const fastRaters = all<{ handle: string; n: number }>("SELECT u.handle, count(*) n FROM note_ratings r JOIN users u ON u.id = r.rater_id WHERE r.created_at > ? GROUP BY r.rater_id HAVING n >= 20 ORDER BY n DESC LIMIT 20", [hour]);
  const badAuthors = all<{ handle: string; removed: number; rejected: number }>(
    "SELECT u.handle, SUM(n.status = 'removed') removed, SUM(n.status = 'not_helpful') rejected FROM context_notes n JOIN users u ON u.id = n.author_id GROUP BY n.author_id HAVING removed + rejected >= 3 ORDER BY removed DESC, rejected DESC LIMIT 20",
  );
  const recent = all<{ id: string; body: string; status: string; status_changed_at: number }>("SELECT id, body, status, status_changed_at FROM context_notes WHERE status_changed_at IS NOT NULL ORDER BY status_changed_at DESC LIMIT 15");
  return { flagged: flagged.map((r) => ({ ...view(r, null, new Map()), reasons: r.reasons, targetType: r.target_type, targetId: r.target_id })), fastRaters, badAuthors, recent };
}

export function reviewNote(admin: Actor, noteId: string, action: "remove" | "dismiss" | "restore") {
  if (admin.role !== "admin") throw new AppError("Admins only.", "forbidden");
  tx(() => {
    if (action === "remove") run("UPDATE context_notes SET status = 'removed', status_changed_at = ? WHERE id = ?", [now(), noteId]);
    if (action === "restore") run("UPDATE context_notes SET status = 'needs_ratings', status_changed_at = ? WHERE id = ? AND status = 'removed'", [now(), noteId]);
    run("UPDATE note_flags SET resolved_at = ? WHERE note_id = ? AND resolved_at IS NULL", [now(), noteId]);
  });
  if (action !== "remove") scoreNotes();
}

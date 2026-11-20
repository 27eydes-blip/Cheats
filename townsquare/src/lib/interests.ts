import { AppError } from "./errors";
import { all, get, now, run, tx } from "./db";
import { BEAT_TOPIC, clampWeight, SECTION_TOPIC, SIGNAL, TOPICS, type Profile, type Topic } from "./ranking";

export type Target = { type: "post" | "story"; id: string };
type Facets = { topic: Topic | null; authorId: string | null; tags: string[] };

/** Topic, author and tags of a post or story (what interest signals attach to). */
export function facetsOf(t: Target): Facets | null {
  if (t.type === "story") {
    const s = get<{ section: string; tag: string | null }>("SELECT section, tag FROM stories WHERE key = ?", [t.id]);
    return s ? { topic: SECTION_TOPIC[s.section] ?? "national", authorId: null, tags: s.tag ? [s.tag.toLowerCase()] : [] } : null;
  }
  const p = get<{ author_id: string; section: string | null }>(
    "SELECT p.author_id, s.section FROM posts p LEFT JOIN stories s ON s.key = p.story_key WHERE p.id = ?",
    [t.id],
  );
  if (!p) return null;
  const tags = all<{ tag: string }>("SELECT tag FROM post_hashtags WHERE post_id = ? LIMIT 5", [t.id]).map((r) => r.tag);
  return { topic: p.section ? (SECTION_TOPIC[p.section] ?? "national") : null, authorId: p.author_id, tags };
}

function bump(userId: string, kind: "topic" | "author" | "tag", key: string, delta: number) {
  if (!delta) return;
  const cur = get<{ weight: number }>("SELECT weight FROM interests WHERE user_id = ? AND kind = ? AND key = ?", [userId, kind, key])?.weight ?? 0;
  run(
    `INSERT INTO interests (user_id, kind, key, weight, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, kind, key) DO UPDATE SET weight = excluded.weight, updated_at = excluded.updated_at`,
    [userId, kind, key, clampWeight(cur + delta), now()],
  );
}

/** Apply one signal (react, reply, click, "show more", …) to the viewer's interests. */
export function recordSignal(userId: string, target: Target, signal: keyof typeof SIGNAL) {
  const f = facetsOf(target);
  if (!f) return;
  const s = SIGNAL[signal];
  tx(() => {
    if (f.topic) bump(userId, "topic", f.topic, s.topic);
    if (f.authorId && f.authorId !== userId) bump(userId, "author", f.authorId, s.author);
    for (const t of f.tags) bump(userId, "tag", t, s.topic * 0.6);
  });
}

export function signalAuthor(userId: string, authorId: string, signal: keyof typeof SIGNAL) {
  if (authorId !== userId) bump(userId, "author", authorId, SIGNAL[signal].author);
}

/** Onboarding beats seed topic interests. */
export function seedFromBeats(userId: string, beats: string[]) {
  const topics = [...new Set(beats.map((b) => BEAT_TOPIC[b]).filter(Boolean))];
  tx(() => topics.forEach((t) => bump(userId, "topic", t, SIGNAL.onboarding.topic)));
}

export function loadProfile(viewerId: string | null): Profile {
  const p: Profile = { topics: {}, authors: {}, tags: {}, viewerId };
  if (!viewerId) return p;
  for (const r of all<{ kind: string; key: string; weight: number }>("SELECT kind, key, weight FROM interests WHERE user_id = ?", [viewerId])) {
    const bucket = r.kind === "topic" ? p.topics : r.kind === "author" ? p.authors : p.tags;
    bucket[r.key] = r.weight;
  }
  return p;
}

/** "Not interested": hide this item and turn its topic and account down. */
export function notInterested(userId: string, target: Target) {
  if (!facetsOf(target)) throw new AppError("That item is no longer available.", "not_found");
  run("INSERT OR IGNORE INTO feed_dismissals (user_id, target_type, target_id, created_at) VALUES (?, ?, ?, ?)", [userId, target.type, target.id, now()]);
  recordSignal(userId, target, "notInterested");
}

/** "Show more like this": turn its topic and account up. */
export function showMore(userId: string, target: Target) {
  if (!facetsOf(target)) throw new AppError("That item is no longer available.", "not_found");
  recordSignal(userId, target, "showMore");
}

export function muteTopic(userId: string, topic: string, on: boolean) {
  if (!(TOPICS as readonly string[]).includes(topic)) throw new AppError("Unknown topic.");
  if (on) run("INSERT OR IGNORE INTO muted_topics (user_id, topic, created_at) VALUES (?, ?, ?)", [userId, topic, now()]);
  else run("DELETE FROM muted_topics WHERE user_id = ? AND topic = ?", [userId, topic]);
}

export const mutedTopics = (userId: string | null) =>
  userId ? all<{ topic: string }>("SELECT topic FROM muted_topics WHERE user_id = ? ORDER BY topic", [userId]).map((r) => r.topic) : [];

export type TrackEvent = { type: "post" | "story"; id: string; kind: "view" | "click" | "dwell" | "share"; ms?: number };

/**
 * Store client engagement events (views, clicks, time on card). Logged-in
 * viewers' clicks and long dwells also feed their interests.
 */
export function trackEvents(userId: string | null, events: TrackEvent[]) {
  const t = now();
  const clean = events
    .filter((e) => (e.type === "post" || e.type === "story") && typeof e.id === "string" && e.id.length <= 64 && ["view", "click", "dwell", "share"].includes(e.kind))
    .slice(0, 50);
  tx(() => {
    for (const e of clean) {
      run("INSERT INTO engagement_events (user_id, target_type, target_id, kind, ms, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
        userId, e.type, e.id, e.kind, Math.max(0, Math.min(600_000, Math.round(e.ms ?? 0))), t,
      ]);
    }
  });
  if (!userId) return;
  for (const e of clean) {
    if (e.kind === "click" || e.kind === "share") recordSignal(userId, { type: e.type, id: e.id }, e.kind);
    else if (e.kind === "dwell" && (e.ms ?? 0) >= 8000) recordSignal(userId, { type: e.type, id: e.id }, "dwell");
  }
}

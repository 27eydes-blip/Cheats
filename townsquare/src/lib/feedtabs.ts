import { AppError } from "./errors";
import { all, get, now, run, tx } from "./db";
import { DEFAULT_TOPIC_TABS, MAX_FEED_TABS, TOPIC_LABEL } from "./feedtabs-meta";
import { BEAT_TOPIC } from "./ranking";
import { getTeam, type TeamView } from "./sports/teams";

export type FeedTab = { kind: "topic"; key: string; label: string } | { kind: "team"; key: string; label: string; team: TeamView };

const initKey = (userId: string) => `feedtabs-init:${userId}`;

/** First use: start from the beats picked at sign-up (or the house defaults). */
function ensureOwn(userId: string) {
  if (get("SELECT 1 FROM site_settings WHERE key = ?", [initKey(userId)])) return;
  const u = get<{ interests: string }>("SELECT interests FROM users WHERE id = ?", [userId]);
  const beats: string[] = JSON.parse(u?.interests || "[]");
  const fromBeats = [...new Set(beats.map((b) => BEAT_TOPIC[b]).filter((t) => t in TOPIC_LABEL))];
  const topics = (fromBeats.length ? fromBeats : DEFAULT_TOPIC_TABS).slice(0, 6);
  tx(() => {
    topics.forEach((t, i) => run("INSERT OR IGNORE INTO feed_tabs (user_id, kind, key, position, created_at) VALUES (?, 'topic', ?, ?, ?)", [userId, t, i, now()]));
    run("INSERT OR IGNORE INTO site_settings (key, value) VALUES (?, '1')", [initKey(userId)]);
  });
}

/** The topic and team tabs after "For You" and "Friends". Logged-out visitors get the defaults. */
export function getFeedTabs(userId: string | null): FeedTab[] {
  if (!userId) return DEFAULT_TOPIC_TABS.map((key) => ({ kind: "topic", key, label: TOPIC_LABEL[key] }));
  ensureOwn(userId);
  const out: FeedTab[] = [];
  for (const r of all<{ kind: "topic" | "team"; key: string }>("SELECT kind, key FROM feed_tabs WHERE user_id = ? ORDER BY position, created_at", [userId])) {
    if (r.kind === "topic" && r.key in TOPIC_LABEL) out.push({ kind: "topic", key: r.key, label: TOPIC_LABEL[r.key] });
    else if (r.kind === "team") {
      const team = getTeam(r.key);
      if (team) out.push({ kind: "team", key: r.key, label: team.name.length > 14 ? team.abbr : team.name, team });
    }
  }
  return out;
}

export function addFeedTab(userId: string, kind: string, key: string) {
  ensureOwn(userId);
  if (kind === "topic" ? !(key in TOPIC_LABEL) : kind === "team" ? !getTeam(key) : true) throw new AppError("That topic or team doesn't exist.");
  const n = get<{ n: number; mx: number | null }>("SELECT count(*) n, max(position) mx FROM feed_tabs WHERE user_id = ?", [userId])!;
  if (get("SELECT 1 FROM feed_tabs WHERE user_id = ? AND kind = ? AND key = ?", [userId, kind, key])) return;
  if (n.n >= MAX_FEED_TABS) throw new AppError(`You can pin up to ${MAX_FEED_TABS} tabs. Remove one first.`);
  run("INSERT INTO feed_tabs (user_id, kind, key, position, created_at) VALUES (?, ?, ?, ?, ?)", [userId, kind, key, (n.mx ?? -1) + 1, now()]);
}

export function removeFeedTab(userId: string, kind: string, key: string) {
  ensureOwn(userId);
  run("DELETE FROM feed_tabs WHERE user_id = ? AND kind = ? AND key = ?", [userId, kind, key]);
}

import { createHash } from "node:crypto";
import { all, get, now, run } from "../db";
import { AppError } from "../errors";
import { onStories } from "../newsroom/ingest";
import { teamsForStories } from "../sports/teams";
import { alertUser, pushConfigured, type Payload } from "./push";

/** Story importance (0–100) that triggers an automatic breaking alert; also needs 8+ outlets and a story under 6 hours old. */
export const BREAKING_AUTO_SCORE = () => Number(process.env.BREAKING_AUTO_SCORE) || 85;
/** Followed-topic and team alerts only for stories at least this important. */
export const FOLLOW_ALERT_SCORE = () => Number(process.env.FOLLOW_ALERT_SCORE) || 55;
const MAX_AUTO_PER_DAY = 6;
const TOPIC_FOR: Record<string, string> = { US: "national", World: "world", Politics: "politics", Markets: "markets", Sports: "sports", Tech: "tech" };

type Admin = { id: string; role: string } | null;
type StoryRow = { key: string; title: string; summary: string; category: string | null; importance: number; created_at: number; origin: string; outlets: number };
const storyRow = (key: string) =>
  get<StoryRow>("SELECT s.key, s.title, s.summary, s.category, s.importance, s.created_at, s.origin, (SELECT count(DISTINCT source_id) FROM news_items n WHERE n.story_key = s.key) outlets FROM stories s WHERE s.key = ?", [key]);

/** What a breaking alert will look like, and whether it was already sent. */
export function breakingPreview(input: { storyKey?: string; title?: string; body?: string; url?: string }) {
  let key: string, payload: Payload;
  if (input.storyKey) {
    const s = storyRow(input.storyKey);
    if (!s) throw new AppError("Story not found.", "not_found");
    key = s.key;
    payload = { title: "Breaking news", body: (input.title?.trim() || s.title).slice(0, 140), url: `/news/story/${s.key}`, tag: `breaking-${s.key}` };
  } else {
    const title = (input.title ?? "").trim();
    const url = (input.url ?? "").trim();
    if (!title) throw new AppError("Write the alert text.");
    if (!(url.startsWith("/") && !url.startsWith("//"))) throw new AppError("Link to a page on this site, e.g. /news/story/…");
    key = `custom:${createHash("sha256").update(url).digest("hex").slice(0, 16)}`;
    payload = { title: "Breaking news", body: title.slice(0, 140), url: url.slice(0, 200), tag: `breaking-${key}` };
  }
  if (input.body?.trim()) payload.body = `${payload.body}\n${input.body.trim().slice(0, 120)}`;
  const sent = get<{ sent_at: number; recipients: number }>("SELECT sent_at, recipients FROM breaking_alerts WHERE story_key = ?", [key]);
  const recipients = get<{ n: number }>("SELECT count(DISTINCT p.user_id) n FROM push_subscriptions p LEFT JOIN alert_prefs a ON a.user_id = p.user_id WHERE COALESCE(a.breaking, 1) = 1")!.n;
  return { key, payload, alreadySent: sent ?? null, recipients };
}

/**
 * Send a breaking alert to everyone who has breaking alerts on. Each story
 * (or custom link) can be sent only once, ever: the breaking_alerts row is
 * claimed before anything goes out. Each user's quiet hours and daily cap still apply.
 */
export async function sendBreaking(by: Admin, input: { storyKey?: string; title?: string; body?: string; url?: string }, auto = false) {
  if (!auto && by?.role !== "admin") throw new AppError("Editors only.", "forbidden");
  const pv = breakingPreview(input);
  if (pv.alreadySent) throw new AppError("This story was already sent as a breaking alert.");
  const claimed = run("INSERT OR IGNORE INTO breaking_alerts (story_key, title, body, url, sent_by, auto, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [pv.key, pv.payload.body, input.body ?? "", pv.payload.url, by?.id ?? null, auto ? 1 : 0, now()]);
  if (!claimed.changes) throw new AppError("This story was already sent as a breaking alert.");
  const users = all<{ user_id: string }>("SELECT DISTINCT user_id FROM push_subscriptions");
  const out = { users: users.length, sent: 0, skipped: {} as Record<string, number> };
  for (const u of users) {
    const r = await alertUser(u.user_id, "breaking", pv.key, pv.payload);
    if ("sent" in r) out.sent += r.sent > 0 ? 1 : 0;
    else out.skipped[r.skipped] = (out.skipped[r.skipped] ?? 0) + 1;
  }
  run("UPDATE breaking_alerts SET recipients = ? WHERE story_key = ?", [out.sent, pv.key]);
  return out;
}

export function breakingHistory(limit = 20) {
  return all<{ story_key: string; title: string; url: string; auto: number; recipients: number; sent_at: number; handle: string | null }>(
    "SELECT b.*, u.handle FROM breaking_alerts b LEFT JOIN users u ON u.id = b.sent_by ORDER BY b.sent_at DESC LIMIT ?",
    [limit],
  );
}

/** After each ingest: an automatic breaking alert for a very big new story, and alerts for followed topics and teams. */
export async function afterIngest(touched: string[], t = now()) {
  if (!pushConfigured() && !(globalThis as { __pushTransport?: unknown }).__pushTransport) return;
  const stories = touched.map(storyRow).filter((s): s is StoryRow => !!s && s.origin === "real");
  // Breaking: at most one per run and MAX_AUTO_PER_DAY a day, so a busy news day can't flood phones.
  const autoToday = get<{ n: number }>("SELECT count(*) n FROM breaking_alerts WHERE auto = 1 AND sent_at > ?", [t - 24 * 3_600_000])!.n;
  const big = stories
    .filter((s) => s.importance >= BREAKING_AUTO_SCORE() && s.outlets >= 8 && t - s.created_at < 6 * 3_600_000 && !get("SELECT 1 FROM breaking_alerts WHERE story_key = ?", [s.key]))
    .sort((a, b) => b.importance - a.importance)[0];
  if (big && autoToday < MAX_AUTO_PER_DAY) await sendBreaking(null, { storyKey: big.key }, true);

  const follow = stories.filter((s) => s.importance >= FOLLOW_ALERT_SCORE());
  if (!follow.length) return;
  const teams = teamsForStories(follow.map((s) => s.key));
  for (const s of follow) {
    const topic = s.category ? TOPIC_FOR[s.category] : null;
    const teamIds = (teams.get(s.key) ?? []).map((x) => x.id);
    const keys = [...(topic ? [["topic", topic]] : []), ...teamIds.map((id) => ["team", id])];
    if (!keys.length) continue;
    const users = all<{ user_id: string; kind: string; key: string }>(
      `SELECT DISTINCT f.user_id, f.kind, f.key FROM feed_tabs f WHERE EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = f.user_id) AND (${keys.map(() => "(f.kind = ? AND f.key = ?)").join(" OR ")})`,
      keys.flat(),
    );
    const seen = new Set<string>();
    for (const u of users) {
      if (seen.has(u.user_id)) continue;
      seen.add(u.user_id);
      const label = u.kind === "team" ? (teams.get(s.key) ?? []).find((x) => x.id === u.key)?.name ?? "Your team" : s.category!;
      await alertUser(u.user_id, "following", `story:${s.key}`, { title: label, body: s.title.slice(0, 140), url: `/news/story/${s.key}`, tag: `follow-${s.key}` }, t);
    }
  }
}

const g = globalThis as unknown as { __newsAlertsOn?: boolean };
export function registerNewsAlerts() {
  if (g.__newsAlertsOn) return;
  g.__newsAlertsOn = true;
  onStories(({ touched }) => afterIngest(touched));
}

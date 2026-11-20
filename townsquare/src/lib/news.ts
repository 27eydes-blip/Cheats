import { all, get, now } from "./db";
import { toMini, type UserMini } from "./users";

/** Read-only news and community listings for the Stage 2 tabs (seeded data for now). */
export const NEWS_SECTIONS = ["Top Stories", "Politics", "World", "Business", "Sports", "Tech", "Entertainment", "Local"] as const;

export type NewsItemView = { id: string; title: string; summary: string; url: string; section: string; source: string; sourceUrl: string; publishedAt: number; storyKey: string | null };

export function latestNews(section?: string, limit = 50): NewsItemView[] {
  const where = section && section !== "Top Stories" ? "WHERE n.section = ?" : "";
  return all<{ id: string; title: string; summary: string; url: string; section: string; name: string; homepage: string; published_at: number; story_key: string | null }>(
    `SELECT n.id, n.title, n.summary, n.url, n.section, s.name, s.homepage, n.published_at, n.story_key
     FROM news_items n JOIN news_sources s ON s.id = n.source_id ${where} ORDER BY n.published_at DESC LIMIT ?`,
    where ? [section!, limit] : [limit],
  ).map((r) => ({ id: r.id, title: r.title, summary: r.summary, url: r.url, section: r.section, source: r.name, sourceUrl: r.homepage, publishedAt: r.published_at, storyKey: r.story_key }));
}


export type StorySummary = { key: string; title: string; summary: string; section: string; tag: string | null; status: "live" | "developing" | "ended"; updatedAt: number; updates: number; outlets: number };

export function listStories(limit = 10): StorySummary[] {
  return all<{ key: string; title: string; summary: string; section: string; tag: string | null; status: StorySummary["status"]; updated_at: number; updates: number; outlets: number }>(
    `SELECT s.*, (SELECT count(*) FROM story_updates u WHERE u.story_key = s.key) updates,
       (SELECT count(DISTINCT source_id) FROM news_items n WHERE n.story_key = s.key) outlets
     FROM stories s ORDER BY (s.status = 'live') DESC, s.updated_at DESC LIMIT ?`,
    [limit],
  ).map((r) => ({ key: r.key, title: r.title, summary: r.summary, section: r.section, tag: r.tag, status: r.status, updatedAt: r.updated_at, updates: r.updates, outlets: r.outlets }));
}

export type StoryUpdate = { id: string; body: string; kind: "update" | "key" | "quote"; createdAt: number; author: UserMini | null; source: string | null };

export function getStory(key: string) {
  const s = listStories(100).find((x) => x.key === key);
  if (!s) return null;
  const updates = all<{ id: string; body: string; kind: StoryUpdate["kind"]; created_at: number; author_id: string | null; handle: string | null; display_name: string | null; avatar_media_id: string | null; verified: number | null; source: string | null }>(
    `SELECT u.id, u.body, u.kind, u.created_at, u.author_id, a.handle, a.display_name, a.avatar_media_id, a.verified, src.name source
     FROM story_updates u LEFT JOIN users a ON a.id = u.author_id LEFT JOIN news_sources src ON src.id = u.source_id
     WHERE u.story_key = ? ORDER BY u.created_at DESC`,
    [key],
  ).map((r): StoryUpdate => ({
    id: r.id, body: r.body, kind: r.kind, createdAt: r.created_at, source: r.source,
    author: r.author_id && r.handle ? toMini({ id: r.author_id, handle: r.handle, display_name: r.display_name!, avatar_media_id: r.avatar_media_id, verified: r.verified ?? 0 }) : null,
  }));
  const coverage = all<{ id: string; title: string; summary: string; url: string; name: string; homepage: string; published_at: number }>(
    `SELECT n.id, n.title, n.summary, n.url, s.name, s.homepage, n.published_at FROM news_items n JOIN news_sources s ON s.id = n.source_id
     WHERE n.story_key = ? ORDER BY n.published_at DESC`,
    [key],
  ).map((r) => ({ id: r.id, title: r.title, summary: r.summary, url: r.url, source: r.name, sourceUrl: r.homepage, publishedAt: r.published_at }));
  return { ...s, updates, coverage };
}

/** Headlines for the top ticker: the admin banner first, then live stories. */
export function tickerStories() {
  return listStories(5).filter((s) => s.status !== "ended");
}

export type LiveEventView = {
  id: string; kind: "liveblog" | "stream" | "audio" | "debate"; title: string; description: string; tag: string | null;
  startsAt: number; endsAt: number | null; viewers: number; host: UserMini | null; isLive: boolean;
};

export function liveEvents(): LiveEventView[] {
  const t = now();
  return all<{ id: string; kind: LiveEventView["kind"]; title: string; description: string; tag: string | null; starts_at: number; ends_at: number | null; viewers: number; host_id: string | null; handle: string | null; display_name: string | null; avatar_media_id: string | null; verified: number | null }>(
    `SELECT e.*, u.handle, u.display_name, u.avatar_media_id, u.verified FROM live_events e LEFT JOIN users u ON u.id = e.host_id
     WHERE e.ends_at IS NULL OR e.ends_at > ? ORDER BY e.starts_at`,
    [t],
  ).map((r) => ({
    id: r.id, kind: r.kind, title: r.title, description: r.description, tag: r.tag, startsAt: r.starts_at, endsAt: r.ends_at, viewers: r.viewers,
    host: r.host_id && r.handle ? { ...toMini({ id: r.host_id, handle: r.handle, display_name: r.display_name!, avatar_media_id: r.avatar_media_id, verified: r.verified ?? 0 }), live: r.starts_at <= t } : null,
    isLive: r.starts_at <= t,
  }));
}

export function liveEvent(id: string) {
  return liveEvents().find((e) => e.id === id) ?? null;
}

export function storyKeyExists(key: string) {
  return !!get("SELECT 1 FROM stories WHERE key = ?", [key]);
}

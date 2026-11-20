import { all, get, now, run } from "./db";
import { AppError } from "./errors";
import { saveImage } from "./media";
import { splits, EMPTY_SPLIT, type Split } from "./stance";
import { toMini, type UserMini } from "./users";

/** Read-only news and community listings for the Stage 2 tabs (seeded data for now). */
/** National channels (the masthead dial). "Top Stories" is the Front Page. */
export const NEWS_SECTIONS = ["Top Stories", "Politics", "World", "Business", "Tech", "Sports", "Culture"] as const;
export type Section = (typeof NEWS_SECTIONS)[number];

export type NewsItemView = { id: string; title: string; summary: string; url: string; section: string; source: string; sourceUrl: string; publishedAt: number; storyKey: string | null };

export function latestNews(section?: string, limit = 50): NewsItemView[] {
  const where = section && section !== "Top Stories" ? "WHERE n.section = ?" : "";
  return all<{ id: string; title: string; summary: string; url: string; section: string; name: string; homepage: string; published_at: number; story_key: string | null }>(
    `SELECT n.id, n.title, n.summary, n.url, n.section, s.name, s.homepage, n.published_at, n.story_key
     FROM news_items n JOIN news_sources s ON s.id = n.source_id ${where} ORDER BY n.published_at DESC LIMIT ?`,
    where ? [section!, limit] : [limit],
  ).map((r) => ({ id: r.id, title: r.title, summary: r.summary, url: r.url, section: r.section, source: r.name, sourceUrl: r.homepage, publishedAt: r.published_at, storyKey: r.story_key }));
}


export type StorySummary = {
  key: string; title: string; summary: string; section: string; tag: string | null;
  status: "live" | "developing" | "ended"; updatedAt: number; updates: number; outlets: number;
  /** The most recent outlet covering the story (shown as the card's source line). */
  source: string | null;
  /** Takes attached to the story, and how many arrived in the last 6 hours (velocity). */
  takes: number; velocity: number;
  /** Takes per 2-hour bucket over the last 24 hours (sparkline). */
  series: number[];
  split: Split;
  /** Editor-supplied photo (with credit and alt text); null means use generated art. */
  photo: StoryPhoto | null;
};

export type StoryPhoto = { url: string; alt: string; credit: string; blur: string | null };

type StoryRow = { lead_source: string | null; image_media_id: string | null; image_credit: string | null; photo_alt: string | null; photo_blur: string | null; key: string; title: string; summary: string; section: string; tag: string | null; status: StorySummary["status"]; updated_at: number; updates: number; outlets: number; takes: number; velocity: number };

/**
 * Stories for the Front Page. `order: "hot"` ranks by take velocity (the
 * Hot Stories module); the default puts live stories first, then freshest.
 */
export function listStories(limit = 10, opts: { section?: string; order?: "hot" | "fresh"; viewerId?: string | null } = {}): StorySummary[] {
  const t = now();
  const where = opts.section && opts.section !== "Top Stories" ? "WHERE s.section = ?" : "";
  const order = opts.order === "hot" ? "velocity DESC, takes DESC" : "(s.status = 'live') DESC, (s.status = 'ended') ASC, s.updated_at DESC";
  const rows = all<StoryRow>(
    `SELECT s.*, (SELECT alt FROM media m WHERE m.id = s.image_media_id) photo_alt, (SELECT blur FROM media m WHERE m.id = s.image_media_id) photo_blur, (SELECT count(*) FROM story_updates u WHERE u.story_key = s.key) updates,
       (SELECT count(DISTINCT source_id) FROM news_items n WHERE n.story_key = s.key) outlets,
       (SELECT src.name FROM news_items n JOIN news_sources src ON src.id = n.source_id WHERE n.story_key = s.key ORDER BY n.published_at DESC LIMIT 1) lead_source,
       (SELECT count(*) FROM posts p WHERE p.story_key = s.key AND p.deleted_at IS NULL AND p.removed_at IS NULL) takes,
       (SELECT count(*) FROM posts p WHERE p.story_key = s.key AND p.deleted_at IS NULL AND p.removed_at IS NULL AND p.created_at > ?) velocity
     FROM stories s ${where} ORDER BY ${order} LIMIT ?`,
    [t - 6 * 3_600_000, ...(where ? [opts.section!] : []), limit],
  );
  const keys = rows.map((r) => r.key);
  const sp = splits("story", keys, opts.viewerId ?? null);
  const series = new Map<string, number[]>(keys.map((k) => [k, Array(12).fill(0)]));
  if (keys.length) {
    for (const r of all<{ story_key: string; created_at: number }>(
      `SELECT story_key, created_at FROM posts WHERE story_key IN (${keys.map(() => "?").join(",")}) AND created_at > ? AND deleted_at IS NULL`,
      [...keys, t - 24 * 3_600_000],
    )) series.get(r.story_key)![Math.min(11, Math.floor((r.created_at - (t - 24 * 3_600_000)) / 7_200_000))]++;
  }
  return rows.map((r) => ({
    key: r.key, title: r.title, summary: r.summary, section: r.section, tag: r.tag, status: r.status, updatedAt: r.updated_at,
    updates: r.updates, outlets: r.outlets, source: r.lead_source, takes: r.takes, velocity: r.velocity, series: series.get(r.key)!, split: sp.get(r.key) ?? { ...EMPTY_SPLIT },
    photo: r.image_media_id ? { url: `/api/media/${r.image_media_id}`, alt: r.photo_alt ?? "", credit: r.image_credit ?? "", blur: r.photo_blur } : null,
  }));
}

export type StoryUpdate = { id: string; body: string; kind: "update" | "key" | "quote"; createdAt: number; author: UserMini | null; source: string | null };

export function getStory(key: string, viewerId: string | null = null) {
  const s = listStories(200, { viewerId }).find((x) => x.key === key);
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
  return listStories(6).filter((s) => s.status !== "ended");
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

/**
 * Editors attach a photo to a Story (or remove it to go back to the generated
 * art). Alt text and a credit line are required: we only show photos we can credit.
 */
export async function setStoryPhoto(editor: { id: string; role: string }, key: string, input: { file: File; alt: string; credit: string } | null) {
  if (editor.role !== "admin") throw new AppError("Editors only.", "forbidden");
  if (!get("SELECT 1 FROM stories WHERE key = ?", [key])) throw new AppError("Story not found.", "not_found");
  if (!input) {
    run("UPDATE stories SET image_media_id = NULL, image_credit = NULL WHERE key = ?", [key]);
    return;
  }
  const alt = input.alt.trim();
  const credit = input.credit.trim();
  if (!alt) throw new AppError("Describe the photo for screen-reader users (alt text).");
  if (!credit) throw new AppError("Add a credit line (photographer / agency).");
  const id = await saveImage(editor.id, input.file, "story", alt);
  run("UPDATE stories SET image_media_id = ?, image_credit = ? WHERE key = ?", [id, credit.slice(0, 80), key]);
}

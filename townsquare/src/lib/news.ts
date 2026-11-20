import { all } from "./db";

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

export function listCommunities() {
  return all<{ id: string; slug: string; name: string; description: string; visibility: string; members: number }>(
    `SELECT c.id, c.slug, c.name, c.description, c.visibility, (SELECT count(*) FROM memberships m WHERE m.community_id = c.id AND m.role != 'banned') members
     FROM communities c ORDER BY members DESC`,
  ).map((r) => ({ ...r }));
}

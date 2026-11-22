import { all, now } from "./db";
import { demoEnabled } from "./newsroom/settings";
import { computeCoverage, sideOf, type Coverage, type Side } from "./newsroom/coverage";
import type { Lean } from "./newsroom/outlets";
import { listStories, type StorySummary } from "./news";
import { SECTIONS, type SectionConfig, type SectionKey } from "./sections-meta";

export { SECTIONS, SECTION_KEYS, isSectionKey, sectionByPath, type SectionConfig, type SectionKey } from "./sections-meta";

/**
 * Dedicated section pages (Politics, World, Business, Tech, Culture), built
 * from one engine: a pool of stories, beats (sub-sections) by keywords, every
 * side of a story, blindspots, opinion across the spectrum, the day's coverage
 * balance, trending, and the AI desks. Only ingested articles and the outlets'
 * existing lean ratings are used; nothing is invented.
 */

const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9\s&-]/g, " ").replace(/-/g, " ").replace(/\s+/g, " ")} `;
const hits = (text: string, list: readonly string[]) => list.filter((k) => text.includes(` ${k} `)).length;

/** Which beats of a section a story belongs to (whole words in its headline, summary and article headlines). */
export function beatsFor(cfg: SectionConfig, text: string): string[] {
  const w = words(text);
  return Object.entries(cfg.beats)
    .filter(([, b]) => hits(w, b.words) > 0)
    .map(([k]) => k);
}

type ItemRow = { story_key: string; title: string; summary: string; url: string; published_at: number; opinion: number; source: string; source_id: string; lean: Lean | null; color: string };

function itemsFor(keys: string[]) {
  if (!keys.length) return new Map<string, ItemRow[]>();
  const rows = all<ItemRow>(
    `SELECT n.story_key, n.title, n.summary, n.url, n.published_at, n.opinion, s.name source, s.id source_id, s.lean, s.color
     FROM news_items n JOIN news_sources s ON s.id = n.source_id
     WHERE n.story_key IN (${keys.map(() => "?").join(",")}) ${demoEnabled() ? "" : "AND COALESCE(s.demo, 0) = 0"}
     ORDER BY n.published_at DESC`,
    keys,
  );
  const out = new Map<string, ItemRow[]>();
  for (const r of rows) out.set(r.story_key, [...(out.get(r.story_key) ?? []), r]);
  return out;
}

export type SideHeadline = { side: Side; source: string; title: string; url: string; opinion: boolean; publishedAt: number };

/** One headline per side of the spectrum (news over opinion, newest first), for "How it's covered". */
export function sideHeadlines(items: Pick<ItemRow, "title" | "url" | "published_at" | "opinion" | "source" | "lean">[]): Partial<Record<Side, SideHeadline>> {
  const out: Partial<Record<Side, SideHeadline>> = {};
  const sorted = [...items].sort((a, b) => a.opinion - b.opinion || b.published_at - a.published_at);
  for (const it of sorted) {
    const side = sideOf(it.lean);
    if (!side || out[side]) continue;
    out[side] = { side, source: it.source, title: it.title, url: it.url, opinion: !!it.opinion, publishedAt: it.published_at };
  }
  return out;
}

export type SectionStory = StorySummary & { beats: string[]; sides: Partial<Record<Side, SideHeadline>> };

/**
 * A section's stories: its own section's stories, plus (for sections the
 * ingest doesn't label, like Culture) stories from other sections whose
 * headlines clearly match the section's words.
 */
export function sectionStories(key: SectionKey, opts: { limit?: number; beat?: string | null; viewerId?: string | null } = {}): SectionStory[] {
  const cfg = SECTIONS[key];
  const limit = opts.limit ?? 30;
  const want = opts.beat || cfg.pool ? 160 : Math.max(40, limit * 2);
  const seen = new Set<string>();
  let pool: StorySummary[] = [];
  for (const section of cfg.storySections) for (const s of listStories(want, { section, viewerId: opts.viewerId ?? null })) if (!seen.has(s.key) && seen.add(s.key)) pool.push(s);
  if (cfg.pool) {
    for (const s of listStories(200, { viewerId: opts.viewerId ?? null })) {
      if (seen.has(s.key) || cfg.pool.exclude.includes(s.section)) continue;
      if (hits(words(`${s.title} ${s.summary}`), cfg.pool.words) >= cfg.pool.min) {
        seen.add(s.key);
        pool.push(s);
      }
    }
    // Keep the overall ranking: live first, then importance x freshness (the order listStories uses).
    pool = pool.sort((a, b) => Number(b.status === "live") - Number(a.status === "live") || b.importance - a.importance || b.updatedAt - a.updatedAt);
  }
  const items = itemsFor(pool.map((s) => s.key));
  const out: SectionStory[] = [];
  for (const s of pool) {
    const its = items.get(s.key) ?? [];
    const beats = beatsFor(cfg, [s.title, s.summary, ...its.map((i) => i.title)].join(" \n "));
    if (opts.beat && !beats.includes(opts.beat)) continue;
    out.push({ ...s, beats, sides: sideHeadlines(its) });
    if (out.length >= limit) break;
  }
  return out;
}

/** Stories covered mostly by one side, so readers of the other side may have missed them. */
export function blindspots(stories: SectionStory[], limit = 3) {
  // "Left" bucket: mostly Left-leaning coverage, or few Right-leaning outlets (and the reverse).
  const other = { left: "right", right: "left" } as const;
  const by = (side: "left" | "right") =>
    stories.filter((s) => s.coverage.flag && ((s.coverage.flag.kind === "lopsided" && s.coverage.flag.side === side) || (s.coverage.flag.kind === "missing" && s.coverage.flag.side === other[side]))).slice(0, limit);
  return { left: by("left"), right: by("right") };
}

/** Trending: the stories most outlets and readers are on right now. */
export function trending<T extends StorySummary>(stories: T[], limit = 5): T[] {
  const score = (s: StorySummary) => s.coverage.total * 2 + s.velocity * 3 + s.takes * 0.5 + s.importance / 25 + (s.status === "live" ? 5 : 0);
  return [...stories].sort((a, b) => score(b) - score(a)).slice(0, limit);
}

export type OpinionItem = { side: Side; source: string; title: string; url: string; publishedAt: number; storyKey: string | null; color: string };

/** The newest opinion pieces on a section's stories, grouped by the outlet's side (one per outlet per column). */
export function opinionAcrossSpectrum(key: SectionKey, perSide = 3, t = now()): Record<Side, OpinionItem[]> {
  const cfg = SECTIONS[key];
  const secs = cfg.storySections;
  const ph = secs.map(() => "?").join(",");
  const rows = all<{ title: string; url: string; published_at: number; story_key: string | null; source: string; lean: Lean | null; color: string; source_id: string }>(
    `SELECT n.title, n.url, n.published_at, n.story_key, s.name source, s.lean, s.color, s.id source_id
     FROM news_items n JOIN news_sources s ON s.id = n.source_id
     WHERE n.opinion = 1 AND (n.section IN (${ph}) OR n.topic IN (${cfg.topics.map(() => "?").join(",")}) OR n.story_key IN (SELECT key FROM stories WHERE section IN (${ph})))
       AND n.published_at > ? AND s.lean IS NOT NULL ${demoEnabled() ? "" : "AND COALESCE(s.demo, 0) = 0"}
     ORDER BY n.published_at DESC LIMIT 200`,
    [...secs, ...cfg.topics, ...secs, t - 4 * 86_400_000],
  );
  const out: Record<Side, OpinionItem[]> = { left: [], center: [], right: [] };
  const seen = new Set<string>();
  for (const r of rows) {
    const side = sideOf(r.lean);
    if (!side || out[side].length >= perSide || seen.has(r.source_id + side)) continue;
    seen.add(r.source_id + side);
    out[side].push({ side, source: r.source, title: r.title, url: r.url, publishedAt: r.published_at, storyKey: r.story_key, color: r.color });
  }
  return out;
}

/** The day's balance: stories in the section, outlets covering them, and the left/center/right share. */
export function coverageToday(key: SectionKey, t = now()): { stories: number; outlets: number; articles: number; coverage: Coverage } {
  const secs = SECTIONS[key].storySections;
  const ph = secs.map(() => "?").join(",");
  const real = demoEnabled() ? "" : "AND origin = 'real'";
  const rows = all<{ source_id: string; lean: Lean | null; n: number }>(
    `SELECT s.id source_id, s.lean, count(*) n FROM news_items n JOIN news_sources s ON s.id = n.source_id
     WHERE n.published_at > ? AND n.story_key IN (SELECT key FROM stories WHERE section IN (${ph}) ${real})
     GROUP BY s.id`,
    [t - 86_400_000, ...secs],
  );
  const stories = all<{ n: number }>(`SELECT count(*) n FROM stories WHERE section IN (${ph}) AND COALESCE(last_article_at, updated_at) > ? ${real}`, [...secs, t - 86_400_000])[0]?.n ?? 0;
  return { stories, outlets: rows.length, articles: rows.reduce((a, r) => a + r.n, 0), coverage: computeCoverage(rows.map((r) => ({ lean: r.lean }))) };
}

/** Latest dispatches from a section's AI desks (always labeled AI where shown). */
export function aiDeskPostIds(key: SectionKey, limit = 2): string[] {
  const handles = SECTIONS[key].aiDesks;
  if (!handles.length) return [];
  return all<{ id: string }>(
    `SELECT p.id FROM posts p JOIN users u ON u.id = p.author_id
     WHERE u.handle IN (${handles.map(() => "?").join(",")}) AND COALESCE(u.is_ai, 0) = 1 AND p.deleted_at IS NULL AND p.removed_at IS NULL AND p.reply_to_id IS NULL
     ORDER BY p.created_at DESC LIMIT ?`,
    [...handles, limit],
  ).map((r) => r.id);
}

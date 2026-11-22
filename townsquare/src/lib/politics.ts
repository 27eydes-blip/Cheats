import { all, now } from "./db";
import { demoEnabled } from "./newsroom/settings";
import { computeCoverage, sideOf, type Coverage, type Side } from "./newsroom/coverage";
import type { Lean } from "./newsroom/outlets";
import { listStories, type StorySummary } from "./news";

/**
 * The Politics section: beats, every side of a story at a glance, blindspots,
 * opinion from across the spectrum, and the day's coverage balance. Built
 * only from ingested articles and their outlets' lean ratings (no invented data).
 */

export const BEATS = {
  congress: { label: "Congress", words: ["congress", "senate", "senator", "senators", "house speaker", "speaker", "lawmakers", "representatives", "filibuster", "committee", "bill", "legislation", "caucus", "appropriations", "shutdown", "majority leader", "minority leader", "capitol hill"] },
  "white-house": { label: "White House", words: ["white house", "president", "administration", "executive order", "cabinet", "oval office", "press secretary", "chief of staff", "veto", "pardon", "vice president"] },
  courts: { label: "Courts", words: ["supreme court", "court", "judge", "justices", "ruling", "lawsuit", "appeals", "indictment", "indicted", "trial", "prosecutor", "prosecutors", "attorney general", "justice department", "doj", "injunction", "verdict"] },
  elections: { label: "Elections", words: ["election", "elections", "campaign", "voters", "voting", "ballot", "primary", "primaries", "poll", "polls", "polling", "candidate", "candidates", "midterm", "midterms", "nominee", "redistricting", "turnout", "debate"] },
  states: { label: "States", words: ["governor", "state legislature", "statehouse", "state senate", "state house", "mayor", "attorney general", "county", "legislature"] },
} as const;
export type Beat = keyof typeof BEATS;
export const BEAT_KEYS = Object.keys(BEATS) as Beat[];
export const isBeat = (s: string | undefined | null): s is Beat => !!s && s in BEATS;

const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ")} `;

/** Which beats a story belongs to (by whole words in its headline, summary and article headlines). */
export function beatsOf(text: string): Beat[] {
  const w = words(text);
  return BEAT_KEYS.filter((b) => BEATS[b].words.some((k) => w.includes(` ${k} `)));
}

type ItemRow = { story_key: string; title: string; summary: string; url: string; published_at: number; opinion: number; source: string; source_id: string; lean: Lean | null; color: string };

function itemsFor(keys: string[]) {
  if (!keys.length) return new Map<string, ItemRow[]>();
  const rows = all<ItemRow>(
    `SELECT n.story_key, n.title, n.summary, n.url, n.published_at, n.opinion, s.name source, s.id source_id, s.lean, s.color
     FROM news_items n JOIN news_sources s ON s.id = n.source_id
     WHERE n.story_key IN (${keys.map(() => "?").join(",")}) AND COALESCE(s.demo, 0) = ${demoEnabled() ? "COALESCE(s.demo, 0)" : "0"}
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

export type PoliticsStory = StorySummary & { beats: Beat[]; sides: Partial<Record<Side, SideHeadline>> };

export function politicsStories(opts: { limit?: number; beat?: Beat | null; viewerId?: string | null } = {}): PoliticsStory[] {
  const pool = listStories(opts.beat ? 120 : Math.max(40, (opts.limit ?? 30) * 2), { section: "Politics", viewerId: opts.viewerId ?? null });
  const items = itemsFor(pool.map((s) => s.key));
  const out: PoliticsStory[] = [];
  for (const s of pool) {
    const its = items.get(s.key) ?? [];
    const beats = beatsOf([s.title, s.summary, ...its.map((i) => i.title)].join(" \n "));
    if (opts.beat && !beats.includes(opts.beat)) continue;
    out.push({ ...s, beats, sides: sideHeadlines(its) });
    if (out.length >= (opts.limit ?? 30)) break;
  }
  return out;
}

/** Stories covered mostly by one side: what each side's readers may be missing. */
export function blindspots(stories: PoliticsStory[], limit = 3) {
  // "Left" bucket: mostly Left-leaning coverage, or few Right-leaning outlets (and the reverse).
  const other = { left: "right", right: "left" } as const;
  const by = (side: "left" | "right") =>
    stories.filter((s) => s.coverage.flag && ((s.coverage.flag.kind === "lopsided" && s.coverage.flag.side === side) || (s.coverage.flag.kind === "missing" && s.coverage.flag.side === other[side]))).slice(0, limit);
  return { left: by("left"), right: by("right") };
}

export type OpinionItem = { side: Side; source: string; title: string; url: string; publishedAt: number; storyKey: string | null; color: string };

/** The newest political opinion pieces, grouped by the outlet's side. */
export function opinionAcrossSpectrum(perSide = 3, t = now()): Record<Side, OpinionItem[]> {
  const rows = all<{ title: string; url: string; published_at: number; story_key: string | null; source: string; lean: Lean | null; color: string; source_id: string }>(
    `SELECT n.title, n.url, n.published_at, n.story_key, s.name source, s.lean, s.color, s.id source_id
     FROM news_items n JOIN news_sources s ON s.id = n.source_id
     WHERE n.opinion = 1 AND (n.section = 'Politics' OR n.topic = 'Politics' OR n.story_key IN (SELECT key FROM stories WHERE section = 'Politics'))
       AND n.published_at > ? AND s.lean IS NOT NULL ${demoEnabled() ? "" : "AND COALESCE(s.demo, 0) = 0"}
     ORDER BY n.published_at DESC LIMIT 200`,
    [t - 4 * 86_400_000],
  );
  const out: Record<Side, OpinionItem[]> = { left: [], center: [], right: [] };
  const seen = new Set<string>();
  for (const r of rows) {
    const side = sideOf(r.lean);
    if (!side || out[side].length >= perSide || seen.has(r.source_id + side)) continue;
    seen.add(r.source_id + side); // one piece per outlet keeps each column varied
    out[side].push({ side, source: r.source, title: r.title, url: r.url, publishedAt: r.published_at, storyKey: r.story_key, color: r.color });
  }
  return out;
}

/** The day's balance: how many political stories, how many outlets, and the overall left/center/right share. */
export function coverageToday(t = now()): { stories: number; outlets: number; articles: number; coverage: Coverage } {
  const rows = all<{ source_id: string; lean: Lean | null; n: number }>(
    `SELECT s.id source_id, s.lean, count(*) n FROM news_items n JOIN news_sources s ON s.id = n.source_id
     WHERE n.published_at > ? AND n.story_key IN (SELECT key FROM stories WHERE section = 'Politics' ${demoEnabled() ? "" : "AND origin = 'real'"})
     GROUP BY s.id`,
    [t - 86_400_000],
  );
  const stories = all<{ n: number }>(`SELECT count(*) n FROM stories WHERE section = 'Politics' AND COALESCE(last_article_at, updated_at) > ? ${demoEnabled() ? "" : "AND origin = 'real'"}`, [t - 86_400_000])[0]?.n ?? 0;
  return { stories, outlets: rows.length, articles: rows.reduce((a, r) => a + r.n, 0), coverage: computeCoverage(rows.map((r) => ({ lean: r.lean }))) };
}

/** Latest dispatches from the AI politics and courts desks (always labeled AI where shown). */
export function aiDeskPostIds(limit = 3): string[] {
  return all<{ id: string }>(
    `SELECT p.id FROM posts p JOIN users u ON u.id = p.author_id
     WHERE u.handle IN ('ai_capitol', 'ai_lawdesk') AND COALESCE(u.is_ai, 0) = 1 AND p.deleted_at IS NULL AND p.removed_at IS NULL AND p.reply_to_id IS NULL
     ORDER BY p.created_at DESC LIMIT ?`,
    [limit],
  ).map((r) => r.id);
}

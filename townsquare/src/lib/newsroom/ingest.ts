import { randomBytes } from "node:crypto";
import { all, get, newId, now, run, tx } from "../db";
import { publish } from "../realtime";
import { assign, CATEGORY_SECTION, classify, pickHeadline, scoreStory, STORY_WINDOW, storyCategory, storySlug, trimBag, addBag, type Bag, type Doc, type StoryState } from "./cluster";
import { parseApiArticles, parseFeed, safeUrl, type ApiArticle, type FeedItem } from "./feeds";
import { allowedByRobots, fetchText, type FetchLike } from "./fetcher";
import type { Category, Lean } from "./outlets";
import { getSetting, setSetting } from "./settings";
import { articleTerms, cleanTitle, isOpinion } from "./text";

const MIN = 60_000;
const H = 3_600_000;
/** Feeds are polled every 10 minutes; the licensed API less often (NewsAPI's free tier allows ~100 calls a day). */
export const FEED_INTERVAL = () => Math.max(5, Number(process.env.NEWS_INGEST_INTERVAL_MIN) || 10) * MIN;
const API_INTERVAL = () => Math.max(10, Number(process.env.NEWS_API_INTERVAL_MIN) || 20) * MIN;
/** Ignore items older than this (feeds often carry week-old items). */
const MAX_AGE = 72 * H;
const CONCURRENCY = 6;

export type SourceRow = {
  id: string; name: string; homepage: string; feed_url: string | null; kind: string; api_source: string | null; lean: Lean | null; lean_note: string; color: string;
  category: Category | null; outlet_type: string; active: number; demo: number; etag: string | null; last_modified: string | null; last_fetch_at: number | null;
  last_success_at: number | null; last_status: number | null; last_error: string | null; error_count: number; next_fetch_at: number; items_total: number; last_found: number; last_new: number; feed_candidates: string; pending_check: number; feed_note: string;
};

/** A feed that has failed this many syncs in a row is flagged in the Control Room. */
export const FAILING_AFTER = 3;

export type IngestResult = { skipped?: string; sources: number; fetched: number; newItems: number; storiesNew: number; storiesUpdated: number; errors: { source: string; error: string }[] };

function backoff(errors: number) {
  return Math.min(6 * H, FEED_INTERVAL() * 2 ** Math.min(6, errors));
}

function recordFetch(s: SourceRow, ok: boolean, status: number, error: string | null, extra: { etag?: string | null; lastModified?: string | null; retryAfter?: number | null; items?: number; found?: number } = {}) {
  const t = now();
  const errors = ok ? 0 : s.error_count + 1;
  const interval = s.kind === "api" ? API_INTERVAL() : FEED_INTERVAL();
  const next = t + Math.max(ok ? interval : backoff(errors), extra.retryAfter ?? 0);
  run(
    `UPDATE news_sources SET last_fetch_at = ?, last_status = ?, last_error = ?, error_count = ?, next_fetch_at = ?,
       last_success_at = CASE WHEN ? THEN ? ELSE last_success_at END, items_total = items_total + ?,
       etag = COALESCE(?, etag), last_modified = COALESCE(?, last_modified), last_found = ?, last_new = ? WHERE id = ?`,
    [t, status, error, errors, next, ok ? 1 : 0, t, extra.items ?? 0, ok ? extra.etag ?? null : null, ok ? extra.lastModified ?? null : null, extra.found ?? 0, extra.items ?? 0, s.id],
  );
}

/** Store new items from one source. Returns how many were new. */
function storeItems(s: SourceRow, items: FeedItem[], t: number): number {
  let added = 0;
  tx(() => {
    for (const it of items) {
      const published = Math.min(t, it.publishedAt ?? t);
      if (t - published > MAX_AGE) continue;
      if (get("SELECT 1 FROM news_items WHERE url = ? OR (source_id = ? AND guid = ?)", [it.url, s.id, it.guid])) continue;
      const title = cleanTitle(it.title, s.name).slice(0, 300);
      if (!title) continue;
      const cls = classify(title, it.snippet);
      const best = (Object.entries(cls) as [Category, number][]).sort((a, b) => b[1] - a[1])[0];
      const topic: Category = s.category ?? (best[1] > 0 ? best[0] : "US");
      run(
        `INSERT OR IGNORE INTO news_items (id, source_id, section, title, summary, url, image_url, published_at, guid, topic, opinion, tokens, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId(), s.id, CATEGORY_SECTION[topic], title, it.snippet, it.url, it.imageUrl, published, it.guid.slice(0, 500), topic, isOpinion(it.title, it.url) ? 1 : 0, JSON.stringify(articleTerms(title, it.snippet)), t],
      );
      added++;
    }
  });
  return added;
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => {
    for (let x = queue.shift(); x !== undefined; x = queue.shift()) await fn(x);
  }));
}

/** Fetch and parse one RSS source (robots.txt first). */
type FetchOut = { items: FeedItem[]; status: number; error: string | null; etag?: string | null; lastModified?: string | null; retryAfter?: number | null; movedTo?: string; robotsBlocked?: boolean };

/** <link rel="alternate" type="application/rss+xml|atom+xml" href="…"> on an outlet's own page. */
export function feedLinksIn(html: string, base: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/rel=["']?alternate/i.test(tag) || !/type=["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    const u = href ? safeUrl(href, base) : null;
    if (u && !out.includes(u)) out.push(u);
  }
  return out.slice(0, 6);
}

async function fetchOne(url: string, s: Pick<SourceRow, "etag" | "last_modified"> | null, fetchImpl?: FetchLike): Promise<FetchOut & { body?: string }> {
  const robots = await allowedByRobots(url, fetchImpl);
  if (!robots.ok) return { items: [], status: 0, error: robots.reason ?? "Blocked by robots.txt", robotsBlocked: robots.reason !== "robots.txt unavailable; will retry" };
  const r = await fetchText(url, { etag: s?.etag, lastModified: s?.last_modified, fetchImpl });
  if (r.status === 304) return { items: [], status: 304, error: null, retryAfter: r.retryAfter };
  if (r.status !== 200) return { items: [], status: r.status, error: r.error ?? `HTTP ${r.status}${r.status === 429 ? " (rate limited)" : ""}`, retryAfter: r.retryAfter };
  return { items: parseFeed(r.body, url), status: 200, error: null, etag: r.etag, lastModified: r.lastModified, body: r.body };
}

/**
 * Fetch and parse one RSS source (robots.txt first). If the address answers
 * with a normal web page instead of a feed, look for the outlet's official
 * feed: feed links on that page, the outlet's listed fallback addresses, and
 * feed links on the outlet's homepage. Every candidate is checked against
 * robots.txt; the first one that parses with items is used (movedTo).
 */
export async function fetchSource(s: SourceRow, fetchImpl?: FetchLike): Promise<FetchOut> {
  if (!s.feed_url) return { items: [], status: 0, error: "No feed URL" };
  const r = await fetchOne(s.feed_url, s, fetchImpl);
  if (r.error || r.status === 304 || r.items.length) {
    const { body: _b, ...rest } = r;
    void _b;
    return rest;
  }
  const tried = new Set([s.feed_url]);
  const queue = [...feedLinksIn(r.body ?? "", s.feed_url), ...(JSON.parse(s.feed_candidates || "[]") as string[])];
  let homepageChecked = false;
  for (let i = 0; i < 8; i++) {
    let next = queue.find((u) => !tried.has(u));
    if (!next && !homepageChecked && s.homepage) {
      homepageChecked = true;
      const home = await fetchOne(s.homepage, null, fetchImpl);
      queue.push(...feedLinksIn(home.body ?? "", s.homepage));
      next = queue.find((u) => !tried.has(u));
    }
    if (!next) break;
    tried.add(next);
    const c = await fetchOne(next, null, fetchImpl);
    if (!c.error && c.items.length) return { items: c.items, status: 200, error: null, etag: c.etag, lastModified: c.lastModified, movedTo: next };
  }
  return { items: [], status: 200, error: "The address returns a web page, not a feed, and no working official feed was found on the outlet's site" };
}

/** The licensed API, one call for all API outlets (NewsAPI.org "top-headlines" by source). */
async function fetchApi(sources: SourceRow[], fetchImpl?: FetchLike): Promise<Map<string, FeedItem[]> | { error: string; status: number }> {
  const key = process.env.NEWS_API_KEY;
  if (!key) return { error: "NEWS_API_KEY is not set", status: 0 };
  const ids = sources.map((s) => s.api_source).filter(Boolean).join(",");
  const r = await fetchText(`https://newsapi.org/v2/top-headlines?sources=${encodeURIComponent(ids)}&pageSize=100`, { fetchImpl, headers: { "x-api-key": key, accept: "application/json" } });
  if (r.status !== 200) return { error: r.error ?? `HTTP ${r.status}`, status: r.status };
  try {
    const body = JSON.parse(r.body) as { status: string; articles?: ApiArticle[]; message?: string };
    if (body.status !== "ok") return { error: body.message ?? "API error", status: 200 };
    const out = new Map<string, FeedItem[]>();
    for (const a of parseApiArticles(body.articles ?? [])) out.set(a.apiSource, [...(out.get(a.apiSource) ?? []), a]);
    return out;
  } catch {
    return { error: "Bad API response", status: 200 };
  }
}

type ItemRow = { id: string; source_id: string; name: string; title: string; summary: string; url: string; tokens: string; published_at: number; lean: Lean | null; outlet_type: string; category: Category | null };
const toDoc = (r: ItemRow): Doc => ({ id: r.id, sourceId: r.source_id, outletName: r.name, title: r.title, snippet: r.summary, url: r.url, terms: JSON.parse(r.tokens) as Bag, publishedAt: r.published_at, lean: r.lean, outletType: r.outlet_type, categoryHint: r.category });
const ITEM_SQL = `SELECT n.id, n.source_id, s.name, n.title, n.summary, n.url, n.tokens, n.published_at, s.lean, s.outlet_type, s.category FROM news_items n JOIN news_sources s ON s.id = n.source_id`;

/** Group new items into stories and refresh every story they touched. */
export function clusterNew(t = now()): { created: string[]; touched: string[] } {
  const fresh = all<ItemRow>(`${ITEM_SQL} WHERE n.story_key IS NULL AND s.demo = 0 AND n.published_at > ? ORDER BY n.published_at`, [t - MAX_AGE]);
  if (!fresh.length) return { created: [], touched: [] };
  const docs = fresh.map(toDoc);
  const oldest = Math.min(...docs.map((d) => d.publishedAt));
  const stories: StoryState[] = all<{ key: string; keywords: string; created_at: number; last_article_at: number | null; n: number }>(
    `SELECT key, keywords, created_at, last_article_at, (SELECT count(*) FROM news_items i WHERE i.story_key = s.key) n FROM stories s WHERE origin = 'real' AND COALESCE(last_article_at, updated_at) > ?`,
    [oldest - STORY_WINDOW],
  ).map((r) => ({ key: r.key, terms: JSON.parse(r.keywords) as Bag, firstAt: r.created_at, lastAt: r.last_article_at ?? r.created_at, size: r.n }));
  const corpus = all<{ tokens: string }>("SELECT tokens FROM news_items WHERE story_key IS NOT NULL AND published_at > ? LIMIT 8000", [t - MAX_AGE]).map((r) => JSON.parse(r.tokens) as Bag);
  const taken = new Set(all<{ key: string }>("SELECT key FROM stories").map((r) => r.key));
  const { assignment, created } = assign(docs, stories, corpus, (d) => {
    let k = storySlug(d.title, randomBytes(3).toString("hex"));
    while (taken.has(k)) k = storySlug(d.title, randomBytes(3).toString("hex"));
    taken.add(k);
    return k;
  });
  const touched = new Set<string>(assignment.values());
  tx(() => {
    for (const c of created) run("INSERT INTO stories (key, title, summary, section, status, created_at, updated_at, origin, last_article_at) VALUES (?, '', '', 'Top Stories', 'developing', ?, ?, 'real', ?)", [c.key, c.firstAt, c.lastAt, c.lastAt]);
    for (const d of docs) {
      const key = assignment.get(d.id)!;
      run("UPDATE news_items SET story_key = ? WHERE id = ?", [key, d.id]);
      run("INSERT INTO story_updates (id, story_key, body, kind, source_id, created_at) VALUES (?, ?, ?, 'update', ?, ?)", [newId(), key, d.title.slice(0, 280), d.sourceId, d.publishedAt]);
    }
    for (const key of touched) refreshStory(key, t);
  });
  return { created: created.map((c) => c.key), touched: [...touched] };
}

/** Recompute a real story's headline, summary, category and scores from its articles. */
export function refreshStory(key: string, t = now()) {
  const st = get<{ headline_locked: number; status: string }>("SELECT headline_locked, status FROM stories WHERE key = ? AND origin = 'real'", [key]);
  if (!st) return;
  const members = all<ItemRow>(`${ITEM_SQL} WHERE n.story_key = ? ORDER BY n.published_at`, [key]).map(toDoc);
  if (!members.length) return;
  const h = pickHeadline(members);
  const cat = storyCategory(members);
  const sc = scoreStory(members, t);
  const profile = trimBag(members.reduce((b, d) => addBag(b, d.terms), {} as Bag));
  run(
    `UPDATE stories SET ${st.headline_locked ? "" : "title = ?, summary = ?, summary_source = ?,"} section = ?, category = ?, importance = ?, freshness = ?,
       status = CASE WHEN status = 'live' THEN 'live' ELSE ? END, updated_at = ?, last_article_at = ?, keywords = ? WHERE key = ?`,
    [...(st.headline_locked ? [] : [h.title, h.summary, h.summarySource]), CATEGORY_SECTION[cat], cat, sc.importance, sc.freshness, sc.status, sc.lastAt, sc.lastAt, JSON.stringify(profile), key],
  );
}

/** Freshness decays with time even when nothing new arrives; refresh it for the last week's stories. */
export function refreshFreshness(t = now()) {
  for (const s of all<{ key: string; last_article_at: number; status: string }>("SELECT key, last_article_at, status FROM stories WHERE origin = 'real' AND last_article_at > ?", [t - 7 * 24 * H])) {
    const hours = (t - s.last_article_at) / H;
    run("UPDATE stories SET freshness = ?, status = CASE WHEN status = 'live' THEN 'live' WHEN ? THEN 'ended' ELSE status END WHERE key = ?", [Math.round(0.5 ** (hours / 8) * 1000) / 1000, hours > 24 ? 1 : 0, s.key]);
  }
}

/** Keep the database small: articles older than 30 days go unless people posted on their story. */
export function prune(t = now()) {
  const cutoff = t - 30 * 24 * H;
  run(
    `DELETE FROM news_items WHERE published_at < ? AND source_id IN (SELECT id FROM news_sources WHERE demo = 0)
       AND (story_key IS NULL OR NOT EXISTS (SELECT 1 FROM posts p WHERE p.story_key = news_items.story_key))`,
    [cutoff],
  );
  run("DELETE FROM stories WHERE origin = 'real' AND COALESCE(last_article_at, updated_at) < ? AND NOT EXISTS (SELECT 1 FROM news_items n WHERE n.story_key = stories.key) AND NOT EXISTS (SELECT 1 FROM posts p WHERE p.story_key = stories.key)", [cutoff]);
  run("DELETE FROM ingest_runs WHERE id NOT IN (SELECT id FROM ingest_runs ORDER BY started_at DESC LIMIT 500)");
}

type Hook = (r: { created: string[]; touched: string[] }) => Promise<void> | void;
const g = globalThis as unknown as { __ingestHooks?: Hook[] };
/** Other modules (push alerts) react to new and updated stories. */
export function onStories(h: Hook) {
  (g.__ingestHooks ??= []).push(h);
}

/**
 * One ingest run: fetch due sources (6 at a time), store new items, cluster,
 * refresh scores, prune, log the run. A lock in site_settings keeps two runs
 * from overlapping.
 */
export async function runIngest(opts: { trigger?: string; fetchImpl?: FetchLike; force?: boolean; sourceIds?: string[] } = {}): Promise<IngestResult> {
  const t = now();
  const lock = Number(getSetting("ingest_lock") || 0);
  const empty: IngestResult = { sources: 0, fetched: 0, newItems: 0, storiesNew: 0, storiesUpdated: 0, errors: [] };
  if (lock && t - lock < 20 * MIN) return { ...empty, skipped: "Another sync is running" };
  setSetting("ingest_lock", String(t));
  const runId = newId();
  run("INSERT INTO ingest_runs (id, started_at, trigger) VALUES (?, ?, ?)", [runId, t, opts.trigger ?? "schedule"]);
  const result = { ...empty };
  try {
    const due = all<SourceRow>(
      `SELECT * FROM news_sources WHERE active = 1 AND demo = 0 ${opts.sourceIds?.length ? `AND id IN (${opts.sourceIds.map(() => "?").join(",")})` : opts.force ? "" : "AND next_fetch_at <= ?"}`,
      opts.sourceIds?.length ? opts.sourceIds : opts.force ? [] : [t],
    );
    result.sources = due.length;
    const rss = due.filter((s) => s.kind === "rss" && s.feed_url);
    const api = due.filter((s) => s.kind === "api" && s.api_source);
    await pool(rss, CONCURRENCY, async (s) => {
      const r = await fetchSource(s, opts.fetchImpl);
      const added = r.error ? 0 : storeItems(s, r.items, now());
      if (!r.error) result.fetched++;
      else result.errors.push({ source: s.name, error: r.error });
      result.newItems += added;
      recordFetch(s, !r.error, r.status, r.error, { etag: r.etag, lastModified: r.lastModified, retryAfter: r.retryAfter, items: added, found: r.items.length });
      if (r.movedTo) run("UPDATE news_sources SET feed_url = ?, etag = ?, last_modified = ?, feed_note = ? WHERE id = ?", [r.movedTo, r.etag ?? null, r.lastModified ?? null, `Feed address updated automatically: ${s.feed_url} returned a web page; the outlet's site lists ${r.movedTo}.`, s.id]);
    });
    if (api.length && process.env.NEWS_API_KEY) {
      const r = await fetchApi(api, opts.fetchImpl);
      for (const s of api) {
        if ("error" in r) {
          result.errors.push({ source: s.name, error: String(r.error) });
          recordFetch(s, false, Number(r.status), String(r.error));
        } else {
          const added = storeItems(s, r.get(s.api_source!) ?? [], now());
          result.fetched++;
          result.newItems += added;
          recordFetch(s, true, 200, null, { items: added, found: (r.get(s.api_source!) ?? []).length });
        }
      }
    } else if (api.length) {
      // No key: don't count it as an error; check again later.
      for (const s of api) run("UPDATE news_sources SET last_error = 'Needs NEWS_API_KEY (no public feed)', next_fetch_at = ? WHERE id = ?", [t + API_INTERVAL(), s.id]);
    }
    if (!opts.sourceIds?.length) await checkPendingOutlets(opts.fetchImpl, result);
    const c = clusterNew(now());
    result.storiesNew = c.created.length;
    result.storiesUpdated = c.touched.length - c.created.length;
    refreshFreshness(now());
    prune(now());
    if (c.touched.length) {
      publish({ type: "wire" });
      for (const h of g.__ingestHooks ?? []) {
        try {
          await h(c);
        } catch (e) {
          console.error("[news] hook failed", e);
        }
      }
    }
    return result;
  } finally {
    run("UPDATE ingest_runs SET finished_at = ?, sources = ?, fetched = ?, new_items = ?, stories_new = ?, stories_updated = ?, errors = ?, note = ? WHERE id = ?", [
      now(), result.sources, result.fetched, result.newItems, result.storiesNew, result.storiesUpdated, result.errors.length, JSON.stringify(result.errors.slice(0, 20)), runId,
    ]);
    setSetting("ingest_lock", null);
  }
}

/**
 * New outlets start switched off. Each sync checks the ones still pending:
 * robots.txt must allow our reader and the feed must parse with items, then
 * the outlet is switched on. If robots.txt disallows it, it stays off for
 * good (with the reason shown). Other errors are retried with backoff.
 */
export async function checkPendingOutlets(fetchImpl: FetchLike | undefined, result: IngestResult) {
  const t = now();
  for (const s of all<SourceRow>("SELECT * FROM news_sources WHERE pending_check = 1 AND demo = 0 AND feed_url IS NOT NULL AND next_fetch_at <= ?", [t])) {
    const r = await fetchSource(s, fetchImpl);
    if (!r.error && r.items.length) {
      const added = storeItems(s, r.items, now());
      result.newItems += added;
      result.fetched++;
      recordFetch(s, true, r.status, null, { etag: r.etag, lastModified: r.lastModified, items: added, found: r.items.length });
      run("UPDATE news_sources SET active = 1, pending_check = 0, feed_url = COALESCE(?, feed_url), feed_note = ? WHERE id = ?", [r.movedTo ?? null, `Switched on after checks: robots.txt allows our reader and the feed had ${r.items.length} items.`, s.id]);
    } else if (r.robotsBlocked) {
      recordFetch(s, false, r.status, r.error);
      run("UPDATE news_sources SET pending_check = 0, active = 0, feed_note = 'Not added: its robots.txt disallows our feed reader.' WHERE id = ?", [s.id]);
    } else {
      recordFetch(s, false, r.status, r.error ?? "No items");
      result.errors.push({ source: `${s.name} (pending check)`, error: r.error ?? "No items" });
    }
  }
}

/** Control Room "Test": fetch a feed URL without saving anything. */
export async function testFeedUrl(url: string, fetchImpl?: FetchLike) {
  const fake = { id: "test", name: "", feed_url: url, etag: null, last_modified: null } as SourceRow;
  const r = await fetchSource(fake, fetchImpl);
  return { ok: !r.error, status: r.status, error: r.error, count: r.items.length, sample: r.items.slice(0, 5).map((i) => ({ title: i.title, url: i.url, publishedAt: i.publishedAt, snippet: i.snippet, image: !!i.imageUrl })) };
}

export function lastRun() {
  return get<{ started_at: number; finished_at: number | null; new_items: number; stories_new: number; stories_updated: number; errors: number; trigger: string }>("SELECT * FROM ingest_runs ORDER BY started_at DESC LIMIT 1");
}

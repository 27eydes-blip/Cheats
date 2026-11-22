import { all, get, now, run } from "../db";
import { AppError } from "../errors";
import { safeUrl } from "./feeds";
import { lastRun, runIngest, testFeedUrl, type SourceRow } from "./ingest";
import { CATEGORIES, LEANS, type Category, type Lean, type OutletType } from "./outlets";
import { demoAllowed, setDemo } from "./settings";

type Admin = { id: string; role: string };
const must = (u: Admin) => {
  if (u.role !== "admin") throw new AppError("Admins only.", "forbidden");
};

export type SourceView = SourceRow & { items_24h: number };

export function listSources(): SourceView[] {
  return all<SourceView>(
    `SELECT s.*, (SELECT count(*) FROM news_items n WHERE n.source_id = s.id AND n.fetched_at > ?) items_24h FROM news_sources s WHERE s.demo = 0
     ORDER BY (s.active = 1 AND s.error_count >= 3) DESC, s.active DESC, s.pending_check DESC, s.name`,
    [now() - 24 * 3_600_000],
  );
}

export function newsStatus() {
  const r = lastRun();
  const recent = all<{ started_at: number; finished_at: number | null; new_items: number; stories_new: number; errors: number; trigger: string; note: string }>("SELECT * FROM ingest_runs ORDER BY started_at DESC LIMIT 8");
  const counts = get<{ real: number; demo: number; items: number }>(
    "SELECT (SELECT count(*) FROM stories WHERE origin = 'real') real, (SELECT count(*) FROM stories WHERE origin = 'demo') demo, (SELECT count(*) FROM news_items n JOIN news_sources s ON s.id = n.source_id WHERE s.demo = 0) items",
  )!;
  return { last: r ?? null, recent, counts, apiKey: !!process.env.NEWS_API_KEY, demoAllowed: demoAllowed() };
}

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

export function addSource(u: Admin, input: { name: string; homepage: string; feedUrl: string; lean: string; note: string; category: string; type: string; color: string }) {
  must(u);
  const name = input.name.trim().slice(0, 60);
  const feed = safeUrl(input.feedUrl);
  const home = safeUrl(input.homepage || input.feedUrl);
  if (!name) throw new AppError("Give the outlet a name.");
  if (!feed) throw new AppError("The feed URL must start with http:// or https://.");
  if (get("SELECT 1 FROM news_sources WHERE feed_url = ?", [feed])) throw new AppError("That feed is already in the list.");
  let id = slug(name) || "outlet";
  while (get("SELECT 1 FROM news_sources WHERE id = ?", [id])) id = `${slug(name)}-${Math.floor(Math.random() * 1000)}`;
  const lean = LEANS.includes(input.lean as Lean) ? input.lean : null;
  const category = CATEGORIES.includes(input.category as Category) ? input.category : null;
  const color = /^#[0-9a-f]{3,8}$/i.test(input.color) ? input.color : "#7fa3ff";
  const types: OutletType[] = ["wire", "paper", "tv", "digital", "magazine", "public", "international"];
  run(
    `INSERT INTO news_sources (id, name, homepage, feed_url, verified, kind, lean, lean_note, color, category, outlet_type, active, demo, next_fetch_at) VALUES (?, ?, ?, ?, 1, 'rss', ?, ?, ?, ?, ?, 1, 0, 0)`,
    [id, name, new URL(home!).origin, feed, lean, (input.note.trim() || (lean ? "Approximate; set by an editor." : "Not rated.")).slice(0, 300), color, category, types.includes(input.type as OutletType) ? input.type : "digital"],
  );
  return id;
}

/** Remove a feed. Outlets with stored articles are switched off instead, so past stories keep their coverage list. */
export function removeSource(u: Admin, id: string) {
  must(u);
  const has = get("SELECT 1 FROM news_items WHERE source_id = ? LIMIT 1", [id]);
  if (has) run("UPDATE news_sources SET active = 0 WHERE id = ? AND demo = 0", [id]);
  else run("DELETE FROM news_sources WHERE id = ? AND demo = 0", [id]);
  return has ? "deactivated" : "deleted";
}

export function setSourceActive(u: Admin, id: string, on: boolean) {
  must(u);
  run("UPDATE news_sources SET active = ?, pending_check = 0, next_fetch_at = 0, error_count = 0 WHERE id = ? AND demo = 0", [on ? 1 : 0, id]);
}

export function updateSource(u: Admin, id: string, input: { lean: string; note: string; feedUrl?: string }) {
  must(u);
  const lean = LEANS.includes(input.lean as Lean) ? input.lean : null;
  run("UPDATE news_sources SET lean = ?, lean_note = ? WHERE id = ?", [lean, input.note.trim().slice(0, 300), id]);
  if (input.feedUrl !== undefined) {
    const feed = input.feedUrl.trim() ? safeUrl(input.feedUrl) : null;
    if (input.feedUrl.trim() && !feed) throw new AppError("The feed URL must start with http:// or https://.");
    run("UPDATE news_sources SET feed_url = ?, kind = CASE WHEN ? IS NULL AND api_source IS NOT NULL THEN 'api' ELSE 'rss' END, etag = NULL, last_modified = NULL, next_fetch_at = 0, error_count = 0 WHERE id = ?", [feed, feed, id]);
  }
}

export async function testSource(u: Admin, idOrUrl: string) {
  must(u);
  const row = get<{ feed_url: string | null }>("SELECT feed_url FROM news_sources WHERE id = ?", [idOrUrl]);
  const url = row ? row.feed_url : safeUrl(idOrUrl);
  if (!url) throw new AppError(row ? "This outlet has no RSS feed (it comes through the news API)." : "Enter a feed URL starting with https://.");
  return testFeedUrl(url);
}

export async function syncNow(u: Admin, sourceId?: string) {
  must(u);
  return runIngest({ trigger: "manual", force: !sourceId, sourceIds: sourceId ? [sourceId] : undefined });
}

export function setDemoData(u: Admin, on: boolean) {
  must(u);
  if (!demoAllowed()) throw new AppError("Demo data is always off in production.");
  setDemo(on);
}

/** Editors can correct a story's headline; a corrected headline stays (the clusterer won't overwrite it). */
export function setStoryHeadline(u: Admin, key: string, title: string) {
  must(u);
  const t = title.trim().slice(0, 160);
  if (t) run("UPDATE stories SET title = ?, headline_locked = 1 WHERE key = ?", [t, key]);
  else run("UPDATE stories SET headline_locked = 0 WHERE key = ?", [key]);
}

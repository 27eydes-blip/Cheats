import { beforeEach, describe, expect, it } from "vitest";
import { all, get, run } from "@/lib/db";
import { runIngest, testFeedUrl } from "@/lib/newsroom/ingest";
import { robotsAllows, robotsRules } from "@/lib/newsroom/fetcher";
import { OUTLET_LIST } from "@/lib/newsroom/outlets";
import { freshDb } from "./helpers";

beforeEach(freshDb);

// Made-up items, served by a fake network.
const rss = (items: [string, string, string][]) =>
  `<rss version="2.0"><channel>${items.map(([title, slug, desc]) => `<item><title>${title}</title><link>https://news.example.com/${slug}</link><description>${desc}</description><pubDate>${new Date(Date.now() - 30 * 60_000).toUTCString()}</pubDate></item>`).join("")}</channel></rss>`;

type Route = { status: number; body?: string; headers?: Record<string, string> };
function fakeNet(routes: Record<string, Route | ((init?: RequestInit) => Route)>) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const f = async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const r0 = routes[url] ?? (url.endsWith("/robots.txt") ? { status: 404 } : { status: 404 });
    const r = typeof r0 === "function" ? r0(init) : r0;
    return new Response(r.status === 304 ? null : (r.body ?? ""), { status: r.status, headers: r.headers });
  };
  return { f, calls };
}

/** Point three real outlet rows at fake feeds and switch the rest off. */
function useOnly(feeds: Record<string, string>) {
  run("UPDATE news_sources SET active = 0");
  for (const [id, url] of Object.entries(feeds)) run("UPDATE news_sources SET active = 1, feed_url = ?, kind = 'rss', next_fetch_at = 0 WHERE id = ?", [url, id]);
}

describe("outlets", () => {
  it("ships at least 30 outlets across the spectrum, wire, paper and TV", () => {
    expect(OUTLET_LIST.length).toBeGreaterThanOrEqual(30);
    const leans = new Set(OUTLET_LIST.map((o) => o.lean));
    for (const l of ["Left", "Lean Left", "Center", "Lean Right", "Right"]) expect(leans.has(l as never)).toBe(true);
    for (const t of ["wire", "paper", "tv"]) expect(OUTLET_LIST.some((o) => o.type === t)).toBe(true);
    expect(get<{ n: number }>("SELECT count(*) n FROM news_sources WHERE demo = 0")!.n).toBe(OUTLET_LIST.length);
    for (const o of OUTLET_LIST) if (o.lean) expect(o.note).toMatch(/Approximate/);
  });
});

describe("robots.txt", () => {
  it("uses our group or *, longest match wins, Allow wins ties", () => {
    const body = "User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /private/\nAllow: /private/rss\nDisallow: /*.json$\n";
    const rules = robotsRules(body);
    expect(robotsAllows(rules, "/rss.xml")).toBe(true);
    expect(robotsAllows(rules, "/private/x")).toBe(false);
    expect(robotsAllows(rules, "/private/rss.xml")).toBe(true);
    expect(robotsAllows(rules, "/feed.json")).toBe(false);
    expect(robotsAllows(robotsRules("User-agent: WorldNetNewsBot\nDisallow: /\n"), "/rss")).toBe(false);
    expect(robotsAllows(robotsRules("User-agent: *\nDisallow:\n"), "/rss")).toBe(true);
  });
});

describe("ingest", () => {
  const A = "https://a.example.com/rss";
  const B = "https://b.example.com/feed";
  const C = "https://c.example.com/blocked/feed";
  const feedA = rss([
    ["Senate passes infrastructure bill in 62-38 vote", "senate-1", "The Senate approved the infrastructure bill, sending it to the House."],
    ["Chiefs beat Bills in overtime", "chiefs", "Kansas City won in overtime."],
  ]);
  const feedB = rss([["Infrastructure bill clears Senate with bipartisan support - Fox News", "senate-2", "The infrastructure bill passed the Senate with Republican votes."]]);

  it("fetches due feeds, respects robots.txt, stores snippets, clusters, and logs the run", async () => {
    useOnly({ npr: A, fox: B, nypost: C });
    const net = fakeNet({
      [A]: { status: 200, body: feedA, headers: { etag: '"v1"' } },
      [B]: { status: 200, body: feedB },
      "https://c.example.com/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /blocked/" },
    });
    const r = await runIngest({ fetchImpl: net.f, trigger: "test" });
    expect(r.newItems).toBe(3);
    expect(r.errors).toEqual([{ source: "New York Post", error: "Blocked by the site's robots.txt" }]);
    expect(net.calls.some((c) => c.url === C)).toBe(false); // never fetched the blocked feed
    expect(net.calls.find((c) => c.url === A)!.headers["user-agent"]).toMatch(/^WorldNetNewsBot\/1\.0/);

    const items = all<{ title: string; summary: string; story_key: string; source_id: string }>("SELECT title, summary, story_key, source_id FROM news_items WHERE source_id IN ('npr','fox')");
    expect(items.find((i) => i.source_id === "fox")!.title).toBe("Infrastructure bill clears Senate with bipartisan support");
    for (const i of items) expect(i.summary.length).toBeLessThan(280);
    const senate = items.filter((i) => /Senate/.test(i.title));
    expect(senate[0].story_key).toBe(senate[1].story_key);
    const story = get<{ title: string; category: string; importance: number; origin: string; section: string }>("SELECT * FROM stories WHERE key = ?", [senate[0].story_key])!;
    expect(story).toMatchObject({ origin: "real", category: "Politics", section: "Politics" });
    expect(story.title).toMatch(/Senate|Infrastructure/);
    expect(story.importance).toBeGreaterThan(20);
    expect(get<{ n: number }>("SELECT count(*) n FROM story_updates WHERE story_key = ?", [senate[0].story_key])!.n).toBe(2);
    expect(get<{ errors: number; new_items: number; finished_at: number }>("SELECT * FROM ingest_runs ORDER BY started_at DESC LIMIT 1")).toMatchObject({ errors: 1, new_items: 3 });

    const npr = get<{ last_success_at: number; etag: string; error_count: number }>("SELECT * FROM news_sources WHERE id = 'npr'")!;
    expect(npr.etag).toBe('"v1"');
    const post = get<{ error_count: number; last_error: string; next_fetch_at: number }>("SELECT * FROM news_sources WHERE id = 'nypost'")!;
    expect(post.error_count).toBe(1);
    expect(post.next_fetch_at).toBeGreaterThan(Date.now() + 15 * 60_000); // backed off
  });

  it("sends conditional requests, handles 304 and errors, and never duplicates items", async () => {
    useOnly({ npr: A, fox: B });
    let n = 0;
    const net = fakeNet({
      [A]: (init) => ((init?.headers as Record<string, string>)["if-none-match"] === '"v1"' ? { status: 304 } : { status: 200, body: feedA, headers: { etag: '"v1"' } }),
      [B]: () => (n++ === 0 ? { status: 200, body: feedB } : { status: 503 }),
    });
    await runIngest({ fetchImpl: net.f });
    const before = get<{ n: number }>("SELECT count(*) n FROM news_items")!.n;
    const r = await runIngest({ fetchImpl: net.f, force: true });
    expect(r.newItems).toBe(0);
    expect(r.errors).toEqual([{ source: "Fox News", error: "HTTP 503" }]);
    expect(get<{ n: number }>("SELECT count(*) n FROM news_items")!.n).toBe(before);
    expect(get<{ last_status: number }>("SELECT last_status FROM news_sources WHERE id = 'npr'")!.last_status).toBe(304);
  });

  it("skips a run while another holds the lock, and test-fetches a URL without saving", async () => {
    run("INSERT INTO site_settings (key, value) VALUES ('ingest_lock', ?)", [String(Date.now())]);
    expect((await runIngest({ fetchImpl: fakeNet({}).f })).skipped).toBeTruthy();
    run("DELETE FROM site_settings WHERE key = 'ingest_lock'");
    const t = await testFeedUrl(A, fakeNet({ [A]: { status: 200, body: feedA } }).f);
    expect(t).toMatchObject({ ok: true, count: 2 });
    expect(get<{ n: number }>("SELECT count(*) n FROM news_items")!.n).toBe(0);
    const bad = await testFeedUrl(A, fakeNet({ [A]: { status: 200, body: "<html>hi</html>" } }).f);
    expect(bad.ok).toBe(false);
  });
});

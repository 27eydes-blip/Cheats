import { beforeEach, describe, expect, it } from "vitest";
import { db, get, run } from "@/lib/db";
import { FAILING_AFTER, runIngest } from "@/lib/newsroom/ingest";
import { applyOutletUpdates, OUTLET_LIST, REMOVED_OUTLETS } from "@/lib/newsroom/outlets";
import { freshDb } from "./helpers";

beforeEach(freshDb);

const rss = (n: number, slug = "x") => `<rss><channel>${Array.from({ length: n }, (_, i) => `<item><title>Test headline ${slug} ${i}</title><link>https://test.example.com/${slug}/${i}</link><pubDate>${new Date(Date.now() - 60_000).toUTCString()}</pubDate></item>`).join("")}</channel></rss>`;
type R = { status: number; body?: string };
const net = (routes: Record<string, R | (() => R)>) => {
  const calls: string[] = [];
  const f = async (url: string) => {
    calls.push(url);
    const r0 = routes[url] ?? { status: 404 };
    const r = typeof r0 === "function" ? r0() : r0;
    return new Response(r.body ?? "", { status: r.status });
  };
  return { f, calls };
};
const only = (ids: string[]) => {
  run("UPDATE news_sources SET active = 0, pending_check = 0");
  run(`UPDATE news_sources SET active = 1, next_fetch_at = 0 WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
};
const src = (id: string) => get<{ active: number; pending_check: number; feed_url: string; feed_note: string; error_count: number; last_found: number; last_new: number; last_error: string | null }>("SELECT * FROM news_sources WHERE id = ?", [id])!;

describe("default outlet list", () => {
  it("drops Fox Business and Axios and never seeds them", () => {
    for (const id of Object.keys(REMOVED_OUTLETS)) {
      expect(OUTLET_LIST.some((o) => o.id === id)).toBe(false);
      expect(get("SELECT 1 FROM news_sources WHERE id = ?", [id])).toBeUndefined();
    }
  });
  it("adds new right-of-center outlets switched off until checked, each with a rating source", () => {
    const added = OUTLET_LIST.filter((o) => o.pendingCheck);
    expect(added.length).toBeGreaterThanOrEqual(3);
    for (const o of added) {
      expect(["Lean Right", "Right"]).toContain(o.lean);
      expect(o.note).toMatch(/Approximate: AllSides/);
      expect(src(o.id)).toMatchObject({ active: 0, pending_check: 1 });
    }
  });
});

describe("migration 9 on an existing database", () => {
  it("switches removed outlets off without deleting their articles, fixes HuffPost's old address once, and is repeatable", () => {
    const d = db();
    run("INSERT INTO news_sources (id, name, homepage, feed_url, verified, kind, active) VALUES ('foxbusiness', 'Fox Business', 'https://www.foxbusiness.com', 'https://moxie.foxbusiness.com/x.xml', 1, 'rss', 1)");
    run("INSERT INTO news_items (id, source_id, section, title, url, published_at) VALUES ('fb1', 'foxbusiness', 'Business', 'Old item', 'https://fb.example.com/1', ?)", [Date.now()]);
    run("UPDATE news_sources SET feed_url = 'https://www.huffpost.com/section/front-page/feed' WHERE id = 'huffpost'");
    const before = get<{ n: number }>("SELECT count(*) n FROM news_sources")!.n;
    applyOutletUpdates(d);
    applyOutletUpdates(d);
    expect(src("foxbusiness")).toMatchObject({ active: 0 });
    expect(src("foxbusiness").feed_note).toMatch(/robots\.txt/);
    expect(get("SELECT 1 FROM news_items WHERE id = 'fb1'")).toBeTruthy();
    expect(src("huffpost").feed_url).toBe("https://chaski.huffpost.io/us/auto/vertical/us-news");
    expect(get<{ n: number }>("SELECT count(*) n FROM news_sources")!.n).toBe(before);
    // an address an editor changed by hand is left alone
    run("UPDATE news_sources SET feed_url = 'https://edited.example.com/feed' WHERE id = 'msnbc'");
    applyOutletUpdates(d);
    expect(src("msnbc").feed_url).toBe("https://edited.example.com/feed");
  });
});

describe("feeds that return a web page", () => {
  it("finds the official feed linked on that page, checks robots.txt, and switches to it", async () => {
    only(["huffpost"]);
    run("UPDATE news_sources SET feed_url = 'https://www.huffpost.com/section/front-page/feed', feed_candidates = '[]' WHERE id = 'huffpost'");
    const html = `<html><head><link rel="alternate" type="application/rss+xml" href="https://chaski.huffpost.io/us/auto/vertical/front-page"></head><body>news</body></html>`;
    const n = net({ "https://www.huffpost.com/section/front-page/feed": { status: 200, body: html }, "https://chaski.huffpost.io/us/auto/vertical/front-page": { status: 200, body: rss(3, "hp") } });
    const r = await runIngest({ fetchImpl: n.f });
    expect(r.errors).toEqual([]);
    expect(src("huffpost")).toMatchObject({ feed_url: "https://chaski.huffpost.io/us/auto/vertical/front-page", last_found: 3, last_new: 3 });
    expect(src("huffpost").feed_note).toMatch(/updated automatically/);
  });

  it("tries the outlet's listed fallback addresses, but never one robots.txt disallows", async () => {
    only(["msnbc"]);
    run("UPDATE news_sources SET feed_candidates = ? WHERE id = 'msnbc'", [JSON.stringify(["https://www.msnow.com/private/feed", "https://www.msnow.com/rss"])]);
    const n = net({
      "https://www.msnbc.com/feeds/latest": { status: 200, body: "<html>page</html>" },
      "https://www.msnbc.com": { status: 200, body: "<html>home, no feed links</html>" },
      "https://www.msnow.com/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /private/" },
      "https://www.msnow.com/rss": { status: 200, body: rss(2, "ms") },
    });
    await runIngest({ fetchImpl: n.f });
    expect(n.calls).not.toContain("https://www.msnow.com/private/feed");
    expect(src("msnbc").feed_url).toBe("https://www.msnow.com/rss");
  });

  it("reports clearly when no feed can be found", async () => {
    only(["msnbc"]);
    const n = net({ "https://www.msnbc.com/feeds/latest": { status: 200, body: "<html>page</html>" } });
    const r = await runIngest({ fetchImpl: n.f });
    expect(r.errors[0].error).toMatch(/web page, not a feed/);
  });
});

describe("pending outlets", () => {
  it("switch on only when robots.txt allows and the feed has items; stay off for good when robots.txt disallows", async () => {
    only([]);
    run("UPDATE news_sources SET pending_check = 1, next_fetch_at = 0 WHERE id IN ('wsjopinion','dailysignal','townhall','theblaze')");
    const n = net({
      "https://feeds.a.dj.com/rss/RSSOpinion.xml": { status: 200, body: rss(4, "op") },
      "https://www.dailysignal.com/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /feed/" },
      "https://townhall.com/feed/": { status: 503 },
      "https://www.theblaze.com/feeds/feed.rss": { status: 200, body: rss(2, "bl") },
    });
    await runIngest({ fetchImpl: n.f });
    expect(src("wsjopinion")).toMatchObject({ active: 1, pending_check: 0, last_found: 4 });
    expect(src("dailysignal")).toMatchObject({ active: 0, pending_check: 0 });
    expect(src("dailysignal").feed_note).toMatch(/robots\.txt disallows/);
    expect(n.calls).not.toContain("https://www.dailysignal.com/feed/");
    expect(src("townhall")).toMatchObject({ active: 0, pending_check: 1, error_count: 1 }); // retried later
  });
});

describe("robots.txt failures are retried, and repeated failures are flagged", () => {
  it("retries robots.txt on the next sync instead of remembering the failure for a day", async () => {
    only(["newsmax"]);
    let robots = 503;
    const n = net({ "https://www.newsmax.com/robots.txt": () => ({ status: robots }), "https://www.newsmax.com/rss/Newsfront/16/": { status: 200, body: rss(2, "nm") } });
    const r1 = await runIngest({ fetchImpl: n.f });
    expect(r1.errors[0].error).toBe("robots.txt unavailable; will retry");
    // ten minutes later (the next sync), robots.txt answers
    run("UPDATE robots_cache SET fetched_at = fetched_at - 10 * 60000");
    run("UPDATE news_sources SET next_fetch_at = 0 WHERE id = 'newsmax'");
    robots = 200;
    const r2 = await runIngest({ fetchImpl: n.f });
    expect(r2.errors).toEqual([]);
    expect(src("newsmax")).toMatchObject({ error_count: 0, last_found: 2 });
  });

  it("counts failures in a row so the Control Room can flag a feed after three", async () => {
    only(["npr"]);
    const n = net({ "https://feeds.npr.org/1001/rss.xml": { status: 500 } });
    for (let i = 0; i < FAILING_AFTER; i++) {
      run("UPDATE news_sources SET next_fetch_at = 0 WHERE id = 'npr'");
      await runIngest({ fetchImpl: n.f });
    }
    expect(src("npr").error_count).toBe(FAILING_AFTER);
  });
});

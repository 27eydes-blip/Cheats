import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { all, get, now, run } from "@/lib/db";
import { aiSettings, aiSourcesFor, approveAiPost, deleteAiPost, groundingCheck, inPostingHours, listAccounts, needsConfirmation, parseHours, pickStories, rejectAiPost, runAiHour, setAiMuted, setAiSettings, slotOf, spend, updateAccount } from "@/lib/ai/newsroom";
import { PERSONAS } from "@/lib/ai/personas";
import { costUsd, type AiWriter, type DraftInput } from "@/lib/ai/writer";
import { isAiUser } from "@/lib/ai/flags";
import { hydrate } from "@/lib/posts";
import { getProfile } from "@/lib/users";
import { forYou } from "@/lib/foryou";
import { freshDb, makeUser } from "./helpers";

const T = Date.UTC(2026, 10, 22, 14, 10);
const usage = { model: "claude-opus-5-5", inputTokens: 1000, outputTokens: 200, cacheRead: 0, cacheWrite: 0 };

/** A fake writer: drafts the first source's title as a dispatch and passes verification unless told otherwise. */
function fakeWriter(opts: { body?: (i: DraftInput) => string; pass?: boolean; skip?: boolean } = {}) {
  const calls = { draft: 0, verify: 0 };
  const w: AiWriter = {
    async draft(i) {
      calls.draft++;
      return { draft: { skip: !!opts.skip, skipReason: opts.skip ? "thin" : "", body: opts.body ? opts.body(i) : `${i.sources[0].outlet} reports: ${i.sources[0].title}.`, sourceIds: [i.sources[0].id] }, usage };
    },
    async verify() {
      calls.verify++;
      const pass = opts.pass ?? true;
      return { verdict: { pass, unsupported: pass ? [] : ["The vote was 61 to 39."], endorses: false, oneSided: false, notes: "" }, usage };
    },
  };
  return { w, calls };
}

let n = 0;
function outlet(name: string, lean = "Center") {
  const id = `t-${name.toLowerCase().replace(/\W+/g, "-")}`;
  run("INSERT OR IGNORE INTO news_sources (id, name, homepage, feed_url, lean, demo, active) VALUES (?, ?, 'https://example.test', 'https://example.test/rss', ?, 0, 1)", [id, name, lean]);
  return id;
}
function story(title: string, category: string, articles: { outlet: string; title?: string; summary?: string }[], t = T - 3_600_000) {
  const key = `s${++n}`;
  run("INSERT INTO stories (key, title, summary, section, status, created_at, updated_at, origin, category, importance, last_article_at) VALUES (?, ?, '', 'Top Stories', 'developing', ?, ?, 'real', ?, 50, ?)", [key, title, t, t, category, t]);
  for (const a of articles)
    run("INSERT INTO news_items (id, source_id, section, title, summary, url, story_key, published_at) VALUES (?, ?, 'Top Stories', ?, ?, ?, ?, ?)", [
      `i${key}${a.outlet}`,
      outlet(a.outlet),
      a.title ?? title,
      a.summary ?? "Lawmakers in the Senate voted on Tuesday to advance the spending bill after a long debate over the measure.",
      `https://example.test/${key}/${a.outlet}`,
      key,
      t,
    ]);
  return key;
}

beforeEach(() => {
  freshDb();
  process.env.AI_DAILY_CAP_USD = "5";
  process.env.AI_MONTHLY_CAP_USD = "50";
  setAiSettings({ enabled: true, approval: "auto" });
});
afterEach(() => {
  delete process.env.AI_DAILY_CAP_USD;
  delete process.env.AI_MONTHLY_CAP_USD;
});

describe("AI accounts", () => {
  it("creates the ten AI accounts with the AI flag, an AI bio and no way to sign in", () => {
    const accts = listAccounts();
    expect(accts).toHaveLength(10);
    expect(accts.map((a) => a.handle)).toContain("ai_worlddesk");
    for (const a of accts) {
      const u = get<{ is_ai: number; password_hash: string | null; bio: string }>("SELECT is_ai, password_hash, bio FROM users WHERE id = ?", [a.user_id])!;
      expect(u.is_ai).toBe(1);
      expect(u.password_hash).toBeNull();
      expect(u.bio).toMatch(/^AI analyst/);
      expect(u.bio).toMatch(/Not a person/);
      expect(isAiUser(a.user_id)).toBe(true);
    }
    expect(new Set(PERSONAS.map((p) => p.niche)).size).toBe(10);
  });

  it("keeps the kill switch OFF by default", () => {
    freshDb();
    expect(aiSettings()).toEqual({ enabled: false, approval: "auto" });
  });

  it("marks AI authors on profiles and posts, with the source list", async () => {
    story("Senate advances spending bill", "Politics", [{ outlet: "Wire A" }]);
    await runAiHour({ writer: fakeWriter().w, t: T });
    const row = get<{ post_id: string }>("SELECT post_id FROM ai_posts WHERE status = 'posted'")!;
    const [view] = hydrate([row.post_id], null);
    expect(view.author.ai).toBe(true);
    expect(view.author.avatarUrl).toBe("/api/ai/avatar/ai_capitol");
    expect(aiSourcesFor([row.post_id]).get(row.post_id)).toEqual([{ outlet: "Wire A", title: "Senate advances spending bill", url: expect.stringContaining("Wire A") }]);
    expect(getProfile("ai_capitol", null)?.ai).toBe(true);
  });
});

describe("scheduler", () => {
  it("posts 1-2 grounded dispatches per niche with a link to the original reporting", async () => {
    story("Senate advances spending bill", "Politics", [{ outlet: "Wire A" }]);
    story("House passes farm bill", "Politics", [{ outlet: "Wire B" }]);
    story("Third politics story", "Politics", [{ outlet: "Wire C" }]);
    const r = await runAiHour({ writer: fakeWriter().w, t: T });
    expect(r.posted).toBe(2);
    const posts = all<{ body: string; link_url: string; author_id: string }>("SELECT body, link_url, author_id FROM posts");
    expect(posts).toHaveLength(2);
    expect(posts.every((p) => p.link_url.startsWith("https://example.test/"))).toBe(true);
  });

  it("does nothing while the kill switch is off, without a key, or with no caps", async () => {
    story("Senate advances spending bill", "Politics", [{ outlet: "Wire A" }]);
    const { w, calls } = fakeWriter();
    setAiSettings({ enabled: false });
    expect((await runAiHour({ writer: w, t: T })).skipped).toMatch(/kill switch/);
    setAiSettings({ enabled: true });
    expect((await runAiHour({ writer: null, t: T })).skipped).toMatch(/ANTHROPIC_API_KEY/);
    delete process.env.AI_DAILY_CAP_USD;
    expect((await runAiHour({ writer: w, t: T })).skipped).toMatch(/caps are not set/);
    expect(calls.draft).toBe(0);
    expect(get("SELECT count(*) n FROM ai_runs")).toEqual({ n: 0 });
  });

  it("stops when the daily cap is reached", async () => {
    story("Senate advances spending bill", "Politics", [{ outlet: "Wire A" }]);
    run("INSERT INTO ai_usage (id, at, purpose, model, cost_usd) VALUES ('x', ?, 'draft', 'claude-opus-5-5', 4.95)", [T - 60_000]);
    const { w, calls } = fakeWriter();
    expect((await runAiHour({ writer: w, t: T })).skipped).toMatch(/Daily cap reached/);
    expect(calls.draft).toBe(0);
  });

  it("is safe to restart: the same hour never runs twice", async () => {
    story("Senate advances spending bill", "Politics", [{ outlet: "Wire A" }]);
    const { w, calls } = fakeWriter();
    await runAiHour({ writer: w, t: T });
    story("House passes farm bill", "Politics", [{ outlet: "Wire B" }]);
    // a "restart" later in the same hour
    await runAiHour({ writer: w, t: T + 20 * 60_000 });
    expect(calls.draft).toBe(1);
    expect(get<{ n: number }>("SELECT count(*) n FROM posts")!.n).toBe(1);
    // next hour picks up the new story
    await runAiHour({ writer: w, t: T + 60 * 60_000 });
    expect(get<{ n: number }>("SELECT count(*) n FROM posts")!.n).toBe(2);
  });

  it("skips the hour when a niche has no real material", async () => {
    const { w, calls } = fakeWriter();
    const r = await runAiHour({ writer: w, t: T });
    expect(calls.draft).toBe(0);
    expect(r.accounts.every((a) => a.outcome === "no_material")).toBe(true);
    // demo outlets never count as material
    const key = story("Senate advances spending bill", "Politics", [{ outlet: "Demo Paper" }]);
    run("UPDATE news_sources SET demo = 1 WHERE id = 't-demo-paper'");
    expect(pickStories({ user_id: listAccounts()[0].user_id, slug: "capitol" }, T)).toHaveLength(0);
    void key;
  });

  it("respects pause and posting hours, and rotates formats", async () => {
    const cap = listAccounts().find((a) => a.slug === "capitol")!;
    story("Senate advances spending bill", "Politics", [{ outlet: "Wire A" }]);
    updateAccount(cap.user_id, { paused: true });
    const { w } = fakeWriter();
    await runAiHour({ writer: w, t: T });
    expect(get<{ n: number }>("SELECT count(*) n FROM posts")!.n).toBe(0);
    updateAccount(cap.user_id, { paused: false, hours: "6-9" });
    await runAiHour({ writer: w, t: T + 3_600_000 }); // 15:00 UTC is outside 6-9
    expect(get<{ n: number }>("SELECT count(*) n FROM posts")!.n).toBe(0);
    updateAccount(cap.user_id, { hours: "all" });
    story("House passes farm bill", "Politics", [{ outlet: "Wire B" }]);
    await runAiHour({ writer: w, t: T + 2 * 3_600_000 });
    const formats = all<{ format: string }>("SELECT format FROM ai_posts WHERE status = 'posted' ORDER BY created_at").map((r) => r.format);
    expect(formats.sort()).toEqual(["explainer", "quick_take"]);
  });

  it("holds breaking violence until two outlets report it", async () => {
    const one = story("Gunman opens fire at mall, police say", "US", [{ outlet: "Wire A", summary: "Police said a gunman opened fire at a shopping mall on Tuesday; several people were reported injured." }]);
    run("UPDATE stories SET category = 'Politics' WHERE key = ?", [one]);
    const { w, calls } = fakeWriter();
    await runAiHour({ writer: w, t: T });
    expect(calls.draft).toBe(0);
    expect(get("SELECT status FROM ai_posts WHERE story_key = ?", [one])).toEqual({ status: "held" });
    // a second outlet confirms: the next hour writes it
    run("INSERT INTO news_items (id, source_id, section, title, summary, url, story_key, published_at) VALUES ('i2', ?, 'Top Stories', 'Shooting at mall', 'Police confirmed a shooting at a mall on Tuesday.', 'https://example.test/b', ?, ?)", [outlet("Wire B"), one, T]);
    await runAiHour({ writer: w, t: T + 3_600_000 });
    expect(calls.draft).toBe(1);
    expect(get<{ n: number }>("SELECT count(*) n FROM ai_posts WHERE story_key = ? AND status = 'posted'", [one])!.n).toBe(1);
  });

  it("uses manual approval when it is switched on", async () => {
    setAiSettings({ approval: "manual" });
    story("Senate advances spending bill", "Politics", [{ outlet: "Wire A" }]);
    const admin = await makeUser();
    const r = await runAiHour({ writer: fakeWriter().w, t: T });
    expect(r.queued).toBe(1);
    expect(get<{ n: number }>("SELECT count(*) n FROM posts")!.n).toBe(0);
    const q = get<{ id: string }>("SELECT id FROM ai_posts WHERE status = 'queued'")!;
    const postId = approveAiPost(q.id, admin.id);
    expect(get("SELECT author_id FROM posts WHERE id = ?", [postId!])).toBeTruthy();
    expect(() => rejectAiPost(q.id, admin.id)).toThrow();
    deleteAiPost(q.id, admin.id);
    expect(get<{ deleted_at: number | null }>("SELECT deleted_at FROM posts WHERE id = ?", [postId!])!.deleted_at).toBeTruthy();
  });

  it("records spend per call and prices conservatively", async () => {
    story("Senate advances spending bill", "Politics", [{ outlet: "Wire A" }]);
    await runAiHour({ writer: fakeWriter().w, t: T });
    const expected = 2 * costUsd(usage);
    expect(spend(T).today).toBeCloseTo(expected, 6);
    expect(costUsd({ ...usage, model: "some-future-model" }, "some-future-model")).toBeGreaterThan(costUsd(usage));
  });

  it("parses posting hours", () => {
    expect(parseHours("all")).toBeNull();
    expect([...parseHours("22-2")!].sort((a, b) => a - b)).toEqual([0, 1, 2, 22, 23]);
    expect(inPostingHours("8,12,18", 12)).toBe(true);
    expect(inPostingHours("8,12,18", 13)).toBe(false);
    expect(() => parseHours("noon")).toThrow();
    expect(slotOf(T)).toBe("2026-11-22T14");
  });
});

describe("grounding check", () => {
  const src = [{ title: "Senate votes 61-39 to advance $1.2 trillion spending bill", snippet: 'The majority leader said the bill was "a fair compromise" and the House votes on Friday.' }];

  it("passes text whose numbers and quotes are in the sources", () => {
    expect(groundingCheck('The Senate advanced a $1.2 trillion bill 61-39; the leader called it "a fair compromise." The House votes Friday.', src)).toEqual([]);
  });

  it("blocks invented numbers, invented quotes, links, mentions and endorsements", () => {
    expect(groundingCheck("The Senate advanced the bill 62-38.", src).join(" ")).toMatch(/"62" is not in the sources/);
    expect(groundingCheck('The leader called it "a historic win for families".', src).join(" ")).toMatch(/quote/);
    expect(groundingCheck("Read more at https://example.com", src).join(" ")).toMatch(/link/);
    expect(groundingCheck("Thanks @someone for the tip.", src).join(" ")).toMatch(/mentions/);
    expect(groundingCheck("Voters should vote for the incumbent.", src).join(" ")).toMatch(/endorsement/);
    expect(groundingCheck("In my years covering Congress, this is rare.", src).join(" ")).toMatch(/writer/);
  });

  it("blocks posts the verification pass rejects and logs them", async () => {
    story("Senate advances spending bill", "Politics", [{ outlet: "Wire A" }]);
    const r = await runAiHour({ writer: fakeWriter({ pass: false }).w, t: T });
    expect(r.blocked).toBe(1);
    expect(get<{ n: number }>("SELECT count(*) n FROM posts")!.n).toBe(0);
    const b = get<{ reason: string; verification: string; body: string }>("SELECT reason, verification, body FROM ai_posts WHERE status = 'blocked'")!;
    expect(b.reason).toMatch(/Unsupported: The vote was 61 to 39/);
    expect(JSON.parse(b.verification).pass).toBe(false);
    expect(b.body).toBeTruthy();
  });

  it("blocks a draft with a number missing from the sources even if verification passed", async () => {
    story("Senate advances spending bill", "Politics", [{ outlet: "Wire A" }]);
    const r = await runAiHour({ writer: fakeWriter({ body: () => "The Senate advanced the bill by 12 votes." }).w, t: T });
    expect(r.blocked).toBe(1);
    expect(needsConfirmation("Officials said the claims are unverified")).toBe(true);
  });
});

describe("duplicate guard", () => {
  it("never posts the same story twice, across hours and accounts", async () => {
    // a story that matches two desks (Politics category, and the courts keyword desk)
    const key = story("Supreme Court ruling on Senate rules", "Politics", [{ outlet: "Wire A", summary: "The Supreme Court issued a ruling on Tuesday about Senate rules, and justices split on the decision." }]);
    const { w } = fakeWriter();
    await runAiHour({ writer: w, t: T });
    await runAiHour({ writer: w, t: T + 3_600_000 });
    await runAiHour({ writer: w, t: T + 2 * 3_600_000 });
    expect(get<{ n: number }>("SELECT count(*) n FROM ai_posts WHERE story_key = ? AND status = 'posted'", [key])!.n).toBe(1);
    expect(get<{ n: number }>("SELECT count(*) n FROM posts")!.n).toBe(1);
  });

  it("the database refuses a second live dispatch for one story", () => {
    const a = listAccounts();
    run("INSERT INTO ai_posts (id, account_id, slot, story_key, format, status, created_at) VALUES ('a', ?, 'x', 'k', 'quick_take', 'posted', 1)", [a[0].user_id]);
    expect(() => run("INSERT INTO ai_posts (id, account_id, slot, story_key, format, status, created_at) VALUES ('b', ?, 'y', 'k', 'quick_take', 'queued', 2)", [a[1].user_id])).toThrow(/UNIQUE/);
    // blocked attempts are logged freely
    run("INSERT INTO ai_posts (id, account_id, slot, story_key, format, status, created_at) VALUES ('c', ?, 'y', 'k', 'quick_take', 'blocked', 2)", [a[1].user_id]);
  });
});

describe("reader controls", () => {
  it("mutes every AI account in one tap and offers a Human only feed", async () => {
    story("Senate advances spending bill", "Politics", [{ outlet: "Wire A" }]);
    await runAiHour({ writer: fakeWriter().w, t: T });
    const viewer = await makeUser();
    const aiPost = get<{ post_id: string }>("SELECT post_id FROM ai_posts WHERE status = 'posted'")!.post_id;
    run("UPDATE posts SET created_at = ? WHERE id = ?", [now() - 60_000, aiPost]);
    const ids = (page: ReturnType<typeof forYou>) => JSON.stringify(page.items);
    expect(ids(forYou(viewer.id))).toContain(aiPost);
    expect(ids(forYou(viewer.id, null, undefined, { humanOnly: true }))).not.toContain(aiPost);
    setAiMuted(viewer.id, true);
    expect(ids(forYou(viewer.id))).not.toContain(aiPost);
    setAiMuted(viewer.id, false);
    expect(ids(forYou(viewer.id))).toContain(aiPost);
  });
});

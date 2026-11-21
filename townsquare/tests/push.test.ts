import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { get, now, run } from "@/lib/db";
import { alertUser, getAlertPrefs, inQuietHours, saveSubscription, setAlertPrefs, setPushTransport, subscriptionCount, type SubRow } from "@/lib/push/push";
import { afterIngest, breakingPreview, sendBreaking } from "@/lib/push/news-alerts";
import { addFeedTab } from "@/lib/feedtabs";
import { createPost } from "@/lib/posts";
import { freshDb, makeUser } from "./helpers";

let sent: { endpoint: string; payload: { title: string; body: string; url: string } }[] = [];
let status: Record<string, number> = {};
beforeEach(() => {
  freshDb();
  sent = [];
  status = {};
  setPushTransport(async (sub: SubRow, payload: string) => {
    sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
    return status[sub.endpoint] ?? 201;
  });
});
afterEach(() => setPushTransport(null));

const sub = (n: string) => ({ endpoint: `https://push.example.com/${n}`, keys: { p256dh: "BOr" + n, auth: "au" + n } });
const payload = { title: "T", body: "B", url: "/" };
const story = (key: string, o: { importance?: number; category?: string; outlets?: number } = {}) => {
  run("INSERT INTO stories (key, title, section, status, created_at, updated_at, origin, importance, category) VALUES (?, ?, 'Politics', 'developing', ?, ?, 'real', ?, ?)", [key, `Headline ${key}`, now(), now(), o.importance ?? 50, o.category ?? "Politics"]);
  const outlets = ["npr", "fox", "cnn", "upi", "wsj", "nyt", "bbc", "nypost", "axios", "thehill"].slice(0, o.outlets ?? 0);
  outlets.forEach((src, i) => run("INSERT INTO news_items (id, source_id, section, title, url, story_key, published_at) VALUES (?, ?, 'Politics', 'h', ?, ?, ?)", [`${key}${i}`, src, `https://x.example.com/${key}/${i}`, key, now()]));
};

describe("subscriptions and the sender", () => {
  it("accepts only https push endpoints with keys", async () => {
    const u = await makeUser();
    expect(() => saveSubscription(u.id, { endpoint: "http://push.example.com/x", keys: { p256dh: "a", auth: "b" } })).toThrow();
    expect(() => saveSubscription(u.id, { endpoint: "https://push.example.com/x", keys: { p256dh: "", auth: "b" } } as never)).toThrow();
    saveSubscription(u.id, sub("1"));
    saveSubscription(u.id, sub("1")); // same device again: no duplicate
    expect(subscriptionCount(u.id)).toBe(1);
  });

  it("sends to every device, removes expired subscriptions and drops ones that keep failing", async () => {
    const u = await makeUser();
    saveSubscription(u.id, sub("ok"));
    saveSubscription(u.id, sub("gone"));
    saveSubscription(u.id, sub("flaky"));
    status = { "https://push.example.com/gone": 410, "https://push.example.com/flaky": 503 };
    expect(await alertUser(u.id, "replies", "r1", payload)).toEqual({ sent: 1 });
    expect(subscriptionCount(u.id)).toBe(2); // 410 deleted
    expect(get<{ failures: number }>("SELECT failures FROM push_subscriptions WHERE endpoint LIKE '%flaky'")!.failures).toBe(1);
    for (let i = 2; i <= 5; i++) await alertUser(u.id, "replies", `r${i}`, payload);
    expect(subscriptionCount(u.id)).toBe(1); // flaky dropped after 5 failures in a row
  });

  it("never sends the same alert twice and respects per-type switches", async () => {
    const u = await makeUser();
    saveSubscription(u.id, sub("a"));
    expect(await alertUser(u.id, "mentions", "m1", payload)).toEqual({ sent: 1 });
    expect(await alertUser(u.id, "mentions", "m1", payload)).toEqual({ skipped: "duplicate" });
    setAlertPrefs(u.id, { mentions: false });
    expect(await alertUser(u.id, "mentions", "m2", payload)).toEqual({ skipped: "off" });
    const nobody = await makeUser();
    expect(await alertUser(nobody.id, "mentions", "m3", payload)).toEqual({ skipped: "no_devices" });
  });

  it("holds alerts during quiet hours (which can wrap midnight) in the user's time zone", async () => {
    const p = { quietStart: 22 * 60, quietEnd: 7 * 60, tz: "America/New_York" };
    expect(inQuietHours(p, Date.UTC(2026, 10, 21, 4, 0))).toBe(true); // 11pm in New York
    expect(inQuietHours(p, Date.UTC(2026, 10, 21, 11, 30))).toBe(true); // 6:30am
    expect(inQuietHours(p, Date.UTC(2026, 10, 21, 17, 0))).toBe(false); // noon
    expect(inQuietHours({ ...p, quietStart: null }, Date.UTC(2026, 10, 21, 4, 0))).toBe(false);
    const u = await makeUser();
    saveSubscription(u.id, sub("q"));
    setAlertPrefs(u.id, p);
    expect(await alertUser(u.id, "follows", "f1", payload, Date.UTC(2026, 10, 21, 4, 0))).toEqual({ skipped: "quiet" });
    expect(getAlertPrefs(u.id).tz).toBe("America/New_York");
    setAlertPrefs(u.id, { tz: "Not/AZone" });
    expect(getAlertPrefs(u.id).tz).toBe("America/New_York");
  });

  it("caps breaking alerts per day", async () => {
    const u = await makeUser();
    saveSubscription(u.id, sub("c"));
    setAlertPrefs(u.id, { breakingCap: 2 });
    expect(await alertUser(u.id, "breaking", "s1", payload)).toEqual({ sent: 1 });
    expect(await alertUser(u.id, "breaking", "s2", payload)).toEqual({ sent: 1 });
    expect(await alertUser(u.id, "breaking", "s3", payload)).toEqual({ skipped: "cap" });
  });
});

describe("breaking and followed alerts", () => {
  it("lets editors preview and send a story once, never twice", async () => {
    const admin = { ...(await makeUser()), role: "admin" as const };
    const user = await makeUser();
    saveSubscription(user.id, sub("u"));
    story("big");
    const pv = breakingPreview({ storyKey: "big" });
    expect(pv).toMatchObject({ alreadySent: null, recipients: 1, payload: { title: "Breaking news", body: "Headline big", url: "/news/story/big" } });
    await expect(sendBreaking({ id: user.id, role: "user" }, { storyKey: "big" })).rejects.toThrow(/Editors/);
    expect(await sendBreaking(admin, { storyKey: "big" })).toMatchObject({ users: 1, sent: 1 });
    await expect(sendBreaking(admin, { storyKey: "big" })).rejects.toThrow(/already sent/);
    expect(breakingPreview({ storyKey: "big" }).alreadySent).not.toBeNull();
    expect(sent).toHaveLength(1);
    expect(() => breakingPreview({ title: "x", url: "https://evil.example.com" })).toThrow(/this site/);
  });

  it("sends an automatic breaking alert for a very big new story, and followed-topic alerts", async () => {
    const a = await makeUser();
    const b = await makeUser();
    saveSubscription(a.id, sub("a"));
    saveSubscription(b.id, sub("b"));
    addFeedTab(b.id, "topic", "markets");
    story("huge", { importance: 92, outlets: 9, category: "Politics" });
    story("small", { importance: 30, outlets: 2 });
    story("mkts", { importance: 70, outlets: 3, category: "Markets" });
    await afterIngest(["huge", "small", "mkts"]);
    const bodies = sent.map((s) => `${s.endpoint.slice(-1)}:${s.payload.title}:${s.payload.body}`);
    expect(bodies).toContain("a:Breaking news:Headline huge");
    expect(bodies).toContain("b:Breaking news:Headline huge");
    expect(bodies).toContain("b:Markets:Headline mkts");
    expect(bodies.some((x) => x.includes("small"))).toBe(false);
    expect(get<{ auto: number }>("SELECT auto FROM breaking_alerts WHERE story_key = 'huge'")!.auto).toBe(1);
    sent = [];
    await afterIngest(["huge", "mkts"]); // next run: nothing repeats
    expect(sent).toHaveLength(0);
  });

  it("pushes responses to the author's devices", async () => {
    const author = await makeUser();
    const replier = await makeUser();
    saveSubscription(author.id, sub("auth"));
    const p = createPost(author, { body: "Original dispatch" });
    createPost(replier, { body: "A response", replyToId: p });
    await new Promise((r) => setTimeout(r, 20));
    expect(sent.map((s) => s.payload.title)).toContain(`@${replier.handle} responded`);
  });
});

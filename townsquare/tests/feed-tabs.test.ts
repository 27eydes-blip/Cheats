import { beforeEach, describe, expect, it } from "vitest";
import { addSponsoredCard, getAds, removeSponsoredCard, setAdsEnabled } from "@/lib/ads";
import { now, run } from "@/lib/db";
import { addFeedTab, getFeedTabs, removeFeedTab } from "@/lib/feedtabs";
import { MAX_FEED_TABS, parseHomeTab, tabHref } from "@/lib/feedtabs-meta";
import { forYou, isRising } from "@/lib/foryou";
import { clearHistory, recentHistory } from "@/lib/history";
import { trackEvents } from "@/lib/interests";
import { addListMember, createList, deleteList, getList, listFeed, listsOf } from "@/lib/lists";
import { canMessage, listConversations, sendMessage, thread, unreadMessages } from "@/lib/messages";
import { createPost } from "@/lib/posts";
import { setBlock, setFollow } from "@/lib/social";
import { saveOnboarding } from "@/lib/users";
import { freshDb, makeUser } from "./helpers";

beforeEach(freshDb);
const story = (key: string, section: string, title = `Story ${key}`) => {
  const t = now();
  run("INSERT INTO stories (key, title, section, status, created_at, updated_at) VALUES (?, ?, ?, 'developing', ?, ?)", [key, title, section, t, t]);
};
const post = (u: Awaited<ReturnType<typeof makeUser>>, body: string, storyKey?: string) => createPost(u, { body, storyKey, stance: storyKey ? "agree" : undefined } as Parameters<typeof createPost>[1]);
const admin = async () => {
  const a = await makeUser();
  run("UPDATE users SET role = 'admin' WHERE id = ?", [a.id]);
  return { ...a, role: "admin" as const };
};

describe("home feed tabs", () => {
  it("parses the tab parameter and falls back to For You", () => {
    expect(parseHomeTab(undefined)).toEqual({ kind: "foryou" });
    expect(parseHomeTab("friends")).toEqual({ kind: "friends" });
    expect(parseHomeTab("following")).toEqual({ kind: "friends" }); // old links keep working
    expect(parseHomeTab("t-sports")).toEqual({ kind: "topic", key: "sports" });
    expect(parseHomeTab("t-nonsense")).toEqual({ kind: "foryou" });
    expect(parseHomeTab("team-nfl-kc")).toEqual({ kind: "team", key: "nfl-kc" });
    expect(parseHomeTab("team-<script>")).toEqual({ kind: "foryou" });
    expect(tabHref({ kind: "topic", key: "tech" })).toBe("/?tab=t-tech");
    expect(tabHref({ kind: "foryou" })).toBe("/");
  });

  it("starts from sign-up beats, then lets you add and remove topics and teams", async () => {
    const u = await makeUser();
    saveOnboarding(u.id, { interests: ["Sports", "Tech"], town: "" });
    expect(getFeedTabs(u.id).map((t) => t.key)).toEqual(["sports", "tech"]);
    addFeedTab(u.id, "team", "nfl-kc");
    addFeedTab(u.id, "team", "nfl-kc"); // no duplicates
    addFeedTab(u.id, "topic", "world");
    const tabs = getFeedTabs(u.id);
    expect(tabs.map((t) => t.key)).toEqual(["sports", "tech", "nfl-kc", "world"]);
    expect(tabs[2]).toMatchObject({ kind: "team", label: "Chiefs" });
    removeFeedTab(u.id, "topic", "sports");
    expect(getFeedTabs(u.id).map((t) => t.key)).toEqual(["tech", "nfl-kc", "world"]);
    expect(() => addFeedTab(u.id, "topic", "gossip")).toThrow(/doesn't exist/);
    expect(() => addFeedTab(u.id, "team", "nfl-zzz")).toThrow(/doesn't exist/);
  });

  it("gives logged-out visitors and users without beats the default topics, and caps pinned tabs", async () => {
    expect(getFeedTabs(null).map((t) => t.key)).toEqual(["politics", "markets", "sports", "tech", "world"]);
    const u = await makeUser();
    expect(getFeedTabs(u.id)).toHaveLength(5);
    for (const k of ["culture", "national"]) addFeedTab(u.id, "topic", k);
    for (const k of ["nfl-kc", "nfl-buf", "nba-lal", "nba-bos", "mlb-nyy"]) addFeedTab(u.id, "team", k);
    expect(getFeedTabs(u.id)).toHaveLength(MAX_FEED_TABS);
    expect(() => addFeedTab(u.id, "team", "nhl-nyr")).toThrow(/up to 12/);
  });

  it("topic and team tabs filter the feed", async () => {
    const a = await makeUser();
    story("vote", "Politics");
    story("game", "Sports", "Celtics edge Knicks in overtime");
    story("chips", "Tech");
    const onGame = post(a, "What a finish", "game");
    const loose = post(a, "No story attached");
    const key = (i: ReturnType<typeof forYou>["items"][number]) => (i.kind === "story" ? i.story.key : i.kind === "post" ? i.post.id : "ad");
    const sports = forYou(null, null, 20, { topic: "sports" }).items.map(key);
    expect(sports.sort()).toEqual([onGame, "game"].sort());
    const celtics = forYou(null, null, 20, { teamId: "nba-bos" }).items.map(key);
    expect(celtics.sort()).toEqual([onGame, "game"].sort());
    expect(forYou(null, null, 20, { teamId: "nfl-kc" }).items).toHaveLength(0);
    expect(forYou(null, null, 20).items.map(key)).toContain(loose);
  });

  it("flags rising stories", () => {
    expect(isRising({ velocity: 4, series: [0, 0, 0, 0, 0, 0, 1, 0, 1, 2, 1, 1] })).toBe(true);
    expect(isRising({ velocity: 2, series: Array(12).fill(0) })).toBe(false);
    expect(isRising({ velocity: 3, series: [0, 0, 0, 0, 0, 0, 3, 3, 3, 1, 1, 1] })).toBe(false);
  });
});

describe("sponsored cards", () => {
  it("are off by default, admin-only, labeled, and sit at fixed slots only in For You", async () => {
    const a = await makeUser();
    for (let i = 0; i < 6; i++) story(`s${i}`, "Tech");
    const boss = await admin();
    expect(getAds()).toEqual({ enabled: false, cards: [] });
    expect(() => setAdsEnabled(a, true)).toThrow(/Admins/);
    expect(() => addSponsoredCard(boss, { sponsor: "Acme", title: "Hi", body: "", url: "javascript:alert(1)" })).toThrow(/web address/);
    addSponsoredCard(boss, { sponsor: "Acme", title: "Try Acme", body: "Fine goods.", url: "https://acme.example/" });
    expect(forYou(null).items.some((i) => i.kind === "sponsored")).toBe(false); // cards exist, switch still off
    setAdsEnabled(boss, true);
    const items = forYou(null).items;
    expect(items.findIndex((i) => i.kind === "sponsored")).toBe(3);
    expect(items.filter((i) => i.kind === "sponsored")).toHaveLength(1);
    expect(forYou(null, null, 20, { topic: "tech" }).items.some((i) => i.kind === "sponsored")).toBe(false);
    removeSponsoredCard(boss, getAds().cards[0].id);
    expect(forYou(null).items.some((i) => i.kind === "sponsored")).toBe(false);
  });
});

describe("messages", () => {
  it("only people who follow you (or wrote first) can be messaged; blocks stop everything", async () => {
    const a = await makeUser();
    const b = await makeUser();
    expect(canMessage(a.id, b.id).ok).toBe(false);
    expect(() => sendMessage(a, b.id, "hello?")).toThrow(/follow you/);
    setFollow(b, a.id, true); // b follows a → a may write to b
    sendMessage(a, b.id, "  Hello there  ");
    expect(unreadMessages(b.id)).toBe(1);
    expect(listConversations(b.id)[0]).toMatchObject({ unread: 1, last: { body: "Hello there", mine: false } });
    expect(thread(b.id, a.id).map((m) => m.body)).toEqual(["Hello there"]);
    expect(unreadMessages(b.id)).toBe(0); // opening marks read
    sendMessage(b, a.id, "Hi back"); // a wrote first, so b may reply even though a doesn't follow b
    expect(thread(a.id, b.id).map((m) => [m.mine, m.body])).toEqual([[true, "Hello there"], [false, "Hi back"]]);
    expect(() => sendMessage(a, b.id, "")).toThrow(/Write/);
    expect(() => sendMessage(a, b.id, "x".repeat(1001))).toThrow(/1000/);
    expect(() => sendMessage(a, a.id, "me")).toThrow(/yourself/);
    setBlock(b, a.id, true);
    expect(() => sendMessage(a, b.id, "still there?")).toThrow(/can't message/);
    expect(listConversations(a.id)).toHaveLength(0);
    expect(thread(a.id, b.id)).toHaveLength(0);
  });
});

describe("lists and history", () => {
  it("lists are private, hold accounts, and have their own feed", async () => {
    const me = await makeUser();
    const other = await makeUser();
    const writer = await makeUser();
    const pid = post(writer, "From a list member");
    post(other, "Not on the list");
    const id = createList(me, "  Hill reporters ");
    addListMember(me, id, `@${writer.handle}`);
    expect(listsOf(me.id)).toEqual([{ id, name: "Hill reporters", members: 1 }]);
    expect(listFeed(me.id, id).items.map((i) => i.post.id)).toEqual([pid]);
    expect(getList(other.id, id)).toBeNull();
    expect(listFeed(other.id, id).items).toHaveLength(0);
    expect(() => addListMember(other, id, writer.handle)).toThrow(/not found/);
    expect(() => addListMember(me, id, "nobody_here")).toThrow(/No account/);
    expect(() => createList(me, "   ")).toThrow(/name/);
    deleteList(me, id);
    expect(listsOf(me.id)).toHaveLength(0);
  });

  it("history lists what you opened, newest first, and can be cleared", async () => {
    const me = await makeUser();
    const a = await makeUser();
    story("s1", "World");
    const pid = post(a, "Opened dispatch");
    trackEvents(me.id, [{ type: "story", id: "s1", kind: "click" }]);
    run("UPDATE engagement_events SET created_at = created_at - 5000");
    trackEvents(me.id, [{ type: "post", id: pid, kind: "click" }, { type: "post", id: pid, kind: "view" }]);
    const h = recentHistory(me.id);
    expect(h.map((x) => x.kind)).toEqual(["post", "story"]);
    expect(recentHistory(a.id)).toHaveLength(0);
    clearHistory(me.id);
    expect(recentHistory(me.id)).toHaveLength(0);
  });
});

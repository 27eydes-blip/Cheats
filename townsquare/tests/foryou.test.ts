import { beforeEach, describe, expect, it } from "vitest";
import { now, run } from "@/lib/db";
import { forYou } from "@/lib/foryou";
import { loadProfile, muteTopic, notInterested, recordSignal, seedFromBeats, showMore, trackEvents } from "@/lib/interests";
import { createPost } from "@/lib/posts";
import { castStance } from "@/lib/stance";
import { saveOnboarding } from "@/lib/users";
import { freshDb, makeUser } from "./helpers";

beforeEach(freshDb);

function story(key: string, section: string, status = "developing", ago = 1) {
  const t = now() - ago * 3_600_000;
  run("INSERT INTO stories (key, title, section, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", [key, `Story ${key}`, section, status, t, t]);
}
const post = (u: Awaited<ReturnType<typeof makeUser>>, body: string, storyKey?: string) => createPost(u, { body, storyKey, stance: storyKey ? "agree" : undefined } as Parameters<typeof createPost>[1]);
const ids = (p: ReturnType<typeof forYou>) => p.items.map((i) => (i.kind === "post" ? `post:${i.post.id}` : `story:${i.story.key}`));

describe("For You feed", () => {
  it("logged-out viewers get a trending + breaking mix with stories and dispatches", async () => {
    story("calm", "Tech", "developing", 30);
    story("breaking", "Politics", "live", 1);
    const a = await makeUser();
    post(a, "A dispatch about the bill", "breaking");
    const page = forYou(null);
    expect(page.items.some((i) => i.kind === "story")).toBe(true);
    expect(page.items.some((i) => i.kind === "post")).toBe(true);
    expect(ids(page).indexOf("story:breaking")).toBeLessThan(ids(page).indexOf("story:calm"));
  });

  it("onboarding beats seed topic interests and lift those topics", async () => {
    const me = await makeUser();
    saveOnboarding(me.id, { interests: ["Sports", "Markets"], town: "" });
    const p = loadProfile(me.id);
    expect(p.topics.sports).toBeGreaterThan(0);
    expect(p.topics.markets).toBeGreaterThan(0);
    story("game", "Sports");
    story("vote", "Politics");
    const order = ids(forYou(me.id));
    expect(order.indexOf("story:game")).toBeLessThan(order.indexOf("story:vote"));
  });

  it("Not interested hides the item and turns its topic down; Show more turns it up", async () => {
    const me = await makeUser();
    story("s1", "Politics");
    story("s2", "Tech");
    notInterested(me.id, { type: "story", id: "s1" });
    expect(ids(forYou(me.id))).not.toContain("story:s1");
    expect(loadProfile(me.id).topics.politics).toBeLessThan(0);
    showMore(me.id, { type: "story", id: "s2" });
    expect(loadProfile(me.id).topics.tech).toBeGreaterThan(0);
  });

  it("muted topics and muted accounts disappear", async () => {
    const me = await makeUser();
    const other = await makeUser();
    story("s1", "Sports");
    story("s2", "World");
    const pid = post(other, "World cup take", "s2");
    muteTopic(me.id, "sports", true);
    expect(ids(forYou(me.id))).not.toContain("story:s1");
    run("INSERT INTO mutes (muter_id, muted_id, created_at) VALUES (?, ?, ?)", [me.id, other.id, now()]);
    expect(ids(forYou(me.id))).not.toContain(`post:${pid}`);
    muteTopic(me.id, "sports", false);
    expect(ids(forYou(me.id))).toContain("story:s1");
  });

  it("people you follow engaging gives a social boost; private accounts stay private", async () => {
    const me = await makeUser();
    const friend = await makeUser();
    const a = await makeUser();
    const b = await makeUser();
    run("INSERT INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)", [me.id, friend.id, now()]);
    const pa = post(a, "Post A");
    const pb = post(b, "Post B");
    castStance(friend, "post", pb, "agree");
    const order = ids(forYou(me.id));
    expect(order.indexOf(`post:${pb}`)).toBeLessThan(order.indexOf(`post:${pa}`));
    run("UPDATE users SET is_private = 1 WHERE id = ?", [b.id]);
    expect(ids(forYou(me.id))).not.toContain(`post:${pb}`);
  });

  it("engagement events are stored, and clicks feed interests", async () => {
    const me = await makeUser();
    story("s1", "Markets");
    run("UPDATE stories SET section = 'Business' WHERE key = 's1'");
    trackEvents(me.id, [{ type: "story", id: "s1", kind: "view" }, { type: "story", id: "s1", kind: "click" }, { type: "story", id: "x".repeat(200), kind: "click" }]);
    expect(loadProfile(me.id).topics.markets).toBeGreaterThan(0);
    recordSignal(me.id, { type: "story", id: "s1" }, "notInterested");
    expect(loadProfile(me.id).topics.markets).toBeLessThan(0);
    seedFromBeats(me.id, ["Nonsense"]);
  });

  it("paginates with a cursor and never repeats an item", async () => {
    const a = await makeUser();
    for (let i = 0; i < 25; i++) post(i < 5 ? a : await makeUser(), `Dispatch ${i}`);
    const p1 = forYou(null, null, 10);
    const p2 = forYou(null, p1.nextCursor, 10);
    expect(p1.items).toHaveLength(10);
    expect(p1.nextCursor).toBe("10");
    expect(new Set([...ids(p1), ...ids(p2)]).size).toBe(ids(p1).length + ids(p2).length);
  });
});

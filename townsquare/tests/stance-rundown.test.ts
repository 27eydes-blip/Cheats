import { beforeEach, describe, expect, it } from "vitest";
import { now, run } from "@/lib/db";
import { listStories } from "@/lib/news";
import { createPost, getPostView } from "@/lib/posts";
import { rundown } from "@/lib/rundown";
import { setBookmark, setFollow, setRepost } from "@/lib/social";
import { castStance, splitFor } from "@/lib/stance";
import { debates, storyTakes, voices } from "@/lib/takes";
import { freshDb, makeUser } from "./helpers";

beforeEach(freshDb);

function story(key = "bill", status = "live") {
  const t = now();
  run("INSERT INTO stories (key, title, section, status, created_at, updated_at) VALUES (?, ?, 'Politics', ?, ?, ?)", [key, `Story ${key}`, status, t, t]);
}

describe("stance voting", () => {
  it("one stance per person per target; change and clear update the split", async () => {
    story();
    const a = await makeUser();
    const b = await makeUser();
    castStance(a, "story", "bill", "agree");
    castStance(b, "story", "bill", "agree");
    expect(splitFor("story", "bill", a.id)).toMatchObject({ agree: 2, disagree: 0, total: 2, mine: "agree" });
    castStance(a, "story", "bill", "disagree"); // change, not double-count
    expect(splitFor("story", "bill", a.id)).toMatchObject({ agree: 1, disagree: 1, total: 2, mine: "disagree" });
    const cleared = castStance(a, "story", "bill", null);
    expect(cleared).toMatchObject({ agree: 1, disagree: 0, total: 1, mine: null });
  });

  it("validates targets and values, and respects blocks", async () => {
    const a = await makeUser();
    const b = await makeUser();
    expect(() => castStance(a, "story", "nope", "agree")).toThrow("Story not found");
    const id = createPost(b, { body: "a take" });
    expect(() => castStance(a, "post", id, "maybe" as never)).toThrow();
    run("INSERT INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)", [b.id, a.id, now()]);
    expect(() => castStance(a, "post", id, "agree")).toThrow("can't interact");
  });

  it("takes on a story require a stance; answers inherit the story and form debates", async () => {
    story();
    const a = await makeUser();
    const b = await makeUser();
    expect(() => createPost(a, { body: "no stance", storyKey: "bill" })).toThrow("Pick a stance");
    expect(() => createPost(a, { body: "bad", storyKey: "missing", stance: "agree" })).toThrow("doesn't exist");
    const take = createPost(a, { body: "Good bill", storyKey: "bill", stance: "agree" });
    const ans = createPost(b, { body: "Too expensive", replyToId: take, stance: "disagree" });
    expect(getPostView(ans, null)).toMatchObject({ stance: "disagree", story: { key: "bill" } });
    castStance(b, "post", take, "agree");
    expect(getPostView(take, b.id)!.split).toMatchObject({ agree: 1, mine: "agree" });
    expect(storyTakes("bill", null).map((p) => p.id)).toEqual([take]); // answers live in debate cards
    const d = debates(null, 3, "bill");
    expect(d).toHaveLength(1);
    expect(d[0].left.id).toBe(take);
    expect(d[0].right.id).toBe(ans);
    expect(d[0].endsAt - d[0].startedAt).toBe(24 * 3_600_000);
  });

  it("hot stories rank by take velocity and carry stance splits", async () => {
    story("quiet", "developing");
    story("busy", "developing");
    const a = await makeUser();
    for (let i = 0; i < 3; i++) {
      run("DELETE FROM rate_events");
      createPost(a, { body: `take ${i}`, storyKey: "busy", stance: "context" });
    }
    castStance(a, "story", "busy", "unsure");
    const hot = listStories(5, { order: "hot", viewerId: a.id });
    expect(hot[0]).toMatchObject({ key: "busy", takes: 3, velocity: 3 });
    expect(hot[0].series.reduce((x, y) => x + y, 0)).toBe(3);
    expect(hot[0].split.mine).toBe("unsure");
  });
});

describe("rundown and voices", () => {
  it("lines up live stories and shows, recent and earlier takes, amplified and saved items", async () => {
    story("live1", "live");
    story("dev1", "developing");
    const me = await makeUser();
    const friend = await makeUser();
    const other = await makeUser();
    setFollow(me, friend.id, true);
    const fresh = createPost(friend, { body: "fresh take" });
    const old = createPost(friend, { body: "old take" });
    run("UPDATE posts SET created_at = ? WHERE id = ?", [now() - 5 * 3_600_000, old]);
    const theirs = createPost(other, { body: "amplified take" });
    setRepost(friend, theirs, true);
    setBookmark(me, theirs, true);
    const t = now();
    run("INSERT INTO live_events (id, kind, title, starts_at, created_at) VALUES ('soon', 'audio', 'Soon', ?, ?), ('tonight', 'stream', 'Later', ?, ?)", [t + 3_600_000, t, t + 8 * 3_600_000, t]);

    const r = rundown(me.id);
    const ids = (items: typeof r.now) => items.map((i) => (i.kind === "story" ? i.story.key : i.kind === "show" ? i.event.id : i.post.id));
    expect(ids(r.now)).toEqual(expect.arrayContaining(["live1", fresh, theirs]));
    expect(r.now.find((i) => i.kind === "take" && i.post.id === theirs)).toMatchObject({ amplifiedBy: friend.display_name });
    expect(ids(r.next)).toEqual(expect.arrayContaining(["soon", "dev1"]));
    expect(ids(r.later)).toEqual(expect.arrayContaining(["tonight", theirs]));
    expect(ids(r.earlier)).toEqual([old]);
  });

  it("voices rank verified people with context notes first", async () => {
    story();
    const plain = await makeUser();
    const expert = await makeUser();
    run("UPDATE users SET verified = 1 WHERE id = ?", [expert.id]);
    createPost(expert, { body: "Context: here's the number", storyKey: "bill", stance: "context" });
    const v = voices(plain.id, 5);
    expect(v[0]).toMatchObject({ id: expert.id, contextNotes: 1, takes: 1, verified: true });
    expect(v.some((x) => x.id === plain.id)).toBe(false);
  });
});

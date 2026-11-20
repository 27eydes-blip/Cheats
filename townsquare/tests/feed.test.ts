import { beforeEach, describe, expect, it } from "vitest";
import { followingFeed, forYouFeed, searchPosts, trending } from "@/lib/feed";
import { createPost } from "@/lib/posts";
import { setBlock, setFollow, setMute, setRepost } from "@/lib/social";
import { run } from "@/lib/db";
import { freshDb, makeUser } from "./helpers";

beforeEach(freshDb);

describe("follow + feeds", () => {
  it("Following shows followed people and their reposts, newest first, with pagination", async () => {
    const me = await makeUser();
    const friend = await makeUser();
    const stranger = await makeUser();
    const s1 = createPost(stranger, { body: "stranger post" });
    for (let i = 0; i < 25; i++) {
      run("DELETE FROM rate_events"); // posting limits are tested in safety.test.ts
      createPost(friend, { body: `friend post ${i}` });
    }
    setFollow(me, friend.id, true);
    setRepost(friend, s1, true);
    run("UPDATE reposts SET created_at = created_at + 1000"); // make the repost clearly the newest event

    const page1 = followingFeed(me.id, null, 20);
    expect(page1.items).toHaveLength(20);
    expect(page1.items[0].post.id).toBe(s1); // the repost is the newest event
    expect(page1.items[0].repostedBy?.id).toBe(friend.id);
    const page2 = followingFeed(me.id, page1.nextCursor, 20);
    expect(page2.items.length).toBe(6);
    const ids = [...page1.items, ...page2.items].map((i) => i.post.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("unfollow, mute, and block remove posts from feeds", async () => {
    const me = await makeUser();
    const a = await makeUser();
    createPost(a, { body: "hello from a" });
    setFollow(me, a.id, true);
    expect(followingFeed(me.id).items).toHaveLength(1);
    setMute(me, a.id, true);
    expect(followingFeed(me.id).items).toHaveLength(0);
    expect(forYouFeed(me.id).items).toHaveLength(0);
    setMute(me, a.id, false);
    setBlock(a, me.id, true); // blocked BY them
    expect(followingFeed(me.id).items).toHaveLength(0); // block also removed the follow
    expect(() => setFollow(me, a.id, true)).toThrow();
  });

  it("For You ranks engaged, recent posts and boosts people you follow", async () => {
    const me = await makeUser();
    const a = await makeUser();
    const b = await makeUser();
    const quiet = createPost(a, { body: "quiet post" });
    const followed = createPost(b, { body: "post from someone I follow" });
    setFollow(me, b.id, true);
    const ranked = forYouFeed(me.id).items.map((i) => i.post.id);
    expect(ranked.indexOf(followed)).toBeLessThan(ranked.indexOf(quiet));
  });

  it("search and trending find hashtags", async () => {
    const a = await makeUser();
    createPost(a, { body: "Big game tonight #Football" });
    createPost(a, { body: "Another one #football" });
    createPost(a, { body: "100% sure about this" });
    expect(searchPosts("#football", null).items).toHaveLength(2);
    expect(searchPosts("100%", null).items).toHaveLength(1);
    expect(trending()[0]).toMatchObject({ tag: "football", posts: 2 });
    expect(trending()[0].series.reduce((a, b) => a + b, 0)).toBe(2);
  });
});

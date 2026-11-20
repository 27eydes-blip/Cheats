import { beforeEach, describe, expect, it } from "vitest";
import { newId, now, run } from "@/lib/db";
import { commentTree, communityPosts, getCommunity, listCommunities, setMembership, vote } from "@/lib/communities";
import { followingFeed } from "@/lib/feed";
import { getStory, liveEvents, listStories } from "@/lib/news";
import { createPost } from "@/lib/posts";
import { saveOnboarding, userById } from "@/lib/users";
import { freshDb, makeUser } from "./helpers";

beforeEach(freshDb);

function community(slug = "town", visibility = "public") {
  const id = newId();
  run("INSERT INTO communities (id, slug, name, description, visibility, created_at) VALUES (?, ?, ?, '', ?, ?)", [id, slug, slug.toUpperCase(), visibility, now()]);
  return id;
}

describe("communities", () => {
  it("join, post (members only), threaded comments, and votes", async () => {
    const cid = community();
    const a = await makeUser();
    const b = await makeUser();
    expect(() => createPost(a, { body: "hello town", communityId: cid })).toThrow("Join this community");
    setMembership(a, cid, true);
    expect(getCommunity("town", a.id)).toMatchObject({ joined: true, members: 1 });
    const root = createPost(a, { body: "Should we repave Main?", communityId: cid });
    const c1 = createPost(b, { body: "Yes", replyToId: root });
    createPost(a, { body: "Agreed", replyToId: c1 });

    expect(vote(b, root, 1)).toBe(1);
    expect(vote(b, root, -1)).toBe(-1); // switching counts once
    expect(vote(b, root, 0)).toBe(0);
    vote(a, c1, 1);

    const tree = commentTree(root, b.id);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ score: 1, depth: 0 });
    expect(tree[0].children[0].depth).toBe(1);
    expect(communityPosts(cid, "top", null).map((p) => p.id)).toEqual([root]);
    // Community posts stay out of the main feeds
    expect(followingFeed(a.id).items).toHaveLength(0);
  });

  it("can't vote on regular posts or join invite-only communities", async () => {
    const a = await makeUser();
    const id = createPost(a, { body: "a normal post" });
    expect(() => vote(a, id, 1)).toThrow("community posts");
    const priv = community("secret", "invite");
    expect(() => setMembership(a, priv, true)).toThrow("invite-only");
    expect(listCommunities(a.id).some((c) => c.slug === "secret")).toBe(false);
  });
});

describe("onboarding, stories, live", () => {
  it("saves only known interests and a cleaned town", async () => {
    const u = await makeUser();
    expect(u.onboarded).toBe(0);
    saveOnboarding(u.id, { interests: ["Tech", "Not a real interest", "Sports"], town: "  Springfield\u0007 " });
    const after = userById(u.id)!;
    expect(JSON.parse(after.interests)).toEqual(["Tech", "Sports"]);
    expect(after.town).toBe("Springfield");
    expect(after.onboarded).toBe(1);
  });

  it("story pages return the timeline newest first; live events split by start time", async () => {
    const t = now();
    run("INSERT INTO stories (key, title, status, created_at, updated_at) VALUES ('s1', 'Big story', 'live', ?, ?)", [t, t]);
    run("INSERT INTO story_updates (id, story_key, body, kind, created_at) VALUES ('u1', 's1', 'first', 'update', ?), ('u2', 's1', 'second', 'key', ?)", [t - 1000, t]);
    expect(listStories()[0]).toMatchObject({ key: "s1", updates: 2 });
    expect(getStory("s1")!.updates.map((u) => u.body)).toEqual(["second", "first"]);
    const host = await makeUser();
    run("INSERT INTO live_events (id, kind, title, host_id, starts_at, created_at) VALUES ('e1', 'stream', 'On now', ?, ?, ?), ('e2', 'audio', 'Later', ?, ?, ?)", [host.id, t - 1000, t, host.id, t + 3_600_000, t]);
    const ev = liveEvents();
    expect(ev.find((e) => e.id === "e1")!.isLive).toBe(true);
    expect(ev.find((e) => e.id === "e2")!.isLive).toBe(false);
  });
});

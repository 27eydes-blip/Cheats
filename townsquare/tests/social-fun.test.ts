import { beforeEach, describe, expect, it } from "vitest";
import { now, run } from "@/lib/db";
import { checkAchievements, earnedAchievements, postingStreak } from "@/lib/achievements";
import { profileFeed } from "@/lib/feed";
import { listNotifications } from "@/lib/notifications";
import { createPost, FLASH_MS, getPostView, sweepFlash } from "@/lib/posts";
import { followState, isFriend, setBlock, setFollow, setReaction, suggestFriends } from "@/lib/social";
import { getProfile, updateProfile } from "@/lib/users";
import { freshDb, makeUser } from "./helpers";

beforeEach(freshDb);
const post = (u: Awaited<ReturnType<typeof makeUser>>, body: string, extra: Record<string, unknown> = {}) => createPost(u, { body, ...extra } as Parameters<typeof createPost>[1]);

describe("follow logic", () => {
  it("follow, unfollow, counts and the Friends badge", async () => {
    const a = await makeUser();
    const b = await makeUser();
    expect(setFollow(a, b.id, true)).toBe("following");
    expect(setFollow(a, b.id, true)).toBe("following"); // idempotent
    expect(getProfile(b.handle, null)!.followers).toBe(1);
    expect(listNotifications(b.id).filter((n) => n.type === "follow")).toHaveLength(1);
    setFollow(b, a.id, true);
    expect(isFriend(a.id, b.id) && isFriend(b.id, a.id)).toBe(true);
    expect(setFollow(a, b.id, false)).toBe("none");
    expect(isFriend(a.id, b.id)).toBe(false);
    expect(getProfile(b.handle, null)!.followers).toBe(0);
  });

  it("can't follow yourself or someone who blocked you; blocking removes follows", async () => {
    const a = await makeUser();
    const b = await makeUser();
    expect(() => setFollow(a, a.id, true)).toThrow(/yourself/);
    setFollow(a, b.id, true);
    setBlock(b, a.id, true);
    expect(followState(a.id, b.id)).toBe("none");
    expect(() => setFollow(a, b.id, true)).toThrow(/can't follow/);
  });

  it("rate-limits follow spam", async () => {
    const a = await makeUser();
    const others = await Promise.all(Array.from({ length: 16 }, () => makeUser()));
    const results = others.map((o) => { try { setFollow(a, o.id, true); return "ok"; } catch (e) { return String(e); } });
    expect(results.slice(0, 15).every((r) => r === "ok")).toBe(true);
    expect(results[15]).toMatch(/too often/);
  });

  it("suggests people by mutual follows and shared interests, never ones you follow or blocked", async () => {
    const me = await makeUser();
    const friend = await makeUser();
    const fof = await makeUser();
    const sameBeat = await makeUser();
    const blocked = await makeUser();
    setFollow(me, friend.id, true);
    setFollow(friend, fof.id, true);
    updateProfile(me.id, { displayName: "Me", bio: "", links: [], beats: ["sports"] });
    updateProfile(sameBeat.id, { displayName: "Sam", bio: "", links: [], beats: ["sports"] });
    updateProfile(blocked.id, { displayName: "B", bio: "", links: [], beats: ["sports"] });
    setFollow(friend, blocked.id, true);
    setBlock(me, blocked.id, true);
    const s = suggestFriends(me.id, 10);
    const ids = s.map((x) => x.id);
    expect(ids[0]).toBe(fof.id);
    expect(s[0].reason).toMatch(/Followed by/);
    expect(ids).toContain(sameBeat.id);
    expect(s.find((x) => x.id === sameBeat.id)!.reason).toMatch(/Sports/);
    expect(ids).not.toContain(friend.id);
    expect(ids).not.toContain(blocked.id);
    expect(ids).not.toContain(me.id);
  });
});

describe("reactions", () => {
  it("one reaction per person: add, switch, remove, with counts and a notification", async () => {
    const author = await makeUser();
    const fan = await makeUser();
    const pid = post(author, "React to me");
    let r = setReaction(fan, pid, "fire");
    expect(r.kind).toBe("fire");
    expect(r.counts.fire).toBe(1);
    r = setReaction(fan, pid, "facts");
    expect(r.counts).toMatchObject({ fire: 0, facts: 1 });
    expect(listNotifications(author.id).filter((n) => n.type === "reaction")).toHaveLength(1);
    expect(getPostView(pid, fan.id)!.viewer.reaction).toBe("facts");
    r = setReaction(fan, pid, "facts");
    expect(r.kind).toBeNull();
    expect(r.counts.facts).toBe(0);
    expect(() => setReaction(fan, pid, "heart")).toThrow(/Unknown/);
  });

  it("first reaction unlocks an achievement; reacted dispatches show under Boosted", async () => {
    const author = await makeUser();
    const fan = await makeUser();
    const pid = post(author, "Boost me");
    expect(setReaction(fan, pid, "respect").earned.map((e) => e.key)).toContain("first_reaction");
    expect(setReaction(fan, pid, "fire").earned).toHaveLength(0);
    expect(profileFeed(fan.id, "likes", fan.id).items.map((i) => i.post.id)).toEqual([pid]);
  });

  it("blocked users can't react", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const pid = post(a, "no");
    setBlock(a, b.id, true);
    expect(() => setReaction(b, pid, "fire")).toThrow(/can't interact/);
  });
});

describe("flash dispatches, streaks and achievements", () => {
  it("Flash dispatches disappear after 24 hours", async () => {
    const a = await makeUser();
    const pid = post(a, "Gone tomorrow #flash", { flash: true });
    const v = getPostView(pid, null)!;
    expect(v.flashExpiresAt! - Date.now()).toBeGreaterThan(FLASH_MS - 60_000);
    expect(sweepFlash(Date.now(), true)).toBe(0);
    expect(sweepFlash(Date.now() + FLASH_MS + 1000, true)).toBe(1);
    const after = getPostView(pid, null)!;
    expect(after.gone).toBe("expired");
    expect(after.body).toBe("");
  });

  it("responses can't be Flash", async () => {
    const a = await makeUser();
    const pid = post(a, "parent");
    run("DELETE FROM rate_events");
    const rid = post(a, "reply", { replyToId: pid, flash: true });
    expect(getPostView(rid, null)!.flashExpiresAt).toBeNull();
  });

  it("first dispatch and streaks", async () => {
    const a = await makeUser();
    post(a, "first");
    expect(checkAchievements(a.id, "post").map((e) => e.key)).toContain("first_dispatch");
    expect(checkAchievements(a.id, "post")).toHaveLength(0); // awarded once
    expect(earnedAchievements(a.id).map((e) => e.key)).toContain("first_dispatch");
    const day = 86_400_000;
    for (const d of [1, 2]) run("INSERT INTO posts (id, author_id, body, created_at) VALUES (?, ?, 'old', ?)", [`old${d}`, a.id, now() - d * day]);
    expect(postingStreak(a.id)).toBe(3);
    checkAchievements(a.id, "post");
    expect(earnedAchievements(a.id).map((e) => e.key)).toContain("streak_3");
    expect(listNotifications(a.id).some((n) => n.type === "achievement")).toBe(true);
  });

  it("first follower is a milestone", async () => {
    const a = await makeUser();
    const b = await makeUser();
    setFollow(b, a.id, true);
    expect(earnedAchievements(a.id).map((e) => e.key)).toContain("first_follower");
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { now, run } from "@/lib/db";
import { credibilityScore } from "@/lib/credibility";
import { profileFeed, searchPosts } from "@/lib/feed";
import { forYou } from "@/lib/foryou";
import { listNotifications } from "@/lib/notifications";
import { createPost, getPostView } from "@/lib/posts";
import { answerFollowRequest, followState, isFriend, listFriends, listFollowRequests, pinnedIds, setFollow, togglePin } from "@/lib/social";
import { canSeeDispatches, changeEmail, getNotificationPrefs, getProfile, setNotificationPrefs, setPrivate, updateProfile } from "@/lib/users";
import { freshDb, makeUser } from "./helpers";

beforeEach(freshDb);
const post = (u: Awaited<ReturnType<typeof makeUser>>, body: string, extra: Record<string, unknown> = {}) => createPost(u, { body, ...extra } as Parameters<typeof createPost>[1]);

describe("profile fields", () => {
  it("saves location, beats (known, max 6) and accent (palette only)", async () => {
    const u = await makeUser();
    updateProfile(u.id, { displayName: "Ann", bio: "hi", links: [], location: "  Denver, CO ", beats: ["politics", "tech", "bogus", "politics", "world", "markets", "sports", "culture", "national"], accent: "violet" });
    const p = getProfile(u.handle, null)!;
    expect(p.location).toBe("Denver, CO");
    expect(p.beats).toEqual(["politics", "tech", "world", "markets", "sports", "culture"]);
    expect(p.accent).toBe("violet");
    updateProfile(u.id, { displayName: "Ann", bio: "", links: [], accent: "neon-green" });
    expect(getProfile(u.handle, null)!.accent).toBe("blue");
  });

  it("changes email only with the right password and a free address", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await expect(changeEmail(a.id, "new@example.com", "wrong")).rejects.toThrow(/password/);
    await expect(changeEmail(a.id, b.email, "a-long-password")).rejects.toThrow(/in use/);
    await changeEmail(a.id, "New@Example.com", "a-long-password");
    expect(getProfile(a.handle, a.id)).toBeTruthy();
  });
});

describe("private accounts and follow requests", () => {
  it("following a private account sends a request; approval makes dispatches visible", async () => {
    const priv = await makeUser();
    const fan = await makeUser();
    setPrivate(priv.id, true);
    const pid = post(priv, "Members only dispatch");
    expect(setFollow(fan, priv.id, true)).toBe("requested");
    expect(followState(fan.id, priv.id)).toBe("requested");
    expect(listNotifications(priv.id).some((n) => n.type === "follow_request")).toBe(true);
    expect(canSeeDispatches(getProfile(priv.handle, fan.id)!)).toBe(false);
    expect(getPostView(pid, fan.id)!.gone).toBe("unavailable");
    expect(searchPosts("Members", fan.id).items).toHaveLength(0);
    expect(forYou(fan.id).items.some((i) => i.kind === "post" && i.post.id === pid)).toBe(false);
    expect(listFollowRequests(priv.id).map((u) => u.id)).toEqual([fan.id]);
    answerFollowRequest(priv, fan.id, true);
    expect(followState(fan.id, priv.id)).toBe("following");
    expect(listNotifications(fan.id).some((n) => n.type === "follow_accept")).toBe(true);
    expect(getPostView(pid, fan.id)!.gone).toBeNull();
    expect(canSeeDispatches(getProfile(priv.handle, fan.id)!)).toBe(true);
  });

  it("declining removes the request; going public approves everyone waiting", async () => {
    const priv = await makeUser();
    const a = await makeUser();
    const b = await makeUser();
    setPrivate(priv.id, true);
    setFollow(a, priv.id, true);
    setFollow(b, priv.id, true);
    answerFollowRequest(priv, a.id, false);
    expect(followState(a.id, priv.id)).toBe("none");
    setPrivate(priv.id, false);
    expect(followState(b.id, priv.id)).toBe("following");
    expect(listFollowRequests(priv.id)).toHaveLength(0);
  });

  it("logged-out viewers never see private dispatches", async () => {
    const priv = await makeUser();
    setPrivate(priv.id, true);
    const pid = post(priv, "secret");
    expect(getPostView(pid, null)!.gone).toBe("unavailable");
    expect(profileFeed(priv.id, "posts", null).items.every((i) => i.post.gone)).toBe(true);
  });
});

describe("friends, pins, sources, credibility, notification settings", () => {
  it("mutual follows are Friends", async () => {
    const a = await makeUser();
    const b = await makeUser();
    setFollow(a, b.id, true);
    expect(isFriend(a.id, b.id)).toBe(false);
    setFollow(b, a.id, true);
    expect(isFriend(a.id, b.id)).toBe(true);
    expect(getProfile(a.handle, null)!.friends).toBe(1);
    expect(listFriends(a.id, null).map((u) => u.id)).toEqual([b.id]);
  });

  it("pins up to three of your own dispatches", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const ids = [post(a, "one"), post(a, "two"), post(a, "three")];
    run("DELETE FROM rate_events");
    const four = post(a, "four");
    for (const id of ids) expect(togglePin(a, id)).toBe(true);
    expect(() => togglePin(a, four)).toThrow(/up to 3/);
    expect(togglePin(a, ids[0])).toBe(false);
    expect(pinnedIds(a.id)).toEqual([ids[1], ids[2]]);
    expect(() => togglePin(b, ids[1])).toThrow(/own/);
  });

  it("source links are validated and raise credibility", async () => {
    const a = await makeUser();
    expect(() => post(a, "bad", { sourceUrl: "javascript:alert(1)" })).toThrow(/web address/);
    const before = credibilityScore(a.id).score;
    for (let i = 0; i < 4; i++) {
      run("DELETE FROM rate_events");
      post(a, `sourced ${i}`, { sourceUrl: `https://www.example.org/report-${i}` });
    }
    const pid = post(a, "unsourced");
    expect(getPostView(pid, null)!.source).toBeNull();
    const c = credibilityScore(a.id);
    expect(c.sourced).toBe(4);
    expect(c.score).toBeGreaterThan(before);
    run("UPDATE posts SET removed_at = ? WHERE author_id = ? AND source_url IS NULL", [now(), a.id]);
    expect(credibilityScore(a.id).score).toBeLessThan(c.score);
  });

  it("notification settings silence the chosen types", async () => {
    const a = await makeUser();
    const b = await makeUser();
    expect(getNotificationPrefs(a.id).follows).toBe(true);
    setNotificationPrefs(a.id, { follows: false });
    setFollow(b, a.id, true);
    expect(listNotifications(a.id).filter((n) => n.type === "follow")).toHaveLength(0);
  });
});

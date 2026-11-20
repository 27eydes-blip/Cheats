import { beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "@/lib/db";
import { createPost, deletePost, editPost, getPostView, getThread, votePoll } from "@/lib/posts";
import { setLike, setRepost } from "@/lib/social";
import { listNotifications } from "@/lib/notifications";
import { freshDb, makeUser } from "./helpers";

beforeEach(freshDb);

describe("posting", () => {
  it("creates a post with hashtags, mentions, and a link card", async () => {
    const a = await makeUser("author");
    const b = await makeUser("buddy");
    const id = createPost(a, { body: "Hello #Town @buddy see https://example.com/big-news-story" });
    const p = getPostView(id, b.id)!;
    expect(p.body).toContain("#Town");
    expect(p.link).toMatchObject({ domain: "example.com", title: "big news story" });
    expect(listNotifications(b.id).map((n) => n.type)).toContain("mention");
  });

  it("enforces the 500-character limit (emoji count as one)", async () => {
    const a = await makeUser();
    expect(() => createPost(a, { body: "x".repeat(501) })).toThrow("at most 500");
    expect(() => createPost(a, { body: Array.from({ length: 166 }, (_, i) => `${String(i % 100).padStart(2, "0")}😀`).join("") })).not.toThrow();
    expect(() => createPost(a, { body: "   " })).toThrow("Write something");
  });

  it("allows editing only in the first 15 minutes and keeps history", async () => {
    const a = await makeUser();
    const other = await makeUser();
    const id = createPost(a, { body: "first version" });
    expect(() => editPost(other, id, "hacked")).toThrow();
    editPost(a, id, "second version");
    const p = getPostView(id, a.id)!;
    expect(p.body).toBe("second version");
    expect(p.editedAt).not.toBeNull();
    run("UPDATE posts SET created_at = created_at - 16 * 60000 WHERE id = ?", [id]);
    expect(() => editPost(a, id, "too late")).toThrow("15 minutes");
  });

  it("replies, quotes, likes, and reposts update counts and notify the author", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const id = createPost(a, { body: "original" });
    createPost(b, { body: "a reply", replyToId: id });
    createPost(b, { body: "a quote", quoteOfId: id });
    setLike(b, id, true);
    setLike(b, id, true); // idempotent
    setRepost(b, id, true);
    const p = getPostView(id, b.id)!;
    expect(p.counts).toEqual({ likes: 1, replies: 1, reposts: 1, quotes: 1 });
    expect(p.viewer).toMatchObject({ liked: true, reposted: true });
    expect(listNotifications(a.id).map((n) => n.type).sort()).toEqual(["like", "quote", "reply", "repost"]);
    setLike(b, id, false);
    expect(getPostView(id, b.id)!.counts.likes).toBe(0);
    expect(getThread(id, null)!.replies).toHaveLength(1);
  });

  it("delete is author-only and leaves a tombstone in threads", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const id = createPost(a, { body: "to delete" });
    createPost(b, { body: "reply", replyToId: id });
    expect(() => deletePost(b, id)).toThrow();
    deletePost(a, id);
    expect(getPostView(id, null)!.gone).toBe("deleted");
    expect(getPostView(id, null)!.body).toBe("");
    expect(() => createPost(b, { body: "late reply", replyToId: id })).toThrow("no longer available");
  });

  it("polls accept one vote per person and close on time", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const id = createPost(a, { body: "Cats or dogs?", poll: { options: ["Cats", "Dogs"], durationHours: 1 } });
    const poll = getPostView(id, b.id)!.poll!;
    votePoll(b, poll.id, poll.options[1].id);
    expect(() => votePoll(b, poll.id, poll.options[0].id)).toThrow("already voted");
    expect(getPostView(id, b.id)!.poll).toMatchObject({ total: 1, myVote: poll.options[1].id });
    vi.setSystemTime(Date.now() + 2 * 3_600_000);
    expect(() => votePoll(a, poll.id, poll.options[0].id)).toThrow("closed");
    vi.useRealTimers();
  });
});

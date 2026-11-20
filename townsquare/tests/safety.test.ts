import { beforeEach, describe, expect, it } from "vitest";
import { run } from "@/lib/db";
import { fileReport, moderate, reportQueue } from "@/lib/moderation";
import { createPost, getPostView } from "@/lib/posts";
import { listNotifications } from "@/lib/notifications";
import { spamCheck } from "@/lib/spam";
import { tokenize, safeHttpUrl, cleanText } from "@/lib/text";
import { sniffImage } from "@/lib/media";
import { userById } from "@/lib/users";
import { freshDb, makeUser } from "./helpers";

beforeEach(freshDb);

describe("reporting and moderation", () => {
  it("a report reaches the admin queue and admin actions are applied", async () => {
    const author = await makeUser();
    const reporter = await makeUser();
    const admin = await makeUser();
    run("UPDATE users SET role = 'admin' WHERE id = ?", [admin.id]);
    const id = createPost(author, { body: "something rude" });
    fileReport(reporter, { targetType: "post", targetId: id, reason: "harassment", details: "targets me" });
    fileReport(reporter, { targetType: "post", targetId: id, reason: "harassment", details: "dup" }); // ignored duplicate

    const q = reportQueue(userById(admin.id)!.id);
    expect(q).toHaveLength(1);
    expect(q[0].count).toBe(1);

    expect(() => moderate(reporter, { targetType: "post", targetId: id, action: "remove" })).toThrow("Admins only");
    moderate(userById(admin.id)!, { targetType: "post", targetId: id, action: "remove", note: "harassment" });
    expect(getPostView(id, null)!.gone).toBe("removed");
    expect(listNotifications(author.id).some((n) => n.type === "warning")).toBe(true);
    expect(reportQueue(admin.id)).toHaveLength(0);

    moderate(userById(admin.id)!, { targetType: "user", targetId: author.id, action: "suspend", suspendDays: 7 });
    const suspended = userById(author.id)!;
    expect(suspended.status).toBe("suspended");
    expect(() => createPost(suspended, { body: "can I post?" })).toThrow("suspended");
  });

  it("users can't report themselves", async () => {
    const u = await makeUser();
    expect(() => fileReport(u, { targetType: "user", targetId: u.id, reason: "spam", details: "" })).toThrow();
  });
});

describe("rate limits and spam", () => {
  it("blocks the 6th post within a minute", async () => {
    const u = await makeUser();
    for (let i = 0; i < 5; i++) createPost(u, { body: `post number ${i}` });
    expect(() => createPost(u, { body: "one too many" })).toThrow("too often");
  });

  it("catches obvious scams, link floods, and repeats", async () => {
    const u = await makeUser();
    expect(spamCheck(u.id, "Send 1 BTC and receive 2 back! free crypto", u.created_at)).toMatch(/scam/);
    expect(spamCheck(u.id, "a https://a.com b https://b.com c https://c.com", u.created_at)).toMatch(/New accounts/);
    expect(spamCheck(u.id, "!".repeat(40), u.created_at)).toMatch(/repeated/);
    createPost(u, { body: "this exact sentence is long enough" });
    expect(() => createPost(u, { body: "this exact sentence is long enough" })).toThrow("already posted");
    expect(spamCheck(u.id, "A perfectly normal post about the city council meeting tonight.", u.created_at)).toBeNull();
  });
});

describe("input safety", () => {
  it("never turns javascript: or data: into links", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,hi")).toBeNull();
    expect(tokenize("click javascript:alert(1)").every((t) => t.t === "text")).toBe(true);
    const toks = tokenize("see https://example.com/a. and #tag @bob email a@b.com");
    expect(toks.filter((t) => t.t === "link")[0]).toMatchObject({ href: "https://example.com/a" });
    expect(toks.filter((t) => t.t === "tag")).toHaveLength(1);
    expect(toks.filter((t) => t.t === "mention")).toHaveLength(1);
  });

  it("strips control and bidi-override characters", () => {
    expect(cleanText("a‮b\u0000c\n\n\n\nd ")).toBe("abc\n\nd");
  });

  it("identifies images by content, not by name", () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("jpeg");
    expect(sniffImage(Buffer.from("<svg onload=alert(1)>    "))).toBeNull();
  });
});

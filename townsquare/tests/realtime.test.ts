import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { now, run } from "@/lib/db";
import { createPost } from "@/lib/posts";
import { bus, type LiveEvent } from "@/lib/realtime";
import { castStance } from "@/lib/stance";
import { freshDb, makeUser } from "./helpers";

let seen: LiveEvent[] = [];
const on = (e: LiveEvent) => seen.push(e);
beforeEach(() => { freshDb(); seen = []; bus.on("event", on); });
afterEach(() => { bus.off("event", on); });

describe("live events", () => {
  it("broadcast stance counts (never who voted) and new public story takes", async () => {
    const t = now();
    run("INSERT INTO stories (key, title, section, status, created_at, updated_at) VALUES ('bill', 'Bill', 'Politics', 'live', ?, ?)", [t, t]);
    const a = await makeUser();
    castStance(a, "story", "bill", "agree");
    expect(seen).toEqual([{ type: "stance", target: "story", id: "bill", agree: 1, disagree: 0, unsure: 0, total: 1 }]);
    expect(JSON.stringify(seen)).not.toContain(a.id);

    const id = createPost(a, { body: "Good bill.", storyKey: "bill", stance: "agree" } as Parameters<typeof createPost>[1]);
    expect(seen.at(-1)).toEqual({ type: "take", storyKey: "bill", postId: id });

    // Replies and posts without a story don't announce themselves.
    const n = seen.length;
    createPost(a, { body: "Unrelated." } as Parameters<typeof createPost>[1]);
    createPost(a, { body: "Answer", replyToId: id } as Parameters<typeof createPost>[1]);
    expect(seen.filter((e) => e.type === "take").length).toBe(1);
    expect(seen.length).toBe(n);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { computeCoverage, coverageFlag, sideOf } from "@/lib/newsroom/coverage";
import type { Lean } from "@/lib/newsroom/outlets";
import { coverageFor, getStory, listStories } from "@/lib/news";
import { now, run } from "@/lib/db";
import { freshDb } from "./helpers";

const outlets = (...leans: (Lean | null)[]) => leans.map((lean) => ({ lean }));

describe("coverage spread", () => {
  it("groups the five leans into left, center and right", () => {
    expect([sideOf("Left"), sideOf("Lean Left"), sideOf("Center"), sideOf("Lean Right"), sideOf("Right"), sideOf(null)]).toEqual(["left", "left", "center", "right", "right", null]);
  });

  it("computes shares over rated outlets and counts unrated ones in the total", () => {
    const c = computeCoverage(outlets("Left", "Lean Left", "Center", "Right", null, null));
    expect(c).toMatchObject({ total: 6, rated: 4, left: 2, center: 1, right: 1, unrated: 2 });
    expect(c.shares).toEqual({ left: 0.5, center: 0.25, right: 0.25 });
    expect(c.flag).toBeNull();
  });

  it("flags lopsided coverage in neutral words", () => {
    expect(computeCoverage(outlets("Right", "Lean Right", "Right", "Center")).flag).toEqual({ kind: "lopsided", side: "right", text: "Mostly covered by Right-leaning outlets" });
    expect(computeCoverage(outlets("Left", "Left", "Lean Left", "Lean Left", "Center")).flag?.text).toBe("Mostly covered by Left-leaning outlets");
  });

  it("flags a missing side once there are enough outlets", () => {
    expect(computeCoverage(outlets("Left", "Lean Left", "Center", "Center", "Center")).flag).toEqual({ kind: "missing", side: "right", text: "Few Right-leaning outlets covering this" });
    expect(computeCoverage(outlets("Right", "Lean Right", "Center", "Center", "Center", "Center")).flag?.text).toBe("Few Left-leaning outlets covering this");
  });

  it("never flags small or center-heavy stories", () => {
    expect(computeCoverage(outlets("Right", "Right", "Right")).flag).toBeNull(); // only 3 rated
    expect(computeCoverage(outlets("Center", "Center", "Center", "Center")).flag).toBeNull();
    expect(computeCoverage(outlets(null, null, null, null, null)).flag).toBeNull();
    expect(coverageFlag({ left: 0.3, center: 0.4, right: 0.3 }, 10)).toBeNull();
  });
});

describe("coverage from the database", () => {
  beforeEach(freshDb);
  it("counts each outlet once per story and lists articles by outlet", () => {
    const t = now();
    run("INSERT INTO stories (key, title, section, status, created_at, updated_at, origin, importance, freshness) VALUES ('s1', 'A story', 'Politics', 'developing', ?, ?, 'real', 50, 1)", [t, t]);
    const item = (id: string, src: string) => run("INSERT INTO news_items (id, source_id, section, title, summary, url, story_key, published_at) VALUES (?, ?, 'Politics', 'Headline', 'Snip', ?, 's1', ?)", [id, src, `https://x.example.com/${id}`, t]);
    item("a", "fox");
    item("b", "fox"); // same outlet twice
    item("c", "npr");
    item("d", "upi");
    item("e", "espn");
    const c = coverageFor(["s1"]).get("s1")!;
    expect(c).toMatchObject({ total: 4, rated: 3, left: 1, center: 1, right: 1, unrated: 1 });
    expect(listStories(5)[0].coverage.total).toBe(4);
    const s = getStory("s1")!;
    expect(s.articles).toHaveLength(5);
    expect(s.articles.find((a) => a.sourceId === "fox")).toMatchObject({ lean: "Right", source: "Fox News" });
  });

  it("hides demo stories unless the demo switch is on", () => {
    const t = now();
    run("INSERT INTO stories (key, title, section, status, created_at, updated_at, origin) VALUES ('d1', 'Demo', 'Politics', 'developing', ?, ?, 'demo')", [t, t]);
    expect(listStories(5, { includeDemo: false }).map((s) => s.key)).not.toContain("d1");
    expect(listStories(5, { includeDemo: true }).map((s) => s.key)).toContain("d1");
    expect(getStory("d1")).not.toBeNull(); // direct links keep working
  });
});

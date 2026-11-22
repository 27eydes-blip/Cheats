import { beforeEach, describe, expect, it } from "vitest";
import { run } from "@/lib/db";
import { beatsOf, blindspots, coverageToday, opinionAcrossSpectrum, politicsStories, sideHeadlines } from "@/lib/politics";
import { freshDb } from "./helpers";

const T = Date.now();
const lean = { L: "Left", LL: "Lean Left", C: "Center", LR: "Lean Right", R: "Right" } as const;

function outlet(id: string, l: keyof typeof lean) {
  run("INSERT OR IGNORE INTO news_sources (id, name, homepage, feed_url, lean, demo, active) VALUES (?, ?, 'https://x.test', 'https://x.test/rss', ?, 0, 1)", [id, `Outlet ${id}`, lean[l]]);
  return id;
}
let n = 0;
function story(title: string, articles: [string, keyof typeof lean, string?, boolean?][], section = "Politics") {
  const key = `ps${++n}`;
  run("INSERT INTO stories (key, title, summary, section, status, created_at, updated_at, origin, category, importance, freshness, last_article_at) VALUES (?, ?, '', ?, 'developing', ?, ?, 'real', 'Politics', 60, 1, ?)", [key, title, section, T, T, T]);
  articles.forEach(([src, l, headline, opinion], i) =>
    run("INSERT INTO news_items (id, source_id, section, title, summary, url, story_key, published_at, opinion) VALUES (?, ?, 'Politics', ?, '', ?, ?, ?, ?)", [
      `${key}-${i}`, outlet(src, l), headline ?? `${title} (${src})`, `https://x.test/${key}/${i}`, key, T - i * 60_000, opinion ? 1 : 0,
    ]),
  );
  return key;
}

beforeEach(() => {
  freshDb();
  run("UPDATE stories SET section = 'Archive' WHERE origin = 'demo'"); // keep seeded demo stories out of the way
});

describe("beats", () => {
  it("files stories under Congress, White House, Courts, Elections and States by whole words", () => {
    expect(beatsOf("Senate passes the spending bill")).toEqual(["congress"]);
    expect(beatsOf("Supreme Court hears the president's appeal")).toEqual(expect.arrayContaining(["courts", "white-house"]));
    expect(beatsOf("Governor signs new voting rules ahead of the primary")).toEqual(expect.arrayContaining(["elections", "states"]));
    expect(beatsOf("Billboard prices rise")).toEqual([]); // "bill" only as a whole word
  });

  it("filters the politics list by beat", () => {
    story("Senate passes the spending bill", [["a", "L"]]);
    story("Governor signs a budget", [["b", "R"]]);
    expect(politicsStories({ beat: "congress" }).map((s) => s.title)).toEqual(["Senate passes the spending bill"]);
    expect(politicsStories({ beat: "states" }).map((s) => s.title)).toEqual(["Governor signs a budget"]);
    expect(politicsStories({}).every((s) => s.section === "Politics")).toBe(true);
  });
});

describe("how each side covers it", () => {
  it("picks one headline per side, preferring news over opinion and the newest", () => {
    const sides = sideHeadlines([
      { title: "Left op-ed", url: "u1", published_at: 5, opinion: 1, source: "A", lean: "Left" },
      { title: "Left news", url: "u2", published_at: 4, opinion: 0, source: "B", lean: "Lean Left" },
      { title: "Right news old", url: "u3", published_at: 1, opinion: 0, source: "C", lean: "Right" },
      { title: "Right news new", url: "u4", published_at: 3, opinion: 0, source: "D", lean: "Lean Right" },
      { title: "Unrated", url: "u5", published_at: 9, opinion: 0, source: "E", lean: null },
    ]);
    expect(sides.left?.title).toBe("Left news");
    expect(sides.right?.title).toBe("Right news new");
    expect(sides.center).toBeUndefined();
  });

  it("attaches the sides to each politics story", () => {
    story("Senate vote", [["l1", "L", "Left headline"], ["c1", "C", "Center headline"], ["r1", "R", "Right headline"]]);
    const [s] = politicsStories({});
    expect(s.sides.left?.title).toBe("Left headline");
    expect(s.sides.center?.source).toBe("Outlet c1");
    expect(s.sides.right?.url).toContain("https://x.test/");
  });
});

describe("blindspots and balance", () => {
  it("lists stories covered mostly by one side under that side", () => {
    story("Mostly left", [["l1", "L"], ["l2", "LL"], ["l3", "L"], ["l4", "LL"], ["c1", "C"]]);
    story("Mostly right", [["r1", "R"], ["r2", "LR"], ["r3", "R"], ["r4", "LR"]]);
    story("Balanced", [["l1", "L"], ["c1", "C"], ["r1", "R"], ["c2", "C"]]);
    const b = blindspots(politicsStories({}));
    expect(b.left.map((s) => s.title)).toEqual(["Mostly left"]);
    expect(b.right.map((s) => s.title)).toEqual(["Mostly right"]);
  });

  it("counts today's political coverage by side", () => {
    story("One", [["l1", "L"], ["r1", "R"]]);
    story("Two", [["c1", "C"], ["r1", "R"]]);
    story("Sports thing", [["s1", "C"]], "Sports");
    const t = coverageToday();
    expect(t).toMatchObject({ stories: 2, outlets: 3, articles: 4 });
    expect(t.coverage.shares.right).toBeCloseTo(1 / 3);
  });

  it("groups opinion pieces by side, one per outlet", () => {
    story("Debate", [["l1", "L", "Left take 1", true], ["l1", "L", "Left take 2", true], ["l2", "LL", "Left take 3", true], ["r1", "R", "Right take", true], ["c1", "C", "Center news", false]]);
    const o = opinionAcrossSpectrum(3);
    expect(o.left.map((x) => x.title)).toEqual(["Left take 1", "Left take 3"]);
    expect(o.right.map((x) => x.source)).toEqual(["Outlet r1"]);
    expect(o.center).toEqual([]);
  });
});

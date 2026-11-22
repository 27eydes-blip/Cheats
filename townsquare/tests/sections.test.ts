import { beforeEach, describe, expect, it } from "vitest";
import { run } from "@/lib/db";
import { beatsFor, blindspots, coverageToday, opinionAcrossSpectrum, sectionStories, SECTIONS, SECTION_KEYS, sectionByPath, trending } from "@/lib/sections";
import { topicHref, TOPIC_SLUG } from "@/lib/feedtabs-meta";
import { CHANNELS, activeChannel } from "@/components/shell/channels";
import { freshDb } from "./helpers";

const T = Date.now();
const lean = { L: "Left", C: "Center", R: "Right" } as const;
let n = 0;
function outlet(id: string, l: keyof typeof lean) {
  run("INSERT OR IGNORE INTO news_sources (id, name, homepage, feed_url, lean, demo, active) VALUES (?, ?, 'https://x.test', 'https://x.test/rss', ?, 0, 1)", [id, `Outlet ${id}`, lean[l]]);
  return id;
}
function story(title: string, section: string, articles: [string, keyof typeof lean, boolean?][] = [["c1", "C"]], importance = 60) {
  const key = `sx${++n}`;
  run("INSERT INTO stories (key, title, summary, section, status, created_at, updated_at, origin, category, importance, freshness, last_article_at) VALUES (?, ?, '', ?, 'developing', ?, ?, 'real', ?, ?, 1, ?)", [key, title, section, T, T, section, importance, T]);
  articles.forEach(([src, l, op], i) =>
    run("INSERT INTO news_items (id, source_id, section, title, summary, url, story_key, published_at, opinion) VALUES (?, ?, ?, ?, '', ?, ?, ?, ?)", [`${key}-${i}`, outlet(src, l), section, `${title} (${src})`, `https://x.test/${key}/${i}`, key, T - i * 60_000, op ? 1 : 0]),
  );
  return key;
}

beforeEach(() => {
  freshDb();
  run("UPDATE stories SET section = 'Archive' WHERE origin = 'demo'");
});

describe("section settings", () => {
  it("has the five sections with their own pages and sub-sections", () => {
    expect(SECTION_KEYS).toEqual(["politics", "world", "business", "tech", "culture"]);
    expect(Object.keys(SECTIONS.world.beats)).toEqual(["americas", "europe", "middle-east", "asia", "africa"]);
    expect(Object.values(SECTIONS.business.beats).map((b) => b.label)).toEqual(["Markets", "Companies", "Economy"]);
    expect(Object.values(SECTIONS.tech.beats).map((b) => b.label)).toEqual(["AI", "Gadgets", "Cybersecurity"]);
    expect(Object.values(SECTIONS.culture.beats).map((b) => b.label)).toEqual(["Film", "Music", "TV", "Books"]);
    // The left/center/right views only where the outlets' lean says something useful.
    expect(SECTION_KEYS.filter((k) => SECTIONS[k].spectrum)).toEqual(["politics", "world", "business"]);
  });

  it("files stories under regions and desks by whole words", () => {
    expect(beatsFor(SECTIONS.world, "Ukraine and Russia agree to talks in Turkey")).toEqual(["europe", "middle-east"]);
    expect(beatsFor(SECTIONS.world, "Floods hit Nigeria and Kenya")).toEqual(["africa"]);
    expect(beatsFor(SECTIONS.world, "Mexico and Brazil sign trade pact")).toEqual(["americas"]);
    expect(beatsFor(SECTIONS.world, "India and Japan hold summit")).toEqual(["asia"]);
    expect(beatsFor(SECTIONS.business, "Stocks fall as inflation data worries investors")).toEqual(["markets", "economy"]);
    expect(beatsFor(SECTIONS.business, "Automaker CEO announces layoffs")).toEqual(["companies"]);
    expect(beatsFor(SECTIONS.tech, "Hackers breach hospital network with ransomware")).toEqual(["cybersecurity"]);
    expect(beatsFor(SECTIONS.tech, "New AI model from OpenAI")).toEqual(["ai"]);
    expect(beatsFor(SECTIONS.tech, "Samsung unveils new smartphone")).toEqual(["gadgets"]);
    expect(beatsFor(SECTIONS.culture, "Album tops the Billboard chart")).toEqual(["music"]);
    expect(beatsFor(SECTIONS.culture, "Novel wins the Booker prize")).toEqual(["books"]);
    expect(beatsFor(SECTIONS.culture, "Indie film wins top prize at festival")).toEqual(["film"]);
    expect(beatsFor(SECTIONS.world, "Russian-backed group")).toEqual(["europe"]);
    expect(beatsFor(SECTIONS.world, "Chinatown festival")).toEqual([]); // whole words only
  });
});

describe("section stories", () => {
  it("lists only the section's stories and filters by region", () => {
    story("Ukraine ceasefire talks resume", "World");
    story("Japan elects new prime minister", "World");
    story("Senate passes bill", "Politics");
    expect(sectionStories("world").map((s) => s.title).sort()).toEqual(["Japan elects new prime minister", "Ukraine ceasefire talks resume"]);
    expect(sectionStories("world", { beat: "asia" }).map((s) => s.title)).toEqual(["Japan elects new prime minister"]);
    expect(sectionStories("world", { beat: "africa" })).toEqual([]);
  });

  it("pulls clearly cultural stories into Culture from other sections, but not sports or politics", () => {
    story("Hollywood studio film tops box office", "Top Stories");
    story("Streaming series renewed by Netflix for new season", "Business");
    story("A movie about the Senate", "Politics");
    story("Band plays stadium before game", "Sports");
    story("Oil prices rise", "Business");
    expect(sectionStories("culture").map((s) => s.title).sort()).toEqual(["Hollywood studio film tops box office", "Streaming series renewed by Netflix for new season"]);
    expect(sectionStories("culture", { beat: "tv" }).map((s) => s.title)).toEqual(["Streaming series renewed by Netflix for new season"]);
  });

  it("adds every side, blindspots, opinion and the day's balance for spectrum sections", () => {
    story("Tariffs hit importers", "Business", [["l1", "L"], ["c1", "C"], ["r1", "R"], ["l1", "L", true], ["r2", "R", true]]);
    story("Fed holds rates", "Business", [["l1", "L"], ["l2", "L"], ["l3", "L"], ["l4", "L"], ["c1", "C"]]);
    const s = sectionStories("business");
    expect(s.find((x) => x.title === "Tariffs hit importers")!.sides.right?.source).toBe("Outlet r1");
    expect(blindspots(s).left.map((x) => x.title)).toEqual(["Fed holds rates"]);
    const o = opinionAcrossSpectrum("business");
    expect(o.left.map((x) => x.source)).toEqual(["Outlet l1"]);
    expect(o.right.map((x) => x.source)).toEqual(["Outlet r2"]);
    expect(coverageToday("business")).toMatchObject({ stories: 2 });
  });

  it("ranks trending by outlets and readers", () => {
    story("Quiet story", "Tech", [["c1", "C"]], 90);
    story("Big story", "Tech", [["c1", "C"], ["c2", "C"], ["l1", "L"], ["r1", "R"]], 50);
    expect(trending(sectionStories("tech"), 2).map((s) => s.title)).toEqual(["Big story", "Quiet story"]);
  });
});

describe("routing", () => {
  it("opens the new section pages from the top nav and Your Topics", () => {
    expect(CHANNELS.filter((c) => ["politics", "world", "markets", "tech", "culture"].includes(c.key)).map((c) => c.href)).toEqual(["/politics", "/world", "/business", "/tech", "/culture"]);
    expect(topicHref("markets")).toBe("/business");
    expect(topicHref("world")).toBe("/world");
    expect(topicHref("sports")).toBe("/topics/sports"); // Sports keeps its own setup
    expect(topicHref("national")).toBe("/topics/us");
    expect(CHANNELS.find((c) => c.key === "sports")!.href).toBe("/sports");
  });

  it("highlights the right nav item on new and old addresses", () => {
    expect(activeChannel("/world")).toBe("world");
    expect(activeChannel("/business")).toBe("markets");
    expect(activeChannel("/tech")).toBe("tech");
    expect(activeChannel("/culture")).toBe("culture");
    expect(activeChannel("/topics/culture")).toBe("culture");
    expect(activeChannel("/topics/business")).toBe("markets");
    expect(activeChannel("/markets")).toBe("stockboard");
    expect(sectionByPath("/world")).toBe("world");
    expect(sectionByPath("/worldwide")).toBeNull();
    expect(TOPIC_SLUG.markets).toBe("business");
  });
});

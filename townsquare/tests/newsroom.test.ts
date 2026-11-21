import { describe, expect, it } from "vitest";
import { parseFeed, parseApiArticles } from "@/lib/newsroom/feeds";
import { articleTerms, cleanTitle, neutralize, snippet, isOpinion } from "@/lib/newsroom/text";
import { assign, classify, pickHeadline, scoreStory, storyCategory, storySlug, type Doc } from "@/lib/newsroom/cluster";

// All headlines below are made up for the tests.
const H = 3_600_000;
const T0 = Date.UTC(2026, 10, 20, 12);
let n = 0;
const doc = (title: string, snip: string, o: Partial<Doc> & { at?: number } = {}): Doc => ({
  id: `d${n++}`, sourceId: o.sourceId ?? `s${n}`, outletName: o.outletName ?? `Outlet ${n}`, title, snippet: snip, url: o.url ?? `https://example.com/${n}`,
  terms: articleTerms(title, snip), publishedAt: o.at ?? T0, lean: o.lean ?? null, outletType: o.outletType ?? "paper", categoryHint: o.categoryHint ?? null,
});

const senate = [
  doc("Senate passes $1.2 trillion infrastructure bill in 62-38 vote", "The Senate approved the infrastructure bill on Tuesday, sending roads and broadband money to the House.", { lean: "Center", outletType: "wire", at: T0 }),
  doc("Senate approves sweeping infrastructure package, sending it to the House", "Senators voted 62-38 for the infrastructure package after weeks of talks.", { lean: "Lean Left", at: T0 + 0.5 * H }),
  doc("Senate Republicans join Democrats to pass infrastructure bill", "Nineteen Republicans backed the infrastructure bill in the Senate vote.", { lean: "Right", at: T0 + 1 * H }),
  doc("Infrastructure bill clears Senate with bipartisan support", "The bill heads to the House, where the infrastructure plan faces a tougher vote.", { lean: "Center", at: T0 + 1.2 * H }),
  doc("Schumer slams holdouts as Senate passes infrastructure bill!", "Majority leader criticized holdouts after the Senate infrastructure vote.", { lean: "Left", at: T0 + 2 * H }),
];
const storm = [
  doc("Hurricane Delia makes landfall in Louisiana as Category 3 storm", "Hurricane Delia came ashore near the Louisiana coast with 120 mph winds, cutting power along the Gulf Coast.", { at: T0 + 0.2 * H }),
  doc("Delia slams Gulf Coast, knocking out power to 400,000", "Hurricane Delia hit the Gulf Coast overnight as Louisiana utilities reported outages.", { at: T0 + 1.5 * H }),
  doc("Louisiana braces as Hurricane Delia comes ashore", "Officials in Louisiana urged residents to stay indoors as Hurricane Delia moved inland.", { at: T0 + 0.8 * H }),
];
const fed = [
  doc("Fed holds interest rates steady, signals cuts later this year", "The Federal Reserve left interest rates unchanged and said inflation is cooling.", { at: T0 + 3 * H }),
  doc("Federal Reserve keeps interest rates unchanged as inflation cools", "Fed officials held rates steady at their meeting, citing cooler inflation.", { at: T0 + 3.4 * H }),
  doc("Powell says Fed in no rush to cut interest rates", "Fed chair Powell said interest rates will stay steady until inflation cools further.", { at: T0 + 4 * H }),
];
const singles = [
  doc("Chiefs beat Bills in overtime thriller", "Kansas City won the game in overtime with a late touchdown.", { at: T0 + 2 * H, categoryHint: "Sports" }),
  doc("Apple unveils new iPhone with AI features", "Apple showed a new iPhone with built-in AI tools.", { at: T0 + 2.5 * H }),
];

describe("feed parsing", () => {
  it("reads RSS 2.0 with CDATA, HTML descriptions, entities and media images; drops unsafe links", () => {
    const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>X</title>
      <item><title><![CDATA[Senate passes bill &amp; more]]></title><link>https://news.example.com/a</link><guid>a1</guid>
        <description>&lt;p&gt;First &lt;b&gt;paragraph&lt;/b&gt; &amp;amp; more.&lt;/p&gt;</description><pubDate>Fri, 20 Nov 2026 10:00:00 GMT</pubDate>
        <media:content url="https://img.example.com/a.jpg" medium="image"/></item>
      <item><title>Bad link</title><link>javascript:alert(1)</link></item>
      <item><title>No image</title><link>https://news.example.com/b</link><description>${"word ".repeat(200)}</description><content:encoded>FULL ARTICLE BODY</content:encoded></item>
    </channel></rss>`;
    const items = parseFeed(xml);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: "Senate passes bill & more", url: "https://news.example.com/a", guid: "a1", snippet: "First paragraph & more.", imageUrl: "https://img.example.com/a.jpg" });
    expect(items[0].publishedAt).toBe(Date.UTC(2026, 10, 20, 10));
    expect(items[1].snippet.length).toBeLessThan(280);
    expect(items[1].snippet).not.toContain("FULL ARTICLE");
    expect(items[1].imageUrl).toBeNull();
  });
  it("reads Atom and RSS 1.0 (RDF)", () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom story</title><link rel="alternate" href="https://a.example.com/1"/><id>tag:1</id><updated>2026-11-20T10:00:00Z</updated><summary>Short summary</summary></entry></feed>`;
    expect(parseFeed(atom)[0]).toMatchObject({ title: "Atom story", url: "https://a.example.com/1", snippet: "Short summary" });
    const rdf = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"><item><title>RDF story</title><link>https://r.example.com/1</link><dc:date>2026-11-20T09:00:00Z</dc:date><description>d</description></item></rdf:RDF>`;
    expect(parseFeed(rdf)[0]).toMatchObject({ title: "RDF story", url: "https://r.example.com/1" });
    expect(parseFeed("not xml at all <<<")).toEqual([]);
  });
  it("maps licensed-API articles and skips removed ones", () => {
    const out = parseApiArticles([{ source: { id: "reuters" }, title: "Wire story", url: "https://w.example.com/1", description: "<b>Snip</b>", publishedAt: "2026-11-20T10:00:00Z" }, { source: { id: "reuters" }, title: "[Removed]", url: "https://w.example.com/2" }]);
    expect(out).toEqual([expect.objectContaining({ apiSource: "reuters", title: "Wire story", snippet: "Snip" })]);
  });
});

describe("text helpers", () => {
  it("keeps snippets under 280 characters and cleans titles", () => {
    expect(snippet("a ".repeat(400)).length).toBeLessThan(280);
    expect(cleanTitle("BREAKING: Senate passes bill - Fox News", "Fox News")).toBe("Senate passes bill");
    expect(cleanTitle("Senate passes bill | The Hill", "The Hill")).toBe("Senate passes bill");
    expect(neutralize("Schumer SLAMS holdouts in shocking vote!")).toBe("Schumer criticizes holdouts in vote");
    expect(isOpinion("Opinion: The bill is a mistake", "https://x.example.com/news/1")).toBe(true);
    expect(isOpinion("Bill passes", "https://x.example.com/opinion/2026/bill")).toBe(true);
  });
});

describe("clustering", () => {
  const all = [...senate, ...storm, ...fed, ...singles];
  let k = 0;
  const run = () => assign(all, [], [], (d) => storySlug(d.title, String(k++)));

  it("groups articles about the same event and keeps different events apart", () => {
    const { assignment, created } = run();
    const key = (d: Doc) => assignment.get(d.id);
    for (const group of [senate, storm, fed]) expect(new Set(group.map(key)).size).toBe(1);
    expect(new Set([key(senate[0]), key(storm[0]), key(fed[0]), key(singles[0]), key(singles[1])]).size).toBe(5);
    expect(created).toHaveLength(5);
  });

  it("attaches later articles to an existing story, but not after the time window", () => {
    const { stories } = run();
    const s = stories.find((x) => x.size === 5)!;
    const late = doc("House to vote on Senate infrastructure bill next week", "The infrastructure bill passed by the Senate goes to the House.", { at: T0 + 10 * H });
    const muchLater = doc("Senate passes another infrastructure bill", "A new Senate infrastructure bill passed.", { at: T0 + 80 * H });
    const r = assign([late, muchLater], [s], all.map((d) => d.terms), () => "new");
    expect(r.assignment.get(late.id)).toBe(s.key);
    expect(r.assignment.get(muchLater.id)).toBe("new");
  });

  it("does not merge stories that share only one distinctive word", () => {
    const a = doc("Senate confirms new ambassador to Japan", "The Senate confirmed the nominee.", { at: T0 });
    const b = doc("Senate passes farm bill extension", "Farm programs extended by the Senate.", { at: T0 + H });
    const r = assign([a, b], [], all.map((d) => d.terms), (d) => d.id);
    expect(r.assignment.get(a.id)).not.toBe(r.assignment.get(b.id));
  });

  it("writes a neutral headline from the common facts", () => {
    const h = pickHeadline(senate);
    expect(h.title).toMatch(/Senate/);
    expect(h.title.toLowerCase()).toContain("infrastructure");
    expect(h.title).not.toMatch(/slams|!/i);
    expect(h.summary.length).toBeLessThan(280);
    expect(h.summarySource).toBeTruthy();
    // a story where every outlet used a loaded verb still gets a neutral headline
    const loaded = pickHeadline([doc("Governor slams lawmakers over budget", "x"), doc("Governor blasts lawmakers over state budget", "y")]);
    expect(loaded.title).not.toMatch(/slams|blasts/i);
    expect(loaded.title).toMatch(/criticizes/);
    // opinion pieces never supply the headline
    const op = pickHeadline([doc("Opinion: Fed rate pause is a mistake", "a", { url: "https://x.example.com/opinion/1" }), doc("Fed pauses rate hikes", "b")]);
    expect(op.title).toBe("Fed pauses rate hikes");
  });

  it("assigns categories", () => {
    expect(storyCategory(senate)).toBe("Politics");
    expect(storyCategory(storm)).toBe("US");
    expect(storyCategory(fed)).toBe("Markets");
    expect(storyCategory([singles[0]])).toBe("Sports");
    expect(storyCategory([singles[1]])).toBe("Tech");
    expect(storyCategory([doc("Ukraine and Russia agree to ceasefire talks in Geneva", "Kyiv and Moscow will meet.")])).toBe("World");
    expect(classify("Something happened").US).toBe(0);
  });

  it("scores importance by breadth of coverage and decays freshness", () => {
    const wide = scoreStory(senate, T0 + 2 * H);
    const narrow = scoreStory([singles[1]], T0 + 2.5 * H);
    expect(wide.importance).toBeGreaterThan(narrow.importance + 30);
    expect(wide.outlets).toBe(5);
    expect(scoreStory(senate, T0 + 10 * H).freshness).toBeCloseTo(0.5, 2);
    expect(scoreStory(senate, T0 + 30 * H).status).toBe("ended");
    expect(scoreStory(senate, T0 + 3 * H).status).toBe("developing");
  });

  it("makes readable story slugs", () => {
    expect(storySlug("BREAKING: Senate passes $1.2 trillion infrastructure bill in 62-38 vote", "ab12")).toBe("senate-passes-12-trillion-infrastructure-bill-in-ab12");
  });
});

describe("clustering when the first article uses different words", () => {
  it("merges a near-duplicate story created in the same run, keeping existing stories' keys", () => {
    const at = Date.UTC(2026, 10, 20, 12);
    const d = (id: string, title: string, snip: string, h: number): Doc => ({ id, sourceId: id, outletName: id, title, snippet: snip, url: `https://e.example.com/${id}`, terms: articleTerms(title, snip), publishedAt: at + h * 3_600_000 });
    const docs = [
      d("a", "Senate approves sweeping infrastructure package", "Senators voted 62-38 for the infrastructure package.", 0),
      d("b", "Infrastructure bill clears Senate with bipartisan support", "The infrastructure bill passed the Senate with Republican votes.", 0.2),
      d("c", "Senate passes infrastructure bill in 62-38 vote", "The Senate approved the infrastructure bill, sending it to the House.", 0.4),
      d("e", "Senate approves sweeping infrastructure package", "Senators voted 62-38 for the infrastructure package.", 0.6),
    ];
    const r = assign(docs, [], [], (x) => `k-${x.id}`);
    expect(new Set(docs.map((x) => r.assignment.get(x.id))).size).toBe(1);
    expect(r.created).toHaveLength(1);
  });
});

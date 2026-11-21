import type { DatabaseSync } from "node:sqlite";

/**
 * The starting list of real outlets and their feeds.
 *
 * Sourcing rules (see DECISIONS.md, Part H):
 *  - Only official RSS feeds that the outlet publishes for readers, or a
 *    licensed news API (AP and Reuters have no public RSS; they come through
 *    the NEWS_API_KEY provider when it is set).
 *  - We keep the headline, a snippet under 280 characters, the outlet, the
 *    time and the link. Never the article body.
 *  - No logos: outlets show as a text badge with a small color dot.
 *
 * Lean labels are APPROXIMATE. They summarize publicly available third-party
 * ratings (AllSides Media Bias Ratings and the Ad Fontes Media Bias Chart, as
 * published in 2024–2025) and can be edited in the Control Room. Outlets the
 * raters don't cover (sports and tech sites) are "Not rated" and are left out
 * of the left/center/right shares, but still count toward the outlet total.
 */
export type Lean = "Left" | "Lean Left" | "Center" | "Lean Right" | "Right";
export const LEANS: Lean[] = ["Left", "Lean Left", "Center", "Lean Right", "Right"];
export type Category = "US" | "World" | "Politics" | "Markets" | "Sports" | "Tech";
export const CATEGORIES: Category[] = ["US", "World", "Politics", "Markets", "Sports", "Tech"];
export type OutletType = "wire" | "paper" | "tv" | "digital" | "magazine" | "public" | "international";

export type OutletDef = {
  id: string;
  name: string;
  homepage: string;
  feed: string | null;
  /** NewsAPI.org source id, used when the outlet has no public feed and NEWS_API_KEY is set. */
  api?: string;
  lean: Lean | null;
  note?: string;
  color: string;
  type: OutletType;
  category?: Category;
};

const AS = "Approximate: AllSides rating";
const AF = "Ad Fontes Media";
const note = (allsides: string, adfontes?: string) => `${AS} "${allsides}"${adfontes ? `; ${AF} places it "${adfontes}"` : ""}. Public ratings, 2024–2025. Edit if they change.`;
const UNRATED = "Not rated: AllSides and Ad Fontes don't rate this outlet's news coverage on a left-right scale. Left out of the coverage shares.";

export const OUTLET_LIST: OutletDef[] = [
  // Wire services
  { id: "ap", name: "Associated Press", homepage: "https://apnews.com", feed: null, api: "associated-press", lean: "Lean Left", note: note("Lean Left", "Middle"), color: "#e4002b", type: "wire" },
  { id: "reuters", name: "Reuters", homepage: "https://www.reuters.com", feed: null, api: "reuters", lean: "Center", note: note("Center", "Middle"), color: "#ff8000", type: "wire" },
  { id: "upi", name: "UPI", homepage: "https://www.upi.com", feed: "https://rss.upi.com/news/top_news.rss", lean: "Center", note: note("Center"), color: "#1f5fa8", type: "wire" },
  // National papers
  { id: "nyt", name: "The New York Times", homepage: "https://www.nytimes.com", feed: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml", lean: "Lean Left", note: note("Lean Left", "Skews Left"), color: "#8a8a8a", type: "paper" },
  { id: "wapo", name: "The Washington Post", homepage: "https://www.washingtonpost.com", feed: "https://feeds.washingtonpost.com/rss/national", lean: "Lean Left", note: note("Lean Left", "Skews Left"), color: "#9aa3ad", type: "paper" },
  { id: "wsj", name: "The Wall Street Journal", homepage: "https://www.wsj.com", feed: "https://feeds.a.dj.com/rss/RSSWorldNews.xml", lean: "Center", note: note("Center (news); its opinion section is rated Lean Right", "Middle"), color: "#b5a37a", type: "paper" },
  { id: "usatoday", name: "USA Today", homepage: "https://www.usatoday.com", feed: "https://rssfeeds.usatoday.com/usatoday-NewsTopStories", lean: "Lean Left", note: note("Lean Left", "Middle"), color: "#009bff", type: "paper" },
  { id: "nypost", name: "New York Post", homepage: "https://nypost.com", feed: "https://nypost.com/feed/", lean: "Lean Right", note: note("Lean Right", "Skews Right"), color: "#d0021b", type: "paper" },
  { id: "washtimes", name: "The Washington Times", homepage: "https://www.washingtontimes.com", feed: "https://www.washingtontimes.com/rss/headlines/news/", lean: "Lean Right", note: note("Lean Right", "Skews Right"), color: "#2b4c7e", type: "paper" },
  { id: "csm", name: "The Christian Science Monitor", homepage: "https://www.csmonitor.com", feed: "https://rss.csmonitor.com/feeds/all", lean: "Center", note: note("Center", "Middle"), color: "#b0252b", type: "paper" },
  { id: "guardian", name: "The Guardian", homepage: "https://www.theguardian.com/us", feed: "https://www.theguardian.com/us-news/rss", lean: "Lean Left", note: note("Lean Left", "Skews Left"), color: "#3c6eb4", type: "paper" },
  // TV news
  { id: "cnn", name: "CNN", homepage: "https://www.cnn.com", feed: "http://rss.cnn.com/rss/cnn_topstories.rss", lean: "Left", note: note("Left (CNN Digital)", "Skews Left"), color: "#cc0000", type: "tv" },
  { id: "fox", name: "Fox News", homepage: "https://www.foxnews.com", feed: "https://moxie.foxnews.com/google-publisher/latest.xml", lean: "Right", note: note("Right (Fox News Digital)", "Skews Right"), color: "#1f3d7a", type: "tv" },
  { id: "nbc", name: "NBC News", homepage: "https://www.nbcnews.com", feed: "https://feeds.nbcnews.com/nbcnews/public/news", lean: "Lean Left", note: note("Lean Left", "Skews Left"), color: "#6460aa", type: "tv" },
  { id: "cbs", name: "CBS News", homepage: "https://www.cbsnews.com", feed: "https://www.cbsnews.com/latest/rss/main", lean: "Lean Left", note: note("Lean Left", "Middle"), color: "#a9b3c1", type: "tv" },
  { id: "abc", name: "ABC News", homepage: "https://abcnews.go.com", feed: "https://abcnews.go.com/abcnews/topstories", lean: "Lean Left", note: note("Lean Left", "Middle"), color: "#4d6cfa", type: "tv" },
  { id: "msnbc", name: "MSNBC", homepage: "https://www.msnbc.com", feed: "https://www.msnbc.com/feeds/latest", lean: "Left", note: note("Left", "Skews Left"), color: "#2a6ebb", type: "tv" },
  { id: "newsmax", name: "Newsmax", homepage: "https://www.newsmax.com", feed: "https://www.newsmax.com/rss/Newsfront/16/", lean: "Right", note: note("Right", "Strong Right"), color: "#2c5aa0", type: "tv" },
  { id: "foxbusiness", name: "Fox Business", homepage: "https://www.foxbusiness.com", feed: "https://moxie.foxbusiness.com/google-publisher/latest.xml", lean: "Lean Right", note: note("Lean Right", "Skews Right"), color: "#1f3d7a", type: "tv", category: "Markets" },
  { id: "cnbc", name: "CNBC", homepage: "https://www.cnbc.com", feed: "https://www.cnbc.com/id/100003114/device/rss/rss.html", lean: "Center", note: note("Center", "Middle"), color: "#3fa9f5", type: "tv", category: "Markets" },
  // Public media
  { id: "npr", name: "NPR", homepage: "https://www.npr.org", feed: "https://feeds.npr.org/1001/rss.xml", lean: "Lean Left", note: note("Lean Left", "Skews Left"), color: "#d62021", type: "public" },
  { id: "pbs", name: "PBS NewsHour", homepage: "https://www.pbs.org/newshour", feed: "https://www.pbs.org/newshour/feeds/rss/headlines", lean: "Lean Left", note: note("Lean Left", "Middle"), color: "#2638c4", type: "public" },
  // Digital and political news
  { id: "thehill", name: "The Hill", homepage: "https://thehill.com", feed: "https://thehill.com/news/feed/", lean: "Center", note: note("Center", "Middle"), color: "#2a6ead", type: "digital", category: "Politics" },
  { id: "politico", name: "Politico", homepage: "https://www.politico.com", feed: "https://rss.politico.com/politics-news.xml", lean: "Lean Left", note: note("Lean Left", "Middle"), color: "#d8272d", type: "digital", category: "Politics" },
  { id: "axios", name: "Axios", homepage: "https://www.axios.com", feed: "https://api.axios.com/feed/", lean: "Lean Left", note: note("Lean Left", "Middle"), color: "#2a7de1", type: "digital" },
  { id: "newsweek", name: "Newsweek", homepage: "https://www.newsweek.com", feed: "https://www.newsweek.com/rss", lean: "Center", note: note("Center", "Middle"), color: "#d71920", type: "magazine" },
  { id: "huffpost", name: "HuffPost", homepage: "https://www.huffpost.com", feed: "https://www.huffpost.com/section/front-page/feed", lean: "Left", note: note("Left", "Skews Left"), color: "#0dbe98", type: "digital" },
  { id: "vox", name: "Vox", homepage: "https://www.vox.com", feed: "https://www.vox.com/rss/index.xml", lean: "Left", note: note("Left", "Skews Left"), color: "#fff200", type: "digital" },
  { id: "slate", name: "Slate", homepage: "https://slate.com", feed: "https://slate.com/feeds/all.rss", lean: "Left", note: note("Left", "Skews Left"), color: "#8a3fd1", type: "magazine" },
  { id: "intercept", name: "The Intercept", homepage: "https://theintercept.com", feed: "https://theintercept.com/feed/?rss", lean: "Left", note: note("Left", "Skews Left"), color: "#9b9b9b", type: "digital" },
  { id: "motherjones", name: "Mother Jones", homepage: "https://www.motherjones.com", feed: "https://www.motherjones.com/feed/", lean: "Left", note: note("Left", "Skews Left"), color: "#e5262b", type: "magazine" },
  { id: "thenation", name: "The Nation", homepage: "https://www.thenation.com", feed: "https://www.thenation.com/feed/?post_type=article", lean: "Left", note: note("Left", "Strong Left"), color: "#c8102e", type: "magazine" },
  { id: "atlantic", name: "The Atlantic", homepage: "https://www.theatlantic.com", feed: "https://www.theatlantic.com/feed/all/", lean: "Left", note: note("Left", "Skews Left"), color: "#bdbdbd", type: "magazine" },
  { id: "dispatch", name: "The Dispatch", homepage: "https://thedispatch.com", feed: "https://thedispatch.com/feed/", lean: "Lean Right", note: note("Lean Right", "Skews Right"), color: "#3a6a8c", type: "digital" },
  { id: "reason", name: "Reason", homepage: "https://reason.com", feed: "https://reason.com/latest/feed/", lean: "Lean Right", note: note("Lean Right", "Skews Right"), color: "#f26722", type: "magazine" },
  { id: "examiner", name: "Washington Examiner", homepage: "https://www.washingtonexaminer.com", feed: "https://www.washingtonexaminer.com/feed", lean: "Lean Right", note: note("Lean Right", "Skews Right"), color: "#a31f34", type: "digital", category: "Politics" },
  { id: "nationalreview", name: "National Review", homepage: "https://www.nationalreview.com", feed: "https://www.nationalreview.com/feed/", lean: "Right", note: note("Right", "Skews Right"), color: "#b22222", type: "magazine" },
  { id: "dailywire", name: "The Daily Wire", homepage: "https://www.dailywire.com", feed: "https://www.dailywire.com/feeds/rss.xml", lean: "Right", note: note("Right", "Strong Right"), color: "#d6a630", type: "digital" },
  { id: "breitbart", name: "Breitbart", homepage: "https://www.breitbart.com", feed: "https://feeds.feedburner.com/breitbart", lean: "Right", note: note("Right", "Strong Right"), color: "#f47216", type: "digital" },
  { id: "federalist", name: "The Federalist", homepage: "https://thefederalist.com", feed: "https://thefederalist.com/feed/", lean: "Right", note: note("Right", "Strong Right"), color: "#c41e3a", type: "digital" },
  { id: "dailycaller", name: "The Daily Caller", homepage: "https://dailycaller.com", feed: "https://dailycaller.com/feed/", lean: "Right", note: note("Right", "Strong Right"), color: "#1c5aa6", type: "digital" },
  { id: "freebeacon", name: "Washington Free Beacon", homepage: "https://freebeacon.com", feed: "https://freebeacon.com/feed/", lean: "Right", note: note("Right", "Skews Right"), color: "#9c1c1c", type: "digital" },
  // Business
  { id: "bloomberg", name: "Bloomberg", homepage: "https://www.bloomberg.com", feed: "https://feeds.bloomberg.com/markets/news.rss", lean: "Lean Left", note: note("Lean Left", "Middle"), color: "#a855f7", type: "digital", category: "Markets" },
  { id: "forbes", name: "Forbes", homepage: "https://www.forbes.com", feed: "https://www.forbes.com/business/feed/", lean: "Center", note: note("Center", "Middle"), color: "#9a9a9a", type: "magazine", category: "Markets" },
  // International
  { id: "bbc", name: "BBC News", homepage: "https://www.bbc.com/news", feed: "https://feeds.bbci.co.uk/news/world/rss.xml", lean: "Center", note: note("Center", "Middle"), color: "#bb1919", type: "international", category: "World" },
  { id: "aljazeera", name: "Al Jazeera", homepage: "https://www.aljazeera.com", feed: "https://www.aljazeera.com/xml/rss/all.xml", lean: "Lean Left", note: note("Lean Left", "Skews Left"), color: "#fa9000", type: "international", category: "World" },
  { id: "dw", name: "Deutsche Welle", homepage: "https://www.dw.com/en", feed: "https://rss.dw.com/rdf/rss-en-all", lean: "Center", note: note("Center", "Middle"), color: "#05b2fc", type: "international", category: "World" },
  { id: "france24", name: "France 24", homepage: "https://www.france24.com/en", feed: "https://www.france24.com/en/rss", lean: "Center", note: note("Center", "Middle"), color: "#00a1e4", type: "international", category: "World" },
  // Sports and tech (not rated)
  { id: "espn", name: "ESPN", homepage: "https://www.espn.com", feed: "https://www.espn.com/espn/rss/news", lean: null, note: UNRATED, color: "#d00", type: "tv", category: "Sports" },
  { id: "cbssports", name: "CBS Sports", homepage: "https://www.cbssports.com", feed: "https://www.cbssports.com/rss/headlines/", lean: null, note: UNRATED, color: "#0b4ea2", type: "digital", category: "Sports" },
  { id: "verge", name: "The Verge", homepage: "https://www.theverge.com", feed: "https://www.theverge.com/rss/index.xml", lean: null, note: UNRATED, color: "#e2127a", type: "digital", category: "Tech" },
  { id: "arstechnica", name: "Ars Technica", homepage: "https://arstechnica.com", feed: "https://feeds.arstechnica.com/arstechnica/index", lean: null, note: UNRATED, color: "#ff4e00", type: "digital", category: "Tech" },
  { id: "techcrunch", name: "TechCrunch", homepage: "https://techcrunch.com", feed: "https://techcrunch.com/feed/", lean: null, note: UNRATED, color: "#0a9e01", type: "digital", category: "Tech" },
];

/** Leans for the fictional demo outlets, so the coverage bar works with demo data. */
const DEMO_LEANS: Record<string, Lean> = { o1: "Center", o2: "Lean Left", o3: "Lean Right", o4: "Left", o5: "Right", o6: "Center" };

/** Insert any outlets that are missing (never overwrites edits made in the Control Room). */
export function seedOutlets(db: DatabaseSync) {
  const ins = db.prepare(
    `INSERT OR IGNORE INTO news_sources (id, name, homepage, feed_url, verified, kind, api_source, lean, lean_note, color, category, outlet_type, active, demo)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
  );
  for (const o of OUTLET_LIST) {
    ins.run(o.id, o.name, o.homepage, o.feed, o.feed ? "rss" : "api", o.api ?? null, o.lean, o.note ?? "", o.color, o.category ?? null, o.type);
  }
  const demo = db.prepare("UPDATE news_sources SET lean = ?, lean_note = 'Fictional demo outlet.' WHERE id = ? AND demo = 1 AND lean IS NULL");
  for (const [id, lean] of Object.entries(DEMO_LEANS)) demo.run(lean, id);
}

import type { Category, Lean, OutletType } from "./outlets";
import { cleanTitle, isOpinion, loadedWords, neutralize, tokenize } from "./text";

/**
 * Story clustering. Pure functions, no database: the ingest job feeds them
 * articles and the current story profiles and writes back the result.
 *
 * How it works (DECISIONS.md, Part H):
 *  1. Each article is a weighted bag of keywords (title words count double).
 *  2. Words are weighted by TF-IDF over the last few days of articles, so
 *     "senate" or "tariff" matter more than words every story shares.
 *  3. Articles are processed oldest first. Each one joins the active story
 *     (last article within STORY_WINDOW) whose keyword profile is most
 *     similar (cosine), if the similarity clears JOIN_THRESHOLD and they share
 *     at least MIN_SHARED distinctive title words. Otherwise it starts a new
 *     story. A story's profile is the sum of its articles' bags.
 */
export const STORY_WINDOW = 36 * 3_600_000;
export const JOIN_THRESHOLD = 0.3;
export const MIN_SHARED = 2;

export type Bag = Record<string, number>;
export type Doc = {
  id: string; sourceId: string; outletName: string; title: string; snippet: string; url: string; terms: Bag; publishedAt: number;
  lean?: Lean | null; outletType?: OutletType | string | null; categoryHint?: Category | null;
};
export type StoryState = { key: string; terms: Bag; firstAt: number; lastAt: number; size: number };

/** Inverse document frequency over a corpus of bags (smoothed, never zero). */
export function makeIdf(corpus: Bag[]) {
  const df = new Map<string, number>();
  for (const b of corpus) for (const t of Object.keys(b)) df.set(t, (df.get(t) ?? 0) + 1);
  const n = corpus.length;
  const idf = (t: string) => Math.log((n + 1) / ((df.get(t) ?? 0) + 1)) + 1;
  /** Words in more than 10% of recent articles (and more than 10) aren't distinctive enough to link two articles on their own. */
  const common = (t: string) => (df.get(t) ?? 0) > Math.max(10, n * 0.1);
  return { idf, common, size: n };
}

function vec(b: Bag, idf: (t: string) => number) {
  const v = new Map<string, number>();
  let norm = 0;
  for (const [t, w] of Object.entries(b)) {
    const x = w * idf(t);
    v.set(t, x);
    norm += x * x;
  }
  norm = Math.sqrt(norm) || 1;
  for (const [t, x] of v) v.set(t, x / norm);
  return v;
}

export function cosine(a: Bag, b: Bag, idf: (t: string) => number): number {
  const va = vec(a, idf);
  const vb = vec(b, idf);
  let s = 0;
  for (const [t, x] of va) s += x * (vb.get(t) ?? 0);
  return s;
}

/** Distinctive title words two bags share (title words have weight ≥ 2 in an article bag). */
export function sharedTerms(doc: Bag, story: Bag, common: (t: string) => boolean): string[] {
  return Object.keys(doc).filter((t) => doc[t] >= 2 && (story[t] ?? 0) > 0 && !common(t));
}

export function addBag(into: Bag, b: Bag) {
  for (const [t, w] of Object.entries(b)) into[t] = (into[t] ?? 0) + w;
  return into;
}

/** Keep a story profile small: its 60 heaviest words. */
export function trimBag(b: Bag, keep = 60): Bag {
  return Object.fromEntries(Object.entries(b).sort((x, y) => y[1] - x[1]).slice(0, keep));
}

/**
 * Assign articles to stories. Returns, for each article, the story key it
 * joined (existing or new) and the new stories created. `makeKey` names a new
 * story from its first article.
 */
export function assign(docs: Doc[], stories: StoryState[], corpus: Bag[], makeKey: (d: Doc) => string) {
  const { idf, common } = makeIdf([...corpus, ...docs.map((d) => d.terms)]);
  const live = stories.map((s) => ({ ...s, terms: { ...s.terms } }));
  const created: StoryState[] = [];
  const assignment = new Map<string, string>();
  for (const d of [...docs].sort((a, b) => a.publishedAt - b.publishedAt)) {
    let best: { s: StoryState; sim: number } | null = null;
    for (const s of live) {
      if (d.publishedAt - s.lastAt > STORY_WINDOW || s.firstAt - d.publishedAt > STORY_WINDOW) continue;
      if (sharedTerms(d.terms, s.terms, common).length < MIN_SHARED) continue;
      const sim = cosine(d.terms, s.terms, idf);
      if (sim >= JOIN_THRESHOLD && (!best || sim > best.sim)) best = { s, sim };
    }
    if (best) {
      addBag(best.s.terms, d.terms);
      best.s.lastAt = Math.max(best.s.lastAt, d.publishedAt);
      best.s.firstAt = Math.min(best.s.firstAt, d.publishedAt);
      best.s.size++;
      assignment.set(d.id, best.s.key);
    } else {
      const s: StoryState = { key: makeKey(d), terms: { ...d.terms }, firstAt: d.publishedAt, lastAt: d.publishedAt, size: 1 };
      live.push(s);
      created.push(s);
      assignment.set(d.id, s.key);
    }
  }
  return { assignment, created, stories: live };
}

/** URL slug for a new story: the first few words of its first headline plus a short random suffix. */
export function storySlug(title: string, rand: string): string {
  const words = cleanTitle(title).toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").split(/\s+/).filter(Boolean).slice(0, 7).join("-");
  return `${words.slice(0, 60).replace(/-+$/, "") || "story"}-${rand}`;
}

// ------------------------------------------------------------------ headline

const WIRE_OR_CENTER = (d: Doc) => d.outletType === "wire" || d.lean === "Center";

/**
 * The story headline is built from what the outlets agree on: the words that
 * appear in at least 40% of the member headlines are the "common facts". Each
 * candidate headline is scored on how many of those words it contains and how
 * few others, with a small bonus for wire and center outlets and a penalty for
 * loaded words, opinion pieces and question headlines. The winner is then
 * neutralized (loaded verbs replaced, exclamation marks and shouting removed).
 */
export function pickHeadline(members: Doc[]): { title: string; summary: string; summarySource: string | null } {
  if (!members.length) return { title: "", summary: "", summarySource: null };
  const titled = members.map((d) => ({ d, t: cleanTitle(d.title, d.outletName), toks: new Set(tokenize(cleanTitle(d.title, d.outletName))) }));
  const freq = new Map<string, number>();
  for (const x of titled) for (const w of x.toks) freq.set(w, (freq.get(w) ?? 0) + 1);
  const need = Math.max(2, Math.ceil(members.length * 0.4));
  const consensus = new Set([...freq].filter(([, n]) => n >= need).map(([w]) => w));
  const scored = titled.map((x) => {
    const inC = [...x.toks].filter((w) => consensus.has(w)).length;
    const recall = consensus.size ? inC / consensus.size : 0;
    const precision = x.toks.size ? inC / x.toks.size : 0;
    let score = recall + 0.6 * precision;
    if (WIRE_OR_CENTER(x.d)) score += 0.15;
    if (isOpinion(x.d.title, x.d.url)) score -= 1;
    if (/\?\s*$/.test(x.t)) score -= 0.5;
    score -= 0.4 * loadedWords(x.t);
    if (x.t.length > 120) score -= 0.3;
    if (x.t.length < 25) score -= 0.2;
    return { ...x, score };
  });
  scored.sort((a, b) => b.score - a.score || a.d.publishedAt - b.d.publishedAt);
  const best = scored[0];
  const withSnippet = scored.find((x) => x.d.snippet && !isOpinion(x.d.title, x.d.url)) ?? null;
  return { title: neutralize(best.t).slice(0, 160), summary: withSnippet?.d.snippet ?? "", summarySource: withSnippet?.d.outletName ?? null };
}

// ------------------------------------------------------------------ category

const KEYWORDS: Record<Category, string[]> = {
  Sports: ["nfl", "nba", "mlb", "nhl", "mls", "wnba", "ncaa", "game", "season", "coach", "playoff", "quarterback", "touchdown", "championship", "league", "olympic", "tournament", "super bowl", "world series", "stanley cup", "match", "striker", "pitcher", "inning", "draft", "roster", "soccer", "football", "basketball", "baseball", "hockey", "tennis", "golf", "f1", "grand slam", "athlete", "stadium", "espn"],
  Markets: ["stock", "stocks", "market", "markets", "dow", "s&p", "nasdaq", "fed", "federal reserve", "interest rate", "rates", "inflation", "earnings", "shares", "investor", "bond", "treasury", "yield", "economy", "gdp", "jobs report", "unemployment", "oil price", "crude", "bitcoin", "crypto", "ipo", "merger", "acquisition", "revenue", "profit", "wall street", "recession", "consumer prices", "mortgage", "tariff", "trade deal", "ceo", "layoffs"],
  Tech: ["ai", "artificial intelligence", "openai", "chatbot", "google", "apple", "microsoft", "meta", "amazon", "nvidia", "chip", "chips", "semiconductor", "software", "app", "iphone", "android", "cyber", "hack", "hacker", "data breach", "startup", "robot", "spacex", "satellite", "tiktok", "algorithm", "smartphone", "tech", "silicon valley", "quantum", "x.com", "social media"],
  Politics: ["congress", "senate", "senator", "house speaker", "lawmakers", "president", "white house", "election", "campaign", "democrat", "democrats", "republican", "republicans", "gop", "governor", "supreme court", "bill", "legislation", "vote", "voters", "poll", "administration", "impeachment", "cabinet", "pentagon", "attorney general", "justice department", "doj", "fbi", "primary", "ballot", "midterm", "filibuster", "shutdown", "veto", "executive order", "trump", "biden", "harris", "vance", "mcconnell", "schumer", "johnson"],
  World: ["ukraine", "russia", "russian", "china", "chinese", "israel", "gaza", "hamas", "hezbollah", "iran", "india", "pakistan", "britain", "uk", "france", "germany", "japan", "korea", "mexico", "canada", "brazil", "taiwan", "syria", "lebanon", "venezuela", "nato", "un", "united nations", "eu", "european union", "prime minister", "parliament", "kremlin", "beijing", "moscow", "kyiv", "embassy", "ceasefire", "africa", "middle east", "europe", "asia", "putin", "zelensky", "netanyahu", "xi"],
  US: ["police", "shooting", "storm", "hurricane", "tornado", "wildfire", "flood", "weather", "school", "court", "trial", "jury", "judge", "arrest", "crash", "fire", "county", "state", "city", "mayor", "faa", "cdc", "fda", "health", "measles", "airport", "snow", "heat wave", "earthquake", "missing", "killed", "dies", "lawsuit"],
};

/** Keyword scores for each category (title hits count double). */
export function classify(title: string, snip = ""): Record<Category, number> {
  const t = ` ${title.toLowerCase().replace(/[^\w&.\s-]/g, " ")} `;
  const s = ` ${snip.toLowerCase().replace(/[^\w&.\s-]/g, " ")} `;
  const out = {} as Record<Category, number>;
  for (const [cat, words] of Object.entries(KEYWORDS) as [Category, string[]][]) {
    let n = 0;
    for (const w of words) {
      if (t.includes(` ${w} `)) n += 2;
      if (s.includes(` ${w} `)) n += 1;
    }
    out[cat] = n;
  }
  return out;
}

/** A story's category: summed keyword scores of its articles plus one vote per article from a topical feed (e.g. ESPN → Sports). Ties go to US. */
export function storyCategory(members: Pick<Doc, "title" | "snippet" | "categoryHint">[]): Category {
  const total = { US: 0.5, World: 0, Politics: 0, Markets: 0, Sports: 0, Tech: 0 } as Record<Category, number>;
  for (const m of members) {
    const c = classify(m.title, m.snippet);
    for (const k of Object.keys(total) as Category[]) total[k] += c[k];
    if (m.categoryHint) total[m.categoryHint] += 3;
  }
  return (Object.entries(total) as [Category, number][]).sort((a, b) => b[1] - a[1])[0][0];
}

/** How categories map onto the app's existing sections (channel dial, topic tabs, story art). */
export const CATEGORY_SECTION: Record<Category, string> = { US: "Top Stories", World: "World", Politics: "Politics", Markets: "Business", Sports: "Sports", Tech: "Tech" };

// ------------------------------------------------------------------ scores

const LEAN_GROUP = (l?: Lean | null) => (!l ? null : l === "Left" || l === "Lean Left" ? "L" : l === "Center" ? "C" : "R");

/**
 * Importance (0–100) rewards breadth of coverage, not clicks:
 *   up to 40  number of distinct outlets (16 or more = full marks)
 *   up to 20  outlets from different sides (left / center / right)
 *   up to 12  different kinds of outlet (wire, paper, TV, public, digital…)
 *   8         a wire service is covering it
 *   up to 15  how many articles arrived in the last 3 hours
 * Freshness (0–1) halves every 8 hours since the latest article. Feeds rank
 * stories by importance × (0.35 + 0.65 × freshness).
 */
export function scoreStory(members: Pick<Doc, "sourceId" | "lean" | "outletType" | "publishedAt">[], now: number) {
  const outlets = new Set(members.map((m) => m.sourceId)).size;
  const sides = new Set(members.map((m) => LEAN_GROUP(m.lean)).filter(Boolean)).size;
  const types = new Set(members.map((m) => m.outletType).filter(Boolean)).size;
  const wire = members.some((m) => m.outletType === "wire");
  const last = Math.max(...members.map((m) => m.publishedAt));
  const recent = members.filter((m) => now - m.publishedAt < 3 * 3_600_000).length;
  const importance =
    40 * Math.min(1, Math.log2(Math.max(1, outlets)) / 4) + [0, 8, 15, 20][sides] + Math.min(12, Math.max(0, types - 1) * 4) + (wire ? 8 : 0) + Math.min(15, recent * 3);
  const hours = Math.max(0, (now - last) / 3_600_000);
  const freshness = Math.pow(0.5, hours / 8);
  const status: "developing" | "ended" = hours > 24 ? "ended" : "developing";
  return { importance: Math.round(Math.min(100, Math.max(0, importance)) * 10) / 10, freshness: Math.round(freshness * 1000) / 1000, status, outlets, lastAt: last };
}

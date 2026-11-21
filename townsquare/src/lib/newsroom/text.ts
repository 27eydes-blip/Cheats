/** Text helpers for feed items: HTML cleanup, snippets, headline cleanup and keyword tokens. Pure functions. */

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", bull: "•", middot: "·", copy: "©", reg: "®", trade: "™", eacute: "é", egrave: "è", aacute: "á", ntilde: "ñ", ouml: "ö", uuml: "ü",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** Strip tags (and script/style bodies), decode entities, collapse whitespace. */
export function stripHtml(s: string): string {
  let t = s.replace(/<(script|style|iframe|noscript)[\s\S]*?<\/\1>/gi, " ");
  t = t.replace(/<br\s*\/?>|<\/p>/gi, " ").replace(/<[^>]*>/g, " ");
  t = decodeEntities(t);
  // Feeds sometimes double-escape (&amp;lt;p&amp;gt;): one more pass for leftover tags.
  t = t.replace(/<[^>]*>/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

export const SNIPPET_MAX = 279;

/** A snippet under 280 characters, cut at a word boundary. */
export function snippet(text: string, max = SNIPPET_MAX): string {
  const t = stripHtml(text);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return (at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.–—-]+$/, "") + "…";
}

const PREFIX = /^(?:breaking(?: news)?|exclusive|watch|video|live(?: updates)?|update|updated|just in|developing|analysis|listen|photos|opinion|op-ed|column|editorial|fact check)\s*[:|–—-]\s*/i;

/** Remove "BREAKING:" style prefixes and a trailing " - Outlet" / " | Outlet". */
export function cleanTitle(title: string, outlet?: string): string {
  let t = stripHtml(title).replace(/\s+/g, " ").trim();
  for (let i = 0; i < 2; i++) t = t.replace(PREFIX, "");
  if (outlet) {
    const esc = outlet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/^the\\? /i, "(?:the )?");
    t = t.replace(new RegExp(`\\s*[-|–—:]\\s*${esc}\\s*$`, "i"), "");
  }
  return t.replace(/\s*[|]\s*[^|]{2,40}$/, "").trim();
}

/** Opinion, analysis and editorial pieces still count as coverage but never supply the story's headline. */
export function isOpinion(title: string, url: string): boolean {
  return /^(opinion|op-ed|column|editorial|analysis|commentary|perspective|letters?)\b/i.test(stripHtml(title)) || /\/(opinions?|op-?eds?|commentary|editorials?|columns?|columnists?|perspectives?)\//i.test(url);
}

/** Loaded verbs and adjectives replaced in story headlines (story headlines are ours, so they stay neutral). */
export const LOADED: Record<string, string> = {
  slams: "criticizes", slammed: "criticized", blasts: "criticizes", blasted: "criticized", rips: "criticizes", ripped: "criticized", torches: "criticizes", torched: "criticized",
  destroys: "criticizes", destroyed: "criticized", eviscerates: "criticizes", hammers: "criticizes", hammered: "criticized", lashes: "criticizes", "lashes out at": "criticizes", "lashed out at": "criticized",
  shocking: "", stunning: "", explosive: "", bombshell: "new", outrageous: "", disastrous: "", chaotic: "", radical: "", extreme: "", furious: "", meltdown: "dispute", humiliating: "", brutal: "",
  "caves to": "agrees with", caved: "agreed", "doubles down": "repeats", "doubled down": "repeated",
};

export function loadedWords(title: string): number {
  const t = ` ${title.toLowerCase()} `;
  return Object.keys(LOADED).filter((w) => t.includes(` ${w} `)).length;
}

/** Replace loaded words, drop exclamation marks, tidy spacing. */
export function neutralize(title: string): string {
  let t = title;
  for (const [w, r] of Object.entries(LOADED).sort((a, b) => b[0].length - a[0].length)) {
    t = t.replace(new RegExp(`\\b${w}\\b`, "gi"), (m) => (r && m.length > 1 && m !== m.toUpperCase() && m[0] === m[0].toUpperCase() ? r[0].toUpperCase() + r.slice(1) : r));
  }
  t = t.replace(/!+/g, "").replace(/\s{2,}/g, " ").replace(/\s+([,.;:])/g, "$1").replace(/^[\s,;:]+|[\s,;:]+$/g, "");
  // ALL-CAPS words longer than 4 letters (shouting) become Title case; acronyms stay.
  t = t.replace(/\b([A-Z]{5,})\b/g, (w) => w[0] + w.slice(1).toLowerCase());
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

const STOP = new Set(
  (
    "a an the and or but if then than of in on at to for from by with about into over after before amid among against during under up down out off as is are was were be been being has have had do does did " +
    "it its this that these those he she they them his her their we our you your i me my who whom whose what which when where why how all any each more most other some such no not only own same so too very can will " +
    "just should now would could may might must shall says said say tells told new news report reports reported latest live update updates breaking video watch photos year years week weeks day days today yesterday tomorrow " +
    "monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december jan feb mar apr jun jul aug sep sept oct nov dec " +
    "here there via per get gets got make makes made take takes took one two first last also back still even like while what's it's here's people man woman time way amp nbsp"
  ).split(" "),
);

function stem(w: string): string {
  if (/^\d/.test(w)) return w;
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed") && !w.endsWith("eed")) return w.slice(0, -2);
  if (w.length > 4 && /(ss|sh|ch|x)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && !w.endsWith("is")) return w.slice(0, -1);
  return w;
}

/** Keyword tokens: lowercase, no stopwords, light stemming. Keeps numbers (vote counts, dollar figures). */
export function tokenize(text: string): string[] {
  const t = stripHtml(text)
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .replace(/\bu\.s\.(a\.)?/g, "us ")
    .replace(/\bu\.k\./g, "uk ")
    .replace(/[’'`]/g, "")
    .replace(/(\d),(\d)/g, "$1$2")
    .replace(/(\d)\.(\d)/g, "$1_$2");
  const out: string[] = [];
  for (const raw of t.split(/[^a-z0-9_$%]+/)) {
    if (!raw || STOP.has(raw)) continue;
    if (raw.length < 3 && !/^\d{2,}$/.test(raw) && !["us", "uk", "un", "eu", "ai"].includes(raw)) continue;
    out.push(stem(raw));
  }
  return out;
}

/** Weighted bag of words for one article: title words count double. */
export function articleTerms(title: string, snip: string): Record<string, number> {
  const bag: Record<string, number> = {};
  for (const w of tokenize(title)) bag[w] = (bag[w] ?? 0) + 2;
  for (const w of tokenize(snip).slice(0, 40)) bag[w] = (bag[w] ?? 0) + 1;
  return bag;
}

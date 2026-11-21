import { XMLParser } from "fast-xml-parser";
import { snippet, stripHtml } from "./text";

/** One item as read from a feed: only what we are allowed to keep. */
export type FeedItem = { title: string; url: string; guid: string; snippet: string; publishedAt: number | null; imageUrl: string | null };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  // Only the five XML entities; HTML entities inside text are decoded by stripHtml.
  processEntities: true,
  htmlEntities: false,
  isArray: (name) => ["item", "entry", "link", "media:content", "media:thumbnail", "enclosure", "category"].includes(name),
});

type Node = Record<string, unknown> | string | undefined;
const text = (n: unknown): string => {
  if (n == null) return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return text(n[0]);
  if (typeof n === "object") return text((n as Record<string, unknown>)["#text"]);
  return "";
};
const attr = (n: unknown, a: string): string => (n && typeof n === "object" && !Array.isArray(n) ? String((n as Record<string, unknown>)[`@_${a}`] ?? "") : "");
const arr = (n: unknown): unknown[] => (n == null ? [] : Array.isArray(n) ? n : [n]);

/** Only absolute http(s) links; anything else (javascript:, data:) is dropped. */
export function safeUrl(u: string, base?: string): string | null {
  try {
    const url = new URL(u.trim(), base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseDate(s: string): number | null {
  if (!s) return null;
  const t = Date.parse(s.trim());
  return Number.isFinite(t) ? t : null;
}

function imageOf(it: Record<string, unknown>, base: string): string | null {
  const cands: string[] = [];
  for (const m of arr(it["media:content"])) {
    const type = attr(m, "type");
    const medium = attr(m, "medium");
    if (medium === "image" || type.startsWith("image/") || (!type && !medium && /\.(jpe?g|png|webp)(\?|$)/i.test(attr(m, "url")))) cands.push(attr(m, "url"));
    for (const t of arr((m as Record<string, unknown>)?.["media:thumbnail"])) cands.push(attr(t, "url"));
  }
  for (const m of arr(it["media:thumbnail"])) cands.push(attr(m, "url"));
  const group = it["media:group"] as Record<string, unknown> | undefined;
  if (group) for (const m of arr(group["media:content"])) if (attr(m, "medium") === "image" || attr(m, "type").startsWith("image/")) cands.push(attr(m, "url"));
  for (const e of arr(it.enclosure)) if (attr(e, "type").startsWith("image/")) cands.push(attr(e, "url"));
  for (const c of cands) {
    const u = c && safeUrl(c, base);
    // Only https images: http images would be blocked as mixed content anyway.
    if (u && u.startsWith("https://")) return u;
  }
  return null;
}

/**
 * Parse RSS 2.0, RSS 1.0 (RDF) or Atom into items. We read the title, link,
 * id, publication time, an image the feed itself provides, and the summary
 * (cut to a snippet under 280 characters). Full article bodies
 * (content:encoded) are never read; Atom <content> is used only when there is
 * no <summary>, and is cut to the same snippet length.
 */
export function parseFeed(xml: string, base = "https://example.com/"): FeedItem[] {
  if (!xml || xml.length > 5_000_000) return [];
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return [];
  }
  const out: FeedItem[] = [];
  const rss = doc.rss as Record<string, unknown> | undefined;
  const rdf = doc["rdf:RDF"] as Record<string, unknown> | undefined;
  const feed = doc.feed as Record<string, unknown> | undefined;
  const items = rss ? arr((rss.channel as Record<string, unknown>)?.item) : rdf ? arr(rdf.item) : [];
  for (const raw of items) {
    const it = raw as Record<string, unknown>;
    const title = stripHtml(text(it.title));
    const link = safeUrl(text(it.link) || attr(arr(it.link)[0], "href"), base) ?? (text(it.guid).startsWith("http") ? safeUrl(text(it.guid)) : null);
    if (!title || !link) continue;
    out.push({
      title,
      url: link,
      guid: text(it.guid) || link,
      snippet: snippet(text(it.description) || text(it["dc:description"])),
      publishedAt: parseDate(text(it.pubDate) || text(it["dc:date"]) || text(it.published)),
      imageUrl: imageOf(it, link),
    });
  }
  if (feed) {
    for (const raw of arr(feed.entry)) {
      const it = raw as Record<string, unknown>;
      const title = stripHtml(text(it.title));
      const links = arr(it.link) as Node[];
      const alt = links.find((l) => !attr(l, "rel") || attr(l, "rel") === "alternate") ?? links[0];
      const link = safeUrl(attr(alt, "href") || text(alt), base);
      if (!title || !link) continue;
      out.push({
        title,
        url: link,
        guid: text(it.id) || link,
        snippet: snippet(text(it.summary) || text(it.content)),
        publishedAt: parseDate(text(it.published) || text(it.updated)),
        imageUrl: imageOf(it, link),
      });
    }
  }
  return out;
}

/** Map a licensed news API's article list (NewsAPI.org shape) to feed items, by source id. */
export type ApiArticle = { source?: { id?: string | null; name?: string }; title?: string | null; description?: string | null; url?: string | null; urlToImage?: string | null; publishedAt?: string | null };
export function parseApiArticles(articles: ApiArticle[]): (FeedItem & { apiSource: string })[] {
  const out: (FeedItem & { apiSource: string })[] = [];
  for (const a of articles) {
    const url = a.url ? safeUrl(a.url) : null;
    const title = stripHtml(a.title ?? "");
    if (!url || !title || !a.source?.id || title === "[Removed]") continue;
    const img = a.urlToImage ? safeUrl(a.urlToImage) : null;
    out.push({ apiSource: a.source.id, title, url, guid: url, snippet: snippet(a.description ?? ""), publishedAt: a.publishedAt ? parseDate(a.publishedAt) : null, imageUrl: img?.startsWith("https://") ? img : null });
  }
  return out;
}

import { get, now, run } from "../db";

/**
 * Polite HTTP for feeds: a descriptive User-Agent (no personal details),
 * conditional requests (ETag / Last-Modified) so unchanged feeds cost a 304,
 * a timeout, a size cap, and a robots.txt check before every feed fetch.
 */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** The public site address (APP_URL, or Railway's domain), so site owners can see who is reading their feed. */
const site = () => {
  const raw = process.env.APP_URL || process.env.RAILWAY_PUBLIC_DOMAIN || "";
  if (!raw || /localhost|127\.0\.0\.1/.test(raw)) return "";
  return `https://${raw.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
};
export const BOT_TOKEN = "WorldNetNewsBot";
export const userAgent = () => `${BOT_TOKEN}/1.0 (RSS reader; headlines and links only${site() ? `; +${site()}/help#news-sources` : ""})`;

export type FetchResult = { status: number; body: string; etag: string | null; lastModified: string | null; retryAfter: number | null; error?: string };

export async function fetchText(url: string, opts: { etag?: string | null; lastModified?: string | null; fetchImpl?: FetchLike; timeoutMs?: number; maxBytes?: number; headers?: Record<string, string> } = {}): Promise<FetchResult> {
  const f = opts.fetchImpl ?? fetch;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 15_000);
  try {
    const headers: Record<string, string> = { "user-agent": userAgent(), accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json;q=0.9, */*;q=0.5", ...opts.headers };
    if (opts.etag) headers["if-none-match"] = opts.etag;
    if (opts.lastModified) headers["if-modified-since"] = opts.lastModified;
    const res = await f(url, { headers, signal: ctl.signal, redirect: "follow" });
    const ra = res.headers.get("retry-after");
    const retryAfter = ra ? (/^\d+$/.test(ra) ? Number(ra) * 1000 : Math.max(0, Date.parse(ra) - Date.now()) || null) : null;
    let body = "";
    if (res.status === 200) {
      const len = Number(res.headers.get("content-length") || 0);
      const max = opts.maxBytes ?? 4_000_000;
      if (len > max) return { status: 413, body: "", etag: null, lastModified: null, retryAfter, error: "Feed is too large" };
      body = await res.text();
      if (body.length > max) return { status: 413, body: "", etag: null, lastModified: null, retryAfter, error: "Feed is too large" };
    }
    return { status: res.status, body, etag: res.headers.get("etag"), lastModified: res.headers.get("last-modified"), retryAfter };
  } catch (e) {
    return { status: 0, body: "", etag: null, lastModified: null, retryAfter: null, error: (e as Error).name === "AbortError" ? "Timed out" : (e as Error).message || "Network error" };
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------ robots.txt

type Rule = { allow: boolean; path: string };

/** The rules that apply to us: the group naming our bot if there is one, otherwise the "*" group. */
export function robotsRules(body: string, agent = BOT_TOKEN): Rule[] {
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let cur: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && (key === "allow" || key === "disallow")) cur.rules.push({ allow: key === "allow", path: val });
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && agent.toLowerCase().includes(a)));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  return chosen.flatMap((g) => g.rules);
}

function matches(pattern: string, path: string): boolean {
  if (!pattern) return false;
  const re = new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, (c) => (c === "$" ? "$" : `\\${c}`)).replace(/\*/g, ".*").replace(/\\\$$/, "$"));
  return re.test(path);
}

/** Longest matching rule wins; Allow wins a tie; an empty Disallow allows everything. */
export function robotsAllows(rules: Rule[], path: string): boolean {
  let best: Rule | null = null;
  for (const r of rules) {
    if (!r.path) continue;
    if (matches(r.path, path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return best ? best.allow : true;
}

/**
 * May we fetch this URL? robots.txt is cached for 24 hours per host (a failed
 * check only ROBOTS_RETRY, so the next sync tries again). As with
 * major crawlers: a missing robots.txt (4xx) allows everything; a server
 * error (5xx) or network failure means "try later" (treated as not allowed).
 */
/** How long a failed robots.txt check is remembered before trying again. */
export const ROBOTS_RETRY = 9 * 60_000;

export async function allowedByRobots(url: string, fetchImpl?: FetchLike): Promise<{ ok: boolean; reason?: string }> {
  const u = new URL(url);
  const host = u.host;
  let row = get<{ body: string; status: number; fetched_at: number }>("SELECT body, status, fetched_at FROM robots_cache WHERE host = ?", [host]);
  // A good answer is kept 24 hours; a failed one (timeout, 5xx) only ROBOTS_RETRY, so the next sync really retries.
  const failed = (st: number) => st === 0 || st >= 500;
  if (!row || now() - row.fetched_at > (failed(row.status) ? ROBOTS_RETRY : 24 * 3_600_000)) {
    const r = await fetchText(`${u.protocol}//${host}/robots.txt`, { fetchImpl, timeoutMs: 12_000, maxBytes: 500_000 });
    row = { body: r.status === 200 ? r.body : "", status: r.status, fetched_at: now() };
    run("INSERT INTO robots_cache (host, body, status, fetched_at) VALUES (?, ?, ?, ?) ON CONFLICT(host) DO UPDATE SET body = excluded.body, status = excluded.status, fetched_at = excluded.fetched_at", [host, row.body, row.status, row.fetched_at]);
  }
  if (failed(row.status)) return { ok: false, reason: "robots.txt unavailable; will retry" };
  if (row.status !== 200) return { ok: true };
  return robotsAllows(robotsRules(row.body), u.pathname + u.search) ? { ok: true } : { ok: false, reason: "Blocked by the site's robots.txt" };
}

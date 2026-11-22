/* Network layer for the passive scanner: domain validation, DNS over HTTPS, SSRF-safe
   fetching of the target site, and fetching of a few fixed public APIs.

   SSRF protection: every hostname we connect to on the target side (including every
   redirect hop) must be a syntactically public domain name whose every A/AAAA record is
   a public IP. IP literals, non-default ports, credentials in URLs and private/reserved
   names are refused. */
import { isIPLiteral, isPublicIP } from "../ip.js";

/* Limits. maxSubrequests stays under the Workers free plan's 50 per request. */
export const SCAN = {
  timeoutMs: 6000, dnsTimeoutMs: 4000, apiTimeoutMs: 5000, maxRedirects: 4,
  maxReadBytes: 4096, maxHtmlBytes: 300_000, maxSubrequests: 48,
};

const RESERVED_TLDS = new Set([
  "localhost", "local", "localdomain", "internal", "intranet", "lan", "home", "corp", "private",
  "test", "example", "invalid", "onion", "arpa", "alt", "mail", "domain", "workgroup",
]);
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

export class ScanError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/* Public-looking hostname? (Syntax only; DNS is checked separately.) */
export function hostnameProblem(host) {
  if (!host) return "Please enter your website's domain, like yourbusiness.com.";
  if (host.startsWith("[") || isIPLiteral(host)) return "Please enter a domain name, not an IP address.";
  if (host.length > 253) return "That domain name is too long.";
  const labels = host.split(".");
  if (labels.length < 2) return "Please enter a full domain, like yourbusiness.com.";
  if (!labels.every((l) => LABEL.test(l))) return "That doesn't look like a valid domain name.";
  const tld = labels[labels.length - 1];
  if (!TLD.test(tld)) return "That doesn't look like a valid domain name.";
  if (RESERVED_TLDS.has(tld)) return "That's a private or reserved name, so there's nothing public to check.";
  return null;
}

/* Turns what a visitor typed ("https://www.Shop.com/about", "shop.com") into a bare hostname. */
export function normalizeDomain(input) {
  const raw = (typeof input === "string" ? input : "").trim();
  if (!raw) return { error: "Please enter your website's domain, like yourbusiness.com." };
  if (raw.length > 300) return { error: "That domain name is too long." };
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { error: "That doesn't look like a valid domain name." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { error: "Please enter a website address (http or https)." };
  if (url.username || url.password) return { error: "Please enter just the domain, without a username or password." };
  if (url.port) return { error: "Please enter just the domain, without a port number." };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const problem = hostnameProblem(host);
  return problem ? { error: problem } : { host };
}

/* ---------------------------------------------------------------- network */

export class Ctx {
  constructor(userAgent) {
    this.userAgent = userAgent;
    this.subrequests = 0;
    this.resolved = new Map(); // host -> Promise<{ok, ips?, reason?}>
  }
  /* Counts one outgoing request. Returns false once the budget is spent; callers then
     treat that request as failed, so the report degrades ("not checked") instead of erroring. */
  budget() {
    if (this.subrequests >= SCAN.maxSubrequests) return false;
    this.subrequests++;
    return true;
  }
}

export async function doh(ctx, name, type) {
  if (!ctx.budget()) throw new Error("request budget spent");
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`;
  const t = timeoutSignal(SCAN.dnsTimeoutMs);
  let out;
  try {
    const res = await fetch(url, { headers: { Accept: "application/dns-json" }, signal: t.signal });
    if (!res.ok) throw new Error(`DoH ${res.status}`);
    out = await res.json();
  } finally {
    t.done();
  }
  return { status: out.Status, ad: out.AD === true, answers: Array.isArray(out.Answer) ? out.Answer : [] };
}

/* Resolves A + AAAA and accepts the host only if EVERY address is public. */
export function resolvePublic(ctx, host) {
  if (!ctx.resolved.has(host)) {
    ctx.resolved.set(host, (async () => {
      const problem = hostnameProblem(host);
      if (problem) return { ok: false, reason: "name" };
      let a;
      let aaaa;
      try {
        [a, aaaa] = await Promise.all([doh(ctx, host, "A"), doh(ctx, host, "AAAA")]);
      } catch (err) {
        if (err instanceof ScanError) throw err;
        return { ok: false, reason: "dns" };
      }
      const ips = [...a.answers, ...aaaa.answers].filter((r) => r.type === 1 || r.type === 28).map((r) => String(r.data));
      if (!ips.length) return { ok: false, reason: "nxdomain" };
      if (ips.some((ip) => !isPublicIP(ip))) return { ok: false, reason: "private" };
      return { ok: true, ips };
    })());
  }
  return ctx.resolved.get(host);
}

/* Validates a URL we are about to request. Returns null if safe, or a reason. */
export async function urlProblem(ctx, url) {
  if (url.protocol !== "https:" && url.protocol !== "http:") return "scheme";
  if (url.username || url.password) return "credentials";
  if (url.port) return "port";
  const r = await resolvePublic(ctx, url.hostname.toLowerCase().replace(/\.$/, ""));
  return r.ok ? null : r.reason;
}

/* One GET, no automatic redirects, after the SSRF check. */
export async function safeGet(ctx, url) {
  const problem = await urlProblem(ctx, url);
  if (problem) return { blocked: problem };
  if (!ctx.budget()) return { failed: true };
  // The timer also covers reading the body (readPrefix), so a slow-drip server can't stall us.
  const t = timeoutSignal(SCAN.timeoutMs);
  try {
    const res = await fetch(url.href, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": ctx.userAgent, Accept: "text/html,*/*;q=0.8" },
      signal: t.signal,
    });
    return { res, done: t.done };
  } catch {
    t.done();
    return { failed: true };
  }
}

/* Abort after ms. A plain timer (not AbortSignal.timeout) so it behaves the same in every runtime. */
export function timeoutSignal(ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(new Error("timeout")), ms);
  ctl.signal.addEventListener("abort", () => clearTimeout(t), { once: true });
  return { signal: ctl.signal, done: () => clearTimeout(t) };
}

export const discard = (res) => res?.body?.cancel?.().catch(() => {});

/* Reads at most n bytes of the body, then stops downloading. */
export async function readPrefix(res, n = SCAN.maxReadBytes) {
  if (!res.body) return new Uint8Array(0);
  const reader = res.body.getReader();
  const out = new Uint8Array(n);
  let len = 0;
  try {
    while (len < n) {
      const { done, value } = await reader.read();
      if (done) break;
      const take = Math.min(value.byteLength, n - len);
      out.set(value.subarray(0, take), len);
      len += take;
    }
  } catch {
    /* timeout or reset: use what we have */
  } finally {
    reader.cancel().catch(() => {});
  }
  return out.subarray(0, len);
}

/* GET with manual redirect following; each hop is re-validated against the SSRF rules. */
export async function getFollowing(ctx, startUrl) {
  let url = new URL(startUrl);
  const chain = [url.href];
  for (let hop = 0; hop <= SCAN.maxRedirects; hop++) {
    const r = await safeGet(ctx, url);
    if (r.blocked || r.failed) return { ...r, chain, url };
    const { res } = r;
    const loc = res.headers.get("Location");
    if (res.status >= 300 && res.status < 400 && loc) {
      discard(res);
      r.done();
      let next;
      try {
        next = new URL(loc, url);
      } catch {
        return { res, done: r.done, chain, url };
      }
      if (hop === SCAN.maxRedirects) return { tooManyRedirects: true, chain, url };
      url = next;
      chain.push(url.href);
      continue;
    }
    return { res, done: r.done, chain, url };
  }
  return { tooManyRedirects: true, chain, url };
}

/* TXT records for a name, joined per record; null if the lookup failed. */
export async function txtRecords(ctx, name) {
  try {
    const r = await doh(ctx, name, "TXT");
    return r.answers.filter((a) => a.type === 16).map((a) => {
      const parts = String(a.data).match(/"((?:[^"\\]|\\.)*)"/g);
      return parts ? parts.map((p) => p.slice(1, -1)).join("") : String(a.data);
    });
  } catch (err) {
    if (err instanceof ScanError) throw err;
    return null;
  }
}

/* Any DNS record type; returns { answers, ad } or null on failure. */
export async function dnsQuery(ctx, name, type) {
  try {
    return await doh(ctx, name, type);
  } catch (err) {
    if (err instanceof ScanError) throw err;
    return null;
  }
}

/* GET/POST a FIXED, trusted public API (vulnerability database, RDAP, CT logs).
   Never used with a visitor-supplied URL. Returns parsed JSON or null. */
export async function apiJson(ctx, url, init = {}) {
  if (!ctx.budget()) return null;
  const t = timeoutSignal(SCAN.apiTimeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      headers: { Accept: "application/json", "User-Agent": ctx.userAgent, ...(init.headers || {}) },
      signal: t.signal,
    });
    if (!res.ok) {
      discard(res);
      return null;
    }
    const bytes = await readPrefix(res, 512 * 1024);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  } finally {
    t.done();
  }
}

export const ascii = (b) => new TextDecoder("utf-8", { fatal: false }).decode(b);
export const clip = (v, n = 160) => String(v ?? "").replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, n);

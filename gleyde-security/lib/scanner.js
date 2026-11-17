/* Passive website security check.

   What it does (and ONLY this):
     - DNS lookups over HTTPS (A, AAAA, TXT for SPF, TXT for DMARC) via Cloudflare's resolver
     - GET the home page over https:// (following up to 4 redirects) and http://
     - GET a short, fixed list of well-known file paths that are commonly left exposed,
       reading at most 4 KB of each to confirm what it is; contents are never returned
     - GET /.well-known/security.txt
   No logins, no form submissions, no query strings, no payloads, no port scanning.

   SSRF protection: every hostname we connect to (including every redirect hop) must be a
   syntactically public domain name whose every A/AAAA record is a public IP. IP literals,
   non-default ports, credentials in URLs and private/reserved names are refused. */
import { isIPLiteral, isPublicIP } from "./ip.js";

export const SCAN = { timeoutMs: 6000, dnsTimeoutMs: 4000, maxRedirects: 4, maxReadBytes: 4096, maxSubrequests: 40 };

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
function hostnameProblem(host) {
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

class Ctx {
  constructor(userAgent) {
    this.userAgent = userAgent;
    this.subrequests = 0;
    this.resolved = new Map(); // host -> Promise<{ok, ips?, reason?}>
  }
  budget() {
    if (++this.subrequests > SCAN.maxSubrequests) throw new ScanError("budget", "Too many requests needed.");
  }
}

async function doh(ctx, name, type) {
  ctx.budget();
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
  return { status: out.Status, answers: Array.isArray(out.Answer) ? out.Answer : [] };
}

/* Resolves A + AAAA and accepts the host only if EVERY address is public. */
function resolvePublic(ctx, host) {
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
async function urlProblem(ctx, url) {
  if (url.protocol !== "https:" && url.protocol !== "http:") return "scheme";
  if (url.username || url.password) return "credentials";
  if (url.port) return "port";
  const r = await resolvePublic(ctx, url.hostname.toLowerCase().replace(/\.$/, ""));
  return r.ok ? null : r.reason;
}

/* One GET, no automatic redirects, after the SSRF check. */
async function safeGet(ctx, url) {
  const problem = await urlProblem(ctx, url);
  if (problem) return { blocked: problem };
  ctx.budget();
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
function timeoutSignal(ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(new Error("timeout")), ms);
  ctl.signal.addEventListener("abort", () => clearTimeout(t), { once: true });
  return { signal: ctl.signal, done: () => clearTimeout(t) };
}

const discard = (res) => res?.body?.cancel?.().catch(() => {});

/* Reads at most n bytes of the body, then stops downloading. */
async function readPrefix(res, n = SCAN.maxReadBytes) {
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
async function getFollowing(ctx, startUrl) {
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

/* ---------------------------------------------------------------- checks */

const clip = (v, n = 160) => String(v ?? "").replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, n);

function check(id, title, max, status, detail, fix = "") {
  const points = status === "pass" ? max : status === "warn" ? Math.round(max / 2) : 0;
  return { id, title, status, detail, fix, points, max: status === "skip" || status === "info" ? 0 : max };
}

function headerChecks(h, skipReason) {
  if (skipReason) {
    const no = (id, title, max) => check(id, title, max, "fail", skipReason, "Fix HTTPS first; then these protections can be added.");
    return [
      no("csp", "Content Security Policy", 10), no("clickjacking", "Clickjacking protection", 7),
      no("nosniff", "MIME-sniffing protection", 5), no("referrer", "Referrer policy", 4),
      no("permissions", "Permissions policy", 3), check("disclosure", "Software version hidden", 4, "skip", skipReason),
    ];
  }
  const out = [];

  const csp = h.get("content-security-policy");
  const cspRO = h.get("content-security-policy-report-only");
  if (csp) {
    const script = (/(?:^|;)\s*script-src([^;]*)/i.exec(csp) || /(?:^|;)\s*default-src([^;]*)/i.exec(csp) || [])[1] || "";
    const weak = /'unsafe-inline'/i.test(script) && !/'(nonce|sha(256|384|512))-/i.test(script);
    out.push(weak
      ? check("csp", "Content Security Policy", 10, "warn",
          "You have a Content Security Policy, but it allows inline scripts ('unsafe-inline'), which removes most of its protection against injected code.",
          "Move inline scripts into separate files (or use nonces) and remove 'unsafe-inline' from script-src.")
      : check("csp", "Content Security Policy", 10, "pass", "A Content Security Policy limits which scripts can run, which blocks most code-injection (XSS) attacks."));
  } else if (cspRO) {
    out.push(check("csp", "Content Security Policy", 10, "warn",
      "You have a Content Security Policy in report-only mode, so it reports problems but doesn't block anything yet.",
      "Once reports look clean, switch the header from Content-Security-Policy-Report-Only to Content-Security-Policy."));
  } else {
    out.push(check("csp", "Content Security Policy", 10, "fail",
      "There's no Content Security Policy, so if an attacker manages to inject code into a page, browsers will run it.",
      "Add a Content-Security-Policy header. Start with: default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self' and adjust for the services your site uses."));
  }

  const xfo = (h.get("x-frame-options") || "").toUpperCase();
  const fa = csp && /frame-ancestors/i.test(csp);
  out.push(xfo === "DENY" || xfo === "SAMEORIGIN" || fa
    ? check("clickjacking", "Clickjacking protection", 7, "pass", "Other websites can't secretly load your pages in a frame to trick visitors into clicking.")
    : check("clickjacking", "Clickjacking protection", 7, "fail",
        "Other websites can load your pages inside a hidden frame and trick visitors into clicking buttons (clickjacking).",
        "Add the header X-Frame-Options: DENY (or SAMEORIGIN), or frame-ancestors 'none' in your CSP."));

  out.push((h.get("x-content-type-options") || "").toLowerCase().trim() === "nosniff"
    ? check("nosniff", "MIME-sniffing protection", 5, "pass", "Browsers are told not to guess file types, which closes a class of upload and script tricks.")
    : check("nosniff", "MIME-sniffing protection", 5, "fail",
        "Browsers may guess a file's type and run a file as a script when it shouldn't be.",
        "Add the header X-Content-Type-Options: nosniff."));

  const rp = (h.get("referrer-policy") || "").toLowerCase();
  out.push(!rp
    ? check("referrer", "Referrer policy", 4, "fail",
        "Without a referrer policy, the full address of your pages (which can include private details) may be sent to other sites.",
        "Add the header Referrer-Policy: strict-origin-when-cross-origin.")
    : /unsafe-url|no-referrer-when-downgrade/.test(rp)
      ? check("referrer", "Referrer policy", 4, "warn", `Your referrer policy ("${clip(rp, 60)}") still shares full page addresses with other sites.`,
          "Change it to Referrer-Policy: strict-origin-when-cross-origin.")
      : check("referrer", "Referrer policy", 4, "pass", "Your site limits what page information is shared with other websites."));

  out.push(h.get("permissions-policy")
    ? check("permissions", "Permissions policy", 3, "pass", "Your site restricts access to features like the camera, microphone and location.")
    : check("permissions", "Permissions policy", 3, "fail",
        "There's no permissions policy, so any script on your site could ask for the camera, microphone or location.",
        "Add a Permissions-Policy header, for example: camera=(), microphone=(), geolocation=()."));

  const server = h.get("server") || "";
  const powered = h.get("x-powered-by") || h.get("x-aspnet-version") || h.get("x-generator") || "";
  const leak = /\d/.test(server) ? `Server: ${clip(server, 60)}` : powered ? `X-Powered-By: ${clip(powered, 60)}` : "";
  out.push(leak
    ? check("disclosure", "Software version hidden", 4, "fail",
        `Your server announces its software and version (${leak}). That helps attackers look up known weaknesses.`,
        "Turn off version banners (for example server_tokens off in nginx, ServerTokens Prod in Apache, expose_php = Off in PHP).")
    : check("disclosure", "Software version hidden", 4, "pass", "Your server doesn't advertise its software version."));
  return out;
}

const txtData = (answers) =>
  answers.filter((r) => r.type === 16).map((r) => {
    const parts = String(r.data).match(/"((?:[^"\\]|\\.)*)"/g);
    return parts ? parts.map((p) => p.slice(1, -1)).join("") : String(r.data);
  });

function spfCheck(txt, domain) {
  if (txt === null) return check("spf", "SPF (email sender list)", 9, "skip", "We couldn't look up your DNS records right now.");
  const spf = txt.filter((t) => /^v=spf1(\s|$)/i.test(t.trim()));
  if (!spf.length) {
    return check("spf", "SPF (email sender list)", 9, "fail",
      `${domain} has no SPF record, so anyone can send email that claims to come from your domain.`,
      "Add a TXT record listing who sends your email, e.g. v=spf1 include:_spf.google.com ~all (your email provider gives you the exact value).");
  }
  if (spf.length > 1) {
    return check("spf", "SPF (email sender list)", 9, "fail",
      `${domain} has ${spf.length} SPF records. Only one is allowed, so receiving servers may ignore all of them.`,
      "Merge them into a single v=spf1 record.");
  }
  const rec = spf[0];
  if (/(^|\s)\+?all(\s|$)/i.test(rec) && !/[~?-]all/i.test(rec)) {
    return check("spf", "SPF (email sender list)", 9, "fail",
      "Your SPF record ends in +all, which tells the world that any server may send email as you.",
      "Change the ending to ~all or -all.");
  }
  if (/[~-]all/i.test(rec) || /redirect=/i.test(rec)) {
    return check("spf", "SPF (email sender list)", 9, "pass", "Your SPF record tells email providers which servers may send email for your domain.");
  }
  return check("spf", "SPF (email sender list)", 9, "warn",
    "Your SPF record doesn't end in ~all or -all, so it doesn't actually tell providers to distrust other senders.",
    "End the record with ~all (or -all once you're confident it's complete).");
}

function dmarcCheck(txt, domain) {
  if (txt === null) return check("dmarc", "DMARC (email spoofing policy)", 10, "skip", "We couldn't look up your DNS records right now.");
  const rec = txt.find((t) => /^v=DMARC1/i.test(t.trim()));
  if (!rec) {
    return check("dmarc", "DMARC (email spoofing policy)", 10, "fail",
      `${domain} has no DMARC policy, so scammers can send convincing fake emails "from" your business to your clients.`,
      `Add a TXT record at _dmarc.${domain}: v=DMARC1; p=quarantine; rua=mailto:you@${domain} (start with p=none for a few weeks if you're unsure).`);
  }
  const p = (/(?:^|;)\s*p\s*=\s*(\w+)/i.exec(rec) || [])[1]?.toLowerCase();
  if (p === "reject" || p === "quarantine") {
    return check("dmarc", "DMARC (email spoofing policy)", 10, "pass", `Your DMARC policy (p=${p}) tells email providers to block or junk fake emails using your domain.`);
  }
  return check("dmarc", "DMARC (email spoofing policy)", 10, "warn",
    "You have DMARC, but it's set to p=none: fake emails are reported but still delivered.",
    "Once your reports show your real email passes, change it to p=quarantine, then p=reject.");
}

/* Well-known files that should never be public. A file only counts as exposed when its
   content matches what that file really looks like (so "200 OK" error pages don't count). */
const ascii = (b) => new TextDecoder("utf-8", { fatal: false }).decode(b);
const notHtml = (t) => !/<html|<!doctype/i.test(t);
export const EXPOSED_FILES = [
  { path: "/.env", risk: "an environment file, which usually holds passwords and API keys",
    match: (b) => { const t = ascii(b); return notHtml(t) && /^\s*[A-Z][A-Z0-9_]{2,}\s*=/m.test(t); } },
  { path: "/.git/HEAD", risk: "part of your source-code history (.git), which can let anyone download your site's code",
    match: (b) => /^(ref: refs\/|[0-9a-f]{40}\s*$)/.test(ascii(b)) },
  { path: "/.git/config", risk: "your Git configuration, which can reveal repository addresses and credentials",
    match: (b) => /^\s*\[core\]/m.test(ascii(b)) },
  { path: "/wp-config.php.bak", risk: "a WordPress config backup containing your database password",
    match: (b) => /DB_PASSWORD|DB_NAME/.test(ascii(b)) },
  { path: "/wp-config.php~", risk: "a WordPress config backup containing your database password",
    match: (b) => /DB_PASSWORD|DB_NAME/.test(ascii(b)) },
  { path: "/backup.sql", risk: "a database backup, which may contain customer data",
    match: (b) => { const t = ascii(b); return notHtml(t) && /\b(CREATE TABLE|INSERT INTO)\b/i.test(t); } },
  { path: "/.htpasswd", risk: "a password file", match: (b) => { const t = ascii(b); return notHtml(t) && /^[^:\s<>]+:[^\s]{4,}$/m.test(t); } },
  { path: "/.DS_Store", risk: "a Mac folder index that lists hidden files on your server",
    match: (b) => b.length >= 8 && b[3] === 1 && b[4] === 0x42 && b[5] === 0x75 && b[6] === 0x64 && b[7] === 0x31 },
  { path: "/phpinfo.php", risk: "a PHP diagnostics page that reveals detailed server configuration",
    match: (b) => /phpinfo\(\)|<title>PHP \d/i.test(ascii(b)) },
  { path: "/server-status", risk: "the Apache status page, which shows live visitor requests",
    match: (b) => /Apache Server Status/i.test(ascii(b)) },
];

async function probeFile(ctx, origin, file) {
  const r = await safeGet(ctx, new URL(file.path, origin));
  if (!r.res) return false;
  try {
    if (r.res.status !== 200) {
      discard(r.res);
      return false;
    }
    return file.match(await readPrefix(r.res));
  } finally {
    r.done();
  }
}

async function securityTxt(ctx, origin) {
  const r = await safeGet(ctx, new URL("/.well-known/security.txt", origin));
  if (!r.res) return false;
  try {
    if (r.res.status !== 200) {
      discard(r.res);
      return false;
    }
    return /^\s*Contact:/im.test(ascii(await readPrefix(r.res)));
  } finally {
    r.done();
  }
}

/* ---------------------------------------------------------------- scan */

export async function runScan(host, { userAgent = "GleydeSecurityCheck/1.0 (passive)" } = {}) {
  const ctx = new Ctx(userAgent);

  const first = await resolvePublic(ctx, host);
  if (!first.ok) {
    if (first.reason === "private") {
      throw new ScanError("private", "That domain points to a private or internal network address, so we don't check it.");
    }
    if (first.reason === "nxdomain") throw new ScanError("nxdomain", "We couldn't find that domain. Please check the spelling.");
    throw new ScanError("dns", "We couldn't look up that domain right now. Please try again in a minute.");
  }

  const emailDomain = host.startsWith("www.") ? host.slice(4) : host;
  const txtOrNull = (name) => doh(ctx, name, "TXT").then((r) => txtData(r.answers)).catch((err) => {
    if (err instanceof ScanError) throw err;
    return null;
  });

  const [https, http, spfTxt, dmarcTxt] = await Promise.all([
    getFollowing(ctx, `https://${host}/`),
    safeGet(ctx, new URL(`http://${host}/`)),
    txtOrNull(emailDomain),
    txtOrNull(`_dmarc.${emailDomain}`),
  ]);

  const httpsOk = Boolean(https.res) && https.url.protocol === "https:";
  const finalUrl = https.res ? https.url.href : null;
  const origin = httpsOk ? https.url.origin : null;
  const headers = https.res?.headers;
  if (https.res) {
    discard(https.res);
    https.done?.();
  }

  /* HTTPS section */
  const tls = [];
  if (httpsOk) {
    tls.push(check("https", "HTTPS encryption", 15, "pass", "Your site loads over HTTPS, so information visitors send is encrypted."));
  } else {
    const why = https.tooManyRedirects ? "it redirects too many times"
      : https.blocked ? "a redirect points somewhere we don't follow (a private address or non-standard port)"
      : https.res ? "its https:// address sends visitors to an insecure http:// page"
      : "the server didn't answer on https://, or its certificate isn't trusted";
    tls.push(check("https", "HTTPS encryption", 15, "fail",
      `We couldn't load your site securely over HTTPS: ${why}. Visitors' information may be sent unencrypted, and browsers show "Not secure".`,
      "Install a free certificate (for example with Cloudflare or Let's Encrypt), set it to renew automatically, and make sure https:// loads your site."));
  }

  if (http.res) {
    const loc = http.res.headers.get("Location") || "";
    discard(http.res);
    http.done?.();
    const redirects = http.res.status >= 300 && http.res.status < 400 && /^https:\/\//i.test(loc);
    tls.push(redirects
      ? check("redirect", "HTTP to HTTPS redirect", 8, "pass", "Visitors who type http:// are sent to the secure https:// version.")
      : check("redirect", "HTTP to HTTPS redirect", 8, "fail",
          "Your site also loads on plain http:// without redirecting, so some visitors get an unencrypted page.",
          "Turn on \"Always Use HTTPS\" in Cloudflare, or add a permanent (301) redirect from http:// to https://."));
  } else {
    tls.push(check("redirect", "HTTP to HTTPS redirect", 8, "pass", "Plain http:// doesn't serve your site, so nobody lands on an unencrypted page."));
  }

  const hsts = httpsOk ? headers.get("strict-transport-security") : null;
  const maxAge = Number((/max-age\s*=\s*"?(\d+)/i.exec(hsts || "") || [])[1] || 0);
  tls.push(!httpsOk
    ? check("hsts", "HSTS (always use HTTPS)", 10, "fail", "Couldn't be checked because the site didn't load over HTTPS.", "Fix HTTPS first, then add Strict-Transport-Security.")
    : !hsts
      ? check("hsts", "HSTS (always use HTTPS)", 10, "fail",
          "Browsers aren't told to always use HTTPS, so a visitor on public Wi-Fi can be quietly downgraded to an insecure connection.",
          "Add the header Strict-Transport-Security: max-age=31536000; includeSubDomains.")
      : maxAge < 15552000
        ? check("hsts", "HSTS (always use HTTPS)", 10, "warn", `HSTS is on, but only for ${maxAge >= 86400 ? `${Math.round(maxAge / 86400)} day${Math.round(maxAge / 86400) === 1 ? "" : "s"}` : `${maxAge} seconds`}, which is shorter than recommended.`,
            "Raise it to at least six months: max-age=31536000.")
        : check("hsts", "HSTS (always use HTTPS)", 10, "pass", "Browsers remember to always use HTTPS for your site, even if someone types http://."));

  /* Headers section */
  const hdrs = headerChecks(headers, httpsOk ? null : "Couldn't be checked because the site didn't load over HTTPS.");

  /* Email section */
  const email = [spfCheck(spfTxt, emailDomain), dmarcCheck(dmarcTxt, emailDomain)];

  /* Exposed files section */
  const files = [];
  if (origin) {
    const [found, hasSecTxt] = await Promise.all([
      Promise.all(EXPOSED_FILES.map((f) => probeFile(ctx, origin, f).then((hit) => (hit ? f : null)))).then((r) => r.filter(Boolean)),
      securityTxt(ctx, origin),
    ]);
    files.push(found.length
      ? check("exposed", "Sensitive files exposed", 15, "fail",
          `Anyone can download ${found.map((f) => `${f.path} (${f.risk})`).join("; ")}.`,
          "Remove these files from your web server or block access to them today. Then change any passwords or keys they contained, and assume they have already been copied.")
      : check("exposed", "Sensitive files exposed", 15, "pass",
          `None of the ${EXPOSED_FILES.length} files most often left exposed by mistake (like .env, .git and config backups) are publicly reachable.`));
    files[0].found = found.map((f) => f.path);
    files.push(hasSecTxt
      ? check("securitytxt", "security.txt contact", 0, "info", "You publish a security.txt file, so researchers know how to report problems to you.")
      : check("securitytxt", "security.txt contact", 0, "info", "Optional: you don't publish a security.txt file telling researchers how to report problems.",
          "Add /.well-known/security.txt with a Contact: line (see securitytxt.org)."));
  } else {
    files.push(check("exposed", "Sensitive files exposed", 15, "skip", "Couldn't be checked because the site didn't load over HTTPS."));
  }

  /* Score */
  const all = [...tls, ...hdrs, ...email, ...files];
  const max = all.reduce((s, c) => s + c.max, 0);
  let score = max ? Math.round((all.reduce((s, c) => s + c.points, 0) / max) * 100) : 0;
  const exposed = files[0]?.status === "fail";
  if (exposed) score = Math.min(score, 40); // an exposed secret file outweighs everything else
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  const count = (s) => all.filter((c) => c.status === s).length;

  return {
    domain: host,
    checkedUrl: finalUrl,
    emailDomain,
    scannedAt: new Date().toISOString(),
    score,
    grade,
    summary: { pass: count("pass"), warn: count("warn"), fail: count("fail") },
    headline: exposed ? "Urgent: sensitive files are publicly exposed." : grade === "A" ? "Strong public security setup." : grade === "B" ? "Good, with a few gaps to close." : "Several important protections are missing.",
    sections: [
      { id: "https", title: "HTTPS & encryption", checks: tls },
      { id: "headers", title: "Browser security headers", checks: hdrs },
      { id: "email", title: `Email protection for ${emailDomain}`, checks: email },
      { id: "files", title: "Exposed files", checks: files },
    ],
    disclaimer: "This free check only looks at public information, the same way a browser or email provider does. It can't see inside your site, logins, plugins or server, so it isn't a full security audit.",
  };
}

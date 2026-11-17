/* Tests for the free Website Security Check (lib/scanner.js + functions/api/scan.js).
   The internet is simulated: DNS-over-HTTPS answers and websites come from tables below,
   and every outgoing request is recorded so we can prove what was (and wasn't) contacted. */
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { onRequest, onRequestPost } from "../functions/api/scan.js";
import { isPublicIP } from "../lib/ip.js";
import { _resetRateLimitMemory } from "../lib/ratelimit.js";
import { EXPOSED_FILES, SCAN, ScanError, normalizeDomain, runScan } from "../lib/scanner.js";

/* ------------------------------------------------------------ fake internet */
let dns; // name -> { A: [], AAAA: [], TXT: [] }
let sites; // "https://host/path" -> { status, headers, body } | (signal) => Promise<Response>
let requests;
let apis; // hostname -> (url, init) => Response, for the fixed public APIs
const API_HOSTS = new Set(["api.osv.dev", "api.wordpress.org", "rdap.org", "api.certspotter.com", "safebrowsing.googleapis.com"]);

const GOOD_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=()",
  Server: "cloudflare",
};

function installInternet() {
  dns = {};
  sites = {};
  requests = [];
  apis = {};
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.hostname === "cloudflare-dns.com") {
      const name = url.searchParams.get("name");
      const type = url.searchParams.get("type");
      requests.push({ dns: `${type} ${name}` });
      const rec = dns[name];
      const code = { A: 1, AAAA: 28, TXT: 16, MX: 15, DS: 43, CAA: 257 }[type];
      const Answer = (rec?.[type] || []).map((data) => ({ name, type: code, data: type === "TXT" ? `"${data}"` : data }));
      return Response.json({ Status: rec ? 0 : 3, Answer });
    }
    if (url.hostname === "challenges.cloudflare.com") {
      return Response.json({ success: true, action: "scan", hostname: "site.test" });
    }
    if (API_HOSTS.has(url.hostname)) {
      requests.push({ api: url.hostname, method: init.method || "GET", body: init.body });
      const fake = apis[url.hostname];
      if (typeof fake === "function") return fake(url, init);
      return new Response("unavailable", { status: 503 });
    }
    requests.push({ method: init.method || "GET", url: url.href, ua: init.headers?.["User-Agent"], redirect: init.redirect });
    const key = url.origin + url.pathname;
    const s = sites[key];
    if (typeof s === "function") return s(init.signal);
    if (!s) return new Response("<!doctype html><title>Not found</title>", { status: 404, headers: { "Content-Type": "text/html" } });
    return new Response(s.body ?? "<!doctype html><html>ok</html>", { status: s.status ?? 200, headers: s.headers ?? {} });
  };
}

function publicSite(host, { headers = GOOD_HEADERS, ip = "93.184.216.34", spf = "v=spf1 include:_spf.google.com ~all", dmarc = "v=DMARC1; p=reject", mx = "1 aspmx.l.google.com.", dkim = true, ds = true } = {}) {
  const apex = host.split(".").slice(-2).join(".");
  dns[host] = { ...(dns[host] || {}), A: [ip], AAAA: [] };
  dns[apex] = { A: [ip], ...(dns[apex] || {}), TXT: spf ? [spf] : [], MX: mx ? [mx] : [], DS: ds ? ["2371 13 2 ABCDEF"] : [] };
  dns[`_dmarc.${apex}`] = { TXT: dmarc ? [dmarc] : [] };
  if (dkim) dns[`google._domainkey.${apex}`] = { TXT: ["v=DKIM1; k=rsa; p=MIIBIjANBg"] };
  sites[`https://${host}/`] = { headers };
  sites[`http://${host}/`] = { status: 301, headers: { Location: `https://${host}/` } };
}

const sec = (r, id) => r.sections.find((x) => x.id === id);
const byId = (r) => Object.fromEntries(r.sections.flatMap((x) => x.checks).map((c) => [c.id, c]));
const fetchedUrls = () => requests.filter((r) => r.url).map((r) => r.url);

beforeEach(() => {
  _resetRateLimitMemory();
  installInternet();
  SCAN.timeoutMs = 6000;
});

/* ------------------------------------------------------------ input validation */
describe("Domain input validation", () => {
  for (const [input, host] of [
    ["Example.COM", "example.com"],
    ["https://www.example.com/about?x=<script>", "www.example.com"],
    ["  shop.example.co.uk.  ", "shop.example.co.uk"],
    ["http://example.com", "example.com"],
    ["bücher.com", "xn--bcher-kva.com"],
  ]) {
    test(`accepts ${JSON.stringify(input)} -> ${host}`, () => assert.deepEqual(normalizeDomain(input), { host }));
  }

  const rejects = [
    "", "   ", "localhost", "127.0.0.1", "2130706433", "0x7f.0.0.1", "127.1", "0177.0.0.1", "[::1]",
    "http://[::ffff:127.0.0.1]/", "169.254.169.254", "example.com:8080", "https://example.com:443x",
    "user:pass@example.com", "intranet", "printer.local", "metadata.google.internal", "db.corp",
    "router.home.arpa", "ftp://example.com", "javascript:alert(1)", "file:///etc/passwd", "gopher://example.com",
    "a".repeat(301), "exa_mple.com", "-bad.com", "bad-.com", "example.123", "<script>alert(1)</script>.com",
    "example.com\r\nHost: evil", { toString: () => "example.com" }, ["example.com"], 42,
  ];
  for (const input of rejects) {
    test(`rejects ${JSON.stringify(input)?.slice(0, 40) ?? String(input)}`, () => {
      const r = normalizeDomain(input);
      assert.ok(r.error && !r.host, JSON.stringify(r));
    });
  }
});

describe("Private/reserved IP classification", () => {
  const priv = [
    "0.0.0.0", "10.1.2.3", "100.64.0.1", "127.0.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255",
    "192.0.0.1", "192.0.2.1", "192.168.1.1", "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1",
    "255.255.255.255", "::", "::1", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "::ffff:10.0.0.1",
    "::ffff:127.0.0.1", "64:ff9b::a00:1", "64:ff9b::127.0.0.1", "2001:db8::1", "2002:a00:1::1", "2001::1",
    "::127.0.0.1", "not-an-ip", "", "1.2.3", "256.1.1.1",
  ];
  const pub = ["93.184.216.34", "1.1.1.1", "8.8.8.8", "172.32.0.1", "2606:4700:4700::1111", "2a00:1450:4001::200e", "::ffff:8.8.8.8", "64:ff9b::808:808"];
  for (const ip of priv) test(`${ip || "(empty)"} is NOT public`, () => assert.equal(isPublicIP(ip), false));
  for (const ip of pub) test(`${ip} is public`, () => assert.equal(isPublicIP(ip), true));
});

/* ------------------------------------------------------------ SSRF */
describe("SSRF protection", () => {
  for (const [label, rec] of [
    ["loopback", { A: ["127.0.0.1"] }],
    ["cloud metadata", { A: ["169.254.169.254"] }],
    ["RFC1918", { A: ["10.0.0.5"] }],
    ["IPv6 loopback", { AAAA: ["::1"] }],
    ["IPv6 unique-local", { AAAA: ["fd00::1"] }],
    ["IPv4-mapped private", { AAAA: ["::ffff:192.168.0.1"] }],
    ["NAT64-wrapped private", { AAAA: ["64:ff9b::a00:1"] }],
    ["mixed public + private records", { A: ["93.184.216.34", "10.0.0.1"] }],
    ["public A + private AAAA", { A: ["93.184.216.34"], AAAA: ["fe80::1"] }],
  ]) {
    test(`domain resolving to ${label} is refused before any connection`, async () => {
      dns["evil.example.com"] = rec;
      await assert.rejects(runScan("evil.example.com"), (e) => e instanceof ScanError && e.code === "private");
      assert.deepEqual(fetchedUrls(), [], "no request reached the target");
    });
  }

  for (const [label, location, setup] of [
    ["cloud metadata IP", "http://169.254.169.254/latest/meta-data/"],
    ["loopback IP", "http://127.0.0.1/admin"],
    ["IPv6 loopback", "http://[::1]/"],
    ["localhost name", "http://localhost/"],
    ["internal TLD", "https://db.internal/"],
    ["public name that resolves privately", "https://intranet.example.org/", () => { dns["intranet.example.org"] = { A: ["192.168.1.10"] }; }],
    ["non-standard port", "https://shop.example.com:8443/"],
    ["credentials in URL", "https://admin:pw@shop.example.com/"],
    ["file scheme", "file:///etc/passwd"],
    ["decimal IP", "http://2130706433/"],
  ]) {
    test(`redirect to ${label} is not followed`, async () => {
      setup?.();
      publicSite("shop.example.com");
      sites["https://shop.example.com/"] = { status: 302, headers: { Location: location } };
      const report = await runScan("shop.example.com");
      const urls = fetchedUrls();
      assert.ok(urls.every((u) => new URL(u).hostname === "shop.example.com" && !new URL(u).port), `fetched: ${urls}`);
      assert.equal(report.sections[0].checks[0].status, "fail");
      assert.ok(!urls.some((u) => u.includes(":8443") || u.includes("admin:")));
    });
  }

  test("redirects to another public host ARE followed, and that host is DNS-checked too", async () => {
    publicSite("example.com");
    publicSite("www.example.com");
    sites["https://example.com/"] = { status: 301, headers: { Location: "https://www.example.com/" } };
    const report = await runScan("example.com");
    assert.equal(report.checkedUrl, "https://www.example.com/");
    assert.ok(requests.some((r) => r.dns === "A www.example.com"));
  });

  test("redirect loops stop after 4 hops", async () => {
    publicSite("loop.example.com");
    sites["https://loop.example.com/"] = { status: 302, headers: { Location: "https://loop.example.com/" } };
    const report = await runScan("loop.example.com");
    assert.equal(report.sections[0].checks[0].status, "fail");
    assert.ok(fetchedUrls().filter((u) => u === "https://loop.example.com/").length <= SCAN.maxRedirects + 1);
  });

  test("unknown domain gives a friendly error and contacts nothing", async () => {
    await assert.rejects(runScan("no-such-site-xyz.com"), (e) => e.code === "nxdomain");
    assert.deepEqual(fetchedUrls(), []);
  });
});

/* ------------------------------------------------------------ passive-only */
describe("Passive checks only", () => {
  test("only GET requests, no query strings, no payloads, fixed paths, identified user agent", async () => {
    publicSite("example.com");
    await runScan("example.com", { userAgent: "GleydeSecurityCheck/1.0 (passive; +https://site.test/security-check)" });
    const allowed = new Set(["/", ...EXPOSED_FILES.map((f) => f.path), "/.well-known/security.txt"]);
    for (const r of requests.filter((x) => x.url)) {
      const u = new URL(r.url);
      assert.equal(r.method, "GET");
      assert.equal(u.search, "");
      assert.equal(r.redirect, "manual");
      assert.ok(allowed.has(u.pathname), u.pathname);
      assert.match(r.ua, /^GleydeSecurityCheck\/1\.0 \(passive/);
    }
    assert.ok(requests.length <= SCAN.maxSubrequests);
  });

  test("reads at most 4 KB of any file, even a huge one", async () => {
    publicSite("example.com");
    let pulled = 0;
    sites["https://example.com/backup.sql"] = () => new Response(new ReadableStream({
      pull(c) { pulled++; c.enqueue(new TextEncoder().encode("INSERT INTO users VALUES (1);\n".repeat(200))); if (pulled > 5000) c.close(); },
    }), { status: 200 });
    const report = await runScan("example.com");
    assert.ok(pulled < 5, `pulled ${pulled} chunks`);
    assert.deepEqual(sec(report, "files").checks[0].found, ["/backup.sql"]);
  });

  test("a server that never answers times out instead of hanging the check", async () => {
    SCAN.timeoutMs = 50;
    publicSite("slow.example.com");
    sites["https://slow.example.com/"] = (signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
    const t = Date.now();
    const report = await runScan("slow.example.com");
    assert.ok(Date.now() - t < 2000);
    assert.equal(report.sections[0].checks[0].status, "fail");
  });
});

/* ------------------------------------------------------------ scoring */
describe("Report and scoring", () => {
  test("well-configured site scores A / 100", async () => {
    publicSite("example.com");
    sites["https://example.com/.well-known/security.txt"] = { body: "Contact: mailto:security@example.com" };
    const r = await runScan("example.com");
    assert.equal(r.score, 100);
    assert.equal(r.grade, "A");
    assert.equal(r.summary.fail, 0);
  });

  test("bare site scores F, and every failure has a plain-English fix", async () => {
    publicSite("bare.example.com", { headers: { Server: "Apache/2.4.41 (Ubuntu)", "X-Powered-By": "PHP/7.2" }, spf: null, dmarc: null });
    sites["http://bare.example.com/"] = { status: 200 };
    const r = await runScan("bare.example.com");
    assert.equal(r.grade, "F");
    const fails = r.sections.flatMap((s) => s.checks).filter((c) => c.status === "fail");
    assert.ok(fails.length >= 8);
    for (const c of fails) assert.ok(c.fix.length > 20, `${c.id} needs a fix`);
    assert.match(fails.find((c) => c.id === "disclosure").detail, /Apache\/2\.4\.41/);
  });

  test("exposed .env is flagged, caps the score, and its contents are never returned", async () => {
    publicSite("leaky.example.com");
    sites["https://leaky.example.com/.env"] = { body: "DB_PASSWORD=hunter2-super-secret\nSTRIPE_KEY=sk_live_abc" };
    sites["https://leaky.example.com/.git/HEAD"] = { body: "ref: refs/heads/main\n" };
    const r = await runScan("leaky.example.com");
    assert.ok(r.score <= 40);
    assert.equal(r.grade, "F");
    assert.deepEqual(sec(r, "files").checks[0].found, ["/.env", "/.git/HEAD"]);
    assert.ok(!JSON.stringify(r).includes("hunter2"), "secret content leaked into report");
    assert.match(r.headline, /Urgent/);
  });

  test("sites that answer 200 for every path (soft 404) are not falsely flagged", async () => {
    publicSite("spa.example.com");
    for (const f of EXPOSED_FILES) sites[`https://spa.example.com${f.path}`] = { body: "<!doctype html><html><body>Welcome</body></html>" };
    const r = await runScan("spa.example.com");
    assert.equal(sec(r, "files").checks[0].status, "pass");
  });

  test("SPF and DMARC variants", async () => {
    const cases = [
      ["v=spf1 -all", "v=DMARC1; p=quarantine", "pass", "pass"],
      ["v=spf1 include:x ?all", "v=DMARC1; p=none; rua=mailto:a@b.c", "warn", "warn"],
      ["v=spf1 +all", "v=DMARC1;p=reject", "fail", "pass"],
      [null, null, "fail", "fail"],
    ];
    for (const [i, [spf, dmarc, s, d]] of cases.entries()) {
      installInternet();
      publicSite(`m${i}.example.com`, { spf, dmarc });
      const c = byId(await runScan(`m${i}.example.com`));
      assert.deepEqual([c.spf.status, c.dmarc.status], [s, d], `case ${i}`);
    }
  });

  test("weak CSP and short HSTS are warnings, not passes", async () => {
    publicSite("weak.example.com", { headers: { ...GOOD_HEADERS, "Content-Security-Policy": "script-src 'self' 'unsafe-inline'", "Strict-Transport-Security": "max-age=300" } });
    const r = await runScan("weak.example.com");
    const all = Object.fromEntries(r.sections.flatMap((s) => s.checks).map((c) => [c.id, c.status]));
    assert.equal(all.csp, "warn");
    assert.equal(all.hsts, "warn");
  });

  test("hostile header values are clipped and stripped of control characters", async () => {
    publicSite("odd.example.com", { headers: { Server: `nginx/1.1<script>alert(1)</script>${"A".repeat(500)}` } });
    const r = await runScan("odd.example.com");
    const d = r.sections[1].checks.find((c) => c.id === "disclosure").detail;
    assert.ok(d.length < 300);
  });
});

/* ------------------------------------------------------------ API handler */
const ORIGIN = "https://site.test";
const kv = () => {
  const m = new Map();
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v) };
};
const env = (over = {}) => ({ TURNSTILE_SECRET_KEY: "live", RATE_LIMIT_SALT: "s", ...over });
let n = 0;
const req = (body, { ip = `198.51.100.${(n++ % 200) + 1}`, headers = {}, raw } = {}) =>
  new Request(`${ORIGIN}/api/scan`, {
    method: "POST",
    body: raw ?? JSON.stringify(body),
    headers: { "Content-Type": "application/json", Origin: ORIGIN, "CF-Connecting-IP": ip, ...headers },
  });
const ok = (domain = "example.com") => ({ domain, consent: true, "cf-turnstile-response": "tok" });

describe("POST /api/scan", () => {
  test("returns a report for a valid request", async () => {
    publicSite("example.com");
    const res = await onRequestPost({ request: req(ok()), env: env() });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.report.domain, "example.com");
    assert.equal(res.headers.get("X-Frame-Options"), "DENY");
  });

  test("private domain -> 422 with a plain message, nothing fetched", async () => {
    dns["sneaky.example.com"] = { A: ["169.254.169.254"] };
    const res = await onRequestPost({ request: req(ok("sneaky.example.com")), env: env() });
    assert.equal(res.status, 422);
    assert.match((await res.json()).error, /private or internal/);
    assert.deepEqual(fetchedUrls(), []);
  });

  test("IP address input is rejected before Turnstile or DNS", async () => {
    const res = await onRequestPost({ request: req(ok("169.254.169.254")), env: env() });
    assert.equal(res.status, 422);
    assert.equal(requests.length, 0);
  });

  test("consent and Turnstile are required", async () => {
    publicSite("example.com");
    assert.equal((await onRequestPost({ request: req({ ...ok(), consent: false }), env: env() })).status, 422);
    assert.equal((await onRequestPost({ request: req({ ...ok(), "cf-turnstile-response": "" }), env: env() })).status, 403);
    assert.deepEqual(fetchedUrls(), []);
  });

  test("cross-origin posts are refused", async () => {
    const res = await onRequestPost({ request: req(ok(), { headers: { Origin: "https://evil.test" } }), env: env() });
    assert.equal(res.status, 403);
  });

  test("oversized body -> 413; other methods -> 405", async () => {
    assert.equal((await onRequestPost({ request: req({ ...ok(), pad: "x".repeat(5000) }), env: env() })).status, 413);
    assert.equal(onRequest().status, 405);
  });

  test("visitor limit: 11th check in an hour from one IP is refused", async () => {
    const e = env();
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push((await onRequestPost({ request: req({ domain: "x" }, { ip: "203.0.113.9" }), env: e })).status);
    assert.equal(statuses.at(-1), 429);
    assert.equal(statuses.filter((s) => s === 429).length, 1);
  });

  test("target limit: one domain can't be scanned more than 3 times per 15 min (no cache)", async () => {
    publicSite("victim.example.com");
    const e = env();
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await onRequestPost({ request: req(ok("victim.example.com")), env: e })).status);
    assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
  });

  test("with KV, repeat checks are served from cache and never touch the target again", async () => {
    publicSite("example.com");
    const e = env({ RATE_LIMIT_KV: kv() });
    await onRequestPost({ request: req(ok()), env: e });
    const before = fetchedUrls().length;
    for (let i = 0; i < 5; i++) {
      const body = await (await onRequestPost({ request: req(ok("https://EXAMPLE.com/")), env: e })).json();
      assert.equal(body.cached, true);
    }
    assert.equal(fetchedUrls().length, before);
  });
});

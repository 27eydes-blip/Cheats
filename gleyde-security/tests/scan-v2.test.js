/* Deeper passive checks and the advice engine (report version 2). */
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { analyzeHtml } from "../lib/scan/html.js";
import { SCAN, runScan } from "../lib/scanner.js";
import { GOOD_HEADERS, checksById, healthyApis, installInternet, net, publicSite, targetUrls } from "./helpers/internet.js";

beforeEach(() => {
  installInternet();
  healthyApis();
});

const WP_PAGE = `<!doctype html><html><head>
<meta name="generator" content="WordPress 6.1.1">
<link rel="stylesheet" href="/wp-includes/css/dist/block-library/style.min.css?ver=6.1.1">
<script src="/wp-includes/js/jquery/jquery.min.js?ver=1.12.4"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.4/moment.min.js"></script>
<script src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>
</head><body>
<img src="http://insecure.example.net/logo.png">
<form action="http://forms.example.net/submit" method="post"><input name="email"></form>
</body></html>`;

describe("Page analysis", () => {
  test("finds WordPress, library versions, mixed content, insecure forms and outside scripts", () => {
    const i = analyzeHtml(WP_PAGE, "https://shop.example.com/");
    assert.equal(i.wpVersion, "6.1.1");
    assert.ok(i.hints.has("wordpress"));
    assert.deepEqual(i.libs, [{ name: "jquery", version: "1.12.4" }, { name: "moment", version: "2.29.4" }]);
    assert.equal(i.mixed.length, 1);
    assert.equal(i.insecureForms, 1);
    assert.deepEqual(i.externalScripts.map((e) => e.host).sort(), ["cdnjs.cloudflare.com", "www.googletagmanager.com"]);
  });

  test("hostile markup is only ever parsed as text", () => {
    const i = analyzeHtml(`<script src="/jquery-3.0.0.js?<script>alert(1)</script>"></script><meta name="generator" content="<img onerror=x>${"A".repeat(500)}">`, "https://x.com/");
    assert.ok(i.generator.length <= 80);
  });
});

describe("Deeper checks", () => {
  test("outdated WordPress and a vulnerable jQuery are flagged via wordpress.org and OSV", async () => {
    publicSite("shop.example.com", { body: WP_PAGE });
    const c = checksById(await runScan("shop.example.com"));
    assert.equal(c.software.status, "fail");
    assert.match(c.software.detail, /WordPress 6\.1\.1 is out of date \(the latest is 6\.8\.1\)/);
    assert.match(c.software.detail, /jquery 1\.12\.4 has 2 known security issues/);
    const osv = net.requests.find((r) => r.api === "api.osv.dev");
    assert.deepEqual(JSON.parse(osv.body).queries.map((q) => q.package.name), ["jquery", "moment"]);
  });

  test("vulnerability database down: warns instead of claiming all is well", async () => {
    delete net.apis["api.osv.dev"];
    publicSite("example.com", { body: '<script src="/js/jquery-3.7.1.min.js"></script>' });
    const c = checksById(await runScan("example.com"));
    assert.equal(c.software.status, "warn");
    assert.match(c.software.detail, /couldn't reach the vulnerability database/);
  });

  test("end-of-life PHP from X-Powered-By is flagged", async () => {
    publicSite("example.com", { headers: { ...GOOD_HEADERS, "X-Powered-By": "PHP/7.4.3" } });
    assert.match(checksById(await runScan("example.com")).software.detail, /PHP 7\.4 stopped getting security fixes/);
  });

  test("cookie flags: unprotected session cookie fails, well-set cookie passes", async () => {
    const h = new Headers(GOOD_HEADERS);
    h.append("Set-Cookie", "PHPSESSID=abc; path=/");
    publicSite("bad.example.com", { headers: h });
    const bad = checksById(await runScan("bad.example.com")).cookies;
    assert.equal(bad.status, "fail");
    assert.match(bad.detail, /PHPSESSID \(missing Secure, HttpOnly, SameSite\)/);
    installInternet();
    healthyApis();
    const g = new Headers(GOOD_HEADERS);
    g.append("Set-Cookie", "session=abc; Path=/; Secure; HttpOnly; SameSite=Lax");
    publicSite("good.example.com", { headers: g });
    assert.equal(checksById(await runScan("good.example.com")).cookies.status, "pass");
  });

  test("mixed content and insecure forms fail; outside scripts are listed (not scored)", async () => {
    publicSite("example.com", { body: WP_PAGE });
    const c = checksById(await runScan("example.com"));
    assert.equal(c.mixed.status, "fail");
    assert.equal(c.forms.status, "fail");
    assert.equal(c.thirdparty.status, "info");
    assert.equal(c.thirdparty.max, 0);
  });

  test("certificate expiry from CT logs: 3 days fails, unavailable is skipped (not scored)", async () => {
    healthyApis({ certDays: 3 });
    publicSite("example.com");
    assert.equal(checksById(await runScan("example.com")).certexpiry.status, "fail");
    installInternet();
    publicSite("example.com");
    const c = checksById(await runScan("example.com"));
    assert.equal(c.certexpiry.status, "skip");
    assert.equal(c.certexpiry.max, 0);
  });

  test("domain about to expire and no transfer lock (RDAP)", async () => {
    healthyApis({ domainDays: 10, locked: false });
    publicSite("example.com");
    const c = checksById(await runScan("example.com"));
    assert.equal(c.domainexpiry.status, "fail");
    assert.equal(c.registrarlock.status, "warn");
    assert.ok(net.requests.some((r) => r.href === "https://rdap.org/domain/example.com"));
  });

  test("subdomains are checked against the registrable domain for email and RDAP", async () => {
    publicSite("shop.example.co.uk");
    net.dns["example.co.uk"] = { TXT: ["v=spf1 -all"], MX: [] };
    await runScan("shop.example.co.uk");
    assert.ok(net.requests.some((r) => r.dns === "TXT _dmarc.example.co.uk"));
    assert.ok(net.requests.some((r) => r.href === "https://rdap.org/domain/example.co.uk"));
  });

  test("DNSSEC off warns; Google mail without DKIM fails; unknown provider without DKIM is info only", async () => {
    publicSite("example.com", { ds: false, dkim: false });
    let c = checksById(await runScan("example.com"));
    assert.equal(c.dnssec.status, "warn");
    assert.equal(c.dkim.status, "fail");
    installInternet();
    healthyApis();
    publicSite("example.com", { dkim: false, mx: "10 mail.smallhost.net." });
    c = checksById(await runScan("example.com"));
    assert.equal(c.dkim.status, "info");
    assert.equal(c.dkim.max, 0);
  });

  test("SPF with more than 10 DNS lookups fails", async () => {
    publicSite("example.com", { spf: "v=spf1 include:a.spf.test include:b.spf.test ~all" });
    net.dns["a.spf.test"] = { TXT: ["v=spf1 a mx ptr include:c.spf.test ~all"] };
    net.dns["b.spf.test"] = { TXT: ["v=spf1 a mx a:x.test a:y.test ~all"] };
    net.dns["c.spf.test"] = { TXT: ["v=spf1 a mx ~all"] };
    const c = checksById(await runScan("example.com"));
    assert.equal(c.spf.status, "fail");
    assert.match(c.spf.detail, /needs 1[1-9] DNS lookups/);
  });

  test("domain with no email gets 'v=spf1 -all' advice", async () => {
    publicSite("example.com", { spf: null, mx: null, dkim: false });
    const c = checksById(await runScan("example.com"));
    assert.match(c.spf.fix, /v=spf1 -all/);
    assert.equal(c.dkim.status, "skip");
  });

  test("Safe Browsing is only called with a key; a listing caps the score", async () => {
    publicSite("example.com");
    await runScan("example.com");
    assert.ok(!net.requests.some((r) => r.api === "safebrowsing.googleapis.com"));
    net.apis["safebrowsing.googleapis.com"] = () => Response.json({ matches: [{ threatType: "MALWARE" }] });
    const r = await runScan("example.com", { safeBrowsingKey: "k" });
    assert.equal(checksById(r).blocklist.status, "fail");
    assert.ok(r.score <= 40);
    assert.match(r.headline, /blocklist/);
  });

  test("stays within the request budget even in a worst case, and still returns a report", async () => {
    publicSite("example.com", { body: WP_PAGE, spf: "v=spf1 include:a.t include:b.t include:c.t include:d.t include:e.t include:f.t include:g.t ~all", dkim: false, mx: "1 mx.unknown.test." });
    for (const x of "abcdefg") net.dns[`${x}.t`] = { TXT: [`v=spf1 include:${x}2.t ~all`] };
    net.sites["https://example.com/"] = { status: 301, headers: { Location: "https://www.example.com/" } };
    publicSite("www.example.com", { body: WP_PAGE, spf: "v=spf1 include:a.t include:b.t include:c.t include:d.t include:e.t include:f.t include:g.t ~all", dkim: false, mx: "1 mx.unknown.test." });
    net.apis["safebrowsing.googleapis.com"] = () => Response.json({});
    const r = await runScan("example.com", { safeBrowsingKey: "k" });
    assert.ok(r.requests <= SCAN.maxSubrequests, `used ${r.requests}`);
    assert.equal(checksById(r).spf.status, "fail", "deeply nested SPF is still judged (lower bound > 10)");
    assert.ok(net.requests.length <= 50, `made ${net.requests.length} requests`);
    assert.equal(typeof r.score, "number");
  });

  test("still only plain GETs to the target site, with no query strings", async () => {
    publicSite("example.com", { body: WP_PAGE });
    await runScan("example.com");
    for (const u of targetUrls()) assert.equal(new URL(u).search, "", u);
    assert.ok(net.requests.filter((r) => r.url).every((r) => r.method === "GET"));
  });
});

describe("www fallback", () => {
  test("a bare domain with no address falls back to www.", async () => {
    publicSite("www.onlywww.com");
    delete net.dns["onlywww.com"].A;
    const r = await runScan("onlywww.com");
    assert.equal(r.domain, "www.onlywww.com");
    assert.ok(targetUrls().every((u) => new URL(u).hostname === "www.onlywww.com"));
  });

  test("the fallback still refuses a www. that points to a private address", async () => {
    net.dns["www.sneaky.com"] = { A: ["10.0.0.9"] };
    await assert.rejects(runScan("sneaky.com"), (e) => e.code === "private");
    assert.deepEqual(targetUrls(), []);
  });
});

describe("Advice", () => {
  test("top 3 priorities: exposed files always first, never more than 3", async () => {
    publicSite("example.com", { headers: { "Content-Type": "text/html" }, dmarc: null });
    net.sites["https://example.com/.env"] = { body: "DB_PASSWORD=x\n", headers: {} };
    const r = await runScan("example.com");
    assert.equal(r.priorities.length, 3);
    assert.equal(r.priorities[0].id, "exposed");
    for (const p of r.priorities) assert.ok(p.effort && p.who && p.why);
  });

  test("real-estate industry boosts email protection and adds context", async () => {
    publicSite("example.com", { headers: { "Content-Type": "text/html", "Strict-Transport-Security": "max-age=31536000" }, dmarc: null, dkim: false });
    const plain = await runScan("example.com");
    installInternet();
    healthyApis();
    publicSite("example.com", { headers: { "Content-Type": "text/html", "Strict-Transport-Security": "max-age=31536000" }, dmarc: null, dkim: false });
    const re = await runScan("example.com", { industry: "realestate" });
    assert.match(re.industry.note, /wire-fraud/);
    assert.equal(plain.industry, null);
    const ids = re.priorities.map((p) => p.id);
    assert.ok(ids.includes("dmarc") && ids.includes("dkim"), ids.join());
  });

  test("platform-specific fixes: Cloudflare gets Transform Rules, nginx gets add_header, WordPress gets .htaccess", async () => {
    publicSite("cf.example.com", { headers: { "Content-Type": "text/html", "CF-Ray": "1", Server: "cloudflare" } });
    let c = checksById(await runScan("cf.example.com"));
    assert.match(c.nosniff.snippets[0].label, /Cloudflare/);
    assert.match(c.redirect.status === "pass" ? c.nosniff.snippets[0].code : "", /X-Content-Type-Options/);

    installInternet(); healthyApis();
    publicSite("ng.example.com", { headers: { "Content-Type": "text/html", Server: "nginx" } });
    c = checksById(await runScan("ng.example.com"));
    assert.equal(c.nosniff.snippets.length, 1);
    assert.match(c.nosniff.snippets[0].code, /^add_header X-Content-Type-Options "nosniff" always;$/);

    installInternet(); healthyApis();
    publicSite("wp.example.com", { headers: { "Content-Type": "text/html" }, body: WP_PAGE });
    const r = await runScan("wp.example.com");
    c = checksById(r);
    assert.equal(r.platform.cms, "wordpress");
    assert.match(c.nosniff.snippets[0].label, /htaccess/);
    assert.match(c.software.fix, /Dashboard → Updates/);
  });

  test("hosted builders (Wix) are told headers need Cloudflare, not given server config", async () => {
    publicSite("example.com", { headers: { "Content-Type": "text/html", "X-Wix-Request-Id": "1" } });
    const r = await runScan("example.com");
    const c = checksById(r);
    assert.equal(r.platform.label, "Wix");
    assert.match(c.clickjacking.fix, /Wix doesn't let you add security headers/);
    assert.equal(c.clickjacking.snippets, undefined);
  });

  test("Google Workspace gets Google-specific SPF and DKIM steps", async () => {
    publicSite("example.com", { spf: null, dkim: false });
    const r = await runScan("example.com");
    const c = checksById(r);
    assert.equal(r.emailProvider, "Google Workspace");
    assert.equal(c.spf.snippets[0].code, "v=spf1 include:_spf.google.com ~all");
    assert.match(c.dkim.fix, /Google Admin console/);
  });

  test("every non-passing scored check has a fix, impact, effort and owner", async () => {
    publicSite("example.com", { headers: { "Content-Type": "text/html", Server: "Apache/2.4.1" }, spf: null, dmarc: null, dkim: false, ds: false, body: WP_PAGE });
    for (const c of Object.values(checksById(await runScan("example.com")))) {
      if (c.status !== "fail" && c.status !== "warn") continue;
      assert.ok(c.fix?.length > 15, `${c.id} fix`);
      assert.ok(c.impact && c.effort && c.who, `${c.id} meta`);
    }
  });
});

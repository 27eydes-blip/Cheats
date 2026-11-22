/* Email-me-this-report, owner verification and owner-verified checks. */
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { onRequestPost as deepScan } from "../functions/api/deep-scan.js";
import { onRequestPost as scan } from "../functions/api/scan.js";
import { onRequestPost as verify } from "../functions/api/verify.js";
import { _resetRateLimitMemory } from "../lib/ratelimit.js";
import { verificationCode } from "../lib/scan/deep.js";
import { formatReportText } from "../lib/scan/report-text.js";
import { runScan } from "../lib/scanner.js";
import { healthyApis, installInternet, net, publicSite, targetUrls } from "./helpers/internet.js";

const ORIGIN = "https://site.test";
let emails;
let n = 0;

function withMail() {
  const inner = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const u = String(input);
    if (u.startsWith("https://api.resend.com/")) {
      emails.push(JSON.parse(init.body));
      return Response.json({ id: "x" });
    }
    if (u.startsWith("https://challenges.cloudflare.com/")) return Response.json({ success: true, action: "scan", hostname: "site.test" });
    return inner(input, init);
  };
}

const env = (over = {}) => ({
  TURNSTILE_SECRET_KEY: "live", RATE_LIMIT_SALT: "salt", RESEND_API_KEY: "re_test",
  CONTACT_FROM_EMAIL: "Gleyde <site@site.test>", CONTACT_TO_EMAIL: "owner@site.test", ...over,
});
const post = (handler, path, body, e = env(), headers = {}) =>
  handler({
    request: new Request(`${ORIGIN}${path}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", Origin: ORIGIN, "CF-Connecting-IP": `198.51.100.${(n++ % 200) + 1}`, ...headers },
    }),
    env: e,
  });

beforeEach(() => {
  _resetRateLimitMemory();
  installInternet();
  healthyApis();
  emails = [];
  withMail();
});

describe("Email me this report", () => {
  const req = (over = {}) => ({ domain: "example.com", consent: true, "cf-turnstile-response": "t", email: "pat@client.test", industry: "realestate", ...over });

  test("sends the visitor a plain-text report and you a lead notification", async () => {
    publicSite("example.com", { dmarc: null });
    const res = await post(scan, "/api/scan", req());
    const body = await res.json();
    assert.equal(body.emailed, "sent");
    assert.equal(emails.length, 2);
    const [toVisitor, lead] = emails;
    assert.deepEqual(toVisitor.to, ["pat@client.test"]);
    assert.equal(toVisitor.html, undefined);
    assert.match(toVisitor.subject, /^Security report for example\.com: grade [A-F]$/);
    assert.match(toVisitor.text, /YOUR TOP FIXES/);
    assert.match(toVisitor.text, /FOR REAL ESTATE BUSINESSES/);
    assert.match(toVisitor.text, /\/contact\?website=example\.com&score=\d+/);
    assert.deepEqual(lead.to, ["owner@site.test"]);
    assert.equal(lead.reply_to, "pat@client.test");
    assert.match(lead.text, /Industry: Real estate/);
  });

  test("invalid or header-injecting email is rejected before scanning", async () => {
    for (const email of ["not-an-email", "a@b.com\r\nBcc: x@evil.test", "a@b.com, x@evil.test", "<script>@x.com", "x".repeat(250) + "@a.com"]) {
      const res = await post(scan, "/api/scan", req({ email }));
      assert.equal(res.status, 422, email);
    }
    assert.equal(targetUrls().length, 0);
    assert.equal(emails.length, 0);
  });

  test("at most 3 report emails per address per day", async () => {
    publicSite("example.com");
    const m = new Map();
    const e = env({ RATE_LIMIT_KV: { get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v) } });
    const results = [];
    for (let i = 0; i < 4; i++) results.push((await (await post(scan, "/api/scan", req(), e)).json()).emailed);
    assert.deepEqual(results.slice(0, 3), ["sent", "sent", "sent"]);
    assert.equal(results[3], "limit");
  });

  test("without Resend configured the check still works and says email is unavailable", async () => {
    publicSite("example.com");
    const body = await (await post(scan, "/api/scan", req(), env({ RESEND_API_KEY: "" }))).json();
    assert.equal(body.ok, true);
    assert.equal(body.emailed, "unavailable");
    assert.equal(body.emailAvailable, false);
  });

  test("hostile values copied from the site stay inert in the email (plain text, clipped)", async () => {
    const r = await (async () => {
      publicSite("example.com", { headers: { "Content-Type": "text/html", Server: `nginx/1.1 <script>alert(1)</script>` } });
      return runScan("example.com");
    })();
    const text = formatReportText(r, { siteOrigin: ORIGIN });
    assert.ok(text.includes("<script>"), "kept as literal text");
    assert.ok(text.split("\n").every((l) => l.length < 1200));
  });

  test("unknown industry values are ignored", async () => {
    publicSite("example.com");
    const body = await (await post(scan, "/api/scan", req({ industry: "__proto__", email: "" }))).json();
    assert.equal(body.report.industry, null);
  });
});

describe("Owner verification", () => {
  test("gives a stable, domain-specific code without contacting anything", async () => {
    const a = await (await post(verify, "/api/verify", { domain: "https://Example.com/x" })).json();
    const b = await (await post(verify, "/api/verify", { domain: "example.com" })).json();
    const c = await (await post(verify, "/api/verify", { domain: "other.com" })).json();
    assert.equal(a.dns.name, "_gleyde-verify.example.com");
    assert.equal(a.dns.value, b.dns.value);
    assert.notEqual(a.dns.value, c.dns.value);
    assert.match(a.dns.value, /^gleyde-verify=[0-9a-f]{32}$/);
    assert.equal(a.file.url, "https://example.com/.well-known/gleyde-verify.txt");
    assert.equal(net.requests.length, 0);
  });

  test("codes depend on the server secret", async () => {
    assert.notEqual(await verificationCode("s1", "example.com"), await verificationCode("s2", "example.com"));
  });

  test("refuses IPs, private names and cross-origin requests", async () => {
    for (const d of ["127.0.0.1", "localhost", "db.internal"]) assert.equal((await post(verify, "/api/verify", { domain: d })).status, 422, d);
    assert.equal((await post(verify, "/api/verify", { domain: "example.com" }, env(), { Origin: "https://evil.test" })).status, 403);
  });
});

describe("Owner-verified checks", () => {
  const code = () => verificationCode("salt", "example.com");
  const deepReq = { domain: "example.com", "cf-turnstile-response": "t" };

  test("without proof of ownership: 403 with instructions, and no owner-only probes", async () => {
    publicSite("example.com");
    const res = await post(deepScan, "/api/deep-scan", deepReq);
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.match(body.dns.value, /^gleyde-verify=/);
    const probed = targetUrls().map((u) => new URL(u).pathname);
    assert.deepEqual(probed, ["/.well-known/gleyde-verify.txt"]);
  });

  test("a wrong code is refused", async () => {
    publicSite("example.com");
    net.dns["_gleyde-verify.example.com"] = { TXT: ["gleyde-verify=00000000000000000000000000000000"] };
    assert.equal((await post(deepScan, "/api/deep-scan", deepReq)).status, 403);
  });

  test("verified by DNS: finds login page, user list, XML-RPC, folder listing and debug log", async () => {
    publicSite("example.com");
    net.dns["_gleyde-verify.example.com"] = { TXT: [`gleyde-verify=${await code()}`] };
    net.sites["https://example.com/wp-login.php"] = { body: '<form><input id="user_login"><input type="password"><input id="wp-submit"></form>' };
    net.sites["https://example.com/wp-json/wp/v2/users"] = { headers: { "Content-Type": "application/json" }, body: JSON.stringify([{ id: 1, slug: "zq-owner-login" }, { id: 2, slug: "zq-editor-login" }]) };
    net.sites["https://example.com/xmlrpc.php"] = { status: 405, body: "XML-RPC server accepts POST requests only." };
    net.sites["https://example.com/wp-content/uploads/"] = { body: "<html><title>Index of /wp-content/uploads</title>" };
    net.sites["https://example.com/wp-content/debug.log"] = { headers: {}, body: "[01-Jan-2026] PHP Warning: secret path /home/acct/x.php" };
    const res = await post(deepScan, "/api/deep-scan", deepReq);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.verifiedVia, "dns");
    const c = Object.fromEntries(body.section.checks.map((x) => [x.id, x]));
    assert.equal(c.login.status, "warn", JSON.stringify(c.login) + JSON.stringify(net.requests.filter((r) => r.url).map((r) => r.url)));
    assert.equal(c.userenum.status, "fail");
    assert.match(c.userenum.detail, /list of 2 user account/);
    assert.equal(c.xmlrpc.status, "warn");
    assert.equal(c.dirlisting.status, "fail");
    assert.deepEqual(c.deepfiles.found, ["/wp-content/debug.log"]);
    const raw = JSON.stringify(body);
    assert.ok(!raw.includes("zq-"), "user names are not returned");
    assert.ok(!raw.includes("/home/acct"), "file contents are not returned");
    for (const x of body.section.checks.filter((k) => k.status !== "pass" && k.status !== "info")) assert.ok(x.fix && x.impact && x.effort);
  });

  test("verified by file works too; all owner-only requests are plain GETs without query strings", async () => {
    publicSite("example.com");
    net.sites["https://example.com/.well-known/gleyde-verify.txt"] = { headers: {}, body: `${await code()}\n` };
    const body = await (await post(deepScan, "/api/deep-scan", deepReq)).json();
    assert.equal(body.verifiedVia, "file");
    for (const r of net.requests.filter((x) => x.url)) {
      assert.equal(r.method, "GET");
      assert.equal(new URL(r.url).search, "");
    }
  });

  test("still SSRF-safe: a verified domain that resolves privately is not probed", async () => {
    net.dns["example.com"] = { A: ["10.0.0.5"] };
    net.dns["_gleyde-verify.example.com"] = { TXT: [`gleyde-verify=${await code()}`] };
    const res = await post(deepScan, "/api/deep-scan", deepReq);
    assert.equal(res.status, 502);
    assert.deepEqual(targetUrls(), []);
  });

  test("rate limited per visitor and per target", async () => {
    publicSite("example.com");
    net.dns["_gleyde-verify.example.com"] = { TXT: [`gleyde-verify=${await code()}`] };
    const e = env();
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await post(deepScan, "/api/deep-scan", deepReq, e)).status);
    assert.deepEqual(statuses.slice(0, 4), [200, 200, 200, 200]);
    assert.ok(statuses.slice(4).every((s) => s === 429));
  });
});

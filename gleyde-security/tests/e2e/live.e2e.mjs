/* Live attack suite: runs against a running server (local `npm run dev` or your real domain).
     BASE_URL=http://localhost:8788 npm run test:e2e
   Needs Playwright: `npm i -D playwright && npx playwright install chromium` on your machine.
   Rate-limit checks spoof CF-Connecting-IP, which only works locally (Cloudflare overwrites
   it in production), so they are skipped unless BASE_URL is localhost. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";

const BASE = (process.env.BASE_URL || "http://localhost:8788").replace(/\/$/, "");
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)/.test(BASE);
const PAGES = ["/", "/services", "/how-it-works", "/about", "/contact", "/security-check", "/does-not-exist", "/assets/css/site.css", "/assets/js/site.js", "/assets/js/security-check.js"];
const REQUIRED = {
  "content-security-policy": /script-src 'self' https:\/\/challenges\.cloudflare\.com[;]/,
  "strict-transport-security": /max-age=\d{8,}/,
  "x-frame-options": /^DENY$/,
  "x-content-type-options": /^nosniff$/,
  "referrer-policy": /^strict-origin-when-cross-origin$/,
};

describe("Security headers on every response", () => {
  for (const path of PAGES) {
    test(`headers on ${path}`, async () => {
      const res = await fetch(BASE + path);
      for (const [h, re] of Object.entries(REQUIRED)) assert.match(res.headers.get(h) || "", re, `${h} on ${path}`);
      const csp = res.headers.get("content-security-policy");
      assert.ok(!/unsafe-inline|unsafe-eval|\*/.test(csp), `weak CSP: ${csp}`);
      assert.match(csp, /frame-ancestors 'none'/);
      assert.match(csp, /object-src 'none'/);
      assert.equal(res.headers.get("access-control-allow-origin"), null, "no CORS grant on static files");
    });
  }

  test("API responses carry their own headers", async () => {
    for (const [method, path] of [["GET", "/api/config"], ["GET", "/api/contact"], ["OPTIONS", "/api/contact"]]) {
      const res = await fetch(BASE + path, { method, headers: { Origin: "https://evil.test", "Access-Control-Request-Method": "POST" } });
      assert.equal(res.headers.get("x-frame-options"), "DENY", `${method} ${path}`);
      assert.equal(res.headers.get("access-control-allow-origin"), null, `${method} ${path}`);
    }
  });
});

describe("No exposed files or secrets over HTTP", () => {
  const paths = [
    "/.dev.vars", "/.dev.vars.example", "/.env", "/wrangler.toml", "/package.json", "/package-lock.json",
    "/functions/api/contact.js", "/lib/http.js", "/.git/config", "/.git/HEAD", "/README.md", "/docs/launch-checklist.md",
    "/tests/attacks.test.js", "/node_modules/wrangler/package.json", "/api/contact.js", "/%2e%2e/.dev.vars", "/..%2f.dev.vars",
  ];
  for (const p of paths) {
    test(`${p} is not served`, async () => {
      const res = await fetch(BASE + p);
      const body = await res.text();
      assert.ok(res.status === 404 || res.status === 405, `${p} -> ${res.status}`);
      assert.ok(!/TURNSTILE_SECRET|RESEND_API_KEY|re_[A-Za-z0-9]{8}|BEGIN [A-Z ]*PRIVATE KEY/.test(body), `${p} leaks`);
    });
  }

  test("/api/config exposes only the public site key", async () => {
    const cfg = await (await fetch(`${BASE}/api/config`)).json();
    assert.deepEqual(Object.keys(cfg), ["turnstileSiteKey"]);
  });

  test("every served page and script is free of secret-looking strings", async () => {
    for (const p of PAGES) {
      const body = await (await fetch(BASE + p)).text();
      assert.ok(!/re_[A-Za-z0-9]{16,}|0x4A[A-Za-z0-9_-]{20,}|sk_live_|AKIA[0-9A-Z]{16}/.test(body), p);
    }
  });
});

describe("Live rate limiting (local only)", { skip: !LOCAL && "CF-Connecting-IP cannot be spoofed in production" }, () => {
  const hit = (ip, body = "{}") =>
    fetch(`${BASE}/api/contact`, {
      method: "POST", body,
      headers: { "Content-Type": "application/json", Accept: "application/json", Origin: BASE, "CF-Connecting-IP": ip },
    }).then((r) => r.status);
  const rnd = () => Math.floor(Math.random() * 65535).toString(16);

  test("parallel burst of 15 from one IP: at most 5 get through", async () => {
    const ip = `2001:db8:${rnd()}:${rnd()}::1`;
    const s = await Promise.all(Array.from({ length: 15 }, () => hit(ip)));
    assert.ok(s.filter((x) => x === 429).length >= 10, `statuses ${s}`);
  });

  test("rotating addresses inside one IPv6 /64 does not reset the limit", async () => {
    const net = `2001:db8:${rnd()}:${rnd()}`;
    const s = [];
    for (let i = 1; i <= 8; i++) s.push(await hit(`${net}::${i}`));
    assert.equal(s.filter((x) => x === 429).length, 3, `statuses ${s}`);
  });
});

describe("Browser: XSS cannot execute", () => {
  let browser;
  let pwned;
  const XSS = `"><img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>`;

  before(async () => {
    const { chromium } = createRequire(import.meta.url)("playwright");
    browser = await chromium.launch();
  });
  after(() => browser?.close());

  async function open(path, setup) {
    const page = await browser.newPage();
    pwned = [];
    page.on("dialog", (d) => { pwned.push(`dialog: ${d.message()}`); d.dismiss(); });
    if (setup) await setup(page);
    await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
    return page;
  }
  const flag = (page) => page.evaluate(() => window.__pwned);

  for (const path of [
    `/contact?status=${encodeURIComponent(XSS)}`,
    `/contact?status=sent&x=${encodeURIComponent(XSS)}`,
    `/#${encodeURIComponent(XSS)}`,
    `/does-not-exist/${encodeURIComponent("<script>alert(1)</script>")}`,
  ]) {
    test(`reflected via URL: ${path.slice(0, 45)}`, async () => {
      const page = await open(path);
      await page.waitForTimeout(300);
      assert.equal(await flag(page), undefined);
      assert.equal(await page.locator("img[src=x]").count(), 0);
      assert.deepEqual(pwned, []);
      await page.close();
    });
  }

  test("payloads in every form field + hostile server response render as text only", async () => {
    const page = await open("/contact", async (p) => {
      // Stand-in for a compromised/buggy API echoing payloads back: the page must still not execute them.
      await p.route("**/api/contact", (route) =>
        route.fulfill({ status: 422, contentType: "application/json",
          body: JSON.stringify({ ok: false, error: XSS, fields: { name: XSS, email: XSS, website: XSS, message: XSS, consent: XSS } }) }));
      await p.route("**/api/config", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ turnstileSiteKey: null }) }));
    });
    await page.fill("#name", XSS);
    await page.fill("#email", "jane@example.com");
    await page.fill("#website", XSS.slice(0, 190));
    await page.fill("#message", XSS);
    await page.check('input[name="consent"]');
    // Fake a solved Turnstile so the client actually submits.
    await page.evaluate(() => {
      const i = document.createElement("input");
      i.type = "hidden"; i.name = "cf-turnstile-response"; i.value = "tok";
      document.getElementById("contact-form").append(i);
      document.querySelector('[name="website"]').value = "example.com";
    });
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => document.getElementById("form-status").textContent.length > 0);
    assert.equal(await page.locator("#form-status").textContent(), XSS, "shown literally");
    assert.equal(await page.locator("img[src=x]").count(), 0);
    assert.equal(await flag(page), undefined);
    assert.deepEqual(pwned, []);
    await page.close();
  });

  test("CSP blocks an injected inline script and inline handler even if markup gets in", async () => {
    const page = await open("/");
    const violations = await page.evaluate(async () => {
      const seen = [];
      document.addEventListener("securitypolicyviolation", (e) => seen.push(e.violatedDirective));
      const s = document.createElement("script");
      s.textContent = "window.__pwned = 1";
      document.body.append(s);
      const d = document.createElement("div");
      d.innerHTML = '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" onload="window.__pwned=2">';
      document.body.append(d);
      await new Promise((r) => setTimeout(r, 300));
      return seen;
    });
    assert.equal(await flag(page), undefined);
    assert.ok(violations.some((v) => v.startsWith("script-src")), `violations: ${violations}`);
    await page.close();
  });

  test("site cannot be framed (clickjacking)", async () => {
    const page = await browser.newPage();
    await page.setContent(`<iframe id="f" src="${BASE}/contact"></iframe>`);
    await page.waitForTimeout(1500);
    const frame = page.frames().find((f) => f.url().startsWith(BASE));
    const loaded = frame ? await frame.evaluate(() => !!document.querySelector("form")).catch(() => false) : false;
    assert.equal(loaded, false);
    await page.close();
  });
});

describe("Security Check API (live)", () => {
  const scan = (domain, headers = {}) =>
    fetch(`${BASE}/api/scan`, {
      method: "POST",
      body: JSON.stringify({ domain, consent: true, "cf-turnstile-response": "x" }),
      headers: { "Content-Type": "application/json", Accept: "application/json", Origin: BASE,
        ...(LOCAL ? { "CF-Connecting-IP": `2001:db8:${Math.floor(Math.random() * 65535).toString(16)}::1` } : {}), ...headers },
    });

  for (const d of ["127.0.0.1", "localhost", "[::1]", "169.254.169.254", "http://2130706433/", "0x7f.1", "example.com:22",
    "db.internal", "printer.local", "user:pw@example.com", "file:///etc/passwd"]) {
    test(`refuses ${d} before any network activity`, async () => {
      const res = await scan(d);
      assert.equal(res.status, 422, d);
      assert.match((await res.json()).error, /domain|IP address|port|private|reserved|website address|username/i);
    });
  }

  test("cross-origin scan request -> 403, no CORS grant", async () => {
    const res = await scan("example.com", { Origin: "https://evil.test" });
    assert.equal(res.status, 403);
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  });

  test("without a valid Turnstile token nothing is scanned", async () => {
    assert.equal((await scan("example.com")).status, 403);
  });
});

describe("Browser: Security Check page", () => {
  let browser;
  const XSS = `<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>`;
  const sample = JSON.parse(readFileSync(new URL("./sample-report.json", import.meta.url), "utf8"));

  before(async () => {
    const { chromium } = createRequire(import.meta.url)("playwright");
    browser = await chromium.launch();
  });
  after(() => browser?.close());

  async function runWith(report) {
    const page = await browser.newPage();
    const dialogs = [];
    page.on("dialog", (d) => { dialogs.push(d.message()); d.dismiss(); });
    await page.route("**/api/config", (r) => r.fulfill({ contentType: "application/json", body: '{"turnstileSiteKey":null}' }));
    await page.route("**/api/scan", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, cached: false, report }) }));
    await page.goto(`${BASE}/security-check`);
    await page.fill("#domain", "smithrealty.com");
    await page.check('input[name="consent"]');
    await page.evaluate(() => {
      const i = document.createElement("input");
      i.type = "hidden"; i.name = "cf-turnstile-response"; i.value = "tok";
      document.getElementById("scan-form").append(i);
    });
    await page.click('#scan-form button[type="submit"]');
    await page.waitForSelector("#scan-results:not([hidden]) .report-head");
    return { page, dialogs };
  }

  test("renders score, sections, fixes and a book-an-audit link", async () => {
    const { page } = await runWith(sample);
    assert.equal(await page.locator(".grade-letter").textContent(), sample.grade);
    assert.equal(await page.locator(".check").count(), sample.sections.reduce((n, s) => n + s.checks.length, 0));
    assert.ok((await page.locator(".check .fix").count()) >= 6);
    const href = await page.locator(".report-cta a").first().getAttribute("href");
    assert.equal(href, `/contact?website=smithrealty.com&score=${sample.score}`);
    await page.click(".report-cta a >> nth=0");
    await page.waitForURL(/\/contact/);
    assert.equal(await page.inputValue("#website"), "smithrealty.com");
    assert.match(await page.inputValue("#message"), new RegExp(`score ${sample.score}/100`));
    await page.close();
  });

  test("hostile report content renders as text only (no XSS)", async () => {
    const evil = structuredClone(sample);
    evil.domain = XSS;
    evil.headline = XSS;
    evil.checkedUrl = `javascript:${XSS}`;
    evil.sections[0].title = XSS;
    evil.sections[0].checks[0] = { ...evil.sections[0].checks[0], title: XSS, detail: XSS, fix: XSS, status: `fail" onmouseover="x` };
    const { page, dialogs } = await runWith(evil);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__pwned), undefined);
    assert.equal(await page.locator("#scan-results img[src=x], #scan-results script").count(), 0);
    assert.equal(await page.locator(".report-head h2").textContent(), XSS);
    const href = await page.locator(".report-cta a").first().getAttribute("href");
    assert.ok(href.startsWith("/contact?website=%3Cimg"), href);
    await page.locator(".report-cta a").first().click();
    await page.waitForURL(/\/contact/);
    assert.equal(await page.inputValue("#website"), "", "non-domain values are not prefilled");
    assert.deepEqual(dialogs, []);
    await page.close();
  });

  test("server error message is shown as text", async () => {
    const page = await browser.newPage();
    await page.route("**/api/config", (r) => r.fulfill({ contentType: "application/json", body: '{"turnstileSiteKey":null}' }));
    await page.route("**/api/scan", (r) => r.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ ok: false, error: XSS, fields: { domain: XSS } }) }));
    await page.goto(`${BASE}/security-check`);
    await page.fill("#domain", "smithrealty.com");
    await page.check('input[name="consent"]');
    await page.evaluate(() => {
      const i = document.createElement("input"); i.type = "hidden"; i.name = "cf-turnstile-response"; i.value = "tok";
      document.getElementById("scan-form").append(i);
    });
    await page.click('#scan-form button[type="submit"]');
    await page.waitForFunction(() => document.getElementById("scan-status").textContent.length > 0);
    assert.equal(await page.locator("#scan-status").textContent(), XSS);
    assert.equal(await page.evaluate(() => window.__pwned), undefined);
    await page.close();
  });
});

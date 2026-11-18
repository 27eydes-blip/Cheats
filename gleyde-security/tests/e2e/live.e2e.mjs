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
const PAGES = ["/", "/services", "/how-it-works", "/about", "/contact", "/security-check", "/privacy", "/does-not-exist", "/assets/css/site.css", "/assets/js/site.js", "/assets/js/security-check.js"];
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

  async function runWith(report, extra = {}, setup) {
    const page = await browser.newPage();
    const dialogs = [];
    page.on("dialog", (d) => { dialogs.push(d.message()); d.dismiss(); });
    await page.route("**/api/config", (r) => r.fulfill({ contentType: "application/json", body: '{"turnstileSiteKey":null}' }));
    await page.route("**/api/scan", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, cached: false, report, ...extra }) }));
    if (setup) await setup(page);
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

describe("Browser: Security Check v2 features", () => {
  let browser;
  const XSS = `<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>`;
  const sample = JSON.parse(readFileSync(new URL("./sample-report.json", import.meta.url), "utf8"));

  before(async () => {
    const { chromium } = createRequire(import.meta.url)("playwright");
    browser = await chromium.launch();
  });
  after(() => browser?.close());

  async function open(report, extra = {}, { context, routes } = {}) {
    const ctx = context || (await browser.newContext());
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
    const page = await ctx.newPage();
    const dialogs = [];
    page.on("dialog", (d) => { dialogs.push(d.message()); d.dismiss(); });
    await page.route("**/api/config", (r) => r.fulfill({ contentType: "application/json", body: '{"turnstileSiteKey":null}' }));
    await page.route("**/api/scan", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, cached: false, report, ...extra }) }));
    if (routes) await routes(page);
    await page.goto(`${BASE}/security-check`);
    await page.fill("#domain", "smithrealty.com");
    await page.selectOption("#industry", "realestate");
    await page.check('input[name="consent"]');
    await page.evaluate(() => {
      const i = document.createElement("input"); i.type = "hidden"; i.name = "cf-turnstile-response"; i.value = "tok";
      document.getElementById("scan-form").append(i);
    });
    await page.click('#scan-form button[type="submit"]');
    await page.waitForSelector("#scan-results:not([hidden]) .report-head");
    return { page, ctx, dialogs };
  }

  test("sends industry and email; shows top fixes, tags, industry note, platform and email status", async () => {
    let sent;
    const { page, ctx } = await open(sample, { emailed: "sent", emailAvailable: true }, {
      routes: (p) => p.route("**/api/scan", async (r) => {
        sent = JSON.parse(r.request().postData());
        r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, report: sample, emailed: "sent" }) });
      }),
    });
    assert.equal(sent.industry, "realestate");
    assert.equal(await page.locator(".top-fixes li").count(), sample.priorities.length);
    assert.equal(await page.locator(".top-fixes h4").first().textContent(), sample.priorities[0].title);
    assert.match(await page.locator(".industry-note").textContent(), /wire-fraud/);
    assert.match(await page.locator(".report-head").textContent(), /Detected: WordPress/);
    assert.match(await page.locator(".email-note").textContent(), /emailed this report/);
    assert.ok((await page.locator(".check .tag").count()) > 10);
    await ctx.close();
  });

  test("platform snippets render as code with working copy buttons", async () => {
    const { page, ctx } = await open(sample);
    const n = await page.locator(".snippet").count();
    assert.ok(n >= 5, `snippets: ${n}`);
    const first = page.locator(".snippet").first();
    const code = await first.locator("pre").textContent();
    await first.locator(".copy-btn").click();
    await page.waitForFunction(() => document.querySelector(".snippet .copy-btn").textContent !== "Copy");
    assert.equal(await first.locator(".copy-btn").textContent(), "Copied");
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), code);
    await ctx.close();
  });

  test("progress since the last check is remembered in this browser", async () => {
    const ctx = await browser.newContext();
    const older = { ...sample, score: 25, grade: "F", scannedAt: new Date(Date.now() - 864e5 * 7).toISOString() };
    let p = (await open(older, {}, { context: ctx })).page;
    assert.equal(await p.locator(".progress").count(), 0);
    await p.close();
    p = (await open(sample, {}, { context: ctx })).page;
    assert.match(await p.locator(".progress").textContent(), new RegExp(`Up ${sample.score - 25} points`));
    await ctx.close();
  });

  test("Save as PDF prints only the report", async () => {
    const { page, ctx } = await open(sample);
    await page.emulateMedia({ media: "print" });
    assert.equal(await page.locator(".site-header").isVisible(), false);
    assert.equal(await page.locator("#scan-form").isVisible(), false);
    assert.equal(await page.locator(".report-head").isVisible(), true);
    assert.equal(await page.locator(".report-toolbar").isVisible(), false);
    await ctx.close();
  });

  test("owner verification flow: code instructions, then verified section", async () => {
    const section = { id: "verified", title: "Owner-verified checks", checks: [
      { id: "userenum", title: "WordPress user list", status: "fail", detail: "Your site publishes a list of 2 user account name(s).", fix: "Block the users endpoint.", impact: "medium", effort: "15 minutes", who: "You" },
    ] };
    const { page, ctx } = await open(sample, { verifyAvailable: true }, {
      routes: async (p) => {
        await p.route("**/api/verify", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, dns: { name: "_gleyde-verify.smithrealty.com", value: "gleyde-verify=abc" }, file: { url: "https://smithrealty.com/.well-known/gleyde-verify.txt", contents: "abc" } }) }));
        await p.route("**/api/deep-scan", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, verifiedVia: "dns", section }) }));
      },
    });
    await page.click("text=Get my verification code");
    await page.waitForSelector("text=_gleyde-verify.smithrealty.com", { state: "attached" });
    assert.match(await page.locator(".verify-panel").textContent(), /gleyde-verify=abc/);
    await page.evaluate(() => {
      const i = document.createElement("input"); i.type = "hidden"; i.name = "cf-turnstile-response"; i.value = "tok2";
      document.body.append(i);
    });
    await page.click("text=I've added it: run verified checks");
    await page.waitForSelector(".verified-section");
    assert.match(await page.locator(".verified-section").textContent(), /Verified owner \(via DNS record\)/);
    assert.match(await page.locator(".verified-section").textContent(), /user account name/);
    await ctx.close();
  });

  test("hostile content in the new report fields renders as text only", async () => {
    const evil = structuredClone(sample);
    evil.platform.label = XSS;
    evil.emailProvider = XSS;
    evil.industry = { id: "x", label: XSS, note: XSS };
    evil.priorities = [{ id: "x", title: XSS, why: XSS, effort: XSS, who: XSS, impact: `high" onclick="x` }];
    evil.sections[1].checks[0] = { ...evil.sections[1].checks[0], status: "fail", fix: XSS, snippets: [{ label: XSS, code: XSS }], effort: XSS, who: XSS };
    const { page, ctx, dialogs } = await open(evil, { emailed: XSS, verifyAvailable: true });
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__pwned), undefined);
    assert.equal(await page.locator("#scan-results img[src=x], #scan-results script").count(), 0);
    assert.ok((await page.locator(".snippet pre").allTextContents()).includes(XSS), "hostile snippet shown as literal text");
    assert.deepEqual(dialogs, []);
    await ctx.close();
  });
});

describe("Accessibility (axe-core, WCAG 2.2 AA)", () => {
  let browser;
  const sample = JSON.parse(readFileSync(new URL("./sample-report.json", import.meta.url), "utf8"));
  const axeSrc = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
  before(async () => {
    const { chromium } = createRequire(import.meta.url)("playwright");
    browser = await chromium.launch();
  });
  after(() => browser?.close());

  for (const [label, viewport] of [["phone", { width: 375, height: 667 }], ["desktop", { width: 1440, height: 900 }]]) {
    for (const path of ["/", "/services", "/how-it-works", "/about", "/contact", "/security-check", "/privacy", "/does-not-exist"]) {
      test(`${label} ${path}: no WCAG violations`, async () => {
        // bypassCSP only so the test can inject axe; the site's own CSP is tested above.
        const ctx = await browser.newContext({ viewport, bypassCSP: true });
        const page = await ctx.newPage();
        await page.route("**/api/config", (r) => r.fulfill({ contentType: "application/json", body: '{"turnstileSiteKey":null}' }));
        await page.route("**/api/scan", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, report: sample, verifyAvailable: true, emailed: "sent" }) }));
        await page.goto(BASE + path, { waitUntil: "networkidle" });
        if (path === "/security-check") {
          await page.fill("#domain", "smithrealty.com");
          await page.check('input[name="consent"]');
          await page.evaluate(() => {
            const i = document.createElement("input"); i.type = "hidden"; i.name = "cf-turnstile-response"; i.value = "t";
            document.getElementById("scan-form").append(i);
          });
          await page.click('#scan-form button[type="submit"]');
          await page.waitForSelector(".report-head");
        }
        await page.evaluate(() => document.querySelectorAll(".reveal").forEach((e) => e.classList.add("in")));
        await page.waitForTimeout(1000); // let fade-ins finish so contrast is measured on final colors
        await page.addScriptTag({ content: axeSrc });
        const violations = await page.evaluate(async () =>
          (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"] } }))
            .violations.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`));
        assert.deepEqual(violations, []);
        await ctx.close();
      });
    }
  }
});

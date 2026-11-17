/* Live attack suite: runs against a running server (local `npm run dev` or your real domain).
     BASE_URL=http://localhost:8788 npm run test:e2e
   Needs Playwright: `npm i -D playwright && npx playwright install chromium` on your machine.
   Rate-limit checks spoof CF-Connecting-IP, which only works locally (Cloudflare overwrites
   it in production), so they are skipped unless BASE_URL is localhost. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, describe, test } from "node:test";

const BASE = (process.env.BASE_URL || "http://localhost:8788").replace(/\/$/, "");
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)/.test(BASE);
const PAGES = ["/", "/services", "/how-it-works", "/about", "/contact", "/does-not-exist", "/assets/css/site.css", "/assets/js/site.js"];
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

/* Browser tests for the AI chat widget. /api/chat* are mocked with Playwright routes,
   so no real model is called. Run with the other live tests:
     BASE_URL=http://localhost:8788 npm run test:e2e */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";

const BASE = (process.env.BASE_URL || "http://localhost:8788").replace(/\/$/, "");
const NOTICE = "This is an AI assistant. Chats are saved so the Gleyde team can follow up and improve the service. Please don't share passwords or sensitive info.";
const XSS = `<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>**bold** <a href="javascript:alert(1)">x</a>`;
const require = createRequire(import.meta.url);

let browser;
before(async () => {
  browser = await require("playwright").chromium.launch();
});
after(() => browser?.close());

async function setup({ viewport = { width: 1280, height: 860 }, reply = "DMARC is basically a lock on your email's return address.", status = 200, path = "/", bypassCSP = false } = {}) {
  const ctx = await browser.newContext({ viewport, bypassCSP });
  const page = await ctx.newPage();
  const calls = { chat: [], contact: [], delete: [], external: [] };
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.origin !== new URL(BASE).origin && u.protocol !== "data:") calls.external.push(r.url());
  });
  page.on("dialog", (d) => {
    calls.dialog = true;
    d.dismiss();
  });
  await page.route("**/api/config", (r) => r.fulfill({ contentType: "application/json", body: '{"turnstileSiteKey":null}' }));
  await page.route("**/api/chat", (r) => {
    calls.chat.push(r.request().postDataJSON());
    const body = status === 200 ? { ok: true, reply, redacted: false } : { ok: false, error: "You're sending messages quickly. Take a breather and try again in a few minutes." };
    r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route("**/api/chat/contact", (r) => {
    calls.contact.push(r.request().postDataJSON());
    r.fulfill({ contentType: "application/json", body: '{"ok":true}' });
  });
  await page.route("**/api/chat/delete", (r) => {
    calls.delete.push(r.request().postDataJSON());
    r.fulfill({ contentType: "application/json", body: '{"ok":true}' });
  });
  await page.goto(BASE + path, { waitUntil: "load" });
  await page.waitForSelector(".chat-launcher");
  return { ctx, page, calls };
}

const start = async (page) => {
  await page.click(".chat-launcher");
  await page.click(".chat-start");
  await page.waitForSelector(".chat-input");
};
const send = async (page, text) => {
  await page.fill(".chat-input", text);
  await page.keyboard.press("Enter");
};

describe("Browser: AI chat assistant", () => {
  test("bubble is on every page with an accessible name", async () => {
    const { ctx, page } = await setup();
    for (const p of ["/", "/services", "/how-it-works", "/about", "/contact", "/security-check", "/privacy", "/does-not-exist"]) {
      await page.goto(BASE + p, { waitUntil: "load" });
      const b = page.locator(".chat-launcher");
      assert.equal(await b.count(), 1, p);
      assert.equal(await b.getAttribute("aria-label"), "Open chat with the Gleyde AI assistant", p);
      assert.equal(await b.getAttribute("aria-expanded"), "false", p);
    }
    await ctx.close();
  });

  test("consent notice comes first; the first chat message says it is Gleyde's AI assistant", async () => {
    const { ctx, page, calls } = await setup();
    await page.click(".chat-launcher");
    assert.equal(await page.locator(".chat-launcher").getAttribute("aria-expanded"), "true");
    assert.equal((await page.textContent(".chat-notice")).trim(), NOTICE);
    assert.equal(await page.locator(".chat-input").isVisible(), false, "cannot type before Start chat");
    assert.equal(await page.evaluate(() => document.activeElement.textContent), "Start chat");
    await page.click(".chat-start");
    const first = (await page.locator(".chat-msg").first().textContent()).trim();
    assert.match(first, /Gleyde assistant, an AI/);
    assert.equal(calls.chat.length, 0, "nothing is sent until the visitor types");
    await ctx.close();
  });

  test("fully keyboard operable: open, start, send, Escape closes and returns focus", async () => {
    const { ctx, page, calls } = await setup();
    await page.focus(".chat-launcher");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter"); // Start chat (focused)
    assert.equal(await page.evaluate(() => document.activeElement.id), "gleyde-chat-input");
    await page.keyboard.type("What is HSTS?");
    await page.keyboard.press("Enter");
    await page.waitForSelector(".chat-msg-assistant >> nth=1");
    assert.equal(calls.chat.length, 1);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#gleyde-chat").isHidden(), true);
    assert.equal(await page.evaluate(() => document.activeElement.className), "chat-launcher");
    await ctx.close();
  });

  test("model output is shown as plain text, never as HTML", async () => {
    const { ctx, page, calls } = await setup({ reply: XSS });
    await start(page);
    await send(page, XSS);
    await page.waitForSelector(".chat-msg-assistant >> nth=1");
    const log = page.locator(".chat-log");
    assert.equal(await log.locator("img, script, a, b, strong").count(), 0);
    assert.equal((await log.locator(".chat-msg-assistant >> nth=1").textContent()).replace("Gleyde AI: ", ""), XSS);
    assert.equal(await page.evaluate(() => window.__pwned), undefined);
    assert.ok(!calls.dialog, "no alert fired");
    await ctx.close();
  });

  test("sends only to /api/chat with a random session id, start page and capped history", async () => {
    const { ctx, page, calls } = await setup({ path: "/services" });
    await start(page);
    for (let i = 0; i < 12; i++) {
      await send(page, `question ${i}`);
      await page.waitForFunction((n) => document.querySelectorAll(".chat-msg-assistant").length === n, i + 2);
    }
    const last = calls.chat.at(-1);
    assert.match(last.sessionId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(last.startPage, "/services");
    assert.equal(last.history.length, 20);
    assert.equal(last.history[0].role, "user");
    assert.equal(last.message, "question 11");
    assert.deepEqual(calls.external, [], "no third-party requests");
    await ctx.close();
  });

  test("500-character limit with a live counter", async () => {
    const { ctx, page } = await setup();
    await start(page);
    assert.equal(await page.getAttribute(".chat-input", "maxlength"), "500");
    await page.fill(".chat-input", "x".repeat(520));
    assert.equal((await page.inputValue(".chat-input")).length, 500);
    assert.equal((await page.textContent(".chat-count")).trim(), "500 / 500");
    await ctx.close();
  });

  test("friendly error on rate limit, and the typed message is kept", async () => {
    const { ctx, page } = await setup({ status: 429 });
    await start(page);
    await send(page, "hello there");
    await page.waitForSelector(".chat-status.is-error");
    assert.match(await page.textContent(".chat-status"), /try again in a few minutes/);
    assert.equal(await page.inputValue(".chat-input"), "hello there");
    assert.equal(await page.locator(".chat-msg-user").count(), 0);
    await ctx.close();
  });

  test("contact details are only sent after the visitor ticks consent", async () => {
    const { ctx, page, calls } = await setup();
    await start(page);
    await page.click("text=Share my contact info");
    await page.fill("#gleyde-chat-name", "Jane Doe");
    await page.fill("#gleyde-chat-email", "jane@example.com");
    await page.click("text=Send to the team");
    assert.equal(calls.contact.length, 0, "blocked without consent");
    await page.check("#gleyde-chat-consent");
    await page.click("text=Send to the team");
    await page.waitForFunction(() => /follow up/.test(document.querySelector(".chat-status").textContent));
    assert.equal(calls.contact.length, 1);
    assert.equal(calls.contact[0].consent, true);
    assert.equal(calls.contact[0].email, "jane@example.com");
    await ctx.close();
  });

  test("Delete my chat asks to confirm, deletes the session and starts fresh", async () => {
    const { ctx, page, calls } = await setup();
    await start(page);
    await send(page, "hi");
    await page.waitForSelector(".chat-msg-assistant >> nth=1");
    const oldId = calls.chat[0].sessionId;
    await page.click("text=Delete my chat");
    assert.equal(calls.delete.length, 0, "needs confirmation");
    await page.click("text=Yes, delete it");
    await page.waitForSelector(".chat-consent:not([hidden])");
    assert.deepEqual(calls.delete, [{ sessionId: oldId }]);
    assert.match(await page.textContent(".chat-flash"), /deleted/);
    await page.click(".chat-start");
    assert.equal(await page.locator(".chat-msg").count(), 1, "only the greeting");
    await send(page, "new chat");
    await page.waitForFunction(() => document.querySelectorAll(".chat-msg-assistant").length === 2);
    assert.notEqual(calls.chat.at(-1).sessionId, oldId);
    await ctx.close();
  });

  test("conversation survives moving to another page in the same tab", async () => {
    const { ctx, page } = await setup();
    await start(page);
    await send(page, "remember me");
    await page.waitForSelector(".chat-msg-assistant >> nth=1");
    await page.goto(`${BASE}/services`, { waitUntil: "load" });
    await page.waitForSelector(".chat-msg-user");
    assert.match(await page.textContent(".chat-log"), /remember me/);
    await ctx.close();
  });

  test("phone width: full-screen panel, no sideways scroll, 44px touch targets", async () => {
    const { ctx, page } = await setup({ viewport: { width: 375, height: 667 } });
    const lb = await page.locator(".chat-launcher").boundingBox();
    assert.ok(lb.width >= 44 && lb.height >= 44 && lb.x + lb.width <= 375);
    await start(page);
    await send(page, "x".repeat(400));
    await page.waitForSelector(".chat-msg-assistant >> nth=1");
    const box = await page.locator("#gleyde-chat").boundingBox();
    assert.equal(Math.round(box.width), 375);
    assert.equal(Math.round(box.height), 667);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    for (const sel of [".chat-icon-btn", ".chat-send", "text=Share my contact info", "text=Delete my chat"]) {
      const b = await page.locator(sel).boundingBox();
      assert.ok(b.height >= 44, `${sel} ${b.height}`);
    }
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".chat-input")).fontSize), "16px", "no iOS zoom");
    await page.click(".chat-icon-btn");
    assert.equal(await page.locator("#gleyde-chat").isHidden(), true);
    await ctx.close();
  });

  for (const [label, viewport] of [["phone", { width: 375, height: 667 }], ["desktop", { width: 1440, height: 900 }]]) {
    test(`${label}: no WCAG violations in the open chat (consent, conversation, forms)`, async () => {
      const axeSrc = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
      // bypassCSP only so the test can inject axe; the site's own CSP is tested in live.e2e.mjs.
      const { ctx, page } = await setup({ viewport, bypassCSP: true });
      await page.addScriptTag({ content: axeSrc });
      const run = () =>
        page.evaluate(async () =>
          (await window.axe.run(document.querySelector(".chat-root"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] } }))
            .violations.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`));
      await page.click(".chat-launcher");
      assert.deepEqual(await run(), [], "consent screen");
      await page.click(".chat-start");
      await send(page, "What is clickjacking?");
      await page.waitForSelector(".chat-msg-assistant >> nth=1");
      assert.deepEqual(await run(), [], "conversation");
      await page.click("text=Share my contact info");
      assert.deepEqual(await run(), [], "contact form");
      await page.click("text=Delete my chat");
      assert.deepEqual(await run(), [], "delete confirm");
      await ctx.close();
    });
  }

  test("the real endpoint answers with a friendly message when the chat isn't configured", async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(BASE + "/", { waitUntil: "load" });
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: crypto.randomUUID(), message: "hi" }) });
      return { status: r.status, body: await r.json(), csp: r.headers.get("content-security-policy") };
    });
    // Locally (no ANTHROPIC_API_KEY) this is 503; against a configured site it is a real reply.
    assert.ok([200, 503].includes(res.status), String(res.status));
    if (res.status === 503) assert.match(res.body.error, /contact page/);
    assert.match(res.csp, /default-src 'none'/);
    await ctx.close();
  });
});

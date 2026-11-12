/**
 * CoastPassGo end-to-end test harness: smoke, functional/bug, security and monkey tests.
 *
 * Runs against a local `wrangler dev` (see README "Testing"):
 *   npm run preview            # in one terminal (builds + serves http://127.0.0.1:8787)
 *   npm run e2e -- --rounds 3  # in another
 *
 * Needs .dev.vars (for the webhook secret, token secret and admin password) and the
 * pre-installed Playwright/Chromium. Writes a JSON report to tests/e2e/report.json.
 * Local-only: it creates test purchases, reports, stickers and a test city in the LOCAL database.
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { signToken } from "../../src/lib/token.ts";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const Stripe = require("stripe");

const BASE = process.env.E2E_BASE || "http://127.0.0.1:8787";
const args = process.argv.slice(2);
const ROUNDS = Number(args[args.indexOf("--rounds") + 1]) || 1;
const MONKEY_STEPS = Number(args[args.indexOf("--steps") + 1]) || 80;
const SEED = args.includes("--seed") ? Number(args[args.indexOf("--seed") + 1]) : 0; // vary to get new random sequences
const vars = Object.fromEntries(
  readFileSync(new URL("../../.dev.vars", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

/* ------------------------------------------------------------------ helpers */
type Result = { suite: string; name: string; ok: boolean; detail?: string };
const results: Result[] = [];
let current = "";
function check(name: string, ok: boolean, detail?: string) {
  results.push({ suite: current, name, ok, detail: ok ? undefined : detail });
  if (!ok) console.log(`  ✗ [${current}] ${name}${detail ? ` — ${detail}` : ""}`);
}
async function suite(name: string, fn: () => Promise<void>) {
  current = name;
  const before = results.length;
  try {
    await fn();
  } catch (e) {
    check("suite crashed", false, (e as Error).stack?.split("\n").slice(0, 3).join(" | "));
  }
  const mine = results.slice(before);
  console.log(`${mine.every((r) => r.ok) ? "✓" : "✗"} ${name}: ${mine.filter((r) => r.ok).length}/${mine.length} passed`);
}
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}
const XSS = `<script>window.__xss=1</script><img src=x onerror="window.__xss=1">"'&`;
const WEIRD = ["", " ", "a".repeat(2000), "😀🌊🏖️", "' OR 1=1 --", "%00%27", "../../etc/passwd", XSS, "‮evil", "null", "-1", "1e309"];

async function get(path: string, init: RequestInit = {}) {
  return fetch(BASE + path, { redirect: "manual", ...init });
}
function cookieHeader(name: string, value: string) {
  return { Cookie: `${name}=${value}` };
}
async function adminCookie(): Promise<string> {
  const html = await (await get("/admin/login")).text();
  const aid = /name="(\$ACTION_ID_[^"]+)"/.exec(html)?.[1];
  const fd = new FormData();
  fd.set(aid!, "");
  fd.set("password", vars.ADMIN_PASSWORD);
  const res = await get("/admin/login", { method: "POST", body: fd, headers: { Origin: BASE } });
  const sc = res.headers.get("set-cookie") || "";
  const m = /tp_admin=([^;]+)/.exec(sc);
  if (!m) throw new Error("admin login failed: " + res.status);
  return `tp_admin=${m[1]}`;
}
async function webhook(type: string, object: unknown, id = "evt_" + Math.random().toString(36).slice(2)) {
  const stripe = new Stripe("sk_test_x");
  const payload = JSON.stringify({ id, object: "event", type, data: { object } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: vars.STRIPE_WEBHOOK_SECRET });
  return fetch(BASE + "/api/webhooks/stripe", { method: "POST", body: payload, headers: { "stripe-signature": header, "content-type": "application/json" } });
}

/* ------------------------------------------------------------------ discover */
async function cities(admin: string): Promise<string[]> {
  const html = await (await get("/admin/cities", { headers: { Cookie: admin } })).text();
  return [...new Set([...html.matchAll(/href="\/city\/([a-z0-9-]+)"/g)].map((m) => m[1]))];
}

/* ================================================================== SUITES */

async function smokePublic(slugs: string[]) {
  for (const p of ["/", "/terms", "/privacy", "/admin/login"]) {
    const r = await get(p);
    check(`GET ${p} = 200`, r.status === 200, `got ${r.status}`);
  }
  for (const slug of slugs) {
    for (const p of [`/city/${slug}`, `/city/${slug}?src=MTK-TEST01`, `/city/${slug}/restore`, `/city/${slug}/restore?sent=1`, `/city/${slug}/restore?error=link`]) {
      const r = await get(p);
      const body = await r.text();
      check(`GET ${p} 200`, r.status === 200, `got ${r.status}`);
      check(`${p} has no error page`, !/Application error|Internal Server Error/i.test(body));
      if (p === `/city/${slug}`) check(`${slug} landing shows unlock button`, body.includes("Unlock the full guide"));
    }
  }
  const nf = await get("/city/does-not-exist");
  check("unknown city 404", nf.status === 404, `got ${nf.status}`);
}

async function smokeGuide(slugs: string[], tokens: Record<string, string>) {
  for (const slug of slugs) {
    const ck = cookieHeader(`tp_${slug}`, tokens[slug]);
    for (const q of ["", "?s=essentials", "?s=food", "?s=food&open=1", "?s=food&res=1", "?s=nightlife", "?s=parking", "?s=beaches", "?s=tips", "?q=beach", "?q=zzzznothing"]) {
      const r = await get(`/city/${slug}${q}`, { headers: ck });
      const body = await r.text();
      check(`guide ${slug}${q} 200`, r.status === 200, `got ${r.status}`);
      check(`guide ${slug}${q} unlocked`, !body.includes("Unlock the full guide"), "showed paywall");
      check(`guide ${slug}${q} no error`, !/Application error|Internal Server Error/i.test(body));
    }
  }
}

async function smokeAdmin(admin: string, slugs: string[]) {
  const pages = ["/admin", "/admin?days=7", "/admin?days=365", "/admin/cities", "/admin/verify", "/admin/reports", "/admin/stickers", "/admin/purchases", "/admin/purchases?q=example"];
  for (const p of pages) {
    const r = await get(p, { headers: { Cookie: admin } });
    check(`admin ${p} 200`, r.status === 200, `got ${r.status}`);
  }
  const html = await (await get("/admin/cities", { headers: { Cookie: admin } })).text();
  const ids = [...new Set([...html.matchAll(/href="\/admin\/cities\/(\d+)"/g)].map((m) => m[1]))];
  check("admin lists every city", ids.length >= slugs.length, `${ids.length} ids for ${slugs.length} cities`);
  for (const id of ids) {
    const r = await get(`/admin/cities/${id}`, { headers: { Cookie: admin } });
    const body = await r.text();
    check(`admin city ${id} 200`, r.status === 200, `got ${r.status}`);
    const listing = /href="\/admin\/listings\/(\d+)"/.exec(body)?.[1];
    if (listing) {
      const lr = await get(`/admin/listings/${listing}`, { headers: { Cookie: admin } });
      check(`admin listing ${listing} 200`, lr.status === 200, `got ${lr.status}`);
    }
    for (const p of [`/admin/stickers?city=${id}`, `/admin/stickers/print?city=${id}`, `/admin?city=${id}`]) {
      const sr = await get(p, { headers: { Cookie: admin } });
      check(`admin ${p} 200`, sr.status === 200, `got ${sr.status}`);
    }
  }
  for (const p of ["/admin/listings/99999999", "/admin/cities/99999999", "/admin/listings/new?section=99999999"]) {
    const r = await get(p, { headers: { Cookie: admin } });
    check(`admin ${p} → 404`, r.status === 404, `got ${r.status}`);
  }
}

async function security(slugs: string[], tokens: Record<string, string>) {
  for (const p of ["/admin", "/admin/cities", "/admin/verify", "/admin/reports", "/admin/stickers", "/admin/purchases"]) {
    const r = await get(p);
    check(`${p} locked without login`, [302, 303, 307, 308].includes(r.status) && (r.headers.get("location") || "").includes("/admin/login"), `got ${r.status} ${r.headers.get("location")}`);
  }
  const qr = await get("/api/admin/qr/MTK-TEST01");
  check("QR endpoint locked", qr.status === 401, `got ${qr.status}`);
  const forged = await signToken({ k: "admin", exp: Date.now() + 1e6 }, "wrong-secret-0123456789abc");
  const fr = await get("/admin", { headers: cookieHeader("tp_admin", forged) });
  check("forged admin cookie rejected", fr.status !== 200, `got ${fr.status}`);
  const [a, b] = slugs;
  if (b) {
    const cross = await get(`/city/${b}`, { headers: cookieHeader(`tp_${b}`, tokens[a]) });
    check("pass for one city does not unlock another", (await cross.text()).includes("Unlock the full guide"));
  }
  const tamper = tokens[a].slice(0, -3) + (tokens[a].endsWith("A") ? "BBB" : "AAA");
  const tr = await get(`/city/${a}`, { headers: cookieHeader(`tp_${a}`, tamper) });
  check("tampered access cookie rejected", (await tr.text()).includes("Unlock the full guide"));
  const acc = await get("/access/not-a-token");
  check("bad access link redirects", acc.status === 303 && acc.headers.get("location") === "/", `got ${acc.status} ${acc.headers.get("location")}`);
  const bad = await fetch(BASE + "/api/webhooks/stripe", { method: "POST", body: "{}", headers: { "stripe-signature": "t=1,v1=bad" } });
  check("webhook rejects bad signature", bad.status === 400, `got ${bad.status}`);
  const r = await get("/r/999999999");
  check("reserve link for missing listing → home", r.status === 303 && r.headers.get("location") === "/", `got ${r.status}`);
  const login = await get("/admin/login");
  check("admin login not indexed", /noindex/.test(await login.text()));
}

async function purchaseFlow(slug: string, admin: string) {
  // checkout without real Stripe keys must fail gracefully
  const fd = new FormData();
  fd.set("city", slug);
  fd.set("src", "MTK-TEST01");
  const co = await get("/api/checkout", { method: "POST", body: fd });
  check("checkout fails gracefully without Stripe keys", co.status === 303 && (co.headers.get("location") || "").includes("error=checkout"), `got ${co.status} ${co.headers.get("location")}`);

  // simulate a paid session through the signed webhook
  const pid = "e2e_" + Math.random().toString(36).slice(2, 10);
  const sid = "cs_test_" + pid;
  const pi = "pi_" + pid;
  // insert pending purchase via checkout path is impossible without Stripe, so use the webhook on a purchase created by SQL-less means:
  // the webhook only fulfills known purchases, so first prove that unknown purchases are ignored safely.
  const unknown = await webhook("checkout.session.completed", { id: sid, object: "checkout.session", payment_status: "paid", amount_total: 500, customer_details: { email: "x@example.com" }, payment_intent: pi, metadata: { purchase_id: pid } });
  check("webhook ignores unknown purchase (200)", unknown.status === 200, `got ${unknown.status}`);
  const dup = await webhook("charge.refunded", { id: "ch_x", object: "charge", payment_intent: "pi_nothing", amount_refunded: 500 });
  check("refund for unknown payment is harmless", dup.status === 200, `got ${dup.status}`);
}

async function paidJourney(slug: string, purchaseId: string, sessionId: string) {
  // fulfil via webhook, open the access link, then refund and confirm revocation
  const wh = await webhook("checkout.session.completed", { id: sessionId, object: "checkout.session", payment_status: "paid", amount_total: 500, customer_details: { email: "E2E@Example.com" }, payment_intent: "pi_" + purchaseId, metadata: { purchase_id: purchaseId } });
  check("webhook fulfils purchase", wh.status === 200, `got ${wh.status}`);
  const again = await webhook("checkout.session.completed", { id: sessionId, object: "checkout.session", payment_status: "paid", amount_total: 500, customer_details: { email: "e2e@example.com" }, payment_intent: "pi_" + purchaseId, metadata: { purchase_id: purchaseId } });
  check("second webhook delivery harmless", again.status === 200);
  const succ = await get(`/city/${slug}/success?session_id=${sessionId}`);
  const loc = succ.headers.get("location") || "";
  check("success page redirects to access link", [302, 303, 307].includes(succ.status) && loc.includes("/access/"), `got ${succ.status} ${loc}`);
  const acc = await get(loc.replace(BASE, ""));
  const cookie = /tp_[^=]+=([^;]+)/.exec(acc.headers.get("set-cookie") || "")?.[0];
  check("access link sets cookie", !!cookie, `status ${acc.status}`);
  const guide = await get(`/city/${slug}`, { headers: { Cookie: cookie || "" } });
  check("guide unlocked after purchase", !(await guide.text()).includes("Unlock the full guide"));
  const rf = await webhook("charge.refunded", { id: "ch_" + purchaseId, object: "charge", payment_intent: "pi_" + purchaseId, amount_refunded: 500 });
  check("refund webhook ok", rf.status === 200);
  const after = await get(`/city/${slug}`, { headers: { Cookie: cookie || "" } });
  check("refund revokes access", (await after.text()).includes("Unlock the full guide"));
  const fd = new FormData();
  fd.set("city", slug);
  fd.set("email", `e2e+${purchaseId}@example.com`); // unique per run so the 3-per-hour limit isn't what we're testing here
  const rs = await get("/api/restore", { method: "POST", body: fd });
  check("restore responds without revealing purchase", rs.status === 303 && (rs.headers.get("location") || "").includes("sent=1"), `got ${rs.status} ${rs.headers.get("location")}`);
}

async function formFuzz(slug: string, token: string, admin: string) {
  const ck = { Cookie: `tp_${slug}=${token}` };
  const html = await (await get(`/city/${slug}?s=food`, { headers: ck })).text();
  const lid = /name="listing_id" value="(\d+)"/.exec(html)?.[1];
  check("report form present on cards", !!lid);
  for (const w of WEIRD) {
    const fd = new FormData();
    fd.set("listing_id", lid || "0");
    fd.set("message", w);
    const r = await get("/api/report", { method: "POST", body: fd });
    check(`report accepts/ignores ${JSON.stringify(w.slice(0, 20))}`, r.status === 303 || r.status === 404, `got ${r.status}`);
  }
  for (const bad of ["abc", "-1", "99999999", ""]) {
    const fd = new FormData();
    fd.set("listing_id", bad);
    fd.set("message", "x");
    const r = await get("/api/report", { method: "POST", body: fd });
    check(`report with listing_id=${JSON.stringify(bad)} handled`, r.status < 500, `got ${r.status}`);
  }
  for (const w of WEIRD) {
    const fd = new FormData();
    fd.set("city", slug);
    fd.set("email", w);
    const r = await get("/api/restore", { method: "POST", body: fd });
    check(`restore email ${JSON.stringify(w.slice(0, 20))} handled`, r.status === 303, `got ${r.status}`);
  }
  for (const w of [...WEIRD, "nonexistent-city"]) {
    const fd = new FormData();
    fd.set("city", w);
    const r = await get("/api/checkout", { method: "POST", body: fd });
    check(`checkout city=${JSON.stringify(w.slice(0, 20))} handled`, r.status < 500, `got ${r.status}`);
  }
  for (const w of WEIRD) {
    const r = await get(`/city/${slug}?q=${encodeURIComponent(w)}&s=${encodeURIComponent(w)}&src=${encodeURIComponent(w)}&reported=${encodeURIComponent(w)}`, { headers: ck });
    const body = await r.text();
    check(`guide with weird params ${JSON.stringify(w.slice(0, 20))} < 500`, r.status < 500, `got ${r.status}`);
    check(`guide escapes ${JSON.stringify(w.slice(0, 20))}`, !body.includes("<script>window.__xss"), "raw script tag echoed");
  }
  const rep = await (await get("/admin/reports", { headers: { Cookie: admin } })).text();
  check("admin reports escape XSS payload", !rep.includes("<script>window.__xss") && !rep.includes('<img src=x onerror'), "unescaped payload in admin");
}

async function browserFlows(slug: string, token: string) {
  const b = await chromium.launch();
  const errors: string[] = [];
  try {
    // visitor on a phone: landing → guide tabs → filters → details → report → search
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    await ctx.route(/^(?!http:\/\/127\.0\.0\.1)/, (r: any) => r.abort());
    const p = await ctx.newPage();
    p.on("pageerror", (e: Error) => errors.push("pageerror: " + e.message));
    p.on("response", (r: any) => r.status() >= 500 && errors.push(`HTTP ${r.status()} ${r.url()}`));
    await p.goto(`${BASE}/city/${slug}?src=MTK-TEST01`);
    check("landing renders unlock button", (await p.locator("button", { hasText: "Unlock the full guide" }).count()) === 1);
    check("landing has no horizontal scroll", (await p.evaluate(() => document.documentElement.scrollWidth)) <= 390);
    await ctx.addCookies([{ name: `tp_${slug}`, value: token, domain: "127.0.0.1", path: "/" }]);
    await p.goto(`${BASE}/city/${slug}`);
    for (const tab of ["Dining", "Nightlife", "Beaches", "Parking", "Home"]) {
      const link = p.locator('nav[aria-label="Guide tabs"] a', { hasText: tab });
      if (await link.count()) {
        await link.click();
        const type = { Dining: "food", Nightlife: "nightlife", Beaches: "beaches", Parking: "parking" }[tab as "Dining"];
        if (tab !== "Home") await p.waitForURL(new RegExp(`s=${type}$`), { timeout: 8000 });
        else await p.waitForURL(/\/city\/[a-z-]+$/, { timeout: 8000 });
        check(`tab ${tab} active`, (await p.locator('nav[aria-label="Guide tabs"] a[aria-current="page"]').innerText()).includes(tab));
        check(`tab ${tab} no horizontal scroll`, (await p.evaluate(() => document.documentElement.scrollWidth)) <= 390);
      }
    }
    await p.goto(`${BASE}/city/${slug}?s=food`);
    const firstCard = p.locator("article").first();
    if (await firstCard.count()) {
      await firstCard.locator("summary").click();
      check("details expand shows report form", await firstCard.locator("textarea").isVisible());
      await firstCard.locator("textarea").fill("e2e: hours look wrong");
      await firstCard.locator("button", { hasText: "Report wrong info" }).click();
      await p.waitForURL(/reported=/);
      check("report thank-you shown", (await p.locator("text=We’ll review this listing").count()) === 1);
    }
    await p.goto(`${BASE}/city/${slug}`);
    await p.fill('input[name="q"]', "the");
    await p.press('input[name="q"]', "Enter");
    await p.waitForURL(/q=the/);
    check("search shows results heading", (await p.locator("h2", { hasText: "results for" }).count()) === 1);
    await ctx.close();
  } finally {
    await b.close();
  }
  check("no page errors / 5xx in visitor flow", errors.length === 0, errors.slice(0, 5).join(" | "));
}

async function adminBrowserFlow(round: number) {
  const b = await chromium.launch();
  const errors: string[] = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route(/^(?!http:\/\/127\.0\.0\.1)/, (r: any) => r.abort());
    const p = await ctx.newPage();
    p.on("pageerror", (e: Error) => errors.push("pageerror: " + e.message));
    p.on("response", (r: any) => r.status() >= 500 && errors.push(`HTTP ${r.status()} ${r.url()}`));
    await p.goto(`${BASE}/admin/login`);
    await p.fill('input[name="password"]', "definitely-wrong");
    await p.click("button:has-text('Log in')");
    await p.waitForURL(/error=/, { timeout: 8000 });
    check("wrong admin password rejected", (await p.locator("text=/Wrong password|Too many/").count()) === 1);
    await p.fill('input[name="password"]', vars.ADMIN_PASSWORD);
    await p.click("button:has-text('Log in')");
    await p.waitForURL(/\/admin$/);
    // create a city
    const slug = `e2e-town-${round}-${Date.now() % 100000}`;
    const code = "E" + String.fromCharCode(65 + (round % 26)) + String.fromCharCode(65 + (Date.now() % 26));
    await p.goto(`${BASE}/admin/cities`);
    const form = p.locator("form", { has: p.locator('input[name="slug"]') });
    await form.locator('input[name="slug"]').fill(slug);
    await form.locator('input[name="name"]').fill("E2E Town");
    await form.locator('input[name="state"]').fill("FL");
    await form.locator('input[name="code"]').fill(code);
    await form.locator('input[name="lat"]').fill("26.1");
    await form.locator('input[name="lon"]').fill("-81.8");
    await form.locator("button", { hasText: "Create city" }).click();
    await p.waitForURL(/\/admin\/cities\/\d+$/);
    check("create city lands on its page", /\/admin\/cities\/\d+$/.test(p.url()), p.url());
    const cityUrl = p.url();
    check("new city has 6 sections", (await p.locator("text=+ Add listing").count()) === 6, String(await p.locator("text=+ Add listing").count()));
    // bad city settings
    await p.locator('input[name="price"]').fill("0.10");
    await p.locator("button", { hasText: "Save city" }).click();
    await p.waitForURL(/error=/, { timeout: 8000 });
    check("price below $0.50 rejected", (await p.locator("text=Stripe minimum").count()) === 1);
    await p.goto(cityUrl);
    // add a listing with bad hours, then fix, verify, add reservation link
    await p.locator("a", { hasText: "+ Add listing" }).nth(1).click();
    await p.waitForURL(/listings\/new/);
    await p.fill('input[name="name"]', `E2E Bistro ${XSS}`);
    await p.fill('textarea[name="hours_default"]', "mon 9-5");
    await p.click("button[value=save]");
    await p.waitForURL(/error=/, { timeout: 8000 });
    check("bad hours rejected with message", (await p.locator("text=Bad time").count()) >= 1);
    await p.fill('input[name="name"]', `E2E Bistro ${XSS}`);
    await p.fill('textarea[name="hours_default"]', "daily 00:00-24:00");
    await p.fill('input[name="address"]', "1 Test St, Testville, FL");
    await p.fill('input[name="reserve_url"]', "http://insecure.example.com");
    await p.click("button[value=save]");
    await p.waitForURL(/error=.*https/i, { timeout: 8000 });
    check("http reservation link rejected", (await p.locator("text=must start with https").count()) === 1);
    await p.fill('input[name="name"]', `E2E Bistro ${XSS}`);
    await p.fill('textarea[name="hours_default"]', "daily 24h");
    await p.fill('input[name="address"]', "1 Test St, Testville, FL");
    await p.fill('input[name="reserve_url"]', "https://resy.com/cities/test/venues/e2e");
    await p.click("button[value=verify]");
    await p.waitForURL(/listings\/\d+\?saved=1/);
    check("listing saved and verified", (await p.locator("text=Last verified").count()) === 1);
    check("listing name escaped in admin", (await p.evaluate(() => (window as any).__xss)) === undefined, "XSS executed in admin");
    // publish + view guide as admin preview
    await p.goto(cityUrl);
    await p.check('input[name="published"]');
    await p.locator("button", { hasText: "Save city" }).click();
    await p.waitForURL(/saved=1/);
    await p.goto(`${BASE}/city/${slug}?s=food`);
    check("admin preview shows new listing", (await p.locator("article").count()) === 1);
    check("guide shows Reserve on Resy", (await p.locator("text=Reserve on Resy").count()) === 1);
    check("XSS in listing name not executed in guide", (await p.evaluate(() => (window as any).__xss)) === undefined);
    // stickers
    await p.goto(`${BASE}/admin/stickers?city=${/cities\/(\d+)/.exec(cityUrl)?.[1]}`);
    await p.fill('input[name="count"]', "3");
    await p.fill('input[name="batch"]', "e2e");
    await p.locator("button", { hasText: "Generate" }).click();
    await p.waitForURL(/batch=e2e/);
    check("3 stickers generated", (await p.locator("img[alt^='E']").count()) === 3, String(await p.locator("img[alt^='E']").count()));
    const pngHref = await p.locator("a", { hasText: "PNG" }).first().getAttribute("href");
    // fetch from inside the page so the browser sends the admin cookie exactly as a real tap would
    const png = await p.evaluate(async (h: string) => {
      const r = await fetch(h);
      const buf = new Uint8Array(await r.arrayBuffer());
      return { status: r.status, type: r.headers.get("content-type"), magic: Array.from(buf.slice(1, 4)).map((c) => String.fromCharCode(c)).join("") };
    }, pngHref);
    check("sticker PNG downloads", png.status === 200 && png.type === "image/png" && png.magic === "PNG", JSON.stringify(png));
    // verify queue + reports pages work after changes
    for (const path of ["/admin/verify", "/admin/reports", "/admin"]) {
      const r = await p.goto(BASE + path);
      check(`${path} OK after changes`, r?.status() === 200);
    }
    await ctx.close();
  } finally {
    await b.close();
  }
  check("no page errors / 5xx in admin flow", errors.length === 0, errors.slice(0, 5).join(" | "));
}

async function monkey(slug: string, token: string, seed: number, steps: number) {
  const rand = rng(seed);
  const b = await chromium.launch();
  const problems: string[] = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addCookies([{ name: `tp_${slug}`, value: token, domain: "127.0.0.1", path: "/" }]);
    await ctx.route(/^(?!http:\/\/127\.0\.0\.1)/, (r: any) => r.abort());
    const p = await ctx.newPage();
    p.on("pageerror", (e: Error) => problems.push("pageerror: " + e.message));
    p.on("response", (r: any) => r.status() >= 500 && problems.push(`HTTP ${r.status()} ${r.url()}`));
    await p.goto(`${BASE}/city/${slug}`);
    for (let i = 0; i < steps; i++) {
      const roll = rand();
      try {
        if (roll < 0.55) {
          const els = p.locator("a[href^='/'], a[href^='?'], button, summary");
          const n = await els.count();
          if (n) {
            const el = els.nth(Math.floor(rand() * n));
            const href = await el.getAttribute("href").catch(() => null);
            if (href && /\/(admin|access|r\/)/.test(href)) continue; // stay in visitor scope
            if (await el.isVisible()) await el.click({ timeout: 2000 });
          }
        } else if (roll < 0.75) {
          const inputs = p.locator("input[type=search], input[name=q], textarea");
          const n = await inputs.count();
          if (n) {
            const inp = inputs.nth(Math.floor(rand() * n));
            if (await inp.isVisible()) {
              await inp.fill(WEIRD[Math.floor(rand() * WEIRD.length)]);
              if (rand() < 0.6) await inp.press("Enter");
            }
          }
        } else if (roll < 0.85) {
          await p.goBack({ timeout: 3000 }).catch(() => {});
        } else if (roll < 0.95) {
          await p.mouse.wheel(0, (rand() - 0.3) * 2000);
        } else {
          await p.goto(`${BASE}/city/${slug}?s=${["food", "nightlife", "x", "", "tips"][Math.floor(rand() * 5)]}&open=${Math.floor(rand() * 3)}`);
        }
        await p.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
        if (!p.url().startsWith(BASE)) await p.goto(`${BASE}/city/${slug}`);
        const html = await p.content().catch(() => "");
        if (/Application error|Internal Server Error/.test(html)) problems.push(`error page at ${p.url()}`);
        const sw = await p.evaluate(() => document.documentElement?.scrollWidth ?? 0).catch(() => 0);
        if (sw > 392) problems.push(`horizontal overflow ${sw}px at ${p.url()}`);
        if (await p.evaluate(() => (window as any).__xss)) problems.push(`XSS executed at ${p.url()}`);
      } catch (e) {
        const msg = (e as Error).message.split("\n")[0];
        if (!/Timeout|detached|not visible|Target closed|intercepts pointer|navigating|Execution context was destroyed/.test(msg)) problems.push(`step ${i}: ${msg}`);
      }
    }
    await ctx.close();
  } finally {
    await b.close();
  }
  const uniq = [...new Set(problems)];
  check(`monkey ${slug} seed ${seed} (${steps} steps)`, uniq.length === 0, uniq.slice(0, 6).join(" | "));
}

async function demoMonkey(file: string, seed: number, steps: number) {
  const rand = rng(seed);
  const b = await chromium.launch();
  const problems: string[] = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const qrLib = process.env.QR_LIB_PATH;
    await ctx.route("https://cdn.jsdelivr.net/**", (r: any) => (qrLib ? r.fulfill({ contentType: "application/javascript", body: readFileSync(qrLib) }) : r.continue()));
    const p = await ctx.newPage();
    p.on("pageerror", (e: Error) => problems.push("pageerror: " + e.message));
    await p.goto("file://" + file);
    for (let i = 0; i < steps; i++) {
      const roll = rand();
      try {
        if (roll < 0.1) await p.selectOption("#city", { index: Math.floor(rand() * 9) });
        else if (roll < 0.17) await p.selectOption("#clock", { index: Math.floor(rand() * 6) });
        else if (roll < 0.22) {
          const pw = p.locator("#pw");
          if (await pw.count()) {
            await pw.fill(rand() < 0.7 ? "coastpass" : WEIRD[Math.floor(rand() * WEIRD.length)]);
            await pw.press("Enter");
          }
        } else if (roll < 0.3) {
          const inputs = p.locator("#overlay input, #view input:not([type=checkbox]), #view textarea");
          const n = await inputs.count();
          if (n) {
            const inp = inputs.nth(Math.floor(rand() * n));
            const numeric = (await inp.getAttribute("type")) === "number";
            await inp.fill(numeric ? String(Math.floor(rand() * 200) - 50) : WEIRD[Math.floor(rand() * WEIRD.length)]);
          }
        } else {
          const els = p.locator("#overlay button, #view button, #view summary, .tabbar button, .bar button");
          const n = await els.count();
          if (n) {
            const el = els.nth(Math.floor(rand() * n));
            if (await el.isVisible()) await el.click({ timeout: 1500 });
          }
        }
        if (i % 10 === 0) await p.waitForTimeout(rand() < 0.3 ? 2600 : 50); // let the pay/booking timers finish sometimes
        const sw = await p.evaluate(() => document.documentElement?.scrollWidth ?? 0).catch(() => 0);
        if (sw > 392) problems.push(`demo horizontal overflow ${sw}px (city ${await p.inputValue("#city")})`);
        if (await p.evaluate(() => (window as any).__xss)) problems.push("demo XSS executed");
      } catch (e) {
        const msg = (e as Error).message.split("\n")[0];
        if (!/Timeout|detached|not visible|intercepts pointer|not attached/.test(msg)) problems.push(`step ${i}: ${msg}`);
      }
    }
    await ctx.close();
  } finally {
    await b.close();
  }
  const uniq = [...new Set(problems)];
  check(`demo monkey seed ${seed} (${steps} steps)`, uniq.length === 0, uniq.slice(0, 6).join(" | "));
}

/* ================================================================== main */
const started = Date.now();
const admin = await adminCookie();
const slugs = (await cities(admin)).filter((s) => !s.startsWith("e2e-town"));
console.log(`Testing ${BASE} · ${slugs.length} cities · ${ROUNDS} round(s)`);

// Paid tokens per city: create real purchase rows through the public API is impossible without Stripe,
// so the harness relies on a seeded purchase per city (see seedPurchases) and signs access tokens for them.
// Seed one paid purchase per city (for guide access) and one pending purchase per city per round
// (for the webhook → access → refund journey). Local database only.
{
  const { execFileSync } = require("node:child_process");
  const ids = JSON.parse(execFileSync("npx", ["wrangler", "d1", "execute", "townpass", "--local", "--json", "--command", "SELECT id, slug FROM cities"], { encoding: "utf8" }))[0].results as { id: number; slug: string }[];
  const now = Date.now();
  const rows: string[] = [];
  for (const { id, slug } of ids) {
    rows.push(`INSERT OR REPLACE INTO purchases (id, city_id, status, amount_cents, currency, email, stripe_session_id, created_at, paid_at) VALUES ('e2e_paid_${slug}', ${id}, 'paid', 500, 'usd', 'e2e-paid@example.com', 'cs_test_e2e_paid_${slug}', ${now}, ${now});`);
    for (let r = 1; r <= ROUNDS; r++) {
      // real Stripe session ids are [A-Za-z0-9_] only
      rows.push(`INSERT OR REPLACE INTO purchases (id, city_id, status, amount_cents, currency, stripe_session_id, created_at) VALUES ('e2e_journey_${slug}_${r}', ${id}, 'pending', 500, 'usd', 'cs_test_e2e_journey_${slug.replace(/-/g, "_")}_${r}', ${now});`);
    }
  }
  rows.push("UPDATE cities SET published = 1;");
  writeFileSync(new URL("./.fixtures.sql", import.meta.url), rows.join("\n"));
  execFileSync("npx", ["wrangler", "d1", "execute", "townpass", "--local", "--file", new URL("./.fixtures.sql", import.meta.url).pathname], { stdio: "ignore" });
}
const tokens: Record<string, string> = {};
for (const s of slugs) tokens[s] = await signToken({ k: "access", p: `e2e_paid_${s}` }, vars.ACCESS_TOKEN_SECRET);

for (let round = 1; round <= ROUNDS; round++) {
  console.log(`\n=== Round ${round} ===`);
  await suite("smoke: public pages", () => smokePublic(slugs));
  await suite("smoke: paid guide pages", () => smokeGuide(slugs, tokens));
  await suite("smoke: admin pages", () => smokeAdmin(admin, slugs));
  await suite("security", () => security(slugs, tokens));
  await suite("bug: checkout + webhook edge cases", () => purchaseFlow(slugs[0], admin));
  const jslug = slugs[round % slugs.length];
  await suite(`bug: paid journey (${jslug})`, () => paidJourney(jslug, `e2e_journey_${jslug}_${round}`, `cs_test_e2e_journey_${jslug.replace(/-/g, "_")}_${round}`));
  await suite("bug: form fuzzing", () => formFuzz(slugs[round % slugs.length], tokens[slugs[round % slugs.length]], admin));
  await suite("browser: visitor flow", () => browserFlows(slugs[(round + 1) % slugs.length], tokens[slugs[(round + 1) % slugs.length]]));
  await suite("browser: admin flow", () => adminBrowserFlow(round));
  for (const [i, s] of slugs.entries()) await suite(`monkey: ${s}`, () => monkey(s, tokens[s], SEED + round * 1000 + i, MONKEY_STEPS));
  if (process.env.DEMO_FILE) await suite("monkey: demo page", () => demoMonkey(process.env.DEMO_FILE!, SEED + round * 7 + 1, MONKEY_STEPS * 4));
}

const failed = results.filter((r) => !r.ok);
const summary = { base: BASE, rounds: ROUNDS, total: results.length, passed: results.length - failed.length, failed: failed.length, minutes: +((Date.now() - started) / 60000).toFixed(1), failures: failed };
writeFileSync(new URL("./report.json", import.meta.url), JSON.stringify(summary, null, 2));
console.log(`\n${summary.passed}/${summary.total} checks passed in ${summary.minutes} min. ${failed.length ? "FAILURES above; see tests/e2e/report.json" : "All green."}`);
process.exit(failed.length ? 1 : 0);

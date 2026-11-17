// Security headers (public/_headers → dist/_headers, served by Cloudflare Pages and, in the tests,
// by tests/serve.mjs exactly the same way). Fails if a header is missing, or if the Content
// Security Policy blocks (or, in report-only mode, would block) anything the game does: every
// realm and dimension, the Shop, sign-in, the leaderboard, the share card, the release build with
// its offline service worker, the privacy and support pages. Every other test runs under the same
// headers too, so a blocked request also shows up there as a console error.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { openGame, profileOf, run, SAVE, settle, tap } from "./helpers.js";

const RELEASE = process.env.RELEASE_URL || "http://localhost:4318";
const HEADERS = readFileSync(join(import.meta.dirname, "..", "..", "public", "_headers"), "utf8");

/** Collects every CSP violation (enforced or report-only) the page reports, from its first byte. */
async function watchCsp(page) {
  const seen = [];
  page.on("console", (m) => {
    if (/Content[- ]Security[- ]Policy|Refused to (load|connect|execute|apply|create)/i.test(m.text())) seen.push(`console: ${m.text()}`);
  });
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener(
      "securitypolicyviolation",
      (e) => window.__csp.push(`${e.disposition} ${e.effectiveDirective}: ${e.blockedURI || "inline"} (${e.sourceFile || ""}:${e.lineNumber || 0})`),
      true,
    );
  });
  return async () => [...seen, ...(await page.evaluate(() => window.__csp || []).catch(() => []))];
}

test("security headers: all four on every page and file @smoke", async ({ request }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser lane");
  for (const path of ["/", "/privacy.html", "/support.html", "/manifest.json", "/sw.js"]) {
    const r = await request.get(RELEASE + path);
    expect(r.status(), path).toBe(200);
    const h = r.headers();
    expect(h["strict-transport-security"], path).toBe("max-age=31536000; includeSubDomains");
    expect(h["x-frame-options"], path).toBe("DENY");
    expect(h["permissions-policy"], path).toBe("camera=(), microphone=(), geolocation=()");
    // enforced (it ran as Content-Security-Policy-Report-Only first, with no violations)
    const csp = h["content-security-policy"];
    expect(csp, `${path}: an enforced Content Security Policy`).toBeTruthy();
    expect(h["content-security-policy-report-only"], path).toBeUndefined();
    for (const part of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'"])
      expect(csp, path).toContain(part);
  }
  // the game's sound, vibration, fullscreen and orientation are never switched off
  expect(HEADERS).not.toMatch(/autoplay=\(|vibrate=\(|fullscreen=\(|screen-wake-lock=\(/);
  // the hashed build files still cache for a year
  const index = await (await request.get(`${RELEASE}/`)).text();
  const asset = index.match(/\/assets\/[^"]+\.js/)[0];
  expect((await request.get(RELEASE + asset)).headers()["x-frame-options"]).toBe("DENY");
});

test("security headers: the policy blocks nothing in the game (realms, shop, sign-in, leaderboard, share) @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(400_000);
  const csp = await watchCsp(page);
  // online: the real start-up runs (leaderboard sign-in, remote seasons, crash reports); requests
  // leaving the machine are stopped by the test after the policy has judged them
  const log = await openGame(page, { flags: ["god"], online: true, save: { ...SAVE, coins: 999999 } });
  // every realm and dimension, drawn on arrival (as the nightly soak does)
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Game", { mode: "normal" }));
  await settle(page, "Game", 600);
  await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Game");
    if (s.state === "ready") s.onTap();
  });
  const zones = await page.evaluate(() => {
    const g = window.__glydrift;
    const s = g.scene.getScene("Game");
    let T = 1e6;
    let zone = null;
    let drawUntil = 0;
    const seen = new Set();
    for (let i = 0; i < 60 * 60 * 6 && s.state === "playing"; i++) {
      if (s.player.y > s.H * 0.55 && s.player.vy > -50) s.onTap();
      if (s.zoneId !== zone) ((zone = s.zoneId), (drawUntil = i + 60), seen.add(zone));
      window.__glyNoRender = !(i < drawUntil && i % 3 === 0);
      T += 1000 / 60;
      g.step(T, 1000 / 60);
    }
    window.__glyNoRender = false;
    return [...seen];
  });
  expect(zones.length).toBeGreaterThanOrEqual(12);
  // game over → the share card (its picture is fetched back from a data: address)
  await page.evaluate(() => {
    window.__glyGod(false);
    window.__glydrift.scene.getScene("Game").die();
  });
  await run(page, 3000);
  await settle(page, "GameOver", 2500);
  // (an unlock reveal can sit over GAME OVER: press its SHARE button itself)
  await page.evaluate(() => {
    const go = window.__glydrift.scene.getScene("GameOver");
    const find = (l) => {
      for (const o of l) {
        if (o.list?.some?.((t) => t.type === "Text" && t.text === "SHARE")) return o;
        const f = o.list && find(o.list);
        if (f) return f;
      }
    };
    const btn = find(go.children.list);
    btn.emit("pointerdown", {}, 0, 0, {});
    btn.emit("pointerup", {}, 0, 0, {});
  });
  await run(page, 1200);
  await expect(page.locator("#share-modal.open")).toBeVisible();
  await page.click("#share-modal [data-act=share]");
  await run(page, 800);
  await page.click("#share-modal [data-act=close]");
  // the Shop
  await page.evaluate(() => window.__glydrift.scene.getScene("GameOver").goto("Shop"));
  await settle(page, "Shop", 1500);
  // the leaderboard (its rows come from Supabase)
  await page.evaluate(() => window.__glydrift.scene.getScene("Shop").scene.start("Leaderboard"));
  await settle(page, "Leaderboard", 3000);
  // sign-in: the account screen and a sign-in attempt against the real Supabase address
  // (Sign in with Apple is the iPhone app's own screen: it never runs on glydrift.com)
  await page.evaluate(() => {
    window.__glyOpenAccount("signin");
  });
  await expect(page.locator("#account-modal.open")).toBeVisible();
  const email = page.locator("#account-modal input[name=email]");
  if (await email.count()) {
    await email.fill("csp-test@example.com");
    await page.fill("#account-modal input[name=password]", "not-a-real-password");
    await page.click("#account-modal button[type=submit]");
    await run(page, 3000);
  }
  const v = await csp();
  expect(v, "Content Security Policy violations").toEqual([]);
  // (online: requests stopped by the test show up as failed loads, never as console errors)
  expect(log.errors.filter((e) => /Content Security Policy|Refused to/i.test(e))).toEqual([]);
});

test("security headers: the release build, its offline worker and the privacy / support pages break no rule @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  test.setTimeout(240_000);
  const csp = await watchCsp(page);
  const log = await openGame(page, { base: RELEASE, screen: null });
  await run(page, 3000);
  for (const p of ["/privacy.html", "/support.html"]) {
    await page.goto(RELEASE + p);
    await page.waitForLoadState("load");
  }
  expect(await csp(), "Content Security Policy violations").toEqual([]);
  expect(log.errors).toEqual([]);
});

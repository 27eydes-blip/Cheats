// The creator credit and copyright must never disappear: no cleanup, polish pass or redesign
// may remove or hide them (see CLAUDE.md). This test fails the build if any of them is missing:
//   home screen     "Created by Sam Eyde III" — on screen, readable, not covered or cut off
//   Settings        CREDITS: "Glydrift", "Created by Sam Eyde III, Founder & CEO",
//                   "© 2026 Sam Eyde III. All rights reserved."
//   loading screen  "A Sam Eyde III game" under the GLYDRIFT logo
//   website footer, README and LICENSE: "© 2026 Sam Eyde III. All rights reserved."
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { openGame, profileOf, run, settle } from "./helpers.js";

const NAME = "Sam Eyde III";
const COPYRIGHT = "© 2026 Sam Eyde III. All rights reserved.";
const PHONES = ["iphone-small", "iphone-std", "iphone-large"];

/** Every visible text object in a scene (containers included), with its on-screen box. */
const texts = (page, key) =>
  page.evaluate((key) => {
    const sc = window.__glydrift.scene.getScene(key);
    const out = [];
    const walk = (o, a) => {
      if (!o.visible) return;
      const alpha = a * (o.alpha ?? 1);
      if (o.type === "Text") {
        const b = o.getBounds();
        out.push({
          text: o.text,
          alpha,
          size: parseFloat(o.style.fontSize) * Math.abs(o.scaleY) * (o.parentContainer?.scaleY ?? 1),
          x0: b.x,
          y0: b.y,
          x1: b.x + b.width,
          y1: b.y + b.height,
        });
      }
      (o.list || []).forEach((c) => walk(c, alpha));
    };
    sc.sys.displayList.list.forEach((o) => walk(o, 1));
    return { list: out, W: sc.W ?? sc.scale.width, H: sc.H ?? sc.scale.height };
  }, key);

test("creator credit: home screen shows \"Created by Sam Eyde III\", readable and on screen @smoke", async ({ page }, testInfo) => {
  test.skip(!PHONES.includes(profileOf(testInfo)), "every iPhone size");
  const log = await openGame(page);
  await settle(page, "Menu", 1500);
  const { list, W, H } = await texts(page, "Menu");
  const line = list.find((t) => t.text === `Created by ${NAME}`);
  expect(line, "the home screen credit line").toBeTruthy();
  expect(line.alpha).toBeGreaterThan(0.5);
  expect(line.size).toBeGreaterThanOrEqual(13);
  // fully on screen, and nothing drawn over it (no other text overlapping the line)
  expect(line.x0).toBeGreaterThanOrEqual(0);
  expect(line.x1).toBeLessThanOrEqual(W);
  expect(line.y0).toBeGreaterThanOrEqual(0);
  expect(line.y1).toBeLessThanOrEqual(H);
  const overlap = list.filter(
    (t) => t !== line && t.text && t.x0 < line.x1 && t.x1 > line.x0 && t.y0 < line.y1 && t.y1 > line.y0,
  );
  expect(overlap.map((t) => t.text)).toEqual([]);
  expect(log.errors).toEqual([]);
});

test("creator credit: Settings has CREDITS with the creator and the copyright @smoke", async ({ page }, testInfo) => {
  test.skip(!PHONES.includes(profileOf(testInfo)), "every iPhone size");
  const log = await openGame(page);
  await settle(page, "Menu", 1200);
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").openSettings());
  await run(page, 600);
  const { list, H } = await texts(page, "Menu");
  for (const want of ["Glydrift", `Created by ${NAME}, Founder & CEO`, COPYRIGHT]) {
    const t = list.find((x) => x.text === want);
    expect(t, `Settings shows "${want}"`).toBeTruthy();
    expect(t.alpha).toBeGreaterThan(0.5);
    expect(t.size).toBeGreaterThanOrEqual(12);
    expect(t.y0).toBeGreaterThanOrEqual(0);
    expect(t.y1).toBeLessThanOrEqual(H);
  }
  expect(log.errors).toEqual([]);
});

test("creator credit: loading screen, website footer, README and LICENSE @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser");
  // the loading screen and footer are in the page the server sends (shown before the game loads)
  const html = await (await page.request.get("/")).text();
  const splash = html.slice(html.indexOf('<div id="splash"'), html.indexOf("</div>", html.indexOf('class="bar"')));
  expect(splash).toContain("GLYDRIFT");
  expect(splash).toContain(`A ${NAME} game`);
  expect(splash.indexOf(`A ${NAME} game`)).toBeGreaterThan(splash.indexOf("GLYDRIFT")); // under the logo
  // (the footer may hold no-wrap spans so a narrow side area never splits the name: check its text)
  const footer = html.match(/<footer id="legal">([\s\S]*?)<\/footer>/);
  expect(footer).not.toBeNull();
  const footerText = footer[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ");
  expect(footerText).toContain("Created by Sam Eyde III");
  expect(footerText).toContain("© 2026 Sam Eyde III. All rights reserved.");
  // the repository files
  expect(readFileSync("README.md", "utf8")).toContain(COPYRIGHT);
  expect(readFileSync("LICENSE", "utf8")).toContain(COPYRIGHT);
  expect(readFileSync("src/legal.js", "utf8")).toContain(`CREATOR = "${NAME}"`);
});

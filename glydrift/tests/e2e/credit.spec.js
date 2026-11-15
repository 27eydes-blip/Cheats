// The publisher credit, the creator credit and the copyright must never disappear: no cleanup,
// polish pass or redesign may remove or hide them (see CLAUDE.md). This test fails the build if
// any of them is missing:
//   home screen     "Gleyde Technologies, LLC · Created by Sam Eyde III" — on screen, readable,
//                   not covered or cut off
//   Settings        CREDITS: "Glydrift", "Published by Gleyde Technologies, LLC",
//                   "Created by Sam Eyde III, Founder & CEO",
//                   "© 2026 Gleyde Technologies, LLC. All rights reserved."
//   loading screen  "Gleyde Technologies, LLC" under the GLYDRIFT logo
//   website footer, README, LICENSE, AUTHORSHIP.md and the App Store copyright text
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { openGame, profileOf, run, settle } from "./helpers.js";

const NAME = "Sam Eyde III";
const PUBLISHER = "Gleyde Technologies, LLC";
const COPYRIGHT = "© 2026 Gleyde Technologies, LLC. All rights reserved.";
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

test("credits: home screen shows \"Gleyde Technologies, LLC · Created by Sam Eyde III\", readable and on screen @smoke", async ({ page }, testInfo) => {
  test.skip(!PHONES.includes(profileOf(testInfo)), "every iPhone size");
  const log = await openGame(page);
  await settle(page, "Menu", 1500);
  const { list, W, H } = await texts(page, "Menu");
  const line = list.find((t) => t.text === `${PUBLISHER} · Created by ${NAME}`);
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

test("credits: Settings has CREDITS with the publisher, the creator and the copyright @smoke", async ({ page }, testInfo) => {
  test.skip(!PHONES.includes(profileOf(testInfo)), "every iPhone size");
  const log = await openGame(page);
  await settle(page, "Menu", 1200);
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").openSettings());
  await run(page, 600);
  const { list, H } = await texts(page, "Menu");
  for (const want of ["Glydrift", `Published by ${PUBLISHER}`, `Created by ${NAME}, Founder & CEO`, COPYRIGHT]) {
    const t = list.find((x) => x.text === want);
    expect(t, `Settings shows "${want}"`).toBeTruthy();
    expect(t.alpha).toBeGreaterThan(0.5);
    expect(t.size).toBeGreaterThanOrEqual(12);
    expect(t.y0).toBeGreaterThanOrEqual(0);
    expect(t.y1).toBeLessThanOrEqual(H);
  }
  expect(log.errors).toEqual([]);
});

test("credits: loading screen, website footer, README, LICENSE, AUTHORSHIP.md and the App Store copyright @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser");
  // the loading screen and footer are in the page the server sends (shown before the game loads)
  const html = await (await page.request.get("/")).text();
  const splash = html.slice(html.indexOf('<div id="splash"'), html.indexOf("</div>", html.indexOf('class="bar"')));
  expect(splash).toContain("GLYDRIFT");
  expect(splash).toContain(`<div class="by">${PUBLISHER}</div>`);
  expect(splash.indexOf(PUBLISHER)).toBeGreaterThan(splash.indexOf("GLYDRIFT")); // under the logo
  // (the footer may hold no-wrap spans so a narrow side area never splits the name: check its text)
  const footer = html.match(/<footer id="legal">([\s\S]*?)<\/footer>/);
  expect(footer).not.toBeNull();
  const footerText = footer[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ");
  expect(footerText).toContain(PUBLISHER);
  expect(footerText).toContain("Created by Sam Eyde III");
  expect(footerText).toContain(COPYRIGHT);
  // the repository files
  for (const f of ["README.md", "LICENSE", "AUTHORSHIP.md"]) {
    const txt = readFileSync(f, "utf8");
    expect(txt, f).toContain(COPYRIGHT);
    expect(txt, f).toContain(`Created by ${NAME}`);
  }
  expect(readFileSync("appstore/APP_STORE_TEXT.md", "utf8")).toContain(`Copyright: \`2026 ${PUBLISHER}\``);
  expect(readFileSync("links/index.html", "utf8")).toContain(`${PUBLISHER} · Created by ${NAME} · ${COPYRIGHT}`);
  expect(readFileSync("src/legal.js", "utf8")).toContain(`CREATOR = "${NAME}"`);
  expect(readFileSync("src/legal.js", "utf8")).toContain(`PUBLISHER = "${PUBLISHER}"`);
  // spelled exactly: no "Gleyde Technologies LLC", "Gleyde Technologies, Inc." or "Gleyde Tech"
  for (const f of ["index.html", "links/index.html", "README.md", "LICENSE", "AUTHORSHIP.md", "src/legal.js", "appstore/APP_STORE_TEXT.md"])
    for (const m of readFileSync(f, "utf8").matchAll(/Gleyde[^\n]{0,25}/g)) expect(m[0], f).toMatch(/^Gleyde Technologies, LLC/);
});

// The Gleyde Technologies mark (src/ui/gleydeMark.js): a small gold diamond centred at the very
// bottom of the home screen, a real <button> (tap, click, keyboard), 35% opacity until hovered,
// never during a run or under a pop-up; it opens the Art Deco card about Gleyde Technologies.
import { expect, test } from "@playwright/test";
import { fieldPoint, openGame, press, profileOf, run, settle } from "./helpers.js";

const PHONES = ["iphone-small", "iphone-std", "iphone-large"];

const mark = (page) =>
  page.evaluate(() => {
    const b = document.getElementById("gleyde-mark");
    if (!b || b.hidden) return null;
    const r = b.getBoundingClientRect();
    const svg = b.querySelector("svg").getBoundingClientRect();
    const c = document.querySelector("#game canvas").getBoundingClientRect();
    return {
      tag: b.tagName,
      label: b.getAttribute("aria-label"),
      opacity: getComputedStyle(b).opacity,
      transition: getComputedStyle(b).transitionDuration,
      x: r.x + r.width / 2,
      top: r.top,
      bottom: r.bottom,
      svgW: Math.round(svg.width),
      canvasMid: c.x + c.width / 2,
      vh: innerHeight,
      text: b.textContent.trim(),
    };
  });

test("Gleyde mark: centred at the very bottom of the home screen, subtle, on screen, clear of every button @smoke", async ({ page }, testInfo) => {
  test.skip(!PHONES.includes(profileOf(testInfo)), "every iPhone size");
  const log = await openGame(page);
  await settle(page, "Menu", 1500);
  await run(page, 300);
  const m = await mark(page);
  expect(m).not.toBeNull();
  expect(m.tag).toBe("BUTTON");
  expect(m.label).toBe("About Gleyde Technologies");
  expect(m.text).toBe(""); // no label next to it
  expect(Number(m.opacity)).toBeCloseTo(0.35, 2);
  expect(m.transition).toBe("0.2s");
  expect(m.svgW).toBe(28);
  expect(Math.abs(m.x - m.canvasMid)).toBeLessThan(2);
  expect(m.bottom).toBeLessThanOrEqual(m.vh);
  // below everything else on the home screen: the ticker and the credit line sit above it
  const lowest = await page.evaluate(() => {
    const sc = window.__glydrift.scene.getScene("Menu");
    const cam = sc.cameras.main;
    const c = document.querySelector("#game canvas").getBoundingClientRect();
    const k = c.width / sc.scale.width;
    let max = 0;
    const walk = (o) => {
      if (!o.visible || o === sc.ticker) return;
      if (o.input?.enabled && o.getBounds) {
        const b = o.getBounds();
        max = Math.max(max, c.top + (b.bottom - cam.worldView.y) * cam.zoom * k);
      }
      (o.list || []).forEach(walk);
    };
    sc.sys.displayList.list.forEach(walk);
    return max;
  });
  expect(m.top, "no button of the home screen reaches down to the mark").toBeGreaterThanOrEqual(lowest);
  // hover: full opacity
  await page.hover("#gleyde-mark");
  await page.waitForTimeout(300);
  expect(Number(await page.evaluate(() => getComputedStyle(document.getElementById("gleyde-mark")).opacity))).toBe(1);
  expect(log.errors).toEqual([]);
});

test("Gleyde mark: opens the Art Deco card (tap and keyboard), closes with ×, a tap outside or Escape; never in a run or under a pop-up @smoke", async ({ page }, testInfo) => {
  test.skip(profileOf(testInfo) !== "iphone-std", "once per browser, at phone size");
  const log = await openGame(page);
  await settle(page, "Menu", 1500);
  await run(page, 300);
  await page.click("#gleyde-mark");
  const card = await page.evaluate(() => {
    const c = document.getElementById("gleyde-card");
    if (!c) return null;
    const cs = getComputedStyle(c);
    return {
      text: c.innerText.replace(/\s+/g, " ").trim(),
      bg: cs.backgroundColor,
      border: cs.borderTopColor,
      color: cs.color,
      font: cs.fontFamily,
      upper: cs.textTransform,
      logoW: Math.round(c.querySelector(".gl-logo svg").getBoundingClientRect().width),
      inset: getComputedStyle(c, "::before").borderTopColor,
      dialog: c.getAttribute("role"),
    };
  });
  expect(card).not.toBeNull();
  expect(card.text).toContain("GLEYDE TECHNOLOGIES, LLC");
  expect(card.text).toContain("CEO");
  expect(card.bg).toBe("rgb(11, 11, 10)");
  expect(card.border).toBe("rgb(184, 147, 74)");
  expect(card.inset).toBe("rgb(184, 147, 74)"); // the second, inset border line
  expect(card.color).toBe("rgb(226, 196, 119)");
  expect(card.font).toMatch(/Cinzel/);
  expect(card.upper).toBe("uppercase");
  expect(card.logoW).toBe(80);
  expect(card.dialog).toBe("dialog");
  // the game underneath didn't react to the tap (no run started, still the home screen)
  expect(await page.evaluate(() => window.__glydrift.scene.isActive("Menu"))).toBe(true);
  // Escape closes it
  await page.keyboard.press("Escape");
  await run(page, 300);
  expect(await page.evaluate(() => !!document.getElementById("gleyde-card-wrap"))).toBe(false);
  // keyboard: focus the mark, Enter opens; × closes
  await page.focus("#gleyde-mark");
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => !!document.getElementById("gleyde-card"))).toBe(true);
  await page.click("#gleyde-card .gl-close");
  await run(page, 300);
  expect(await page.evaluate(() => !!document.getElementById("gleyde-card-wrap"))).toBe(false);
  // a tap outside the card closes it
  await page.click("#gleyde-mark");
  await page.mouse.click(10, 10);
  await run(page, 300);
  expect(await page.evaluate(() => !!document.getElementById("gleyde-card-wrap"))).toBe(false);
  // under a pop-up (Settings): hidden
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").openSettings());
  await run(page, 300);
  expect(await mark(page)).toBeNull();
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").closeModal());
  await run(page, 800);
  expect(await mark(page)).not.toBeNull(); // back once Settings closes
  // in a run: gone
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Game", { mode: "normal" }));
  await settle(page, "Game", 600);
  await press(page, await fieldPoint(page));
  await run(page, 300);
  expect(await mark(page)).toBeNull();
  expect(log.errors).toEqual([]);
});

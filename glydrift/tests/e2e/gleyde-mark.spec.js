// The small Gleyde Technologies mark under the home screen (src/ui/gleydeMark.js):
//  - a real button, centred at the very bottom, quiet (35% opacity), never over a game button
//    or the credit line
//  - opens the Art Deco "about" card; the backdrop, × and Escape close it
//  - only on the clean home screen: never while flying or behind a pop-up
import { expect, test } from "@playwright/test";
import { fieldPoint, openGame, press, run, settle, tap } from "./helpers.js";

/** On-screen boxes (CSS px) of every labelled game button, the ticker and the credit line. */
const gameBoxes = (page) =>
  page.evaluate(() => {
    const g = window.__glydrift;
    const m = g.scene.getScene("Menu");
    const r = g.canvas.getBoundingClientRect();
    const k = r.height / g.scale.height;
    const out = [];
    const walk = (o) => {
      if (!o.visible) return;
      if (o.a11yLabel || o.name === "creatorCredit") {
        const b = o.getBounds();
        out.push({
          label: o.a11yLabel || "credit",
          x0: r.left + b.x * k,
          y0: r.top + b.y * k,
          x1: r.left + (b.x + b.width) * k,
          y1: r.top + (b.y + b.height) * k,
        });
      }
      (o.list || []).forEach(walk);
    };
    m.sys.displayList.list.forEach(walk);
    out.push({
      label: "ticker",
      x0: r.left,
      x1: r.right,
      y0: r.top + (m.tickY - 24) * k,
      y1: r.top + (m.tickY + 24) * k,
    });
    return {
      boxes: out,
      cx: r.left + r.width / 2,
      bottom: Math.min(r.bottom, innerHeight),
    };
  });

test("Gleyde mark: quiet button centred under the home screen, opens the about card @smoke", async ({
  page,
}) => {
  const log = await openGame(page);
  await settle(page, "Menu", 1500);
  await run(page, 400);
  const mark = page.getByRole("button", { name: "About Gleyde Technologies" });
  await expect(mark).toBeVisible();
  expect(await mark.evaluate((el) => getComputedStyle(el).opacity)).toBe(
    "0.35",
  );
  expect(await mark.evaluate((el) => el.tagName)).toBe("BUTTON");
  const svg = await mark.locator("svg").boundingBox();
  expect(Math.round(svg.width)).toBe(28);

  // centred, at the very bottom, clear of every button, the ticker and the credit line
  const box = await mark.boundingBox();
  const { boxes, cx, bottom } = await gameBoxes(page);
  expect(Math.abs(box.x + box.width / 2 - cx)).toBeLessThanOrEqual(1);
  expect(box.y + box.height).toBeLessThanOrEqual(bottom + 0.5);
  const hits = boxes.filter(
    (b) =>
      b.x0 < box.x + box.width &&
      b.x1 > box.x &&
      b.y0 < box.y + box.height - 0.5 &&
      b.y1 > box.y + 0.5,
  );
  expect(hits.map((b) => b.label)).toEqual([]);
  for (const b of boxes)
    expect(b.y1, `${b.label} sits above the mark`).toBeLessThanOrEqual(
      box.y + 0.5,
    );

  // the card: the company, CEO; × / Escape / the backdrop close it
  await mark.click();
  const card = page.getByRole("dialog", { name: "Gleyde Technologies, LLC" });
  await expect(card).toBeVisible();
  await expect
    .poll(() => card.evaluate((el) => getComputedStyle(el).opacity))
    .toBe("1"); // (faded in)
  await expect(card).toContainText("GLEYDE TECHNOLOGIES, LLC");
  await expect(card).toContainText("CEO");
  expect(Math.round((await card.locator("svg").boundingBox()).width)).toBe(80);
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
  await mark.focus();
  await page.keyboard.press("Enter");
  await expect(card).toBeVisible();
  await page.mouse.click(4, 4); // the dimmed background
  await expect(card).toBeHidden();
  await mark.click();
  await card.getByRole("button", { name: "Close" }).click();
  await expect(card).toBeHidden();
  expect(
    await page.evaluate(() => window.__glydrift.scene.isActive("Menu")),
  ).toBe(true);
  expect(log.errors).toEqual([]);
});

test("Gleyde mark: hidden during a run and behind the MORE sheet @smoke", async ({
  page,
}) => {
  await openGame(page);
  await settle(page, "Menu", 1500);
  await run(page, 400);
  const mark = page.getByRole("button", { name: "About Gleyde Technologies" });
  await expect(mark).toBeVisible();
  await tap(page, "MORE", 700);
  await expect(mark).toBeHidden();
  await page.evaluate(() =>
    window.__glydrift.scene.getScene("Menu").scene.restart(),
  );
  await settle(page, "Menu", 1500);
  await run(page, 400);
  await expect(mark).toBeVisible();
  await tap(page, "ENDLESS", 0);
  await settle(page, "Game", 400);
  await press(page, await fieldPoint(page)); // flying
  await run(page, 400);
  await expect(mark).toBeHidden();
});

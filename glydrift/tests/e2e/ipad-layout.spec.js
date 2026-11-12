// iPad (short screens): buttons never cover the text next to them.
import { expect, test } from "@playwright/test";
import { openGame, profileOf, run } from "./helpers.js";

test("iPad: the hero card's TAP TO EDIT and the Pass's TIER REWARD line clear their buttons @smoke", async ({
  page,
}, testInfo) => {
  test.skip(!["ipad-portrait", "iphone-std"].includes(profileOf(testInfo)), "iPad, and a phone for contrast");
  const log = await openGame(page);
  await page.evaluate(() => window.__glydrift.scene.getScene("Menu").scene.start("Characters"));
  await run(page, 1500);
  const heroes = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Characters");
    const card = s.cards[s.index];
    // (the pill sits in the card container: its bottom edge is 22 below its centre, scaled)
    const pill = card.y + (card.edit.y + 22) * card.scaleY;
    // (a button's bounds are its label only: its drawn box is 100 tall, centred)
    const btn = s.actionBtn;
    return { pill, button: btn.y - 50 * btn.scaleY };
  });
  expect(heroes.pill, JSON.stringify(heroes)).toBeLessThanOrEqual(heroes.button);
  await page.evaluate(() => window.__glydrift.scene.getScene("Characters").scene.start("Pass"));
  await run(page, 2000);
  const pass = await page.evaluate(() => {
    const s = window.__glydrift.scene.getScene("Pass");
    const all = s.children.list;
    const cap = all.find((o) => o.type === "Text" && /TIER \d+ REWARD|SEASON HERO/.test(o.text));
    const btn = all.find((o) => o.type === "Container" && /^(GET|OWNED)$/.test(o.label?.text || ""));
    // (the GET / OWNED box is 76 tall, centred on the button)
    return { cap: cap?.getBounds().bottom, btn: btn ? btn.y - 38 * btn.scaleY : undefined };
  });
  expect(pass.cap, JSON.stringify(pass)).toBeDefined();
  expect(pass.btn, JSON.stringify(pass)).toBeDefined();
  expect(pass.cap).toBeLessThanOrEqual(pass.btn);
  expect(log.errors).toEqual([]);
});

import { expect, test, type Page } from "@playwright/test";

// Times, counts, the rotating Live Wire, and market prices/charts change between runs, so they are masked.
const mask = (page: Page) => [
  page.locator("time"), page.locator(".mono"), page.locator(".num"), page.locator('[aria-label="Live Wire"]'),
  page.locator('[aria-label="Markets: open the Market Board"]'), page.locator("section[aria-labelledby=mkt] ul"),
  page.locator('[aria-label="Stock ticker"]'), page.locator('section[aria-label="Major indexes"]'), page.locator('section[aria-label$=" chart"]'),
  page.locator("section[aria-labelledby=heat]"), page.locator("section[aria-labelledby=movers]"), page.locator("section[aria-labelledby=wl] ul"),
];

async function login(page: Page) {
  await page.goto("/login");
  await page.fill("#email", "admin@townsquare.test");
  await page.fill("#password", "townsquare-admin");
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

const PUBLIC = [
  ["front-page", "/"],
  ["story", "/news/story/infrastructure"],
  ["byline", "/u/maria_lopez"],
  ["desks", "/communities"],
  ["desk", "/c/politics"],
  ["live-studio", "/live"],
  ["briefing", "/briefing"],
  ["signup", "/signup"],
] as const;

for (const [name, path] of PUBLIC) {
  test(name, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    await expect(page).toHaveScreenshot(`${name}.png`, { mask: mask(page) });
  });
}

test("rundown (signed in)", async ({ page }) => {
  await login(page);
  await page.goto("/rundown", { waitUntil: "networkidle" });
  await expect(page).toHaveScreenshot("rundown.png", { mask: mask(page) });
});

test("markets board (signed in)", async ({ page }) => {
  await login(page);
  await page.goto("/markets", { waitUntil: "networkidle" });
  await expect(page).toHaveScreenshot("markets.png", { mask: mask(page) });
});

test("control room", async ({ page }) => {
  await login(page);
  await page.goto("/admin", { waitUntil: "networkidle" });
  await expect(page).toHaveScreenshot("control-room.png", { mask: mask(page) });
});

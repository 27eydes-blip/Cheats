import { expect, test, type Page } from "@playwright/test";

// Times ("5m", "Nov 20") and live counters change between runs, so they are masked.
const mask = (page: Page) => [page.locator("time"), page.locator(".num"), page.locator('[role="region"][aria-label="Breaking news"]')];

async function login(page: Page) {
  await page.goto("/login");
  await page.fill("#email", "admin@townsquare.test");
  await page.fill("#password", "townsquare-admin");
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

const PUBLIC = [
  ["landing", "/"],
  ["news", "/news"],
  ["story", "/news/story/bikelanes"],
  ["communities", "/communities"],
  ["community", "/c/localnews"],
  ["live", "/live"],
  ["profile", "/u/maria_lopez"],
  ["login", "/login"],
] as const;

for (const [name, path] of PUBLIC) {
  test(`${name}`, async ({ page }) => {
    await page.goto(path, { waitUntil: "networkidle" });
    await expect(page).toHaveScreenshot(`${name}.png`, { mask: mask(page) });
  });
}

test("home (signed in)", async ({ page }) => {
  await login(page);
  await page.goto("/?tab=foryou", { waitUntil: "networkidle" });
  await expect(page).toHaveScreenshot("home.png", { mask: mask(page) });
});

test("admin", async ({ page }) => {
  await login(page);
  await page.goto("/admin", { waitUntil: "networkidle" });
  await expect(page).toHaveScreenshot("admin.png", { mask: mask(page) });
});

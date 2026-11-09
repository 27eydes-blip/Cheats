import { devices, expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test.describe("device-tuned layouts", () => {
  test("phone opens to a big camera button", async ({ browser }) => {
    const ctx = await browser.newContext({ ...devices["iPhone 13"] });
    const page = await ctx.newPage();
    await signIn(page);
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Snap notes" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Snap your notes" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Write" })).toHaveCount(0);
    await ctx.close();
  });

  test("iPad gets Pencil writing", async ({ browser }) => {
    const ctx = await browser.newContext({ ...devices["iPad Pro 11"] });
    const page = await ctx.newPage();
    await signIn(page);
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Write with Pencil/ })).toBeVisible();
    await page.getByRole("link", { name: /Write with Pencil/ }).click();
    const canvas = page.getByTestId("ink-canvas");
    await expect(canvas).toBeVisible();
    // Draw a stroke with a pen pointer.
    const box = (await canvas.boundingBox())!;
    await canvas.dispatchEvent("pointerdown", { pointerId: 1, pointerType: "pen", pressure: 0.6, clientX: box.x + 50, clientY: box.y + 80, buttons: 1 });
    for (let i = 1; i < 20; i++) {
      await canvas.dispatchEvent("pointermove", { pointerId: 1, pointerType: "pen", pressure: 0.6, clientX: box.x + 50 + i * 8, clientY: box.y + 80 + (i % 4) * 3, buttons: 1 });
    }
    await canvas.dispatchEvent("pointerup", { pointerId: 1, pointerType: "pen", clientX: box.x + 210, clientY: box.y + 80 });
    // Palm (touch) after a pen is ignored: nothing to test visually, but undo should now be enabled.
    await expect(page.getByRole("button", { name: "Undo" }).first()).toBeEnabled();
    await page.getByRole("button", { name: "Read my notes" }).click();
    await page.waitForURL(/\/notes\//);
    await expect(page.getByTestId("page-text")).toBeVisible({ timeout: 30_000 });
    await ctx.close();
  });

  test("dark mode toggles and persists", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    const initial = await html.getAttribute("data-theme");
    await page.getByRole("button", { name: /Switch to (dark|light) mode/ }).click();
    await expect(html).not.toHaveAttribute("data-theme", initial!);
    await page.reload();
    await expect(html).not.toHaveAttribute("data-theme", initial!);
  });
});

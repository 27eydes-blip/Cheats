import { expect, test } from "@playwright/test";

/** The "Latest" ticker in a real browser: 32px tall, 44px tap targets, no layout shift, reduced motion honored. */
test.describe("latest ticker", () => {
  test("is one 32px line with 44px tap targets and no layout shift", async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((l) => {
        for (const e of l.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto("/");
    const bar = page.locator('[aria-roledescription="ticker"]:visible').first();
    await expect(bar).toBeVisible();
    const box = (await bar.boundingBox())!;
    expect(Math.round(box.height)).toBeLessThanOrEqual(33); // 32px plus the hairline
    const links = bar.locator('[data-tap="wire"]:visible');
    const n = await links.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < Math.min(n, 6); i++) {
      const b = await links.nth(i).boundingBox();
      if (b && b.width > 0) expect(b.height).toBeGreaterThanOrEqual(44);
    }
    // The headline link can be tapped at its top edge, above the 32px bar's own box.
    const head = bar.locator('.wire-headline:visible').first();
    const hb = (await head.boundingBox())!;
    const hit = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest(".wire-headline"), [hb.x + 20, hb.y + 2]);
    expect(hit).toBe(true);
    await page.waitForTimeout(7_000); // through one headline change
    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
    expect(cls).toBeLessThan(0.02);
  });

  test("reduced motion: no progress line or scrolling", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const bar = page.locator('[aria-roledescription="ticker"]:visible').first();
    await expect(bar).toHaveAttribute("data-reduced", "true");
    await expect(bar.locator(".wire-progress")).toHaveCount(0);
    const dotAnim = await bar.locator(".wire-dot").first().evaluate((el) => getComputedStyle(el, "::after").animationName);
    expect(dotAnim).toBe("none");
  });
});

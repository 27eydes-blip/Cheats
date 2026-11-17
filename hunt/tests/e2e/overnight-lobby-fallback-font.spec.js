// The racing lobby's one-line labels (car name and role, LAUNCH line, crew name, the centred mode card)
// are never cut, even when the web fonts are slow or blocked and a wider fallback font is drawn
// (seen in Firefox at 320x568: the role line "ALL-ROUNDER · TESLA ARC" was ellipsed).
import { test, expect } from '@playwright/test';
import { trackErrors } from './helpers.js';

const LABELS = '.sp-launch-txt small, #npName, #npRole, .sp-who-name, .sp-card.on .sp-card-name';

// wide: the fallback a Linux box draws when the lobby's narrow fonts are missing (DejaVu Sans, as on
// the CI runner); a phone's own fallback is narrower than this
for (const [w, h, wide] of [[320, 568, false], [667, 375, false], [320, 568, true], [667, 375, true]]) {
  test(`${w}x${h}, web fonts blocked${wide ? ', a wide fallback font' : ''}: no lobby label is cut off`, async ({ page }) => {
    const errors = trackErrors(page); // (font requests from other sites are not counted)
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    if (wide) await page.addInitScript(() => addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '#lobby.sp, #lobby.sp * { font-family: "DejaVu Sans", Verdana, sans-serif !important; }'; document.head.appendChild(st); }));
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/'); await page.waitForSelector('#playBtn');
    await expect(page.locator('#npRole')).not.toBeEmpty();
    await page.waitForTimeout(500); // (the fit runs on the next frame)
    const cut = await page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((el) => el.clientWidth && el.scrollWidth > el.clientWidth + 1).map((el) => `${el.id || el.className}: ${el.textContent.trim()}`), LABELS);
    expect(cut).toEqual([]);
    expect(errors).toEqual([]);
  });
}

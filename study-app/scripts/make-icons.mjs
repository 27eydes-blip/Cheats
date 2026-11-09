// Renders the app icon SVG to PNGs for the PWA manifest and iOS home screen.
// Usage: node scripts/make-icons.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const svg = readFileSync(new URL("../src/app/icon.svg", import.meta.url), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
const jobs = [
  
  
  
  ["src/app/apple-icon.png", 180, 0],
];
for (const [out, size, pad] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - pad * 2));
  await page.setContent(
    `<body style="margin:0;background:#08090b;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">
      <div style="width:${inner}px;height:${inner}px">${svg.replace("<svg", `<svg width="${inner}" height="${inner}"`)}</div></body>`,
  );
  await page.screenshot({ path: out, omitBackground: false });
}
await browser.close();

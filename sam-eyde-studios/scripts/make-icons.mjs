// Renders the SES monogram SVG into the PNG icons iOS and the PWA manifest need.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Playwright is a globally installed dev tool, not a project dependency.
const { chromium } = createRequire(import.meta.url)("playwright");

const pub = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const svg = readFileSync(join(pub, "icon.svg"), "utf8");
// Full-bleed variant: iOS and maskable icons are cropped by the OS, so no rounded corners.
const fullBleed = svg
  .replace('<rect width="512" height="512" rx="112" fill="#0b0b10"/>', "")
  .replace('<rect x="36" y="36" width="440" height="440" rx="92"', '<rect width="512" height="512"');

const targets = [
  ["icon-192.png", 192, svg],
  ["icon-512.png", 512, svg],
  ["icon-maskable-512.png", 512, fullBleed],
  ["apple-touch-icon.png", 180, fullBleed],
];

const browser = await chromium.launch();
for (const [name, size, source] of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${source}`,
  );
  await page.screenshot({ path: join(pub, name), omitBackground: true });
  await page.close();
  console.log("wrote", name);
}
await browser.close();

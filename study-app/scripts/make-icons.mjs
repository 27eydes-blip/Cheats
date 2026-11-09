// Renders the Flashdrop logo (assets/brand/*.svg) to the PNG/ICO files
// browsers and phones ask for. Usage: node scripts/make-icons.mjs
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

const svg = (name) => readFileSync(new URL(`../assets/brand/${name}.svg`, import.meta.url), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();

async function png(source, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:transparent">${source.replace("<svg", `<svg width="${size}" height="${size}"`)}</body>`);
  return page.screenshot({ omitBackground: true });
}

// Browser tab: small mark (stays legible at 16px).
writeFileSync(new URL("../src/app/icon2.png", import.meta.url), await png(svg("logo-small"), 32));
// iPhone/iPad home screen & bookmarks: full mark, square (iOS rounds it).
writeFileSync(new URL("../src/app/apple-icon.png", import.meta.url), await png(svg("logo-full-square"), 180));

// favicon.ico with 16px and 32px PNG entries.
const images = [await png(svg("logo-small"), 16), await png(svg("logo-small"), 32)];
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
const dir = Buffer.alloc(16 * images.length);
let offset = 6 + dir.length;
images.forEach((img, i) => {
  const s = i === 0 ? 16 : 32;
  dir.writeUInt8(s, i * 16);
  dir.writeUInt8(s, i * 16 + 1);
  dir.writeUInt16LE(1, i * 16 + 4);
  dir.writeUInt16LE(32, i * 16 + 6);
  dir.writeUInt32LE(img.length, i * 16 + 8);
  dir.writeUInt32LE(offset, i * 16 + 12);
  offset += img.length;
});
writeFileSync(new URL("../src/app/favicon.ico", import.meta.url), Buffer.concat([header, dir, ...images]));
await browser.close();
console.log("icons written");

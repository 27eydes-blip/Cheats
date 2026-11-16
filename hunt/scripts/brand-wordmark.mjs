// Writes public/brand/wordmark.svg from public/brand/wordmark.js (the single source of the art) and
// renders docs/brand/wordmark-preview.png: the wordmark on dark backgrounds at several widths.
// Run from hunt/: node scripts/brand-wordmark.mjs   (needs the Playwright Chromium that the e2e tests use)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { wordmarkSvg } from '../public/brand/wordmark.js';

const svgOut = fileURLToPath(new URL('../public/brand/wordmark.svg', import.meta.url));
const docs = fileURLToPath(new URL('../docs/brand/', import.meta.url));
mkdirSync(docs, { recursive: true });
writeFileSync(svgOut, wordmarkSvg() + '\n');
console.log('wrote public/brand/wordmark.svg');

const WIDTHS = [1100, 720, 420, 240, 140];
const rows = (bg, label) => `<section style="background:${bg}"><h2>${label}</h2>${WIDTHS.map((w, i) =>
  `<div class="row"><span>${w} px</span><div style="width:${w}px">${wordmarkSvg({ id: `${label.length}x${i}` })}</div></div>`).join('')}</section>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 600 }, deviceScaleFactor: 1 });
await page.setContent(`<!doctype html><style>
  body{margin:0;background:#1d1f24;font:600 18px system-ui,sans-serif;color:#9aa0ab}
  section{padding:28px 40px 20px}
  h2{margin:0 0 14px;font-size:16px;font-weight:600;color:#c9ccd3}
  .row{display:flex;align-items:center;gap:28px;margin:0 0 22px}
  .row span{width:70px;text-align:right;flex:none;font-variant-numeric:tabular-nums}
  svg{display:block;width:100%;height:auto}
</style>${rows('#07040f', 'On near-black (splash)')}${rows('radial-gradient(circle at 30% 0,#2a0d52,#0b0519 70%)', 'On deep violet (lobby)')}`);
await page.screenshot({ path: docs + 'wordmark-preview.png', fullPage: true });
console.log('wrote docs/brand/wordmark-preview.png');
await browser.close();

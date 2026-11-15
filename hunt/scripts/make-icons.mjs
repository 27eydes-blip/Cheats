// Draws the Hunt app icons (original art: a gold reticle around a red hunter mask, the same mark
// as the loading splash) and saves the PNGs the manifest and index.html point at.
// Run from hunt/: node scripts/make-icons.mjs   (needs the Playwright Chromium that the e2e tests use)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../public/icons/', import.meta.url));
mkdirSync(out, { recursive: true });

// The mark lives in a 120x120 box. `scale` is how much of the icon it fills: maskable icons keep
// it inside the middle 80% (launchers crop the rest), and `round` rounds the corners of plain icons.
const svg = (size, { scale, round }) => {
  const m = (size * scale) / 120, off = (size - 120 * m) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs><radialGradient id="bg" cx="50%" cy="42%" r="75%"><stop offset="0" stop-color="#4a2c9a"/><stop offset=".55" stop-color="#2c1846"/><stop offset="1" stop-color="#150b24"/></radialGradient></defs>
  <rect width="${size}" height="${size}" rx="${round ? size * 0.2 : 0}" fill="url(#bg)"/>
  <g transform="translate(${off} ${off}) scale(${m})">
    <g fill="none" stroke-linecap="round">
      <circle cx="60" cy="60" r="44" stroke="#12091e" stroke-width="15"/>
      <circle cx="60" cy="60" r="44" stroke="#ffd23f" stroke-width="7"/>
      <path d="M60 4v22M60 94v22M4 60h22M94 60h22" stroke="#12091e" stroke-width="15"/>
      <path d="M60 4v22M60 94v22M4 60h22M94 60h22" stroke="#ffd23f" stroke-width="7"/>
    </g>
    <path d="M60 30 82 46 74 80 60 90 46 80 38 46Z" fill="#e0283f" stroke="#12091e" stroke-width="6" stroke-linejoin="round"/>
    <path d="M48 54l9 5-2 6-9-4zM72 54l-9 5 2 6 9-4z" fill="#ffd23f" stroke="#12091e" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M52 74l4 7 4-6 4 6 4-7" fill="none" stroke="#12091e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
};

const ICONS = [
  ['icon-192.png', 192, { scale: 0.8, round: true }],
  ['icon-512.png', 512, { scale: 0.8, round: true }],
  ['icon-maskable-192.png', 192, { scale: 0.62, round: false }],
  ['icon-maskable-512.png', 512, { scale: 0.62, round: false }],
  ['apple-touch-icon.png', 180, { scale: 0.76, round: false }], // iOS rounds the corners itself and wants no transparency
];

const browser = await chromium.launch();
for (const [name, size, opts] of ICONS) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg(size, opts)}`);
  await page.screenshot({ path: out + name, omitBackground: true });
  await page.close();
  console.log('wrote', name);
}
await browser.close();

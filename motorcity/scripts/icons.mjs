// Rasterise public/icon.svg into the PNG home-screen icons.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFile } from 'node:fs/promises';
const svg = await readFile(new URL('../public/icon.svg', import.meta.url), 'utf8');
const b = await chromium.launch();
for (const [n, f] of [[180, 'apple-touch-icon.png'], [512, 'icon-512.png']]) {
  const p = await b.newPage({ viewport: { width: n, height: n } });
  await p.setContent(`<style>html,body{margin:0;background:#0d0a07}</style>${svg.replace('<svg ', `<svg width="${n}" height="${n}" `)}`);
  await p.screenshot({ path: new URL(`../public/${f}`, import.meta.url).pathname });
  await p.close();
}
await b.close();

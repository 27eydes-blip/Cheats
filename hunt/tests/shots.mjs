// Screenshot helper for docs: node tests/shots.mjs <prefix> [base]
// Renders the brawler lineup and the lobby on an iPhone and an iPad.
import { chromium } from '@playwright/test';
const prefix = process.argv[2] || 'shot', base = process.argv[3] || 'http://127.0.0.1:8788';
const DEV = { iphone: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, ipad: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } };
const b = await chromium.launch();
for (const [dev, o] of Object.entries(DEV)) {
  const p = await (await b.newContext(o)).newPage();
  await p.goto(base + '/');
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `docs/upgrade/${prefix}-lobby-${dev}.jpg`, quality: 80 });
  await p.evaluate(async () => {
    const R = await import('/render.js'); const S = await import('/shared.js');
    const c = document.createElement('canvas'); const W = innerWidth, H = innerHeight;
    c.width = W * 2; c.height = H * 2; Object.assign(c.style, { position: 'fixed', inset: '0', width: W + 'px', height: H + 'px', zIndex: 999 });
    document.body.appendChild(c);
    const g = c.getContext('2d'); g.scale(2, 2);
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#2b2340'); bg.addColorStop(1, '#16121f'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const ids = S.BRAWLER_IDS, sc = Math.min(W / (ids.length * 70), H / 150);
    ids.forEach((id, i) => {
      const x = W * (i + 0.5) / ids.length, y = H * 0.48;
      R.drawBrawler(g, id, x, y, Math.PI * 0.35, 1.3, { scale: sc });
      R.outlinedText(g, S.BRAWLERS[id].name.toUpperCase(), x, H * 0.86, 16 * Math.min(1.4, sc / 1.6), '#fff');
    });
  });
  await p.waitForTimeout(300);
  await p.screenshot({ path: `docs/upgrade/${prefix}-brawlers-${dev}.jpg`, quality: 85 });
}
await b.close();

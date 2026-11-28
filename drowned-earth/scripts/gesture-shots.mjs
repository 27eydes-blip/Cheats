// node scripts/gesture-shots.mjs [out] — poses one person through every work/body-language activity in the
// character viewer, screenshots each (full body), and fails if any bone ends up NaN or a hand ends up
// below the feet / far from the body (a broken pose), or a seated person has no seat under them.
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = process.argv[2] || 'shots/gestures';
fs.mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 5199, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 480, height: 480 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
await page.goto(server.resolvedUrls.local[0] + '?viewer=1&clean=1&dynres=0&quality=medium');
await page.waitForFunction(() => window.__viewer, null, { timeout: 300000 });
const ACTS = (process.env.ACTS || 'idle,talk,listen,laugh,crossed,lean,sweep,carry,mend,fish,haul,hammer,cook,give,sit,sitTalk,walk').split(',');
let fails = 0;
await page.evaluate(() => { const v = window.__viewer; v.shot = 'full'; v.show(new URLSearchParams(location.search).get('who') || 'npc5'); });
for (const a of ACTS) {
  await page.evaluate((a) => { const p = window.__viewer.people[0]; p.doing(a); }, a);
  await page.evaluate(() => new Promise((r) => { const g = window.__game; const f0 = g.frame; const t = () => (g.frame - f0 > 14 ? r() : requestAnimationFrame(t)); t(); }));
  const chk = await page.evaluate(() => {
    const p = window.__viewer.people[0], b = p.human.bone, V = p.root.position.constructor;
    let nan = false; p.human.body.skeleton.bones.forEach((x) => { if (!Number.isFinite(x.quaternion.x + x.quaternion.w + x.position.x)) nan = true; });
    const w = (n) => p.root.worldToLocal(b[n].getWorldPosition(new V()));
    const L = w('wrist.L'), R = w('wrist.R'), F = w('foot.L');
    const far = Math.max(Math.hypot(L.x, L.z), Math.hypot(R.x, R.z));
    const seat = p.gest?.props?.seat;
    return { nan, lowHand: Math.min(L.y, R.y) < F.y - 0.05, far: +far.toFixed(2), seated: p.sitting, seat: !!seat?.visible, seatH: seat ? +seat.scale.y.toFixed(2) : 0, clip: p.currentName, layers: Object.keys(p.gest?.w || {}).join('+') };
  });
  await page.screenshot({ path: `${OUT}/${a}.png`, timeout: 600000 });
  const bad = chk.nan || chk.lowHand || chk.far > 1.2 || (chk.seated && !chk.seat);
  console.log(`${bad ? 'FAIL' : 'PASS'} ${a}: clip ${chk.clip}, layers ${chk.layers || '-'}, hands within ${chk.far} m${chk.seated ? `, seat ${chk.seat ? chk.seatH + ' m' : 'MISSING'}` : ''}${chk.nan ? ', NaN bone' : ''}${chk.lowHand ? ', hand below feet' : ''}`);
  if (bad) fails++;
}
if (errors.length) { console.log('PAGE ERRORS:', errors.slice(0, 4).join(' | ')); fails++; }
await browser.close(); await server.close();
process.exit(fails ? 1 : 0);

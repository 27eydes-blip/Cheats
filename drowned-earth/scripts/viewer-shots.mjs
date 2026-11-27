// Close-up/mid/crowd gallery from the character viewer, in one browser session.
//   node scripts/viewer-shots.mjs [out=shots/people] [WHO=a,b] [LIGHTS=day,dusk] [SHOTS=close,mid] [VIEW=WxH] [QUALITY=high]
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const OUT = process.argv[2] || 'shots/people';
fs.mkdirSync(OUT, { recursive: true });
const [W, H] = (process.env.VIEW || '960x540').split('x').map(Number);
const server = await createServer({ server: { port: 5198, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 600)); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(server.resolvedUrls.local[0] + `?viewer=1&clean=1&dynres=0&quality=${process.env.QUALITY || 'high'}`);
await page.waitForFunction(() => window.__viewer, null, { timeout: 300000 });
const who = (process.env.WHO || 'wren,teo,oru,koa,bram,keeper,marlow,ondine,calloway,voss,ansel').split(',');
const lights = (process.env.LIGHTS || 'day').split(',');
const shots = (process.env.SHOTS || 'close').split(',');
for (const w of who) for (const l of lights) for (const s of shots) {
  await page.evaluate(([w, l, s, emo]) => { const v = window.__viewer; v.row = s === 'crowd'; v.shot = s === 'crowd' ? 'full' : s; v.setLight(l); v.show(w); if (emo) v.people.forEach((p) => p.human.face.setEmotion(emo)); }, [w, l, s, process.env.EMOTION || '']);
  // let animation, TAA and textures settle
  await page.evaluate(() => new Promise((r) => { const g = window.__game; const f0 = g.frame; const t = () => (g.frame - f0 > 10 ? r() : requestAnimationFrame(t)); t(); }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${w}-${l}-${s}.png`, timeout: 600000 });
  console.log(`${w}-${l}-${s}`);
}
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 10).join('\n') : 'no errors');
await browser.close(); await server.close();

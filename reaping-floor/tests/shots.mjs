// Headless-Chrome mobile screenshots (390x780 @2x) of every screen, plus a console-error check.
//   node reaping-floor/tests/shots.mjs [outDir]
// Uses the pre-installed Playwright + Chromium. Fails (exit 1) on any console error or page error.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || join(here, 'shots');
mkdirSync(out, { recursive: true });
const url = pathToFileURL(join(here, '..', 'index.html')).href + '?test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const wait = (ms) => page.waitForTimeout(ms);
const shot = async (name) => { await page.screenshot({ path: join(out, name + '.png') }); console.log('shot', name); };
const RF = (fn, arg) => page.evaluate(fn, arg);
const dismiss = async () => { for (let i = 0; i < 6; i++) { const b = await page.$('[data-act=storyok]'); if (!b) break; await b.click(); await wait(350); } };

await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await wait(700);
await shot('01-intro-tap');
await page.mouse.click(195, 390);
await wait(2200);
await shot('02-intro-line');
await RF(() => window.__RF.introAt(9.9));
await wait(500);
await shot('03-intro-logo');
await page.mouse.click(195, 600);
await wait(700);
await shot('04-select');
await page.evaluate(() => document.querySelectorAll('[data-act=pick]')[49].scrollIntoView({ block: 'center' }));
await page.evaluate(() => document.querySelectorAll('[data-act=pick]')[49].click());
await wait(300);
await shot('05-select-picked');
await page.click('#enterBtn');
await wait(900);
await shot('06-story-prologue');
await page.click('[data-act=storyok]');
await wait(600);
await shot('07-hub');
await RF(() => window.__RF.sim(3));
await RF(() => window.__RF.hub('home'));
await wait(500);
await dismiss();
await page.evaluate(() => { document.querySelector('#ui').scrollTop = 520; });
await wait(300);
await shot('08-hub-scrolled');
for (const t of ['roster', 'table', 'stats', 'archive']) {
  await RF((x) => window.__RF.hub(x), t);
  await wait(400);
  await shot('09-tab-' + t);
}
await page.evaluate(() => document.querySelector('#tabs [data-tab=roster]').click());
await wait(300);
await page.evaluate(() => document.querySelector('[data-act=player]').click());
await wait(500);
await shot('10-player');
await page.evaluate(() => document.querySelector('[data-act=close]').click());
// a played game
await RF(() => window.__RF.hub('home'));
await wait(300);
await RF(() => window.__RF.play());
await wait(1200);
await shot('11-game-start');
await RF(() => window.__RF.step(24));
await wait(400);
await shot('12-game-midplay');
// touch: drag the joystick and press SHOOT/THROW for real
await page.touchscreen.tap(330, 640);
await wait(200);
await RF(() => window.__RF.dunk());
await wait(700);
await shot('13-game-dunk');
await wait(1300);
await shot('14-game-score-banner');
await RF(() => window.__RF.kill());
await wait(900);
await shot('14b-game-fallen');
await wait(3200);
await shot('14c-game-chalk-mark');
await page.mouse.click(364, 84);
await wait(400);
await shot('15-pause');
await page.evaluate(() => document.querySelector('[data-act=resume]').click());
await RF(() => window.__RF.finish());
await wait(900);
await shot('16-result');
await page.evaluate(() => document.querySelector('[data-act=cont]').click());
await wait(500);
await dismiss();
// playoffs, summary, draft, free agency
await RF(() => { const R = window.__RF; R.sim(16); R.hub('home'); });
await wait(500);
await dismiss();
await shot('17-playoffs');
await RF(() => { const R = window.__RF, L = R.L; let g = 0; while (L.phase === 'playoffs' && g++ < 10) R.RF.advancePlayoffs(L, null, null); L.story = []; R.hub('home'); });
await wait(500);
await shot('18-summary');
await page.evaluate(() => document.querySelector('[data-act=todraft]').click());
await wait(500);
await shot('19-draft');
await page.evaluate(() => document.querySelector('[data-act=dsim]') && document.querySelector('[data-act=dsim]').click());
await wait(400);
await page.evaluate(() => document.querySelector('[data-act=dpick]').click());
await wait(400);
await page.evaluate(() => document.querySelector('[data-act=dfinish]').click());
await wait(500);
await shot('20-free-agency');
await page.evaluate(() => document.querySelector('[data-act=fafinish]').click());
await wait(600);
await shot('21-new-year');
// the wall falls story
await RF(() => { const R = window.__RF; R.L.story = [4]; R.L.stage = 4; R.L.wall = true; R.L.upr = 100; R.hub('home'); });
await wait(800);
await shot('22-wall-falls');
await page.click('[data-act=storyok]');
await wait(400);
await shot('23-hub-rebel');
// desktop width
await page.setViewportSize({ width: 1280, height: 800 });
await wait(400);
await shot('24-desktop');

await browser.close();
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('no console errors');

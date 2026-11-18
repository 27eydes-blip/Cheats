// Security headers check for Glydaway: run with `node glydaway/tests/headers.test.cjs` (needs Playwright with Chromium).
// Builds the site the way the deploy does (server address filled in, then scripts/build-headers.mjs), serves
// it with the headers from dist/_headers, using the ENFORCING Content Security Policy, and plays through the
// game: home, a run, the glide level, the Locker Room and shop, the leaderboard, Settings and sign-in.
// Any CSP violation or page error fails the test.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..'), API = 'https://fake.supabase.test';
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'glyd-dist-'));
fs.mkdirSync(path.join(OUT, 'icons'));
fs.writeFileSync(path.join(OUT, 'index.html'), fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace('__GLYDAWAY_SUPABASE_URL__', API).replace('__GLYDAWAY_SUPABASE_KEY__', 'sb_publishable_test')); // like the deploy's sed
for (const f of fs.readdirSync(path.join(ROOT, 'icons'))) if (f.endsWith('.png')) fs.copyFileSync(path.join(ROOT, 'icons', f), path.join(OUT, 'icons', f));
execFileSync(process.execPath, [path.join(ROOT, 'scripts/build-headers.mjs'), OUT], { env: { ...process.env, SB_URL: API, CSP_ENFORCE: '1' }, stdio: 'inherit' });

// the _headers file: "/*" then "  Name: value" lines
const HEADERS = Object.fromEntries(fs.readFileSync(path.join(OUT, '_headers'), 'utf8').split('\n').filter(l => /^\s+\S/.test(l)).map(l => { const i = l.indexOf(':'); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const srv = http.createServer((q, r) => {
  const f = path.join(OUT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': f.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8', ...HEADERS }); r.end(d); });
}).listen(0);
let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };

(async () => {
  const csp = HEADERS['Content-Security-Policy'] || '';
  ok(/^max-age=31536000/.test(HEADERS['Strict-Transport-Security'] || '') && !/preload/.test(HEADERS['Strict-Transport-Security']), 'HSTS: one year, no preload');
  ok(/frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp) && /base-uri 'self'/.test(csp) && /default-src 'self'/.test(csp), 'CSP: default-src, frame-ancestors, object-src, base-uri');
  ok(!/unsafe-inline|unsafe-eval/.test(csp), 'CSP: no unsafe-inline or unsafe-eval (the inline script and style are allowed by hash)');
  ok(csp.includes(`connect-src 'self' ${API}`), 'CSP: only the leaderboard server can be called');
  ok(HEADERS['X-Frame-Options'] === 'DENY', 'X-Frame-Options: DENY');
  ok(HEADERS['Permissions-Policy'] === 'camera=(), microphone=(), geolocation=()', 'Permissions-Policy');
  ok(HEADERS['X-Content-Type-Options'] === 'nosniff' && HEADERS['Referrer-Policy'] === 'strict-origin-when-cross-origin', 'nosniff and Referrer-Policy');

  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 844, height: 390 } });
  await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)); });
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '/* fonts (stubbed in the test) */' }));
  await ctx.route(API + '/**', r => { const u = r.request().url(); r.fulfill({ status: 200, contentType: 'application/json', body: u.includes('/auth/v1/signup') ? JSON.stringify({ access_token: 't', refresh_token: 'r', expires_in: 3600, user: { id: 'u1', is_anonymous: true } }) : u.includes('/rpc/') ? 'null' : '[]' }); });
  const p = await ctx.newPage(), errs = [], consoleCsp = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) consoleCsp.push(m.text().slice(0, 160)); });
  const res = await p.goto(`http://localhost:${srv.address().port}/`);
  ok(res.headers()['content-security-policy'] === csp, 'the page is served with the enforcing CSP');
  await p.waitForTimeout(400);
  await p.evaluate(() => document.getElementById('splash').classList.add('gone'));
  await p.fill('#nameIn', 'Tester1'); await p.click('#nameForm button[type=submit]'); await p.waitForTimeout(400);
  ok(await p.evaluate(() => document.getElementById('startScreen').classList.contains('show')), 'the game starts (name saved, home screen)');
  // a run long enough to reach THE CLOUDS (glide level), on the autopilot
  await p.evaluate(() => { const g = __glyd; g.startGame(); for (let i = 0; i < 600 && g.S.mode === 'play'; i++) g.step(1 / 120); }); await p.waitForTimeout(300);
  ok(await p.evaluate(() => __glyd.S.dist > 0), 'a run plays (drawn under the enforcing CSP)');
  await p.evaluate(() => { const g = __glyd, S = g.S; S.time = 120; S.mode = 'dying'; for (let i = 0; i < 200 && S.mode !== 'over'; i++) g.step(1 / 120); });
  await p.waitForTimeout(300);
  await p.evaluate(() => { __glyd.S.mode = 'menu'; for (const s of document.querySelectorAll('.screen.show')) s.classList.remove('show'); document.getElementById('startScreen').classList.add('show'); });
  await p.click('#skinBtn', { force: true }); await p.waitForTimeout(500); await p.click('#tabShop'); await p.waitForTimeout(400); await p.click('#skinClose');
  await p.click('#lbBtn1', { force: true }); for (const t of ['#lbTabDist', '#lbTabWeek', '#lbTabCoins']) { await p.click(t); await p.waitForTimeout(250); } await p.click('#lbClose');
  await p.click('#setBtn1', { force: true }); await p.click('#acctOpen'); await p.waitForTimeout(200); await p.click('#acctClose'); await p.click('#setClose');
  // the autopilot flies a run through THE CLOUDS (the glide level), drawn frame by frame
  const p2 = await ctx.newPage(); p2.on('pageerror', e => errs.push(e.message)); p2.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) consoleCsp.push(m.text().slice(0, 160)); });
  await p2.goto(`http://localhost:${srv.address().port}/?bot=1`); await p2.waitForTimeout(300);
  const sky = await p2.evaluate(async () => { const g = __glyd; g.startGame(); let seen = false; for (let f = 0; f < 4000 && g.S.mode === 'play' && g.S.dist / 40 < 1050; f++) { for (let i = 0; i < 4; i++) g.step(1 / 120); if (g.S.sky) seen = true; if (f % 40 === 0) await new Promise(r => requestAnimationFrame(r)); } return { seen, mode: g.S.mode, m: Math.round(g.S.dist / 40), v: window.__csp }; });
  ok(sky.seen && sky.mode === 'play', `the glide level plays (${sky.m} m)`);
  if (sky.v.length) consoleCsp.push(...sky.v);
  await p2.close();
  const v = await p.evaluate(() => window.__csp);
  ok(!v.length && !consoleCsp.length, `no CSP violations while playing ${[...v, ...consoleCsp].join(' | ')}`);
  ok(!errs.length, `no page errors ${errs.join(' | ')}`);
  await b.close(); srv.close(); fs.rmSync(OUT, { recursive: true, force: true });
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

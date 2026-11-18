// Online checks for Glydaway: run with `node glydaway/tests/online.test.cjs` (needs Playwright with Chromium).
// The game talks to a fake Supabase (auth + the database functions in supabase/schema.sql, mirrored here
// in a few lines of JavaScript). The real database rules are checked separately by tests/db.test.sql.
// Covers: an anonymous player on first launch, the name asked once, scores posted after each run, the
// world / weekly / coins boards with your own rank, "Save my account" with an email code, signing in on a
// second device and choosing which progress to keep, claimed names, the rename limit, sign out, delete.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const srv = http.createServer((q, r) => {
  const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': 'text/html' }); r.end(d); } });
}).listen(0);
const URL = () => `http://localhost:${srv.address().port}/`;
const API = 'https://fake.supabase.test';
let fails = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };

// ---------------------------------------------------------------- a tiny fake Supabase
const week = () => { const d = new Date(), t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const y = t.getUTCFullYear(); return `${y}-W${String(Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7)).padStart(2, '0')}`; };
const DB = { users: {}, tokens: {}, profiles: {}, scores: [], progress: {}, transfers: {}, pending: {}, calls: [], emailsSent: 0, n: 0 };
const newUser = (email = null) => { const id = 'u' + (++DB.n); DB.users[id] = { id, email, anon: !email }; return id; };
const session = id => { const t = 'tok' + (++DB.n); DB.tokens[t] = id; const u = DB.users[id]; return { access_token: t, refresh_token: 'r' + t, expires_in: 3600, user: { id, email: u.email, is_anonymous: u.anon } }; };
const err = (status, message) => ({ status, body: { message, code: 'P0001' } });
const bestUp = (id, board, period, score, run) => { const r = DB.scores.find(s => s.id === id && s.board === board && s.period === period); if (!r) DB.scores.push({ id, board, period, score, at: Date.now(), ...run }); else if (score > r.score) Object.assign(r, { score, at: Date.now() }); };
const RPC = {
  glydaway_set_username(uid, { p_name }) {
    if (!/^[A-Za-z0-9]{3,12}$/.test(p_name) || /fuck|shit/i.test(p_name)) throw err(400, 'name_invalid');
    if (Object.entries(DB.profiles).some(([id, p]) => id !== uid && p.claimed && p.username.toLowerCase() === p_name.toLowerCase())) throw err(409, 'name_taken');
    const p = DB.profiles[uid], anon = DB.users[uid].anon;
    if (p && p.claimed && p.changedAt && p.username.toLowerCase() !== p_name.toLowerCase() && Date.now() - p.changedAt < 7 * 864e5) throw err(400, 'rename_too_soon');
    DB.profiles[uid] = { username: p_name, claimed: (p && p.claimed) || !anon, changedAt: p && p.username !== p_name ? Date.now() : p && p.changedAt };
    return { username: p_name };
  },
  glydaway_claim(uid) { const p = DB.profiles[uid]; if (!p) return {}; if (Object.entries(DB.profiles).some(([id, q]) => id !== uid && q.claimed && q.username.toLowerCase() === p.username.toLowerCase())) throw err(409, 'name_taken'); p.claimed = true; return { claimed: true }; },
  glydaway_submit_run(uid, { p_distance: d, p_coins: c, p_run_ms: ms }) {
    const p = DB.profiles[uid]; if (!p) throw err(400, 'no_username');
    if (!(d > 0) || c < 0 || ms < 500 || d > 28 * (ms / 1000) + 40 || c > d * 1.5 + 100) throw err(400, 'impossible_score');
    if (p.lastSubmit && Date.now() - p.lastSubmit < 1000) throw err(400, 'too_fast'); // (5 s in the real database; shortened here)
    p.lastSubmit = Date.now();
    for (const per of ['all', week()]) { bestUp(uid, 'distance', per, d, {}); if (c > 0) bestUp(uid, 'coins', per, c, {}); }
    return { week: week() };
  },
  glydaway_my_rank(uid, { p_board, p_period }) {
    const mine = DB.scores.find(s => s.id === uid && s.board === p_board && s.period === p_period); if (!mine) return null;
    return { score: mine.score, rank: 1 + DB.scores.filter(s => s.board === p_board && s.period === p_period && (s.score > mine.score || (s.score === mine.score && s.at < mine.at))).length };
  },
  glydaway_make_transfer(uid) { const c = 'x' + (++DB.n); DB.transfers[c] = uid; return c; },
  glydaway_merge(uid, { p_code }) {
    const src = DB.transfers[p_code]; delete DB.transfers[p_code]; if (!src) throw err(400, 'bad_code');
    for (const s of DB.scores.filter(s => s.id === src)) bestUp(uid, s.board, s.period, s.score, {});
    DB.scores = DB.scores.filter(s => s.id !== src); delete DB.profiles[src]; delete DB.progress[src]; delete DB.users[src];
    return { moved: 1 };
  },
  glydaway_delete_me(uid) { DB.scores = DB.scores.filter(s => s.id !== uid); delete DB.profiles[uid]; delete DB.progress[uid]; delete DB.users[uid]; return null; },
};
async function fake(route) {
  const req = route.request(), u = new globalThis.URL(req.url()), m = req.method(), body = req.postData() ? JSON.parse(req.postData()) : {};
  const uid = DB.tokens[(req.headers().authorization || '').replace('Bearer ', '')];
  const send = (status, obj) => route.fulfill({ status, contentType: 'application/json', body: obj === undefined ? '' : JSON.stringify(obj) });
  DB.calls.push(m + ' ' + u.pathname);
  try {
    if (u.pathname === '/auth/v1/signup') return send(200, session(newUser()));
    if (u.pathname === '/auth/v1/token') { const id = DB.tokens[String(body.refresh_token).slice(1)]; return id && DB.users[id] ? send(200, session(id)) : send(400, { error_code: 'refresh_token_not_found' }); }
    if (u.pathname === '/auth/v1/user' && m === 'PUT') {
      if (Object.values(DB.users).some(x => x.email === body.email)) return send(422, { code: 422, error_code: 'email_exists', msg: 'A user with this email address has already been registered' });
      DB.pending[uid] = body.email; DB.emailsSent++; return send(200, { id: uid });
    }
    if (u.pathname === '/auth/v1/otp') { if (!Object.values(DB.users).some(x => x.email === body.email)) return send(422, { error_code: 'otp_disabled' }); DB.emailsSent++; return send(200, {}); }
    if (u.pathname === '/auth/v1/verify') {
      if (body.token !== '123456') return send(403, { error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
      if (body.type === 'email_change') { DB.users[uid].email = DB.pending[uid]; DB.users[uid].anon = false; return send(200, session(uid)); }
      const id = Object.values(DB.users).find(x => x.email === body.email).id; return send(200, session(id));
    }
    if (u.pathname === '/auth/v1/logout') return send(204);
    if (u.pathname.startsWith('/rest/v1/rpc/')) { if (!uid) return send(401, { message: 'not_signed_in' }); return send(200, RPC[u.pathname.slice(13)](uid, body)); }
    if (u.pathname === '/rest/v1/glydaway_leaderboard') {
      const board = u.searchParams.get('board').slice(3), period = u.searchParams.get('period').slice(3);
      return send(200, DB.scores.filter(s => s.board === board && s.period === period).sort((a, b) => b.score - a.score || a.at - b.at).slice(0, 50)
        .map(s => ({ username: (DB.profiles[s.id] || {}).username, score: s.score, claimed: !!(DB.profiles[s.id] || {}).claimed, me: s.id === uid })));
    }
    if (u.pathname === '/rest/v1/glydaway_profiles') { const id = u.searchParams.get('id').slice(3), p = DB.profiles[id]; return send(200, p ? [{ username: p.username, claimed: p.claimed }] : []); }
    if (u.pathname === '/rest/v1/glydaway_progress') {
      if (m === 'GET') { const id = u.searchParams.get('id').slice(3); if (id !== uid) return send(200, []); const p = DB.progress[id]; return send(200, p ? [{ data: p.data, updated_at: new Date(p.at).toISOString() }] : []); }
      if (body.id !== uid) return send(403, { message: 'row-level security' }); DB.progress[uid] = { data: body.data, at: Date.now() }; return send(201);
    }
    return send(404, { message: 'not found' });
  } catch (e) { return send(e.status || 500, e.body || { message: String(e) }); }
}

// ---------------------------------------------------------------- helpers
async function device(b, { online = true, offline = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 } });
  if (online) await ctx.addInitScript(api => { window.GLYDAWAY_CONFIG = { url: api, key: 'sb_publishable_test' }; try { localStorage.setItem('glydaway.tutDone', 'true'); localStorage.setItem('glydaway.sidewaysTold', 'true'); } catch (e) {} }, API);
  await ctx.route(API + '/**', offline ? r => r.abort('internetdisconnected') : fake);
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', e => p.errs.push(e.message));
  await p.goto(URL()); await p.waitForTimeout(250);
  await p.evaluate(() => document.getElementById('splash').classList.add('gone'));
  return p;
}
const pickName = async (p, n) => { await p.fill('#nameIn', n); await p.click('#nameForm button[type=submit]'); await p.waitForTimeout(400); };
const playRun = (p, m, coins) => p.evaluate(([m, coins]) => { // a finished run of m metres
  const g = __glyd, S = g.S; g.startGame(); S.obstacles.length = 0; S.dist = m * 40; S.time = Math.max(5, m / 10); S.coins = coins;
  S.mode = 'dying'; for (let i = 0; i < 200 && S.mode !== 'over'; i++) g.step(1 / 120);
}, [m, coins]);
const board = async (p, tab) => { await p.evaluate(() => { __glyd.S.mode = 'menu'; document.getElementById('lbBtn1').click(); }); await p.click(tab); await p.waitForTimeout(500);
  return { rows: await p.$$eval('#lbList .lb-row', els => els.map(e => e.textContent)), me: await p.textContent('#lbMe'), status: await p.textContent('#lbStatus') }; };
const settings = async p => { await p.evaluate(() => { document.querySelectorAll('.screen.show').forEach(s => s.classList.remove('show')); __glyd.S.mode = 'menu'; document.getElementById('setBtn1').click(); }); await p.waitForTimeout(150); };

(async () => {
  const b = await chromium.launch();
  // other players already on the board (60 of them, all better)
  for (let i = 0; i < 60; i++) { const id = newUser(); DB.profiles[id] = { username: 'Rival' + i, claimed: i % 3 === 0 }; bestUp(id, 'distance', 'all', 5000 - i * 10, {}); bestUp(id, 'distance', week(), 3000 - i * 10, {}); }

  // ---------- 1. first launch: anonymous player, name once, scores after each run ----------
  const a = await device(b);
  ok(await a.evaluate(() => document.getElementById('nameScreen').classList.contains('show')), 'first launch asks for a name');
  await pickName(a, 'Juwon1');
  const me1 = await a.evaluate(() => ({ uid: __glyd.LB.auth && __glyd.LB.auth.uid, anon: __glyd.LB.auth && __glyd.LB.auth.anon, pid: localStorage.getItem('glydaway.playerId') }));
  ok(me1.uid && me1.anon && me1.pid, 'an anonymous player id is made automatically (and a device id)');
  ok(DB.profiles[me1.uid] && DB.profiles[me1.uid].username === 'Juwon1' && !DB.profiles[me1.uid].claimed, 'the name is on the server, not claimed yet');
  await playRun(a, 300, 40); await a.waitForTimeout(600);
  ok(await a.evaluate(() => !document.getElementById('nameScreen').classList.contains('show') && !document.getElementById('topForm')), 'no name prompt after the run');
  ok(DB.scores.some(s => s.id === me1.uid && s.board === 'distance' && s.period === 'all' && s.score === 300), 'the run is posted automatically under the saved name');
  ok(/World #61/.test(await a.textContent('#overRank')), `the crash screen shows the world rank (${await a.textContent('#overRank')})`);
  await a.waitForTimeout(1100); await playRun(a, 200, 5); await a.waitForTimeout(500);
  ok(DB.scores.filter(s => s.id === me1.uid && s.board === 'distance' && s.period === 'all').length === 1 && DB.scores.find(s => s.id === me1.uid && s.board === 'distance' && s.period === 'all').score === 300, 'one best per player: a worse run doesn\'t add a row');
  let bd = await board(a, '#lbTabDist');
  ok(bd.rows.length === 50 && /Rival0/.test(bd.rows[0]) && /#61.*Juwon1.*300 m/.test(bd.me), `WORLD: top 50, sorted, plus my own rank outside it (${bd.me})`);
  ok(bd.rows.filter(r => r.includes('✓')).length > 0 && !bd.rows.join(' ').includes('@'), 'claimed names get a ✓; no emails anywhere');
  bd = await board(a, '#lbTabWeek'); ok(/#61/.test(bd.me), 'THIS WEEK board works');
  bd = await board(a, '#lbTabCoins'); ok(/#1.*Juwon1.*40/.test(bd.rows.join('|')), 'COINS board works');

  // ---------- 2. Save my account (a new email): same player, name claimed, progress saved ----------
  await a.evaluate(() => __glyd.setGold(250));
  await settings(a); await a.click('#acctOpen'); await a.waitForTimeout(100);
  ok((await a.textContent('#acctScreen .privacy')).includes('never see it'), 'the sign-in screen has the privacy note');
  await a.fill('#acctEmail', 'not-an-email'); await a.click('#acctSend'); await a.waitForTimeout(100);
  ok((await a.textContent('#acctErr')).includes('valid email'), 'a bad email is refused');
  await a.fill('#acctEmail', 'juwon@example.com'); await a.click('#acctSend'); await a.waitForTimeout(400);
  ok(await a.isVisible('#acctStep2') && DB.emailsSent === 1, 'a code is emailed');
  await a.click('#acctResend'); await a.waitForTimeout(200);
  ok((await a.textContent('#acctErr')).includes('wait') && DB.emailsSent === 1, 'asking again right away is refused (60 s)');
  await a.fill('#acctCode', '000000'); await a.click('#acctCodeForm button[type=submit]'); await a.waitForTimeout(300);
  ok((await a.textContent('#acctErr')).includes('didn’t work'), 'a wrong code is refused');
  await a.fill('#acctCode', '123456'); await a.click('#acctCodeForm button[type=submit]'); await a.waitForTimeout(2600);
  const me2 = await a.evaluate(() => __glyd.LB.auth);
  ok(me2.uid === me1.uid && !me2.anon && DB.profiles[me1.uid].claimed, 'linking the email keeps the same player and claims Juwon1');
  ok(DB.progress[me1.uid] && DB.progress[me1.uid].data.gold === 250, 'progress is saved to the account');

  // ---------- 3. another player can't use the claimed name ----------
  const c = await device(b);
  await pickName(c, 'JUWON1');
  ok((await c.textContent('#nameErr')).includes('belongs to') && await c.evaluate(() => document.getElementById('nameScreen').classList.contains('show')), 'a claimed name is refused for anyone else (any letter case)');
  await pickName(c, 'Stranger9'); await c.context().close();

  // ---------- 4. a second device signs in to the same email: choose what progress to keep ----------
  const d = await device(b);
  await pickName(d, 'Other12');
  await playRun(d, 450, 12); await d.waitForTimeout(500);
  await d.evaluate(() => { __glyd.setGold(80); });
  const otherUid = await d.evaluate(() => __glyd.LB.auth.uid);
  await settings(d); await d.click('#acctOpen'); await d.fill('#acctEmail', 'juwon@example.com'); await d.click('#acctSend'); await d.waitForTimeout(400);
  await d.fill('#acctCode', '123456'); await d.click('#acctCodeForm button[type=submit]'); await d.waitForTimeout(800);
  ok(await d.isVisible('#acctStep3') && (await d.textContent('#acctCompare')).includes('This device'), 'the email already has an account: the player chooses (nothing is overwritten silently)');
  await d.click('#keepBoth'); await d.waitForTimeout(400);
  const after = await d.evaluate(() => ({ uid: __glyd.LB.auth.uid, name: __glyd.LB.name, gold: __glyd.getGold() }));
  ok(after.uid === me1.uid && after.name === 'Juwon1', 'signed in: the account and its claimed name');
  ok(after.gold === 250 && DB.progress[me1.uid].data.gold === 250, 'COMBINE keeps the higher gold (not added together)');
  ok(DB.scores.some(s => s.id === me1.uid && s.board === 'distance' && s.period === 'all' && s.score === 450) && !DB.users[otherUid], 'the device\'s better score moved into the account; the anonymous player is gone');

  // ---------- 5. rename limit for a saved account ----------
  await settings(d); await d.click('#setNameBtn'); await d.fill('#setNameIn', 'JuwonS'); await d.click('#setNameForm button[type=submit]'); await d.waitForTimeout(300);
  await d.click('#setNameBtn'); await d.fill('#setNameIn', 'JuwonT'); await d.click('#setNameForm button[type=submit]'); await d.waitForTimeout(300);
  ok((await d.textContent('#setNameErr')).includes('once a week') && DB.profiles[me1.uid].username === 'JuwonS', 'a saved name can change once a week');

  // ---------- 6. sign out: back to a new player on this device; the account keeps the progress ----------
  await settings(d); await d.click('#acctSignOut'); await d.click('#acctSignOut'); await d.waitForTimeout(1200);
  ok(await d.evaluate(() => document.getElementById('nameScreen').classList.contains('show') && __glyd.getGold() === 0), 'sign out: this device starts fresh');
  ok(DB.progress[me1.uid] && DB.users[me1.uid], 'the account and its progress are still there');
  await d.context().close();

  // ---------- 7. delete my data ----------
  await settings(a); await a.click('#acctDelete'); await a.click('#acctDelete'); await a.waitForTimeout(1200);
  ok(!DB.users[me1.uid] && !DB.profiles[me1.uid] && !DB.progress[me1.uid] && !DB.scores.some(s => s.id === me1.uid), 'delete my data removes the account, email, name, scores and progress');
  ok(await a.evaluate(() => document.getElementById('nameScreen').classList.contains('show') && !localStorage.getItem('glydaway.auth')), 'and the device starts fresh');
  ok(!a.errs.length, `no page errors ${a.errs.join(' | ')}`);
  await a.context().close();

  // ---------- 8. offline, and a copy with no server configured ----------
  const off = await device(b, { offline: true });
  await pickName(off, 'Offline1'); await playRun(off, 120, 3); await off.waitForTimeout(400);
  bd = await board(off, '#lbTabDist');
  ok(/offline/i.test(bd.status) && await off.isVisible('#lbRetry'), `offline: a clear message and TRY AGAIN (${bd.status})`);
  ok(await off.evaluate(() => __glyd.LB.queue.length === 1), 'offline: the run waits to post');
  await off.context().close();
  const none = await device(b, { online: false });
  await pickName(none, 'Local1');
  bd = await board(none, '#lbTabDist');
  ok(/isn’t connected on this copy/.test(bd.status), 'no server configured: says so; the device board still works');
  ok(!none.errs.length, `offline copy: no page errors ${none.errs.join(' | ')}`);
  await none.context().close();

  await b.close(); srv.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

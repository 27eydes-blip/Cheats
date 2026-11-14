// Bug sweep: dropped connections rejoin the same match; bots OFF means no bots; bad rejoins fail cleanly.
import { test, expect } from '@playwright/test';
import { trackErrors, waitMe } from './helpers.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, what) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timeout: ' + what); await wait(50); } }
function client(url) {
  const ws = new WebSocket(url);
  const c = { ws, msgs: [], me: null, others: [], welcome: null, start: null, closed: false };
  ws.onmessage = (e) => { const m = JSON.parse(e.data); c.msgs.push(m); if (m.t === 'welcome') c.welcome = m; if (m.t === 'start') c.start = m; if (m.t === 's') { c.me = m.me; c.others = m.p; } };
  ws.onclose = () => { c.closed = true; };
  return c;
}

test('room with bots OFF: two humans, no bots; a dropped player rejoins the same match', async ({ baseURL }) => {
  const base = baseURL.replace('http', 'ws');
  const room = 'R' + Math.floor(Math.random() * 1e8);
  const q = `room=${room}&bots=0&mode=bounty&lobby=1.5&events=0&testmap=open`;
  const A = client(`${base}/ws?name=Ann&brawler=brick&${q}`);
  await until(() => A.welcome, 10000, 'welcome A');
  expect(A.welcome.secret).toBeTruthy();
  await wait(2500);
  expect(A.start, 'alone with bots off: the match must not start with bots').toBeNull();
  const B = client(`${base}/ws?name=Ben&brawler=volt&${q}`);
  await until(() => A.me && B.me, 20000, 'start');
  const ro = A.msgs.filter((m) => m.t === 'ro' && m.add).reduce((o, m) => Object.assign(o, m.add), {});
  expect(Object.values(ro).filter((r) => r[2]).length, 'no bots in the roster').toBe(0);
  // A loses signal (socket dies without a goodbye)
  const id = A.welcome.id, secret = A.welcome.secret, hp = A.me.hp;
  A.ws.close();
  await wait(1500);
  const bad = client(`${base}/ws?rejoin=${id}&secret=nope&match=${encodeURIComponent(A.welcome.match)}`);
  await until(() => bad.msgs.some((m) => m.t === 'rejoinfail'), 10000, 'bad secret refused');
  const A2 = client(`${base}/ws?rejoin=${id}&secret=${secret}&match=${encodeURIComponent(A.welcome.match)}`);
  await until(() => A2.me, 10000, 'rejoined snapshots');
  expect(A2.welcome.rejoin).toBe(1);
  expect(A2.start.rejoin).toBe(1);
  expect(A2.me.id).toBe(id);
  expect(A2.me.hp).toBe(hp);
  // control is ours again: moving changes our position
  const x0 = A2.me.x;
  for (let s = 1; s < 30; s++) { A2.ws.send(JSON.stringify({ t: 'in', s: 10000 + s, mx: x0 > 1000 ? -1 : 1, my: 0, ax: 0, ay: 0 })); await wait(50); }
  await wait(300);
  expect(Math.abs(A2.me.x - x0)).toBeGreaterThan(100);
  A2.ws.close(); B.ws.close();
});

test('a room that is full shows a message; a quit (bye) cannot be rejoined', async ({ baseURL }) => {
  const base = baseURL.replace('http', 'ws');
  const room = 'F' + Math.floor(Math.random() * 1e8);
  const q = `room=${room}&bots=0&mode=squad&lobby=12&events=0&testmap=open`;
  const cs = [];
  for (let i = 0; i < 6; i++) { cs.push(client(`${base}/ws?name=P${i}&brawler=volt&${q}`)); await until(() => cs[i].welcome || cs[i].msgs.length, 10000, 'join ' + i); }
  await until(() => cs.every((c) => c.start), 15000, 'full room starts');
  const extra = client(`${base}/ws?name=Late&brawler=volt&${q}`);
  await until(() => extra.msgs.some((m) => m.t === 'retry'), 10000, 'retry');
  expect(extra.msgs.find((m) => m.t === 'retry').reason).toMatch(/started|full/i);
  const w = cs[0].welcome;
  cs[0].ws.send('{"t":"bye"}');
  await wait(500);
  const back = client(`${base}/ws?rejoin=${w.id}&secret=${w.secret}&match=${encodeURIComponent(w.match)}`);
  await until(() => back.msgs.length, 10000, 'answer');
  // a deliberate quit hands the slot to a bot for good
  expect(back.msgs[0].t).toBe('rejoinfail');
  for (const c of [...cs, back]) c.ws.close();
});

test('Free Play: a dropped connection keeps HP and bounty and rejoins the same zone', async ({ baseURL }) => {
  const base = baseURL.replace('http', 'ws');
  const A = client(`${base}/zone?slot=nw&join=1&name=Zed&brawler=rook`);
  await until(() => A.me && A.welcome, 15000, 'zone join');
  const { id, secret } = A.welcome;
  await wait(500);
  const before = { hp: A.me.hp, bt: A.me.bt, br: A.me.br };
  A.ws.close();
  await wait(1500);
  const A2 = client(`${base}/zone?slot=nw&rejoin=${id}&secret=${secret}`);
  await until(() => A2.me, 10000, 'zone rejoin');
  expect(A2.welcome.rejoin).toBe(1);
  expect(A2.me.id).toBe(id);
  expect(A2.me.br).toBe(before.br);
  expect(A2.me.bt).toBe(before.bt);
  expect(A2.me.hp).toBeGreaterThanOrEqual(Math.min(before.hp, A2.me.mh) - 1);
  // a goodbye removes the brawler at once: no rejoin afterwards
  A2.ws.send('{"t":"bye"}');
  await wait(500);
  const A3 = client(`${base}/zone?slot=nw&rejoin=${id}&secret=${secret}`);
  await until(() => A3.msgs.length, 10000, 'answer');
  expect(A3.msgs[0].t).toBe('rejoinfail');
  A3.ws.close();
});

test('browser: losing the socket mid-match reconnects to the same match', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?world=meadow&mode=bounty');
  await waitMe(page);
  const id0 = await page.evaluate(() => window.__hunt.myId);
  await page.evaluate(() => window.__hunt.conns.get('main').ws.close());
  await expect(page.locator('#toast')).toContainText(/Reconnect/);
  await page.waitForFunction(() => { const c = window.__hunt.conns.get('main'); return c && c.welcomed && window.__hunt.phase === 'play'; }, null, { timeout: 15000 });
  expect(await page.evaluate(() => window.__hunt.myId)).toBe(id0);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__hunt.me.id)).toBe(id0);
  expect(errors).toEqual([]);
});

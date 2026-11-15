// Overnight server fixes, checked against the real Worker: made-up ids, junk frames, one seat per
// account, reconnects that always win, and a SUPER that fires when it says READY.
import { test, expect } from '@playwright/test';
import { trackErrors, waitMe } from './helpers.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, what) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timeout: ' + what); await wait(40); } }
function client(url) {
  const ws = new WebSocket(url);
  const c = { ws, msgs: [], me: null, welcome: null, start: null, closed: false, snaps: 0, fx: [] };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data); c.msgs.push(m);
    if (m.t === 'welcome') c.welcome = m; if (m.t === 'start') c.start = m;
    if (m.t === 's') { c.snaps++; if (m.me) c.me = Object.assign(c.me || {}, m.me); if (m.fx) c.fx.push(...m.fx); }
  };
  ws.onclose = () => { c.closed = true; };
  c.say = (o) => ws.send(typeof o === 'string' ? o : JSON.stringify(o));
  c.got = (t) => c.msgs.find((m) => m.t === t);
  return c;
}
const rnd = (p) => p + Math.floor(Math.random() * 1e8);

test('a made-up brawler / event id and junk frames cannot stall a match for the other player', async ({ baseURL }) => {
  const base = baseURL.replace('http', 'ws');
  const q = `room=${rnd('K')}&bots=0&mode=bounty&lobby=1.5&testmap=open`;
  const bad = client(`${base}/ws?name=Cheat&brawler=constructor&ev=constructor&${q}`);
  await until(() => bad.welcome, 10000, 'welcome');
  const ok = client(`${base}/ws?name=Honest&brawler=volt&${q}`);
  await until(() => bad.me && ok.me, 20000, 'start');
  expect(bad.me.br, 'the made-up brawler fell back to a real one').toBe('volt');
  expect(bad.me.mh).toBeGreaterThan(0);
  const junk = ['null', '5', '"x"', '[]', '{', '{"t":null}', '{"t":"pick","brawler":"__proto__"}', '{"t":"in","f":{},"u":[],"s":"x"}'];
  const n0 = ok.snaps, t0 = Date.now();
  for (let s = 1; Date.now() - t0 < 3000; s++) { bad.say({ t: 'in', s, f: 0, u: 0, mx: 1, my: 0 }); bad.say(junk[s % junk.length]); await wait(50); }
  const rate = (ok.snaps - n0) / ((Date.now() - t0) / 1000);
  expect(rate, `the honest player still gets ~20 snapshots a second (got ${rate.toFixed(1)})`).toBeGreaterThan(15);
  expect(bad.closed, 'junk does not drop the sender either').toBe(false);
  // the room's event scheduler is not wedged by ev=constructor (no bogus event announced)
  expect(ok.msgs.filter((m) => m.t === 'ev' && m.id === 'constructor').length).toBe(0);
  bad.ws.close(); ok.ws.close();
});

test('shop: a made-up weapon or item id is a clean refusal, not a server error', async ({ request }) => {
  const { token } = await (await request.post('/api/guest')).json();
  const headers = { authorization: 'Bearer ' + token };
  for (const data of [{ action: 'perk', weapon: 'constructor', tier: 2, id: 'x' }, { action: 'buy', id: '__proto__' }, { action: 'equip', slot: ['title'], id: 'toString' }, { action: 'loadout', w2: ['stormline'] }, null, 5, 'x', []]) {
    const r = await request.post('/api/shop', { headers, data: JSON.stringify(data), failOnStatusCode: false });
    expect(r.status(), JSON.stringify(data)).toBe(400);
    expect(typeof (await r.json()).error).toBe('string');
  }
  const me = await (await request.get('/api/me', { headers })).json();
  expect(me.user.progress.owned.every((x) => typeof x === 'string')).toBe(true);
  expect(me.user.progress.loadout.w2 ?? null).toBe(null);
});

test('one account, three sockets, one match: one seat', async ({ baseURL, request }) => {
  const base = baseURL.replace('http', 'ws');
  const { token } = await (await request.post('/api/guest')).json();
  const q = `room=${rnd('S')}&mode=bounty&lobby=3&token=${token}`;
  const a = client(`${base}/ws?name=One&brawler=volt&${q}`);
  await until(() => a.welcome, 10000, 'welcome a');
  const b = client(`${base}/ws?name=Two&brawler=brick&${q}`);
  await until(() => b.welcome, 10000, 'welcome b');
  const c = client(`${base}/ws?name=Three&brawler=wisp&${q}`);
  await until(() => c.welcome, 10000, 'welcome c');
  await until(() => a.closed && b.closed, 5000, 'older sockets closed');
  expect(a.got('kick').reason).toMatch(/other screen/);
  await until(() => c.me, 20000, 'start');
  const ro = c.msgs.filter((m) => m.t === 'ro' && m.add).reduce((o, m) => Object.assign(o, m.add), {});
  expect(Object.values(ro).filter((r) => !r[2]).length, 'one human in the match').toBe(1);
  // joining again mid-match takes the same seat over, and the older screen cannot grab it back
  const d = client(`${base}/ws?name=Four&brawler=volt&${q}`);
  await until(() => d.me, 10000, 'takeover');
  expect(d.welcome.id).toBe(c.welcome.id);
  await until(() => c.closed, 5000, 'c closed');
  const back = client(`${base}/ws?rejoin=${c.welcome.id}&secret=${c.welcome.secret}&match=${encodeURIComponent(c.welcome.match)}`);
  await until(() => back.got('rejoinfail'), 5000, 'old secret refused');
  expect(d.closed).toBe(false);
  d.say({ t: 'bye' }); d.ws.close();
});

test('Free Play: a reconnect with the right secret wins even while the old socket is still open', async ({ baseURL }) => {
  const base = baseURL.replace('http', 'ws');
  const z = client(`${base}/zone?slot=c&join=1&name=Zed&brawler=volt`);
  await until(() => z.me, 15000, 'in the zone');
  const { id, secret } = z.welcome;
  expect(z.closed).toBe(false);
  const z2 = client(`${base}/zone?slot=c&rejoin=${id}&secret=${secret}`); // the old socket never said goodbye
  await until(() => z2.welcome || z2.got('rejoinfail'), 10000, 'answer');
  expect(z2.got('rejoinfail'), 'not refused').toBeFalsy();
  expect(z2.welcome.rejoin).toBe(1); expect(z2.welcome.id).toBe(id);
  await until(() => z2.me && z.closed, 10000, 'snapshots on the new socket, old one closed');
  expect(z2.me.id).toBe(id);
  z2.say({ t: 'bye' }); z2.ws.close();
});

for (const brawler of ['dune', 'brick', 'flicker']) {
  test(`SUPER: ${brawler} shows READY only when the server will fire it`, async ({ baseURL }) => {
    const base = baseURL.replace('http', 'ws');
    const c = client(`${base}/ws?name=Sup&brawler=${brawler}&room=${rnd('U')}&mode=range&lobby=1.5`);
    await until(() => c.me && c.me.x, 20000, 'on the range');
    // walk to the dummy line and keep hitting the dummies until the client is told READY (sc = 1)
    let s = 0;
    const t0 = Date.now(), x0 = c.me.x;
    while (c.me.sc < 1) {
      if (Date.now() - t0 > 60000) throw new Error('never charged: sc ' + c.me.sc);
      s++;
      c.say({ t: 'in', s, mx: c.me.x < x0 + 330 ? 1 : 0, my: 0, ax: 1, ay: 0, f: s % 6 === 0 ? 0 : null });
      await wait(50);
    }
    expect(c.me.sc).toBe(1);
    const fx0 = c.fx.length;
    c.say({ t: 'in', s: ++s, mx: 0, my: 0, ax: 1, ay: 0, u: 0 });
    await until(() => c.me.sc < 1, 3000, `${brawler}: the server used the super it showed as READY`);
    expect(c.fx.length).toBeGreaterThan(fx0);
    c.say({ t: 'bye' }); c.ws.close();
  });
}

test('browser: the same account opening the game on a second screen moves there, with a clear message', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const one = await ctx.newPage(), errors = trackErrors(one);
  await one.goto('/?free=1');
  await waitMe(one);
  const two = await ctx.newPage(); // same browser = same saved account
  await two.goto('/?free=1');
  await waitMe(two);
  await expect(one.locator('#toast')).toHaveText('Now playing on your other screen');
  await expect(one.locator('#lobby')).toBeVisible();
  await expect(one.getByText('Created by Sam Eyde III').first()).toBeVisible();
  expect(await two.evaluate(() => window.__hunt.phase)).toBe('play');
  await two.waitForTimeout(1500);
  expect(await two.evaluate(() => window.__hunt.phase), 'no tug of war: the second screen keeps playing').toBe('play');
  expect(await one.evaluate(() => window.__hunt.phase)).toBe('menu');
  expect(errors).toEqual([]);
  await ctx.close();
});

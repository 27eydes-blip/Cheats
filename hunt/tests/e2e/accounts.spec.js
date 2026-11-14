import { test, expect } from '@playwright/test';

const api = async (request, path, body, token) => {
  const r = await request.fetch('/api' + path, { method: body ? 'POST' : 'GET', data: body, headers: token ? { authorization: 'Bearer ' + token } : {} });
  return { status: r.status(), json: await r.json() };
};

test('guest -> upgrade keeps progress; login elsewhere syncs; match results applied server-side', async ({ request, baseURL }) => {
  const g = await api(request, '/guest', {});
  expect(g.status).toBe(200);
  expect(g.json.user.guest).toBe(true);
  // a match as the guest: two players, guest wins -> +8 trophies (server-side)
  const room = 'A' + Math.floor(Math.random() * 1e8);
  const base = baseURL.replace('http', 'ws') + `/ws?room=${room}&bots=0&mode=showdown&lobby=1.5&events=0&testmap=open`;
  const W = new WebSocket(base + `&name=Winner&brawler=wisp&token=${g.json.token}`);
  const L = new WebSocket(base + '&name=Loser&brawler=volt');
  const st = { w: null, l: null, wid: 0, lid: 0, prog: null };
  W.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 's') st.w = m.me; if (m.t === 'progress') st.prog = m; };
  L.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 's') st.l = m.me; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const t0 = Date.now();
  while (!st.w || !st.l) { await wait(100); if (Date.now() - t0 > 20000) throw new Error('no start'); }
  let s = 0;
  while (!st.prog && Date.now() - t0 < 60000) {
    const ang = Math.atan2(st.l.y - st.w.y, st.l.x - st.w.x), d = Math.hypot(st.l.x - st.w.x, st.l.y - st.w.y);
    s++;
    W.send(JSON.stringify({ t: 'in', s, mx: d > 300 ? Math.cos(ang) : 0, my: d > 300 ? Math.sin(ang) : 0, ax: 0, ay: 0, f: s % 8 === 0 ? ang : null }));
    L.send(JSON.stringify({ t: 'in', s, mx: 0, my: 0, ax: 0, ay: 0 }));
    await wait(50);
  }
  W.close(); L.close();
  expect(st.prog).toBeTruthy();
  expect(st.prog.delta).toBe(8);
  expect(st.prog.progress.trophies.wisp).toBe(8);
  // upgrade the guest: same progress
  const name = 'qa' + Math.floor(Math.random() * 1e8);
  const up = await api(request, '/register', { username: name, password: 'secret123' }, g.json.token);
  expect(up.status).toBe(200);
  expect(up.json.user.guest).toBe(false);
  expect(up.json.user.progress.trophies.wisp).toBe(8);
  // "iPad": fresh login sees the same progress
  const li = await api(request, '/login', { username: name, password: 'secret123' });
  expect(li.json.user.progress.trophies.wisp).toBe(8);
  expect((await api(request, '/login', { username: name, password: 'wrongpass' })).status).toBe(401);
  expect((await api(request, '/register', { username: name, password: 'another1' })).status).toBe(409);
  // trophy road: 100 not reached yet
  expect((await api(request, '/claim', { at: 100 }, li.json.token)).status).toBe(400);
});

test('lobby shows profile bar and account modal', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#profileBar .chip').first()).toBeVisible();
  await page.click('#accBtn');
  await expect(page.locator('#regForm')).toBeVisible();
  await page.click('#modalClose');
  await page.click('#roadBtn');
  await expect(page.locator('.road li').first()).toBeVisible();
});

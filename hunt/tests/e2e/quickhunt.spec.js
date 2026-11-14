import { test, expect } from '@playwright/test';
import { trackErrors, waitMe } from './helpers.js';

test('?world= drops straight into an arena match with bots', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?world=mirage&mode=bounty');
  await waitMe(page);
  const s = await page.evaluate(() => ({ world: window.__hunt.world, mode: window.__hunt.modeKey, others: window.__hunt.view.others.length }));
  expect(s.world).toBe('mirage'); expect(s.mode).toBe('bounty');
  await page.keyboard.down('d'); await page.waitForTimeout(1500); await page.keyboard.up('d');
  expect(errors).toEqual([]);
});

test('two clients in one room: one eliminates the other', async ({ baseURL }) => {
  const base = baseURL.replace('http', 'ws');
  const room = 'E' + Math.floor(Math.random() * 1e8);
  const mk = (name, brawler) => {
    const ws = new WebSocket(`${base}/ws?name=${name}&brawler=${brawler}&room=${room}&bots=0&mode=showdown&lobby=1.5&events=0&testmap=open`);
    const c = { ws, me: null, others: [], dead: null, id: 0 };
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.t === 'start') c.id = m.you; if (m.t === 's') { c.me = m.me; c.others = m.p; } if (m.t === 'dead') c.dead = m; };
    return c;
  };
  const A = mk('Hunter', 'wisp'), B = mk('Prey', 'volt');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const t0 = Date.now();
  while (!A.me || !B.me) { await wait(100); if (Date.now() - t0 > 30000) throw new Error('no start'); }
  let s = 0;
  while (!B.dead && Date.now() - t0 > 0 && Date.now() - t0 < 80000) {
    const b = A.others.find((p) => p[0] === B.id);
    const tx = b ? b[1] : B.me.x, ty = b ? b[2] : B.me.y;
    const ang = Math.atan2(ty - A.me.y, tx - A.me.x), d = Math.hypot(tx - A.me.x, ty - A.me.y);
    s++;
    // B walks towards A too so walls can't keep them apart forever
    A.ws.send(JSON.stringify({ t: 'in', s, mx: d > 250 ? Math.cos(ang) : 0, my: d > 250 ? Math.sin(ang) : 0, ax: 0, ay: 0, f: b && s % 8 === 0 ? ang : null, u: null }));
    B.ws.send(JSON.stringify({ t: 'in', s, mx: -Math.cos(ang) * (d > 200 ? 1 : 0), my: -Math.sin(ang) * (d > 200 ? 1 : 0), ax: 0, ay: 0, f: null, u: null }));
    await wait(50);
  }
  A.ws.close(); B.ws.close();
  expect(B.dead).toBeTruthy();
  expect(['Hunter', 'the Poison']).toContain(B.dead.killer);
});

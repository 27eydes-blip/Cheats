// Race moments (public/race/moments.js) are presentation only and can never desync the race:
//  - the replay recorder (ring buffer, interpolated views, crash clips with their explosions)
//  - slow-mo after a last-second overtake (starts only when you gained a place just before the line,
//    plays at 40% speed, ends by itself)
//  - pass-by detection and the grid revs curve
//  - DESYNC: two RaceClients get exactly the same server messages and the same steering; one of them
//    also runs every moment (recording, crash clips, a forced slow-mo replay read every frame, revs,
//    pass-bys). Both must send byte-identical inputs and keep an identical predicted car, and the
//    server race they drive is the same as one driven by the plain client.
import assert from 'node:assert';
import { Recorder, Moments, replayView, passBys, revCurve, crashScore, SLOW_RATE, REC_HZ } from '../public/race/moments.js';
import { RaceSim } from '../src/race/sim.js';
import { RaceClient } from '../public/race/net.js';

// ---------------------------------------------------------------- recorder
{
  const r = new Recorder(4, 4, 2); // 2 s ring
  const car = (id, x, a = 0) => ({ id, x, y: 10, a, f: 0, spd: 300, hp: 100, me: id === 1 });
  for (let i = 0; i < 100; i++) r.push({ time: i / REC_HZ, cars: [car(1, i * 10), car(2, 500 - i)], ents: [{ id: 9, kind: 'missile', x: i, y: 0, a: 0 }], leader: 2 });
  assert.strictEqual(r.n, r.cap, 'ring full');
  assert.ok(Math.abs(r.last() - 99 / REC_HZ) < 1e-9 && r.first() > 1.2, 'keeps the newest 2 s');
  assert.strictEqual(r.push({ time: 99 / REC_HZ + 0.001, cars: [], ents: [] }), false, 'at most 30 frames a second');
  const v = r.viewAt(80.5 / REC_HZ, replayView());
  assert.ok(Math.abs(v.cars[0].x - 805) < 1e-6, 'cars interpolated between frames');
  assert.strictEqual(v.cars[0].me, true); assert.strictEqual(v.cars[0].predicted, false);
  assert.strictEqual(v.ents[0].kind, 'missile'); assert.strictEqual(v.leader, 2);
  const c = r.clip(70 / REC_HZ, 90 / REC_HZ, { label: 'X' });
  assert.strictEqual(c.n, 21, 'clip frames'); assert.strictEqual(c.label, 'X');
  assert.ok(Math.abs(c.viewAt(75 / REC_HZ, replayView()).cars[1].x - 425) < 1e-6, 'clip plays back');
  // angles interpolate the short way round
  const r2 = new Recorder(2, 1, 1);
  r2.push({ time: 0, cars: [car(1, 0, 3.1)], ents: [] }); r2.push({ time: 1 / 30, cars: [car(1, 0, -3.1)], ents: [] });
  const a = r2.viewAt(0.5 / 30, replayView()).cars[0].a;
  assert.ok(Math.abs(Math.abs(a) - Math.PI) < 0.05, `short way round (${a})`);
}

// ---------------------------------------------------------------- crash clips + slow-mo
{
  const m = new Moments();
  const view = (t, x) => ({ time: t, cars: [{ id: 1, x, y: 0, a: 0, f: 0, spd: 500, hp: 100, me: true }, { id: 2, x: x + 50, y: 0, a: 0, f: 0, spd: 500, hp: 100, me: false }], ents: [], leader: 1 });
  let t = 0;
  for (; t < 3; t += 1 / 60) m.frame(view(t, t * 500));
  assert.strictEqual(crashScore(['ko', 1, 2, 'missile'], 1, false), 3, 'your wreck');
  assert.strictEqual(crashScore(['ko', 2, 1, 'missile'], 1, false), 3, 'your takedown');
  assert.strictEqual(crashScore(['ko', 2, 3, 'missile'], 1, true), 2, 'right next to you');
  assert.strictEqual(crashScore(['ko', 2, 3, 'missile'], 1, false), 0, 'far away: no');
  assert.strictEqual(crashScore(['bump', 1, 2, 800], 1, false), 1);
  m.event(['ko', 1, 2, 'missile'], 1, t, false, { x: 1500, y: 0 });
  assert.ok(m.pending && !m.best);
  for (const t0 = t; t < t0 + 1.5; t += 1 / 60) m.frame(view(t, t * 500));
  assert.ok(m.best && m.best.score === 3 && m.best.label === 'YOUR WRECK', 'the clip is kept');
  assert.ok(m.best.n > 2.5 * REC_HZ && m.best.booms.length === 1, `3.4 s with its explosion (${m.best.n} frames)`);
  // a smaller crash later never replaces a bigger one
  m.event(['bump', 1, 2, 700], 1, t, false); assert.strictEqual(m.pending, null);
  // slow-mo: not without a late overtake...
  m.place(3, t);
  assert.strictEqual(m.finish(t), false, 'no overtake: no slow-mo');
  for (const t0 = t; t < t0 + 3; t += 1 / 60) m.frame(view(t, t * 500));
  m.place(2, t); // passed someone...
  for (const t0 = t; t < t0 + 0.8; t += 1 / 60) m.frame(view(t, t * 500));
  assert.strictEqual(m.finish(t), true, '...0.8 s before the line: slow-mo');
  // it replays from 1.5 s before the line at 40% speed and ends by itself (the real race goes on)
  let frames = 0, first = null, lastT = 0;
  for (let k = 0; k < 2000; k++) {
    t += 1 / 60; m.frame(view(t, t * 500));
    const sv = m.slowView(1 / 60);
    if (!sv) break;
    frames++; if (first == null) first = sv.time; lastT = sv.time;
    assert.ok(sv.time < t - 0.5, 'slow-mo shows the past, never the live race');
  }
  assert.ok(Math.abs((frames / 60) * SLOW_RATE - 1.85) < 0.1, `plays 1.85 s of race in ${(frames / 60).toFixed(2)} s`);
  assert.ok(lastT > first + 1.7, 'covers the finish');
  assert.strictEqual(m.slow, null, 'ended');
}

// ---------------------------------------------------------------- pass-bys and revs
{
  const seen = new Map(), out = [];
  const me = { id: 1, x: 0, y: 0, a: 0, spd: 300, me: true, f: 0 };
  passBys(me, [me, { id: 2, x: -60, y: 40, a: 0, spd: 900, f: 0 }], seen, 0, out);
  assert.strictEqual(out.length, 0, 'behind you: nothing yet');
  passBys(me, [me, { id: 2, x: 30, y: 40, a: 0, spd: 900, f: 0 }], seen, 0.1, out);
  assert.strictEqual(out.length, 1, 'it rushed past');
  assert.ok(out[0].lat > 0 && out[0].v > 0.3, 'on your right, loud');
  passBys(me, [me, { id: 2, x: -30, y: 40, a: 0, spd: 300, f: 0 }], seen, 0.3, out);
  assert.strictEqual(out.length, 0, 'not again at once / not at the same speed');
  assert.strictEqual(revCurve(0), 0); assert.strictEqual(revCurve(-1), 0);
  const rs = []; for (let cd = 3; cd > 0; cd -= 0.05) rs.push(revCurve(cd));
  assert.ok(Math.max(...rs) <= 0.81 && Math.min(...rs) >= 0.12, 'revs within the engine range');
  assert.ok(revCurve(0.1) > revCurve(2.9), 'held high in the last second');
}

// ---------------------------------------------------------------- desync: moments only read
{
  const sentA = [], sentB = [];
  const mk = (sent) => { const rc = new RaceClient({ transport: () => ({ readyState: 1, send() {}, addEventListener() {}, close() {} }) }); rc.ws = { readyState: 1, send: (d) => sent.push(d) }; return rc; };
  const A = mk(sentA), B = mk(sentB);
  let hid = 1; // (the first player in gets id 1; the welcome comes first, as from the room)
  const welcome = { t: 'welcome', id: hid, secret: 's', match: 'room:D', room: 'D', mode: 'grand', track: 'desert', arena: false, bots: 1, tick: 30 };
  A.onMsg(welcome); B.onMsg(welcome);
  const sim = new RaceSim({ mode: 'grand', track: 'desert', seed: 21, lobbyTime: 0.05, fillBots: true, laps: 1, botLevel: 'normal', send: (id, m) => { if (id === hid) { const s = JSON.stringify(m); A.onMsg(JSON.parse(s)); B.onMsg(JSON.parse(s)); } } });
  hid = sim.join('Me', 'volt');
  assert.strictEqual(hid, 1);
  let n = 0;
  while (sim.phase === 'lobby' && n++ < 200) sim.tick();
  A.ws = { readyState: 1, send: (d) => sentA.push(d) }; B.ws = { readyState: 1, send: (d) => sentB.push(d) };
  const M = new Moments(), seen = new Map(), pb = [];
  let slowFrames = 0, now = 0, forced = false;
  for (let k = 0; k < 30 * 25; k++) {
    // the same steering for both: chase the racing line from A's car (deterministic)
    const c = A.car, L = sim.T.corridors[0].line;
    let st = 0;
    if (c) { let bi = 0, bd = Infinity; for (let i = 0; i < L.x.length; i += 2) { const d = (L.x[i] - c.x) ** 2 + (L.y[i] - c.y) ** 2; if (d < bd) { bd = d; bi = i; } } const j = (bi + 5) % L.x.length; let da = Math.atan2(L.y[j] - c.y, L.x[j] - c.x) - c.a; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; st = Math.max(-1, Math.min(1, da * 2.5)); }
    for (const rc of [A, B]) { rc.setInput({ st, th: 1, dr: 0 }); rc.step(); }
    while (sentA.length) sim.input(hid, JSON.parse(sentA.shift()));
    sentB.length = 0;
    sim.tick();
    now += 1000 / 30;
    const va = A.view(now), vb = B.view(now);
    // B: everything the race screen does with a view, every frame
    if (vb) {
      M.frame(vb);
      if (vb.me) M.place(vb.me.fin || vb.me.rk, vb.time);
      for (const e of B.drainEvents()) if (Array.isArray(e)) M.event(e, hid, vb.time, true, vb.cars[0]);
      revCurve(vb.countdown);
      passBys(vb.cars.find((x) => x.me), vb.cars, seen, now / 1000, pb);
      if (!forced && vb.time > 8) forced = M.finish(vb.time, true);
      const sv = M.slowView(1 / 30);
      if (sv) { slowFrames++; sv.cars.forEach((x) => { x.x += 1; }); } // (a renderer may mutate the replay view freely)
    }
    A.drainEvents();
    if (A.car || B.car) {
      assert.deepStrictEqual(B.car, A.car, `tick ${k}: identical prediction`);
      assert.deepStrictEqual(vb.cars, va.cars, `tick ${k}: identical live view`);
    }
    assert.strictEqual(B.seq, A.seq);
  }
  assert.ok(slowFrames > 60, `slow-mo ran (${slowFrames} frames) while the race went on`);
  assert.ok(M.rec.n > 100, 'recorded');
  // what B would have sent: byte-identical to what A sent (the same inputs every tick)
  const sA = [], sB = [];
  const A2 = mk(sA), B2 = mk(sB);
  for (const rc of [A2, B2]) { rc.onMsg(welcome); rc.phase = 'race'; rc.T = A.T; }
  A2.setInput({ st: 0.3, th: 1, dr: 1, ha: 1.2, hm: 0.8 }); B2.setInput({ st: 0.3, th: 1, dr: 1, ha: 1.2, hm: 0.8 });
  A2.step(); M.frame({ time: 99, cars: [], ents: [] }); B2.step();
  assert.deepStrictEqual(sB, sA);
}
console.log('race-moments: ok');

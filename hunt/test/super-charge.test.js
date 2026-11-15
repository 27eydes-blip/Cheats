// SUPER charge: READY means ready. The documented number of hits must give a super the server
// fires, for every brawler, and the client is told "ready" exactly when the server agrees.
import assert from 'node:assert';
import { Sim } from '../src/sim.js';
import { generateArena, BRAWLERS, BRAWLER_IDS } from '../public/shared.js';
import { STARS } from '../public/power.js';

const open = (o = {}) => {
  const map = generateArena(4); map.open = true;
  for (let y = 1; y < map.gh - 1; y++) for (let x = 1; x < map.gw - 1; x++) map.t[y * map.gw + x] = 0;
  return new Sim({ map, mode: 'bounty', phase: 'play', fillBots: false, events: false, seed: 4, ...o });
};

for (const id of BRAWLER_IDS) {
  const hits = BRAWLERS[id].superHits;
  for (const star of [null, ...STARS[id].filter((s) => s.fx.charge)]) {
    const sent = [];
    const sim = open({ send: (pid, m) => { if (m.t === 's') sent.push([pid, m]); } });
    const a = sim.addPlayer({ name: 'A', brawler: id }), t = sim.addPlayer({ name: 'T', brawler: 'brick' });
    a.x = 1000; a.y = 1000; t.x = 1200; t.y = 1000; t.hp = t.maxHp = 1e9;
    if (star) a.star = star;
    const need = Math.ceil(hits / (star ? star.fx.charge : 1) - 1e-9);
    let sc = 0;
    for (let i = 1; i <= need; i++) {
      sim.damage(a, t, 10, true);
      sim.tick();
      const me = sent.filter(([pid]) => pid === a.id).pop()[1].me;
      if (me.sc != null) sc = me.sc;
      assert.equal(sc >= 1, a.superC >= 1, `${id}: after ${i}/${need} hits the client sees ${sc}, the server has ${a.superC}`);
      if (i < need) assert(a.superC < 1, `${id}: not full before hit ${need}`);
    }
    assert.equal(a.superC, 1, `${id}${star ? ' + ' + star.name : ''}: ${need} hits fill the super exactly (got ${a.superC})`);
    assert.equal(sc, 1, `${id}: the client is told it is ready`);
    const fxBefore = sim.fx.length, shots = sim.nextEnt, tp = a.tp, delayed = sim.delayed.length;
    sim.trySuper(a, 0);
    assert.equal(a.superC, 0, `${id}: the super fires`);
    assert(sim.fx.length > fxBefore || sim.nextEnt > shots || a.tp > tp || sim.delayed.length > delayed || a.dash || a.cloak > 0, `${id}: and does something`);
  }
  // the same through a real input, and via credit from another zone
  const sim = open();
  const a = sim.addPlayer({ name: 'A', brawler: id }), t = sim.addPlayer({ name: 'T', brawler: 'brick' });
  a.x = 1000; a.y = 1000; t.x = 1200; t.y = 1000; t.hp = t.maxHp = 1e9;
  for (let i = 0; i < hits; i++) sim.credit({ id: a.id, charge: 1 });
  assert.equal(a.superC, 1, `${id}: cross-zone hits fill it too`);
  sim.input(a.id, { t: 'in', s: 1, u: 0 });
  sim.tick();
  assert.equal(a.superC, 0, `${id}: SUPER input after ${hits} hits is used, not refused`);
}
{ // "almost full" is never shown as ready (weapon hits charge by damage, so any fraction can happen)
  const sent = [];
  const sim = open({ send: (pid, m) => { if (m.t === 's') sent.push(m); } });
  const a = sim.addPlayer({ name: 'A', brawler: 'volt' });
  for (const c of [0.994, 0.995, 0.9951, 0.999, 0.99999]) {
    a.superC = c; a.meSent = null; sent.length = 0; sim.tick();
    assert(sent[0].me.sc < 1, `charge ${c} is not sent as ready (sent ${sent[0].me.sc})`);
  }
  a.superC = 0.4; sim.addCharge(a, 0.3);
  assert(Math.abs(a.superC - 0.7) < 1e-12, 'ordinary charge is untouched');
  a.superC = 0.9; sim.addCharge(a, 0.5);
  assert.equal(a.superC, 1, 'never above full');
}
console.log('super charge: OK (every brawler, with and without charge star powers)');


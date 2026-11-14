// Headless match: 2 "humans" + 8 bots, run until someone wins.
import { Match } from '../src/match.js';
import assert from 'node:assert';

const msgs = new Map();
const m = new Match({ seed: 12345, lobbyTime: 1, send: (id, msg) => { (msgs.get(id) || msgs.set(id, []).get(id)).push(msg); } });
const a = m.join('Alice', 'volt');
const b = m.join('Bob', 'wisp');
assert(a && b);
for (let i = 0; i < 200 && m.phase === 'lobby'; i++) m.tick();
assert.equal(m.phase, 'play');
assert.equal(m.players.size, 10);

// Alice walks toward Bob and shoots at him every few ticks.
let seq = 0, ticks = 0, bobHit = false;
while (m.phase === 'play' && ticks < 20 * 400) {
  const A = m.players.get(a), B = m.players.get(b);
  if (A.alive && B.alive) {
    const ang = Math.atan2(B.y - A.y, B.x - A.x);
    m.input(a, { t: 'in', s: ++seq, mx: Math.cos(ang), my: Math.sin(ang), ax: 0, ay: 0, f: ticks % 10 === 0 ? ang : null, u: A.superC >= 1 ? ang : null });
  }
  m.input(b, { t: 'in', s: ticks + 1, mx: 0, my: 0, ax: 0, ay: 0, f: null, u: null });
  const hpBefore = B.hp;
  m.tick();
  if (B.hp < hpBefore) bobHit = true;
  ticks++;
}
const res = msgs.get(a).find((x) => x.t === 'end');
const kills = msgs.get(a).filter((x) => x.t === 'kill');
console.log('ended after', (ticks / 20).toFixed(1), 's; phase', m.phase, '; kills', kills.length, '; bob damaged:', bobHit);
console.log('results', res && res.results.map((r) => `#${r[2]} ${r[0]}(${r[1]}) k${r[3]}`).join(', '));
const snap = msgs.get(a).find((x) => x.t === 's');
console.log('snapshot bytes ~', JSON.stringify(snap).length);
assert.equal(m.phase, 'end');
assert(kills.length === 9, 'expected 9 kills');
console.log('OK');

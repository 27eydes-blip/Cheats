import assert from 'node:assert';
import { Sim } from '../src/sim.js';
import { QUICK_MODES } from '../src/modes.js';
import { generateArena } from '../public/shared.js';

assert(QUICK_MODES.includes('squad'), 'Squad Hunt is in the Quick Hunt pool');
const msgs = [];
const sim = new Sim({ map: generateArena(9, 'city'), mode: 'squad', seed: 9, lobbyTime: 0.1, send: (id, m) => msgs.push([id, m]) });
const me = sim.join('Me', 'volt');
while (sim.phase === 'lobby') sim.tick();
const ps = [...sim.players.values()];
assert.equal(ps.length, 6);
assert.equal(ps.filter((p) => p.team === 1).length, 3); assert.equal(ps.filter((p) => p.team === 2).length, 3);
const A = sim.players.get(me), mate = ps.find((p) => p !== A && p.team === A.team), foe = ps.find((p) => p.team !== A.team);
// no friendly fire, teammates always visible
mate.x = A.x + 60; mate.y = A.y; const hp = mate.hp; sim.damage(A, mate, 100, true); // direct damage still guarded by bullets/supers; check bullet path:
mate.hp = hp;
sim.bullets.push({ id: 999, owner: A.id, kind: 0, x: A.x + 30, y: A.y, vx: 1000, vy: 0, dist: 0, range: 300, dmg: 500, r: 9, team: A.team });
sim.updateBullets();
assert.equal(mate.hp, hp, 'bullets pass through teammates');
mate.x = 100; mate.y = 100; // far away, maybe in a bush: still visible to teammates
assert(sim.canSee(A, mate));
// pot: kill an enemy carrying bounty -> our pot +1+bounty, theirs -bounty
sim.teamPot[foe.team] = 5; foe.bounty = 3; foe.hp = 1;
sim.damage(A, foe, 10, true);
assert.equal(sim.teamPot[A.team], 4); assert.equal(sim.teamPot[foe.team], 2);
// teammates on the radar in every snapshot
sim.tick();
const snap = msgs.filter(([id, m]) => id === me && m.t === 's').pop()[1];
assert.equal(snap.mates.length, 2); assert(snap.md.pots);
// full match ends at 3:00 with a winning team
sim.leave(me);
let t = 0; while (sim.phase === 'play' && t < 20 * 200) { sim.tick(); t++; }
assert.equal(sim.phase, 'end');
console.log('pots', sim.teamPot, 'after', (sim.time | 0) + 's');
console.log('SQUAD OK');

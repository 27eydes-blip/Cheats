// Free Play power cubes are capped (a zone never ends, so they used to snowball without limit);
// Showdown and Big Hunt are unchanged.
import assert from 'node:assert';
import { Sim } from '../src/sim.js';
import { generateArena, generateWorld, zoneBounds, BRAWLERS, CUBE_HP } from '../public/shared.js';
import { MODES } from '../src/modes.js';

{
  const CAP = MODES.freeplay.cubeCap;
  assert(CAP >= 8 && CAP <= 12, 'about a long Showdown match worth of cubes');
  const zone = () => new Sim({ map: generateWorld(), mode: 'freeplay', zone: 'se', bounds: zoneBounds('se'), hub: true, phase: 'play', botTarget: 0, events: false, seed: 9, now: () => 0 });
  const sim = zone();
  const p = sim.addPlayer({ name: 'P', brawler: 'volt' }), base = p.maxHp;
  const spot = sim.randomPoint(300); p.x = spot.x; p.y = spot.y;
  for (let i = 0; i < 30; i++) sim.dropCube(p.x, p.y);
  sim.tick();
  assert.equal(p.cubes, CAP, 'cubes stop at the cap');
  assert.equal(p.maxHp, base + CAP * CUBE_HP);
  assert.equal(sim.cubes.length, 30 - CAP, 'the rest stay on the ground for others');
  assert(sim.dmgMult(p) <= 1 + 0.1 * CAP + 1e-9, 'so damage is bounded');
  // a death drops most of the stack, not all of it
  sim.cubes.length = 0;
  const k = sim.addPlayer({ name: 'K', brawler: 'brick' }); k.x = p.x + 400; k.y = p.y;
  p.hp = 1; sim.damage(k, p, 500, true);
  assert(!p.alive);
  assert.equal(sim.cubes.length, Math.ceil(CAP * 0.7), 'most cubes drop');
  assert(sim.cubes.length < CAP, 'but a kill never hands over a full stack');
  // loose cubes fade (they used to pile up forever in a zone that never ends)
  for (let i = 0; i < 20 * 95; i++) { p.respawnT = 99; sim.tick(); }
  assert.equal(sim.cubes.length, 0, 'loose cubes fade after a while');
  // a zero-cube victim still drops one (unchanged)
  const v = sim.addPlayer({ name: 'V', brawler: 'wisp' }); v.x = k.x + 300; v.y = k.y; v.hp = 1; sim.damage(k, v, 500, true);
  assert.equal(sim.cubes.length, 1);

  // a busy zone left running: nobody snowballs (it reached 231-669 cubes in 30 minutes before)
  const long = new Sim({ map: generateWorld(), mode: 'freeplay', zone: 'se', bounds: zoneBounds('se'), hub: true, phase: 'play', botTarget: 8, seed: 3, now: () => 0 });
  let most = 0, loose = 0;
  for (let i = 0; i < 20 * 60 * 8; i++) {
    long.tick();
    if (i % 20 === 0) { for (const q of long.players.values()) most = Math.max(most, q.cubes); loose = Math.max(loose, long.cubes.length); }
  }
  assert(most <= CAP, `no bot above the cap after 8 minutes (max ${most})`);
  for (const q of long.players.values()) assert(q.maxHp <= Math.round(BRAWLERS[q.brawler].hp * 1.4) + CAP * CUBE_HP, 'HP bounded');
  assert(loose < 120, `loose cubes stay bounded (peak ${loose})`);
  console.log(`free play cubes: OK (cap ${CAP}, 8 min zone: max held ${most}, peak loose ${loose})`);
}
{ // Showdown / Big Hunt: unchanged (no cap, a death drops every cube, cubes never fade)
  for (const mode of ['showdown', 'bighunt']) {
    const map = generateArena(4); for (let y = 1; y < map.gh - 1; y++) for (let x = 1; x < map.gw - 1; x++) map.t[y * map.gw + x] = 0;
    const sim = new Sim({ map, mode, phase: 'play', fillBots: false, events: false, seed: 4 });
    const p = sim.addPlayer({ name: 'P', brawler: 'volt' }), k = sim.addPlayer({ name: 'K', brawler: 'brick' }), z = sim.addPlayer({ name: 'Z', brawler: 'wisp' });
    p.x = 1000; p.y = 1000; k.x = 1500; k.y = 1000; z.x = 1500; z.y = 1500;
    for (let i = 0; i < 25; i++) sim.dropCube(p.x, p.y);
    sim.tick();
    assert.equal(p.cubes, 25, mode + ': no cap');
    p.hp = 1; sim.damage(k, p, 500, true);
    assert.equal(sim.cubes.length, 25, mode + ': every cube drops');
    for (let i = 0; i < 20 * 20; i++) sim.tick();
    assert.equal(sim.cubes.length, 25, mode + ': cubes stay');
  }
  console.log('showdown / big hunt cubes unchanged: OK');
}


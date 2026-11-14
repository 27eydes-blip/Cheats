import assert from 'node:assert';
import { Sim } from '../src/sim.js';
import { levelForTrophies } from '../src/bots.js';
import { generateArena, BUSH, TILE, SPAWNS } from '../public/shared.js';

const openMap = () => { const m = generateArena(3, 'meadow'); for (let y = 1; y < 39; y++) for (let x = 1; x < 39; x++) m.t[y * 40 + x] = 0; return m; };
const run = (sim, n) => { for (let i = 0; i < n; i++) sim.tick(); };

// 1) fair vision: a high-bounty enemy hiding in a bush is not chased until it pings the radar
{
  const map = openMap();
  for (let y = 18; y < 22; y++) for (let x = 30; x < 34; x++) map.t[y * 40 + x] = BUSH;
  const sim = new Sim({ map, mode: 'bounty', phase: 'play', fillBots: false, events: false, botLevel: 'hard' });
  sim.time = 30;
  const bot = sim.addPlayer({ name: 'Bot', brawler: 'volt', bot: true }); bot.x = 400; bot.y = 1000;
  const hid = sim.addPlayer({ name: 'Hider', brawler: 'wisp' }); hid.x = 1600; hid.y = 1000; hid.bounty = 6; hid.pingT = -999; // never pings
  run(sim, 40);
  assert(!sim.canSee(bot, hid));
  assert.notEqual(bot.ai.target, hid.id, 'never targets an unseen player');
  const towards = (bot.x - 400) / Math.max(1, Math.hypot(bot.x - 400, bot.y - 1000));
  assert(!(bot.x > 900 && towards > 0.95), 'does not beeline to the hidden player');
  // once it pings (public info), the bot remembers that spot
  sim.pings.push([hid.id, Math.round(hid.x), Math.round(hid.y), hid.bounty]); sim.pingLog = sim.pings;
  sim.tick();
  assert(bot.ai.mem.has(hid.id), 'ping remembered');
}
// 2) dodges a telegraphed lava pool during the warning
{
  const sim = new Sim({ map: openMap(), mode: 'bounty', phase: 'play', fillBots: false, events: false, botLevel: 'normal' });
  const bot = sim.addPlayer({ name: 'Bot', brawler: 'brick', bot: true }); bot.x = 1000; bot.y = 1000;
  sim.event = { id: 'lava', ph: 'warn', t: 5, params: { pools: [{ x: 1000, y: 1000, r: 150 }] } };
  run(sim, 30);
  assert(Math.hypot(bot.x - 1000, bot.y - 1000) > 150, 'left the warned pool before it erupted');
}
// 3) hides in a bush when hurt and alone
{
  const map = openMap(); map.t[20 * 40 + 26] = BUSH; map.t[20 * 40 + 27] = BUSH;
  const sim = new Sim({ map, mode: 'bounty', phase: 'play', fillBots: false, events: false, botLevel: 'normal' });
  const bot = sim.addPlayer({ name: 'Bot', brawler: 'volt', bot: true }); bot.x = 1000; bot.y = 1025; bot.hp = bot.maxHp * 0.2; bot.lastCombat = 0;
  run(sim, 80);
  assert.equal(map.t[Math.floor(bot.y / TILE) * 40 + Math.floor(bot.x / TILE)], BUSH, 'in a bush');
}
// 4) takes cover while reloading
{
  const map = openMap(); for (let y = 17; y < 24; y++) map.t[y * 40 + 22] = 1; // a wall to hide behind
  const sim = new Sim({ map, mode: 'bounty', phase: 'play', fillBots: false, events: false, botLevel: 'hard' });
  sim.time = 30;
  const bot = sim.addPlayer({ name: 'Bot', brawler: 'wisp', bot: true }); bot.x = 1050; bot.y = 1000; bot.ammo = 0; bot.reloadP = 0;
  const foe = sim.addPlayer({ name: 'Foe', brawler: 'wisp' }); foe.x = 1500; foe.y = 1000;
  run(sim, 25);
  assert(!lineOfSightOk(sim, foe, bot), 'broke line of sight');
}
function lineOfSightOk(sim, a, b) { const n = 60; for (let i = 1; i < n; i++) { const x = a.x + (b.x - a.x) * i / n, y = a.y + (b.y - a.y) * i / n; if (sim.map.t[Math.floor(y / TILE) * 40 + Math.floor(x / TILE)] === 1) return false; } return true; }

// 5) difficulty follows trophies, and hard bots beat easy ones
assert.equal(levelForTrophies(0), 'easy'); assert.equal(levelForTrophies(300), 'normal'); assert.equal(levelForTrophies(900), 'hard');
{
  const sim = new Sim({ map: generateArena(4), mode: 'showdown', seed: 4, lobbyTime: 0.1 });
  const id = sim.join('Pro', 'volt'); sim.players.get(id).trophies = 800;
  while (sim.phase === 'lobby') sim.tick();
  assert.equal(sim.botLevel, 'hard');
}
let hardWins = 0;
for (let i = 0; i < 60; i++) {
  const sim = new Sim({ map: generateArena(100 + i), mode: 'showdown', phase: 'play', events: false, fillBots: false });
  const A = sim.addPlayer({ name: 'H', brawler: 'volt', bot: true }), B = sim.addPlayer({ name: 'E', brawler: 'volt', bot: true });
  A.botLevel = 'hard'; B.botLevel = 'easy';
  Object.assign(A, SPAWNS[i % 10]); Object.assign(B, SPAWNS[(i + 5) % 10]);
  let t = 0;
  while (A.alive && B.alive && t < 4000) { sim.tick(); t++; }
  if (A.alive && !B.alive) hardWins++;
}
console.log(`hard vs easy (Volt mirror, 60 duels): hard won ${hardWins}`);
assert(hardWins >= 36, 'hard bots should clearly beat easy bots');
console.log('BOTS OK');

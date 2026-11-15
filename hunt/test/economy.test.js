// ECONOMY FAIRNESS: rewards are earned, never sold; a reward you already own becomes coins;
// Premium costs more than it pays back; match XP and coins per minute are about even in every mode;
// a Hunted KO scores; the Power cost in the docs is the one in the code.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fakeD1 } from './server-harness.js';
import { handleApi } from '../src/accounts.js';
import { Sim } from '../src/sim.js';
import { MODES, playersFor, HUNTED_KO, HUNTED_TARGET_KO } from '../src/modes.js';
import { applyPurchase, priceOf, rewardSource, itemId, PASS, PREMIUM_PRICE, DUPE_COINS, SKINS, KILL_FX, TITLES } from '../public/catalog.js';
import { ROAD, newProgress, normalize, xpFor, matchCoins, levelReward, MAX_LEVEL } from '../public/progression.js';
import { POWER_COST } from '../public/power.js';
import { generateArena, WORLDS, rng } from '../public/shared.js';

// ---- every Trophy Road, Hunt Pass and level reward is exclusive (no price anywhere)
const rewards = new Set();
for (const r of ROAD) if (itemId(r)) rewards.add(itemId(r));
for (const row of PASS) for (const t of ['free', 'premium']) if (itemId(row[t])) rewards.add(itemId(row[t]));
for (let L = 2; L <= MAX_LEVEL; L++) { const r = levelReward(L); for (const id of [r.skin, r.title]) if (id) rewards.add(id); }
assert(rewards.has('apex') && rewards.has('confetti') && rewards.has('volt_solar') && rewards.has('volt_static'));
for (const id of rewards) {
  assert.equal(priceOf(id), null, `${id} is a reward, not for sale`);
  assert(rewardSource(id), `${id} says where to earn it`);
  const p = normalize({ ...newProgress(), coins: 99999 });
  assert.equal(applyPurchase(p, { action: 'buy', id }).error, 'not for sale', `buy ${id}`);
  assert.equal(p.coins, 99999);
}
assert.equal(rewardSource('apex'), 'Trophy Road 1000');
assert.equal(rewardSource('ghost'), 'Hunt Pass tier 15');
assert.equal(rewardSource('dune_night'), 'Premium Pass tier 5');
// ...and the shop still sells things
const forSale = [...Object.keys(SKINS), ...Object.keys(KILL_FX), ...Object.keys(TITLES)].filter((id) => priceOf(id) > 0);
assert(forSale.length >= 6, 'the shop still has items: ' + forSale);
console.log('rewards are exclusive; for sale:', forSale.join(' '));

// ---- Premium: its coins, even with every item a duplicate, add up to less than its price
{
  let worst = 0;
  for (const row of PASS) { const r = row.premium; worst += (r.coins || 0) + (itemId(r) ? DUPE_COINS[r.skin ? 'skin' : r.fx ? 'fx' : 'title'] : 0); }
  assert(worst < PREMIUM_PRICE, `premium pays back at most ${worst} for ${PREMIUM_PRICE}`);
  console.log(`premium: ${PREMIUM_PRICE} coins, pays back ${PASS.reduce((s, r) => s + (r.premium.coins || 0), 0)} (at most ${worst})`);
}

// ---- claiming a reward you already own gives coins and says so (Hunt Pass, then the real road route)
{
  let p = normalize({ ...newProgress(), owned: ['confetti'], pass: { xp: 1e6, claimed: [] } });
  const c0 = p.coins;
  const out = applyPurchase(p, { action: 'passClaim', tier: 5, track: 'free' });
  assert.deepEqual(out.got, { id: 'confetti', coins: DUPE_COINS.fx, dupe: DUPE_COINS.fx });
  assert.equal(out.progress.coins, c0 + DUPE_COINS.fx, 'an owned Pass reward becomes coins');
  assert.equal(out.progress.owned.filter((k) => k === 'confetti').length, 1);
  const fresh = applyPurchase(normalize({ ...newProgress(), pass: { xp: 1e6, claimed: [] } }), { action: 'passClaim', tier: 5, track: 'free' });
  assert.equal(fresh.got.dupe, 0); assert(fresh.progress.owned.includes('confetti'));

  const db = fakeD1();
  db.addUser('u1', 'tok', { ...newProgress(), trophies: { volt: 300 }, owned: ['tracker'] });
  const call = async (path, body) => (await handleApi(new Request('http://hunt.test/api' + path, { method: 'POST', headers: { authorization: 'Bearer tok', 'content-type': 'application/json' }, body: JSON.stringify(body) }), { DB: db })).json();
  const r = await call('/claim', { at: 200 });
  assert.equal(r.got.dupe, DUPE_COINS.title, 'Trophy Road: owned title -> coins');
  assert.equal(r.user.progress.coins, 200 + DUPE_COINS.title);
  const shop = await call('/shop', { action: 'buy', id: 'apex' });
  assert.equal(shop.error, 'not for sale', 'the server refuses to sell a road reward');
}

// ---- Hunted: every KO scores, the target is worth more
{
  const s = new Sim({ map: generateArena(5), mode: 'hunted', phase: 'play', fillBots: false, events: false });
  const [a, b, c] = ['a', 'b', 'c'].map((n) => s.addPlayer({ name: n, brawler: 'volt' }));
  s.time = 10; s.setTarget(c);
  s.kill(b, a, 'shot');
  assert.equal(Math.floor(MODES.hunted.score(a)), HUNTED_KO, 'a KO in Hunted scores a point');
  s.kill(c, a, 'shot');
  assert.equal(Math.floor(MODES.hunted.score(a)), HUNTED_KO + HUNTED_TARGET_KO, 'the target is worth 3');
  assert.equal(s.targetId, a.id);
}

// ---- pay per minute played: about even across modes (headless bot matches, seeded)
{
  const real = Math.random, R = rng(12345);
  Math.random = R; // (bot picks use Math.random: seeded here so this test always plays the same matches)
  const pool = WORLDS.filter((w) => w.arena).map((w) => w.key), rate = {};
  try {
    for (const mode of ['showdown', 'bounty', 'hunted', 'crystals', 'squad', 'bighunt']) {
      let xp = 0, coins = 0, mins = 0;
      for (let i = 0; i < 3; i++) {
        const seed = (i * 7919 + 13) >>> 0;
        const sim = new Sim({ map: generateArena(seed, pool[i % pool.length], playersFor(mode)), mode, seed, fillBots: true });
        sim.start();
        for (let t = 0; t < 20 * 400 && sim.phase !== 'end'; t++) sim.tick();
        if (sim.phase !== 'end') sim.finish();
        const winTeam = sim.mode.teams ? (sim.teamPot[1] === sim.teamPot[2] ? 0 : sim.teamPot[1] > sim.teamPot[2] ? 1 : 2) : 0;
        for (const p of sim.players.values()) {
          const secs = p.outAt != null ? p.outAt : sim.time; // (bots send no input, so the idle rule is left out here)
          const r = { rank: p.rank, players: sim.players.size, kills: p.kills, assists: p.assists, steals: p.steals, won: sim.mode.teams ? (winTeam === 0 ? null : p.team === winTeam) : undefined, secs };
          xp += xpFor(r); coins += matchCoins(r); mins += secs / 60;
        }
      }
      rate[mode] = { xp: xp / mins, coins: coins / mins };
    }
  } finally { Math.random = real; }
  const xs = Object.values(rate).map((r) => r.xp), cs = Object.values(rate).map((r) => r.coins);
  console.log('per minute:', Object.entries(rate).map(([m, r]) => `${m} ${r.xp.toFixed(0)} XP ${r.coins.toFixed(1)}c`).join(' | '));
  assert(Math.max(...xs) / Math.min(...xs) < 1.4, 'XP per minute about even across modes');
  assert(Math.max(...cs) / Math.min(...cs) < 1.4, 'coins per minute about even across modes');
}
// ---- standing idle doesn't pay by the minute
{
  const s = new Sim({ map: generateArena(5), mode: 'bounty', phase: 'play', fillBots: false, events: false });
  const busy = s.addPlayer({ name: 'busy', brawler: 'volt' }), idle = s.addPlayer({ name: 'idle', brawler: 'volt' });
  for (let i = 0; i < 20 * 100; i++) { if (i % 2) s.input(busy.id, { t: 'in', s: i, mx: 1, my: 0 }); s.input(idle.id, { t: 'in', s: i, mx: 0, my: 0 }); s.tick(); }
  assert(s.secsOf(busy) > 95, 'playing time counts: ' + s.secsOf(busy));
  assert(s.secsOf(idle) <= 30, 'idle time does not: ' + s.secsOf(idle));
}

// ---- the docs give the Power cost the code charges
{
  const total = POWER_COST.reduce((a, b) => a + b, 0).toLocaleString('en-US');
  for (const f of ['COMBAT.md', 'public/power.js']) assert(readFileSync(new URL('../' + f, import.meta.url), 'utf8').includes(total), `${f} says ${total} coins to Power 11`);
}
console.log('ECONOMY OK');

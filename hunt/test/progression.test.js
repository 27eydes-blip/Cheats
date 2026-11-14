import assert from 'node:assert';
import { trophyDelta, applyMatch, newProgress, normalize, levelInfo, roadReward, totalTrophies } from '../public/progression.js';
import { hashPassword, PBKDF2_ITER } from '../src/accounts.js';
// trophy rules: win +8, top 3 +4, bottom half -2, else 0; never below 0
assert.equal(trophyDelta({ rank: 1, players: 10 }), 8);
assert.equal(trophyDelta({ rank: 3, players: 10 }), 4);
assert.equal(trophyDelta({ rank: 5, players: 10 }), 0);
assert.equal(trophyDelta({ rank: 6, players: 10 }), -2);
assert.equal(trophyDelta({ rank: 2, players: 6, won: true }), 8);
assert.equal(trophyDelta({ rank: 2, players: 6, won: false }), -2);
assert.equal(trophyDelta({ rank: 2, players: 6, won: null }), 0);
let p = newProgress();
let r = applyMatch(p, { rank: 9, players: 10, kills: 0, bounty: 0, brawler: 'wisp' });
assert.equal(r.progress.trophies.wisp, 0, 'never below 0'); assert.equal(r.delta, 0);
r = applyMatch(r.progress, { rank: 1, players: 10, kills: 3, bounty: 5, brawler: 'wisp' });
assert.equal(r.progress.trophies.wisp, 8); assert.equal(r.progress.trophies.volt, 0, 'per-brawler');
assert(r.xp > 0 && r.progress.xp >= r.xp);
assert.equal(levelInfo(0).level, 1); assert.equal(levelInfo(79).level, 1); assert.equal(levelInfo(80).level, 2); assert.equal(levelInfo(171).level, 2); assert.equal(levelInfo(172).level, 3);
assert(roadReward(100) && roadReward(1500) && !roadReward(150));
// old/partial saves normalize without losing data, new brawlers get 0
const old = normalize({ xp: 500, trophies: { volt: 40 }, coins: 7 });
assert.equal(old.xp, 500); assert.equal(old.trophies.volt, 40); assert.equal(old.trophies.flicker, 0); assert.equal(totalTrophies(old), 40);
// password hashing: salted PBKDF2, deterministic per salt
const h1 = await hashPassword('hunter22'), h2 = await hashPassword('hunter22');
assert.notEqual(h1.hash, h2.hash, 'random salt');
assert.equal((await hashPassword('hunter22', h1.salt)).hash, h1.hash);
assert(PBKDF2_ITER >= 100000);
console.log('PROGRESSION OK');

// bug sweep: a Squad DRAW (won === null) is not a win, even for the rank-1 player
{
  const { applyMatch: am, newProgress: np } = await import('../public/progression.js');
  const out = am(np(), { rank: 1, players: 6, kills: 0, bounty: 0, brawler: 'volt', won: null, day: 5 });
  assert.equal(out.progress.wins, 0, 'draw is not a win');
  assert.equal(out.delta, 0, 'draw gives no trophies');
  assert.equal(out.xp, 60, 'top-3 XP on a draw, not the +50 win bonus');
  const ffa = am(np(), { rank: 1, players: 10, kills: 0, bounty: 0, brawler: 'volt', day: 5 });
  assert.equal(ffa.progress.wins, 1, 'FFA rank 1 still wins');
  console.log('squad draw is not a win: ok');
}

// COMBAT UPGRADE: account level 1-100, a reward every level, weapons unlock by 40, mastery + perks
{
  const P = await import('../public/progression.js');
  const C = await import('../public/catalog.js');
  const W = await import('../public/weapons.js');
  assert.equal(P.levelInfo(1e9).level, 100, 'caps at 100');
  for (let L = 2; L <= 100; L++) assert(P.levelReward(L).coins > 0, `reward at level ${L}`);
  const unlocks = W.WEAPON_IDS.map((id) => W.WEAPONS[id].unlock);
  assert.equal(unlocks.filter((u) => u <= 1).length, 3, '3 weapons at the start'); assert(Math.max(...unlocks) <= 40, 'all 15 by level 40');
  let xpTo40 = 0; for (let L = 1; L < 40; L++) xpTo40 += P.levelNeed(L);
  const avg = P.xpFor({ rank: 4, players: 10, kills: 2, bounty: 3, assists: 1 });
  console.log(`level 40 after ~${Math.round(xpTo40 / avg)} average matches (${avg} XP each)`);
  assert(P.xpFor({ rank: 5, players: 10, kills: 1, bounty: 0, assists: 2, steals: 1 }) > P.xpFor({ rank: 5, players: 10, kills: 1, bounty: 0 }), 'assists + steals give XP');
  // levelling grants every reward once (old saves catch up), and the loadout only allows unlocked weapons
  const pr = P.normalize({ xp: 0 });
  pr.xp = 20000; const got = P.grantLevels(pr); const again = P.grantLevels(pr);
  assert(got.length > 30 && again.length === 0, 'rewards granted once');
  assert(pr.owned.includes('e_seeyou') && pr.owned.includes('marksman'), 'emotes + titles granted');
  assert.equal(C.applyPurchase(P.normalize({ xp: 0 }), { action: 'loadout', w2: 'flare' }).error, 'weapon locked');
  assert(!C.applyPurchase(P.normalize({ xp: 0 }), { action: 'loadout', w2: 'hornet' }).error, 'starter weapon is free');
  assert.equal(P.loadoutFor({ xp: 0, loadout: { w2: 'flare' } }).w2, null, 'server drops a locked weapon');
  // mastery from match stats, perk picks gated by mastery level
  const m = P.applyMatch(P.newProgress(), { rank: 2, players: 10, kills: 3, bounty: 0, brawler: 'volt', wstat: { hornet: { d: 30000, k: 6 }, volt: { d: 999, k: 1 } } });
  assert(m.progress.mastery.hornet > 0 && !m.progress.mastery.volt, 'mastery for weapons only');
  const q = m.progress; assert(W.masteryInfo(q.mastery.hornet).level >= 2, 'mastery 2 reached');
  assert(!C.applyPurchase(q, { action: 'perk', weapon: 'hornet', tier: 2, id: 'deeppockets' }).error);
  assert.equal(C.applyPurchase(q, { action: 'perk', weapon: 'hornet', tier: 8, id: 'hollowpoint' }).error, 'Reach mastery 8 first');
  C.applyPurchase(q, { action: 'perk', weapon: 'hornet', tier: 2, id: 'quickhands' });
  assert.deepEqual(q.perks.hornet, ['quickhands'], 'one perk per tier (re-pick replaces)');
  q.loadout = { w2: 'hornet' };
  assert.deepEqual(P.loadoutFor(q).perks, ['quickhands']);
  assert(W.withPerks('hornet', ['quickhands']).swap < W.SWAP_TIME);
  console.log('LEVELING + MASTERY OK');
}

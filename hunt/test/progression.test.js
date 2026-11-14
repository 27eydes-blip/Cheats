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
assert.equal(levelInfo(0).level, 1); assert.equal(levelInfo(100).level, 2); assert.equal(levelInfo(299).level, 2); assert.equal(levelInfo(300).level, 3);
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

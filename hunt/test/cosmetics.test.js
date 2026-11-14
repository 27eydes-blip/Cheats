import assert from 'node:assert';
import { applyPurchase, PASS, PASS_TIERS, PASS_XP_PER_TIER, SKINS, PREMIUM_PRICE } from '../public/catalog.js';
import { newProgress } from '../public/progression.js';
import { Sim } from '../src/sim.js';
import { generateArena, BRAWLER_IDS } from '../public/shared.js';

assert.equal(PASS.length, PASS_TIERS); assert.equal(PASS_TIERS, 30);
for (const b of BRAWLER_IDS) assert.equal(Object.values(SKINS).filter((s) => s.brawler === b).length, 2, `2 skins for ${b}`);
let p = newProgress();
assert(applyPurchase(p, { action: 'buy', id: 'volt_storm' }).error, 'cannot afford');
assert(applyPurchase(p, { action: 'equip', slot: 'title', id: 'apex' }).error, 'cannot equip unowned');
p = applyPurchase(p, { action: 'buy', id: 'tracker' }).progress; assert.equal(p.coins, 50); assert(p.owned.includes('tracker'));
assert(applyPurchase(p, { action: 'buy', id: 'tracker' }).error, 'no double buy');
p = applyPurchase(p, { action: 'equip', slot: 'title', id: 'tracker' }).progress; assert.equal(p.equipped.title, 'tracker');
p.coins = 5000; p = applyPurchase(p, { action: 'buy', id: 'rook_arctic' }).progress;
assert(applyPurchase(structuredClone(p), { action: 'equip', slot: 'skin:volt', id: 'rook_arctic' }).error, 'skin must match brawler');
p = applyPurchase(p, { action: 'equip', slot: 'skin:rook', id: 'rook_arctic' }).progress;
// pass: tier gating + premium gating + once only
assert(applyPurchase(p, { action: 'passClaim', tier: 1, track: 'free' }).error, 'tier 1 needs XP');
p.pass.xp = PASS_XP_PER_TIER * 5;
p = applyPurchase(p, { action: 'passClaim', tier: 5, track: 'free' }).progress;
assert(applyPurchase(p, { action: 'passClaim', tier: 5, track: 'free' }).error, 'claim once');
assert(applyPurchase(p, { action: 'passClaim', tier: 5, track: 'premium' }).error, 'premium locked');
const coins = p.coins; p = applyPurchase(p, { action: 'premium' }).progress; assert.equal(p.coins, coins - PREMIUM_PRICE);
p = applyPurchase(p, { action: 'passClaim', tier: 5, track: 'premium' }).progress; assert(p.owned.includes(PASS[4].premium.skin));
// cosmetics never change hitboxes or stats
const mk = () => { const s = new Sim({ map: generateArena(3), mode: 'bounty', phase: 'play', fillBots: false, events: false }); const a = s.addPlayer({ name: 'a', brawler: 'rook' }); a.x = 500; a.y = 500; return { s, a }; };
const A = mk(), B = mk();
B.s.setCosmetics(B.a.id, { 'skin:rook': 'rook_arctic', fx: 'bolt', title: 'apex' });
assert.deepEqual(A.s.stats(A.a), B.s.stats(B.a));
for (let i = 0; i < 40; i++) for (const { s, a } of [A, B]) { s.input(a.id, { t: 'in', s: i + 1, mx: 1, my: 0.4, ax: 1, ay: 0, f: i % 10 ? null : 0 }); s.tick(); }
assert.equal(A.a.x, B.a.x); assert.equal(A.a.y, B.a.y);
console.log('COSMETICS OK');

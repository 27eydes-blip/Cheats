// Lobby display helpers: per-device world stats (arena vs Free Play, the Hub migration) and how
// reward items are earned (the Locker never shows a price for them).
import assert from 'node:assert';
import { migrateLocalStats, arenaStat, freeStat, arenaStatRows, freeStatRows, earnTag, earnHint } from '../public/progression.js';
import { SKINS, KILL_FX, TITLES, LEVEL_TITLES, PASS, priceOf } from '../public/catalog.js';
import { ROAD } from '../public/progression.js';

// old save: Hub-district Free Play kills landed in stats['-1'] and were never shown
const prefs = { stats: { '-1': { games: 0, wins: 0, kills: 7, best: 12 }, 0: { games: 2, wins: 1, kills: 5, best: 3 } } };
assert.equal(migrateLocalStats(prefs), true);
assert.equal(prefs.stats['-1'], undefined, 'the -1 bucket is gone');
assert.deepEqual(prefs.free.hub, { kills: 7, best: 12 }, 'and its kills/bounty moved to the Hub');
assert.equal(migrateLocalStats(prefs), false, 'runs once');
assert.equal(prefs.stats[0].games, 2, 'arena stats untouched');
// a fresh/garbage save
const empty = { stats: 'x' };
migrateLocalStats(empty);
assert.deepEqual(empty, { stats: {}, free: {} });

// Free Play writes to the free table (Hub included), arena matches to the arena table
freeStat(prefs, 'hub').kills++;
freeStat(prefs, 'ashlands').kills += 2;
arenaStat(prefs, 'ashlands').games++;
const hubBefore = JSON.stringify(prefs.stats);
arenaStat(prefs, 'hub').games++; // not an arena: never written
assert.equal(JSON.stringify(prefs.stats), hubBefore);
assert.equal(prefs.stats['-1'], undefined);
const free = freeStatRows(prefs), arena = arenaStatRows(prefs);
assert.match(free, /<td>The Hub<\/td><td>8<\/td><td>★12<\/td>/, 'the Hub has its own, properly named row');
assert.match(free, /<td>Ashlands<\/td><td>2<\/td>/);
assert.match(arena, /<td>Ashlands<\/td><td>1<\/td><td>0<\/td>/);
assert.doesNotMatch(arena, /hub|Hub/);
for (const html of [free, arena]) assert.doesNotMatch(html, /undefined|NaN|null/);
assert.equal(free.indexOf('The Hub') < free.indexOf('Ashlands'), true, 'Hub first');

// every reward item says where it comes from; level items are never for sale
assert.equal(earnTag('volt_static'), 'LEVEL 15');
assert.equal(earnTag('legend'), 'LEVEL 100');
assert.equal(earnTag('volt_storm'), 'ROAD 700');
assert.equal(earnTag('confetti'), 'PASS 5');
assert.equal(earnTag('dune_night'), 'PREMIUM PASS 5');
assert.equal(earnTag('sharpshooter'), null, 'shop-only title');
assert.equal(earnTag('volt_classic'), null);
for (const [k, s] of Object.entries(SKINS)) if (s.level) { assert.equal(priceOf(k), null); assert(earnTag(k)); }
for (const t of Object.values(LEVEL_TITLES)) assert(earnTag(t));
for (const r of ROAD) { const id = r.skin || r.title || r.fx; if (id) assert(earnTag(id), id); }
for (const row of PASS) for (const tr of ['free', 'premium']) { const r = row[tr], id = r.skin || r.title || r.fx; if (id) assert(earnTag(id), id); }
// anything without an earn tag must have a price (or be free), so the Locker never shows nothing
for (const id of [...Object.keys(SKINS), ...Object.keys(KILL_FX), ...Object.keys(TITLES)]) assert(earnTag(id) || priceOf(id) != null, id);
assert.equal(earnHint('volt_static', 'Dead Static'), 'Reach level 15 to unlock Dead Static');
assert.equal(earnHint('volt_storm', 'Stormcell'), 'Reach 700 trophies on the Trophy Road to unlock Stormcell');
assert.equal(earnHint('dune_night', 'Night Dune'), 'Night Dune is a GP Pass reward (tier 5, premium)');
console.log('OVERNIGHT LOBBY OK');

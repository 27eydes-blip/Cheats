// Space lobby logic without a browser: ticker items come only from real data (nothing invented,
// nothing shown when there is nothing to say), countdowns tick and expire, and the small
// geometry helpers of the dock, carousel, missions orbit and pods behave.
import assert from 'node:assert';
import { tickerItems, tickItems, fmtCount, fmtCountdown, fmtLap } from '../public/ui/space/feed-items.js';
import { dockLift, DOCK_ITEMS } from '../public/ui/space/dock.js';
import { slotOffset, swipeStep, MODE_CARDS } from '../public/ui/space/carousel.js';
import { orbitArcs } from '../public/ui/space/orbit.js';
import { podLabel } from '../public/ui/space/pods.js';
import { CARD_ART_IDS } from '../public/ui/space/cardart.js';
import { RACE_MODES } from '../public/race/protocol.js';

// formatting
assert.equal(fmtCount(1284), '1,284');
assert.equal(fmtCount(1234567), '1,234,567');
assert.equal(fmtCount(7), '7');
assert.equal(fmtCountdown((3 * 60 + 12) * 60000), '03:12');
assert.equal(fmtCountdown(59 * 1000), '00:01', 'a few seconds left still reads as a minute');
assert.equal(fmtCountdown(-5000), '00:00', 'never negative');
assert.equal(fmtCountdown((26 * 60 + 5) * 60000), '1D 02H');
assert.equal(fmtLap(83.42), '1:23.42');
assert.equal(fmtLap(65.5), '1:05.50');
assert.equal(fmtLap(0), '--:--');

// nothing true to say -> no items (the ticker hides itself)
assert.deepEqual(tickerItems(null), []);
assert.deepEqual(tickerItems({ online: 0, top: null, records: [] }), [], 'zero online is not shown as a brag');
assert.deepEqual(tickerItems({ online: null }), [], 'unknown online count is omitted, never guessed');

const now = 1_800_000_000_000;
const feed = { online: 1284, top: { name: 'Nova_7', wins: 42 }, records: [{ track: 'frozen', name: 'Comet_Kid', time: 83.42 }, { track: 'neon', name: '', time: 90 }, { track: 'desert', name: 'X', time: 0 }] };
let items = tickerItems(feed, { now, trackName: (k) => ({ frozen: 'Frozen Lake Circuit' })[k] || k, targets: { online: 'crew' } });
assert.deepEqual(items.map((i) => i.id), ['online', 'top', 'rec-frozen'], 'bad records (no name, no time) are dropped');
assert.deepEqual(items[0], { id: 'online', label: 'PLAYERS ONLINE', value: '1,284', target: 'crew' });
assert.equal(items[1].value, 'Nova_7 · 42 WINS');
assert.equal(items[1].target, null, 'no leaderboard target unless one is given');
assert.equal(items[2].value, 'Frozen Lake Circuit · Comet_Kid 1:23.42');
assert.equal(items[2].target, 'trial', 'a trial record opens Time Trial');
assert.equal(tickerItems({ top: { name: 'Solo', wins: 1 } })[0].value, 'Solo · 1 WIN');
// names are trimmed and cannot smuggle control characters
assert.equal(tickerItems({ top: { name: 'A\u0007very_long_name_that_goes_on', wins: 2 } })[0].value.split(' · ')[0], 'Avery_long_name_');

// the shop countdown appears only when a reset time is given, and only while it is ahead
items = tickerItems({}, { now, shopResetAt: now + (3 * 60 + 12) * 60000 });
assert.deepEqual(items.map((i) => [i.id, i.value, i.target]), [['shop', '03:12', 'shop']]);
assert.deepEqual(tickerItems({}, { now, shopResetAt: now - 1 }), [], 'a past reset time is not shown');

// events only when passed in, and gone once they end
const ev = [{ id: 'dc', label: 'DOUBLE COINS', target: 'event', endsAt: now + 3600_000 }, { id: 'old', label: 'OLD EVENT', endsAt: now - 1 }, { label: '' }];
items = tickerItems({}, { now, events: ev });
assert.deepEqual(items.map((i) => [i.id, i.label, i.value]), [['ev-dc', 'DOUBLE COINS', 'ENDS IN 01:00']]);
assert.deepEqual(tickerItems({}, { now }), [], 'no events are ever made up');

// countdowns tick in place and drop out when they reach zero
const shop = tickerItems({ online: 5 }, { now, shopResetAt: now + 120_000, events: ev });
let t = tickItems(shop, now + 61_000);
assert.deepEqual(t.map((i) => i.value), ['5', '00:01', 'ENDS IN 00:59']);
t = tickItems(shop, now + 121_000);
assert.deepEqual(t.map((i) => i.id), ['online', 'ev-dc'], 'the shop item leaves once the shop has reset');

// dock: five orbs, middle one highest, ends lowest, symmetric
assert.deepEqual(DOCK_ITEMS.map((d) => d.k), ['profile', 'garage', 'race', 'pass', 'crew']);
assert.equal(dockLift(0.5), 1);
assert.ok(dockLift(0.1) < dockLift(0.3) && dockLift(0.3) < dockLift(0.5));
assert.ok(Math.abs(dockLift(0.3) - dockLift(0.7)) < 1e-9);

// carousel: the four racing modes, each with its own hologram art
assert.deepEqual(MODE_CARDS.map((c) => c.id), Object.keys(RACE_MODES));
for (const c of MODE_CARDS) assert.ok(CARD_ART_IDS.includes(c.id), c.id + ' has card art');
assert.deepEqual([0, 1, 2, 3].map((i) => slotOffset(i, 0)), [0, 1, 2, 2], 'far cards stack out of view');
assert.deepEqual([0, 1, 2, 3].map((i) => slotOffset(i, 2)), [-2, -1, 0, 1]);
assert.equal(swipeStep(-80, 300, 300), 1, 'a long swipe left goes to the next card');
assert.equal(swipeStep(80, 300, 300), -1);
assert.equal(swipeStep(-20, 30, 300), 1, 'a quick flick counts');
assert.equal(swipeStep(-20, 400, 300), 0, 'a slow small drag snaps back');
assert.equal(swipeStep(5, 10, 300), 0, 'a tap is not a swipe');

// missions orbit: one arc per mission, filled by progress, done = full
const arcs = orbitArcs([{ f: 1, done: true }, { f: 0.5 }, { f: -1 }]);
assert.equal(arcs.length, 3);
assert.equal(arcs[0].fill, arcs[0].len);
assert.ok(Math.abs(arcs[1].fill - arcs[1].len / 2) < 1e-9);
assert.equal(arcs[2].fill, 0);
assert.ok(arcs[1].start > arcs[0].start + arcs[0].len, 'gaps between the arcs');

// pods
assert.deepEqual([{ state: 'empty' }, { state: 'joined' }, { state: 'ready' }, null].map(podLabel), ['INVITE', 'JOINED', 'READY', 'INVITE']);

console.log('space ticker + pieces: ok');

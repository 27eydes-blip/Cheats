// Race haptics (public/race/haptics.js): navigator.vibrate patterns where the browser has it, a
// silent no-op where it doesn't (Safari on iPhone / iPad has no web vibration API), Settings >
// Haptics off = never a buzz, and a minimum gap per kind so scraping a wall never buzzes non-stop.
import assert from 'node:assert';
import { SETTINGS } from '../public/settings.js';
import { haptic, HAPTICS, setHapticsNavigator, hapticsSupported, hapticsOff } from '../public/race/haptics.js';

const calls = [];
const fake = { vibrate: (p) => { calls.push(p); return true; } };

// no vibrate API (iPhone Safari, desktops): no-op, no throw
setHapticsNavigator({});
assert.strictEqual(hapticsSupported(), false);
assert.strictEqual(haptic('crash', 1, 1), false);
setHapticsNavigator(null);
assert.strictEqual(haptic('crash', 1, 1), false);
hapticsOff();

// supported: every kind buzzes with its own pattern
setHapticsNavigator(fake);
SETTINGS.haptics = true;
let t = 10;
for (const k of Object.keys(HAPTICS)) { assert.strictEqual(haptic(k, 1, (t += 5)), true, k); }
assert.strictEqual(calls.length, Object.keys(HAPTICS).length);
assert.deepStrictEqual(calls[Object.keys(HAPTICS).indexOf('crash')], [90, 40, 140], 'crash pattern');
assert.ok(new Set(calls.map((c) => JSON.stringify(c))).size >= 7, 'the kinds feel different');
// strength scales a single buzz
calls.length = 0; haptic('bump', 0.1, (t += 5)); haptic('bump', 1, (t += 5));
assert.ok(calls[0] < calls[1], `light bump shorter (${calls[0]} < ${calls[1]})`);
// rate limit per kind
calls.length = 0;
for (let i = 0; i < 60; i++) haptic('scrape', 1, t + i / 60);
assert.ok(calls.length <= 9 && calls.length >= 7, `a 1 s scrape buzzes ~8 times, not 60 (${calls.length})`);
// a throwing / refusing vibrate never breaks the race
setHapticsNavigator({ vibrate: () => { throw new Error('nope'); } });
assert.strictEqual(haptic('hit', 1, (t += 5)), false);
// Settings > Haptics off: nothing at all
setHapticsNavigator(fake); calls.length = 0;
SETTINGS.haptics = false;
for (const k of Object.keys(HAPTICS)) haptic(k, 1, (t += 5));
assert.strictEqual(calls.length, 0, 'Haptics off: no vibration');
SETTINGS.haptics = true;
console.log('race-haptics: ok');

// STEERING: the on-screen joystick is the only way to steer. No tilt / motion steering anywhere in
// the game and no motion-permission prompt: nothing in the client (or the server) listens to
// device motion or orientation, or asks for that permission. (The browser side is checked in
// tests/e2e/overnight-race-immersion.spec.js with a spy on addEventListener and requestPermission.)
import assert from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== 'node_modules') walk(p); } else if (/\.(js|mjs|html)$/.test(f)) files.push(p); } };
walk(join(root, 'public')); walk(join(root, 'src'));
assert.ok(files.length > 50, 'scanned the client and the server');
const BAD = /devicemotion|deviceorientation|DeviceMotionEvent|DeviceOrientationEvent|requestPermission|ondevicemotion|ondeviceorientation|accelerometer|gyroscope|Accelerometer|Gyroscope/i;
const hits = [];
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((l, i) => { if (BAD.test(l)) hits.push(`${f.slice(root.length + 1)}:${i + 1}: ${l.trim().slice(0, 120)}`); });
}
assert.deepStrictEqual(hits, [], 'no motion / orientation APIs or permission requests');
console.log(`race-nomotion: ok (${files.length} files)`);

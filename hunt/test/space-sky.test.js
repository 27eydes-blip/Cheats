// Space lobby sky images (painted by scripts/space-sky.mjs): every layer exists as a real WebP at
// the size the runtime expects, the far sky is opaque and the planet has alpha, and the download
// stays small: the phone set (both orientations + planet) under 600 KB, each large file under 400 KB.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const sky = (n) => fileURLToPath(new URL(`../public/ui/space/sky/${n}.webp`, import.meta.url));

// width, height and alpha from the RIFF/WebP header (simple lossy 'VP8 ' or extended 'VP8X')
function webp(file) {
  const b = readFileSync(file);
  assert.equal(b.toString('latin1', 0, 4), 'RIFF', `${file}: not RIFF`);
  assert.equal(b.toString('latin1', 8, 12), 'WEBP', `${file}: not WebP`);
  const kind = b.toString('latin1', 12, 16);
  if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3), alpha: !!(b[20] & 0x10), bytes: b.length };
  if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff, alpha: false, bytes: b.length };
  if (kind === 'VP8L') { const v = b.readUInt32LE(21); return { w: 1 + (v & 0x3fff), h: 1 + ((v >> 14) & 0x3fff), alpha: !!((v >> 28) & 1), bytes: b.length }; }
  throw new Error(`${file}: unknown WebP chunk ${kind}`);
}

const FILES = {
  // name: [width, height, alpha]
  'sky-l-s': [1600, 900, false], 'sky-p-s': [900, 1600, false], 'planet-s': [1150, 575, true],
  'sky-l-l': [2560, 1440, false], 'sky-p-l': [1440, 2560, false], 'planet-l': [2100, 1050, true],
};
const info = {};
for (const [n, [w, h, alpha]] of Object.entries(FILES)) {
  assert.ok(existsSync(sky(n)), `missing sky/${n}.webp`);
  const i = info[n] = webp(sky(n));
  assert.deepEqual([i.w, i.h], [w, h], `${n} size`);
  assert.equal(i.alpha, alpha, `${n} alpha`);
  // the planet's radius is a fifth of its image width (background.js relies on it)
  if (n.startsWith('planet')) assert.equal(i.w, i.h * 2, `${n} is 5 radii by 2.5`);
}
const phone = info['sky-l-s'].bytes + info['sky-p-s'].bytes + info['planet-s'].bytes;
assert.ok(phone < 600 * 1024, `phone set ${(phone / 1024).toFixed(0)} KB (budget 600 KB)`);
for (const n of ['sky-l-l', 'sky-p-l', 'planet-l']) assert.ok(info[n].bytes < 400 * 1024, `${n} ${(info[n].bytes / 1024).toFixed(0)} KB (budget 400 KB)`);
console.log(`space sky: phone set ${(phone / 1024).toFixed(0)} KB, large ${Object.entries(info).filter(([k]) => k.endsWith('-l')).map(([k, v]) => `${k} ${(v.bytes / 1024).toFixed(0)} KB`).join(', ')}`);

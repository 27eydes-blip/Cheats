// OBLIVION GP brand assets: every app icon size exists at the right pixel size, the App Store icons
// have no alpha channel (iOS rejects transparency), and the wordmark is font-free SVG kept in sync
// with its module. Regenerate with scripts/brand-icon.mjs and scripts/brand-wordmark.mjs.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { wordmarkSvg, WORDMARK_ASPECT } from '../public/brand/wordmark.js';

const pub = (p) => fileURLToPath(new URL('../public/' + p, import.meta.url));

// Width, height and colour type from the PNG IHDR chunk (2 = RGB, 6 = RGBA).
function ihdr(file) {
  const b = readFileSync(file);
  assert.deepEqual([...b.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${file}: not a PNG`);
  assert.equal(b.toString('latin1', 12, 16), 'IHDR', `${file}: IHDR is not the first chunk`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), depth: b[24], colorType: b[25] };
}
// No tRNS chunk either (it would add transparency to an RGB image).
const hasChunk = (file, type) => readFileSync(file).includes(Buffer.from(type, 'latin1'));

const ICONS = [
  // file, size, must be opaque
  ['oblivion-1024.png', 1024, true],
  ['oblivion-180.png', 180, true],
  ['oblivion-167.png', 167, true],
  ['oblivion-152.png', 152, true],
  ['oblivion-120.png', 120, true],
  ['oblivion-87.png', 87, true],
  ['oblivion-192.png', 192, false],
  ['oblivion-512.png', 512, false],
  ['oblivion-maskable-512.png', 512, true],
  ['oblivion-dark-1024.png', 1024, true],
  ['oblivion-tinted-1024.png', 1024, true],
];

for (const [name, size, opaque] of ICONS) {
  const file = pub('icons/' + name);
  assert.ok(existsSync(file), `missing icon ${name}`);
  const { w, h, depth, colorType } = ihdr(file);
  assert.equal(w, size, `${name}: width`);
  assert.equal(h, size, `${name}: height`);
  assert.equal(depth, 8, `${name}: bit depth`);
  if (opaque) {
    assert.equal(colorType, 2, `${name}: must be RGB with no alpha channel (colour type ${colorType})`);
    assert.ok(!hasChunk(file, 'tRNS'), `${name}: has a tRNS transparency chunk`);
  }
}

// Wordmark: hand-built paths only (renders before any web font loads), and the .svg file is the
// module's output, so the splash's inline copy and the file never drift apart.
const svg = readFileSync(pub('brand/wordmark.svg'), 'utf8');
assert.equal(svg, wordmarkSvg() + '\n', 'public/brand/wordmark.svg is stale: run node scripts/brand-wordmark.mjs');
assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
assert.match(svg, /aria-label="Oblivion GP"/);
assert.doesNotMatch(svg, /<text|font-family|@font-face|<image|href=/, 'wordmark must not depend on fonts or external files');
// Two copies on one page must not share gradient/filter ids.
const ids = (s) => [...s.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
const a = ids(wordmarkSvg({ id: 'a' })), b = ids(wordmarkSvg({ id: 'b' }));
assert.ok(a.length > 0 && a.every((x) => !b.includes(x)), 'wordmark ids must be unique per copy');
assert.ok(WORDMARK_ASPECT > 4 && WORDMARK_ASPECT < 8, `wordmark aspect ${WORDMARK_ASPECT}`);

console.log('brand assets ok');

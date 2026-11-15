// App icon checks for Glydaway: run with `node glydaway/tests/icon.test.mjs`.
// The App Store icon must be 1024x1024 with no transparency; every size must exist at its size;
// the page must point at the favicon and the home-screen icon, and those files must be there.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const png = f => { // width, height and colour type from the PNG header (IHDR)
  const b = readFileSync(join(dir, f));
  if (b.toString('latin1', 1, 4) !== 'PNG') throw new Error(f + ' is not a PNG');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25], trns: b.includes(Buffer.from('tRNS')) };
};
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const checks = [];
for (const [f, s] of [['icons/icon-1024.png', 1024], ['icons/favicon-512.png', 512], ['icons/icon-180.png', 180], ['icons/icon-120.png', 120], ['icons/icon-60.png', 60]]) {
  const ok = existsSync(join(dir, f)); const p = ok ? png(f) : {};
  checks.push([`${f} is ${s}x${s}`, ok && p.w === s && p.h === s]);
  checks.push([`${f} has no transparency`, ok && (p.colorType === 2 || p.colorType === 0) && !p.trns]);
}
const link = rel => (html.match(new RegExp(`<link rel="${rel}"[^>]*href="([^"]+)"`)) || [])[1];
checks.push(['page links the 512 px favicon', link('icon') === 'icons/favicon-512.png' && existsSync(join(dir, 'icons/favicon-512.png'))]);
checks.push(['page links the 180 px home-screen icon', link('apple-touch-icon') === 'icons/icon-180.png' && existsSync(join(dir, 'icons/icon-180.png'))]);
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; }
if (failed) { console.error(`${failed} icon check(s) failed`); process.exit(1); }
console.log('All icon checks passed');

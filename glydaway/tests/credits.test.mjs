// Credit check for Glydaway: run with `node glydaway/tests/credits.test.mjs`.
// The Gleyde Technologies, LLC credit and the "Created by Sam Eyde III" line must never be removed.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const readme = readFileSync(join(dir, 'README.md'), 'utf8');
const PUB = 'Gleyde Technologies, LLC';
const checks = [
  ['splash screen shows the publisher', /id="splash"[^>]*>\s*<div>GLEYDE TECHNOLOGIES, LLC<\/div>/.test(html)],
  ['home footer credit', (html.match(/<div class="credit-foot">(.*?)<\/div>/) || ['', ''])[1].replace(/<[^>]+>/g, '') === `${PUB} · Created by Sam Eyde III · Produced by Juwon Shon`],
  ['Settings: Published by', html.includes(`Published by <b>${PUB}</b>`)],
  ['Settings: Created by Sam Eyde III, Founder & CEO', html.includes('Created by <b>Sam Eyde III</b>, Founder &amp; CEO')],
  ['Settings: Produced by Juwon Shon, COO', html.includes('Produced by <b>Juwon Shon</b>, COO')],
  ['Settings: copyright line', html.includes(`© 2026 ${PUB}. All rights reserved.`)],
  ['README copyright line', readme.includes(`© 2026 ${PUB}. All rights reserved.`)],
  ['README creator credit', readme.includes('Created by **Sam Eyde III**')],
  ['publisher name is never misspelled', !/Gleyde Technologies(?!, LLC)|Gleyde Technologies,LLC|Gleyde Technologies LLC|Gleyde Tech\b/i.test(html.replace(/GLEYDE TECHNOLOGIES, LLC/g, '') + readme)],
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; }
if (failed) { console.error(`${failed} credit check(s) failed`); process.exit(1); }
console.log('All credit checks passed');

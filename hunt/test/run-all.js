// Runs every test/*.test.js in turn (the whole headless suite). A new *.test.js file is picked
// up automatically. ws.test.js is skipped: it needs a running `npm run dev`.
// Usage: node test/run-all.js [name-filter]
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const SKIP = new Set(['ws.test.js']);
const filter = process.argv[2] || '';
export const suites = () => readdirSync(dir).filter((f) => f.endsWith('.test.js') && !SKIP.has(f)).sort();

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const files = suites().filter((f) => f.includes(filter));
  const t0 = Date.now();
  for (const f of files) {
    const t = Date.now();
    const r = spawnSync(process.execPath, [join(dir, f)], { stdio: 'inherit', cwd: join(dir, '..') });
    if (r.status !== 0) {
      console.error(`\nFAILED: test/${f} (exit ${r.status ?? r.signal})`);
      process.exit(1);
    }
    console.log(`ok  test/${f}  (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  }
  console.log(`\nall ${files.length} suites passed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

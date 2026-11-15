// Stamps public/version.js with a short build id so the client and the server can compare versions.
// Runs as the wrangler build hook of the production config. It only writes in CI (WORKERS_CI is set
// by Cloudflare Workers Builds) or with --force, so local dev never dirties the tree, and it never
// fails a deploy: on any problem the committed 'dev' id simply stays.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

try {
  if (process.env.WORKERS_CI || process.argv.includes('--force')) {
    const sha = (process.env.WORKERS_CI_COMMIT_SHA || '').replace(/[^0-9a-f]/gi, '').slice(0, 10).toLowerCase();
    const id = sha || 't' + Date.now().toString(36);
    // HUNT_VERSION_FILE: tests point the output somewhere else
    const file = process.env.HUNT_VERSION_FILE || fileURLToPath(new URL('../public/version.js', import.meta.url));
    writeFileSync(file, `// Build id shared by the client and the server (stamped at deploy by scripts/stamp-version.mjs).\nexport const VERSION = '${id}';\n`);
    console.log(`[stamp-version] build ${id}`);
  } else {
    console.log('[stamp-version] not a CI build: keeping the committed version');
  }
} catch (e) {
  console.warn('[stamp-version] skipped:', e && e.message);
}

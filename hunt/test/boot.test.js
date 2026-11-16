// Boot health: the build id that lets an open client notice a deploy, the stamp script that sets
// it, the static splash / watchdog in index.html and the install manifest.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../public/version.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const stamp = (env, args = []) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hunt-stamp-')), 'version.js');
  const clean = { ...process.env }; delete clean.WORKERS_CI; delete clean.WORKERS_CI_COMMIT_SHA;
  execFileSync(process.execPath, [path.join(root, 'scripts/stamp-version.mjs'), ...args], { env: { ...clean, HUNT_VERSION_FILE: file, ...env }, stdio: 'pipe' });
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
};
const idOf = (src) => /export const VERSION = '([^']+)';/.exec(src)?.[1];

// --- version: the repo carries 'dev'; only a CI build (or --force) stamps a real id
assert.equal(VERSION, 'dev', 'the committed build id must stay "dev" (a stamped file was committed by mistake?)');
assert.equal(stamp({}), null, 'a local run must not write anything');
assert.equal(idOf(stamp({ WORKERS_CI: '1', WORKERS_CI_COMMIT_SHA: 'ABCDEF0123456789abcdef' })), 'abcdef0123', 'CI stamps the short commit id');
assert.match(idOf(stamp({ WORKERS_CI: '1' })), /^t[0-9a-z]+$/, 'no commit id: falls back to a timestamp');
assert.match(idOf(stamp({}, ['--force'])), /^t[0-9a-z]+$/, '--force stamps outside CI');
assert.equal(idOf(stamp({ WORKERS_CI: '1', WORKERS_CI_COMMIT_SHA: "';alert(1)//" })), 'ae1', 'the id is cleaned before it is written into source');
// it must never fail a deploy, even when it cannot write
assert.doesNotThrow(() => execFileSync(process.execPath, [path.join(root, 'scripts/stamp-version.mjs')], { env: { ...process.env, WORKERS_CI: '1', HUNT_VERSION_FILE: '/nonexistent-dir/x/version.js' }, stdio: 'pipe' }));

// --- the production config runs the stamp before bundling; the Worker name and dev config stay as they are
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, '');
const prod = JSON.parse(strip(read('wrangler.preview.jsonc'))), dev = JSON.parse(strip(read('wrangler.jsonc')));
assert.equal(prod.name, 'hunt'); assert.equal(dev.name, 'hunt');
assert.equal(prod.build?.command, 'node scripts/stamp-version.mjs');
assert.equal(dev.build, undefined, 'local dev must not run a build hook');

// --- the server answers with the same id, in the route and in every welcome
const worker = read('src/worker.js');
assert.match(worker, /import \{ VERSION \} from '\.\.\/public\/version\.js'/);
assert.match(worker, /'\/api\/version'/);
const welcomes = worker.match(/t: 'welcome'[^}]*/g) || [];
assert.ok(welcomes.length >= 5, 'expected the match and zone welcomes');
for (const w of welcomes) assert.match(w, /v: VERSION/, 'every welcome carries the build id: ' + w.slice(0, 60));

// --- index.html: splash + watchdog that need no module, credit on it, fonts never block
const html = read('public/index.html');
const splash = html.slice(html.indexOf('<div id="splash"'), html.indexOf('<canvas id="game">'));
assert.ok(splash.length > 200, 'the splash comes before the game canvas');
assert.match(splash, /Made by Gleyde Technologies/, 'the credit is on the splash');
assert.match(splash, /id="splashReload"/);
assert.match(splash, /<script>(?![^<]*type="module")/, 'the watchdog is a classic inline script');
assert.ok(html.indexOf('window.__boot') < html.indexOf('<script type="module"'), 'the watchdog is set up before the game module');
assert.match(html, /prefers-reduced-motion/);
for (const link of html.match(/<link[^>]+fonts\.googleapis\.com\/css[^>]*>/g) || []) {
  const inNoscript = html.lastIndexOf('<noscript>', html.indexOf(link)) > html.lastIndexOf('</noscript>', html.indexOf(link));
  assert.ok(/media="print"/.test(link) || inNoscript, 'web fonts must not be render-blocking: ' + link);
  assert.match(link, /display=swap/);
}
assert.match(html, /<div id="creditGame">Made by Gleyde Technologies<\/div>/, 'the in-match credit is still there');

// --- install to home screen
const man = JSON.parse(read('public/manifest.webmanifest'));
assert.equal(man.name, 'Oblivion GP'); assert.equal(man.short_name, 'Oblivion GP'); assert.equal(man.display, 'fullscreen'); assert.equal(man.orientation, 'landscape');
const tokens = read('public/ui/tokens.css');
assert.ok(tokens.includes(`--bg: ${man.background_color};`), 'background colour comes from tokens.css');
assert.ok(html.includes(`<meta name="theme-color" content="${man.theme_color}">`), 'theme colour matches the page');
const pngSize = (f) => { const b = fs.readFileSync(path.join(root, 'public', f)); assert.equal(b.toString('latin1', 1, 4), 'PNG', f); return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`; };
for (const i of man.icons) assert.equal(pngSize(i.src), i.sizes, i.src);
for (const need of ['192x192 any', '512x512 any', '192x192 maskable', '512x512 maskable']) assert.ok(man.icons.some((i) => `${i.sizes} ${i.purpose}` === need), 'manifest icon ' + need);
assert.equal(pngSize('icons/oblivion-180.png'), '180x180');
assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
assert.match(html, /<link rel="apple-touch-icon" sizes="180x180" href="icons\/oblivion-180\.png">/);
// every icon the page links to exists at the size it claims
for (const [, sz, f] of html.matchAll(/<link rel="(?:apple-touch-icon|icon)"[^>]*sizes="(\d+x\d+)" href="([^"]+)">/g)) assert.equal(pngSize(f), sz, f);
assert.match(html, /<title>Oblivion GP<\/title>/);
for (const m of ['apple-mobile-web-app-title', 'application-name']) assert.ok(html.includes(`<meta name="${m}" content="Oblivion GP">`), m);
assert.ok(html.includes('<meta name="author" content="Gleyde Technologies">'), 'the page names Gleyde Technologies as its author');
assert.ok(!/\bHunt\b/.test(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '')), 'no player-visible "Hunt" left in index.html');

console.log('boot tests passed');

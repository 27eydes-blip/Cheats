// Bundles the game into one self-contained HTML file for publishing as a claude.ai Artifact.
// Usage: node artifact/build.mjs [out.html]   (default: artifact/skydrift-artifact.html)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const dataUri = (p) => 'data:image/svg+xml;base64,' + Buffer.from(read(p)).toString('base64');

// Order matters: each module only uses names from modules above it (or hoisted functions).
const MODULES = [
  'public/shared/score.js',
  'public/shared/match.js',
  'src/content/seed-days.js',
  'src/content/packs.js',
  'public/config.js',
  'public/js/profile.js',
  'public/js/audio.js',
  'public/js/collection.js',
  'public/themes.js',
  'public/js/sky.js',
  'public/js/theme-picker.js',
  'artifact/local-api.js',
  'public/js/app.js',
];

function strip(src) {
  return src
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^export \{[^}]*\};?\s*$/gm, '')
    .replace(/^export (const|function|async function|let|class) /gm, '$1 ');
}

let js = MODULES.map((m) => `// ---- ${m} ----\n${strip(read(m))}`).join('\n');

const must = (from, to) => {
  if (!js.includes(from)) throw new Error(`patch target missing: ${from.slice(0, 60)}`);
  js = js.replace(from, to);
};
// app.js imported `unlock as unlockAudio`
js = js.replace('// ---- public/js/app.js ----', '// ---- public/js/app.js ----\nconst unlockAudio = unlock;');
// API calls go to the in-page adapter instead of the Worker
must('async function api(path, body) {', 'async function api(path, body) {\n  return localApi(path, body);');
// profile sync to the server is not used here
must("fetch(`/api/profile?player=${encodeURIComponent(id)}`", 'Promise.reject(`/api/profile?player=${encodeURIComponent(id)}`');
// glider art is inlined
must("const svg = await (await fetch('art/glider.svg')).text();", `const svg = ${JSON.stringify(read('public/art/glider.svg'))};`);
// share link
must('SHARE_URL: location.origin,', "SHARE_URL: 'Play on Claude',");
// connect to the shared db, then show the editor button for owners and editors
must('\ninit();\n', `
init();
connectSky();
document.addEventListener('sky-connected', () => {
  if (SKY.canEdit && SKY.db) { const b = $('btn-editor'); b.hidden = false; b.onclick = () => { sfx.tap(); openEditor(); }; }
  const n = $('home-shared');
  if (n) n.textContent = SKY.db ? 'Rarity is live: every signed-in player’s answers count.' : '';
});
`);

let css = read('public/style.css')
  .replace("url('art/glider.svg')", `url('${dataUri('public/art/glider.svg')}')`)
  .replace('padding: calc(12px + var(--safe-t)) 16px calc(14px + var(--safe-b));',
    'padding: 12px max(16px, env(safe-area-inset-left, 0px)) 14px max(16px, env(safe-area-inset-right, 0px));')
  .replace("--safe-b: env(safe-area-inset-bottom, 0px);\n  --safe-t: env(safe-area-inset-top, 0px);", '--safe-b: 0px;\n  --safe-t: 0px;');
if (css.includes("url('art/")) throw new Error('un-inlined art in CSS');

css += `
/* Artifact build extras */
html, body { height: 100%; background: #9fc4f0; }
.home-shared { margin: 0; text-align: center; font-size: 12px; color: var(--ink-soft); }
body.night .home-shared { color: #d9dcf5; }
.editor-panel { display: grid; gap: 10px; }
.editor-panel code { font-size: 12px; background: rgba(232, 184, 74, .18); padding: 1px 6px; border-radius: 6px; }
.ed-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ed-row input { font: inherit; padding: 6px 10px; border-radius: 10px; border: 1px solid #e3d6b5; }
.ed-src { font-size: 12px; color: var(--ink-soft); }
.ed-prompt { display: grid; gap: 6px; padding: 10px; border-radius: 14px; background: rgba(255, 255, 255, .7); border: 1px solid #f0e2bd; }
.ed-prompt label { font-weight: 600; font-size: 13px; }
.ed-prompt label small { font-weight: 400; color: var(--ink-soft); }
.ed-q { font: inherit; font-size: 15px; padding: 8px 10px; border-radius: 10px; border: 1px solid #e3d6b5; }
.ed-a { font: 12px/1.5 ui-monospace, Menlo, Consolas, monospace; min-height: 140px; padding: 8px; border-radius: 10px; border: 1px solid #e3d6b5; white-space: pre; overflow-x: auto; resize: vertical; }
.ed-miss { margin: 0; font-size: 12px; }
.ed-miss button { border: 1px solid #e3d6b5; background: #fff; border-radius: 999px; padding: 2px 8px; font-size: 12px; margin: 2px; }
.ed-msg { margin: 0; font-size: 14px; }
.ed-msg.ok { color: #1b6b3a; font-weight: 600; }
.ed-msg.err { color: #b8324c; font-weight: 600; }
.modal-card:has(.editor-panel) { max-width: 640px; }
`;

let html = read('public/index.html');
const bodyStart = html.indexOf('<body>') + '<body>'.length;
const bodyEnd = html.indexOf('<script type="module"');
let body = html.slice(bodyStart, bodyEnd)
  .replaceAll('src="art/se3-logo.svg"', `src="${dataUri('public/art/se3-logo.svg')}"`)
  .replace('<button class="icon-btn" id="btn-collection" aria-label="Collection">🗺️</button>',
    '<button class="icon-btn" id="btn-editor" aria-label="Edit prompts" hidden>✎</button>\n          <button class="icon-btn" id="btn-collection" aria-label="Collection">🗺️</button>')
  .replace('<p class="home-note" id="home-note">7 prompts · 25 seconds each</p>',
    '<p class="home-note" id="home-note">7 prompts · 25 seconds each</p>\n        <p class="home-shared" id="home-shared"></p>');
if (body.includes('src="art/')) throw new Error('un-inlined art in HTML');

const out = `<title>Skydrift Isles</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Seven strange questions a day. Rare answers fly higher.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Fredoka:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
${css}
</style>
${body.trim()}
<script type="module">
${js}
</script>
`;

const dest = process.argv[2] || path.join(ROOT, 'artifact/skydrift-artifact.html');
fs.writeFileSync(dest, out);
console.log(`wrote ${dest} (${(out.length / 1024).toFixed(0)} KB)`);

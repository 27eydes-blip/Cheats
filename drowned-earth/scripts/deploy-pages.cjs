// Deploy a built folder to Cloudflare Pages in one request (no upload JWT, so it works behind a header-injecting proxy).
// npm run build && NODE_USE_ENV_PROXY=1 node scripts/deploy-pages.cjs dist <account-id> drowned-earth   (token from CLOUDFLARE_API_TOKEN)
// Pages direct upload in one multipart request: manifest + files named by hash.
const fs = require('fs'), path = require('path');
const { hash } = require('blake3-wasm');
const root = process.argv[2], A = process.argv[3], P = process.argv[4];
const files = []; (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : files.push(p); } })(root);
const manifest = {}; const form = new FormData(); const seen = new Set();
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2', '.hdr': 'image/vnd.radiance', '.bin': 'application/octet-stream' };
for (const f of files) {
  const buf = fs.readFileSync(f), ext = path.extname(f).slice(1);
  const h = hash(buf.toString('base64') + ext).toString('hex').slice(0, 32);
  manifest['/' + path.relative(root, f).split(path.sep).join('/')] = h;
  if (!seen.has(h)) { seen.add(h); form.append(h, new Blob([buf], { type: types['.' + ext] || 'application/octet-stream' }), path.basename(f)); }
}
form.append('manifest', JSON.stringify(manifest));
form.append('branch', 'main');
(async () => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${A}/pages/projects/${P}/deployments`, { method: 'POST', body: form, headers: { Authorization: 'Bearer ' + (process.env.CLOUDFLARE_API_TOKEN || 'proxy-injected') } });
  const d = await r.json(); console.log(r.status, d.success, JSON.stringify(d.errors), d.result?.url, d.result?.latest_stage?.status);
})();

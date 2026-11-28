// Deploy a built folder as an R2 bucket + a tiny Worker that serves it (workers.dev).
// Uses only the API token (no upload JWTs), so it works behind a header-injecting proxy.
// npm run build && NODE_USE_ENV_PROXY=1 CLOUDFLARE_API_TOKEN=... node scripts/deploy-worker.cjs dist <account-id> drowned-earth
const fs = require('fs'), path = require('path');
const [root, A, NAME] = process.argv.slice(2);
const API = `https://api.cloudflare.com/client/v4/accounts/${A}`;
const H = { Authorization: 'Bearer ' + (process.env.CLOUDFLARE_API_TOKEN || 'proxy-injected') };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2', '.hdr': 'image/vnd.radiance', '.bin': 'application/octet-stream' };
const WORKER = `export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    let key = decodeURIComponent(url.pathname.slice(1)) || 'index.html';
    if (key.endsWith('/')) key += 'index.html';
    let obj = await env.BUCKET.get(key);
    if (!obj && !key.includes('.')) obj = await env.BUCKET.get('index.html');
    if (!obj) return new Response('Not found', { status: 404 });
    const h = new Headers(); obj.writeHttpMetadata(h); h.set('etag', obj.httpEtag);
    h.set('cache-control', key === 'index.html' ? 'no-cache' : (key.startsWith('assets/index-') || key.startsWith('assets/three-') ? 'public, max-age=31536000, immutable' : 'public, max-age=86400'));
    return new Response(obj.body, { headers: h });
  },
};`;
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return { success: r.ok, raw: t.slice(0, 200) }; } };
(async () => {
  const b = await j(await fetch(`${API}/r2/buckets`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: NAME }) }));
  console.log('bucket', b.success ? 'created' : JSON.stringify(b.errors));
  const files = []; (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p) : files.push(p); } })(root);
  let done = 0, failed = [];
  const put = async (f) => {
    const key = path.relative(root, f).split(path.sep).join('/');
    for (let tries = 0; tries < 4; tries++) {
      try {
        const r = await fetch(`${API}/r2/buckets/${NAME}/objects/${key.split('/').map(encodeURIComponent).join('/')}`, { method: 'PUT', headers: { ...H, 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }, body: fs.readFileSync(f) });
        if (r.ok) { done++; return; }
        if (tries === 3) failed.push(key + ' ' + r.status + ' ' + (await r.text()).slice(0, 120));
      } catch (e) { if (tries === 3) failed.push(key + ' ' + e.message); }
      await new Promise((q) => setTimeout(q, 800 * (tries + 1)));
    }
  };
  const q = [...files]; await Promise.all(Array.from({ length: 6 }, async () => { while (q.length) await put(q.shift()); }));
  console.log(`uploaded ${done}/${files.length}`); if (failed.length) { console.log('FAILED', failed.slice(0, 5)); process.exit(1); }
  const form = new FormData();
  form.append('metadata', JSON.stringify({ main_module: 'worker.js', compatibility_date: '2025-06-01', bindings: [{ type: 'r2_bucket', name: 'BUCKET', bucket_name: NAME }] }));
  form.append('worker.js', new Blob([WORKER], { type: 'application/javascript+module' }), 'worker.js');
  const w = await j(await fetch(`${API}/workers/scripts/${NAME}`, { method: 'PUT', headers: H, body: form }));
  console.log('worker', w.success ? 'deployed' : JSON.stringify(w.errors || w.raw));
  const s = await j(await fetch(`${API}/workers/scripts/${NAME}/subdomain`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true }) }));
  console.log('workers.dev route', s.success ? 'enabled' : JSON.stringify(s.errors || s.raw));
})();

// Downloads every source asset listed in assets/manifest.json into .asset-cache/.
// Idempotent: files already present (and non-empty) are skipped.
//   node scripts/assets/fetch.mjs [filter]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE = path.join(ROOT, '.asset-cache');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8'));
const filter = process.argv[2] ? new RegExp(process.argv[2]) : null;
const credits = fs.existsSync(path.join(CACHE, 'credits.json')) ? JSON.parse(fs.readFileSync(path.join(CACHE, 'credits.json'), 'utf8')) : {};

async function get(url, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (i >= tries - 1) throw e;
      await new Promise((res) => setTimeout(res, 1000 * 2 ** i));
    }
  }
}
const json = async (url) => JSON.parse((await get(url)).toString());
async function save(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, await get(url));
  return true;
}
async function pool(items, n, fn) {
  const q = [...items];
  await Promise.all(Array.from({ length: n }, async () => { while (q.length) await fn(q.shift()); }));
}
async function phInfo(id) {
  if (!credits[id]) {
    const info = await json(`https://api.polyhaven.com/info/${id}`);
    credits[id] = { source: 'Poly Haven', name: info.name, authors: Object.keys(info.authors || {}), url: `https://polyhaven.com/a/${id}`, license: 'CC0' };
  }
}

const jobs = [];
for (const [key, t] of Object.entries(manifest.textures)) {
  jobs.push(async () => {
    const id = t.src.split(':')[1];
    const files = await json(`https://api.polyhaven.com/files/${id}`);
    const dir = path.join(CACHE, 'textures', key);
    const pick = (slot) => (files[slot] || files.col_1 || files[Object.keys(files).find((k) => k.startsWith('col'))])['2k'].jpg.url;
    await save(pick('Diffuse'), path.join(dir, 'albedo.jpg'));
    await save(pick('nor_gl'), path.join(dir, 'normal.jpg'));
    await save(pick('arm'), path.join(dir, 'arm.jpg'));
    await phInfo(id);
    console.log('texture', key, id);
  });
}
for (const [key, src] of Object.entries(manifest.hdris)) {
  jobs.push(async () => {
    const id = src.split(':')[1];
    const files = await json(`https://api.polyhaven.com/files/${id}`);
    await save(files.hdri['1k'].hdr.url, path.join(CACHE, 'hdri', `${key}.hdr`));
    await phInfo(id);
    console.log('hdri', key, id);
  });
}
for (const [key, m] of Object.entries(manifest.models)) {
  jobs.push(async () => {
    const id = m.src.split(':')[1];
    const files = await json(`https://api.polyhaven.com/files/${id}`);
    const g = files.gltf['1k'].gltf;
    const dir = path.join(CACHE, 'models', key);
    await save(g.url, path.join(dir, 'model.gltf'));
    for (const [rel, f] of Object.entries(g.include || {})) await save(f.url, path.join(dir, rel));
    await phInfo(id);
    console.log('model', key, id);
  });
}
// glTF with external buffers/images: fetch the .gltf, then everything it references
async function fetchGltf(url, dir) {
  const name = decodeURIComponent(url.split('/').pop());
  const file = path.join(dir, name);
  await save(url, file);
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const base = url.slice(0, url.lastIndexOf('/') + 1);
  const refs = [...(j.buffers || []), ...(j.images || [])].map((x) => x.uri).filter((u) => u && !u.startsWith('data:'));
  for (const u of refs) await save(base + u.split('/').map(encodeURIComponent).join('/'), path.join(dir, decodeURIComponent(u)));
  return file;
}
for (const [key, c] of Object.entries(manifest.characters)) {
  if (key.startsWith('_')) continue;
  jobs.push(async () => {
    const dir = path.join(CACHE, 'characters', key);
    if (c.url.endsWith('.glb')) await save(c.url, path.join(dir, 'model.glb'));
    else await fetchGltf(c.url, dir);
    credits['quaternius:' + key] = { source: 'Quaternius', name: key, authors: ['Quaternius'], url: 'https://quaternius.com', mirror: c.url, license: 'CC0' };
    console.log('character', key);
  });
}

const run = filter ? jobs.filter((_, i) => filter.test(String(i))) : jobs;
await pool(run, 6, async (j) => { try { await j(); } catch (e) { console.error('FAILED', e.message); process.exitCode = 1; } });
fs.mkdirSync(CACHE, { recursive: true });
fs.writeFileSync(path.join(CACHE, 'credits.json'), JSON.stringify(credits, null, 2));

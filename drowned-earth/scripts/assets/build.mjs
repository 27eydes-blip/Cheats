// Turns .asset-cache/ (raw CC0 downloads) into compact runtime assets in public/assets/:
//   - tiling PBR materials → KTX2 (Basis ETC1S colour/ARM, UASTC+zstd normals) at 1k and 2k
//   - props/models → GLB with meshopt-compressed geometry, simplified to a triangle budget,
//     textures resized and transcoded to KTX2
//   - characters → skinned GLBs + one trimmed animation library
//   - HDRIs → 1k .hdr plus the sun position (for aligning image-based light with our sun)
// Writes public/assets/index.json (consumed by src/assets/AssetLibrary.js) and CREDITS.md.
//   node scripts/assets/build.mjs [textures|models|characters|hdri]...
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { encodeToKTX2 } from 'ktx2-encoder';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, simplifyPrimitive, meshopt, resample, reorder, flatten, join, unpartition } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import * as THREE from 'three';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE = path.join(ROOT, '.asset-cache');
const OUT = path.join(ROOT, 'public/assets');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/manifest.json'), 'utf8'));
const only = new Set(process.argv.slice(2));
const want = (k) => only.size === 0 || only.has(k);
// each section writes its own partial index so sections can build in parallel processes
const SECTIONS = { textures: 'textures', hdri: 'hdris', models: 'models', characters: 'characters' };
const partFile = (sec) => path.join(CACHE, `index-${sec}.json`);
const index = {};
for (const [sec, k] of Object.entries(SECTIONS)) index[k] = fs.existsSync(partFile(sec)) ? JSON.parse(fs.readFileSync(partFile(sec), 'utf8')) : {};
const savePart = (sec) => fs.writeFileSync(partFile(sec), JSON.stringify(index[SECTIONS[sec]], null, 1));

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;

const decode = async (b) => {
  const { data, info } = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8Array(data) };
};
const pow2 = (n) => 2 ** Math.round(Math.log2(n));
// kind: 'srgb' | 'linear' | 'normal'
async function toKTX2(input, size, kind) {
  const meta = await sharp(input).metadata();
  const w = Math.min(size, pow2(meta.width)), h = Math.min(size, pow2(meta.height));
  const png = await sharp(input).resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  const opts = { isKTX2File: true, generateMipmap: true, imageDecoder: decode };
  if (kind === 'normal') Object.assign(opts, { isUASTC: false, isNormalMap: true, isPerceptual: false, qualityLevel: 255, compressionLevel: 2 });
  else Object.assign(opts, { isUASTC: false, qualityLevel: kind === 'srgb' ? 170 : 110, compressionLevel: 2, isPerceptual: kind === 'srgb' });
  const out = await encodeToKTX2(new Uint8Array(png), opts);
  return Buffer.from(out);
}
const write = (rel, buf) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); return buf.length; };
const quiet = console.log;

// ---------------------------------------------------------------- textures
if (want('textures')) {
  for (const [key, t] of Object.entries(manifest.textures)) {
    const dir = path.join(CACHE, 'textures', key);
    const entry = { metres: t.metres, bytes: {} };
    for (const tier of [['1k', 1024], ['2k', 2048]]) {
      let bytes = 0;
      bytes += write(`tex/${key}.albedo.${tier[0]}.ktx2`, await toKTX2(fs.readFileSync(path.join(dir, 'albedo.jpg')), tier[1], 'srgb'));
      bytes += write(`tex/${key}.normal.${tier[0]}.ktx2`, await toKTX2(fs.readFileSync(path.join(dir, 'normal.jpg')), tier[1], 'normal'));
      bytes += write(`tex/${key}.arm.${tier[0]}.ktx2`, await toKTX2(fs.readFileSync(path.join(dir, 'arm.jpg')), tier[1], 'linear'));
      entry.bytes[tier[0]] = bytes;
    }
    // mean albedo, so the shader can blend toward it in the distance (kills tiling)
    const st = await sharp(path.join(dir, 'albedo.jpg')).resize(64, 64).stats();
    entry.mean = st.channels.slice(0, 3).map((c) => +(c.mean / 255).toFixed(3));
    index.textures[key] = entry; savePart('textures');
    quiet('texture', key, entry.bytes);
  }
}

// ---------------------------------------------------------------- hdri
if (want('hdri')) {
  for (const key of Object.keys(manifest.hdris)) {
    const buf = fs.readFileSync(path.join(CACHE, 'hdri', `${key}.hdr`));
    const loader = new RGBELoader().setDataType(THREE.FloatType);
    const img = loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const { width: W, height: H, data } = img;
    let best = 0, bi = 0, sum = 0;
    for (let i = 0; i < W * H; i++) {
      const l = 0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2];
      sum += l;
      if (l > best) { best = l; bi = i; }
    }
    const x = bi % W, y = Math.floor(bi / W);
    write(`hdri/${key}.hdr`, buf);
    // u in [0,1] left→right, v in [0,1] top→bottom of the equirect image
    index.hdris[key] = { file: `hdri/${key}.hdr`, sunU: +(x / W).toFixed(4), sunV: +(y / H).toFixed(4), peak: +best.toFixed(1), mean: +(sum / (W * H)).toFixed(4), bytes: buf.length };
    savePart('hdri'); quiet('hdri', key, index.hdris[key]);
  }
}

// ---------------------------------------------------------------- glTF helpers
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

function slotsOf(doc, tex) {
  return new Set(tex.getGraph().listParentEdges(tex).map((e) => e.getName()));
}
async function compressTextures(doc, maxSize, auxSize = maxSize) {
  const basisu = doc.createExtension(KHRTextureBasisu).setRequired(true);
  let any = false;
  for (const tex of doc.getRoot().listTextures()) {
    if (tex.getMimeType() === 'image/ktx2') continue;
    const s = slotsOf(doc, tex);
    const kind = s.has('normalTexture') ? 'normal' : (s.has('baseColorTexture') || s.has('emissiveTexture')) ? 'srgb' : 'linear';
    const img = Buffer.from(tex.getImage());
    // alpha-tested foliage: keep the alpha channel crisp (ETC1S handles RGBA)
    tex.setImage(new Uint8Array(await toKTX2(img, kind === 'srgb' ? maxSize : auxSize, kind)));
    tex.setMimeType('image/ktx2');
    if (tex.getURI()) tex.setURI(tex.getURI().replace(/\.(png|jpe?g|webp)$/i, '.ktx2'));
    any = true;
  }
  if (!any) basisu.dispose();
}
function triCount(doc) {
  let t = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const idx = p.getIndices();
    t += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
  }
  return Math.round(t);
}
function bounds(doc) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  const visit = (node, parent) => {
    const m = new THREE.Matrix4().fromArray(node.getMatrix());
    const world = parent.clone().multiply(m);
    const mesh = node.getMesh();
    if (mesh) for (const p of mesh.listPrimitives()) {
      const pos = p.getAttribute('POSITION');
      const v = new THREE.Vector3();
      const a = pos.getMin([]), b = pos.getMax([]);
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? b[0] : a[0], i & 2 ? b[1] : a[1], i & 4 ? b[2] : a[2]).applyMatrix4(world);
        for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v.getComponent(k)); max[k] = Math.max(max[k], v.getComponent(k)); }
      }
    }
    for (const c of node.listChildren()) visit(c, world);
  };
  for (const n of scene.listChildren()) visit(n, new THREE.Matrix4());
  return { min: min.map((x) => +x.toFixed(3)), max: max.map((x) => +x.toFixed(3)) };
}

// ---------------------------------------------------------------- models
if (want('models')) {
  for (const [key, m] of Object.entries(manifest.models)) {
    if (index.models[key] && fs.existsSync(path.join(OUT, index.models[key].file)) && !process.env.FORCE) continue;
    const file = path.join(CACHE, 'models', key, 'model.gltf');
    const doc = await io.read(file);
    // one mesh per material (fewer draw calls), then a triangle budget
    await doc.transform(dedup(), prune(), flatten(), join({ keepNamed: false }), weld());
    const before = triCount(doc);
    const budget = m.maxTris ?? 5000;
    if (before > budget) {
      await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: budget / before, error: 0.5, lockBorder: false }));
    }
    // LOD1 (~18% of LOD0) shares LOD0's vertex data; runtime picks by distance
    const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
    for (const node of doc.getRoot().listNodes()) {
      const mesh = node.getMesh();
      if (!mesh || node.getName().endsWith('__lod1')) continue;
      const lm = doc.createMesh(mesh.getName() + '__lod1');
      for (const prim of mesh.listPrimitives()) {
        const c = prim.clone();
        simplifyPrimitive(c, { simplifier: MeshoptSimplifier, ratio: 0.18, error: 0.5, lockBorder: false });
        lm.addPrimitive(c);
      }
      const ln = doc.createNode(node.getName() + '__lod1').setMesh(lm).setMatrix(node.getMatrix());
      scene.addChild(ln);
    }
    await compressTextures(doc, m.texSize ?? 1024, m.auxSize ?? 512);
    const bb = bounds(doc); // before quantization, which stores positions as normalised ints
    await doc.transform(reorder({ encoder: MeshoptEncoder }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }), prune());
    let glb;
    try { glb = Buffer.from(await io.writeBinary(doc)); } catch (e) {
      // some attribute layouts can't be meshopt-encoded: keep quantization, drop the extension
      quiet('model', key, 'meshopt encode failed, writing quantized only:', e.message);
      doc.getRoot().listExtensionsUsed().find((x) => x.extensionName === 'EXT_meshopt_compression')?.dispose();
      await doc.transform(unpartition());
      glb = Buffer.from(await io.writeBinary(doc));
    }
    const bytes = write(`models/${key}.glb`, glb);
    index.models[key] = { file: `models/${key}.glb`, tris: triCount(doc), srcTris: before, ...bb, bytes };
    savePart('models'); quiet('model', key, before, '→', index.models[key].tris, (bytes / 1e6).toFixed(2) + 'MB');
  }
}

// ---------------------------------------------------------------- characters
if (want('characters')) {
  const C = manifest.characters;
  for (const [key, c] of Object.entries(C)) {
    if (key.startsWith('_')) continue;
    const dir = path.join(CACHE, 'characters', key);
    const src = fs.readdirSync(dir).find((f) => /\.(gltf|glb)$/.test(f));
    const doc = await io.read(path.join(dir, src));
    if (key === 'animations') {
      // animation library: drop the mannequin mesh and unused clips
      const keep = new Set(c.keep);
      for (const a of doc.getRoot().listAnimations()) if (!keep.has(a.getName())) a.dispose();
      for (const n of doc.getRoot().listNodes()) if (n.getMesh()) { n.getMesh().dispose(); n.setMesh(null); n.setSkin(null); }
      for (const s of doc.getRoot().listSkins()) s.dispose();
      await doc.transform(prune({ keepLeaves: true }), resample({ tolerance: 1e-4 }), dedup());
    } else {
      await doc.transform(dedup(), prune(), weld());
      await compressTextures(doc, 1024, 1024);
    }
    await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    const glb = Buffer.from(await io.writeBinary(doc));
    const bytes = write(`characters/${key}.glb`, glb);
    index.characters[key] = { file: `characters/${key}.glb`, bytes, ...(key === 'animations' ? { clips: doc.getRoot().listAnimations().map((a) => a.getName()) } : { tris: triCount(doc) }) };
    savePart('characters'); quiet('character', key, (bytes / 1e6).toFixed(2) + 'MB');
  }
}

// ---------------------------------------------------------------- index + credits
for (const [sec, k] of Object.entries(SECTIONS)) if (fs.existsSync(partFile(sec))) index[k] = JSON.parse(fs.readFileSync(partFile(sec), 'utf8'));
const sum = (o, f) => Object.values(o).reduce((a, e) => a + f(e), 0);
index.bytes = {
  textures1k: sum(index.textures, (e) => e.bytes['1k'] || 0),
  textures2k: sum(index.textures, (e) => e.bytes['2k'] || 0),
  hdris: sum(index.hdris, (e) => e.bytes),
  models: sum(index.models, (e) => e.bytes),
  characters: sum(index.characters, (e) => e.bytes),
};
write('index.json', Buffer.from(JSON.stringify(index, null, 1)));
quiet('bytes', index.bytes);

const credits = JSON.parse(fs.readFileSync(path.join(CACHE, 'credits.json'), 'utf8'));
const used = new Map();
for (const t of Object.values(manifest.textures)) used.set(t.src.split(':')[1], 'Material');
for (const s of Object.values(manifest.hdris)) used.set(s.split(':')[1], 'HDRI');
for (const m of Object.values(manifest.models)) used.set(m.src.split(':')[1], 'Model');
let md = '# Credits\n\nEvery third-party asset in Drowned Earth is **CC0 (public domain)**. No attribution is legally required; it is given anyway, with thanks.\n\n' +
  'Sources are listed in `assets/manifest.json`. `npm run assets:fetch && npm run assets:build` reproduces `public/assets/` from them.\n\n' +
  'Everything not listed here (architecture, water, sky, clouds, audio, UI, shaders, procedural textures) is original to this project.\n\n';
md += '## Poly Haven — https://polyhaven.com (CC0)\n\n| Type | Asset | Authors |\n|---|---|---|\n';
for (const [id, kind] of used) {
  const c = credits[id];
  if (c) md += `| ${kind} | [${c.name}](${c.url}) | ${c.authors.join(', ')} |\n`;
}
md += '\n## Quaternius — https://quaternius.com (CC0)\n\n' +
  '- Universal Base Characters (bodies, faces, hair)\n- Modular Character Outfits – Fantasy (peasant and ranger outfits)\n- Universal Animation Library (idle, walk, talk, work, sit, swim clips)\n\n' +
  'Quaternius distributes these through Google Drive, which this build environment cannot reach, so they were fetched from public GitHub mirrors of the unmodified CC0 packs:\n\n';
for (const [k, c] of Object.entries(manifest.characters)) if (!k.startsWith('_')) md += `- \`${k}\`: ${c.url}\n`;
md += '\n## Libraries\n\n- three.js (MIT) — rendering, glTF/KTX2 loaders, Basis transcoder, meshopt decoder\n- Basis Universal (Apache-2.0) via ktx2-encoder (MIT) — texture compression at build time\n- glTF Transform (MIT), meshoptimizer (MIT), sharp (Apache-2.0) — asset build pipeline\n';
fs.writeFileSync(path.join(ROOT, 'CREDITS.md'), md);

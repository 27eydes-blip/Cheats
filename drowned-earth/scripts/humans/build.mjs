// Builds the human kit from MakeHuman's CC0 system assets (base mesh hm08,
// targets, default rig + weights, proxies, skins) into public/assets/humans/.
//   MH_DATA=/path/to/makehuman/data node scripts/humans/build.mjs [--no-tex]
// Everything here was released CC0 by the MakeHuman team (Sept 2020); the
// headers in each source file say so and CREDITS.md lists it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { encodeToKTX2 } from 'ktx2-encoder';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MH = process.env.MH_DATA || '/workspace/makehumancommunity/mh-core/data';
const OUT = path.join(ROOT, 'public/assets/humans');
const NO_TEX = process.argv.includes('--no-tex');
fs.mkdirSync(path.join(OUT, 'tex'), { recursive: true });
const rd = (p) => fs.readFileSync(path.join(MH, p), 'utf8');
const log = (...a) => console.log(...a);

// ------------------------------------------------------------------ OBJ
function parseObj(text) {
  const v = [], vt = [], faces = []; // faces: {g, vs:[vi], ts:[ti]}
  let g = 'default';
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) { const p = line.split(/\s+/); v.push(+p[1], +p[2], +p[3]); }
    else if (line.startsWith('vt ')) { const p = line.split(/\s+/); vt.push(+p[1], +p[2]); }
    else if (line.startsWith('g ')) g = line.slice(2).trim();
    else if (line.startsWith('f ')) {
      const p = line.trim().split(/\s+/).slice(1);
      const vs = [], ts = [];
      for (const c of p) { const [a, b] = c.split('/'); vs.push(+a - 1); ts.push(b ? +b - 1 : -1); }
      faces.push({ g, vs, ts });
    }
  }
  return { v, vt, faces };
}
// split (v,vt) pairs into render vertices; quads → triangles
function renderMesh(obj, keepGroup = () => true) {
  const key = new Map(), map = [], uv = [], idx = [];
  const vert = (vi, ti) => {
    const k = vi * 65536 + (ti + 1);
    let r = key.get(k);
    if (r === undefined) { r = map.length; key.set(k, r); map.push(vi); uv.push(ti >= 0 ? obj.vt[ti * 2] : 0, ti >= 0 ? obj.vt[ti * 2 + 1] : 0); }
    return r;
  };
  const faceGroup = [];
  for (const f of obj.faces) {
    if (!keepGroup(f.g)) continue;
    const r = f.vs.map((vi, i) => vert(vi, f.ts[i]));
    for (let i = 1; i + 1 < r.length; i++) { idx.push(r[0], r[i], r[i + 1]); faceGroup.push(f.vs); }
  }
  return { map: Uint16Array.from(map), uv: Float32Array.from(uv), idx: Uint32Array.from(idx), triBase: faceGroup };
}

// ------------------------------------------------------------------ base mesh
const base = parseObj(rd('3dobjs/base.obj'));
const NV = base.v.length / 3;
log('base verts', NV);
const body = renderMesh(base, (g) => g === 'body');
// helper geometry carries the eyeballs/teeth/tongue sockets; proxies are fitted to it
const bodyVertSet = new Set(); for (const f of base.faces) if (f.g === 'body') for (const vi of f.vs) bodyVertSet.add(vi);

// ------------------------------------------------------------------ targets
const bin = []; let binLen = 0;
const push = (typed) => { const buf = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength); const pad = (4 - (binLen % 4)) % 4; if (pad) { bin.push(Buffer.alloc(pad)); binLen += pad; } const off = binLen; bin.push(buf); binLen += buf.length; return off; };
function readTarget(rel) {
  const idx = [], d = [];
  for (const line of rd(rel).split('\n')) {
    if (!line || line[0] === '#') continue;
    const p = line.trim().split(/\s+/);
    if (p.length < 4) continue;
    idx.push(+p[0]); d.push(+p[1], +p[2], +p[3]);
  }
  return { idx, d };
}
const targets = [];
function addTarget(name, rel) {
  const t = readTarget(rel);
  let mx = 1e-9; for (const x of t.d) mx = Math.max(mx, Math.abs(x));
  const scale = mx / 32767;
  const q = Int16Array.from(t.d.map((x) => Math.round(x / scale)));
  targets.push({ name, n: t.idx.length, scale, idx: push(Uint16Array.from(t.idx)), d: push(q) });
}
// macro: universal gender × age × muscle × weight, and race × gender × age
for (const g of ['female', 'male']) for (const a of ['baby', 'child', 'young', 'old']) {
  if (a === 'baby') continue; // nobody under ~8 in this game
  for (const m of ['minmuscle', 'averagemuscle', 'maxmuscle']) for (const w of ['minweight', 'averageweight', 'maxweight'])
    addTarget(`universal-${g}-${a}-${m}-${w}`, `targets/macrodetails/universal-${g}-${a}-${m}-${w}.target`);
  for (const r of ['african', 'asian', 'caucasian']) addTarget(`${r}-${g}-${a}`, `targets/macrodetails/${r}-${g}-${a}.target`);
}
// local face/body detail: every target in these folders becomes a dial
for (const dir of ['nose', 'mouth', 'chin', 'cheek', 'eyes', 'ears', 'forehead', 'eyebrows', 'head', 'neck', 'asym']) {
  for (const f of fs.readdirSync(path.join(MH, 'targets', dir)).filter((x) => x.endsWith('.target')).sort())
    addTarget(`${dir}/${f.replace('.target', '')}`, `targets/${dir}/${f}`);
}
// expression units (FACS-style blendshapes, kept live at runtime)
const EXPR = fs.readdirSync(path.join(MH, 'targets/expression/units/caucasian')).filter((x) => x.endsWith('.target')).sort();
for (const f of EXPR) addTarget(`expr/${f.replace('.target', '')}`, `targets/expression/units/caucasian/${f}`);
log('targets', targets.length);

// ------------------------------------------------------------------ rig
const skel = JSON.parse(rd('rigs/default.mhskel'));
const weights = JSON.parse(rd('rigs/default_weights.mhw')).weights;
const boneNames = Object.keys(skel.bones);
// parents before children
const order = []; const seen = new Set();
const visit = (n) => { if (seen.has(n)) return; const p = skel.bones[n].parent; if (p) visit(p); seen.add(n); order.push(n); };
boneNames.forEach(visit);
const bones = order.map((n) => ({ name: n, parent: skel.bones[n].parent ? order.indexOf(skel.bones[n].parent) : -1, head: skel.joints[skel.bones[n].head], tail: skel.joints[skel.bones[n].tail] }));
// top-4 influences per base vertex
const inf = Array.from({ length: NV }, () => []);
for (const [bn, list] of Object.entries(weights)) { const bi = order.indexOf(bn); if (bi < 0) continue; for (const [vi, w] of list) inf[vi].push([bi, w]); }
const skinIdx = new Uint8Array(NV * 4), skinW = new Uint8Array(NV * 4);
for (let v = 0; v < NV; v++) {
  const l = inf[v].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const s = l.reduce((a, x) => a + x[1], 0) || 1;
  let acc = 0;
  l.forEach(([bi, w], k) => { skinIdx[v * 4 + k] = bi; const q = k === l.length - 1 ? 255 - acc : Math.round((w / s) * 255); skinW[v * 4 + k] = q; acc += q; });
  if (!l.length) { skinIdx[v * 4] = order.indexOf('root'); skinW[v * 4] = 255; }
}

// ------------------------------------------------------------------ thickness (for subsurface scattering)
// Cast a ray inward from each body vertex and measure how far until it exits:
// ears, nostrils and fingers are thin, so backlight glows through them.
function vertexThickness() {
  const P = base.v, tris = [];
  for (let i = 0; i < body.idx.length; i += 3) tris.push([body.map[body.idx[i]], body.map[body.idx[i + 1]], body.map[body.idx[i + 2]]]);
  // vertex normals
  const N = new Float32Array(NV * 3);
  for (const [a, b, c] of tris) {
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { N[k * 3] += nx; N[k * 3 + 1] += ny; N[k * 3 + 2] += nz; }
  }
  // uniform grid over triangles
  const G = 0.25, grid = new Map();
  const cell = (x, y, z) => `${Math.floor(x / G)},${Math.floor(y / G)},${Math.floor(z / G)}`;
  tris.forEach(([a, b, c], ti) => {
    const xs = [P[a * 3], P[b * 3], P[c * 3]], ys = [P[a * 3 + 1], P[b * 3 + 1], P[c * 3 + 1]], zs = [P[a * 3 + 2], P[b * 3 + 2], P[c * 3 + 2]];
    for (let x = Math.floor(Math.min(...xs) / G); x <= Math.floor(Math.max(...xs) / G); x++)
      for (let y = Math.floor(Math.min(...ys) / G); y <= Math.floor(Math.max(...ys) / G); y++)
        for (let z = Math.floor(Math.min(...zs) / G); z <= Math.floor(Math.max(...zs) / G); z++) { const k = `${x},${y},${z}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(ti); }
  });
  const th = new Uint8Array(NV).fill(255);
  const MAXD = 1.2; // dm
  for (const v of bodyVertSet) {
    let nx = -N[v * 3], ny = -N[v * 3 + 1], nz = -N[v * 3 + 2];
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const ox = P[v * 3] + nx * 0.005, oy = P[v * 3 + 1] + ny * 0.005, oz = P[v * 3 + 2] + nz * 0.005;
    let best = MAXD; const tested = new Set();
    for (let s = 0; s <= MAXD; s += G * 0.5) {
      const k = cell(ox + nx * s, oy + ny * s, oz + nz * s);
      for (const ti of grid.get(k) || []) {
        if (tested.has(ti)) continue; tested.add(ti);
        const [a, b, c] = tris[ti]; if (a === v || b === v || c === v) continue;
        // Möller–Trumbore
        const e1x = P[b * 3] - P[a * 3], e1y = P[b * 3 + 1] - P[a * 3 + 1], e1z = P[b * 3 + 2] - P[a * 3 + 2];
        const e2x = P[c * 3] - P[a * 3], e2y = P[c * 3 + 1] - P[a * 3 + 1], e2z = P[c * 3 + 2] - P[a * 3 + 2];
        const px = ny * e2z - nz * e2y, py = nz * e2x - nx * e2z, pz = nx * e2y - ny * e2x;
        const det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-9) continue;
        const inv = 1 / det, tx = ox - P[a * 3], ty = oy - P[a * 3 + 1], tz = oz - P[a * 3 + 2];
        const u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
        const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
        const w = (nx * qx + ny * qy + nz * qz) * inv; if (w < 0 || u + w > 1) continue;
        const t = (e2x * qx + e2y * qy + e2z * qz) * inv; if (t > 0 && t < best) best = t;
      }
      if (best < s) break;
    }
    th[v] = Math.round(Math.min(1, best / MAXD) * 255);
  }
  return th;
}
const thickness = vertexThickness();

// ------------------------------------------------------------------ proxies (.mhclo)
function parseMhclo(rel) {
  const dir = path.dirname(rel);
  const lines = rd(rel).split('\n');
  const p = { refs: [], w: [], off: [], scale: {}, del: [], obj: null, mat: null, name: path.basename(rel, '.mhclo') };
  let mode = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    const t = line.split(/\s+/);
    if (t[0] === 'verts') { mode = 'verts'; continue; }
    if (t[0] === 'delete_verts') { mode = 'del'; continue; }
    if (mode === 'verts' && /^[\d.\-]/.test(t[0]) && (t.length === 1 || t.length === 9)) {
      if (t.length === 1) { p.refs.push(+t[0], +t[0], +t[0]); p.w.push(1, 0, 0); p.off.push(0, 0, 0); }
      else { p.refs.push(+t[0], +t[1], +t[2]); p.w.push(+t[3], +t[4], +t[5]); p.off.push(+t[6], +t[7], +t[8]); }
      continue;
    }
    if (mode === 'del' && /^\d/.test(t[0])) {
      for (let i = 0; i < t.length; i++) { if (t[i + 1] === '-') { for (let k = +t[i]; k <= +t[i + 2]; k++) p.del.push(k); i += 2; } else p.del.push(+t[i]); }
      continue;
    }
    if (/^[a-z_]+$/i.test(t[0]) && !['material', 'obj_file'].includes(t[0]) && !/^[xyz]_scale$/.test(t[0]) && mode === 'del') mode = null;
    if (t[0] === 'obj_file') p.obj = path.join(dir, t[1]);
    if (t[0] === 'material') p.mat = path.join(dir, t[1]);
    if (/^[xyz]_scale$/.test(t[0])) p.scale[t[0][0]] = [+t[1], +t[2], +t[3]];
  }
  return p;
}
function readMat(rel) {
  const m = {};
  if (!rel || !fs.existsSync(path.join(MH, rel))) return m;
  const dir = path.dirname(rel);
  for (const raw of rd(rel).split('\n')) {
    const t = raw.trim().split(/\s+/);
    if (/^(diffuseTexture|normalmapTexture|aomapTexture|specularmapTexture|transparencymapTexture|bumpmapTexture)$/.test(t[0])) m[t[0].replace('Texture', '')] = path.join(dir, t[1]);
    if (t[0] === 'diffuseColor') m.color = [+t[1], +t[2], +t[3]];
    if (t[0] === 'transparent') m.transparent = t[1] === 'True';
  }
  return m;
}
const textureJobs = [];
const texOut = (key) => `tex/${key}`;
function queueTex(src, key, sizes, kind) { textureJobs.push({ src, key, sizes, kind }); return texOut(key); }

const PROXIES = {
  eyes: 'eyes/high-poly/high-poly.mhclo', eyesLow: 'eyes/low-poly/low-poly.mhclo',
  teeth: 'teeth/teeth_base/teeth_base.mhclo', tongue: 'tongue/tongue01/tongue01.mhclo',
  lod: 'proxymeshes/proxy741/proxy741.proxy',
};
for (let i = 1; i <= 12; i++) PROXIES[`brow${i}`] = `eyebrows/eyebrow${String(i).padStart(3, '0')}/eyebrow${String(i).padStart(3, '0')}.mhclo`;
for (let i = 1; i <= 4; i++) PROXIES[`lash${i}`] = `eyelashes/eyelashes0${i}/eyelashes0${i}.mhclo`;
for (const h of ['afro01', 'bob01', 'bob02', 'braid01', 'long01', 'ponytail01', 'short01', 'short02', 'short03', 'short04']) PROXIES[`hair:${h}`] = `hair/${h}/${h}.mhclo`;
for (const c of ['male_casualsuit01', 'male_casualsuit02', 'male_casualsuit03', 'male_casualsuit04', 'male_casualsuit05', 'male_casualsuit06', 'male_worksuit01', 'female_casualsuit01', 'female_casualsuit02', 'female_sportsuit01', 'shoes01', 'shoes02', 'shoes03', 'shoes05', 'shoes06', 'fedora01'])
  PROXIES[`cloth:${c}`] = `clothes/${c}/${c}.mhclo`;

const proxies = {};
for (const [key, rel] of Object.entries(PROXIES)) {
  if (!fs.existsSync(path.join(MH, rel))) { log('missing proxy', rel); continue; }
  const p = parseMhclo(rel);
  const obj = parseObj(rd(p.obj));
  const rm = renderMesh(obj);
  const mat = readMat(p.mat);
  const safe = key.replace(/[:/]/g, '_');
  const kind = key.split(':')[0];
  const texSize = kind === 'cloth' ? [1024] : kind === 'hair' ? [1024] : key.startsWith('brow') || key.startsWith('lash') ? [512] : key.startsWith('eyes') ? [512] : [512];
  const tex = {};
  if (mat.diffuse && fs.existsSync(path.join(MH, mat.diffuse))) tex.map = queueTex(mat.diffuse, `${safe}.albedo`, texSize, 'srgb');
  if (mat.normalmap && fs.existsSync(path.join(MH, mat.normalmap))) tex.normalMap = queueTex(mat.normalmap, `${safe}.normal`, [512], 'normal');
  if (mat.aomap && fs.existsSync(path.join(MH, mat.aomap))) tex.aoMap = queueTex(mat.aomap, `${safe}.ao`, [512], 'linear');
  proxies[key] = {
    nv: p.refs.length / 3, scale: p.scale,
    refs: push(Uint16Array.from(p.refs)), w: push(Float32Array.from(p.w)), off: push(Float32Array.from(p.off)),
    map: push(rm.map), nr: rm.map.length, uv: push(rm.uv), idx: push(rm.idx), ni: rm.idx.length,
    del: p.del.length ? push(Uint16Array.from(p.del)) : -1, ndel: p.del.length,
    tex, color: mat.color, transparent: !!mat.transparent || !!(tex.map && (kind === 'hair' || key.startsWith('brow') || key.startsWith('lash'))),
  };
}
log('proxies', Object.keys(proxies).length);

// ------------------------------------------------------------------ skins + eye colours
const skins = [];
for (const d of fs.readdirSync(path.join(MH, 'skins')).sort()) {
  const m = /^(young|middleage|old)_(african|asian|caucasian)_(male|female)$/.exec(d);
  if (!m) continue;
  const mat = readMat(`skins/${d}/${d}.mhmat`);
  if (!mat.diffuse) continue;
  skins.push({ name: d, age: m[1], race: m[2], sex: m[3], tex: queueTex(mat.diffuse, `skin_${d}`, [1024, 2048], 'srgb') });
}
const eyes = [];
for (const f of fs.readdirSync(path.join(MH, 'eyes/materials')).filter((x) => x.endsWith('.png')).sort())
  eyes.push({ name: f.replace('_eye.png', ''), tex: queueTex(`eyes/materials/${f}`, `iris_${f.replace('.png', '')}`, [512], 'srgb') });

// ------------------------------------------------------------------ write
const P = Float32Array.from(base.v);
const kit = {
  version: 1, units: 'decimetres (×0.1 → metres)', nv: NV,
  base: { pos: push(P), map: push(body.map), nr: body.map.length, uv: push(body.uv), idx: push(body.idx), ni: body.idx.length, skinIdx: push(skinIdx), skinW: push(skinW), thickness: push(thickness) },
  bones: bones.map((b) => ({ name: b.name, parent: b.parent, head: b.head, tail: b.tail })),
  targets: targets.map(({ name, n, scale, idx, d }) => ({ name, n, scale, idx, d })),
  proxies, skins, eyes,
};
fs.writeFileSync(path.join(OUT, 'kit.bin'), Buffer.concat(bin));
fs.writeFileSync(path.join(OUT, 'kit.json'), JSON.stringify(kit));
log('kit.bin', (binLen / 1e6).toFixed(2), 'MB');

// ------------------------------------------------------------------ textures
const decode = async (b) => { const { data, info } = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { width: info.width, height: info.height, data: new Uint8Array(data) }; };
async function ktx(src, size, kind) {
  const png = await sharp(path.join(MH, src)).resize(size, size, { fit: 'fill' }).png().toBuffer();
  const o = { isKTX2File: true, generateMipmap: true, imageDecoder: decode };
  if (kind === 'normal') Object.assign(o, { isUASTC: false, isNormalMap: true, isPerceptual: false, qualityLevel: 255 });
  else Object.assign(o, { isUASTC: false, qualityLevel: kind === 'srgb' ? 190 : 110, isPerceptual: kind === 'srgb' });
  return Buffer.from(await encodeToKTX2(new Uint8Array(png), o));
}
if (!NO_TEX) {
  let bytes = 0;
  for (const j of textureJobs) {
    for (const s of j.sizes) {
      const file = path.join(OUT, `tex/${j.key}.${s}.ktx2`);
      if (fs.existsSync(file)) { bytes += fs.statSync(file).size; continue; }
      const buf = await ktx(j.src, s, j.kind);
      fs.writeFileSync(file, buf); bytes += buf.length;
    }
  }
  log('textures', textureJobs.length, (bytes / 1e6).toFixed(1), 'MB');
}

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { prepGeometry, boxGeometry } from './Builder.js';
import { mat } from './Materials.js';
import { LAYER_DETAIL } from '../render/Pipeline.js';
import { patchMaterial } from './WorldShader.js';

// ---- scanned stand-ins -------------------------------------------------
// When the asset library has loaded the Poly Haven models, procedural props
// are swapped for photoscans at real-world scale. `base` is where the
// procedural prop's bottom sits relative to its origin; `lie` lays the model
// on its side (floating barrels, chairs); `keys` are interchangeable scans
// picked per instance. Anything not listed keeps its procedural geometry.
let ASSETS = null, INSTANCER = null;
export function setPropAssets(a, instancer) { ASSETS = a; INSTANCER = instancer; }
let chunkSeq = 0;
const SCAN = {
  barrel:      { keys: ['barrel', 'barrelRust', 'barrelRust'], base: -0.45 },
  barrelFloat: { keys: ['barrel', 'barrelRust'], lie: true, base: -0.28 },
  crate:       { keys: ['crate', 'crate2', 'plasticCrate'], base: 0 },
  tire:        { keys: ['tyre'], lie: false, flat: true, base: -0.12 },
  chairFloat:  { keys: ['chair'], lie: true, base: -0.2 },
  bottle:      { keys: ['gallon', 'jerrycanPlastic', 'trashbag', 'cardboard'], base: -0.1, lieSome: true },
  acUnit:      { keys: ['acUnit'], base: 0 },
  car:         { keys: ['coveredCar'], base: 0, ry: Math.PI / 2 },
  lantern:     { keys: ['lantern', 'lanternWood'], base: -0.32 },

  lampPost:    { keys: ['streetLamp'], base: 0, scale: 1.6 },
  foliage:     { keys: ['shrub', 'shrub2'], base: -0.75, scale: 0.75, useS: true },
  // new dressing types (no procedural twin)
  lifebuoy:    { keys: ['lifebuoy'], lie: false, flat: true, base: 0 },
  buoy:        { keys: ['buoy'], base: -0.6 },
  seaMarker:   { keys: ['seaMarker'], base: -1.2 },
  lifeJacket:  { keys: ['lifeJacket'], flat: true, base: 0 },
  jerrycan:    { keys: ['jerrycan', 'jerrycanPlastic'], base: 0 },
  propane:     { keys: ['propane'], base: 0 },
  bucket:      { keys: ['bucket', 'basket'], base: 0 },
  trash:       { keys: ['trashbag', 'cardboard', 'can', 'gallon'], base: 0 },
  fern:        { keys: ['fern'], base: 0 },
  roots:       { keys: ['roots'], base: 0 },
  deadTrunk:   { keys: ['deadTrunk'], base: 0 },
  rocks:       { keys: ['rocks'], base: 0 },
  boulder:     { keys: ['boulder'], base: 0 },
  hydrant:     { keys: ['hydrant'], base: 0 },
  utilityBox:  { keys: ['utilityBox'], base: 0 },
  barrier:     { keys: ['barrier'], base: 0 },
  wheelRim:    { keys: ['wheelRim'], flat: true, base: 0 },
  trashCan:    { keys: ['trashCan'], base: 0 },
  barrelStove: { keys: ['barrelStove'], base: 0 },
  generator:   { keys: ['generator'], base: 0 },
  shelves:     { keys: ['shelves'], base: 0 },
  wheelchair:  { keys: ['wheelchair'], base: 0 },
  medicalBox:  { keys: ['medicalBox'], base: 0 },
  stool:       { keys: ['stool', 'chair'], base: 0 },
  rowboat:     { keys: ['rowboat'], base: -0.35 },
  ladder:      { keys: ['ladder'], base: 0 },
  hangingLamp: { keys: ['hangingLamp'], base: 0 },
  searchlight: { keys: ['searchlight'], base: 0 },
  oilLamp:     { keys: ['oilLamp'], base: 0 },
};
export const scanKinds = Object.keys(SCAN);
const normCache = new Map();
// model parts with a matrix that puts the model's footprint centre at x=z=0 and
// its lowest point at y=0 (optionally laid on its side)
function normalizedParts(key, lie, flat) {
  const ck = key + (lie ? 'L' : '') + (flat ? 'F' : '');
  if (normCache.has(ck)) return normCache.get(ck);
  const parts = ASSETS.parts(key), b = ASSETS.bounds(key);
  if (!parts || !b) return null;
  const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  const pre = new THREE.Matrix4();
  if (lie) {
    // rotate about the centre so the long axis lies along x, then rest on the ground
    const r = new THREE.Matrix4().makeRotationZ(Math.PI / 2);
    pre.makeTranslation(0, (b.max[0] - b.min[0]) / 2, 0).multiply(r).multiply(new THREE.Matrix4().makeTranslation(-cx, -cy, -cz));
  } else if (flat) {
    // the ring lies flat (tyre, lifebuoy): if it was modelled standing, tip it over
    const tall = (b.max[1] - b.min[1]) > Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]) * 0.8;
    if (tall) {
      const r = new THREE.Matrix4().makeRotationX(Math.PI / 2);
      pre.makeTranslation(0, (b.max[2] - b.min[2]) / 2, 0).multiply(r).multiply(new THREE.Matrix4().makeTranslation(-cx, -cy, -cz));
    } else pre.makeTranslation(-cx, -b.min[1], -cz);
  } else pre.makeTranslation(-cx, -b.min[1], -cz);
  const out = parts.map((pt) => ({ geometry: pt.geometry, material: pt.material, matrix: pre.clone().multiply(pt.matrix), lod: pt.lod }));
  out.size = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) * 0.5;
  normCache.set(ck, out);
  return out;
}
const bobMats = new Map();
function bobMaterial(m) {
  if (!bobMats.has(m)) { const c = m.clone(); patchMaterial(c, { bob: true, prop: true }); bobMats.set(m, c); }
  return bobMats.get(m);
}
const hash3 = (x, y, z) => { const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return h - Math.floor(h); };

// Reusable prop geometry (built once, shared by every instance in every chunk).
const cache = new Map();
const part = (g, color, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) => {
  g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z);
  return prepGeometry(g, color);
};
const merge = (parts) => { const g = mergeGeometries(parts, false); g.computeBoundingSphere(); return g; };
const box = (sx, sy, sz) => boxGeometry(sx, sy, sz);

const defs = {
  car: () => merge([
    part(box(1.8, 0.7, 4.3), [1, 1, 1], { y: 0.55 }),
    part(box(1.6, 0.6, 2.2), [0.75, 0.78, 0.8], { y: 1.15, z: -0.2 }),
    ...[[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]].map(([x, z]) => part(new THREE.CylinderGeometry(0.33, 0.33, 0.25, 10), [0.08, 0.08, 0.08], { x, y: 0.33, z, rz: Math.PI / 2 })),
  ]),
  barrel: () => merge([part(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12), [1, 1, 1]), part(new THREE.TorusGeometry(0.3, 0.025, 4, 12), [0.6, 0.6, 0.6], { y: 0.25, rx: Math.PI / 2 }), part(new THREE.TorusGeometry(0.3, 0.025, 4, 12), [0.6, 0.6, 0.6], { y: -0.25, rx: Math.PI / 2 })]),
  barrelFloat: () => part(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10), [1, 1, 1], { rz: Math.PI / 2 }),
  plank: () => part(box(0.25, 0.06, 2.4), [1, 1, 1], { y: 0.02 }),
  pallet: () => merge([...[-0.5, 0, 0.5].map((x) => part(box(0.12, 0.04, 1.2), [1, 1, 1], { x, y: 0.06 })), ...[-0.4, 0.4].map((z) => part(box(1.2, 0.06, 0.1), [0.85, 0.85, 0.85], { z, y: 0.01 }))]),
  crate: () => part(box(0.9, 0.7, 0.9), [1, 1, 1], { y: 0.35 }),
  chairFloat: () => merge([part(box(0.5, 0.06, 0.5), [1, 1, 1]), part(box(0.5, 0.5, 0.06), [1, 1, 1], { y: 0.0, z: 0.25, rx: 1.3 }), ...[[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].map(([x, z]) => part(box(0.04, 0.45, 0.04), [0.9, 0.9, 0.9], { x, z, y: 0.2, rx: Math.PI / 2.2 }))]),
  mattress: () => part(box(1.4, 0.22, 2.0), [1, 1, 1], { y: 0.03 }),
  bottle: () => part(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), [1, 1, 1], { rz: Math.PI / 2 }),
  tire: () => part(new THREE.TorusGeometry(0.32, 0.12, 6, 12), [0.1, 0.1, 0.1], { rx: Math.PI / 2 }),
  lampPost: () => merge([
    part(new THREE.CylinderGeometry(0.09, 0.14, 10, 6), [0.35, 0.37, 0.36], { y: 5 }),
    part(box(0.12, 0.12, 1.6), [0.35, 0.37, 0.36], { y: 9.9, z: 0.7 }),
    part(box(0.35, 0.18, 0.7), [0.3, 0.3, 0.3], { y: 9.8, z: 1.4 }),
  ]),
  trafficLight: () => merge([
    part(new THREE.CylinderGeometry(0.1, 0.12, 8, 6), [0.25, 0.26, 0.25], { y: 4 }),
    part(box(0.1, 0.1, 4), [0.25, 0.26, 0.25], { y: 7.8, z: 2 }),
    part(box(0.35, 1.0, 0.35), [0.12, 0.13, 0.1], { y: 7.2, z: 3.6 }),
  ]),
  signPost: () => part(new THREE.CylinderGeometry(0.05, 0.05, 9, 5), [0.45, 0.45, 0.43], { y: 4.5 }),
  waterTank: () => merge([
    part(new THREE.CylinderGeometry(1.6, 1.6, 3, 12), [0.55, 0.45, 0.35], { y: 3.5 }),
    part(new THREE.ConeGeometry(1.75, 0.9, 12), [0.45, 0.38, 0.3], { y: 5.4 }),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => part(box(0.15, 2, 0.15), [0.3, 0.3, 0.3], { x, z, y: 1 })),
  ]),
  acUnit: () => merge([part(box(1.2, 0.9, 0.9), [0.7, 0.72, 0.7], { y: 0.45 }), part(new THREE.CylinderGeometry(0.35, 0.35, 0.05, 10), [0.2, 0.2, 0.2], { y: 0.92 })]),
  antenna: () => merge([part(new THREE.CylinderGeometry(0.04, 0.06, 7, 4), [0.4, 0.4, 0.4], { y: 3.5 }), part(box(1.2, 0.04, 0.04), [0.4, 0.4, 0.4], { y: 5.5 }), part(box(0.8, 0.04, 0.04), [0.4, 0.4, 0.4], { y: 6.3 })]),
  trunk: () => part(new THREE.CylinderGeometry(0.14, 0.3, 1, 6), [0.32, 0.26, 0.2], { y: 0.5 }),
  branch: () => part(new THREE.CylinderGeometry(0.02, 0.07, 1, 4), [0.3, 0.25, 0.2], { y: 0.5 }),
  // lumpy canopy: several displaced blobs, darker and cooler underneath (baked AO)
  foliage: () => {
    const parts = [];
    const blobs = [[0, 0, 0, 0.75], [0.55, 0.15, 0.2, 0.55], [-0.5, 0.1, -0.25, 0.6], [0.1, 0.35, -0.5, 0.5], [-0.2, 0.3, 0.5, 0.5], [0.3, -0.2, -0.3, 0.45]];
    let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const [x, y, z, r] of blobs) {
      const g = new THREE.IcosahedronGeometry(r, 1);
      const p = g.attributes.position;
      const col = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
        const n = 0.82 + 0.3 * Math.sin(vx * 9.1 + vz * 7.3) * Math.cos(vy * 8.7 + vx * 3.1) + rnd() * 0.12;
        p.setXYZ(i, vx * n + x, vy * n * 0.8 + y, vz * n + z);
        const ao = 0.45 + 0.55 * Math.min(1, Math.max(0, (vy / r) * 0.5 + 0.5 + y * 0.6));
        col.set([ao * 0.9, ao, ao * 0.85], i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      parts.push(prepGeometry(g));
    }
    return merge(parts);
  },
  nest: () => { const g = new THREE.TorusGeometry(0.3, 0.12, 5, 8); return part(g, [0.45, 0.38, 0.25], { rx: Math.PI / 2 }); },
  rubble: () => { const g = new THREE.DodecahedronGeometry(1, 0); return part(g, [0.7, 0.7, 0.68]); },
  busShelter: () => merge([
    part(box(4, 0.12, 1.8), [0.5, 0.52, 0.5], { y: 2.6 }),
    ...[-1.9, 1.9].map((x) => part(box(0.08, 2.6, 0.08), [0.5, 0.5, 0.5], { x, y: 1.3, z: 0.8 })),
    part(box(3.8, 1.8, 0.04), [0.55, 0.6, 0.62], { y: 1.5, z: -0.85 }),
  ]),
  railing: () => merge([part(box(0.05, 1, 0.05), [1, 1, 1], { y: 0.5 }), part(box(0.05, 0.05, 2), [1, 1, 1], { y: 1, z: 1 })]),
  lantern: () => merge([part(box(0.22, 0.3, 0.22), [0.2, 0.18, 0.14], { y: -0.15 }), part(new THREE.ConeGeometry(0.2, 0.12, 4), [0.2, 0.18, 0.14], { y: 0.05, ry: Math.PI / 4 })]),
  growth: () => merge([0, 1, 2, 3].map((i) => { const g = new THREE.SphereGeometry(0.22 - i * 0.035, 14, 10); g.scale(1, 1.5 + i * 0.2, 1); return part(g, [1, 1, 1], { x: [0, 0.22, -0.18, 0.05][i], y: [0, -0.08, -0.1, 0.25][i], z: [0, 0.1, -0.12, 0.18][i] }); })),
};

export function propGeometry(name) {
  if (!cache.has(name)) {
    const f = defs[name];
    if (!f) throw new Error('unknown prop ' + name);
    cache.set(name, f());
  }
  return cache.get(name);
}

const CASTERS = new Set(['waterTank', 'acUnit', 'trunk', 'foliage', 'busShelter']);

// Batch of instances of one prop type → InstancedMesh (local to `origin`).
export class InstanceBatch {
  constructor() { this.map = new Map(); }
  add(prop, matKey, x, y, z, { ry = 0, rx = 0, rz = 0, s = 1, sx, sy, sz, color } = {}) {
    const k = prop + '|' + matKey;
    if (!this.map.has(k)) this.map.set(k, { prop, matKey, list: [] });
    this.map.get(k).list.push({ x, y, z, rx, ry, rz, sx: sx ?? s, sy: sy ?? s, sz: sz ?? s, color });
  }
  // dynamic: the batch rides a moving parent (rafts), so scanned props get
  // their own local InstancedMeshes instead of joining the world instancer
  build(origin, { shadows = false, dynamic = false } = {}) {
    const out = [];
    if (ASSETS && INSTANCER) this.buildScanned(origin, shadows, out, dynamic);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
    for (const { prop, matKey, list } of this.map.values()) {
      if (!list.length || !defs[prop]) continue;
      const im = new THREE.InstancedMesh(propGeometry(prop), mat(matKey), list.length);
      list.forEach((it, i) => {
        e.set(it.rx, it.ry, it.rz);
        m.compose(p.set(it.x - origin.x, it.y - origin.y, it.z - origin.z), q.setFromEuler(e), sc.set(it.sx, it.sy, it.sz));
        im.setMatrixAt(i, m);
        if (it.color) im.setColorAt(i, c.setRGB(...it.color));
      });
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = shadows && CASTERS.has(prop); im.receiveShadow = shadows;
      im.name = 'inst:' + prop;
      if (!CASTERS.has(prop)) im.layers.set(LAYER_DETAIL);
      out.push(im);
    }
    return out;
  }
  // pull every instance that has a scanned stand-in out of the procedural lists
  buildScanned(origin, shadows, out, dynamic) {
    const groups = new Map(); // `${key}|${lie}|${bob}` → {key, lie, flat, bob, items}
    for (const entry of this.map.values()) {
      const sc = SCAN[entry.prop];
      if (!sc || (dynamic && entry.prop === 'foliage')) continue;
      const keep = [];
      for (const it of entry.list) {
        const h = hash3(it.x, it.y, it.z);
        const key = sc.keys[Math.floor(h * sc.keys.length) % sc.keys.length];
        if (!ASSETS.has(key)) { keep.push(it); continue; }
        const lie = !!sc.lie || (sc.lieSome && h > 0.5);
        const bob = /Float$/.test(entry.matKey);
        const gk = `${key}|${lie}|${bob}`;
        if (!groups.has(gk)) groups.set(gk, { key, lie, flat: !!sc.flat, bob, sc, items: [] });
        groups.get(gk).items.push(it);
      }
      entry.list = keep;
    }
    const q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc3 = new THREE.Vector3();
    const chunkKey = 'c' + (++chunkSeq);
    let any = false;
    for (const g of groups.values()) {
      const parts = normalizedParts(g.key, g.lie, g.flat);
      if (!parts) continue;
      const k = g.sc.scale ?? 1;
      const gk = `${g.key}|${g.lie ? 'L' : ''}${g.flat ? 'F' : ''}|${g.bob ? 'B' : ''}`;
      if (dynamic) {
        // rides a moving parent: a THREE.LOD per group (full mesh near, LOD1 beyond, nothing far)
        const lod = new THREE.LOD();
        const levels = [new THREE.Group(), new THREE.Group()];
        for (const part of parts) {
          const im = new THREE.InstancedMesh(part.geometry, g.bob ? bobMaterial(part.material) : part.material, g.items.length);
          g.items.forEach((it, i) => {
            e.set(it.rx * 0.3, it.ry + (g.sc.ry || 0), it.rz * 0.3);
            const ss = g.sc.useS ? it.sx * k : k;
            const m4 = new THREE.Matrix4().compose(p.set(it.x - origin.x, it.y - origin.y + (g.sc.base || 0) * ss, it.z - origin.z), q.setFromEuler(e), sc3.set(ss, ss, ss)).multiply(part.matrix);
            im.setMatrixAt(i, m4);
          });
          im.computeBoundingSphere();
          im.castShadow = shadows && !part.lod; im.receiveShadow = true; im.name = 'scan:' + g.key + (part.lod ? ':lod1' : '');
          if (parts.size < 1.5) im.layers.set(LAYER_DETAIL);
          levels[part.lod ? 1 : 0].add(im);
        }
        lod.addLevel(levels[0], 0);
        lod.addLevel(levels[1], 14 + parts.size * 8);
        lod.addLevel(new THREE.Object3D(), 60 + parts.size * 40);
        out.push(lod);
        continue;
      }
      INSTANCER.group(gk, g.bob ? parts.map((pt) => ({ ...pt, material: bobMaterial(pt.material) })) : parts, parts.size * k, shadows);
      // world-space matrices (the instancer lives at the scene root)
      const mats = g.items.map((it) => {
        const s = g.sc.useS ? it.sx * k : (Math.abs(it.sx - it.sy) < 1e-3 && Math.abs(it.sx - it.sz) < 1e-3 ? Math.min(1.25, Math.max(0.8, it.sx)) : 1) * k;
        e.set(g.lie ? 0 : it.rx * 0.3, it.ry + (g.sc.ry || 0), g.lie ? 0 : it.rz * 0.3);
        return new THREE.Matrix4().compose(p.set(it.x, it.y + (g.sc.base || 0) * (g.sc.useS ? s : 1), it.z), q.setFromEuler(e), sc3.set(s, s, s));
      });
      INSTANCER.add(gk, chunkKey, mats);
      any = true;
    }
    if (any) {
      // handle: when the chunk is disposed, its instances leave the instancer
      const h = new THREE.Object3D();
      h.name = 'scan-handle';
      h.userData.scanChunk = chunkKey;
      h.userData.release = () => INSTANCER.remove(chunkKey);
      out.push(h);
    }
  }
}

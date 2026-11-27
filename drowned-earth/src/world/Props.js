import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { prepGeometry, boxGeometry } from './Builder.js';
import { mat } from './Materials.js';
import { LAYER_DETAIL } from '../render/Pipeline.js';

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
  foliage: () => { const g = new THREE.IcosahedronGeometry(1, 1); g.scale(1, 0.7, 1); return part(g, [1, 1, 1]); },
  nest: () => { const g = new THREE.TorusGeometry(0.3, 0.12, 5, 8); return part(g, [0.45, 0.38, 0.25], { rx: Math.PI / 2 }); },
  rubble: () => { const g = new THREE.DodecahedronGeometry(1, 0); return part(g, [0.7, 0.7, 0.68]); },
  busShelter: () => merge([
    part(box(4, 0.12, 1.8), [0.5, 0.52, 0.5], { y: 2.6 }),
    ...[-1.9, 1.9].map((x) => part(box(0.08, 2.6, 0.08), [0.5, 0.5, 0.5], { x, y: 1.3, z: 0.8 })),
    part(box(3.8, 1.8, 0.04), [0.55, 0.6, 0.62], { y: 1.5, z: -0.85 }),
  ]),
  railing: () => merge([part(box(0.05, 1, 0.05), [1, 1, 1], { y: 0.5 }), part(box(0.05, 0.05, 2), [1, 1, 1], { y: 1, z: 1 })]),
  lantern: () => merge([part(box(0.22, 0.3, 0.22), [0.2, 0.18, 0.14], { y: -0.15 }), part(new THREE.ConeGeometry(0.2, 0.12, 4), [0.2, 0.18, 0.14], { y: 0.05, ry: Math.PI / 4 })]),
  growth: () => merge([0, 1, 2, 3].map((i) => { const g = new THREE.SphereGeometry(0.22 - i * 0.035, 10, 8); g.scale(1, 1.5 + i * 0.2, 1); return part(g, [1, 1, 1], { x: [0, 0.22, -0.18, 0.05][i], y: [0, -0.08, -0.1, 0.25][i], z: [0, 0.1, -0.12, 0.18][i] }); })),
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
  build(origin, { shadows = false } = {}) {
    const out = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
    for (const { prop, matKey, list } of this.map.values()) {
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
}

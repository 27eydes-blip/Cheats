import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mat } from './Materials.js';

// Accumulates geometry per material, plus colliders and interactables, then
// merges everything into one mesh per material. Every chunk and landmark is
// built with this, which keeps draw calls low regardless of world size.
const FACES = {
  px: [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]], 'z', -1],
  nx: [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]], 'z', 1],
  py: [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]], 'x', 1],
  ny: [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]], 'x', 1],
  pz: [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], 'x', 1],
  nz: [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]], 'x', -1],
};

// Box with UVs in meters: u runs along the face, v = absolute world height on
// side faces, so windows line up with floors.
export function boxGeometry(sx, sy, sz, { faces = null, worldY = 0, worldX = 0, worldZ = 0 } = {}) {
  const pos = [], nor = [], uv = [], idx = [];
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  let vi = 0;
  for (const [name, [n, corners]] of Object.entries(FACES)) {
    if (faces && !faces.includes(name)) continue;
    for (const c of corners) {
      const x = c[0] * hx, y = c[1] * hy, z = c[2] * hz;
      pos.push(x, y, z); nor.push(...n);
      if (name === 'py' || name === 'ny') uv.push(x + worldX, z + worldZ);
      else if (name === 'px' || name === 'nx') uv.push((name === 'px' ? -z : z) + hz + worldZ, y + worldY);
      else uv.push((name === 'pz' ? x : -x) + hx + worldX, y + worldY);
    }
    idx.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
    vi += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function prepGeometry(g, color = [1, 1, 1], meta = [0, 0, 0, 0]) {
  if (!g.index) {
    const n = g.attributes.position.count;
    const ix = new (n > 65535 ? Uint32Array : Uint16Array)(n);
    for (let i = 0; i < n; i++) ix[i] = i;
    g.setIndex(new THREE.BufferAttribute(ix, 1));
  }
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', 'aMeta'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.color) {
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = color[0]; c[i * 3 + 1] = color[1]; c[i * 3 + 2] = color[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  if (!g.attributes.aMeta) {
    const m = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) m.set(meta, i * 4);
    g.setAttribute('aMeta', new THREE.BufferAttribute(m, 4));
  }
  return g;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

export class Builder {
  constructor(origin = new THREE.Vector3(), { shadows = true } = {}) {
    this.origin = origin.clone();
    this.parts = new Map();
    this.colliders = [];      // [minX,minY,minZ,maxX,maxY,maxZ,tag] world space
    this.interactables = [];
    this.objects = [];        // extra Object3Ds (lights, instanced meshes), local to origin
    this.shadows = shadows;
  }
  _add(key, g) { if (!this.parts.has(key)) this.parts.set(key, []); this.parts.get(key).push(g); }

  // world-space axis-aligned box
  box(x0, y0, z0, x1, y1, z1, key, o = {}) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (y1 < y0) [y0, y1] = [y1, y0];
    if (z1 < z0) [z0, z1] = [z1, z0];
    const sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
    if (sx <= 0 || sy <= 0 || sz <= 0) return this;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    if (o.visible !== false) {
      const g = boxGeometry(sx, sy, sz, { faces: o.faces, worldY: cy, worldX: o.uvWorld ? cx : 0, worldZ: o.uvWorld ? cz : 0 });
      g.translate(cx - this.origin.x, cy - this.origin.y, cz - this.origin.z);
      this._add(key, prepGeometry(g, o.color, o.meta));
    }
    if (o.collide !== false) this.colliders.push([x0, y0, z0, x1, y1, z1, o.tag || 'solid']);
    return this;
  }
  // rotated box (around Y and optionally X/Z tilt). Collider = AABB of the rotated box unless collide:false.
  boxR(cx, cy, cz, sx, sy, sz, ry, key, o = {}) {
    const g = boxGeometry(sx, sy, sz, { faces: o.faces, worldY: cy });
    _e.set(o.rx || 0, ry, o.rz || 0);
    _m.compose(_p.set(cx - this.origin.x, cy - this.origin.y, cz - this.origin.z), _q.setFromEuler(_e), _s.set(1, 1, 1));
    g.applyMatrix4(_m);
    this._add(key, prepGeometry(g, o.color, o.meta));
    if (o.collide) {
      g.computeBoundingBox();
      const bb = g.boundingBox;
      this.colliders.push([bb.min.x + this.origin.x, bb.min.y + this.origin.y, bb.min.z + this.origin.z, bb.max.x + this.origin.x, bb.max.y + this.origin.y, bb.max.z + this.origin.z, o.tag || 'solid']);
    }
    return this;
  }
  // arbitrary geometry placed at world position with rotation/scale
  geom(geometry, key, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, color, meta } = {}) {
    const g = geometry.clone();
    _e.set(rx, ry, rz);
    _m.compose(_p.set(x - this.origin.x, y - this.origin.y, z - this.origin.z), _q.setFromEuler(_e), _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    this._add(key, prepGeometry(g, color, meta));
    return this;
  }
  collider(x0, y0, z0, x1, y1, z1, tag = 'solid') { this.colliders.push([Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1), tag]); return this; }

  // Wall along X or Z with rectangular openings (doors/windows). axis 'x' => wall spans x0..x1 at z, thickness t.
  wall(axis, a0, a1, fixed, y0, y1, t, key, openings = [], o = {}) {
    const segs = [];
    let cur = a0;
    const ops = [...openings].sort((p, q) => p.at - q.at);
    for (const op of ops) {
      const s = op.at - op.w / 2, e = op.at + op.w / 2;
      if (s > cur) segs.push([cur, s, y0, y1]);
      const ob = y0 + (op.bottom || 0), ot = Math.min(y1, ob + op.h);
      if (op.bottom > 0) segs.push([s, e, y0, ob]);
      if (ot < y1) segs.push([s, e, ot, y1]);
      cur = e;
    }
    if (cur < a1) segs.push([cur, a1, y0, y1]);
    for (const [s, e, b, tp] of segs) {
      if (axis === 'x') this.box(s, b, fixed - t / 2, e, tp, fixed + t / 2, key, o);
      else this.box(fixed - t / 2, b, s, fixed + t / 2, tp, e, key, o);
    }
    return this;
  }
  // stairs rising along +dir from (x,y,z) ; dir: 'x+','x-','z+','z-'
  stairs(x, y, z, width, rise, run, dir, key, o = {}) {
    const steps = Math.max(1, Math.round(rise / 0.25));
    const sh = rise / steps, sd = run / steps;
    for (let i = 0; i < steps; i++) {
      const top = y + sh * (i + 1);
      const a = sd * i, b = sd * (i + 1);
      const w = width / 2;
      if (dir === 'x+') this.box(x + a, top - sh, z - w, x + b, top, z + w, key, o);
      if (dir === 'x-') this.box(x - b, top - sh, z - w, x - a, top, z + w, key, o);
      if (dir === 'z+') this.box(x - w, top - sh, z + a, x + w, top, z + b, key, o);
      if (dir === 'z-') this.box(x - w, top - sh, z - b, x + w, top, z - a, key, o);
    }
    return this;
  }
  interact(def) { this.interactables.push(def); return this; }
  object(obj) { this.objects.push(obj); return this; }

  build(name = 'built') {
    const group = new THREE.Group();
    group.name = name;
    group.position.copy(this.origin);
    for (const [key, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) { console.warn('merge failed', key); continue; }
      merged.computeBoundingSphere();
      const m = new THREE.Mesh(merged, mat(key));
      m.name = key;
      m.castShadow = this.shadows && !['glass', 'glow', 'emissiveWarm', 'emissiveCold'].includes(key);
      m.receiveShadow = this.shadows;
      m.matrixAutoUpdate = false; m.updateMatrix();
      group.add(m);
    }
    for (const o of this.objects) group.add(o);
    this.parts.clear();
    return group;
  }
}

export function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.isInstancedMesh) o.dispose?.();
    o.userData.release?.();
  });
  group.removeFromParent();
}

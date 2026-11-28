import * as THREE from 'three';

// Axis-aligned boxes in a spatial hash for the static world, plus dynamic
// bodies (rafts, ships) whose boxes live in a parent's local space. Simple,
// predictable, cheap on phones, and enough for walking, stairs and boats.
const CELL = 16;
const _n = new THREE.Vector3();
const _inv = new THREE.Matrix4();
const _v = new THREE.Vector3();

export class Collision {
  constructor() {
    this.cells = new Map();
    this.boxes = new Map();
    this.nextId = 1;
    this.bodies = new Set();
  }
  _key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }
  addBox(minX, minY, minZ, maxX, maxY, maxZ, tag = 'solid') {
    const id = this.nextId++;
    const b = { id, minX, minY, minZ, maxX, maxY, maxZ, tag };
    this.boxes.set(id, b);
    for (let ix = Math.floor(minX / CELL); ix <= Math.floor(maxX / CELL); ix++)
      for (let iz = Math.floor(minZ / CELL); iz <= Math.floor(maxZ / CELL); iz++) {
        const k = this._key(ix, iz);
        let c = this.cells.get(k);
        if (!c) this.cells.set(k, (c = []));
        c.push(b);
      }
    return id;
  }
  remove(ids) {
    for (const id of ids) {
      const b = this.boxes.get(id);
      if (!b) continue;
      this.boxes.delete(id);
      for (let ix = Math.floor(b.minX / CELL); ix <= Math.floor(b.maxX / CELL); ix++)
        for (let iz = Math.floor(b.minZ / CELL); iz <= Math.floor(b.maxZ / CELL); iz++) {
          const k = this._key(ix, iz);
          const c = this.cells.get(k);
          if (!c) continue;
          const i = c.indexOf(b);
          if (i >= 0) c.splice(i, 1);
          if (!c.length) this.cells.delete(k);
        }
    }
  }
  query(minX, minZ, maxX, maxZ, out = []) {
    out.length = 0;
    const seen = new Set();
    for (let ix = Math.floor(minX / CELL); ix <= Math.floor(maxX / CELL); ix++)
      for (let iz = Math.floor(minZ / CELL); iz <= Math.floor(maxZ / CELL); iz++) {
        const c = this.cells.get(this._key(ix, iz));
        if (!c) continue;
        for (const b of c) if (!seen.has(b.id) && b.maxX > minX && b.minX < maxX && b.maxZ > minZ && b.minZ < maxZ) { seen.add(b.id); out.push(b); }
      }
    return out;
  }

  // Dynamic body: {object: Object3D, boxes: [{minX..maxZ}], tag}
  addBody(object, boxes, tag = 'raft') {
    // reach: how far any of its boxes extends from its origin, so far-away bodies are skipped cheaply
    let rad = 0; for (const b of boxes) rad = Math.max(rad, Math.hypot(Math.max(Math.abs(b.minX), Math.abs(b.maxX)), Math.max(Math.abs(b.minZ), Math.abs(b.maxZ))));
    const body = { object, boxes, tag, rad }; this.bodies.add(body); return body;
  }
  // is a body's reach within d of (x, z)? (its world origin from the matrix, no inverse needed)
  static near(body, x, z, d) { const e = body.object.matrixWorld.elements; const dx = e[12] - x, dz = e[14] - z, r = (body.rad ?? 1e9) + d; return dx * dx + dz * dz < r * r; }
  removeBody(body) { this.bodies.delete(body); }

  // Resolve a vertical cylinder (feet at pos.y). Returns {grounded, groundBody, groundY, hitWall, ceiling}.
  resolveCylinder(pos, radius, height, vel, stepHeight = 0.45, result = {}) {
    result.grounded = false; result.groundBody = null; result.groundY = -Infinity; result.hitWall = false; result.ceiling = false;
    const boxes = this.query(pos.x - radius - 1, pos.z - radius - 1, pos.x + radius + 1, pos.z + radius + 1, this._tmp || (this._tmp = []));
    this._resolve(pos, radius, height, vel, stepHeight, boxes, result, null);
    for (const body of this.bodies) {
      if (body.disabled) continue;
      const o = body.object;
      _v.copy(pos);
      const wp = o.getWorldPosition(new THREE.Vector3());
      if (Math.abs(wp.x - pos.x) > (body.radius || 60) || Math.abs(wp.z - pos.z) > (body.radius || 60)) continue;
      _inv.copy(o.matrixWorld).invert();
      _v.applyMatrix4(_inv);
      const before = _v.clone();
      const r2 = { grounded: false, groundY: -Infinity };
      this._resolve(_v, radius, height, vel, stepHeight, body.boxes, r2, body);
      if (!before.equals(_v)) {
        _v.applyMatrix4(o.matrixWorld);
        pos.copy(_v);
      }
      if (r2.grounded) {
        result.grounded = true; result.groundBody = body;
        result.groundY = pos.y;
      }
      if (r2.hitWall) result.hitWall = true;
    }
    return result;
  }

  _resolve(pos, radius, height, vel, stepHeight, boxes, result, body) {
    const feet = pos.y, head = pos.y + height;
    // horizontal push-out
    for (const b of boxes) {
      if (b.tag === 'trigger') continue;
      if (b.maxY <= feet + stepHeight || b.minY >= head) continue;
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      let dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2), push = radius - d;
        pos.x += (dx / d) * push; pos.z += (dz / d) * push;
        const nx = dx / d, nz = dz / d, vn = vel.x * nx + vel.z * nz;
        if (vn < 0) { vel.x -= vn * nx; vel.z -= vn * nz; }
      } else {
        // center inside the box: push out along the smallest axis
        const pen = [pos.x - b.minX, b.maxX - pos.x, pos.z - b.minZ, b.maxZ - pos.z];
        const m = Math.min(...pen), i = pen.indexOf(m);
        if (i === 0) pos.x = b.minX - radius; else if (i === 1) pos.x = b.maxX + radius;
        else if (i === 2) pos.z = b.minZ - radius; else pos.z = b.maxZ + radius;
      }
      result.hitWall = true;
    }
    // vertical: ground and ceiling
    const r = radius * 0.7;
    let ground = -Infinity;
    for (const b of boxes) {
      if (b.tag === 'trigger') continue;
      if (pos.x + r <= b.minX || pos.x - r >= b.maxX || pos.z + r <= b.minZ || pos.z - r >= b.maxZ) continue;
      if (b.maxY <= pos.y + stepHeight + 0.001 && b.maxY > ground) ground = b.maxY;
      if (vel.y > 0 && b.minY > pos.y + stepHeight && b.minY < pos.y + height) { pos.y = b.minY - height; vel.y = 0; result.ceiling = true; }
    }
    if (ground > -Infinity && pos.y <= ground + 0.02 && vel.y <= 0.01) {
      pos.y = ground; if (vel.y < 0) vel.y = 0; result.grounded = true; result.groundY = ground;
    }
  }

  // Circle (boat hull) vs boxes crossing the waterline. Returns impact normal speed.
  resolveHull(pos, radius, vel) {
    const boxes = this.query(pos.x - radius - 1, pos.z - radius - 1, pos.x + radius + 1, pos.z + radius + 1, this._tmp2 || (this._tmp2 = []));
    let impact = 0;
    const hit = (b, p, floating = false) => {
      if (b.tag === 'trigger' || b.maxY < -0.7 || b.minY > (floating ? 2.5 : 0.6)) return null;   // a raft's deck slab can sit well above the water
      const cx = Math.max(b.minX, Math.min(p.x, b.maxX)), cz = Math.max(b.minZ, Math.min(p.z, b.maxZ));
      let dx = p.x - cx, dz = p.z - cz; const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) return null;
      if (d2 < 1e-8) {
        // center inside the box: leave along the axis of least penetration
        const pen = [p.x - b.minX, b.maxX - p.x, p.z - b.minZ, b.maxZ - p.z];
        const i = pen.indexOf(Math.min(...pen));
        return { nx: i === 0 ? -1 : i === 1 ? 1 : 0, nz: i === 2 ? -1 : i === 3 ? 1 : 0, push: pen[i] + radius };
      }
      const d = Math.sqrt(d2);
      return { nx: dx / d, nz: dz / d, push: radius - d };
    };
    for (const b of boxes) {
      const h = hit(b, pos);
      if (!h) continue;
      pos.x += h.nx * h.push; pos.z += h.nz * h.push;
      const vn = vel.x * h.nx + vel.z * h.nz;
      if (vn < 0) { vel.x -= vn * h.nx * 1.3; vel.z -= vn * h.nz * 1.3; impact = Math.max(impact, -vn); }
    }
    for (const body of this.bodies) {
      if (body.disabled || !Collision.near(body, pos.x, pos.z, radius + 0.5)) continue;
      const o = body.object;
      _inv.copy(o.matrixWorld).invert();
      _v.set(pos.x, 0, pos.z).applyMatrix4(_inv);
      for (const b of body.boxes) {
        const h = hit(b, _v, true);
        if (!h) continue;
        _v.x += h.nx * h.push; _v.z += h.nz * h.push;
        const n = _n.set(h.nx, 0, h.nz).transformDirection(o.matrixWorld);
        const vn = vel.x * n.x + vel.z * n.z;
        if (vn < 0) { vel.x -= vn * n.x * 1.3; vel.z -= vn * n.z * 1.3; impact = Math.max(impact, -vn); }
      }
      const w = _v.applyMatrix4(o.matrixWorld);
      pos.x = w.x; pos.z = w.z;
    }
    return impact;
  }

  // is a hull circle at (x, z) overlapping anything solid? (static walls or a floating raft)
  hullBlocked(x, z, radius) {
    const boxes = this.query(x - radius - 1, z - radius - 1, x + radius + 1, z + radius + 1, this._tmp3 || (this._tmp3 = []));
    const over = (b, px, pz, floating) => !(b.tag === 'trigger' || b.maxY < -0.7 || b.minY > (floating ? 2.5 : 0.6)) && (Math.max(b.minX, Math.min(px, b.maxX)) - px) ** 2 + (Math.max(b.minZ, Math.min(pz, b.maxZ)) - pz) ** 2 < radius * radius;
    for (const b of boxes) if (over(b, x, z, false)) return true;
    for (const body of this.bodies) {
      if (body.disabled || !Collision.near(body, x, z, radius + 0.5)) continue;
      _inv.copy(body.object.matrixWorld).invert(); _v.set(x, 0, z).applyMatrix4(_inv);
      for (const b of body.boxes) if (over(b, _v.x, _v.z, true)) return true;
    }
    return false;
  }

  // Ray (for camera collision / line of sight). Slab test over hashed cells along the segment.
  raycast(origin, dir, maxDist) {
    const end = origin.clone().addScaledVector(dir, maxDist);
    const boxes = this.query(Math.min(origin.x, end.x) - 1, Math.min(origin.z, end.z) - 1, Math.max(origin.x, end.x) + 1, Math.max(origin.z, end.z) + 1, []);
    let best = maxDist;
    for (const b of boxes) {
      if (b.tag === 'trigger') continue;
      let tmin = 0, tmax = best;
      for (const [o, d, mn, mx] of [[origin.x, dir.x, b.minX, b.maxX], [origin.y, dir.y, b.minY, b.maxY], [origin.z, dir.z, b.minZ, b.maxZ]]) {
        if (Math.abs(d) < 1e-8) { if (o < mn || o > mx) { tmin = Infinity; break; } continue; }
        let t1 = (mn - o) / d, t2 = (mx - o) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) break;
      }
      if (tmin <= tmax && tmin < best) best = tmin;
    }
    return best;
  }

  // Highest solid surface under a point (for spawning / props)
  groundAt(x, z, fromY = 200) {
    const boxes = this.query(x - 0.1, z - 0.1, x + 0.1, z + 0.1, []);
    let g = -Infinity;
    for (const b of boxes) if (b.tag !== 'trigger' && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && b.maxY <= fromY && b.maxY > g) g = b.maxY;
    return g;
  }
}

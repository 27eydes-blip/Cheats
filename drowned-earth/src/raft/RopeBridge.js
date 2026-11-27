import * as THREE from 'three';
import { mat } from '../world/Materials.js';
import { propGeometry } from '../world/Props.js';
import { prepGeometry, boxGeometry } from '../world/Builder.js';

// Sagging plank bridge between two moving anchor points. Planks are one
// InstancedMesh updated per frame; the walkable surface is a thin collision
// body that follows the chord between the anchors.
const plankGeo = prepGeometry(boxGeometry(0.28, 0.05, 1.15), [1, 1, 1]);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _sc = new THREE.Vector3(1, 1, 1);

export class RopeBridge {
  constructor(ctx, raftA, localA, raftB, localB) {
    this.ctx = ctx;
    this.ra = raftA; this.la = localA; this.rb = raftB; this.lb = localB;
    raftA.root.updateMatrixWorld(true); raftB.root.updateMatrixWorld(true);
    const len = raftA.worldPoint(localA, _a).distanceTo(raftB.worldPoint(localB, _b));
    this.n = Math.max(4, Math.ceil(len / 0.36));
    this.planks = new THREE.InstancedMesh(plankGeo, mat('wood'), this.n);
    this.planks.frustumCulled = false;
    this.planks.castShadow = true;
    const ropeGeo = new THREE.BufferGeometry();
    this.ropePos = new Float32Array(this.n * 12);
    ropeGeo.setAttribute('position', new THREE.BufferAttribute(this.ropePos, 3));
    this.rope = new THREE.LineSegments(ropeGeo, new THREE.LineBasicMaterial({ color: 0x6a5c48 }));
    this.rope.frustumCulled = false;
    this.group = new THREE.Group();
    this.group.add(this.planks, this.rope);
    ctx.scene.add(this.group);
    // collision carrier
    this.carrier = new THREE.Object3D();
    ctx.scene.add(this.carrier);
    this.body = ctx.collision.addBody(this.carrier, [{ minX: -len / 2 - 0.3, maxX: len / 2 + 0.3, minY: -0.6, maxY: 0, minZ: -0.55, maxZ: 0.55, tag: 'wood' }], 'wood');
    this.body.radius = len + 10;
    this.len = len;
    this.update(0);
  }
  update() {
    const A = this.ra.worldPoint(this.la, _a), B = this.rb.worldPoint(this.lb, _b);
    const dir = _p.copy(B).sub(A);
    const len = dir.length();
    const yaw = Math.atan2(-dir.z, dir.x);
    const sag = Math.min(0.5, len * 0.03);
    const pts = [];
    for (let i = 0; i <= this.n; i++) {
      const t = i / this.n;
      const p = new THREE.Vector3().lerpVectors(A, B, t);
      p.y -= Math.sin(t * Math.PI) * sag;
      pts.push(p);
    }
    _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    for (let i = 0; i < this.n; i++) {
      const p = new THREE.Vector3().lerpVectors(pts[i], pts[i + 1], 0.5);
      p.y -= 0.03;
      const tilt = Math.atan2(pts[i + 1].y - pts[i].y, len / this.n);
      const q = _q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tilt));
      _m.compose(p, q, _sc);
      this.planks.setMatrixAt(i, _m);
    }
    this.planks.instanceMatrix.needsUpdate = true;
    // hand ropes
    const side = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(0.6);
    let k = 0;
    for (let i = 0; i < this.n; i++) {
      for (const sgn of [1, -1]) {
        const a = pts[i], b = pts[i + 1];
        if (k + 6 > this.ropePos.length) break;
        this.ropePos.set([a.x + side.x * sgn, a.y + 0.95 - Math.sin((i / this.n) * Math.PI) * 0.1, a.z + side.z * sgn, b.x + side.x * sgn, b.y + 0.95, b.z + side.z * sgn], k);
        k += 6;
      }
    }
    this.rope.geometry.attributes.position.needsUpdate = true;
    // walkable carrier along the chord, slightly below the sag midpoint
    this.carrier.position.lerpVectors(A, B, 0.5);
    this.carrier.position.y -= sag * 0.55;
    this.carrier.rotation.set(0, yaw, Math.atan2(B.y - A.y, Math.hypot(B.x - A.x, B.z - A.z)), 'YXZ');
    this.carrier.updateMatrixWorld(true);
  }
}

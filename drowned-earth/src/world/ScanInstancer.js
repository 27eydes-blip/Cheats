import * as THREE from 'three';

// One InstancedMesh per (scanned model part, LOD, bob) for the whole world —
// not per chunk — so scanned props cost a handful of draw calls in total.
// Chunks register their instance matrices under a chunk key and drop them on
// unload. A few times a second every instance is binned by camera distance
// into LOD0 (full mesh, casts shadows), LOD1 (~18% triangles), or culled.
const MAX_PER_MESH = 4096;

export class ScanInstancer {
  constructor(scene, settings) {
    this.scene = scene;
    this.settings = settings;
    this.groups = new Map(); // gk → group
    this.timer = 0;
    this.dirty = false;
    this.stats = { instances: 0, lod0: 0, lod1: 0, meshes: 0 };
    this.root = new THREE.Group();
    this.root.name = 'scan-instancer';
    scene.add(this.root);
  }

  // parts: [{ geometry, material, matrix, lod }] ; size = model radius in metres
  group(gk, parts, size, shadows) {
    let g = this.groups.get(gk);
    if (g) return g;
    const range = this.settings.q.propDensity ?? 1;
    g = {
      gk, size, chunks: new Map(),
      // LOD0 range grows with model size; small clutter disappears sooner
      lod0: (6 + size * 5) * (0.6 + range * 0.4),
      cull: (35 + size * 35) * (0.5 + range * 0.5),
      meshes: [],
    };
    for (const p of parts) {
      const im = new THREE.InstancedMesh(p.geometry, p.material, MAX_PER_MESH);
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = shadows && p.lod === 0; im.receiveShadow = true;
      im.name = 'scan:' + gk + (p.lod ? ':lod1' : '');
      im.userData.lod = p.lod; im.userData.local = p.matrix;
      // small things don't show in the water's reflection
      if (size < 1.5) im.layers.set(3);
      this.root.add(im);
      g.meshes.push(im);
    }
    this.groups.set(gk, g);
    return g;
  }
  add(gk, chunkKey, matrices) {
    const g = this.groups.get(gk);
    if (!g || !matrices.length) return;
    const pos = new Float32Array(matrices.length * 3);
    matrices.forEach((m, i) => { pos[i * 3] = m.elements[12]; pos[i * 3 + 1] = m.elements[13]; pos[i * 3 + 2] = m.elements[14]; });
    g.chunks.set(chunkKey, { matrices, pos });
    this.dirty = true;
  }
  remove(chunkKey) {
    for (const g of this.groups.values()) if (g.chunks.delete(chunkKey)) this.dirty = true;
  }

  update(dt, camPos) {
    this.timer -= dt;
    const moved = !this.last || this.last.distanceToSquared(camPos) > 4;
    if (!this.dirty && !(moved && this.timer <= 0)) return;
    this.timer = 0.25; this.dirty = false;
    (this.last ||= new THREE.Vector3()).copy(camPos);
    const m = new THREE.Matrix4();
    let n0t = 0, n1t = 0, nt = 0;
    for (const g of this.groups.values()) {
      const c0 = g.lod0 * g.lod0, c1 = g.cull * g.cull;
      const near = [], far = [];
      for (const ch of g.chunks.values()) {
        const p = ch.pos;
        for (let i = 0; i < ch.matrices.length; i++) {
          const dx = p[i * 3] - camPos.x, dy = p[i * 3 + 1] - camPos.y, dz = p[i * 3 + 2] - camPos.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          nt++;
          if (d2 < c0) near.push(ch.matrices[i]); else if (d2 < c1) far.push(ch.matrices[i]);
        }
      }
      for (const im of g.meshes) {
        const list = im.userData.lod ? far : near;
        const n = Math.min(list.length, MAX_PER_MESH);
        for (let i = 0; i < n; i++) im.setMatrixAt(i, m.multiplyMatrices(list[i], im.userData.local));
        im.count = n;
        im.visible = n > 0;
        im.instanceMatrix.needsUpdate = true;
      }
      n0t += near.length; n1t += far.length;
    }
    this.stats = { instances: nt, lod0: n0t, lod1: n1t, meshes: this.root.children.filter((c) => c.visible).length };
  }
}

import * as THREE from 'three';
import { prepGeometry } from '../Builder.js';
import { mat } from '../Materials.js';

export function seabedMesh(wm, x0, z0, size, seg, matKey, origin) {
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + x0 + size / 2, z = p.getZ(i) + z0 + size / 2;
    p.setY(i, wm.seabedAt(x, z));
    uv.setXY(i, x, z);
    p.setX(i, x - origin.x); p.setZ(i, z - origin.z);
  }
  g.computeVertexNormals();
  prepGeometry(g, [0.55, 0.55, 0.5]);
  const m = new THREE.Mesh(g, mat(matKey));
  m.receiveShadow = true;
  m.name = 'seabed';
  return m;
}

import * as THREE from 'three';
import { RNG, hashInt } from '../../core/rng.js';
import { Builder } from '../Builder.js';
import { InstanceBatch } from '../Props.js';
import { CHUNK } from '../ChunkManager.js';
import { facadeStyle } from '../Architecture.js';
import { seabedMesh } from './seabed.js';

// Outskirts: sparse drowned rooftops, leaning poles and wrecks between districts.
export function ruinsChunk(ctx, cx, cz, lod, region) {
  const wm = ctx.worldMap;
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const origin = new THREE.Vector3(x0 + CHUNK / 2, 0, z0 + CHUNK / 2);
  const rng = new RNG(hashInt(wm.seed, cx, cz, 13));
  const near = lod === 'near';
  const b = new Builder(origin, { shadows: near && ctx.settings.q.shadows });
  const inst = new InstanceBatch();
  const fade = wm.cityFade(origin.x, origin.z);
  const n = rng.int(0, 3) * (fade < 1 ? 2 : 1);
  for (let i = 0; i < n; i++) {
    if (!rng.chance(region.density * 3 + (1 - fade) * 0.5)) continue;
    const x = rng.range(x0 + 10, x0 + CHUNK - 30), z = rng.range(z0 + 10, z0 + CHUNK - 30);
    if (wm.landmarkClaim(x, z, 10)) continue;
    const w = rng.range(10, 24), d = rng.range(10, 24);
    const h = rng.chance(0.7) ? rng.range(-1.5, 4) : rng.range(10, 40) * (1 - fade * 0.5);
    const st = facadeStyle(rng, h);
    st.meta[2] = 0.8;
    const yb = wm.seabedAt(x, z) - 1;
    b.box(x, yb, z, x + w, h, z + d, 'facade', { color: st.color, meta: st.meta, faces: ['px', 'nx', 'pz', 'nz', 'py'] });
  }
  if (near) {
    for (let i = 0; i < rng.int(2, 8) * ctx.settings.q.debrisDensity; i++) {
      inst.add(rng.pick(['plank', 'bottle', 'barrelFloat']), rng.pick(['woodFloat', 'plasticFloat']), rng.range(x0, x0 + CHUNK), 0, rng.range(z0, z0 + CHUNK), { ry: rng.range(0, 6), color: [0.7, 0.66, 0.6] });
    }
    for (let i = 0; i < rng.int(0, 3); i++) {
      const x = rng.range(x0, x0 + CHUNK), z = rng.range(z0, z0 + CHUNK);
      inst.add('lampPost', 'metal', x, wm.seabedAt(x, z), z, { sy: 2.2, rx: rng.range(-0.4, 0.4), ry: rng.range(0, 6) });
    }
    b.object(seabedMesh(wm, x0, z0, CHUNK, 8, 'mud', origin));
  }
  for (const im of inst.build(origin)) b.object(im);
  return { group: b.build(`ruins ${cx},${cz}`), colliders: b.colliders, interactables: b.interactables };
}

export function oceanChunk(ctx, cx, cz, lod) {
  if (lod !== 'near') return null;
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const rng = new RNG(hashInt(ctx.worldMap.seed, cx, cz, 5));
  if (!rng.chance(0.25)) return null;
  const origin = new THREE.Vector3(x0 + CHUNK / 2, 0, z0 + CHUNK / 2);
  const b = new Builder(origin, { shadows: false });
  const inst = new InstanceBatch();
  for (let i = 0; i < rng.int(1, 5); i++) inst.add(rng.pick(['plank', 'bottle']), 'woodFloat', rng.range(x0, x0 + CHUNK), 0, rng.range(z0, z0 + CHUNK), { ry: rng.range(0, 6) });
  for (const im of inst.build(origin)) b.object(im);
  return { group: b.build('ocean'), colliders: [], interactables: [] };
}

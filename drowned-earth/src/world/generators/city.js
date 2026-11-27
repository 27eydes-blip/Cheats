import * as THREE from 'three';
import { RNG, hashInt, fbm2 } from '../../core/rng.js';
import { Builder } from '../Builder.js';
import { InstanceBatch } from '../Props.js';
import { CHUNK } from '../ChunkManager.js';
import { tower, ladder, mooring, container, sign, facadeStyle } from '../Architecture.js';
import { signMaterial } from '../Materials.js';
import { seabedMesh } from './seabed.js';

// Drowned city blocks: towers, low-rise rooftops, drowned parks, collapsed lots,
// underwater streets with cars and lamp posts, floating debris.
const SIGNS = [
  { lines: ['EVACUATION ROUTE', '↑ HIGH GROUND ↑'], bg: '#1d5a3a', fg: '#e8efe6', font: 'bold 52px sans-serif', border: '#e8efe6' },
  { lines: ['SHELTER IN PLACE', 'TUNE TO 88.1'], bg: '#c9b23a', fg: '#151515', font: 'bold 50px sans-serif' },
  { lines: ['QUARANTINE ZONE', 'NO ENTRY WITHOUT PERMIT'], bg: '#a8281f', fg: '#f2e9e0', font: 'bold 44px sans-serif', border: '#f2e9e0' },
  { lines: ['HIGHMARK SUPPLY', 'COLLECTION POINT 14'], bg: '#e8e6e0', fg: '#1b3550', font: 'bold 48px sans-serif', border: '#1b3550' },
  { lines: ['KEEP 2 ARMS APART'], bg: '#ffffff', fg: '#222', font: 'bold 56px sans-serif' },
];
const GRAFFITI = [
  { lines: ['WE ARE STILL HERE'], bg: null, fg: '#d8d0c0', font: 'bold 60px sans-serif', spray: true },
  { lines: ['WHO HEARS IT?'], bg: null, fg: '#c04030', font: 'bold 64px sans-serif', spray: true },
  { lines: ['X', '4 / 0'], bg: null, fg: '#d04a2a', font: 'bold 90px sans-serif', spray: true, w: 256, h: 256 },
  { lines: ['DONT DIVE AT NIGHT'], bg: null, fg: '#e0e0d0', font: 'bold 52px sans-serif', spray: true },
  { lines: ['HIGHMARK LIES'], bg: null, fg: '#d8d0c0', font: 'bold 64px sans-serif', spray: true },
];

export function cityChunk(ctx, cx, cz, lod, region) {
  const near = lod === 'near';
  const wm = ctx.worldMap;
  const seed = wm.seed;
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const origin = new THREE.Vector3(x0 + CHUNK / 2, 0, z0 + CHUNK / 2);
  const b = new Builder(origin, { shadows: near && ctx.settings.q.shadows });
  const inst = new InstanceBatch();
  const out = { group: null, colliders: [], interactables: [], audio: [] };
  const P = region.blockPitch, SW = region.streetWidth;
  const base = region.streetDepth - 1.5;
  const density = ctx.settings.q.debrisDensity;

  for (let bx = Math.floor(x0 / P); bx < Math.floor((x0 + CHUNK) / P); bx++) {
    for (let bz = Math.floor(z0 / P); bz < Math.floor((z0 + CHUNK) / P); bz++) {
      const rng = new RNG(hashInt(seed, bx, bz, 77));
      const lx0 = bx * P + SW / 2, lz0 = bz * P + SW / 2, lx1 = (bx + 1) * P - SW / 2, lz1 = (bz + 1) * P - SW / 2;
      const mx = (lx0 + lx1) / 2, mz = (lz0 + lz1) / 2;
      const fade = wm.cityFade(mx, mz);
      if (fade >= 1) continue;
      if (wm.rectClaimed(lx0 - 4, lz0 - 4, lx1 + 4, lz1 + 4)) continue;
      const downtown = Math.max(0, 1 - Math.hypot(mx + 60, mz + 80) / 650);
      const roll = rng.next();
      const kind = roll < 0.1 ? 'park' : roll < 0.17 ? 'open' : roll < 0.24 ? 'collapsed' : roll < 0.24 + 0.2 + (1 - downtown) * 0.15 ? 'lowrise' : 'towers';
      const blockId = `b${bx}_${bz}`;

      if (kind === 'towers') {
        // split the lot into 1-4 buildings
        const splitX = rng.chance(0.55), splitZ = rng.chance(0.45);
        const xs = splitX ? [lx0, rng.range(lx0 + 16, lx1 - 16), lx1] : [lx0, lx1];
        const zs = splitZ ? [lz0, rng.range(lz0 + 16, lz1 - 16), lz1] : [lz0, lz1];
        let k = 0;
        for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
          const gap = 1.2;
          const s = {
            x0: xs[i] + (i > 0 ? gap : 0), x1: xs[i + 1] - (i < xs.length - 2 ? gap : 0),
            z0: zs[j] + (j > 0 ? gap : 0), z1: zs[j + 1] - (j < zs.length - 2 ? gap : 0), base,
          };
          const hr = region.heightRange;
          const hBase = hr[0] + (hr[1] - hr[0]) * Math.pow(rng.next(), 1.6) * (0.35 + downtown * 0.9) * (1 - fade * 0.8);
          s.h = Math.max(hr[0], Math.round(hBase / 3.4) * 3.4 + 0.45);
          s.style = facadeStyle(rng, s.h);
          s.style.meta[2] = region.vines * rng.range(0.1, 1) * (s.h < 40 ? 1 : 0.5);
          s.enterable = near && rng.chance(0.3) && (s.x1 - s.x0) > 12 && (s.z1 - s.z0) > 12;
          s.flooded = s.enterable && rng.chance(0.55);
          s.breachSide = rng.pick(['px', 'nx', 'pz', 'nz']);
          tower(b, rng, s, near, inst);
          if (near && s.enterable) furnishFloor(b, rng, s, `${blockId}_${k}`, inst);
          if (near && s.h > 45) out.audio.push({ type: 'creak', pos: [rng.range(s.x0, s.x1), rng.range(8, s.h * 0.6), s.z1], seed: rng.int(0, 1e6) });
          if (near && s.h > 30 && rng.chance(0.5)) out.audio.push({ type: 'whistle', pos: [s.x0, s.h * 0.7, rng.range(s.z0, s.z1)], seed: rng.int(0, 1e6) });
          if (near && rng.chance(0.25)) {
            const g = rng.pick(GRAFFITI);
            sign(b, rng.range(s.x0 + 3, s.x1 - 3), rng.range(1.3, 2.6), s.z1 + 0.02, 4, 1.6 * (g.h ? g.h / 256 : 1) * (g.w === 256 ? 1.2 : 1), 0, g, { signMaterial });
          }
          if (s.h > 40) ctx.events.emit('roost', { x: (s.x0 + s.x1) / 2, y: s.h + 1, z: (s.z0 + s.z1) / 2, id: `${blockId}_${k}` });
          k++;
        }
      } else if (kind === 'lowrise') {
        const s = { x0: lx0 + rng.range(0, 4), x1: lx1 - rng.range(0, 4), z0: lz0 + rng.range(0, 4), z1: lz1 - rng.range(0, 4), base };
        s.h = rng.pick([2.2, 3.1, 4.8, 6.5]);
        s.style = facadeStyle(rng, s.h);
        s.style.meta[2] = region.vines;
        tower(b, rng, s, near, inst);
        if (near) rooftopCamp(ctx, b, rng, s, blockId, inst);
      } else if (kind === 'park') {
        if (near) drownedPark(b, rng, lx0, lz0, lx1, lz1, base, inst);
        else for (let i = 0; i < 6; i++) inst.add('foliage', 'foliage', rng.range(lx0, lx1), rng.range(1, 3), rng.range(lz0, lz1), { s: rng.range(2, 4), color: [0.5, 0.6, 0.45] });
      } else if (kind === 'collapsed') {
        const s = { x0: lx0 + 6, x1: lx1 - 10, z0: lz0 + 6, z1: lz1 - 8 };
        const h = rng.range(30, 70), style = facadeStyle(rng, h);
        // a tower that sheared at its base and leans into the next street
        const tilt = rng.range(0.12, 0.22) * rng.sign();
        b.boxR((s.x0 + s.x1) / 2 + Math.sin(tilt) * h * 0.5, h / 2 - 6, (s.z0 + s.z1) / 2, s.x1 - s.x0, h, s.z1 - s.z0, 0, 'facade', { color: style.color, meta: style.meta, rz: -tilt });
        b.collider(s.x0, base, s.z0, s.x1, 4, s.z1);
        if (near) for (let i = 0; i < 14; i++) inst.add('rubble', 'concrete', rng.range(lx0, lx1), rng.range(-3, 0.6), rng.range(lz0, lz1), { s: rng.range(0.8, 2.6), ry: rng.range(0, 6), rx: rng.range(0, 3), color: [0.6, 0.6, 0.57] });
        if (near) out.audio.push({ type: 'creak', pos: [(s.x0 + s.x1) / 2, 15, (s.z0 + s.z1) / 2], seed: rng.int(0, 1e6), heavy: true });
      }
      if (!near) continue;
      // sidewalk curb under water around the lot
      b.box(lx0 - 3, region.streetDepth, lz0 - 3, lx1 + 3, region.streetDepth + 0.2, lz1 + 3, 'concrete', { color: [0.45, 0.47, 0.43], collide: false, faces: ['py', 'px', 'nx', 'pz', 'nz'] });
      // street furniture along the lot edges
      for (let i = 0; i < 2; i++) {
        const along = rng.range(lx0 + 4, lx1 - 4);
        const tilt = rng.chance(0.35) ? rng.range(-0.25, 0.25) : 0;
        inst.add('lampPost', 'metal', along, region.streetDepth, rng.chance(0.5) ? lz0 - 2 : lz1 + 2, { ry: rng.chance(0.5) ? 0 : Math.PI, rx: tilt });
      }
      if (rng.chance(0.3)) inst.add('trafficLight', 'metal', lx0 - 2.5, region.streetDepth, lz0 - 2.5, { ry: rng.pick([0, Math.PI / 2]) });
      if (rng.chance(0.35)) {
        const sx = rng.range(lx0 + 3, lx1 - 3), sz = lz1 + 2.2;
        inst.add('signPost', 'metal', sx, region.streetDepth, sz);
        sign(b, sx, 1.4 + rng.range(-0.6, 0.4), sz + 0.06, 1.6, 0.8, 0, rng.pick(SIGNS), { signMaterial });
      }
      if (rng.chance(0.2)) inst.add('busShelter', 'metal', rng.range(lx0 + 4, lx1 - 4), region.streetDepth + 0.2, lz0 - 2.2, { color: [0.6, 0.62, 0.6] });
    }
  }

  // streets: cars on the bottom, floating debris on top
  if (near) {
    const rng = new RNG(hashInt(seed, cx, cz, 91));
    const nCars = Math.round(rng.int(4, 9) * density);
    const carCols = [[0.5, 0.1, 0.08], [0.15, 0.2, 0.3], [0.7, 0.7, 0.68], [0.1, 0.1, 0.1], [0.4, 0.42, 0.3], [0.6, 0.5, 0.2]];
    for (let i = 0; i < nCars; i++) {
      const p = streetPoint(rng, x0, z0, P, SW);
      if (!p || wm.landmarkClaim(p.x, p.z)) continue;
      inst.add('car', 'metal', p.x, wm.seabedAt(p.x, p.z), p.z, { ry: p.alongX ? Math.PI / 2 + rng.range(-0.3, 0.3) : rng.range(-0.3, 0.3), rz: rng.range(-0.08, 0.08), color: rng.pick(carCols) });
    }
    const nDeb = Math.round(rng.int(14, 26) * density);
    for (let i = 0; i < nDeb; i++) {
      const p = streetPoint(rng, x0, z0, P, SW);
      if (!p || wm.landmarkClaim(p.x, p.z, 6)) continue;
      const t = rng.weighted([{ w: 5, v: 'plank' }, { w: 2, v: 'barrelFloat' }, { w: 2, v: 'pallet' }, { w: 1, v: 'chairFloat' }, { w: 1, v: 'mattress' }, { w: 4, v: 'bottle' }, { w: 1, v: 'tire' }, { w: 1, v: 'lifebuoy' }, { w: 0.6, v: 'lifeJacket' }, { w: 2, v: 'trash' }]);
      const mk = t === 'mattress' || t === 'lifeJacket' ? 'fabricFloat' : ['bottle', 'barrelFloat', 'tire', 'lifebuoy', 'trash'].includes(t) ? 'plasticFloat' : 'woodFloat';
      const col = t === 'barrelFloat' ? rng.pick([[0.2, 0.3, 0.6], [0.6, 0.2, 0.1], [0.5, 0.5, 0.45]]) : t === 'bottle' ? [0.7, 0.8, 0.85] : t === 'mattress' ? [0.6, 0.56, 0.48] : [0.75, 0.68, 0.6];
      inst.add(t, mk, p.x, 0, p.z, { ry: rng.range(0, 6.28), color: col });
    }
    // the street furniture that was left behind, now on the bottom
    const pd = ctx.settings.q.propDensity ?? 1;
    const nBed = Math.round(rng.int(6, 12) * density * pd);
    for (let i = 0; i < nBed; i++) {
      const p = streetPoint(rng, x0, z0, P, SW);
      if (!p || wm.landmarkClaim(p.x, p.z)) continue;
      const t = rng.weighted([{ w: 2, v: 'hydrant' }, { w: 2, v: 'utilityBox' }, { w: 2, v: 'barrier' }, { w: 2, v: 'trashCan' }, { w: 1, v: 'wheelRim' }, { w: 2, v: 'tire' }, { w: 1, v: 'rocks' }]);
      inst.add(t, 'concrete', p.x, wm.seabedAt(p.x, p.z), p.z, { ry: rng.range(0, 6.28), rz: rng.range(-0.15, 0.15) });
    }
    // seabed
    b.object(seabedMesh(wm, x0, z0, CHUNK, 16, 'asphalt', origin));
  }
  for (const im of inst.build(origin, { shadows: near && ctx.settings.q.shadows })) b.object(im);
  out.group = b.build(`chunk ${cx},${cz} ${lod}`);
  out.colliders = b.colliders;
  out.interactables = b.interactables;
  return out;
}

function streetPoint(rng, x0, z0, P, SW) {
  // pick a point inside a street strip within this chunk
  const alongX = rng.chance(0.5);
  const lines = [];
  for (let g = Math.ceil(z0 / P) * P; g < z0 + CHUNK; g += P) lines.push(g);
  for (let g = Math.ceil(x0 / P) * P; g < x0 + CHUNK; g += P) lines.push(g);
  if (alongX) {
    const zl = Math.ceil(z0 / P) * P + (rng.chance(0.5) ? 0 : P);
    if (zl >= z0 + CHUNK) return null;
    return { x: rng.range(x0, x0 + CHUNK), z: zl + rng.range(-SW / 2 + 2, SW / 2 - 2), alongX: true };
  }
  const xl = Math.ceil(x0 / P) * P + (rng.chance(0.5) ? 0 : P);
  if (xl >= x0 + CHUNK) return null;
  return { x: xl + rng.range(-SW / 2 + 2, SW / 2 - 2), z: rng.range(z0, z0 + CHUNK), alongX: false };
}

function furnishFloor(b, rng, s, id, inst) {
  const fy = s.floorY;
  const dark = [0.4, 0.37, 0.33];
  const n = rng.int(3, 7);
  for (let i = 0; i < n; i++) {
    const x = rng.range(s.x0 + 2, s.x1 - 2), z = rng.range(s.z0 + 2, s.z1 - 2);
    if (s.diveHole && Math.hypot(x - s.diveHole[0], z - s.diveHole[1]) < 2.4) continue;
    if (s.mooring && Math.hypot(x - s.mooring.step.x, z - s.mooring.step.z) < 2.5) continue;
    const t = rng.pick(['desk', 'cabinet', 'sofa', 'shelf']);
    if (t === 'desk') b.boxR(x, fy + 0.38, z, 1.6, 0.76, 0.8, rng.range(0, 3), 'wood', { color: dark, collide: true });
    if (t === 'cabinet') b.boxR(x, fy + 0.7, z, 0.6, 1.4, 0.6, rng.range(0, 3), 'metal', { color: [0.35, 0.37, 0.36], collide: true });
    if (t === 'sofa') b.boxR(x, fy + 0.35, z, 2, 0.7, 0.9, rng.range(0, 3), 'fabric', { color: [0.3, 0.27, 0.25], collide: true });
    if (t === 'shelf') b.boxR(x, fy + 1, z, 1.8, 2, 0.4, rng.pick([0, Math.PI / 2]), 'wood', { color: dark, collide: true });
  }
  for (let i = 0; i < 6; i++) inst.add('plank', 'wood', rng.range(s.x0 + 1, s.x1 - 1), fy + 0.03, rng.range(s.z0 + 1, s.z1 - 1), { ry: rng.range(0, 6), color: [0.5, 0.45, 0.4] });
  // clutter: what people left when the water came
  for (let i = 0, n = rng.int(3, 8); i < n; i++) {
    const t = rng.weighted([{ w: 3, v: 'trash' }, { w: 1, v: 'stool' }, { w: 1, v: 'bucket' }, { w: 1, v: 'shelves' }, { w: 1, v: 'jerrycan' }]);
    inst.add(t, 'wood', rng.range(s.x0 + 1.2, s.x1 - 1.2), fy, rng.range(s.z0 + 1.2, s.z1 - 1.2), { ry: rng.range(0, 6.28) });
  }
  const lc = rng.int(1, 2);
  for (let i = 0; i < lc; i++) {
    const x = rng.range(s.x0 + 2, s.x1 - 2), z = rng.range(s.z0 + 2, s.z1 - 2);
    if (s.diveHole && Math.hypot(x - s.diveHole[0], z - s.diveHole[1]) < 2.4) continue;
    container(b, `c:${id}:${i}`, rng.pick(['cabinet', 'locker', 'crate', 'gobag']), x, fy, z, rng.range(0, 3));
  }
  if (s.flooded && s.diveHole) {
    const x = s.diveHole[0] + rng.range(-5, 5), z = s.diveHole[1] + rng.range(-5, 5);
    container(b, `c:${id}:deep`, rng.pick(['locker', 'medcab', 'toolbox']), Math.min(s.x1 - 1.5, Math.max(s.x0 + 1.5, x)), -3.1, Math.min(s.z1 - 1.5, Math.max(s.z0 + 1.5, z)), rng.range(0, 3));
  }
  if (s.mooring) mooring(b, s.mooring, 'Tie up and climb in');
}

function rooftopCamp(ctx, b, rng, s, id, inst) {
  const top = s.h;
  const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
  // ladder from the water up to the roof on a random side
  const side = rng.pick(['pz', 'nz', 'px', 'nx']);
  const lp = { pz: [cx + 4, s.z1 + 0.3, 0], nz: [cx - 4, s.z0 - 0.3, Math.PI], px: [s.x1 + 0.3, cz, Math.PI / 2], nx: [s.x0 - 0.3, cz, -Math.PI / 2] }[side];
  const n = { pz: [0, 1], nz: [0, -1], px: [1, 0], nx: [-1, 0] }[side];
  const ry = lp[2];
  ladder(b, lp[0], lp[1], -0.6, top, ry + Math.PI / 2, { id: 'lad:' + id, topStep: new THREE.Vector3(lp[0] - n[0] * 1.6, top, lp[1] - n[1] * 1.6), bottomStep: null });
  mooring(b, { pos: new THREE.Vector3(lp[0] + n[0] * 2.8, 0, lp[1] + n[1] * 2.8), step: new THREE.Vector3(lp[0] - n[0] * 1.6, top, lp[1] - n[1] * 1.6), facing: Math.atan2(n[0], n[1]) }, 'Tie up and climb the ladder');
  // remains of an earlier camp
  if (rng.chance(0.7)) {
    const tx = rng.range(s.x0 + 3, s.x1 - 5), tz = rng.range(s.z0 + 3, s.z1 - 5);
    b.boxR(tx, top + 0.6, tz, 2.4, 0.05, 2.2, rng.range(0, 1), 'fabric', { color: rng.pick([[0.45, 0.5, 0.35], [0.5, 0.3, 0.2], [0.3, 0.35, 0.45]]), rx: 0.25 });
    b.box(tx - 1.2, top, tz - 1.1, tx - 1.1, top + 1.1, tz - 1.0, 'wood', { color: [0.5, 0.45, 0.4], collide: false });
    container(b, `c:${id}:camp`, rng.pick(['gobag', 'crate', 'cooler']), tx + 1.8, top, tz + 1.4, rng.range(0, 3), [0.7, 0.5, 0.45], 'fabric', [0.35, 0.33, 0.28]);
  }
  // rain catchers, buckets
  for (let i = 0; i < rng.int(1, 4); i++) inst.add('barrel', 'plastic', rng.range(s.x0 + 1.5, s.x1 - 1.5), top + 0.45, rng.range(s.z0 + 1.5, s.z1 - 1.5), { color: rng.pick([[0.2, 0.3, 0.6], [0.55, 0.55, 0.5]]) });
  // the camp's leftovers and the roof's slow return to green
  for (let i = 0, n = rng.int(2, 6); i < n; i++) {
    const t = rng.weighted([{ w: 2, v: 'jerrycan' }, { w: 1, v: 'propane' }, { w: 2, v: 'bucket' }, { w: 2, v: 'trash' }, { w: 1, v: 'stool' }, { w: 0.6, v: 'barrelStove' }, { w: 1, v: 'tire' }]);
    inst.add(t, 'wood', rng.range(s.x0 + 1.5, s.x1 - 1.5), top + (t === 'tire' ? 0.12 : 0), rng.range(s.z0 + 1.5, s.z1 - 1.5), { ry: rng.range(0, 6.28) });
  }
  for (let i = 0, n = rng.int(2, 7); i < n; i++) {
    const edge = rng.int(0, 3), u = rng.range(0.1, 0.9);
    const x = edge < 2 ? s.x0 + (s.x1 - s.x0) * u : (edge === 2 ? s.x0 + 0.6 : s.x1 - 0.6);
    const z = edge >= 2 ? s.z0 + (s.z1 - s.z0) * u : (edge === 0 ? s.z0 + 0.6 : s.z1 - 0.6);
    inst.add(rng.weighted([{ w: 3, v: 'fern' }, { w: 2, v: 'foliage' }, { w: 1, v: 'roots' }]), 'foliage', x, top + (rng.chance(0.5) ? 0 : 0.75), z, { ry: rng.range(0, 6.28), s: rng.range(0.8, 1.2) });
  }
  if (ctx.data.logPlacements) {
    const lp2 = ctx.data.logPlacements.ambient;
    if (lp2 && rng.chance(0.25)) ctx.events.emit('ambientNoteSlot', { id, x: cx, y: top, z: cz });
  }
}

function drownedPark(b, rng, x0, z0, x1, z1, base, inst) {
  const n = rng.int(7, 14);
  for (let i = 0; i < n; i++) {
    const x = rng.range(x0 + 2, x1 - 2), z = rng.range(z0 + 2, z1 - 2);
    const h = rng.range(8, 15);
    const bot = base + 1.4;
    const dead = rng.chance(0.4);
    inst.add('trunk', 'wood', x, bot, z, { sx: 1, sy: h, sz: 1, color: [0.45, 0.38, 0.3], rz: rng.range(-0.08, 0.08) });
    b.collider(x - 0.3, bot, z - 0.3, x + 0.3, bot + h, z + 0.3);
    const top = bot + h;
    for (let j = 0; j < 5; j++) inst.add('branch', 'wood', x, top - rng.range(0.5, 3), z, { sy: rng.range(1.5, 3.5), rz: rng.range(0.5, 1.2) * rng.sign(), ry: rng.range(0, 6), color: [0.45, 0.4, 0.33] });
    if (!dead) for (let j = 0; j < 4; j++) inst.add('foliage', 'foliage', x + rng.range(-1.5, 1.5), top + rng.range(-1, 1), z + rng.range(-1.5, 1.5), { s: rng.range(1.4, 2.6), ry: rng.range(0, 6), color: [rng.range(0.32, 0.5), rng.range(0.42, 0.6), 0.3] });
  }
  // park railing sticking out of the water
  for (let x = x0; x < x1; x += 2) inst.add('railing', 'metal', x, base + 1.2 + 6.2, z0, { ry: Math.PI / 2, color: [0.3, 0.32, 0.3], sy: 0.9 });
}

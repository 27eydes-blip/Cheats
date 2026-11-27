import * as THREE from 'three';
import { Builder } from '../Builder.js';
import { InstanceBatch } from '../Props.js';
import { storey, windowsAlong, container, logItem, sign, ladder, slabWithHole } from '../Architecture.js';
import { signMaterial, mat } from '../Materials.js';

// Linden Court: the apartment tower where the game starts. The boat is tied to
// its south breach at dawn. Floor 1 is a ruined lobby, floor 2 the flat of the
// family who left the first recording, the basement is flooded.
export function buildLindenCourt(ctx, def) {
  const [cx, cz] = def.pos;
  const origin = new THREE.Vector3(cx, 0, cz);
  const b = new Builder(origin, { shadows: ctx.settings.q.shadows });
  const inst = new InstanceBatch();
  const x0 = cx - 11, x1 = cx + 11, z0 = cz - 11, z1 = cz + 11;
  const facade = { color: [0.66, 0.6, 0.52], meta: [1, 0.35, 0.8, 0.42] };
  const wall = [0.62, 0.58, 0.52], dark = [0.34, 0.33, 0.31];
  const base = -9;
  // basement (flooded): -3.1 .. 0.15
  b.box(x0, base, z0, x1, -3.4, z1, 'facade', { color: facade.color, meta: facade.meta, faces: ['px', 'nx', 'pz', 'nz'] });
  storey(b, x0, z0, x1, z1, -3.1, 0.15, { color: dark, floorColor: [0.3, 0.32, 0.3], openings: { nz: windowsAlong(x0, x1, 5, 1.4, 0.9, 1.6) } });
  // floor 1 (lobby): breach on the south side
  const hole = [cx - 8, cz - 3, cx - 5.5, cz - 0.5];
  storey(b, x0, z0, x1, z1, 0.45, 3.75, {
    color: [0.42, 0.4, 0.36], hole, floorColor: [0.3, 0.29, 0.26],
    openings: { pz: [{ at: cx, w: 2.6, h: 2.6, bottom: 0 }, ...windowsAlong(x0, x1, 4.4, 1.6, 1.4, 1, [cx])], nz: windowsAlong(x0, x1, 4.4), nx: windowsAlong(z0, z1, 4.4), px: windowsAlong(z0, z1, 4.4) },
  });
  // stairwell NE corner: up along +z from floor 1 to floor 2
  const sx = x1 - 2.4;
  b.stairs(sx, 0.45, z0 + 1.2, 2.6, 3.4, 5.8, 'z+', 'concrete', { color: [0.5, 0.49, 0.46] });
  b.box(sx - 1.5, 0.45, z0 + 0.4, sx - 1.3, 3.75, z0 + 7.2, 'concrete', { color: wall }); // stair wall
  // floor 2 slab with stair opening
  slabWithHole(b, x0, z0, x1, z1, 3.55, 3.85, sx - 1.3, z0 + 0.4, x1 - 0.35, z0 + 7.2, 'wood', [0.42, 0.33, 0.25]);
  // floor 2: the flat
  storey(b, x0, z0, x1, z1, 3.85, 7.15, {
    floor: false, color: [0.7, 0.66, 0.6],
    openings: { pz: [{ at: cx - 4, w: 2.0, h: 2.3, bottom: 0 }, ...windowsAlong(x0, x1, 4.4, 1.6, 1.4, 1, [cx - 4])], nz: windowsAlong(x0, x1, 4.4), nx: windowsAlong(z0, z1, 4.4), px: windowsAlong(z0, z1, 4.4) },
  });
  // interior partition of the flat
  b.wall('x', x0 + 0.35, x1 - 3.4, cz - 1, 3.85, 7.15, 0.15, 'concrete', [{ at: cx - 2, w: 1.0, h: 2.1, bottom: 0 }], { color: [0.72, 0.68, 0.6] });
  // ceiling + tower above
  b.box(x0, 7.15, z0, x1, 7.45, z1, 'concrete', { color: dark });
  b.box(x0, 7.45, z0, x1, 48, z1, 'facade', { color: facade.color, meta: facade.meta, faces: ['px', 'nx', 'pz', 'nz', 'py'] });
  for (let y = 7.45 + 6.8; y < 46; y += 6.8) b.box(x0 - 0.25, y, z0 - 0.25, x1 + 0.25, y + 0.3, z1 + 0.25, 'concrete', { color: [0.55, 0.5, 0.45], collide: false });
  // balconies on the south facade (one with laundry)
  for (let y = 3.85; y < 44; y += 3.4) for (const bxp of [cx - 4, cx + 5]) {
    b.box(bxp - 1.6, y - 0.2, z1, bxp + 1.6, y, z1 + 1.4, 'concrete', { color: [0.58, 0.55, 0.5], collide: y < 5 });
    b.box(bxp - 1.6, y, z1 + 1.33, bxp + 1.6, y + 1, z1 + 1.4, 'metal', { color: [0.3, 0.3, 0.3], collide: y < 5 });
  }
  // laundry line on the floor-2 balcony
  const lineY = 3.85 + 1.9;
  b.box(cx - 5.5, lineY, z1 + 1.1, cx - 2.5, lineY + 0.01, z1 + 1.11, 'rope', { collide: false, color: [0.8, 0.8, 0.75] });
  for (let i = 0; i < 4; i++) b.boxR(cx - 5.2 + i * 0.75, lineY - 0.35, z1 + 1.1, 0.55, 0.7, 0.01, 0, 'fabric', { color: [[0.7, 0.3, 0.25], [0.8, 0.8, 0.75], [0.3, 0.4, 0.55], [0.6, 0.6, 0.4]][i], rx: 0.05 * i });

  // lobby contents
  b.box(x0 + 0.4, 0.45, cz + 2, x0 + 0.8, 2.2, cz + 7, 'metal', { color: [0.45, 0.42, 0.35] }); // mailboxes
  sign(b, cx + 6, 2.2, z1 - 0.37, 2.6, 1.1, Math.PI, { lines: ['LINDEN COURT', 'RESIDENTS — PLEASE', 'REGISTER WITH HEALTH WARDEN'], bg: '#e5ddcc', fg: '#2a2a2a', font: 'bold 34px serif', border: '#2a2a2a', seed: 4 }, { signMaterial });
  sign(b, cx - 6, 1.9, z0 + 0.37, 1.6, 1.6, 0, { lines: ['X', '6 / 2'], bg: null, fg: '#c43e22', font: 'bold 96px sans-serif', spray: true, w: 256, h: 256, seed: 9 }, { signMaterial });
  b.boxR(cx + 3, 0.45 + 0.4, cz - 4, 2.2, 0.8, 0.9, 0.3, 'fabric', { color: [0.35, 0.3, 0.27], collide: true }); // sofa
  container(b, 'c:linden:lobby', 'gobag', cx - 7, 0.45, cz + 6, 0.4, [0.6, 0.45, 0.35], 'fabric', [0.3, 0.35, 0.3]);
  // basement
  container(b, 'c:linden:basement', 'toolbox', cx + 6, -3.1, cz + 5, 0, [0.6, 0.35, 0.35], 'metal', [0.6, 0.15, 0.1]);
  logItem(b, 'linden_02', cx - 2, -3.1, cz + 3, 0.6, 'note');
  // the flat
  b.box(x0 + 0.6, 3.85, z0 + 0.6, x0 + 2.6, 4.35, z0 + 2.8, 'fabric', { color: [0.55, 0.5, 0.45] }); // bed
  b.box(cx - 2, 3.85, cz - 6, cx, 4.6, cz - 5, 'wood', { color: [0.4, 0.3, 0.22] }); // table
  logItem(b, 'linden_01', cx - 1.2, 4.6, cz - 5.5, 0.3, 'recorder');
  container(b, 'c:linden:kitchen', 'cabinet', x1 - 4, 3.85, cz + 6, Math.PI, [1.6, 0.9, 0.6], 'wood', [0.55, 0.5, 0.42]);
  container(b, 'c:linden:wardrobe', 'wardrobe', x0 + 1, 3.85, cz + 2, Math.PI / 2, [1.2, 2, 0.6], 'wood', [0.45, 0.35, 0.28]);
  // children's drawing taped to a wall
  sign(b, x0 + 0.37, 5.4, cz - 4, 0.6, 0.45, Math.PI / 2, { lines: ['☀  OUR HOUSE', 'mum  me  ned'], bg: '#f2efe6', fg: '#3355aa', font: 'bold 40px sans-serif', seed: 3, w: 256, h: 192 }, { signMaterial });

  // debris drifting around the tower
  for (let i = 0; i < 10; i++) {
    const a = i * 0.7, r = 15 + (i % 3) * 3;
    inst.add(i % 3 ? 'plank' : 'barrelFloat', i % 3 ? 'woodFloat' : 'plasticFloat', cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r, { ry: a * 2, color: [0.6, 0.55, 0.5] });
  }
  // clutter: what people left when the water came
  const junk = [[cx - 3, 0.47, cz + 3, 'plank'], [cx - 2, 0.47, cz + 4, 'plank'], [cx + 1, 0.47, cz - 7, 'pallet'], [cx + 6, 0.47, cz - 2, 'mattress'], [cx - 8, 0.47, cz + 1, 'crate'], [cx + 4, 0.47, cz + 7, 'barrel'], [cx - 4, 3.87, cz + 6, 'chairFloat'], [cx + 2, 3.87, cz + 4, 'plank'], [cx - 6, 3.87, cz - 3, 'crate']];
  junk.forEach(([x, y, z, k], i) => inst.add(k, k === 'mattress' ? 'fabric' : k === 'barrel' ? 'plastic' : 'wood', x, y + (k === 'barrel' ? 0.45 : 0), z, { ry: i * 1.3, rz: k === 'chairFloat' ? 1.4 : 0, color: k === 'mattress' ? [0.45, 0.4, 0.33] : [0.45, 0.4, 0.34] }));
  for (let i = 0; i < 14; i++) b.boxR(cx - 8 + (i * 37 % 16), 0.455, cz - 8 + (i * 53 % 16), 0.21, 0.005, 0.29, i, 'fabric', { color: [0.7, 0.68, 0.6], collide: false }); // papers
  for (const im of inst.build(origin)) b.object(im);

  // mooring at the south breach — the boat starts here
  const moor = { pos: new THREE.Vector3(cx, 0, z1 + 3.6), step: new THREE.Vector3(cx, 0.46, z1 - 1.3), facing: 0 };
  b.interact({ kind: 'mooring', mode: 'boat', pos: moor.pos.clone().setY(0.8), radius: 9, requireLook: false, prompt: 'Tie up and climb in', onUse: (c) => c.boat.tieUp(moor) });
  ctx.state.startMooring = moor;
  return {
    group: b.build('Linden Court'), colliders: b.colliders, interactables: b.interactables,
    audio: [{ type: 'creak', pos: [cx, 20, z1], seed: 11 }, { type: 'drip', pos: [cx, -1, cz] }, { type: 'lap', pos: [cx, 0, z1 + 1] }],
    interiors: [[x0, -3.2, z0, x1, 7.2, z1]],
  };
}

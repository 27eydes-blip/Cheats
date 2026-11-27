import * as THREE from 'three';
import { Builder } from '../Builder.js';
import { InstanceBatch } from '../Props.js';
import { storey, container, logItem, sign, slabWithHole } from '../Architecture.js';
import { signMaterial } from '../Materials.js';

// Cask Street Station (Ferrow Line). A steel-and-glass head-house still stands
// above the waterline; below it the street caved into the concourse, and a
// train waits at the platform in the dark.
export function buildSubway(ctx, def) {
  const [cx, cz] = def.pos;
  const origin = new THREE.Vector3(cx, 0, cz);
  const b = new Builder(origin, { shadows: ctx.settings.q.shadows });
  const inst = new InstanceBatch();
  const steel = [0.28, 0.32, 0.3], tile = [0.62, 0.66, 0.6];
  // head-house: frame posts, glass panes (some broken), roof
  const hx0 = cx - 5, hx1 = cx + 5, hz0 = cz - 8, hz1 = cz + 4;
  for (const x of [hx0, cx, hx1]) for (const z of [hz0, cz - 2, hz1]) b.box(x - 0.15, -15, z - 0.15, x + 0.15, 4, z + 0.15, 'metal', { color: steel });
  b.box(hx0 - 0.6, 4, hz0 - 0.6, hx1 + 0.6, 4.4, hz1 + 0.6, 'metal', { color: steel });
  b.box(hx0 - 0.3, 4.4, hz0, hx1 + 0.3, 5.2, hz0 + 0.1, 'metal', { color: [0.12, 0.25, 0.4] });
  sign(b, cx, 4.8, hz0 - 0.02, 9.6, 0.75, Math.PI, { lines: [{ text: 'CASK STREET  ·  FERROW LINE', font: 'bold 60px sans-serif' }], bg: '#1d3f66', fg: '#f0f0ea', w: 1024, h: 96, seed: 41 }, { signMaterial });
  for (const [x0, x1, z0, z1] of [[hx0, cx, hz0, hz0], [cx, hx1, hz0, hz0], [hx0, hx0, hz0, cz - 2], [hx1, hx1, cz - 2, hz1]]) {
    for (let y = 0.6; y < 4; y += 1.7) {
      if ((x0 + y) % 3 < 1) continue; // broken pane
      if (z0 === z1) b.box(x0 + 0.2, y, z0 - 0.02, x1 - 0.2, y + 1.5, z0 + 0.02, 'glass', { collide: false });
      else b.box(x0 - 0.02, y, z0 + 0.2, x0 + 0.02, y + 1.5, z1 - 0.2, 'glass', { collide: false });
    }
  }
  // mezzanine landing inside the head-house at the waterline, with the stair void
  slabWithHole(b, hx0, hz0, hx1, hz1, 0.15, 0.45, cx - 1.8, cz - 6, cx + 1.8, hz1, 'metal', steel);
  b.box(hx0, 0.45, hz1 - 0.1, cx - 1.8, 1.45, hz1, 'metal', { color: steel }); // railing
  b.box(cx + 1.8, 0.45, hz1 - 0.1, hx1, 1.45, hz1, 'metal', { color: steel });
  const moor = { pos: new THREE.Vector3(hx1 + 2.6, 0, cz - 4), step: new THREE.Vector3(hx1 - 1.2, 0.46, cz - 4), facing: Math.PI / 2 };
  b.interact({ kind: 'mooring', mode: 'boat', pos: moor.pos.clone().setY(0.8), radius: 9, requireLook: false, prompt: 'Tie up at the station', onUse: (c) => c.boat.tieUp(moor) });
  // stairs down from street level (-7.5) into the concourse (-13.5), going +z
  b.stairs(cx, -13.5, cz - 6, 3.4, 6, 9, 'z-', 'concrete', { color: tile });
  // concourse box (roof caved in over the stairs)
  const c0x = cx - 14, c1x = cx + 14, c0z = cz + 3, c1z = cz + 16;
  storey(b, c0x, c0z, c1x, c1z, -13.5, -9.2, { color: tile, floorColor: [0.5, 0.52, 0.48], openings: { nz: [{ at: cx, w: 3.6, h: 4.3, bottom: 0 }], pz: [{ at: cx - 8, w: 4, h: 3.5, bottom: 0 }, { at: cx + 8, w: 4, h: 3.5, bottom: 0 }] } });
  slabWithHole(b, c0x, c0z, c1x, c1z, -9.2, -8.7, cx - 3, c0z, cx + 6, c0z + 5, 'concrete', [0.4, 0.42, 0.4]);
  // ticket barriers
  for (let i = -3; i <= 3; i++) b.box(cx + i * 1.6 - 0.15, -13.5, cz + 9, cx + i * 1.6 + 0.15, -12.5, cz + 10.2, 'metal', { color: [0.5, 0.52, 0.5] });
  sign(b, cx, -10.4, c0z + 0.36, 3.4, 0.9, 0, { lines: ['EVACUATION TRAINS', 'SUSPENDED UNTIL FURTHER NOTICE'], bg: '#111', fg: '#ffb43a', font: 'bold 34px monospace', seed: 42 }, { signMaterial });
  // platform hall + track bed
  const p0z = c1z, p1z = c1z + 12;
  storey(b, cx - 26, p0z, cx + 26, p1z, -13.5, -8.2, { color: [0.55, 0.6, 0.55], floor: false, openings: { nx: [{ at: p0z + 8, w: 5, h: 5, bottom: -1.5 }], px: [{ at: p0z + 8, w: 5, h: 5, bottom: -1.5 }], nz: [{ at: cx - 8, w: 4, h: 3.5, bottom: 0 }, { at: cx + 8, w: 4, h: 3.5, bottom: 0 }] } });
  b.box(cx - 26, -13.8, p0z, cx + 26, -13.5, p0z + 5, 'tile', { color: [0.55, 0.55, 0.5] }); // platform
  b.box(cx - 26, -15.4, p0z + 5, cx + 26, -15.0, p1z, 'concrete', { color: [0.3, 0.3, 0.28] }); // track bed
  b.box(cx - 26, -8.2, p0z, cx + 26, -7.8, p1z, 'concrete', { color: [0.35, 0.36, 0.34] }); // ceiling
  b.box(cx - 26.5, -15.4, p0z + 5.5, cx - 25.8, -9, p1z - 0.5, 'black', { collide: false }); // tunnel mouths into black
  b.box(cx + 25.8, -15.4, p0z + 5.5, cx + 26.5, -9, p1z - 0.5, 'black', { collide: false });
  // the train: two cars, doors open on the platform side
  const ty = -15, tz = p0z + 8.4;
  for (const [x0, x1] of [[cx - 22, cx - 2], [cx, cx + 20]]) {
    b.box(x0, ty + 0.4, tz - 1.5, x1, ty + 0.7, tz + 1.5, 'metal', { color: [0.5, 0.52, 0.55] }); // floor
    b.box(x0, ty + 3.6, tz - 1.5, x1, ty + 3.8, tz + 1.5, 'metal', { color: [0.6, 0.62, 0.64] }); // roof
    b.wall('x', x0, x1, tz + 1.45, ty + 0.7, ty + 3.6, 0.1, 'metal', [], { color: [0.62, 0.64, 0.66] });
    b.wall('x', x0, x1, tz - 1.45, ty + 0.7, ty + 3.6, 0.1, 'metal', [{ at: x0 + 4, w: 1.4, h: 2.1, bottom: 0 }, { at: x0 + 10, w: 1.4, h: 2.1, bottom: 0 }, { at: x0 + 16, w: 1.4, h: 2.1, bottom: 0 }], { color: [0.62, 0.64, 0.66] });
    b.box(x0 - 0.1, ty + 0.7, tz - 1.5, x0, ty + 3.6, tz + 1.5, 'metal', { color: [0.6, 0.15, 0.12] });
    b.box(x1, ty + 0.7, tz - 1.5, x1 + 0.1, ty + 3.6, tz + 1.5, 'metal', { color: [0.6, 0.15, 0.12] });
    for (let s = x0 + 1; s < x1 - 1; s += 3) b.box(s, ty + 0.7, tz + 0.6, s + 2, ty + 1.2, tz + 1.4, 'fabric', { color: [0.25, 0.3, 0.45] });
  }
  logItem(b, 'cask_01', cx - 12, ty + 1.2, tz + 1.0, 0.3, 'recorder');
  container(b, 'c:cask:staff', 'locker', cx + 12, -13.5, c1z - 1.5, Math.PI, [0.6, 1.8, 0.5], 'metal', [0.35, 0.4, 0.45]);
  container(b, 'c:cask:train', 'gobag', cx + 9, ty + 0.7, tz, 0, [0.6, 0.45, 0.35], 'fabric', [0.4, 0.3, 0.25]);
  logItem(b, 'cask_02', cx - 6, -13.5, cz + 6, 0.4, 'note');
  // glowing growths have begun to colonise the tunnel mouths
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? -1 : 1;
    inst.add('growth', 'glow', cx + side * (24 + (i % 3)), -14.5 + (i % 5) * 0.9, p0z + 6 + (i % 4) * 1.4, { s: 0.6 + (i % 3) * 0.4 });
  }
  // a memory pool: warm water full of voices
  b.interact({ id: 'memory:cask', kind: 'memory', pos: new THREE.Vector3(cx + 21, -13.4, p0z + 7), radius: 3.2, requireLook: false,
    prompt: (c) => (c.story.hasLog('memory_01') ? 'The warm water, still full of voices' : 'Touch the warm water'),
    onUse: (c) => { c.canvas.style.filter = 'sepia(.55) hue-rotate(160deg) saturate(.8)'; c.state.memoryFilter = true; c.story.openLog('memory_01'); c.audio?.play('chimeSwell'); } });
  for (const im of inst.build(origin)) b.object(im);
  return {
    group: b.build('Cask Street'), colliders: b.colliders, interactables: b.interactables,
    audio: [{ type: 'deepHum', pos: [cx, -12, p0z + 8] }, { type: 'drip', pos: [cx, 2, cz - 2] }, { type: 'lap', pos: [cx, 0, cz - 2] }],
    interiors: [[c0x, -16, c0z, c1x, -8, p1z], [cx - 26, -16, p0z, cx + 26, -7.8, p1z]],
  };
}

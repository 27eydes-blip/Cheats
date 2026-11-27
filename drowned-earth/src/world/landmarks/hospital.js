import * as THREE from 'three';
import { Builder } from '../Builder.js';
import { InstanceBatch } from '../Props.js';
import { storey, windowsAlong, container, logItem, sign, slabWithHole, ladder } from '../Architecture.js';
import { mat } from '../Materials.js';
import { G } from '../WorldShader.js';
import { signMaterial } from '../Materials.js';

// St. Aldren General. The ER at the waterline is open through the smashed
// entrance; Ward 9, the sealed quarantine wing, can only be reached through a
// second-floor window with a rope and hook.
export function buildHospital(ctx, def) {
  const [cx, cz] = def.pos;
  const origin = new THREE.Vector3(cx, 0, cz);
  const b = new Builder(origin, { shadows: ctx.settings.q.shadows });
  const inst = new InstanceBatch();
  const white = [0.78, 0.77, 0.72], dark = [0.36, 0.37, 0.35];
  const meta = [1, 0.2, 0.35, 0.7];
  const base = -9;
  // main block
  const mx0 = cx - 40, mx1 = cx + 20, mz0 = cz - 18, mz1 = cz + 12;
  b.box(mx0, base, mz0, mx1, 0.15, mz1, 'facade', { color: white, meta, faces: ['px', 'nx', 'pz', 'nz'] });
  const entr = cx - 10;
  storey(b, mx0, mz0, mx1, mz1, 0.45, 3.75, {
    color: [0.7, 0.7, 0.66], floorKey: 'tile', floorColor: [0.62, 0.64, 0.6],
    openings: { pz: [{ at: entr, w: 4.2, h: 2.8, bottom: 0 }, ...windowsAlong(mx0, mx1, 4.5, 2.0, 1.4, 1, [entr])], nz: windowsAlong(mx0, mx1, 4.5), nx: windowsAlong(mz0, mz1, 4.5),
      px: [{ at: cz - 3, w: 1.6, h: 2.2, bottom: 0 }] },
  });
  b.box(mx0, 3.75, mz0, mx1, 24.2, mz1, 'facade', { color: white, meta, faces: ['px', 'nx', 'pz', 'nz', 'py'] });
  for (let y = 7.15; y < 24; y += 3.4) b.box(mx0 - 0.2, y, mz0 - 0.2, mx1 + 0.2, y + 0.25, mz1 + 0.2, 'concrete', { color: [0.7, 0.7, 0.66], collide: false });
  // entrance canopy
  b.box(entr - 5, 3.2, mz1, entr + 5, 3.6, mz1 + 5, 'concrete', { color: white });
  for (const x of [entr - 4.6, entr + 4.6]) b.box(x - 0.2, base, mz1 + 4.4, x + 0.2, 3.2, mz1 + 4.8, 'concrete', { color: white });
  sign(b, entr, 4.2, mz1 + 5.02, 9, 1.1, 0, { lines: [{ text: 'ST. ALDREN GENERAL — EMERGENCY', font: 'bold 54px sans-serif' }], bg: '#e8e6e0', fg: '#8a1c14', w: 1024, h: 128, seed: 21 }, { signMaterial });
  // red cross on the roof + helipad ring
  b.box(cx - 12, 24.2, cz - 5, cx - 4, 24.25, cz - 3, 'concrete', { color: [0.6, 0.1, 0.08], collide: false });
  b.box(cx - 9, 24.2, cz - 8, cx - 7, 24.25, cz, 'concrete', { color: [0.6, 0.1, 0.08], collide: false });

  // ER interior
  b.box(entr - 4, 0.45, cz - 6, entr + 4, 1.55, cz - 5, 'wood', { color: [0.55, 0.5, 0.45] }); // reception desk
  for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) b.box(mx0 + 4 + i * 1.1, 0.45, cz + 2 + r * 2.4, mx0 + 4.8 + i * 1.1, 0.95, cz + 2.6 + r * 2.4, 'plastic', { color: [0.25, 0.4, 0.5] });
  for (let i = 0; i < 4; i++) b.boxR(cx + 2 + i * 3.2, 0.95, cz - 10 + (i % 2) * 2, 0.8, 0.12, 2, 0.2 * i, 'metal', { color: [0.7, 0.7, 0.68], collide: true }); // gurneys
  b.wall('z', mz0 + 0.35, mz1 - 0.35, cx + 0, 0.45, 3.75, 0.2, 'concrete', [{ at: cz - 8, w: 1.4, h: 2.2, bottom: 0 }, { at: cz + 6, w: 1.4, h: 2.2, bottom: 0 }], { color: [0.72, 0.72, 0.68] });
  // the sealed corridor to Ward 9: plastic sheeting + boards across the east door
  b.box(mx1 - 0.5, 0.45, cz - 4, mx1 - 0.35, 2.7, cz - 2, 'fabric', { color: [0.85, 0.85, 0.8] });
  for (let i = 0; i < 4; i++) b.boxR(mx1 - 0.6, 0.9 + i * 0.5, cz - 3, 0.05, 0.18, 2.4, 0, 'wood', { color: [0.55, 0.45, 0.32], rx: (i % 2 ? 0.25 : -0.2) });
  sign(b, mx1 - 0.66, 2.0, cz - 3, 1.6, 0.9, -Math.PI / 2, { lines: ['WARD 9', 'QUARANTINE — SEALED', 'BY ORDER OF H.H.A.'], bg: '#a8281f', fg: '#f3ece2', font: 'bold 38px sans-serif', border: '#f3ece2', seed: 31 }, { signMaterial });
  logItem(b, 'aldren_03', entr + 2.5, 1.55, cz - 5.5, 0.1, 'note');
  logItem(b, 'aldren_01', mx0 + 0.5, 1.4, cz - 6, Math.PI / 2, 'note');
  container(b, 'c:aldren:er1', 'medcab', mx0 + 1, 0.45, cz - 12, Math.PI / 2, [1.2, 1.8, 0.4], 'metal', [0.8, 0.8, 0.78]);
  container(b, 'c:aldren:er2', 'locker', cx - 3, 0.45, cz + 10, Math.PI, [0.6, 1.8, 0.5], 'metal', [0.4, 0.45, 0.5]);
  sign(b, cx - 28, 2.4, mz1 - 0.37, 2.4, 1.2, Math.PI, { lines: ['IF YOU HAVE A COUGH', 'AND NO VOICE', 'DO NOT WAIT HERE'], bg: '#fffdf2', fg: '#222', font: 'bold 36px sans-serif', border: '#a8281f', seed: 32 }, { signMaterial });

  // Ward 9 wing
  const wx0 = mx1, wx1 = mx1 + 22, wz0 = cz - 20, wz1 = cz + 10;
  // the wing's flooded basement, reached by a service shaft from the ward floor
  const sh = [wx0 + 14, wz1 - 4.6, wx0 + 16.6, wz1 - 2];
  b.box(wx0, base, wz0, wx1, -6.4, wz1, 'facade', { color: [0.7, 0.7, 0.65], meta, faces: ['px', 'nx', 'pz', 'nz'] });
  storey(b, wx0, wz0, wx1, wz1, -6.1, -0.4, { color: [0.3, 0.34, 0.32], floorKey: 'tile', floorColor: [0.25, 0.3, 0.28] });
  slabWithHole(b, wx0, wz0, wx1, wz1, -0.4, 3.55, ...sh, 'facade', [0.7, 0.7, 0.65]);
  for (const [x0, z0, x1, z1] of [[sh[0] - 0.2, sh[1] - 0.2, sh[2] + 0.2, sh[1]], [sh[0] - 0.2, sh[3], sh[2] + 0.2, sh[3] + 0.2], [sh[0] - 0.2, sh[1], sh[0], sh[3]], [sh[2], sh[1], sh[2] + 0.2, sh[3]]]) b.box(x0, -0.4, z0, x1, 3.55, z1, 'concrete', { color: [0.3, 0.32, 0.3] });
  ladder(b, (sh[0] + sh[2]) / 2, sh[1] + 0.3, -6.1, 3.85, 0, { id: 'w9shaft', prompt: 'Climb the shaft', topStep: new THREE.Vector3((sh[0] + sh[2]) / 2, 3.86, sh[1] - 1.2) });
  const winZ = cz - 5;
  storey(b, wx0, wz0, wx1, wz1, 3.85, 7.15, {
    hole: sh,
    color: [0.74, 0.74, 0.7], floorKey: 'tile', floorColor: [0.55, 0.6, 0.58],
    openings: { px: [{ at: winZ, w: 1.8, h: 1.7, bottom: 0.7 }], pz: windowsAlong(wx0, wx1, 4.5, 1.4, 1.2, 1.1), nz: windowsAlong(wx0, wx1, 4.5, 1.4, 1.2, 1.1) },
  });
  b.box(wx0, 7.15, wz0, wx1, 13.95, wz1, 'facade', { color: [0.7, 0.7, 0.65], meta, faces: ['px', 'nx', 'pz', 'nz', 'py'] });
  // quarantine markings on the wing exterior
  sign(b, wx1 + 0.02, 9.5, cz - 12, 4.5, 2.2, Math.PI / 2, { lines: ['QUARANTINE', 'WARD 9'], bg: null, fg: '#d8d2c2', font: 'bold 90px sans-serif', stencil: true, seed: 33 }, { signMaterial });
  sign(b, wx1 + 0.02, 2.0, cz + 3, 2.4, 2.4, Math.PI / 2, { lines: ['X', '31 / 0'], bg: null, fg: '#c43e22', font: 'bold 80px sans-serif', spray: true, w: 256, h: 256, seed: 34 }, { signMaterial });
  // ward beds with curtain rails
  for (let i = 0; i < 6; i++) {
    const bz = wz0 + 3 + i * 4.4;
    b.box(wx0 + 3, 3.85, bz, wx0 + 5, 4.5, bz + 1, 'metal', { color: [0.75, 0.75, 0.72] });
    b.box(wx0 + 3, 4.5, bz, wx0 + 5, 4.62, bz + 1, 'fabric', { color: [0.82, 0.82, 0.78], collide: false });
    if (i % 2) b.box(wx0 + 2.6, 4.0, bz - 0.9, wx0 + 5.4, 6.6, bz - 0.86, 'fabric', { color: [0.55, 0.65, 0.62], collide: false });
  }
  for (let i = 0; i < 3; i++) container(b, `c:aldren:w9:${i}`, i === 1 ? 'hhacrate' : 'medcab', wx1 - 3, 3.85, wz0 + 6 + i * 8, -Math.PI / 2, i === 1 ? [1.2, 0.8, 0.9] : [1.2, 1.8, 0.4], 'metal', i === 1 ? [0.86, 0.86, 0.82] : [0.78, 0.78, 0.76]);
  logItem(b, 'aldren_02', wx0 + 9, 4.6, cz + 2, 0.5, 'recorder');
  b.box(wx0 + 8, 3.85, cz + 1.5, wx0 + 10, 4.6, cz + 2.5, 'metal', { color: [0.6, 0.6, 0.58] });
  logItem(b, 'aldren_04', wx0 + 4, 4.63, wz0 + 3.5, 0, 'note');

  // grapple mooring under the Ward 9 window (east face)
  const moorPos = new THREE.Vector3(wx1 + 2.8, 0, winZ);
  const step = new THREE.Vector3(wx1 - 1.4, 3.86, winZ);
  b.interact({
    kind: 'mooring', mode: 'boat', pos: moorPos.clone().setY(0.8), radius: 9, requireLook: false,
    prompt: (c) => (c.inventory.has('rope_hook') ? 'Throw rope & hook to the window' : 'A window above, too high to reach'),
    onUse: (c) => {
      if (!c.inventory.has('rope_hook')) { c.ui.whisper('The window is three metres up. A rope with a hook would catch the frame.'); return; }
      c.boat.tieUp({ pos: moorPos, step: new THREE.Vector3(wx1 + 0.6, 0.2, winZ), facing: Math.PI / 2 });
      c.player.climb(new THREE.Vector3(wx1 + 0.6, 0.2, winZ), new THREE.Vector3(wx1 + 0.3, 4.3, winZ), step);
      c.story.setFlag('entered_ward9');
    },
  });
  // and back down from inside
  b.interact({ kind: 'ladder', pos: new THREE.Vector3(wx1 - 0.8, 4.8, winZ), radius: 2.2, prompt: 'Climb down the rope', onUse: (c) => c.player.climb(step, new THREE.Vector3(wx1 + 0.7, 0.3, winZ), c.boat.tied ? null : null, true) });
  // ER mooring at the smashed entrance
  const em = { pos: new THREE.Vector3(entr + 7, 0, mz1 + 3), step: new THREE.Vector3(entr, 0.46, mz1 - 1.5), facing: 0 };
  b.interact({ kind: 'mooring', mode: 'boat', pos: em.pos.clone().setY(0.8), radius: 10, requireLook: false, prompt: 'Tie up at the entrance', onUse: (c) => c.boat.tieUp(em) });

  // the basement: growth, a dim glow, a Bloomwalker, and Teo's tag
  const bx = wx0 + 5, bzc = cz - 8;
  for (let i = 0; i < 60; i++) {
    const a = i * 2.4, r = 1 + (i % 9) * 0.55;
    const onWall = i % 3 === 0;
    inst.add('growth', 'glow', onWall ? wx0 + 0.45 : bx + Math.cos(a) * r, onWall ? -5.5 + (i % 7) * 0.7 : -6.05 + (i % 2) * 0.1, onWall ? bzc + Math.sin(a) * 4 : bzc + Math.sin(a) * r, { s: 0.35 + (i % 4) * 0.25, ry: a });
  }
  for (let i = 0; i < 14; i++) inst.add('growth', 'glow', bx + (i % 5) - 2, -0.55, bzc + Math.floor(i / 5) - 1, { s: 0.3 + (i % 3) * 0.2, rx: Math.PI }); // hanging from the ceiling
  b.box(bx - 2, -6.1, bzc + 6, bx + 1, -5.3, bzc + 7, 'metal', { color: [0.5, 0.52, 0.5] }); // overturned bed
  b.interact({ id: 'log:teo_03', kind: 'log', pos: new THREE.Vector3(bx - 0.5, -5.6, bzc + 6.5), radius: 2.4,
    prompt: (c) => (c.story.hasLog('teo_03') ? 'Read the note again' : 'Something hangs on the bed frame: a dive tag'),
    onUse: (c) => { if (!c.inventory.has('teo_tag')) c.inventory.add('teo_tag', 1); c.story.openLog('teo_03'); c.events.emit('music:moment', 'discovery'); } });
  const gl = new THREE.PointLight(0x58ffd0, 0, 16, 1.6); gl.position.set(bx - origin.x, -4.5, bzc - origin.z); gl.layers.enableAll(); b.object(gl);
  const walker = bloomwalker();
  walker.position.set(bx + 6 - origin.x, -3.6, bzc + 2 - origin.z);
  b.object(walker);
  for (let i = 0; i < 12; i++) inst.add(i % 4 ? 'plank' : 'mattress', i % 4 ? 'woodFloat' : 'fabricFloat', cx - 30 + i * 5, 0, mz1 + 6 + (i % 3) * 4, { ry: i, color: [0.75, 0.72, 0.65] });
  // the ward as it was left: wheelchairs, med boxes, shelving (scanned)
  for (let i = 0; i < 9; i++) {
    const k = ['wheelchair', 'medicalBox', 'shelves', 'stool', 'trash', 'wheelchair', 'medicalBox', 'bucket', 'trash'][i];
    inst.add(k, 'metal', wx0 + 2 + ((i * 3.7) % Math.max(2, wx1 - wx0 - 4)), 3.85, wz0 + 2 + ((i * 5.3) % Math.max(2, wz1 - wz0 - 4)), { ry: i * 1.9 });
  }
  for (let i = 0; i < 6; i++) inst.add(['wheelchair', 'medicalBox', 'trash'][i % 3], 'metal', mx0 + 3 + i * 2.7, 0.47, mz0 + 2.5 + (i % 2) * 3, { ry: i * 2.3 });
  for (const im of inst.build(origin)) b.object(im);
  return {
    group: b.build('St Aldren'), colliders: b.colliders, interactables: b.interactables,
    audio: [{ type: 'creak', pos: [cx, 10, mz1], seed: 3 }, { type: 'drip', pos: [wx0 + 8, 5, cz] }, { type: 'hum', pos: [wx0 + 10, 5, cz - 5], freq: 50 }],
    interiors: [[mx0, 0, mz0, mx1, 3.8, mz1], [wx0, 3.8, wz0, wx1, 7.2, wz1], [wx0, -6.5, wz0, wx1, -0.3, wz1]],
    updaters: [(dt) => {
      const t = (walker.userData.t = (walker.userData.t || 0) + dt);
      walker.position.y = -3.6 + Math.sin(t * 0.4) * 0.25;
      walker.rotation.y = Math.sin(t * 0.13) * 0.6 + (ctx.input.held.sprint ? 0.4 : 0);
      walker.rotation.z = Math.sin(t * 0.21) * 0.15;
      const near = ctx.player.position.distanceTo(walker.getWorldPosition(new THREE.Vector3()));
      gl.intensity = (2.5 + Math.sin(t * 1.3) * 0.8 + G.uGlow.value * 5) * (near < 30 ? 1 : 0);
      if (near < 9 && !ctx.state.flags.saw_bloomwalker) { ctx.state.flags.saw_bloomwalker = true; ctx.ui.whisper('Someone is standing in the water. Was someone. The growth has made a lantern of them. They do not move toward you. Be quiet.'); ctx.events.emit('music:moment', 'dread'); }
    }],
  };
}

// A drowned figure overgrown with glow. Still, upright, uncanny; never gory.
function bloomwalker() {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x1c2624, roughness: 0.9 });
  const glow = mat('glow');
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.6, 4, 8), body); torso.position.y = 1.1;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), body); head.position.y = 1.65; head.rotation.x = 0.4;
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.7, 4, 6), body); legs.position.y = 0.45;
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.6, 3, 5), body); armL.position.set(-0.3, 1.0, 0.1); armL.rotation.z = 0.2;
  const armR = armL.clone(); armR.position.x = 0.3; armR.rotation.z = -0.25; armR.rotation.x = -0.4;
  g.add(torso, head, legs, armL, armR);
  for (let i = 0; i < 16; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.05 + (i % 3) * 0.03, 5, 4), glow);
    const a = i * 2.1; p.position.set(Math.cos(a) * 0.22, 0.4 + (i / 16) * 1.35, Math.sin(a) * 0.2);
    g.add(p);
  }
  return g;
}

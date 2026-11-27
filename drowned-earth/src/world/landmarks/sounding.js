import * as THREE from 'three';
import { Builder } from '../Builder.js';
import { InstanceBatch } from '../Props.js';
import { G } from '../WorldShader.js';
import { LAYER_FX } from '../../render/Pipeline.js';

// The Sounding: a plaza that collapsed into something much deeper. The
// Unmoored ringed it with buoys. At the bottom, a structure no one built.
export function buildSounding(ctx, def) {
  const [cx, cz] = def.pos;
  const origin = new THREE.Vector3(cx, 0, cz);
  const b = new Builder(origin, { shadows: false });
  const inst = new InstanceBatch();
  const wm = ctx.worldMap;
  const updaters = [];
  // broken street slabs tipping into the pit
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.2;
    const r = def.clear - 6 + (i % 3) * 3;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    b.boxR(x, wm.seabedAt(x, z) + 1, z, 8, 0.6, 5, -a, 'asphalt', { color: [0.5, 0.5, 0.48], rx: 0.5 + (i % 4) * 0.15, collide: false });
  }
  // the deep structure: a ring of ribbed monoliths around a dark aperture
  const deepY = -76;
  const ringR = 16;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    b.boxR(cx + Math.cos(a) * ringR, deepY + 9, cz + Math.sin(a) * ringR, 2.2, 22, 4.5, -a, 'obsidian', { collide: false, rz: 0.12 * Math.sin(i * 1.7), color: [0.5, 0.55, 0.55] });
  }
  b.box(cx - 12, deepY - 1, cz - 12, cx + 12, deepY, cz + 12, 'obsidian', { collide: false, color: [0.4, 0.45, 0.45] });
  // light veins on the structure: a separate material so the finale can drive it
  const veinMat = new THREE.MeshBasicMaterial({ color: 0x3affd0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: true });
  const veins = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.25, 20, 0.25), veinMat);
    m.position.set(Math.cos(a) * (ringR - 1.2), deepY + 9, Math.sin(a) * (ringR - 1.2));
    veins.add(m);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(10, 0.35, 6, 48), veinMat);
  ring.rotation.x = Math.PI / 2; ring.position.y = deepY + 0.3;
  veins.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(5, 0.25, 6, 32), veinMat);
  ring2.rotation.x = Math.PI / 2; ring2.position.y = deepY + 0.3;
  veins.add(ring2);
  veins.traverse((o) => o.layers.set(LAYER_FX));
  b.object(veins);
  const veinLight = new THREE.PointLight(0x3affd0, 0, 140, 1.2);
  veinLight.position.set(0, deepY + 8, 0);
  veinLight.layers.enableAll();
  b.object(veinLight);
  // bioluminescent growths down the pit walls, pulsing
  for (let i = 0; i < 70; i++) {
    const a = i * 2.399, r = 14 + (i % 7) * 4.5;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const y = wm.seabedAt(x, z);
    if (y > -18) continue;
    inst.add('growth', 'glow', x, y + 0.2, z, { s: 0.5 + (i % 4) * 0.35, ry: a });
  }
  // buoys of the Unmoored around the rim, with blinking lamps
  const buoyMat = new THREE.MeshStandardMaterial({ color: 0xb8482a, roughness: 0.6 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xff5a3a });
  const buoys = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.6, 10), buoyMat);
    body.position.y = 0.2;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 4), buoyMat);
    mast.position.y = 1.6;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), lampMat);
    lamp.position.y = 2.45;
    g.add(body, mast, lamp);
    g.position.set(Math.cos(a) * (def.clear - 2), 0, Math.sin(a) * (def.clear - 2));
    buoys.push({ g, lamp, x: cx + g.position.x, z: cz + g.position.z, phase: i * 0.37 });
    b.object(g);
  }
  // the marker buoy with the hydrophone (story)
  const marker = buoys[0];
  b.interact({
    id: 'sounding:buoy', kind: 'buoy', mode: 'any', radius: 9, requireLook: false,
    pos: new THREE.Vector3(marker.x, 1.2, marker.z),
    prompt: (c) => (c.story.flag('finale_done') ? '' : c.story.flag('signal_decoded') ? 'Lower the hydrophone' : 'Read the plaque on the buoy'),
    enabled: (c) => !c.story.flag('finale_done'),
    onUse: (c) => (c.story.flag('signal_decoded') ? c.story.startFinale() : c.story.openLog('sounding_01')),
  });
  for (const im of inst.build(origin)) b.object(im);
  const group = b.build('The Sounding');
  let t = 0;
  updaters.push((dt) => {
    t += dt;
    for (const bu of buoys) {
      const h = ctx.waves.height(bu.x, bu.z);
      bu.g.position.y = h - 0.2;
      bu.g.rotation.z = Math.sin(t * 0.9 + bu.phase * 5) * 0.08;
      bu.lamp.visible = Math.sin(t * 2.2 + bu.phase * 7) > 0.6;
    }
    const glow = G.uGlow.value;
    veinMat.opacity = Math.min(1, glow * 1.2 + 0.03 * (0.5 + 0.5 * Math.sin(t * 0.4)));
    veinLight.intensity = glow * 2500;
  });
  return { group, colliders: b.colliders, interactables: b.interactables, updaters, audio: [{ type: 'deepHum', pos: [cx, -40, cz], gain: 1.4 }] };
}

export function buildVesper(ctx, def) {
  const [cx, cz] = def.pos;
  const origin = new THREE.Vector3(cx, 0, cz);
  const b = new Builder(origin, { shadows: ctx.settings.q.shadows });
  const col = [0.48, 0.47, 0.5], meta = [1, 0.6, 0.5, 0.31];
  b.box(cx - 7, -9, cz - 7, cx + 7, 71.85, cz + 7, 'facade', { color: col, meta, faces: ['px', 'nx', 'pz', 'nz', 'py'] });
  for (let y = 10.65; y < 70; y += 10.2) b.box(cx - 7.3, y, cz - 7.3, cx + 7.3, y + 0.3, cz + 7.3, 'concrete', { color: [0.42, 0.42, 0.44], collide: false });
  // the lone window, floor 9, east face
  const wy = 30.9;
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.25), new THREE.MeshBasicMaterial({ color: 0xffc27a }));
  pane.position.set(7.02, wy, 2.2);
  pane.rotation.y = Math.PI / 2;
  b.object(pane);
  const light = new THREE.PointLight(0xffb070, 0, 40, 1.5);
  light.position.set(8.5, wy, 2.2);
  light.layers.enableAll();
  b.object(light);
  // ledge + note at the waterline
  b.box(cx + 7, -0.4, cz - 3, cx + 9, 0.35, cz + 3, 'concrete', { color: [0.4, 0.4, 0.4] });
  b.interact({ kind: 'mooring', mode: 'boat', pos: new THREE.Vector3(cx + 11, 0.8, cz), radius: 9, requireLook: false, prompt: 'Tie up at the ledge', onUse: (c) => c.boat.tieUp({ pos: new THREE.Vector3(cx + 11.2, 0, cz), step: new THREE.Vector3(cx + 8, 0.36, cz), facing: Math.PI / 2 }) });
  b.interact({ id: 'log:vesper_01', kind: 'log', pos: new THREE.Vector3(cx + 7.6, 0.6, cz + 2), radius: 2.4, prompt: (c) => (c.story.hasLog('vesper_01') ? 'Read again' : 'Read the words scratched into the wall'), onUse: (c) => c.story.openLog('vesper_01') });
  let t = 0;
  return {
    group: b.build('Vesper House'), colliders: b.colliders, interactables: b.interactables,
    updaters: [(dt) => {
      t += dt;
      const night = G.uNight.value;
      const flick = 0.85 + 0.15 * Math.sin(t * 7.3) * Math.sin(t * 2.1);
      light.intensity = night * 40 * flick;
      pane.material.color.setRGB(1 * (0.15 + night * flick), 0.76 * (0.15 + night * flick), 0.48 * (0.15 + night * flick));
    }],
  };
}

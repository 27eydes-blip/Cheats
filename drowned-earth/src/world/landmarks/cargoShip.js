import * as THREE from 'three';
import { Builder } from '../Builder.js';
import { container, logItem, sign, ladder, slabWithHole } from '../Architecture.js';
import { signMaterial } from '../Materials.js';
import { InstanceBatch } from '../Props.js';

// MV Calla Morrow: a container ship that drifted into the district during the
// Rise and ran aground. Built in local space and placed with rotation; its
// collision is a dynamic body so it can lean and sit at any angle.
export function buildCargoShip(ctx, def) {
  const b = new Builder(new THREE.Vector3(), { shadows: ctx.settings.q.shadows });
  const hull = [0.32, 0.12, 0.1], hullTop = [0.22, 0.24, 0.26], deckC = [0.35, 0.36, 0.33];
  const W = 10, L = 56, deck = 8.5, keel = -9;
  // hull sections (bow tapers toward -z); the forward hold is hollow and flooded
  const hz0 = -L + 19, hz1 = -L + 30;
  b.box(-W, keel, -L + 18, W, deck, hz0, 'rust', { color: hull });
  b.box(-W, keel, hz1, W, deck - 3, L, 'rust', { color: hull });
  b.box(-W, deck - 3, hz1, W, deck, L, 'rust', { color: hullTop });
  b.box(-W, keel, hz0, W, -6, hz1, 'rust', { color: hull });
  b.box(-W, -6, hz0, -8, deck, hz1, 'rust', { color: hull });
  b.box(8, -6, hz0, W, deck, hz1, 'rust', { color: hull });
  slabWithHole(b, -8, hz0, 8, hz1, deck - 0.5, deck, -2.5, hz0 + 3, 2.5, hz1 - 3, 'rust', hullTop);
  for (let i = 0; i < 4; i++) {
    const w = W * (1 - (i + 1) * 0.21), z0 = -L + 18 - (i + 1) * 4.5, z1 = z0 + 4.5;
    b.box(-w, keel + i * 1.5, z0, w, deck + 0.6 * (i + 1), z1, 'rust', { color: i ? hullTop : hull, collide: true });
  }
  b.box(-W, deck, -L + 18, W, deck + 0.05, L, 'metal', { color: deckC, collide: false });
  // bulwarks
  b.box(-W, deck, -L + 18, -W + 0.2, deck + 1.1, L, 'rust', { color: hullTop });
  b.box(W - 0.2, deck, -L + 18, W, deck + 1.1, L, 'rust', { color: hullTop });
  // name on the hull
  sign(b, W + 0.03, deck - 2, -20, 14, 2, Math.PI / 2, { lines: [{ text: 'CALLA MORROW', font: 'bold 120px serif' }], bg: null, fg: '#d9d4c4', w: 1024, h: 160, seed: 51 }, { signMaterial });
  sign(b, -W - 0.03, deck - 2, -20, 14, 2, -Math.PI / 2, { lines: [{ text: 'CALLA MORROW', font: 'bold 120px serif' }], bg: null, fg: '#d9d4c4', w: 1024, h: 160, seed: 52 }, { signMaterial });
  // superstructure at the stern: 4 decks, bridge on top with wings
  const s0 = 34, s1 = 50;
  b.box(-8, deck, s0, 8, deck + 9, s1, 'facade', { color: [0.82, 0.8, 0.74], meta: [1, 0.9, 0.2, 0.2] });
  // bridge: hollow room
  const by = deck + 9;
  b.box(-9, by - 0.3, s0, 9, by, s0 + 8, 'metal', { color: [0.5, 0.5, 0.48] });
  b.wall('x', -9, 9, s0 + 0.15, by, by + 3, 0.3, 'facade', [{ at: -5, w: 3, h: 1.2, bottom: 1.1 }, { at: 0, w: 3, h: 1.2, bottom: 1.1 }, { at: 5, w: 3, h: 1.2, bottom: 1.1 }], { color: [0.82, 0.8, 0.74] });
  b.wall('x', -9, 9, s0 + 7.85, by, by + 3, 0.3, 'facade', [{ at: 6, w: 1, h: 2.1, bottom: 0 }], { color: [0.82, 0.8, 0.74] });
  b.wall('z', s0 + 0.3, s0 + 7.7, -8.85, by, by + 3, 0.3, 'facade', [], { color: [0.82, 0.8, 0.74] });
  b.wall('z', s0 + 0.3, s0 + 7.7, 8.85, by, by + 3, 0.3, 'facade', [], { color: [0.82, 0.8, 0.74] });
  b.box(-9, by + 3, s0, 9, by + 3.3, s0 + 8, 'metal', { color: [0.6, 0.6, 0.58] });
  b.box(-6, by, s0 + 1, 6, by + 1.1, s0 + 1.8, 'metal', { color: [0.25, 0.27, 0.27] }); // console
  b.box(3, by, s0 + 4, 5, by + 1, s0 + 5.5, 'wood', { color: [0.4, 0.3, 0.2] }); // chart table
  logItem(b, 'calla_01', 4, by + 1, s0 + 4.7, 0.2, 'note');
  container(b, 'c:calla:bridge', 'locker', -7.5, by, s0 + 6.5, 0, [0.6, 1.8, 0.5], 'metal', [0.45, 0.5, 0.45]);
  // funnel + mast
  b.box(-2.5, by + 3.3, s1 - 6, 2.5, by + 9, s1 - 2, 'metal', { color: [0.2, 0.25, 0.32] });
  b.box(-0.15, by + 3.3, s0 + 3, 0.15, by + 12, s0 + 3.3, 'metal', { color: [0.6, 0.6, 0.58], collide: false });
  // external stair from deck to bridge (port side, going +z... switchbacks simplified as one long flight)
  b.stairs(-6.5, deck, s0 - 9.5, 2, 9, 9.5, 'z+', 'metal', { color: [0.45, 0.47, 0.45] });
  b.box(-7.5, by - 0.3, s0 - 0.5, -5.5, by, s0, 'metal', { color: [0.45, 0.47, 0.45] });
  // containers: stacks across the deck, some toppled overboard
  const cols = [[0.55, 0.2, 0.12], [0.18, 0.32, 0.5], [0.7, 0.55, 0.15], [0.25, 0.42, 0.28], [0.55, 0.55, 0.52], [0.4, 0.15, 0.18]];
  let k = 0;
  for (let z = -36; z < 30; z += 6.4) {
    for (let x = -8; x <= 5.6; x += 2.6) {
      const h = (Math.abs(Math.sin(x * 3.1 + z * 1.7)) * 3.2) | 0;
      for (let lvl = 0; lvl < h; lvl++) {
        const y = deck + lvl * 2.6;
        b.box(x, y, z, x + 2.45, y + 2.55, z + 6.05, 'container', { color: cols[(k++) % cols.length] });
      }
    }
  }
  // the open container with the manifest + Highmark-sealed crates
  const ox = 5.6 + 0.3, oz = -10;
  b.box(ox, deck, oz, ox + 2.45, deck + 0.05, oz + 6.05, 'metal', { color: [0.3, 0.3, 0.3], collide: false });
  b.wall('z', oz, oz + 6.05, ox + 0.05, deck, deck + 2.55, 0.1, 'container', [], { color: [0.7, 0.55, 0.15] });
  b.wall('z', oz, oz + 6.05, ox + 2.4, deck, deck + 2.55, 0.1, 'container', [], { color: [0.7, 0.55, 0.15] });
  b.box(ox, deck + 2.5, oz, ox + 2.45, deck + 2.6, oz + 6.05, 'container', { color: [0.7, 0.55, 0.15] });
  b.box(ox, deck, oz + 6.0, ox + 2.45, deck + 2.55, oz + 6.05, 'container', { color: [0.7, 0.55, 0.15] });
  container(b, 'c:calla:hm', 'hhacrate', ox + 1.2, deck, oz + 4.5, 0, [1.4, 0.8, 1], 'wood', [0.75, 0.72, 0.65]);
  logItem(b, 'calla_02', ox + 1.2, deck + 0.85, oz + 4.5, 0.4, 'note');
  b.box(-8, -6, hz0, 8, -5.6, hz1, 'rust', { color: [0.2, 0.18, 0.16] });
  container(b, 'c:calla:hold', 'hhacrate', 4, -5.6, hz0 + 3, 0.3, [1.4, 0.8, 1], 'wood', [0.75, 0.72, 0.65]);
  logItem(b, 'calla_03', -4, -5.6, hz1 - 2, 0.6, 'recorder');
  // pilot ladder on the starboard side
  ladder(b, W + 0.35, 10, -0.8, deck + 0.5, Math.PI / 2, { id: 'calla', topStep: new THREE.Vector3(W - 1.2, deck + 0.05, 10), bottomStep: null });
  // hatch: drop into the hold
  // hatch ladder down into the flooded hold
  ladder(b, 0, hz0 + 3.3, -4, deck, 0, { id: 'calla:hold', prompt: 'Climb out of the hold', topStep: new THREE.Vector3(0, deck + 0.05, hz0 + 1.6), bottomStep: null });

  // deck dressing (scanned): a lifeboat left in its davits, buoys on the rails, crew stores
  const inst = new InstanceBatch();
  inst.add('rowboat', 'wood', -W + 1.8, deck + 2.2, L - 14, { ry: 0, rz: 0.12 });
  for (let i = 0; i < 6; i++) inst.add('lifebuoy', 'plastic', (i % 2 ? W - 0.35 : -W + 0.35), deck + 0.5, -L + 24 + i * 12, { ry: 0 });
  for (let i = 0; i < 10; i++) inst.add(['crate', 'jerrycan', 'barrel', 'propane', 'trash'][i % 5], 'metal', -W + 2 + ((i * 7.3) % (2 * W - 4)), deck + (i % 5 === 2 ? 0.45 : 0.05), L - 6 - (i % 4) * 2.2, { ry: i * 1.3 });
  for (const im of inst.build(new THREE.Vector3(), { dynamic: true, shadows: ctx.settings.q.shadows })) b.object(im);
  const group = b.build('Calla Morrow');
  const [px, pz] = def.pos;
  group.position.set(px, 0, pz);
  group.rotation.set(0, def.rot, 0.045);
  group.updateMatrixWorld(true);
  // convert local colliders to a dynamic body; interactable positions to world
  const boxes = b.colliders.map(([minX, minY, minZ, maxX, maxY, maxZ, tag]) => ({ minX, minY, minZ, maxX, maxY, maxZ, tag }));
  const body = ctx.collision.addBody(group, boxes, 'metal');
  body.radius = 90;
  const toW = (v) => v.clone().applyMatrix4(group.matrixWorld);
  for (const it of b.interactables) {
    if (it.pos?.isVector3) it.pos = toW(it.pos);
    if (it.kind === 'ladder') {
      const orig = it.onUse;
      // ladder endpoints were captured in local space; wrap to transform them
      it.onUse = (c) => {
        const p = c.player;
        const realClimb = p.climb.bind(p);
        p.climb = (a, bb, st, down) => realClimb(toW(a), toW(bb), st ? toW(st) : st, down);
        try { orig(c); } finally { p.climb = realClimb; }
      };
    }
  }
  // mooring at the pilot ladder
  const moorLocal = new THREE.Vector3(W + 2.8, 0, 10);
  const mp = toW(moorLocal);
  const ladderFoot = toW(new THREE.Vector3(W + 0.35, -0.8, 10));
  const top = toW(new THREE.Vector3(W - 1.2, deck + 0.1, 10));
  b.interactables.push({
    kind: 'mooring', mode: 'boat', pos: mp.clone().setY(0.8), radius: 10, requireLook: false, prompt: 'Tie up at the pilot ladder',
    onUse: (c) => { c.boat.tieUp({ pos: mp, step: ladderFoot.clone().setY(0.3), facing: def.rot + Math.PI / 2 }); c.player.climb(ladderFoot.clone().setY(0.3), toW(new THREE.Vector3(W + 0.35, deck + 0.5, 10)), top); },
  });
  return {
    group, colliders: [], interactables: b.interactables, bodies: [body],
    audio: [{ type: 'creak', pos: [px, 6, pz], seed: 61, heavy: true }, { type: 'creak', pos: toW(new THREE.Vector3(0, 12, 40)).toArray(), seed: 62 }, { type: 'lap', pos: mp.toArray() }],
  };
}

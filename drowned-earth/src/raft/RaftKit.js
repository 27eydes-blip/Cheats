import * as THREE from 'three';
import { RNG } from '../core/rng.js';

// Geometry builders for raft pieces (floats + decks) and deck structures.
// Everything is emitted into a Builder in the raft's local space.
export function buildPiece(b, def, x, z, ry, rng) {
  const [sx, sz] = def.size;
  const c = Math.cos(ry), s = Math.sin(ry);
  const rot = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const hw = sx / 2, hd = sz / 2;
  // with rotation we only support 0/90° for colliders: swap extents
  const swap = Math.abs(Math.sin(ry)) > 0.7;
  const ex = swap ? hd : hw, ez = swap ? hw : hd;
  const deck = def.deck, draft = def.draft;
  if (def.look === 'steelHull') {
    b.box(x - ex, -draft, z - ez, x + ex, deck - 0.1, z + ez, 'rust', { color: def.hullColor, collide: false });
    b.box(x - ex - 0.05, 0.05, z - ez - 0.05, x + ex + 0.05, 0.25, z + ez + 0.05, 'metal', { color: [0.12, 0.12, 0.1], collide: false }); // rubbing strake
  } else if (def.look === 'rig') {
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(x + lx * (ex - 1) - 0.9, -draft, z + lz * (ez - 1) - 0.9, x + lx * (ex - 1) + 0.9, deck - 0.4, z + lz * (ez - 1) + 0.9, 'rust', { color: def.hullColor, collide: false });
    b.box(x - ex, deck - 0.5, z - ez, x + ex, deck - 0.1, z + ez, 'metal', { color: [0.3, 0.3, 0.28], collide: false });
    // railing
    for (const side of [-1, 1]) {
      b.box(x - ex, deck, z + side * ez - 0.03, x + ex, deck + 1.05, z + side * ez + 0.03, 'metal', { color: [0.65, 0.5, 0.15], collide: false, faces: ['pz', 'nz'] });
    }
  } else if (def.look === 'drums') {
    const n = Math.max(2, Math.round(ex / 1.1));
    const m = Math.max(2, Math.round(ez / 1.1));
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      const dx = x - ex + (i + 0.5) * (2 * ex / n), dz = z - ez + (j + 0.5) * (2 * ez / m);
      const col = rng.chance(0.3) ? [0.65, 0.6, 0.5] : def.hullColor;
      b.boxR(dx, -0.05, dz, 0.55, 0.55, 0.85, rng.range(-0.1, 0.1), 'plastic', { color: col });
    }
    b.box(x - ex, deck - 0.3, z - ez, x + ex, deck - 0.18, z + ez, 'wood', { color: [0.35, 0.3, 0.24], collide: false });
  } else if (def.look === 'boatHull') {
    b.box(x - ex, -draft, z - ez, x + ex, deck - 0.12, z + ez, 'plastic', { color: def.hullColor, collide: false });
    b.box(x - ex + 0.3, -draft - 0.3, z - ez + 0.3, x + ex - 0.3, -draft, z + ez - 0.3, 'plastic', { color: [0.5, 0.2, 0.15], collide: false });
  }
  // deck surface (collider). Planks get per-plank color variation.
  if (def.deckKey === 'wood') {
    const along = ex > ez;
    const count = Math.round((along ? 2 * ez : 2 * ex) / 0.3);
    for (let i = 0; i < count; i++) {
      const t = -1 + (2 * (i + 0.5)) / count;
      const v = 0.8 + rng.next() * 0.35;
      const col = def.deckColor.map((q) => q * v);
      if (along) b.box(x - ex, deck - 0.12, z + t * ez - 0.14, x + ex, deck - (rng.next() * 0.02), z + t * ez + 0.13, 'wood', { color: col, collide: false });
      else b.box(x + t * ex - 0.14, deck - 0.12, z - ez, x + t * ex + 0.13, deck - (rng.next() * 0.02), z + ez, 'wood', { color: col, collide: false });
    }
    b.collider(x - ex, deck - 0.5, z - ez, x + ex, deck, z + ez, 'wood');
  } else {
    b.box(x - ex, deck - 0.12, z - ez, x + ex, deck, z + ez, def.deckKey, { color: def.deckColor, uvWorld: true, collide: false });
    b.collider(x - ex, deck - 0.5, z - ez, x + ex, deck, z + ez, def.deckKey === 'asphalt' ? 'concrete' : 'metal');
  }
  return { x0: x - ex, x1: x + ex, z0: z - ez, z1: z + ez, deck };
}

// Returns extra info (lantern positions, smoke sources, npc spots)
export function buildStructure(b, st, deck, rng, out) {
  const { x, z } = st;
  const ry = st.ry || 0;
  const col = st.color || [0.5, 0.5, 0.48];
  const y = deck;
  switch (st.type) {
    case 'shack': {
      b.boxR(x, y + 1.3, z, 4.6, 2.6, 2.4, ry, 'wood', { color: col, collide: true });
      b.boxR(x, y + 2.7, z, 5.2, 0.12, 3.0, ry, 'container', { color: [0.45, 0.4, 0.33], rx: 0.08 });
      b.boxR(x + Math.sin(ry) * 1.21, y + 1.0, z + Math.cos(ry) * 1.21, 0.9, 1.9, 0.05, ry, 'black', {});
      out.spots.push({ x: x + Math.sin(ry) * 2, z: z + Math.cos(ry) * 2, kind: 'door' });
      break;
    }
    case 'container': {
      b.boxR(x, y + 1.3, z, 6, 2.6, 2.45, ry, 'container', { color: col, collide: true });
      b.boxR(x - 3.01, y + 1.3, z, 0.05, 2.4, 2.2, ry, 'rust', { color: col.map((c) => c * 0.7) });
      out.spots.push({ x: x, z: z + 2, kind: 'container' });
      break;
    }
    case 'stall': {
      for (const [px, pz] of [[-1.4, -0.9], [1.4, -0.9], [-1.4, 0.9], [1.4, 0.9]]) b.box(x + px - 0.05, y, z + pz - 0.05, x + px + 0.05, y + 2.3, z + pz + 0.05, 'wood', { color: [0.4, 0.33, 0.25], collide: false });
      b.boxR(x, y + 2.35, z, 3.2, 0.06, 2.2, ry, 'fabric', { color: col, rx: 0.12 });
      b.boxR(x, y + 0.45, z - 0.5, 2.8, 0.9, 0.8, ry, 'wood', { color: [0.45, 0.36, 0.27], collide: true });
      for (let i = 0; i < 7; i++) { const gx = x - 1.15 + i * 0.36; const h = 0.12 + rng.next() * 0.16; b.box(gx, y + 0.9, z - 0.68, gx + 0.2, y + 0.9 + h, z - 0.48, rng.chance(0.5) ? 'fabric' : 'plastic', { color: rng.pick([[0.42, 0.38, 0.3], [0.25, 0.32, 0.22], [0.45, 0.3, 0.18], [0.3, 0.32, 0.36], [0.5, 0.48, 0.42]]), collide: false }); }
      out.spots.push({ x, z: z + 0.6, kind: 'stall' });
      out.stalls.push({ x, z: z + 0.6 });
      break;
    }
    case 'garden': {
      b.box(x - 1.8, y, z - 0.7, x + 1.8, y + 0.5, z + 0.7, 'wood', { color: [0.4, 0.32, 0.24] });
      b.box(x - 1.7, y + 0.5, z - 0.6, x + 1.7, y + 0.55, z + 0.6, 'mud', { color: [0.3, 0.25, 0.18], collide: false });
      for (let i = 0; i < 7; i++) out.plants.push([x - 1.5 + i * 0.5, y + 0.55, z + rng.range(-0.3, 0.3)]);
      out.spots.push({ x, z: z + 1.1, kind: 'garden' });
      break;
    }
    case 'rain': {
      b.box(x - 0.4, y, z - 0.4, x + 0.4, y + 1.0, z + 0.4, 'plastic', { color: [0.25, 0.35, 0.6] });
      b.boxR(x, y + 2.0, z, 2.2, 0.03, 2.2, 0.3, 'fabric', { color: [0.3, 0.45, 0.55], rx: 0.25, rz: 0.2 });
      for (const [px, pz] of [[-1, -1], [1, 1]]) b.box(x + px - 0.04, y, z + pz - 0.04, x + px + 0.04, y + 2.1, z + pz + 0.04, 'wood', { color: [0.4, 0.33, 0.25], collide: false });
      break;
    }
    case 'generator': {
      b.box(x - 0.8, y, z - 0.5, x + 0.8, y + 0.9, z + 0.5, 'metal', { color: [0.5, 0.42, 0.2] });
      b.box(x + 0.5, y + 0.9, z - 0.1, x + 0.6, y + 1.8, z, 'metal', { color: [0.2, 0.2, 0.2], collide: false });
      out.smoke.push({ x: x + 0.55, y: y + 1.9, z: z - 0.05, kind: 'exhaust' });
      out.sounds.push({ type: 'generator', x, y: y + 0.5, z });
      break;
    }
    case 'tank': {
      b.box(x - 1, y, z - 1, x + 1, y + 2, z + 1, 'plastic', { color: [0.75, 0.75, 0.7] });
      break;
    }
    case 'workbench': {
      b.box(x - 1.2, y, z - 0.5, x + 1.2, y + 0.95, z + 0.5, 'wood', { color: [0.5, 0.4, 0.3] });
      b.box(x - 1.0, y + 0.95, z - 0.3, x - 0.3, y + 1.15, z + 0.2, 'metal', { color: [0.6, 0.15, 0.1], collide: false });
      out.spots.push({ x, z: z + 1, kind: 'workbench' });
      out.workbench = { x, y: y + 1, z };
      break;
    }
    case 'tower': {
      const h = 8;
      for (const [px, pz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) b.box(x + px - 0.1, y, z + pz - 0.1, x + px + 0.1, y + h, z + pz + 0.1, 'metal', { color: [0.5, 0.48, 0.42] });
      for (let k = 2; k < h; k += 2) b.box(x - 1.45, y + k, z - 1.45, x + 1.45, y + k + 0.08, z - 1.35, 'metal', { color: [0.45, 0.43, 0.38], collide: false });
      b.box(x - 2, y + h, z - 2, x + 2, y + h + 0.15, z + 2, 'wood', { color: [0.45, 0.38, 0.3] });
      b.box(x - 2, y + h + 0.15, z - 2, x + 2, y + h + 1.1, z - 1.9, 'wood', { color: [0.45, 0.38, 0.3] });
      b.box(x - 2, y + h + 2.3, z - 2.2, x + 2, y + h + 2.45, z + 2.2, 'fabric', { color: [0.6, 0.3, 0.2], collide: false });
      out.ladders.push({ x: x, z: z + 1.6, y0: y, y1: y + h + 0.15 });
      out.spots.push({ x, z: z, kind: 'lookout', y: y + h + 0.15 });
      out.lookoutTop = { x, y: y + h + 0.15, z };
      break;
    }
    case 'mast': {
      b.box(x - 0.1, y, z - 0.1, x + 0.1, y + 8, z + 0.1, 'wood', { color: [0.4, 0.32, 0.24] });
      b.boxR(x + 1.6, y + 4.5, z, 3, 4.6, 0.03, 0, 'fabric', { color: col, rz: 0.05 });
      out.spots.push({ x: x + 1.5, z: z + 1.5, kind: 'pray' });
      break;
    }
    case 'stove': {
      b.box(x - 0.35, y, z - 0.35, x + 0.35, y + 0.9, z + 0.35, 'rust', { color: [0.3, 0.25, 0.2] });
      b.box(x - 0.06, y + 0.9, z - 0.06, x + 0.06, y + 2.2, z + 0.06, 'metal', { color: [0.2, 0.2, 0.2], collide: false });
      out.smoke.push({ x, y: y + 2.25, z, kind: 'cook' });
      out.fires.push({ x, y: y + 0.7, z });
      out.spots.push({ x: x + 0.9, z, kind: 'cook' });
      out.sounds.push({ type: 'fire', x, y: y + 0.5, z });
      break;
    }
    case 'laundry': {
      b.box(x - 2.5, y, z - 0.04, x - 2.42, y + 2.2, z + 0.04, 'wood', { color: [0.4, 0.33, 0.25], collide: false });
      b.box(x + 2.42, y, z - 0.04, x + 2.5, y + 2.2, z + 0.04, 'wood', { color: [0.4, 0.33, 0.25], collide: false });
      b.box(x - 2.5, y + 2.05, z - 0.01, x + 2.5, y + 2.07, z + 0.01, 'rope', { color: [0.8, 0.78, 0.7], collide: false });
      for (let i = 0; i < 6; i++) out.cloths.push([x - 2 + i * 0.8, y + 1.7, z, rng.pick([[0.7, 0.3, 0.25], [0.85, 0.85, 0.8], [0.3, 0.4, 0.55], [0.6, 0.6, 0.35], [0.35, 0.5, 0.35]])]);
      out.spots.push({ x, z: z + 0.8, kind: 'laundry' });
      break;
    }
    case 'lantern': {
      b.box(x - 0.04, y, z - 0.04, x + 0.04, y + 2.3, z + 0.04, 'wood', { color: [0.35, 0.3, 0.24], collide: false });
      out.lanterns.push({ x, y: y + 2.15, z });
      break;
    }
    case 'bed': {
      b.box(x - 1, y, z - 0.5, x + 1, y + 0.45, z + 0.5, 'fabric', { color: [0.45, 0.4, 0.35] });
      out.beds.push({ x, y: y + 0.45, z });
      break;
    }
    default: break;
  }
}

export function rngFor(id) { let h = 7; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return new RNG(h); }

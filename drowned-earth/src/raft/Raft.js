import * as THREE from 'three';
import { Builder } from '../world/Builder.js';
import { buildPiece, buildStructure, rngFor } from './RaftKit.js';
import { ladder } from '../world/Architecture.js';
import { InstanceBatch } from '../world/Props.js';
import { damp } from '../core/rng.js';
import { LAYER_FX } from '../render/Pipeline.js';

const _s = [0, 0, 0];

// One floating platform made of modular pieces. Its group is a moving
// collision body; NPCs, lanterns and the player all ride on it. The same class
// will back moving raft cities and player-built rafts later (addPiece + rebuild).
export class Raft {
  constructor(ctx, def, worldPos, pieceDefs) {
    this.ctx = ctx;
    this.def = def;
    this.id = def.id;
    this.name = def.name;
    this.pieceDefs = pieceDefs;
    this.root = new THREE.Group();
    this.root.name = 'raft:' + def.id;
    this.anchor = new THREE.Vector3(worldPos.x, 0, worldPos.z);
    this.baseYaw = def.ry || 0;
    this.heave = 0; this.pitch = 0; this.roll = 0;
    this.drift = new THREE.Vector3();
    this.info = null;
    this.body = null;
    this.mass = 1;
    this.build();
  }
  addPiece(p) { this.def.pieces.push(p); this.build(); }

  build() {
    if (this.mesh) { this.mesh.removeFromParent(); this.mesh.traverse((o) => o.geometry?.dispose()); }
    if (this.body) this.ctx.collision.removeBody(this.body);
    const rng = rngFor(this.id);
    const b = new Builder(new THREE.Vector3(), { shadows: this.ctx.settings.q.shadows });
    const out = { spots: [], stalls: [], plants: [], smoke: [], fires: [], sounds: [], lanterns: [], ladders: [], cloths: [], beds: [], workbench: null, lookoutTop: null };
    const rects = [];
    let mass = 0;
    for (const p of this.def.pieces) {
      const pd = this.pieceDefs[p.piece];
      rects.push(buildPiece(b, pd, p.x, p.z, p.ry || 0, rng));
      mass += pd.mass;
    }
    this.mass = mass;
    this.deck = Math.max(...rects.map((r) => r.deck));
    this.rects = rects;
    const deckAt = (x, z) => { for (const r of rects) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r.deck; return this.deck; };
    this.deckAt = deckAt;
    for (const st of this.def.structures || []) buildStructure(b, st, deckAt(st.x, st.z), rng, out);
    // vegetables + cloth via instancing
    const inst = new InstanceBatch();
    for (const [x, y, z] of out.plants) inst.add('foliage', 'foliage', x, y + 0.15, z, { s: 0.28 + rng.next() * 0.15, color: [0.6, 0.9, 0.5] });
    for (const [x, y, z, c] of out.cloths) inst.add('mattress', 'fabric', x, y, z, { sx: 0.45, sy: 2.4, sz: 0.03, rx: Math.PI / 2, color: c });
    // the clutter of a working raft, kept to the deck edges where nobody walks
    const kinds = this.def.kind === 'market' || /market|portage/i.test(this.id)
      ? ['crate', 'barrel', 'bucket', 'jerrycan', 'trash', 'propane']
      : ['bucket', 'jerrycan', 'crate', 'stool', 'trash'];
    for (const r of rects) {
      const w = r.x1 - r.x0, d = r.z1 - r.z0;
      const n = Math.floor((w + d) * 0.35 * (this.ctx.settings.q.propDensity ?? 1));
      for (let i = 0; i < n; i++) {
        const along = rng.next(), side = Math.floor(rng.next() * 4);
        const x = side < 2 ? r.x0 + 0.35 + along * (w - 0.7) : side === 2 ? r.x0 + 0.35 : r.x1 - 0.35;
        const z = side >= 2 ? r.z0 + 0.35 + along * (d - 0.7) : side === 0 ? r.z0 + 0.35 : r.z1 - 0.35;
        const k = kinds[Math.floor(rng.next() * kinds.length)];
        inst.add(k, 'wood', x, r.deck + (k === 'barrel' ? 0.45 : 0), z, { ry: rng.next() * 6.28 });
      }
    }
    for (const im of inst.build(new THREE.Vector3(), { dynamic: true, shadows: true })) b.object(im);
    for (const l of out.ladders) ladder(b, l.x, l.z, l.y0, l.y1, 0, { topStep: new THREE.Vector3(l.x, l.y1 + 0.05, l.z - 1.4) });
    this.mesh = b.build('raft ' + this.id);
    this.mesh.position.set(0, 0, 0);
    this.root.add(this.mesh);
    // lantern glow sprites (lights are pooled by the community)
    this.lanterns = out.lanterns.map((l) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffb060 }));
      m.position.set(l.x, l.y, l.z);
      const halo = new THREE.Sprite(this.ctx.fx.glowMaterial);
      halo.scale.setScalar(1.4);
      halo.position.copy(m.position);
      halo.layers.set(LAYER_FX);
      this.root.add(m, halo);
      return { local: new THREE.Vector3(l.x, l.y, l.z), mesh: m, halo };
    });
    this.info = out;
    const boxes = b.colliders.map(([minX, minY, minZ, maxX, maxY, maxZ, tag]) => ({ minX, minY, minZ, maxX, maxY, maxZ, tag }));
    this.body = this.ctx.collision.addBody(this.root, boxes, 'wood');
    this.body.radius = 40;
    this.localInteract = b.interactables;
  }

  worldPoint(local, out = new THREE.Vector3()) { return out.copy(local).applyMatrix4(this.root.matrixWorld); }

  update(dt, t, driftDef) {
    const { waves } = this.ctx;
    const per = driftDef ? driftDef.period : 600, rad = driftDef ? driftDef.radius : 4;
    const ph = this.anchor.x * 0.01 + this.anchor.z * 0.013;
    this.drift.set(Math.sin((t / per) * Math.PI * 2 + ph) * rad, 0, Math.cos((t / per) * Math.PI * 1.3 + ph) * rad * 0.6);
    const yaw = this.baseYaw + Math.sin(t * 0.05 + ph) * 0.03;
    const px = this.anchor.x + this.drift.x, pz = this.anchor.z + this.drift.z;
    // buoyancy: average the waves over the footprint; heavier rafts move less
    const r = this.rects;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const q of r) { x0 = Math.min(x0, q.x0); x1 = Math.max(x1, q.x1); z0 = Math.min(z0, q.z0); z1 = Math.max(z1, q.z1); }
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const sample = (lx, lz) => waves.sample(px + lx * c + lz * s, pz - lx * s + lz * c, _s)[0];
    const hx0 = sample(x0, (z0 + z1) / 2), hx1 = sample(x1, (z0 + z1) / 2);
    const hz0 = sample((x0 + x1) / 2, z0), hz1 = sample((x0 + x1) / 2, z1);
    const damping = 1 / (1 + this.mass * 0.12);
    const k = 2.5 * damping + 0.6;
    this.heave = damp(this.heave, ((hx0 + hx1 + hz0 + hz1) / 4) * (0.6 + damping * 0.4), k, dt);
    this.pitch = damp(this.pitch, Math.atan2(hz0 - hz1, z1 - z0) * damping * 1.5, k, dt);
    this.roll = damp(this.roll, Math.atan2(hx1 - hx0, x1 - x0) * damping * 1.5, k, dt);
    this.root.position.set(px, this.heave, pz);
    this.root.rotation.set(0, 0, 0);
    this.root.rotateY(yaw);
    this.root.rotateX(this.pitch);
    this.root.rotateZ(this.roll);
    this.root.updateMatrixWorld(true);
  }
}

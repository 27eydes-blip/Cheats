import { disposeGroup } from './Builder.js';

// Hand-built scenes placed by the atlas. Streamed by distance with hysteresis,
// just like chunks, so later stages can add hundreds of them across the map.
export class LandmarkManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.builders = new Map();
    this.loaded = new Map();
    this.loadDist = 1100; this.unloadDist = 1350;
  }
  register(kind, fn) { this.builders.set(kind, fn); }
  update(px, pz, force = false) {
    for (const def of this.ctx.worldMap.landmarks) {
      const d = Math.hypot(def.pos[0] - px, def.pos[1] - pz);
      const isLoaded = this.loaded.has(def.id);
      if (!isLoaded && d < this.loadDist) this.load(def);
      else if (isLoaded && d > this.unloadDist) this.unload(def.id);
    }
    for (const l of this.loaded.values()) for (const u of l.updaters || []) u(this._dt || 0);
  }
  tick(dt) { this._dt = dt; }
  load(def) {
    const fn = this.builders.get(def.kind);
    if (!fn) return;
    const out = fn(this.ctx, def) || {};
    const rec = { def, ...out, colliderIds: [], interactIds: [], audioIds: [] };
    if (out.group) this.ctx.scene.add(out.group);
    for (const c of out.colliders || []) rec.colliderIds.push(this.ctx.collision.addBox(...c));
    for (const i of out.interactables || []) rec.interactIds.push(this.ctx.interact.add(i));
    for (const a of out.audio || []) { const id = this.ctx.audio?.addEmitter(a); if (id) rec.audioIds.push(id); }
    this.loaded.set(def.id, rec);
    this.ctx.events.emit('landmark:loaded', rec);
  }
  unload(id) {
    const rec = this.loaded.get(id);
    if (!rec) return;
    if (rec.group) disposeGroup(rec.group);
    this.ctx.collision.remove(rec.colliderIds);
    for (const i of rec.interactIds) this.ctx.interact.remove(i);
    for (const a of rec.audioIds) this.ctx.audio?.removeEmitter(a);
    for (const b of rec.bodies || []) this.ctx.collision.removeBody(b);
    rec.dispose?.();
    this.loaded.delete(id);
  }
  get(id) { return this.loaded.get(id); }
}

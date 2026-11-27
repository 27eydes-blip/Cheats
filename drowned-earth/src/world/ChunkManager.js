import { disposeGroup } from './Builder.js';

// Streams deterministic procedural chunks around the viewer in two LODs.
// near: full detail (props, interiors, colliders, interactables)
// far:  building shells only, no colliders
// Builds are time-sliced so streaming never causes a frame spike, which is
// what lets the world grow to any size later without a rewrite.
export const CHUNK = 128;

export class ChunkManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.chunks = new Map();
    this.generators = new Map();
    this.queue = [];
    this.budgetMs = 6;
    this.center = { x: 1e9, z: 1e9 };
    this.stats = { loaded: 0, near: 0, builds: 0 };
  }
  registerGenerator(regionType, fn) { this.generators.set(regionType, fn); }

  key(cx, cz) { return cx + ',' + cz; }

  desiredLod(cx, cz, px, pz) {
    const q = this.ctx.settings.q;
    // distance from viewer to the chunk rectangle
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const dx = Math.max(x0 - px, 0, px - (x0 + CHUNK));
    const dz = Math.max(z0 - pz, 0, pz - (z0 + CHUNK));
    const d = Math.hypot(dx, dz);
    if (d < q.chunkNearRadius) return 'near';
    if (d < q.chunkFarRadius) return 'far';
    return null;
  }

  update(px, pz, force = false) {
    const q = this.ctx.settings.q;
    const moved = Math.hypot(px - this.center.x, pz - this.center.z);
    if (moved > 16 || force) {
      this.center = { x: px, z: pz };
      const r = Math.ceil(q.chunkFarRadius / CHUNK) + 1;
      const pcx = Math.floor(px / CHUNK), pcz = Math.floor(pz / CHUNK);
      const want = new Map();
      for (let cx = pcx - r; cx <= pcx + r; cx++) for (let cz = pcz - r; cz <= pcz + r; cz++) {
        const lod = this.desiredLod(cx, cz, px, pz);
        if (lod) want.set(this.key(cx, cz), { cx, cz, lod });
      }
      // unload / downgrade with hysteresis
      for (const [k, c] of this.chunks) {
        const w = want.get(k);
        if (!w) {
          const lodH = this.desiredLodPadded(c.cx, c.cz, px, pz, 96);
          if (!lodH) this.unload(k);
        }
      }
      this.queue = [];
      for (const [k, w] of want) {
        const c = this.chunks.get(k);
        if (!c || c.lod !== w.lod) {
          if (c && c.lod === 'near' && w.lod === 'far' && this.desiredLodPadded(c.cx, c.cz, px, pz, 64) === 'near') continue;
          const ccx = (w.cx + 0.5) * CHUNK, ccz = (w.cz + 0.5) * CHUNK;
          w.d = Math.hypot(ccx - px, ccz - pz) * (w.lod === 'near' ? 0.5 : 1);
          this.queue.push(w);
        }
      }
      this.queue.sort((a, b) => a.d - b.d);
    }
    const t0 = performance.now();
    while (this.queue.length && (force || performance.now() - t0 < this.budgetMs)) {
      const w = this.queue.shift();
      this.build(w.cx, w.cz, w.lod);
    }
    this.stats.loaded = this.chunks.size;
  }
  desiredLodPadded(cx, cz, px, pz, pad) {
    const q = this.ctx.settings.q;
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const dx = Math.max(x0 - px, 0, px - (x0 + CHUNK));
    const dz = Math.max(z0 - pz, 0, pz - (z0 + CHUNK));
    const d = Math.hypot(dx, dz);
    if (d < q.chunkNearRadius + pad) return 'near';
    if (d < q.chunkFarRadius + pad) return 'far';
    return null;
  }

  build(cx, cz, lod) {
    const k = this.key(cx, cz);
    const old = this.chunks.get(k);
    const x = (cx + 0.5) * CHUNK, z = (cz + 0.5) * CHUNK;
    const region = this.ctx.worldMap.regionAt(x, z);
    const gen = this.generators.get(region.type) || this.generators.get('default');
    const out = gen ? gen(this.ctx, cx, cz, lod, region) : null;
    if (old) this.unload(k);
    const chunk = { key: k, cx, cz, lod, group: null, colliders: [], interactables: [], updaters: [] };
    if (out) {
      chunk.group = out.group;
      if (out.group) this.ctx.scene.add(out.group);
      if (lod === 'near' && out.colliders) for (const c of out.colliders) chunk.colliders.push(this.ctx.collision.addBox(...c));
      if (lod === 'near' && out.interactables) for (const d of out.interactables) chunk.interactables.push(this.ctx.interact.add(d));
      if (out.updaters) chunk.updaters = out.updaters;
      if (out.audio) chunk.audio = out.audio.map((a) => this.ctx.audio?.addEmitter?.(a)).filter(Boolean);
    }
    this.chunks.set(k, chunk);
    this.stats.builds++;
    this.ctx.events.emit('chunk:built', chunk);
  }
  unload(k) {
    const c = this.chunks.get(k);
    if (!c) return;
    if (c.group) disposeGroup(c.group);
    this.ctx.collision.remove(c.colliders);
    for (const id of c.interactables) this.ctx.interact.remove(id);
    if (c.audio) for (const a of c.audio) this.ctx.audio.removeEmitter(a);
    this.chunks.delete(k);
    this.ctx.events.emit('chunk:unloaded', c);
  }
  tick(dt) { for (const c of this.chunks.values()) for (const u of c.updaters) u(dt); }
  // Rebuild everything (after quality change)
  reset() { for (const k of [...this.chunks.keys()]) this.unload(k); this.center = { x: 1e9, z: 1e9 }; }
}

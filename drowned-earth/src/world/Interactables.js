import * as THREE from 'three';

// Registry of things the player can use. Each entry:
// { pos: Vector3 | () => Vector3, radius, prompt: string | (ctx) => string,
//   onUse(ctx, self), enabled?(ctx), kind, mode?: 'foot' | 'boat' | 'any', requireLook? }
const _v = new THREE.Vector3(), _d = new THREE.Vector3();

export class Interactables {
  constructor(ctx) { this.ctx = ctx; this.items = new Map(); this.nextId = 1; this.focus = null; }
  add(def) {
    const id = def.id && !this.items.has(def.id) ? def.id : 'i' + this.nextId++;
    this.items.set(id, { radius: 2, mode: 'foot', requireLook: true, ...def, _id: id });
    return id;
  }
  remove(id) { this.items.delete(id); if (this.focus?._id === id) this.focus = null; }
  posOf(it) { return typeof it.pos === 'function' ? it.pos(_v) : it.pos; }

  // pick the best target for the current viewer
  update(eye, forward, mode) {
    let best = null, bestScore = Infinity;
    for (const it of this.items.values()) {
      if (it.mode !== 'any' && it.mode !== mode) continue;
      if (it.enabled && !it.enabled(this.ctx, it)) continue;
      const p = this.posOf(it);
      const dist = eye.distanceTo(p);
      if (dist > it.radius) continue;
      _d.copy(p).sub(eye).normalize();
      const dot = _d.dot(forward);
      if (it.requireLook && dot < 0.55 && dist > 1.0) continue;
      const score = dist * (1.6 - dot) - (it.priority || 0) * 10;   // e.g. a body or a pocket beats the 'Talk to' behind it
      if (score < bestScore) { bestScore = score; best = it; }
    }
    this.focus = best;
    return best;
  }
  promptFor(it) { return typeof it.prompt === 'function' ? it.prompt(this.ctx, it) : it.prompt; }
  use() {
    const it = this.focus;
    if (!it) return false;
    it.onUse?.(this.ctx, it);
    this.ctx.events.emit('interact', it);
    return true;
  }
}

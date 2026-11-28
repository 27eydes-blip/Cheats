// A fixed pool of point lights. three.js rebuilds every lit shader whenever the
// number of active lights changes — and here lights come and go constantly
// (rafts and landmarks streaming in, creatures with glowing parts appearing).
// On a laptop GPU each rebuild froze the game for seconds.
//
// Instead, every other PointLight is moved to a layer the camera never renders
// (so three doesn't count it) and acts as a "virtual" light. Each frame the
// nearest, brightest visible virtual lights are copied into this fixed pool,
// so the real light count never changes and no shader ever recompiles for it.
import * as THREE from 'three';

const HIDDEN_LAYER = 31;
const _p = new THREE.Vector3();

export class LightPool {
  constructor(ctx, size) {
    this.ctx = ctx;
    this.pool = [];
    for (let i = 0; i < size; i++) {
      const l = new THREE.PointLight(0x000000, 0, 1, 2);
      l.userData.pooled = true;
      l.castShadow = false;
      l.layers.enableAll(); l.layers.disable(HIDDEN_LAYER);   // lights every render pass, like the lamps it stands in for
      ctx.scene.add(l);
      this.pool.push(l);
    }
    this.list = [];
    this.refreshT = 0;
    const dirty = () => { this.refreshT = Math.min(this.refreshT, 0.25); };   // at most ~4 scans a second while streaming
    ctx.events.on('chunk:built', dirty);
    ctx.events.on('landmark:loaded', dirty);
  }
  // find every point light in the scene that isn't ours and hide it from three's light count
  refresh() {
    this.list.length = 0;
    this.ctx.scene.traverse((o) => {
      if (o.isPointLight && !o.userData.pooled) {
        if (o.layers.mask !== 1 << HIDDEN_LAYER) o.layers.set(HIDDEN_LAYER);
        o.castShadow = false;
        this.list.push(o);
      }
    });
  }
  // visible all the way up to the scene?
  static shown(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }
  update(dt) {
    this.refreshT -= dt;
    if (this.refreshT <= 0) { this.refreshT = 1; this.refresh(); }
    const cam = this.ctx.camera.position;
    const cands = this._cands || (this._cands = []), pool = this._recs || (this._recs = []);
    cands.length = 0; let ri = 0;
    for (const o of this.list) {
      if (o.intensity <= 0.001 || !o.parent || !LightPool.shown(o)) continue;
      o.getWorldPosition(_p);
      const d = _p.distanceTo(cam);
      const reach = (o.distance || 30) + 25;
      if (d > reach + 60) continue;
      // nearer and brighter lights win; a light whose range doesn't reach us ranks lower
      const rec = pool[ri] || (pool[ri] = {}); ri++;
      rec.o = o; rec.x = _p.x; rec.y = _p.y; rec.z = _p.z; rec.s = d / Math.pow(o.intensity + 0.2, 0.35) + (d > reach ? 100 : 0);
      cands.push(rec);
    }
    cands.sort((a, b) => a.s - b.s);
    for (let i = 0; i < this.pool.length; i++) {
      const l = this.pool[i], c = cands[i];
      if (!c) { l.intensity = 0; continue; }
      l.position.set(c.x, c.y, c.z);
      l.color.copy(c.o.color);
      l.intensity = c.o.intensity;
      l.distance = c.o.distance;
      l.decay = c.o.decay;
    }
  }
}

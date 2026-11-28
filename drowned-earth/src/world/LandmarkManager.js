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
    // one landmark per frame, nearest first: building several big scenes in one frame froze the game while boating
    const s = this.ctx.settings, low = s.isLight, k = s.q.landmarkK ?? (low ? 0.7 : 1);
    const loadD = this.loadDist * k, unloadD = this.unloadDist * Math.max(k + 0.05, low ? 0.75 : 1);
    let next = null, nd = Infinity;
    for (const def of this.ctx.worldMap.landmarks) {
      const d = Math.hypot(def.pos[0] - px, def.pos[1] - pz);
      const isLoaded = this.loaded.has(def.id);
      if (!isLoaded && d < loadD) { if (force) this.load(def, true); else if (d < nd) { nd = d; next = def; } }
      else if (isLoaded && d > unloadD) this.unload(def.id);
    }
    if (next) this.load(next, false);
    // as you approach a loaded place, compile everything in it in the background (hidden people, LOD meshes,
    // props switched off until night) so walking or sailing into it doesn't compile shaders mid-step
    else if (!force) for (const rec of this.loaded.values()) {
      if (rec.warmed || !rec.group || !rec.def.pos) continue;
      if (Math.hypot(rec.def.pos[0] - px, rec.def.pos[1] - pz) > 380) continue;
      rec.warmed = true; this.warm(rec.group);
      break;   // one per frame
    }
    for (const l of this.loaded.values()) for (const u of l.updaters || []) u(this._dt || 0);
  }
  tick(dt) { this._dt = dt; }
  warm(group) {
    const r = this.ctx.renderer; if (!r?.compileAsync) return;
    const hidden = []; group.traverse((o) => { if (!o.visible && !o.isLight) { hidden.push(o); o.visible = true; } });
    const prevT = r.getRenderTarget(), tgt = this.ctx.settings.q.postPipeline ? this.ctx.pipeline?.target : null;
    try { if (tgt) r.setRenderTarget(tgt); this.ctx.lightPool?.refresh(); r.compileAsync(group, this.ctx.camera, this.ctx.scene).catch(() => {}); } catch { /* compile on first draw */ }
    finally { r.setRenderTarget(prevT); for (const o of hidden) o.visible = false; }
  }
  load(def, sync = true) {
    const fn = this.builders.get(def.kind);
    if (!fn) return;
    const out = fn(this.ctx, def) || {};
    const rec = { def, ...out, colliderIds: [], interactIds: [], audioIds: [] };
    if (out.group) {
      this.ctx.scene.add(out.group);
      // compile its shaders off the main thread before it's drawn (it's far away when it streams in)
      const r = this.ctx.renderer;
      if (!sync && r?.compileAsync && def.pos && Math.hypot(def.pos[0] - this.ctx.camera.position.x, def.pos[1] - this.ctx.camera.position.z) > 150) {
        const g = out.group, was = g.visible;
        // compile for the target the frame actually renders into (the HDR pipeline when it's on), with the group's own lights counted
        const prevT = r.getRenderTarget(), tgt = this.ctx.settings.q.postPipeline ? this.ctx.pipeline?.target : null;
        let p = null;
        try { if (tgt) r.setRenderTarget(tgt); g.visible = true; this.ctx.lightPool?.refresh(); p = r.compileAsync(g, this.ctx.camera, this.ctx.scene); } catch { /* fall back to compile on first draw */ }
        finally { r.setRenderTarget(prevT); }
        g.visible = false;
        const show = () => { if (this.loaded.get(def.id) === rec) g.visible = was; };
        Promise.race([(p || Promise.resolve()).catch(() => {}), new Promise((res) => setTimeout(res, 4000))]).then(show);
      }
    }
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

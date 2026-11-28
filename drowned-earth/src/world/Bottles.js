import * as THREE from 'three';
import { propGeometry } from './Props.js';
import { mat } from './Materials.js';

// Messages in bottles drifting through the district. Some are authored, and
// some are the epitaphs of lives you lived in the life sim, set adrift when
// they ended, so past playthroughs wash up in this one.
const PAST = 'drowned-earth.pastlives';
export function rememberLife(summary) {
  try {
    const list = JSON.parse(localStorage.getItem(PAST) || '[]');
    list.unshift(`${summary.name}, ${summary.age}, born on ${summary.raft}. ${summary.best} (${summary.cause}.) Whoever finds this: I was here.`);
    localStorage.setItem(PAST, JSON.stringify(list.slice(0, 20)));
  } catch { /* storage unavailable */ }
}
export class Bottles {
  constructor(ctx) {
    this.ctx = ctx;
    const d = ctx.data.bottles;
    let past = [];
    try { past = JSON.parse(localStorage.getItem(PAST) || '[]'); } catch { past = []; }
    const notes = [...past.slice(0, 3), ...d.notes];
    this.items = d.spots.map(([x, z], i) => ({ x, z, note: notes[i % notes.length], past: i < Math.min(3, past.length), id: 'bottle:' + i }));
    this.mesh = new THREE.InstancedMesh(propGeometry('bottle'), mat('plasticFloat'), this.items.length);
    this.mesh.setColorAt(0, new THREE.Color(0.7, 0.85, 0.8));
    const m = new THREE.Matrix4();
    this.items.forEach((b, i) => { m.makeTranslation(b.x, 0, b.z); this.mesh.setMatrixAt(i, m); this.mesh.setColorAt(i, new THREE.Color(0.55, 0.8, 0.72)); });
    ctx.scene.add(this.mesh);
    for (const b of this.items) {
      ctx.interact.add({ id: b.id, kind: 'bottle', mode: 'any', radius: 4, requireLook: false, pos: new THREE.Vector3(b.x, 0.3, b.z),
        enabled: (c) => !c.state.looted.has(b.id),
        prompt: 'A bottle with a note in it',
        onUse: (c) => { c.state.looted.add(b.id); c.ui.showNote(b.past ? 'A bottle — in a hand you almost recognise' : 'A note in a bottle', b.note); c.audio?.play('page'); this.refresh(); } });
    }
  }
  // only the bottles within 160 m are drawn (98 bottles × ~1000 triangles were drawn across the whole map, always)
  refresh() {
    const m = new THREE.Matrix4(), cp = this.ctx.camera.position; let n = 0;
    for (const b of this.items) { if (this.ctx.state.looted.has(b.id) || Math.hypot(b.x - cp.x, b.z - cp.z) > 160) continue; m.makeTranslation(b.x, 0, b.z); this.mesh.setMatrixAt(n++, m); }
    this.mesh.count = n; this.mesh.visible = n > 0; this.mesh.instanceMatrix.needsUpdate = true; this.mesh.boundingSphere = null;
  }
  update(dt) { this.t = (this.t || 0) - dt; if (this.t <= 0) { this.t = 0.5; this.refresh(); } }
}

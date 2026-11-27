import * as THREE from 'three';
import { buildBoat } from './Hulls.js';
import { mat } from '../world/Materials.js';

// Boats moored around the Drift that you can take (stealing raises Heat;
// swapping hulls while unseen shakes the Ward's description of you), the
// ramps made from collapsed tower slabs that launch a fast boat, and the
// safehouses where Heat burns off.
const _v = new THREE.Vector3(), _f = new THREE.Vector3();

export class Fleet {
  constructor(ctx) {
    this.ctx = ctx;
    this.data = ctx.data.boats || { types: {}, parked: [], ramps: [], safehouses: [] };
    this.group = new THREE.Group(); this.group.name = 'fleet';
    ctx.scene.add(this.group);
    this.parked = (this.data.parked || []).map((p) => this.park(p.type, p.at[0], p.at[1], p.heading, p));
    this.ramps = (this.data.ramps || []).map((r) => this.buildRamp(r));
    this.state = { owned: { sh_redlamp: true, sh_court: true }, swaps: 0 };
    for (const sh of this.data.safehouses || []) if (sh.owned) this.state.owned[sh.id] = true;
    this.addSafehouses();
  }
  park(type, x, z, heading, info = {}) {
    const def = this.data.types[type]; if (!def) return null;
    const mesh = buildBoat(def);
    mesh.position.set(x, 0, z); mesh.rotation.y = heading;
    this.group.add(mesh);
    const p = { ...info, type, mesh, pos: new THREE.Vector3(x, 0, z), heading };
    p.iid = this.ctx.interact.add({
      kind: 'boat', mode: 'boat', radius: 7, requireLook: false,
      pos: (v) => v.copy(p.pos).setY(0.8),
      prompt: () => this.prompt(p),
      enabled: (c) => c.player.mode === 'boat' && !c.boat.tied,
      onUse: () => this.take(p),
    });
    return p;
  }
  prompt(p) {
    const def = this.data.types[p.type];
    if (p.locked && !this.ctx.story.flag(p.locked)) return `${def.name} — chained (${p.owner})`;
    return `Swap into the ${def.name}${p.mine ? '' : ` — ${p.owner}'s (theft)`}`;
  }
  take(p) {
    const { boat, heat, ui, story } = this.ctx;
    if (p.locked && !story.flag(p.locked)) { ui.whisper(`A chain through the bow eye and a padlock the size of a fist. ${p.owner} doesn't lend.`); return; }
    const def = this.data.types[p.type];
    const oldType = boat.typeId, oldPos = boat.pos.clone(), oldHeading = boat.heading;
    // jump across: the new boat becomes yours, yours stays moored here
    boat.setType(p.type);
    boat.pos.set(p.pos.x, boat.pos.y, p.pos.z); boat.heading = p.heading; boat.vel.set(0, 0, 0);
    this.group.remove(p.mesh);
    const left = this.park(oldType, oldPos.x, oldPos.z, oldHeading, { owner: 'you', mine: true });
    this.parked[this.parked.indexOf(p)] = left;
    this.ctx.interact.remove?.(p.iid);
    this.state.swaps++;
    // theft is a crime; a swap nobody saw muddies the Ward's description
    const seen = this.ctx.ward?.seenRecently();
    if (!p.mine) heat?.crime('steal_boat', `Took the ${def.name} from ${p.owner}`);
    if (!seen && heat && heat.value > 0) { heat.add(-Math.min(heat.value, 22), null); ui.whisper('New hull, new silhouette. Whoever was looking for you is looking for a different boat now.'); }
    else ui.toast(`You're in the ${def.name}.`);
    this.ctx.events.emit('boat:swap', { from: oldType, to: p.type, stolen: !p.mine });
  }
  // a collapsed slab of tower lying at an angle in the water: a ramp
  buildRamp(r) {
    const g = new THREE.Group();
    const L = r.length, H = r.height, W = 4.5;
    const slab = new THREE.BoxGeometry(W, 0.45, Math.hypot(L, H), 6, 1, 8);
    const P = slab.attributes.position;
    for (let i = 0; i < P.count; i++) { // broken, uneven edges
      const x = P.getX(i), z = P.getZ(i);
      if (Math.abs(x) > W / 2 - 0.01) P.setX(i, x + Math.sin(z * 3.1 + r.at[0]) * 0.18);
      if (P.getY(i) > 0) P.setY(i, P.getY(i) + Math.sin(x * 4 + z * 2) * 0.03);
    }
    slab.computeVertexNormals();
    const m = new THREE.Mesh(slab, mat('concrete'));
    m.rotation.x = Math.atan2(H, L); // rises toward -z (local forward)
    m.position.set(0, H / 2 - 0.4, 0);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
    // rebar bristling from the top edge
    const rebarM = new THREE.MeshStandardMaterial({ color: 0x5a3a26, roughness: 0.7, metalness: 0.5 });
    for (let i = 0; i < 9; i++) { const rb = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6 + Math.random() * 0.8, 5), rebarM); rb.position.set(-W / 2 + 0.3 + i * (W - 0.6) / 8, H - 0.2, -L / 2 - 0.1); rb.rotation.set(-0.4 + Math.random() * 0.5, 0, (Math.random() - 0.5) * 0.5); g.add(rb); }
    g.position.set(r.at[0], 0, r.at[1]); g.rotation.y = r.heading;
    this.group.add(g);
    return { ...r, g, W, L, H };
  }
  // is the boat on a ramp's lip, heading up it? returns { h, k } or null
  rampAt(pos, fwd) {
    for (const r of this.ramps) {
      _v.copy(pos).sub(r.g.position).applyAxisAngle(_f.set(0, 1, 0), -r.heading);
      if (Math.abs(_v.x) < r.W / 2 && _v.z < -r.L / 2 + 1.2 && _v.z > -r.L / 2 - 0.5) {
        const along = -(fwd.x * Math.sin(r.heading) + fwd.z * Math.cos(r.heading)); // forward along the ramp's -z
        if (along > 0.6) return { h: r.H * 0.6, k: r.H / 2 };
      }
    }
    return null;
  }
  addSafehouses() {
    for (const sh of this.data.safehouses || []) {
      // a faint chalk mark on the water-side: a circle with a line through it (smugglers' sign for 'safe')
      this.ctx.interact.add({
        kind: 'safehouse', mode: 'any', radius: sh.radius, requireLook: false,
        pos: (v) => v.set(sh.at[0], 1, sh.at[1]),
        prompt: () => (this.state.owned[sh.id] ? `Lie low at ${sh.name}` : `${sh.name} — rent it (${sh.cost} scrap)`),
        onUse: (c) => this.useSafehouse(sh),
      });
    }
  }
  useSafehouse(sh) {
    const { inventory, ui, heat, time } = this.ctx;
    if (!this.state.owned[sh.id]) {
      if (!inventory.has('scrap', sh.cost)) { ui.toast(`Rent is ${sh.cost} scrap.`); return; }
      inventory.remove('scrap', sh.cost); this.state.owned[sh.id] = true; ui.whisper(`${sh.name} is yours. ${sh.desc}`); this.ctx.events.emit('property', { id: sh.id }); return;
    }
    if (this.ctx.ward?.seenRecently()) { ui.toast('Not with them watching. Lose them first.'); return; }
    ui.fade(1.4, () => { time.hour = (time.hour + 3) % 24; heat?.clear('safehouse'); ui.whisper('You wait it out behind a locked door. When you look again, the searchlights have gone somewhere else.'); });
  }
  toJSON() { return { ...this.state, boatType: this.ctx.boat.typeId }; }
  load(o) { if (!o) return; this.state = { ...this.state, ...o }; if (o.boatType) this.ctx.boat.setType(o.boatType); }
}

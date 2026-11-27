import * as THREE from 'three';
import { Patrol } from '../ai/Patrol.js';
import { LAYER_FX } from '../render/Pipeline.js';

// The Tide Ward's escalating response to Heat (society/Heat.js):
//   ★     a warning boat comes looking
//   ★★    searchlight patrols (two boats sweeping your last known position)
//   ★★★   boarding crews: faster, they ram and board when you slow down
//   ★★★★  a blockade: two boats broadside across your heading
//   ★★★★★ a drone hunt: a searchlight drone overhead that sees over walls
// It also answers "can they see you right now?" for Heat cooling.
const _v = new THREE.Vector3();

export class Ward {
  constructor(ctx) {
    this.ctx = ctx;
    this.boats = [];          // responders (Patrol instances in response mode)
    this.drone = null;
    this.seen = false;
    this.seenT = 99;
    this.lastKnown = new THREE.Vector3();
    this.blockadeSet = false;
  }
  seenRecently() { return this.seenT < 3; }
  spawnPoint(dist) {
    const p = this.ctx.player.position;
    for (let k = 0; k < 16; k++) {
      const a = Math.random() * Math.PI * 2;
      const x = p.x + Math.cos(a) * dist, z = p.z + Math.sin(a) * dist;
      if (this.ctx.collision.groundAt(x, z, 2) < -1 || !Number.isFinite(this.ctx.collision.groundAt(x, z, 2))) return new THREE.Vector3(x, 0, z);
    }
    return new THREE.Vector3(p.x + dist, 0, p.z);
  }
  responder() {
    let b = this.boats.find((x) => !x.engaged && !x.leaving);
    if (!b) { b = new Patrol(this.ctx, { response: true }); this.boats.push(b); }
    b.engaged = true; b.leaving = false;
    b.pos.copy(this.spawnPoint(150 + Math.random() * 60));
    b.target.copy(this.lastKnown); b.lastSeen.copy(this.lastKnown);
    b.setState('search'); b.awareness = 0.3; b.cooldown = 0;
    return b;
  }
  update(dt) {
    const ctx = this.ctx, heat = ctx.heat, stars = heat.stars;
    const cfg = heat.cfg.response[stars - 1];
    // who can see the player right now
    const sightings = [...this.boats, ctx.patrol].filter((b) => b && b.active && b.awareness > 0.6);
    let seen = sightings.length > 0;
    if (this.drone?.active && this.drone.sees()) seen = true;
    this.seen = seen; this.seenT = seen ? 0 : this.seenT + dt;
    if (seen || stars === 0) this.lastKnown.copy(ctx.player.position);
    // match the response to the stars
    const want = cfg ? cfg.boats - (ctx.patrol?.active ? 1 : 0) : 0;
    const engaged = this.boats.filter((b) => b.engaged);
    if (engaged.length < want && (this.spawnT = (this.spawnT || 0) - dt) <= 0) { this.spawnT = 4; this.responder(); }
    if (engaged.length > want) { const b = engaged[engaged.length - 1]; b.engaged = false; b.leaving = true; b.setState('patrol'); b.route = [[b.pos.x + 400, b.pos.z + 400]]; b.seg = 0; }
    // the blockade: two boats broadside across where you're heading
    if (cfg?.blockade && !this.blockadeSet && engaged.length >= 2) {
      this.blockadeSet = true;
      const p = ctx.player.mode === 'boat' ? ctx.boat : null;
      const hd = p ? p.heading : ctx.player.yaw;
      const fwd = _v.set(-Math.sin(hd), 0, -Math.cos(hd));
      const centre = ctx.player.position.clone().addScaledVector(fwd, 140);
      engaged.slice(0, 2).forEach((b, i) => { b.pos.copy(centre).add(new THREE.Vector3(fwd.z, 0, -fwd.x).multiplyScalar(i ? 12 : -12)); b.heading = hd + Math.PI / 2; b.blockHeading = b.heading; b.setState('blockade'); });
      ctx.ui.subtitle('Loudspeaker: All units, close the channel. Nobody gets past the line.', 4, 'radio');
    }
    if (!cfg?.blockade) this.blockadeSet = false;
    // the drone
    if (cfg?.drone && !this.drone) this.drone = new Drone(ctx);
    if (this.drone) { this.drone.active = !!cfg?.drone; this.drone.update(dt, this.lastKnown); }
    for (const b of this.boats) {
      if (!b.engaged && !b.leaving) { b.group.visible = false; b.spot.intensity = 0; continue; }
      b.update(dt);
      if (b.leaving && b.pos.distanceTo(ctx.player.position) > 260) { b.leaving = false; b.group.visible = false; b.spot.intensity = 0; }
    }
    if (stars === 0) for (const b of this.boats) if (b.engaged) { b.engaged = false; b.leaving = true; b.setState('patrol'); b.route = [[b.pos.x + 500, b.pos.z]]; b.seg = 0; }
  }
}

// A Ward drone: four rotors, a gimballed searchlight, a whine you hear before
// you see it. It flies to your last known position and sweeps; it can see
// over walls but not under bridges, indoors, through fog, or underwater.
class Drone {
  constructor(ctx) {
    this.ctx = ctx;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.LatheGeometry([[0.001, -0.1], [0.25, -0.08], [0.32, 0], [0.25, 0.08], [0.001, 0.1]].map(([r, y]) => new THREE.Vector2(r, y)), 14), new THREE.MeshStandardMaterial({ color: 0x2a2e36, metalness: 0.6, roughness: 0.4 }));
    g.add(body);
    this.rotors = [];
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 6), body.material); arm.rotation.z = Math.PI / 2; arm.rotation.y = a; arm.position.set(Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3); g.add(arm);
      const rotor = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })); rotor.rotation.x = -Math.PI / 2; rotor.position.set(Math.cos(a) * 0.58, 0.06, -Math.sin(a) * 0.58); g.add(rotor); this.rotors.push(rotor);
    }
    this.red = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false })); this.red.position.y = -0.12; g.add(this.red);
    this.spot = new THREE.SpotLight(0xe6f0ff, 0, 90, 0.2, 0.5, 1.0); this.spot.position.y = -0.15; this.spot.layers.enableAll();
    this.target = new THREE.Object3D(); this.spot.target = this.target;
    g.add(this.spot); ctx.scene.add(g, this.target);
    const cone = new THREE.ConeGeometry(4, 30, 16, 1, true); cone.translate(0, -15, 0);
    this.beam = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.beam.layers.set(LAYER_FX); g.add(this.beam);
    this.g = g; this.pos = this.ctx.player.position.clone().add(new THREE.Vector3(120, 40, 0)); this.t = 0; this.aim = new THREE.Vector3();
    ctx.ui.subtitle('A thin electric whine overhead. Then a light, coming in low over the roofs.', 4, 'speech');
  }
  sees() {
    const ctx = this.ctx, p = ctx.player;
    if (!this.active || p.headUnder) return false;
    const d = this.pos.distanceTo(p.position);
    if (d > 70) return false;
    // under a roof or a bridge? a ray straight up from the player hits something
    if (ctx.collision.raycast(p.eye, _v.set(0, 1, 0), 30) < 30) return false;
    const fog = Math.exp(-Math.pow(ctx.atmosphere.fog.near * d * 1.3, 2));
    return this.aim.distanceTo(p.position) < 14 && fog > 0.3;
  }
  update(dt, lastKnown) {
    this.t += dt;
    this.g.visible = this.active;
    this.spot.intensity = this.active ? 1400 : 0;
    if (!this.active) return;
    const want = lastKnown.clone().add(new THREE.Vector3(Math.cos(this.t * 0.4) * 10, 32, Math.sin(this.t * 0.4) * 10));
    this.pos.lerp(want, Math.min(1, dt * 0.45));
    this.g.position.copy(this.pos);
    this.g.rotation.z = Math.sin(this.t * 1.3) * 0.08; this.g.rotation.x = Math.cos(this.t) * 0.06;
    // the light sweeps around the last known position
    this.aim.copy(lastKnown).add(_v.set(Math.cos(this.t * 1.1) * 9, 0, Math.sin(this.t * 0.8) * 9));
    if (this.sees()) this.aim.lerp(this.ctx.player.position, 0.8);
    this.target.position.copy(this.aim);
    this.beam.lookAt(this.aim); this.beam.rotateX(-Math.PI / 2);
    for (const r of this.rotors) r.rotation.z += dt * 60;
    this.red.visible = Math.sin(this.t * 8) > 0;
  }
}

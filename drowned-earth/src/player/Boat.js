import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { prepGeometry, boxGeometry } from '../world/Builder.js';
import { mat } from '../world/Materials.js';
import { clamp, damp } from '../core/rng.js';

// The player's small repair boat: buoyancy from 4 wave samples, outboard
// thrust or paddling, keel drag, collisions with hull damage, fuel, storage,
// wake ripples, lantern, and tie-up to moorings.
const _s = [0, 0, 0];

function hullGeometry() {
  // top outline (x = beam, z = length, bow at -z)
  const L = 5.2, B = 1.9;
  const shape = new THREE.Shape();
  shape.moveTo(0, -L / 2);
  shape.quadraticCurveTo(B / 2, -L / 2 + 1.0, B / 2, -L / 2 + 2.2);
  shape.lineTo(B / 2 * 0.95, L / 2);
  shape.lineTo(-B / 2 * 0.95, L / 2);
  shape.lineTo(-B / 2, -L / 2 + 2.2);
  shape.quadraticCurveTo(-B / 2, -L / 2 + 1.0, 0, -L / 2);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.85, bevelEnabled: false, curveSegments: 8 });
  g.rotateX(Math.PI / 2); // extrude goes down (-y)
  g.translate(0, 0.6, 0);
  // V-hull: pinch the bottom inward
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < 0) { p.setX(i, p.getX(i) * 0.35); p.setY(i, y - (1 - Math.abs(p.getZ(i)) / 3) * 0.05); }
  }
  g.computeVertexNormals();
  return g;
}

export class Boat {
  constructor(ctx) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'boat';
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.heading = 0;   // radians, 0 = facing -z
    this.yawRate = 0;
    this.pitch = 0; this.roll = 0; this.heave = 0;
    this.throttle = 0; this.rudder = 0;
    this.fuel = 6;      // liters
    this.fuelMax = 12;
    this.hull = 78;     // %
    this.tied = null;
    this.lantern = false;
    this.hasLanternRig = false;
    this.radioOn = true;
    this.paddling = false;
    this.wakeTimer = 0;
    this.speed = 0;
    this.leakTimer = 0;
    this.build();
    ctx.scene.add(this.group);
    // boarding prompt
    ctx.interact.add({
      id: 'boat:board', kind: 'boat', mode: 'foot', radius: 4.2, requireLook: false,
      pos: (v) => v.copy(this.pos).setY(this.pos.y + 0.6),
      prompt: 'Board boat',
      enabled: (c) => c.player.mode === 'foot' || c.player.mode === 'swim',
      onUse: () => this.board(),
    });
    ctx.interact.add({
      id: 'boat:storage', kind: 'boat', mode: 'boat', radius: 3, requireLook: false,
      pos: (v) => v.copy(this.pos).setY(this.pos.y + 0.6),
      prompt: () => (this.tied ? '' : ''), enabled: () => false,
    });
  }
  build() {
    const parts = [];
    const add = (g, color, m) => { if (m) g.applyMatrix4(m); parts.push(prepGeometry(g, color)); };
    const M = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    add(hullGeometry(), [0.32, 0.5, 0.5]);
    // gunwale trim + white stripe
    add(boxGeometry(0.08, 0.1, 3.6), [0.85, 0.84, 0.78], M(0.92, 0.62, 0.6));
    add(boxGeometry(0.08, 0.1, 3.6), [0.85, 0.84, 0.78], M(-0.92, 0.62, 0.6));
    // floor boards
    add(boxGeometry(1.4, 0.05, 3.8), [0.45, 0.36, 0.26], M(0, 0.05, 0.5));
    // benches
    add(boxGeometry(1.7, 0.06, 0.4), [0.5, 0.4, 0.3], M(0, 0.42, 1.6));
    add(boxGeometry(1.6, 0.06, 0.4), [0.5, 0.4, 0.3], M(0, 0.42, -0.4));
    // canopy frame + roof (patched tarp)
    for (const [x, z] of [[-0.8, -0.6], [0.8, -0.6], [-0.8, 0.5], [0.8, 0.5]]) add(boxGeometry(0.05, 1.75, 0.05), [0.5, 0.5, 0.48], M(x, 1.42, z));
    const roof = boxGeometry(1.8, 0.04, 1.4); add(roof, [0.55, 0.47, 0.32], M(0, 2.3, -0.05, 0.05));
    // outboard
    add(boxGeometry(0.45, 0.55, 0.5), [0.25, 0.26, 0.27], M(0, 0.85, 2.75));
    add(boxGeometry(0.1, 0.9, 0.14), [0.2, 0.2, 0.2], M(0, 0.25, 2.85));
    add(boxGeometry(0.06, 0.06, 0.7), [0.2, 0.2, 0.2], M(0, 0.95, 2.35));
    // tire fenders
    for (const z of [-0.8, 0.9]) for (const s of [-1, 1]) { const t = new THREE.TorusGeometry(0.22, 0.08, 5, 10); add(t, [0.09, 0.09, 0.09], M(s * 0.98, 0.3, z, 0, Math.PI / 2)); }
    // jerry can + toolbox + rope coil
    add(boxGeometry(0.2, 0.35, 0.32), [0.6, 0.15, 0.1], M(0.5, 0.25, 2.1));
    add(boxGeometry(0.5, 0.25, 0.25), [0.55, 0.4, 0.1], M(-0.45, 0.2, 2.0));
    add(new THREE.TorusGeometry(0.2, 0.05, 4, 10), [0.7, 0.62, 0.45], M(-0.3, 0.1, -1.4, Math.PI / 2));
    // lantern pole
    add(boxGeometry(0.04, 1.3, 0.04), [0.4, 0.4, 0.38], M(-0.6, 1.2, -1.6));
    const g = mergeGeometries(parts, false);
    this.mesh = new THREE.Mesh(g, mat('wood'));
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    // hull uses painted metal: separate material for the main body would cost a draw; vertex colors carry it
    this.group.add(this.mesh);
    // lantern
    this.lanternMesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc070 }));
    this.lanternMesh.position.set(-0.6, 1.8, -1.6);
    this.lanternMesh.visible = false;
    this.group.add(this.lanternMesh);
    this.light = new THREE.PointLight(0xffa860, 0, 18, 1.6);
    this.light.position.copy(this.lanternMesh.position);
    this.light.layers.enableAll();
    this.group.add(this.light);
    this.seat = new THREE.Vector3(0, 0.55, 1.75);
  }

  board() {
    const p = this.ctx.player;
    p.mode = 'boat';
    p.yaw = this.heading;
    this.ctx.events.emit('boat:board');
  }
  disembark(step) {
    const p = this.ctx.player;
    p.mode = 'foot';
    p.teleport(step);
    p.yaw = this.heading + Math.PI;
    this.ctx.events.emit('boat:leave');
  }
  tieUp(m) {
    this.tied = m;
    this.vel.set(0, 0, 0);
    this.throttle = 0;
    // align side to the wall: heading perpendicular to the mooring normal
    this.heading = m.facing + Math.PI / 2;
    this.pos.set(m.pos.x, this.pos.y, m.pos.z);
    this.ctx.events.emit('boat:tie', m);
    this.disembark(m.step);
  }
  seatPosition(out) {
    out.copy(this.seat).applyMatrix4(this.group.matrixWorld);
    return out;
  }
  repair(amount) { this.hull = clamp(this.hull + amount, 0, 100); }
  refuel(l) { this.fuel = clamp(this.fuel + l, 0, this.fuelMax); }

  update(dt) {
    const { input, waves, collision, player } = this.ctx;
    const driving = player.mode === 'boat';
    if (driving) {
      const fwd = input.move.y, turn = -input.move.x;
      if (Math.abs(fwd) > 0.05 && this.tied) { this.tied = null; this.ctx.events.emit('boat:untie'); }
      this.paddling = this.fuel <= 0;
      const boost = input.held.sprint && !this.paddling ? 1.5 : 1;
      this.throttle = damp(this.throttle, fwd * boost, 2.5, dt);
      this.rudder = damp(this.rudder, turn, 4, dt);
      if (!this.paddling && Math.abs(this.throttle) > 0.05) this.fuel = Math.max(0, this.fuel - Math.abs(this.throttle) * dt * 0.012 * boost);
      if (input.pressed('light') && this.hasLanternRig) { this.lantern = !this.lantern; this.ctx.events.emit('lantern', this.lantern); }
    } else {
      this.throttle = damp(this.throttle, 0, 2, dt);
      this.rudder = damp(this.rudder, 0, 2, dt);
    }
    const fwdDir = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
    const side = new THREE.Vector3(-fwdDir.z, 0, fwdDir.x);
    const maxThrust = this.paddling ? 1.2 : 4.2; // m/s^2
    const leak = this.hull < 30 ? 0.7 : 1;
    if (!this.tied) {
      this.vel.addScaledVector(fwdDir, this.throttle * maxThrust * leak * dt);
      // drag: low along the keel, high sideways
      const vf = this.vel.dot(fwdDir), vs = this.vel.dot(side);
      const dragF = 0.35 + Math.abs(vf) * 0.12, dragS = 2.6;
      this.vel.addScaledVector(fwdDir, -vf * dragF * dt).addScaledVector(side, -vs * dragS * dt);
      // drift with the wind a little
      const w = this.ctx.weather.windVec;
      this.vel.x += w.x * this.ctx.weather.cur.wind * 0.08 * dt;
      this.vel.z += w.y * this.ctx.weather.cur.wind * 0.08 * dt;
      this.speed = this.vel.length();
      const steer = this.rudder * (0.25 + Math.min(Math.abs(vf), 5) * 0.28) * Math.sign(vf || 1);
      this.yawRate = damp(this.yawRate, steer + (this.paddling ? this.rudder * 0.25 : 0), 3, dt);
      this.heading += this.yawRate * dt;
      this.pos.addScaledVector(this.vel, dt);
      const impact = collision.resolveHull(this.pos, 1.3, this.vel);
      if (impact > 1.2) {
        const dmg = (impact - 1.2) * 4;
        this.hull = Math.max(0, this.hull - dmg);
        this.ctx.events.emit('boat:impact', { speed: impact, pos: this.pos.clone() });
      }
    } else {
      this.vel.set(0, 0, 0);
      this.speed = 0;
    }
    // buoyancy from 4 samples
    const L = 2.4, B = 0.85;
    const hb = waves.sample(this.pos.x + fwdDir.x * L, this.pos.z + fwdDir.z * L, _s)[0];
    const hs = waves.sample(this.pos.x - fwdDir.x * L, this.pos.z - fwdDir.z * L, _s)[0];
    const hp = waves.sample(this.pos.x + side.x * B, this.pos.z + side.z * B, _s)[0];
    const hq = waves.sample(this.pos.x - side.x * B, this.pos.z - side.z * B, _s)[0];
    const sink = this.hull < 15 ? 0.25 : 0;
    const ty = (hb + hs + hp + hq) / 4 - 0.18 - sink;
    this.heave = damp(this.heave, ty, 5, dt);
    this.pos.y = this.heave;
    const tp = Math.atan2(hb - hs, L * 2) - this.throttle * 0.05 * (this.paddling ? 0 : 1);
    const tr = Math.atan2(hp - hq, B * 2) + this.yawRate * 0.12;
    this.pitch = damp(this.pitch, tp, 4, dt);
    this.roll = damp(this.roll, tr, 4, dt);
    this.group.position.copy(this.pos);
    this.group.rotation.set(0, 0, 0);
    this.group.rotateY(this.heading);
    this.group.rotateX(this.pitch);
    this.group.rotateZ(-this.roll);
    this.group.updateMatrixWorld(true);
    // wake
    this.wakeTimer -= dt;
    if (this.wakeTimer <= 0 && this.speed > 0.4) {
      this.wakeTimer = 0.22;
      const st = this.pos.clone().addScaledVector(fwdDir, 2.2 - Math.sign(this.vel.dot(fwdDir)) * 0.5);
      this.ctx.water.ripple(st.x, st.z, Math.min(1.4, this.speed * 0.3), 1.2 + this.speed * 0.2);
      this.ctx.water.ripple(this.pos.x + fwdDir.x * 2.6, this.pos.z + fwdDir.z * 2.6, Math.min(1, this.speed * 0.2), 1.6);
    }
    // lantern
    const lit = this.lantern && this.hasLanternRig;
    this.lanternMesh.visible = lit;
    this.light.intensity = lit ? 6 + Math.sin(performance.now() * 0.013) * 0.4 : 0;
  }
}

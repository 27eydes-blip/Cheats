import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { prepGeometry, boxGeometry } from '../world/Builder.js';
import { mat } from '../world/Materials.js';
import { clamp, damp } from '../core/rng.js';
import { buildBoat } from '../vehicles/Hulls.js';

// The player's small repair boat: buoyancy from 4 wave samples, outboard
// thrust or paddling, keel drag, collisions with hull damage, fuel, storage,
// wake ripples, lantern, and tie-up to moorings.
const _hc = new THREE.Vector3(), _lf = new THREE.Vector3(), _ld = new THREE.Vector3(), _lb = new THREE.Vector3(), _lt = new THREE.Vector3(), _lv = new THREE.Vector3(), _lres = {};
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
    this.upgrades = {};
    this.mods = { thrust: 1, noise: 1, fuel: 1, damage: 1 };
    this.spotOn = false;
    this.engineOff = false;
    this.typeId = 'skiff';
    this.boostLeft = 0;
    this.air = null;        // airborne off a ramp: { vy }
    this.build();
    this.setType('skiff');
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
    const parts = [], paint = [];
    const add = (g, color, m, list = parts) => { if (m) g.applyMatrix4(m); list.push(prepGeometry(g, color)); };
    const M = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    add(hullGeometry(), [0.2, 0.36, 0.36], null, paint);
    // gunwale trim + white stripe
    add(boxGeometry(0.08, 0.1, 3.6), [0.85, 0.84, 0.78], M(0.92, 0.62, 0.6), paint);
    add(boxGeometry(0.08, 0.1, 3.6), [0.85, 0.84, 0.78], M(-0.92, 0.62, 0.6), paint);
    // floor boards
    add(boxGeometry(1.4, 0.05, 3.8), [0.45, 0.36, 0.26], M(0, 0.05, 0.5));
    // benches
    add(boxGeometry(1.7, 0.06, 0.4), [0.5, 0.4, 0.3], M(0, 0.42, 1.6));
    add(boxGeometry(1.6, 0.06, 0.4), [0.5, 0.4, 0.3], M(0, 0.42, -0.4));
    // canopy frame + roof (patched tarp)
    for (const [x, z] of [[-0.8, -0.6], [0.8, -0.6], [-0.8, 0.5], [0.8, 0.5]]) add(boxGeometry(0.05, 2.2, 0.05), [0.5, 0.5, 0.48], M(x, 1.6, z));
    const roof = boxGeometry(1.8, 0.04, 1.4); add(roof, [0.55, 0.47, 0.32], M(0, 2.72, -0.05, 0.05));
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
    const paintMat = mat('metal').clone();
    paintMat.roughness = 0.55; paintMat.metalness = 0.2;
    this.hullMesh = new THREE.Mesh(mergeGeometries(paint, false), paintMat);
    this.hullMesh.castShadow = true; this.hullMesh.receiveShadow = true;
    this.group.add(this.hullMesh);
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
    // upgrade visuals
    const pg = [];
    for (const sx of [-1, 1]) { const g = boxGeometry(0.04, 0.45, 3.2); g.translate(sx * 0.97, 0.25, 0.4); pg.push(prepGeometry(g, [0.35, 0.36, 0.36])); }
    this.platesMesh = new THREE.Mesh(mergeGeometries(pg), mat('metal'));
    this.platesMesh.visible = false;
    this.group.add(this.platesMesh);
    this.spotLamp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.3, 10), mat('metal'));
    this.spotLamp.rotation.x = Math.PI / 2; this.spotLamp.position.set(0, 0.85, -2.2); this.spotLamp.visible = false;
    this.group.add(this.spotLamp);
    this.spot = new THREE.SpotLight(0xf2f4ff, 0, 90, 0.22, 0.4, 1.2);
    this.spot.layers.enableAll();
    this.spot.position.set(0, 0.9, -2.3);
    this.spotTarget = new THREE.Object3D(); this.spotTarget.position.set(0, -1.5, -30);
    this.group.add(this.spot, this.spotTarget); this.spot.target = this.spotTarget;
  }

  // swap the hull: lofted model + handling for a boat type from data/boats.json
  setType(id) {
    const def = this.ctx.data.boats?.types?.[id];
    if (!def) return;
    this.typeId = id; this.type = def;
    if (this.body) { this.group.remove(this.body); this.body.traverse((o) => o.geometry?.dispose?.()); }
    this.body = buildBoat(def);
    this.group.add(this.body);
    // the old box-built skiff parts stay hidden; upgrade plates/spot lamp only fit the skiff
    this.mesh.visible = false; this.hullMesh.visible = false;
    const sec = this.body.userData.section;
    const s = sec(0.28);
    this.seat.set(0, s.sheer - 0.05, s.z);
    this.boostLeft = def.stats.boostTank;
    this.platesMesh.visible = id === 'skiff' && !!this.upgrades.hull_plate;
    this.ctx.events.emit('boat:type', id);
  }
  applyUpgrade(id) {
    if (id === 'engine_quiet') delete this.upgrades.engine_strong;
    if (id === 'engine_strong') delete this.upgrades.engine_quiet;
    this.upgrades[id] = true;
    const u = this.upgrades, m = this.mods;
    m.thrust = (u.engine_quiet ? 0.9 : 1) * (u.engine_strong ? 1.35 : 1) * (u.hull_plate ? 0.93 : 1);
    m.noise = u.engine_quiet ? 0.4 : u.engine_strong ? 1.5 : 1;
    m.fuel = u.engine_strong ? 1.4 : 1;
    m.damage = u.hull_plate ? 0.45 : 1;
    this.platesMesh.visible = !!u.hull_plate;
    this.spotLamp.visible = !!u.spotlight;
    this.ctx.events.emit('boat:upgrade', id);
  }
  // How far the boat can be heard (metres). Engines carry; paddles barely do.
  noise() {
    if (this.tied) return 0;
    if (this.paddling || this.engineOff) return Math.abs(this.throttle) > 0.1 ? 14 : 0;
    return (25 + Math.abs(this.throttle) * 120) * this.mods.noise * ((this.type?.stats.noise ?? 0.55) / 0.55) * (this.boosting ? 1.4 : 1);
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
  // ---- getting off anywhere (E / Triangle) -------------------------------------------------
  // at rest or slow: step onto the nearest dock / raft edge within 6 m, else into the water beside
  // the boat; moving fast: dive off the side with a small jump while the boat coasts on.
  static LEAVE_FAST = 5;    // m/s
  canLeave() { const c = this.ctx; return c.player.mode === 'boat' && !this.air && c.mode === 'play' && !c.ui.open && !c.paused && !c.injury?.dead && !c.creatures?.struggle && !c.scenarioActive; }
  leaveLabel() {
    const now = performance.now();
    if (!this._lbl || now - this._lblT > 300) { this._lblT = now; this._lbl = this.vel.length() > Boat.LEAVE_FAST ? 'Dive off the boat' : (this.findLanding(6) ? 'Leave boat' : 'Leave boat (into the water)'); }
    return this._lbl;
  }
  leave() {
    if (!this.canLeave()) return null;
    const c = this.ctx, p = c.player, speed = this.vel.length();
    const fwd = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading)), side = new THREE.Vector3(-fwd.z, 0, fwd.x);
    this.throttle = 0;   // a moored boat stays moored
    const surf = c.waves.height(this.pos.x, this.pos.z);
    let how;
    if (speed > Boat.LEAVE_FAST) {
      p.mode = 'swim';
      p.teleport(this.clearSide(side, fwd, 1.8).setY(surf + 0.3));
      p.velocity.set(side.x * 2.5 + this.vel.x * 0.4, 2.2, side.z * 2.5 + this.vel.z * 0.4);
      c.ui.toast('You dive off the side.');
      how = 'dive';
    } else {
      const spot = this.findLanding(6);
      this.vel.multiplyScalar(0.2);
      if (spot) {
        p.mode = 'foot'; p.teleport(spot.pos); p.velocity.set(0, 0, 0);
        if (spot.body) p.setGround?.(spot.body);
        p.yaw = Math.atan2(-(spot.pos.x - this.pos.x), -(spot.pos.z - this.pos.z));
        how = 'land';
      } else {
        p.mode = 'swim'; p.teleport(this.clearSide(side, fwd, 1.6).setY(surf - 0.2)); p.velocity.set(0, 0, 0);
        how = 'water';
      }
    }
    if (how !== 'land') c.events.emit('splash', { pos: p.position.clone(), big: how === 'dive' });   // you hit the water
    c.events.emit('boat:leave', how);
    return how;
  }
  // a point beside the boat with open water: starboard, port, then astern (the boat itself if all are blocked)
  clearSide(side, fwd, d) {
    const col = this.ctx.collision, from = _lf.copy(this.pos).setY(this.ctx.waves.height(this.pos.x, this.pos.z) + 0.3);
    for (const dir of [side, _ld.copy(side).negate(), _lb.copy(fwd).negate()]) if (col.raycast(from, dir, d + 0.6) >= d + 0.6) return this.pos.clone().addScaledVector(dir, d);
    return this.pos.clone();
  }
  // nearest walkable spot (static ground or a raft deck) within maxD of the hull, with no wall in between
  findLanding(maxD = 6) {
    // cached: the same spot answers again until the boat has moved a metre
    const key = maxD, ck = this._landCache;
    if (ck && ck.key === key && ck.at.distanceToSquared(this.pos) < 1) return ck.res;
    const res = this.findLandingNow(maxD);
    this._landCache = { key, at: this.pos.clone(), res };
    return res;
  }
  findLandingNow(maxD) {
    const c = this.ctx, col = c.collision, surf = c.waves.height(this.pos.x, this.pos.z);
    const from = _lf.copy(this.pos).setY(surf + 1.0);
    for (let r = 1.6; r <= maxD + 0.01; r += 0.8) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2, x = this.pos.x + Math.cos(a) * r, z = this.pos.z + Math.sin(a) * r;
        const dir = _ld.set(Math.cos(a), 0, Math.sin(a));
        if (col.raycast(from, dir, r) < r - 0.4) continue;                          // a wall in the way
        const g = col.groundAt(x, z, surf + 2.6);
        if (g > surf - 0.3 && g < surf + 2.5) return { pos: new THREE.Vector3(x, g + 0.02, z), body: null };
        const test = _lt.set(x, surf + 0.6, z);
        const res = col.resolveCylinder(test, 0.2, 0.2, _lv.set(0, -1, 0), 2.0, _lres);
        if (res.groundBody && test.y > surf - 0.3 && test.y < surf + 2.5) return { pos: test.clone(), body: res.groundBody };
      }
    }
    return null;
  }
  // pushed out of a raft or wall: the nearest point of open water, searching outward
  unstick() {
    const col = this.ctx.collision, r = (this.type?.hull?.beam ?? 1.9) * 0.55;
    for (let d = 1; d <= 16; d += 1) for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, x = this.pos.x + Math.cos(a) * d, z = this.pos.z + Math.sin(a) * d;
      if (!col.hullBlocked(x, z, r)) { this.pos.x = x; this.pos.z = z; this.vel.multiplyScalar(0.2); return true; }
    }
    return false;
  }
  // stop dead where it is (the emergency exit parks it)
  park() { this.throttle = 0; this.vel.set(0, 0, 0); this.yawRate = 0; this.boosting = false; }

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
    // hide the canopy from the driver's seat (first person); it's still there from outside
    const can = this.body?.getObjectByName('canopy'); if (can) can.visible = !(driving && !this.ctx.rig?.thirdPerson);
    if (driving) {
      const fwd = input.move.y, turn = -input.move.x;
      if (Math.abs(fwd) > 0.05 && this.tied) { this.tied = null; this.ctx.events.emit('boat:untie'); }
      this.paddling = this.fuel <= 0;
      const st = this.type?.stats;
      this.boosting = !!(input.held.sprint && !this.paddling && !this.engineOff && this.boostLeft > 0 && fwd > 0.1);
      if (this.boosting) this.boostLeft = Math.max(0, this.boostLeft - dt); else this.boostLeft = Math.min(st?.boostTank ?? 5, this.boostLeft + dt * 0.25);
      const boost = this.boosting ? 1.6 : 1;
      this.throttle = damp(this.throttle, fwd * boost, 2.5, dt);
      this.rudder = damp(this.rudder, turn, 4, dt);
      if (!this.paddling && !this.engineOff && Math.abs(this.throttle) > 0.05) this.fuel = Math.max(0, this.fuel - Math.abs(this.throttle) * dt * 0.012 * boost * this.mods.fuel);
      if (input.pressed('crouch')) { this.engineOff = !this.engineOff; this.ctx.ui.toast(this.engineOff ? 'Engine cut. Paddling quietly.' : 'Engine started.'); this.ctx.events.emit('boat:engine', !this.engineOff); }
      if (input.pressed('light')) {
        if (this.upgrades.spotlight && (!this.hasLanternRig || this.lantern)) { this.spotOn = !this.spotOn; if (this.spotOn) this.lantern = false; }
        else if (this.hasLanternRig) { this.lantern = !this.lantern; this.spotOn = false; }
        this.ctx.events.emit('lantern', this.lantern || this.spotOn);
      }
    } else {
      this.throttle = damp(this.throttle, 0, 2, dt);
      this.rudder = damp(this.rudder, 0, 2, dt);
    }
    const fwdDir = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
    const side = new THREE.Vector3(-fwdDir.z, 0, fwdDir.x);
    const S = this.type?.stats || { top: 9, accel: 4.2, turn: 1.1, boost: 3.5 };
    const hullK = 0.55 + 0.45 * Math.min(1, this.hull / 60);              // a holed boat is a slow boat
    const top = ((this.paddling || this.engineOff) ? 2.2 : (S.top + (this.boosting ? S.boost : 0)) * this.mods.thrust) * hullK;
    const maxThrust = this.paddling || this.engineOff ? 1.2 : S.accel * this.mods.thrust * (this.boosting ? 1.5 : 1); // m/s^2
    const leak = this.hull < 30 ? 0.7 : 1;
    if (!this.tied) {
      this.vel.addScaledVector(fwdDir, this.throttle * maxThrust * leak * dt);
      // drag: low along the keel, high sideways
      const vf = this.vel.dot(fwdDir), vs = this.vel.dot(side);
      // quadratic drag tuned so full throttle settles at this hull's top speed
      const kq = Math.max(0.004, (maxThrust * leak - 0.25 * top) / (top * top));
      const foil = S.foil && Math.abs(vf) > S.foil ? 0.6 : 1;
      // hard turns at speed let the stern slide out (lower side grip), so the boat drifts a little
      const turnHard = Math.abs(this.rudder) > 0.7 && Math.abs(vf) > 6 ? 1 : 0;
      const dragF = (0.25 + Math.abs(vf) * kq) * foil, dragS = 2.6 - turnHard * 1.5;
      this.vel.addScaledVector(fwdDir, -vf * dragF * dt).addScaledVector(side, -vs * dragS * dt);
      // drift with the wind a little
      const w = this.ctx.weather.windVec;
      this.vel.x += w.x * this.ctx.weather.cur.wind * 0.08 * dt;
      this.vel.z += w.y * this.ctx.weather.cur.wind * 0.08 * dt;
      this.speed = this.vel.length();
      const steer = this.rudder * (0.25 + Math.min(Math.abs(vf), 5) * 0.28) * Math.sign(vf || 1) * (S.turn / 1.1) * (this.air ? 0.2 : 1);
      this.yawRate = damp(this.yawRate, steer + (this.paddling ? this.rudder * 0.25 : 0), 3, dt);
      this.heading += this.yawRate * dt;
      // swept hull: sub-steps of at most 0.25 m, and three circles along the keel (bow, middle, stern), so
      // neither speed nor a low frame rate can carry the boat through a thin raft
      const step = this.vel.length() * dt, nSub = Math.min(12, Math.max(1, Math.ceil(step / 0.25)));
      const half = (this.type?.hull?.length ?? 5.6) * 0.32, r = (this.type?.hull?.beam ?? 1.9) * 0.55;
      let impact = 0;
      for (let k = 0; k < nSub; k++) {
        this.pos.addScaledVector(this.vel, dt / nSub);
        for (const off of [half, 0, -half]) {
          _hc.set(this.pos.x + fwdDir.x * off, 0, this.pos.z + fwdDir.z * off);
          const px = _hc.x, pz = _hc.z;
          impact = Math.max(impact, collision.resolveHull(_hc, off === 0 ? r : r * 0.8, this.vel));
          this.pos.x += _hc.x - px; this.pos.z += _hc.z - pz;
        }
      }
      this._lastImpact = impact;
      // never left inside a raft or wall: slide out to the nearest open water
      if (impact > 0 && collision.hullBlocked(this.pos.x, this.pos.z, r * 0.7)) this.unstick();
      if (impact > 0.25 && impact <= 1.2) { this.scrapeT = (this.scrapeT || 0) - dt; if (this.scrapeT <= 0) { this.scrapeT = 0.5; this.ctx.events.emit('boat:impact', { speed: impact * 0.5, pos: this.pos.clone(), scrape: true }); } }
      if (impact > 1.2) {
        const dmg = (impact - 1.2) * 2 * this.mods.damage * 100 / (S.hull || 100);   // a bump costs a little hull (~12% for a 7 m/s ram)
        this.hull = Math.max(0, this.hull - dmg);
        this.ctx.events.emit('boat:impact', { speed: impact, pos: this.pos.clone() });
        this.ctx.events.emit('shake', Math.min(1, impact / 8));
      }
    } else {
      this.vel.set(0, 0, 0);
      this.speed = 0;
      if (this.tied.follow) {
        const f = this.tied.follow();
        this.pos.x = f.pos.x; this.pos.z = f.pos.z;
        this.heading = f.facing + Math.PI / 2;
      }
    }
    // buoyancy from 4 samples
    const L = 2.4, B = 0.85;
    const hb = waves.sample(this.pos.x + fwdDir.x * L, this.pos.z + fwdDir.z * L, _s)[0];
    const hs = waves.sample(this.pos.x - fwdDir.x * L, this.pos.z - fwdDir.z * L, _s)[0];
    const hp = waves.sample(this.pos.x + side.x * B, this.pos.z + side.z * B, _s)[0];
    const hq = waves.sample(this.pos.x - side.x * B, this.pos.z - side.z * B, _s)[0];
    const sink = this.hull < 15 ? 0.25 : 0;
    const ty = (hb + hs + hp + hq) / 4 - 0.18 - sink;
    // ramps: a collapsed slab under the bow at speed launches the boat
    const ramp = this.ctx.fleet?.rampAt(this.pos, fwdDir);
    if (!this.air && ramp && this.speed > 5) { this.air = { vy: Math.min(9, this.speed * 0.55 * ramp.k), y: this.heave + ramp.h }; this.ctx.events.emit('boat:jump', { speed: this.speed }); }
    const foilLift = S.foil && this.speed > S.foil ? Math.min(0.55, (this.speed - S.foil) * 0.08) : 0;
    if (this.air) {
      this.air.vy -= 14 * dt; this.air.y += this.air.vy * dt;
      if (this.air.y <= ty && this.air.vy < 0) { const hit = -this.air.vy; this.air = null; this.heave = ty; this.ctx.events.emit('splash', { pos: this.pos.clone(), big: true }); this.ctx.events.emit('shake', Math.min(1.2, hit / 8)); if (hit > 8) this.hull = Math.max(0, this.hull - (hit - 8) * 2 * 100 / (S.hull || 100)); }
      else this.heave = this.air.y;
    } else this.heave = damp(this.heave, ty + foilLift, 5, dt);
    this.pos.y = this.heave;
    // planing: the bow climbs onto its own wave as speed builds, then levels once the hull is up and planing
    const hump = Math.max(0, Math.min(1, (this.speed - 2) / 3)) * (1 - Math.max(0, Math.min(1, (this.speed - 7) / 5)));
    const tp = (this.air ? Math.max(-0.35, Math.min(0.35, this.air.vy * 0.04)) : Math.atan2(hb - hs, L * 2)) - this.throttle * 0.05 * (this.paddling ? 0 : 1) * (S.top > 12 ? 1.6 : 1) - hump * 0.06;
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
    this.spot.intensity = this.spotOn && this.upgrades.spotlight ? 400 : 0;
  }
}

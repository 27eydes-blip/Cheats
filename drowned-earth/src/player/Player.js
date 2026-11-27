import * as THREE from 'three';
import { clamp, damp } from '../core/rng.js';

// First-person body: walking with stairs and moving platforms, swimming at the
// surface, free diving with buoyancy, ladder climbing, and seated in the boat.
const UP = new THREE.Vector3(0, 1, 0);
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _w = new THREE.Vector3();

export class Player {
  constructor(ctx) {
    this.ctx = ctx;
    this.position = new THREE.Vector3(0, 1, 0);
    this.velocity = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.mode = 'boat';             // foot | swim | boat | climb | locked
    this.height = 1.72; this.radius = 0.32; this.eyeHeight = 1.6;
    this.crouch = 0;
    this.grounded = false;
    this.groundBody = null;
    this.groundLocal = new THREE.Vector3();
    this.groundTag = 'solid';
    this.climbState = null;
    this.bobPhase = 0; this.stepDist = 0;
    this.eye = new THREE.Vector3();
    this.forward = new THREE.Vector3(0, 0, -1);
    this.flashlight = false;
    this.headUnder = false;
    this.depth = 0;
    this.wet = 0;
    this.lastSafe = new THREE.Vector3();
    this.colRes = {};
    this.sprintTime = 0;
    this.swimStroke = 0;
  }
  get inWater() { return this.mode === 'swim'; }
  look(dx, dy) {
    const s = 0.0022 * this.ctx.settings.lookSensitivity;
    this.yaw -= dx * s;
    this.pitch = clamp(this.pitch - dy * s * (this.ctx.settings.invertY ? -1 : 1), -1.45, 1.45);
  }
  teleport(p, yaw) { this.position.copy(p); this.velocity.set(0, 0, 0); if (yaw !== undefined) this.yaw = yaw; this.groundBody = null; }

  climb(from, to, step, down = false) {
    if (this.mode === 'boat') return;
    const dur = Math.max(0.8, from.distanceTo(to) / (down ? 2.4 : 1.6));
    this.mode = 'climb';
    this.climbState = { from: this.position.clone(), a: from.clone(), b: to.clone(), step: step ? step.clone() : null, t: 0, dur };
    this.ctx.events.emit('climb', { down });
  }

  update(dt) {
    const { input, waves, collision, survival } = this.ctx;
    if (this.mode !== 'locked') this.look(input.look.x, input.look.y);
    _f.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _r.set(-_f.z, 0, _f.x);
    const surface = waves.height(this.position.x, this.position.z);
    const slow = survival ? survival.moveFactor() : 1;

    if (this.mode === 'climb') this.updateClimb(dt);
    else if (this.mode === 'foot') {
      const crouching = input.held.crouch;
      this.crouch = damp(this.crouch, crouching ? 1 : 0, 10, dt);
      const sprint = input.held.sprint && !crouching && input.move.y > 0 && (survival ? survival.canSprint() : true);
      this.sprintTime = sprint ? this.sprintTime + dt : 0;
      const speed = (crouching ? 1.6 : sprint ? 5.6 : 3.1) * slow;
      _w.set(0, 0, 0).addScaledVector(_f, input.move.y).addScaledVector(_r, input.move.x);
      const accel = this.grounded ? 12 : 2.5;
      this.velocity.x = damp(this.velocity.x, _w.x * speed, accel, dt);
      this.velocity.z = damp(this.velocity.z, _w.z * speed, accel, dt);
      if (input.pressed('dive') && this.grounded) this.velocity.y = 4.6;
      this.velocity.y -= 18 * dt;
      this.carryWithPlatform();
      this.position.addScaledVector(this.velocity, dt);
      this.height = 1.72 - this.crouch * 0.6;
      const wasGrounded = this.grounded;
      const r = collision.resolveCylinder(this.position, this.radius, this.height, this.velocity, 0.45, this.colRes);
      this.grounded = r.grounded;
      this.setGround(r.groundBody);
      if (!wasGrounded && this.grounded) this.ctx.events.emit('land', { speed: -this.velocity.y });
      // fell into the water?
      if (this.position.y < surface - 0.9 && !this.grounded) this.enterWater();
      if (this.grounded) {
        const hs = Math.hypot(this.velocity.x, this.velocity.z);
        this.stepDist += hs * dt;
        this.bobPhase += hs * dt * 2.1;
        if (this.stepDist > (sprint ? 1.6 : 1.25)) { this.stepDist = 0; this.ctx.events.emit('footstep', { pos: this.position, surface: this.position.y < surface + 0.12 ? 'water' : this.groundTag, speed: hs }); }
        if (this.position.y > surface + 0.2 && !this.groundBody) this.lastSafe.copy(this.position);
      }
      if (this.position.y < -200) this.teleport(this.lastSafe);
    } else if (this.mode === 'swim') this.updateSwim(dt, surface, slow);
    else if (this.mode === 'boat') {
      this.ctx.boat.seatPosition(this.position);
      this.velocity.set(0, 0, 0);
    }

    // eye + view vector
    const bob = this.mode === 'foot' && this.grounded && !this.ctx.settings.reduceMotion ? Math.sin(this.bobPhase * Math.PI) * 0.035 : 0;
    const eyeH = this.mode === 'swim' ? 0 : (this.mode === 'boat' ? 0 : this.eyeHeight - this.crouch * 0.55);
    this.eye.copy(this.position); this.eye.y += eyeH + bob;
    this.forward.set(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const surfEye = waves.height(this.eye.x, this.eye.z);
    this.headUnder = this.eye.y < surfEye - 0.05;
    this.depth = Math.max(0, surfEye - this.eye.y);
    this.wet = this.mode === 'swim' ? 1 : Math.max(0, this.wet - dt * 0.004);
    if (input.pressed('light') && !(this.mode === 'boat' && this.ctx.boat.hasLanternRig)) { this.flashlight = !this.flashlight; this.ctx.events.emit('flashlight', this.flashlight); }
  }

  setGround(body) {
    this.groundBody = body;
    if (body) {
      this.groundTag = body.tag || 'wood';
      body.object.updateMatrixWorld();
      this.groundLocal.copy(this.position).applyMatrix4(new THREE.Matrix4().copy(body.object.matrixWorld).invert());
    } else {
      const g = this.colRes;
      this.groundTag = g.grounded ? 'concrete' : 'solid';
    }
  }
  carryWithPlatform() {
    if (!this.groundBody) return;
    const o = this.groundBody.object;
    o.updateMatrixWorld();
    const now = this.groundLocal.clone().applyMatrix4(o.matrixWorld);
    // follow the platform; keep player's own motion separate
    this.position.x = now.x; this.position.z = now.z;
    if (this.velocity.y <= 0) this.position.y = Math.max(this.position.y, now.y);
  }

  enterWater() {
    if (this.mode === 'swim') return;
    this.mode = 'swim';
    this.groundBody = null;
    this.velocity.multiplyScalar(0.3);
    this.ctx.events.emit('splash', { pos: this.position.clone(), big: true });
  }

  updateSwim(dt, surface, slow) {
    const { input, collision } = this.ctx;
    const under = this.position.y < surface - 0.55;
    const fwd = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(under ? this.pitch : 0, this.yaw, 0, 'YXZ'));
    const right = _r;
    const fast = input.held.sprint;
    const speed = (fast ? 2.6 : 1.6) * slow;
    _w.set(0, 0, 0).addScaledVector(fwd, input.move.y).addScaledVector(right, input.move.x);
    if (input.held.dive) _w.y -= 1;
    if (input.held.crouch) _w.y += 1;
    this.velocity.x = damp(this.velocity.x, _w.x * speed, 3, dt);
    this.velocity.z = damp(this.velocity.z, _w.z * speed, 3, dt);
    const targetVy = _w.y * speed;
    // gentle buoyancy toward the surface when idle; head floats at the surface
    const floatY = surface - 0.15;
    if (!under && !input.held.dive) {
      this.velocity.y = damp(this.velocity.y, (floatY - this.position.y) * 4, 6, dt);
    } else {
      const buoy = input.held.dive ? 0 : 0.35;
      this.velocity.y = damp(this.velocity.y, targetVy + buoy, 3, dt);
    }
    if (input.pressed('dive') && !under) { this.velocity.y = -2.2; this.ctx.events.emit('splash', { pos: this.position.clone(), big: false }); }
    this.position.addScaledVector(this.velocity, dt);
    // collide as a short cylinder centered on the swimmer
    const p = this.position.clone(); p.y -= 0.6;
    const vy = this.velocity.y;
    collision.resolveCylinder(p, 0.35, 1.2, this.velocity, 0.0, this.colRes);
    this.position.x = p.x; this.position.z = p.z;
    if (this.colRes.grounded) { this.position.y = Math.max(this.position.y, p.y + 0.6); this.velocity.y = Math.max(0, vy); }
    if (this.position.y > floatY + 0.1) this.position.y = floatY + 0.1;
    const sea = this.ctx.worldMap.seabedAt(this.position.x, this.position.z);
    if (this.position.y < sea + 0.4) { this.position.y = sea + 0.4; this.velocity.y = Math.max(0, this.velocity.y); }
    this.swimStroke += Math.hypot(this.velocity.x, this.velocity.z) * dt;
    if (this.swimStroke > 1.4) { this.swimStroke = 0; this.ctx.events.emit('swimstroke', { pos: this.position, under }); if (!under) this.ctx.water.ripple(this.position.x, this.position.z, 0.6); }
    // climb out: if there is ground at roughly surface height in front
    const ahead = this.position.clone().addScaledVector(_f, 0.6);
    const g = collision.groundAt(ahead.x, ahead.z, surface + 1.3);
    if (!under && g > surface - 0.5 && g < surface + 1.3 && input.move.y > 0.3) {
      this.mode = 'foot';
      this.position.set(ahead.x, g + 0.02, ahead.z);
      this.velocity.set(0, 0, 0);
      this.ctx.events.emit('climbout', {});
    }
    // also climb onto rafts (dynamic bodies)
    if (!under && input.move.y > 0.3) {
      const test = ahead.clone(); test.y = surface - 0.3;
      const v0 = new THREE.Vector3(0, -1, 0);
      const r = collision.resolveCylinder(test, 0.2, 0.2, v0, 2.0, {});
      if (r.groundBody && test.y > surface - 0.2 && test.y < surface + 1.9) {
        this.mode = 'foot'; this.position.copy(test); this.velocity.set(0, 0, 0); this.setGround(r.groundBody);
        this.ctx.events.emit('climbout', {});
      }
    }
  }

  updateClimb(dt) {
    const c = this.climbState;
    c.t += dt;
    const lead = 0.35; // move from current spot to the ladder foot first
    if (c.t < lead) this.position.lerpVectors(c.from, c.a, c.t / lead);
    else {
      const k = clamp((c.t - lead) / c.dur, 0, 1);
      this.position.lerpVectors(c.a, c.b, k);
      if (Math.floor(k * c.dur * 3) !== Math.floor(((c.t - lead - dt) / c.dur) * c.dur * 3)) this.ctx.events.emit('footstep', { pos: this.position, surface: 'metal', speed: 1 });
      if (k >= 1) {
        this.climbState = null;
        if (c.step) this.position.copy(c.step);
        const surface = this.ctx.waves.height(this.position.x, this.position.z);
        if (this.position.y < surface - 0.3) this.enterWater();
        else this.mode = 'foot';
        this.velocity.set(0, 0, 0);
      }
    }
  }
}

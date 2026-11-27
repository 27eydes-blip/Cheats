import * as THREE from 'three';
import { damp } from '../core/rng.js';

// First-person camera with sway (fatigue), shiver (cold), impact shake, plus an
// optional third-person chase view while piloting the boat.
export class CameraRig {
  constructor(ctx, camera) {
    this.ctx = ctx;
    this.camera = camera;
    this.thirdPerson = false;
    this.shake = 0;
    this.tpDist = 9;
    this.tpYaw = 0; this.tpPitch = -0.25;
    this.smoothPos = new THREE.Vector3();
    this.t = 0;
    ctx.events.on('boat:impact', (e) => { this.shake = Math.min(1, this.shake + e.speed * 0.15); });
    ctx.events.on('shake', (s) => { this.shake = Math.min(1.5, this.shake + s); });
  }
  toggleView() {
    if (this.ctx.player.mode !== 'boat') return;
    this.thirdPerson = !this.thirdPerson;
    this.tpYaw = 0; this.tpPitch = -0.22;
  }
  update(dt) {
    const { player, boat, survival } = this.ctx;
    const cam = this.camera;
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt * 1.2);
    if (player.mode !== 'boat') this.thirdPerson = false;
    const fatigue = survival ? survival.swayAmount() : 0;
    const shiver = survival ? survival.shiverAmount() : 0;
    const swayX = Math.sin(this.t * 0.7) * 0.012 * fatigue + Math.sin(this.t * 31) * 0.0025 * shiver;
    const swayY = Math.sin(this.t * 0.53 + 1) * 0.009 * fatigue + Math.sin(this.t * 27 + 2) * 0.002 * shiver;
    const sh = this.shake * this.shake;
    const shx = (Math.random() - 0.5) * 0.05 * sh, shy = (Math.random() - 0.5) * 0.05 * sh;

    if (this.thirdPerson) {
      const target = boat.pos.clone(); target.y += 1.4;
      const yaw = boat.heading + this.tpYaw;
      this.tpYaw -= this.ctx.input.look.x * 0.003;
      this.tpPitch = THREE.MathUtils.clamp(this.tpPitch - this.ctx.input.look.y * 0.003, -0.9, 0.2);
      const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(this.tpPitch), -Math.sin(this.tpPitch), Math.cos(yaw) * Math.cos(this.tpPitch));
      const free = this.ctx.collision.raycast(target, dir, this.tpDist);
      const want = target.clone().addScaledVector(dir, Math.max(2, free - 0.4));
      const surf = this.ctx.waves.height(want.x, want.z);
      want.y = Math.max(want.y, surf + 0.6);
      this.smoothPos.lerp(want, 1 - Math.exp(-dt * 8));
      if (this.smoothPos.distanceTo(want) > 30) this.smoothPos.copy(want);
      cam.position.copy(this.smoothPos);
      cam.lookAt(target);
      cam.rotation.z += shx;
      // keep the player's yaw in sync so first-person resumes looking forward
      player.yaw = yaw + Math.PI;
      player.pitch = 0;
    } else {
      if (player.mode === 'boat') {
        // seated: look is relative to the world but rocks with the hull
        cam.position.copy(player.position);
        cam.position.y += 1.05;
        const boatRoll = boat.roll * 0.6, boatPitch = boat.pitch * 0.6;
        cam.rotation.set(player.pitch + boatPitch + swayY + shy, player.yaw + swayX + shx, -boatRoll, 'YXZ');
        player.eye.copy(cam.position);
      } else {
        cam.position.copy(player.eye);
        let roll = 0;
        if (player.mode === 'swim' && !player.headUnder) roll = Math.sin(this.t * 1.3) * 0.02;
        cam.rotation.set(player.pitch + swayY + shy, player.yaw + swayX + shx, roll + Math.sin(this.t * 0.4) * 0.006 * fatigue, 'YXZ');
      }
      this.smoothPos.copy(cam.position);
    }
    cam.updateMatrixWorld();
  }
}

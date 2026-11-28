import * as THREE from 'three';
import { damp } from '../core/rng.js';

// First-person camera with handheld drift, breathing, stride sway, sway
// (fatigue), shiver (cold), impact shake, plus an
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
  // Title / life-sim backdrop: a slow dawn flight over the drowned district.
  cinematic(dt) {
    if (!this.path) {
      const P = [[-300, 9, 330], [-150, 14, 180], [-40, 22, 120], [120, 30, 20], [260, 16, 140], [330, 9, 330], [120, 7, 360], [-120, 12, 420]];
      this.path = new THREE.CatmullRomCurve3(P.map(([x, y, z]) => new THREE.Vector3(x, y, z)), true, 'centripetal');
      this.ct = 0;
    }
    this.ct = (this.ct + dt * 0.006) % 1;
    const p = this.path.getPointAt(this.ct), q = this.path.getPointAt((this.ct + 0.02) % 1);
    const cam = this.camera;
    cam.position.copy(p);
    const look = q.clone(); look.y = p.y - 3 + Math.sin(this.t * 0.1) * 2;
    cam.lookAt(look);
    cam.updateMatrixWorld();
    this.ctx.player.eye.copy(cam.position);
  }
  update(dt) {
    const { player, boat, survival } = this.ctx;
    const cam = this.camera;
    this.t += dt;
    if (this.ctx.mode && this.ctx.mode !== 'play') { this.cinematic(dt); return; }
    const calm = this.ctx.settings.reduceMotion ? 0 : 1;
    this.shake = Math.max(0, this.shake - dt * 1.2);
    if (player.mode !== 'boat') this.thirdPerson = false;
    const fatigue = (survival ? survival.swayAmount() : 0) * calm;
    const shiver = (survival ? survival.shiverAmount() : 0) * calm;
    const swayX = Math.sin(this.t * 0.7) * 0.012 * fatigue + Math.sin(this.t * 31) * 0.0025 * shiver;
    const swayY = Math.sin(this.t * 0.53 + 1) * 0.009 * fatigue + Math.sin(this.t * 27 + 2) * 0.002 * shiver;
    // handheld: a slow, never-repeating drift, like a camera held by a person
    const n = (a, b, c) => Math.sin(this.t * a) * 0.6 + Math.sin(this.t * b + 1.3) * 0.3 + Math.sin(this.t * c + 2.1) * 0.1;
    const exert = Math.min(1, (player.sprintTime || 0) * 0.25 + (survival ? survival.swayAmount() * 0.5 : 0));
    const hand = 0.0016 * calm;
    const breath = Math.sin(this.t * (1.55 + exert * 1.5)) * (0.0014 + exert * 0.0045) * calm;
    // footstep sway: the head rolls and drifts with each stride
    const bp = player.bobPhase || 0;
    this.moveK = damp(this.moveK || 0, Math.abs(bp - (this.lastBp ?? bp)) > 1e-4 && player.mode === 'foot' ? 1 : 0, 6, dt);
    this.lastBp = bp;
    const stepRoll = Math.sin(bp * Math.PI * 0.5) * 0.0065 * this.moveK * calm;
    const stepYaw = Math.sin(bp * Math.PI * 0.5 + 0.6) * 0.0035 * this.moveK * calm;
    const hpx = n(0.83, 1.91, 3.7) * hand + breath, hpy = n(0.61, 1.37, 2.9) * hand + stepYaw, hpr = n(0.47, 1.13, 2.3) * hand * 0.8 + stepRoll;
    const sh = this.shake * this.shake * calm;
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
        cam.rotation.set(player.pitch + boatPitch + swayY + shy + hpx * 0.7, player.yaw + swayX + shx + hpy * 0.7, -boatRoll + hpr * 0.7, 'YXZ');
        player.eye.copy(cam.position);
      } else {
        cam.position.copy(player.eye);
        let roll = 0;
        if (player.mode === 'swim' && !player.headUnder) roll = Math.sin(this.t * 1.3) * 0.02;
        cam.rotation.set(player.pitch + swayY + shy + hpx, player.yaw + swayX + shx + hpy, roll + hpr + Math.sin(this.t * 0.4) * 0.006 * fatigue, 'YXZ');
      }
      this.smoothPos.copy(cam.position);
    }
    // boats: the view widens a little with speed and gets a slight wave judder (off with reduce-motion)
    if (!this.ctx.arms?.cur) {
      const onBoat = player.mode === 'boat';
      const want = onBoat ? 70 + Math.min(9, boat.speed * 0.55) * calm : 70;
      if (Math.abs(cam.fov - want) > 0.02) { cam.fov += (want - cam.fov) * Math.min(1, dt * 2.5); cam.updateProjectionMatrix(); }
      if (onBoat && calm > 0) {
        const dp = Math.abs(boat.pitch - (this.lastBoatPitch ?? boat.pitch)) / Math.max(dt, 1e-3); this.lastBoatPitch = boat.pitch;
        const j = Math.min(0.006, dp * 0.004 + boat.speed * 0.00025) * calm;
        cam.position.y += Math.sin(this.t * 23.0) * j; cam.rotation.z += Math.sin(this.t * 17.0 + 1.3) * j * 0.6;
      }
    }
    cam.updateMatrixWorld();
  }
}

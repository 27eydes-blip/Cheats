// Player physics (tap-to-flap, asymmetric gravity, terminal velocity, gravity flip,
// mini mode) driving a CharacterRig for visuals.
import { PHYSICS } from "../config.js";
import { CharacterRig } from "./CharacterRig.js";

export class Player {
  constructor(scene, def, fx, { x, y, lowGfx }) {
    this.scene = scene;
    this.def = def;
    this.x = x;
    this.startY = y;
    this.rig = new CharacterRig(scene, def, fx, { x, y, lowGfx, depth: 30 });
    this.reset();
  }

  reset() {
    this.y = this.startY;
    this.vy = 0;
    this.gravityDir = 1;
    this.miniT = 0;
    this.sizeMul = 1;
    this.alive = true;
    this.hoverT = 0;
    this.rig.reset(this.x, this.y);
    this.rig.angle = 0;
  }

  get radius() {
    return PHYSICS.radius * this.sizeMul;
  }

  get mini() {
    return this.miniT > 0;
  }

  flap() {
    if (!this.alive) return;
    const mul = this.mini ? PHYSICS.miniFlapMul : 1;
    this.vy = PHYSICS.flapVelocity * mul * this.gravityDir;
    this.rig.gravityDir = this.gravityDir;
    this.rig.flap();
  }

  flipGravity(dir) {
    this.gravityDir = dir;
    this.rig.gravityDir = dir;
    this.vy *= 0.35;
  }

  makeMini() {
    this.miniT = PHYSICS.miniDuration;
  }

  /** Idle hover before the first tap. */
  hover(dt, scroll) {
    this.hoverT += dt;
    this.y = this.startY + Math.sin(this.hoverT * 3) * 14;
    this.rig.setPosition(this.x, this.y);
    this.rig.angle = Math.sin(this.hoverT * 3 + 1) * 6;
    this.rig.update(dt, scroll);
  }

  update(dt, scroll) {
    if (this.alive) {
      // mini timer with smooth size easing
      if (this.miniT > 0) this.miniT = Math.max(0, this.miniT - dt);
      const targetSize = this.miniT > 0 ? PHYSICS.miniScale : 1;
      this.sizeMul += (targetSize - this.sizeMul) * Math.min(1, dt * 10);

      // Physics advances in steps no longer than 1/60 s, so a long frame (Low Power Mode at
      // 30 fps, a hitch) flies exactly like two 60 fps frames: same jump height everywhere.
      const n = Math.max(1, Math.round(dt * 60));
      for (let i = 0; i < n; i++) this.integrate(dt / n);

      // tilt follows velocity, smoothed for buttery motion
      const target =
        Math.max(-28, Math.min(62, ((this.vy * this.gravityDir) / 1000) * 60)) * this.gravityDir;
      this.rig.angle += (target - this.rig.angle) * Math.min(1, dt * 12);
    }
    this.rig.sizeMul = this.sizeMul;
    this.rig.setPosition(this.x, this.y);
    this.rig.update(dt, scroll);
  }

  /** One semi-implicit Euler step of the flight physics. */
  integrate(dt) {
    const gmul = this.mini ? PHYSICS.miniGravityMul : 1;
    const rising = this.vy * this.gravityDir < 0;
    const g = (rising ? PHYSICS.gravityUp : PHYSICS.gravityDown) * gmul * this.gravityDir;
    this.vy += g * dt;
    // terminal velocities (relative to gravity direction)
    const fall = this.vy * this.gravityDir;
    if (fall > PHYSICS.terminalFall) this.vy = PHYSICS.terminalFall * this.gravityDir;
    if (fall < PHYSICS.terminalRise) this.vy = PHYSICS.terminalRise * this.gravityDir;
    this.y += this.vy * dt;
  }

  die() {
    this.alive = false;
    return this.rig.die();
  }
}

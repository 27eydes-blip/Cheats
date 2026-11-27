import * as THREE from 'three';

// What the player gives away. Every frame this collects the player's noise
// (with where it came from), light (and which way it points), blood in the
// water and the smell of open food, so each creature can weigh them with its
// own senses. One-off noises (a splash, a dropped tool, a ping) are pushed in
// as events and decay.
export class Senses {
  constructor(ctx) {
    this.ctx = ctx;
    this.noise = 0;            // continuous noise 0..1 (movement, engine)
    this.burst = 0;            // decaying one-off noise 0..1
    this.noisePos = new THREE.Vector3();
    this.light = 0;            // 0..1 strength of the light the player carries
    this.lightDir = new THREE.Vector3(0, 0, -1);
    this.lightPos = new THREE.Vector3();
    this.blood = 0;            // bleeding into the water
    this.food = 0;             // smell of open food
    this.running = false;
    this.still = 0;            // seconds standing still
    this.log = [];
    const ev = ctx.events;
    ev.on('footstep', (e) => { if (e.speed > 4.5) this.push(0.45, e.pos); });
    ev.on('splash', (e) => this.push(e.big ? 0.9 : 0.55, e.pos));
    ev.on('boat:impact', () => this.push(0.9, ctx.boat.pos));
    ev.on('talk', () => this.push(0.35, ctx.player.position));
    ev.on('craft', () => this.push(0.6, ctx.player.position));
    ev.on('noise', (e) => this.push(e.level ?? 0.7, e.pos || ctx.player.position));
  }
  push(level, pos) {
    if (level >= this.burst) { this.burst = Math.min(1, level); this.noisePos.copy(pos || this.ctx.player.position); }
  }
  update(dt) {
    const { player, input, boat, survival, inventory, atmosphere } = this.ctx;
    // continuous noise from how you move
    let n = 0;
    const hs = Math.hypot(player.velocity.x, player.velocity.z);
    if (player.mode === 'foot') {
      const crouch = input.held.crouch;
      n = crouch ? 0.04 : hs > 4.5 ? 0.6 : hs > 0.4 ? 0.2 : 0;
      this.running = hs > 4.5;
    } else if (player.mode === 'swim') {
      n = input.held.sprint ? 0.55 : hs > 1.2 ? 0.2 : hs > 0.2 ? 0.07 : 0;
      if (survival.tanks && input.held.sprint) n = Math.max(n, 0.7); // regulator roar
      this.running = input.held.sprint;
    } else if (player.mode === 'boat') {
      n = boat.engineOff || boat.paddling ? 0.08 : Math.min(1, boat.noise() / 120);
      this.running = false;
    }
    this.noise += (n - this.noise) * Math.min(1, dt * 4);
    this.burst = Math.max(0, this.burst - dt * 0.35);
    if (this.noise > 0.15 && this.burst < this.noise) this.noisePos.copy(player.mode === 'boat' ? boat.pos : player.position);
    this.still = hs < 0.15 && player.mode !== 'boat' ? this.still + dt : 0;
    // light: flashlight in hand, or the boat lantern
    this.light = player.flashlight ? 1 : boat.lantern && player.mode === 'boat' ? 0.6 : 0;
    this.ctx.camera.getWorldDirection(this.lightDir);
    this.lightPos.copy(this.ctx.camera.position);
    // blood and food
    const inj = this.ctx.injury;
    this.blood = inj ? inj.bleeding : 0;
    let open = 0;
    for (const [id, n2] of Object.entries(inventory.items || {})) {
      const d = inventory.def(id);
      if (d?.tags?.includes('food') && !d.sealed && !['salt', 'kelp'].includes(id)) open += n2;
    }
    this.food = Math.min(1, open / 4);
    this.underwater = atmosphere.underwater;
  }
  // loudness of the player at a point, given a creature's hearing weight
  heardAt(pos, hearing, range = 40) {
    const lvl = Math.max(this.noise, this.burst);
    if (lvl <= 0.01 || hearing <= 0) return 0;
    const d = pos.distanceTo(this.noisePos);
    // water carries sound further
    const r = range * (this.underwater ? 1.5 : 1) * (0.5 + lvl);
    return Math.max(0, 1 - d / r) * lvl * hearing;
  }
  // is the player's light pointed at this point (and close enough to matter)?
  lightOn(pos, range = 22) {
    if (this.light <= 0) return 0;
    const to = _v.copy(pos).sub(this.lightPos);
    const d = to.length();
    if (d > range) return 0;
    const c = to.normalize().dot(this.lightDir);
    return c > 0.86 ? this.light * (1 - d / range) * (c - 0.86) / 0.14 : this.light * 0.15 * (1 - d / range); // in the beam / just being lit
  }
}
const _v = new THREE.Vector3();

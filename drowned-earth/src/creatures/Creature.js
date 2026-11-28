import * as THREE from 'three';

// One territorial creature (or one swarm / shoal / pack treated as a unit).
//
//   idle ──notice──▶ alert ──closer / louder──▶ warning ──stays / runs / light──▶ attack
//    ▲                 │ calm                     │ backs off                       │ leaves territory+leash,
//    └──── return ◀────┴──────────────────────────┴─────────────────────────────────┘ or driven off
//
// Creatures never wander the map hunting the player: everything is relative
// to a home point, and an attack ends at the edge of territory + leash.
export const STATES = ['idle', 'alert', 'warning', 'attack', 'return'];

export class Creature {
  constructor(mgr, spec, place, body) {
    this.mgr = mgr; this.ctx = mgr.ctx;
    this.spec = spec; this.place = place; this.kind = place.species;
    this.id = place.id;
    this.home = new THREE.Vector3(place.x ?? 0, -(place.depth ?? 0), place.z ?? 0);
    this.pos = this.home.clone();
    this.vel = new THREE.Vector3();
    this.heading = Math.random() * 6.28;
    this.state = 'idle';
    this.stateT = 0;
    this.threat = 0;        // smoothed perceived threat 0..1
    this.reason = '';
    this.wary = 0;          // after an incident, quicker to alert
    this.cool = 0;          // attack cooldown
    this.health = spec.health ?? (place.species === 'siltwolf' ? 60 : place.species === 'gullrat' ? 30 : place.species === 'needlefish' ? 25 : 9999);
    this.target = new THREE.Vector3();
    this.lure = null;       // bait or noisemaker drawing it away
    this.body = body;       // species visuals + hooks
    this.t = Math.random() * 100;
    this.awake = true;
    this.active = false;
    this.mood = { hungry: Math.random() < 0.3, young: !!spec.pups };
  }

  setState(s, why = '') {
    if (s === this.state) return;
    this.mgr.logTransition(this, this.state, s, why);
    this.state = s; this.stateT = 0; this.reason = why;
    this.body.onState?.(this, s);
    this.mgr.noteSeen(this, s);
  }

  // weigh what the senses report, in this species' terms
  perceive(dt) {
    const S = this.mgr.senses, sp = this.spec, se = sp.senses || {};
    const p = this.ctx.player.position;
    const d = this.pos.distanceTo(p);
    const dHome = Math.hypot(p.x - this.home.x, p.z - this.home.z);
    const inTerritory = dHome < sp.territoryR;
    let s = 0, why = '';
    const add = (v, w) => { if (v > s) { s = v; why = w; } };
    // hearing (a sprint, an engine, a splash, a dropped tool)
    add(S.heardAt(this.pos, se.hearing || 0, sp.alertR * 1.6), 'noise');
    // sight, in a forward cone (blind species have vision 0)
    if (se.vision > 0 && d < sp.alertR * 1.3) {
      const fwd = _f.set(Math.sin(this.heading), 0, Math.cos(this.heading));
      const to = _t.copy(p).sub(this.pos).setY(0).normalize();
      const inCone = fwd.dot(to) > 0.3 || d < sp.warnR * 1.5; // peripheral: close movement is always seen
      const dim = this.ctx.time.out.night > 0.6 && S.light <= 0 ? 0.45 : 1; // harder to see you in the dark
      const crouch = this.ctx.input.held.crouch ? 0.55 : 1;
      if (inCone) add(se.vision * (1 - d / (sp.alertR * 1.3)) * dim * crouch, 'sight');
    }
    // light in its face (repels some, enrages others)
    const lit = S.lightOn(this.pos);
    if (se.light > 0) add(lit * se.light, 'light');
    this.litRepel = se.light < 0 ? lit * -se.light : 0;
    // blood in the water, the smell of open food
    if (se.blood && S.blood > 0.05 && (S.underwater || this.spec.kind === 'pack')) add(S.blood * se.blood * Math.max(0, 1 - d / (sp.alertR * 2)), 'blood');
    if (se.food && S.food > 0) add(S.food * se.food * Math.max(0, 1 - d / sp.alertR), 'food');
    // vibration: swimming hard nearby
    if (se.vibration && S.underwater && S.noise > 0.15) add(se.vibration * S.noise * Math.max(0, 1 - d / sp.alertR), 'vibration');
    // just being close: the warning radius is personal space
    if (d < sp.warnR) add(0.65 + (sp.warnR - d) / sp.warnR * 0.4, 'too close');
    else if (d < sp.alertR && inTerritory && sp.temperament !== 'ambusher') add(0.3, 'territory');
    // running from a pack makes you prey
    if (this.kind === 'siltwolf' && S.running && d < sp.alertR) add(0.75, 'running');
    s *= 1 + this.wary * 0.5 + (this.ctx.state.glow || 0) * 0.15;
    this.threat += (s - this.threat) * Math.min(1, dt * (s > this.threat ? 6 : 1.2));
    // NPCs out in the world: weigh each actor near the territory the same way
    // (closeness, noise, light, blood); the most provoking one becomes the prey
    let prey = null;
    for (const a of this.mgr.actors || []) {
      if (!a.alive || a.safe) continue;
      const da = this.pos.distanceTo(a.pos);
      if (da > sp.alertR * 1.6) continue;
      const dh = Math.hypot(a.pos.x - this.home.x, a.pos.z - this.home.z);
      let sa = 0, wa = '';
      const addA = (v, w) => { if (v > sa) { sa = v; wa = w; } };
      if (da < sp.warnR) addA(0.65 + (sp.warnR - da) / sp.warnR * 0.4, 'too close');
      else if (dh < sp.territoryR && sp.temperament !== 'ambusher') addA(0.32, 'territory');
      addA((se.hearing || 0) * a.noise * Math.max(0, 1 - da / (sp.alertR * 1.6)), 'noise');
      if (a.light && se.light > 0) addA(se.light * 0.6 * Math.max(0, 1 - da / 22), 'light');
      if (a.food && se.food) addA(se.food * a.food * Math.max(0, 1 - da / sp.alertR), 'food');
      if (a.blood && se.blood) addA(se.blood * a.blood * Math.max(0, 1 - da / (sp.alertR * 2)), 'blood');
      if (this.kind === 'siltwolf' && a.running && da < sp.alertR) addA(0.75, 'running');
      if (this.prey === a) sa *= 1.3; // stays on the one it was already after
      if (sa > s) { s = sa; why = wa; prey = a; }
    }
    if (prey) {
      s *= 1 + this.wary * 0.5;
      this.threat += (s - this.threat) * Math.min(1, dt * (s > this.threat ? 6 : 1.2));
      const da = this.pos.distanceTo(prey.pos), dh = Math.hypot(prey.pos.x - this.home.x, prey.pos.z - this.home.z);
      this.prey = prey;
      this.perceived = { d: da, dHome: dh, inTerritory: dh < sp.territoryR, why: why + ` (${prey.name})` };
      return why;
    }
    if (this.prey && this.state !== 'attack') this.prey = null;
    if (this.prey && (!this.prey.alive || this.prey.safe)) this.prey = null;
    this.perceived = { d, dHome, inTerritory, why };
    return why;
  }

  update(dt) {
    const sp = this.spec, ctx = this.ctx;
    this.t += dt; this.stateT += dt; this.cool = Math.max(0, this.cool - dt);
    this.wary = Math.max(0, this.wary - dt / 60);
    // diurnal: night creatures sleep by day (and vice versa)
    const night = ctx.time.out.night > 0.5;
    this.awake = sp.active === 'night' ? night || this.state === 'attack' : true;
    if (!this.awake) { this.setState('idle'); this.body.animate(this, dt); return; }
    if (this.stunT > 0) { this.stunT -= dt; this.body.animate(this, dt); return; } // tangled in a net
    const why = this.perceive(dt);
    const { d, dHome, inTerritory } = this.perceived;
    const leashed = dHome > sp.territoryR + sp.leash;
    switch (this.state) {
      case 'idle':
        if (this.threat > 0.28 && (inTerritory || d < sp.alertR) && (this.stateT > 1 || why === 'noise' || why === 'light')) this.setState(sp.temperament === 'ambusher' && d > sp.warnR && why !== 'noise' && why !== 'light' ? 'idle' : 'alert', why);
        // skittish creatures strike when surprised up close
        if (sp.temperament === 'skittish' && d < sp.warnR * 0.55 && this.threat > 0.5) this.setState('attack', 'startled');
        break;
      case 'alert':
        if ((this.threat > 0.55 && this.stateT > 0.6) || d < sp.warnR) this.setState('warning', why);
        else if (this.threat < 0.12 && this.stateT > 3) this.setState('return', 'calm');
        break;
      case 'warning': {
        // a fair chance: back away slowly and it lets you go
        // backing off = your distance from its home keeps growing for a moment
        if (this.lastDH != null) this.backT = dHome > this.lastDH + 0.001 ? (this.backT || 0) + dt : Math.max(0, (this.backT || 0) - dt * 2);
        if (this.backT > 0.8 && d > sp.warnR) { this.backT = 0; this.setState('return', 'you backed off'); }
        else if (this.litRepel > 0.5 && this.kind !== 'listener') this.setState('return', 'driven off by light');
        else if (this.stateT > sp.warnTime && (d < sp.warnR || this.threat > 0.6)) this.setState('attack', why || 'stayed');
        else if (this.threat > 0.95 && (why === 'noise' || why === 'light' || why === 'running' || why === 'blood')) this.setState('attack', why);
        else if (this.threat < 0.15 && this.stateT > 2) this.setState('return', 'calm');
        break;
      }
      case 'attack':
        if (leashed || (!inTerritory && d > sp.warnR * 2.5 && this.stateT > 2)) this.setState('return', 'out of territory');
        else if (this.litRepel > 0.7 && this.spec.senses.light < -0.6) this.setState('return', 'driven off by light');
        else if (this.health <= 0) this.setState('return', 'driven off');
        else if (this.stateT > 12 && d > sp.warnR) this.setState('return', 'out of reach');
        else if (this.kind === 'listener' && this.mgr.senses.noise < 0.06 && this.mgr.senses.burst < 0.05 && this.stateT > 4) this.setState('return', 'lost the sound');
        break;
      case 'return':
        if (this.pos.distanceTo(this.home) < 2.5 && this.stateT > 2) { this.wary = 1; this.setState('idle', 'home'); }
        if (this.stateT > 2 && this.threat > 0.7 && d < sp.warnR) this.setState('warning', why);
        break;
    }
    this.lastD = d; this.lastDH = dHome;
    this.body.move(this, dt);
    if (this.state === 'attack') this.body.attack?.(this, dt);
    this.body.animate(this, dt);
  }

  // shared helper: step toward a point at a speed, keeping inside a radius of home
  steer(goal, speed, dt, { keepY = false, maxR = Infinity } = {}) {
    const dir = _t.copy(goal).sub(this.pos);
    if (keepY) dir.y = 0;
    const l = dir.length();
    if (l > 0.05) {
      dir.multiplyScalar(Math.min(l, speed * dt) / l);
      this.pos.add(dir);
      this.heading = Math.atan2(dir.x, dir.z) || this.heading;
    }
    const off = _f.copy(this.pos).sub(this.home); off.y = 0;
    if (off.length() > maxR) { off.setLength(maxR); this.pos.x = this.home.x + off.x; this.pos.z = this.home.z + off.z; }
  }
  // hurt the player if close enough and ready
  preyPos() { return this.prey ? this.prey.pos : this.ctx.player.position; }
  strike(range, opts = {}) {
    const d = this.pos.distanceTo(this.preyPos());
    if (d > range || this.cool > 0) return false;
    this.cool = this.spec.rate * (0.8 + Math.random() * 0.4);
    if (this.prey) { this.prey.hit(this.spec.damage * (opts.k || 1), { bleed: this.spec.bleed, source: this.kind, lethal: !!this.spec.lethal, breaks: opts.breaks, creature: this }); this.mgr.logTransition(this, 'attack', 'attack', 'struck ' + this.prey.name);
      // territorial, not hungry: once the intruder is down, it usually breaks off
      if (this.prey?.downed && !this.spec.lethal && Math.random() < 0.6) this.setState('return', 'intruder down');
      return true; }
    this.ctx.injury.hit(this.spec.damage * (opts.k || 1), { bleed: this.spec.bleed, source: this.kind, what: this.spec.name.toLowerCase(), lethal: !!this.spec.lethal, breaks: opts.breaks, dirty: true });
    this.mgr.noteSeen(this, 'hurt');
    return true;
  }
  takeDamage(n) {
    this.health -= n;
    this.wary = 1;
    if (this.health <= 0) this.mgr.died(this);
  }
}
const _f = new THREE.Vector3(), _t = new THREE.Vector3();

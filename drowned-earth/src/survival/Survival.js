import { clamp } from '../core/rng.js';

// Needs: thirst, hunger, warmth, rest, oxygen (+ sickness, flashlight battery).
// All 0..100 where 100 = fine. Effects are shown through the world (breath
// fog, sway, shiver, desaturation, heartbeat) plus rare whispered thoughts.
const RATES = { thirst: 100 / (26 * 60), hunger: 100 / (38 * 60), rest: 100 / (48 * 60) };

export class Survival {
  constructor(ctx) {
    this.ctx = ctx;
    this.thirst = 82; this.hunger = 75; this.warmth = 70; this.rest = 72; this.oxygen = 100; this.sick = 0;
    this.battery = 70;
    this.maxOxygen = 100;
    this.oxygenSeconds = 50;
    this.drowning = 0;
    this.warned = {};
    this.blackout = false;
  }
  coldness() { return clamp((60 - this.warmth) / 50, 0, 1) + (this.ctx.time.out.night > 0.5 ? 0.3 : 0) + this.ctx.weather.cur.rain * 0.3; }
  swayAmount() { return clamp((45 - this.rest) / 35, 0, 1) + this.sick * 0.6 + (this.oxygen < 30 ? (30 - this.oxygen) / 30 : 0); }
  shiverAmount() { return clamp((35 - this.warmth) / 30, 0, 1); }
  moveFactor() { return 1 - clamp((20 - Math.min(this.thirst, this.hunger)) / 40, 0, 0.35) - clamp((15 - this.rest) / 40, 0, 0.3); }
  canSprint() { return this.rest > 8 && this.thirst > 5; }
  update(dt) {
    const { player, weather, time, inventory, atmosphere } = this.ctx;
    const exert = player.mode === 'swim' ? 2 : player.sprintTime > 0 ? 2.2 : (player.mode === 'boat' && this.ctx.boat.paddling && Math.abs(this.ctx.boat.throttle) > 0.1) ? 1.8 : 1;
    this.thirst = clamp(this.thirst - RATES.thirst * dt * exert, 0, 100);
    this.hunger = clamp(this.hunger - RATES.hunger * dt * (0.6 + exert * 0.4), 0, 100);
    this.rest = clamp(this.rest - RATES.rest * dt * exert, 0, 100);
    // warmth: weather, night, wet, wind, coat, shelter
    const coat = inventory.has('warm_coat') ? 0.6 : 0;
    const wetK = player.mode === 'swim' ? 1.4 : player.wet * 0.8;
    const night = time.out.night;
    let target = 72 + weather.cur.warmth * 18 - night * 18 - wetK * 35 - weather.cur.wind * 10 + coat * 22;
    if (atmosphere.indoor > 0.5) target += 10;
    if (this.nearFire) target = 90;
    this.warmth += (clamp(target, 0, 100) - this.warmth) * dt * 0.012;
    // flashlight battery
    if (player.flashlight) this.battery = Math.max(0, this.battery - dt * 0.12);
    // oxygen
    if (player.headUnder) {
      this.oxygen = Math.max(0, this.oxygen - (100 / this.oxygenSeconds) * dt * (this.ctx.input.held.sprint ? 1.4 : 1));
      if (this.oxygen <= 0) this.drowning += dt; else this.drowning = 0;
    } else { this.oxygen = Math.min(this.maxOxygen, this.oxygen + dt * 35); this.drowning = 0; }
    if (this.drowning > 4 && !this.blackout) this.blackOut('water');
    // sickness fades slowly
    this.sick = Math.max(0, this.sick - dt * 0.002);
    // threshold whispers
    this.warn('thirst', this.thirst < 25, 'Your mouth is dry. Your tongue sticks.');
    this.warn('hunger', this.hunger < 22, 'Hollow. Your hands are not quite steady.');
    this.warn('cold', this.warmth < 30, 'The cold is in your bones now. Get dry. Find a fire.');
    this.warn('rest', this.rest < 20, 'Your eyes keep closing on their own.');
    this.warn('oxygen', player.headUnder && this.oxygen < 30, 'Lungs burning. Up. Go up.');
    this.warn('battery', player.flashlight && this.battery < 10, 'The flashlight dims to orange.');
    if (this.thirst <= 0 || this.hunger <= 0) { this.starve = (this.starve || 0) + dt; if (this.starve > 90 && !this.blackout) this.blackOut('collapse'); } else this.starve = 0;
    // fire warmth (raft stoves)
    this.nearFire = false;
  }
  warn(key, cond, text) {
    if (cond && !this.warned[key]) { this.warned[key] = true; this.ctx.ui.whisper(text); }
    if (!cond) this.warned[key] = false;
  }
  apply(use) {
    if (use.thirst) this.thirst = clamp(this.thirst + use.thirst, 0, 100);
    if (use.hunger) this.hunger = clamp(this.hunger + use.hunger, 0, 100);
    if (use.warmth) this.warmth = clamp(this.warmth + use.warmth, 0, 100);
    if (use.fatigue) this.rest = clamp(this.rest + use.fatigue, 0, 100);
    if (use.sick) { if (use.sick > 0 && Math.random() < use.sick) { this.sick = Math.min(1, this.sick + 0.5); this.ctx.ui.whisper('Your stomach turns. That water was bad.'); } else if (use.sick < 0) this.sick = 0; }
    if (use.battery) this.battery = 100;
    if (use.boatFuel) this.ctx.boat.refuel(use.boatFuel);
    if (use.hull) this.ctx.boat.repair(use.hull);
  }
  useItem(id) {
    const inv = this.ctx.inventory, d = inv.def(id);
    if (!d?.use || !inv.has(id)) return false;
    if ((d.use.boatFuel || d.use.hull) && this.ctx.player.mode !== 'boat' && !this.nearBoat()) { this.ctx.ui.toast('You need to be at the boat.'); return false; }
    inv.remove(id);
    if (d.returns) inv.add(d.returns, 1, true);
    this.apply(d.use);
    this.ctx.events.emit('item:use', id);
    return true;
  }
  nearBoat() { return this.ctx.player.position.distanceTo(this.ctx.boat.pos) < 5; }
  sleep(raft) {
    const { time, ui } = this.ctx;
    ui.fade(1.2, () => {
      const h = time.hour;
      const add = h >= 19 || h < 5 ? (6.2 - h + 24) % 24 : 5;
      time.hour = (time.hour + add) % 24;
      this.rest = 100;
      this.warmth = Math.max(this.warmth, 70);
      this.thirst = Math.max(0, this.thirst - 12);
      this.hunger = Math.max(0, this.hunger - 10);
      this.ctx.events.emit('slept');
      this.ctx.save?.save('sleep');
      ui.whisper('You sleep. You dream of dry streets and voices.');
    });
  }
  blackOut(reason) {
    this.blackout = true;
    const { ui, player, boat } = this.ctx;
    ui.whisper(reason === 'water' ? 'The dark closes in…' : 'Your legs fold under you…');
    ui.fade(2.5, () => {
      // wake in the boat, hours later, lighter
      boat.tied = boat.tied || null;
      player.mode = 'boat';
      player.flashlight = false;
      this.oxygen = 100; this.drowning = 0; this.warmth = Math.max(this.warmth, 35);
      this.thirst = Math.max(this.thirst, 15); this.hunger = Math.max(this.hunger, 15);
      this.ctx.time.hour = (this.ctx.time.hour + 3) % 24;
      const inv = this.ctx.inventory;
      const lost = inv.count('scrap') > 3 ? Math.ceil(inv.count('scrap') / 3) : 0;
      if (lost) inv.remove('scrap', lost);
      this.blackout = false;
      ui.whisper(`You come to in the boat, coughing.${lost ? ' Some scrap is gone.' : ''} You don't remember climbing in.`);
    }, 2.5);
  }
  toJSON() { return { thirst: this.thirst, hunger: this.hunger, warmth: this.warmth, rest: this.rest, sick: this.sick, battery: this.battery }; }
  load(o) { Object.assign(this, o || {}); }
}

import * as THREE from 'three';

// Wounds and death. Health, bleeding, a broken limb, infection; treatment with
// bandages, splints and medicine; effects on movement, sprinting, swimming
// and oxygen. Impacts are shown, never shown off: a hard jolt, a dark edge
// to the view, a heartbeat. Death is a cut to black, a sound, and the
// aftermath in a few lines, then a checkpoint (or, in the life sim, the end
// of that life).
export class Injury {
  constructor(ctx) {
    this.ctx = ctx;
    this.health = 100;
    this.bleeding = 0;     // 0..1
    this.broken = null;    // 'leg' | 'arm' | null
    this.brokenT = 0;      // healing time left (s) once splinted
    this.splinted = false;
    this.infection = 0;    // 0..1
    this.hurtFlash = 0;
    this.dead = false;
    this.lastHit = null;
    this.buildOverlay();
    ctx.events.on('slept', () => { this.health = Math.min(100, this.health + 35); if (this.splinted) this.brokenT = Math.max(0, this.brokenT - 400); });
  }
  buildOverlay() {
    const el = document.createElement('div');
    el.className = 'hurt-overlay';
    el.innerHTML = '<div class="hurt-vig"></div><div class="death-card"><p class="death-line"></p><small></small></div>';
    document.body.appendChild(el);
    const st = document.createElement('style');
    st.textContent = `.hurt-overlay{position:fixed;inset:0;pointer-events:none;z-index:40}
      .hurt-vig{position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 45%,rgba(20,4,4,.85) 100%);transition:opacity .15s}
      .death-card{position:absolute;inset:0;background:#000;opacity:0;display:grid;place-items:center;text-align:center;color:#cfc9bc;font:18px Georgia,serif;padding:24px;transition:opacity .25s}
      .death-card p{max-width:560px;line-height:1.7;font-style:italic;opacity:0;transition:opacity 1.6s}
      .death-card small{display:block;margin-top:18px;opacity:.5;font:12px sans-serif;letter-spacing:.12em}`;
    document.head.appendChild(st);
    this.vig = el.querySelector('.hurt-vig');
    this.card = el.querySelector('.death-card');
    this.line = el.querySelector('.death-line');
    this.sub = el.querySelector('small');
  }

  // a hit from something. opts: { bleed, kind, source, lethal, breaks }
  hit(amount, opts = {}) {
    if (this.dead || this.ctx.settings.difficulty === 'calm') { this.hurtFlash = Math.max(this.hurtFlash, 0.4); return; }
    const harsh = this.ctx.settings.difficulty === 'harsh' ? 1.3 : 1;
    // wounds make everything worse
    const k = harsh * (1 + this.bleeding * 0.3);
    this.health -= amount * k;
    this.bleeding = Math.min(1, this.bleeding + (opts.bleed || 0));
    if (opts.breaks && !this.broken && Math.random() < opts.breaks) { this.broken = Math.random() < 0.6 ? 'leg' : 'arm'; this.splinted = false; this.ctx.ui.whisper(this.broken === 'leg' ? 'Something in your leg gives with a wet click. You can barely put weight on it.' : 'Your arm won\'t close properly. Every stroke is a knife.'); }
    if (opts.dirty) this.infection = Math.min(1, this.infection + 0.15);
    this.hurtFlash = Math.min(1, this.hurtFlash + 0.35 + amount / 60);
    this.lastHit = { ...opts, t: this.ctx.state.playTime };
    this.ctx.events.emit('shake', Math.min(1.4, 0.25 + amount / 40));
    this.ctx.events.emit('player:hurt', { amount, ...opts });
    this.ctx.audio?.play('earPop');
    this.ctx.game.haptic?.(60);
    // the first hour forgives: a scare, not a death
    const grace = (this.ctx.state.playTime || 0) < 3600 && !this.ctx.params.has('nograce');
    if (this.health <= 0 && grace) {
      this.health = 12;
      this.ctx.events.emit('creature:spare', opts.source);
      this.ctx.ui.whisper('You tear free. Somehow you are still alive. Get away from here.');
      return;
    }
    if (this.health <= 0 || (opts.lethal && !grace)) this.die(opts);
  }

  treat(id) {
    const inv = this.ctx.inventory, ui = this.ctx.ui;
    if (id === 'bandage') {
      if (this.bleeding <= 0.02) { ui.toast('You are not bleeding.'); return false; }
      this.bleeding = Math.max(0, this.bleeding - 0.7); this.health = Math.min(100, this.health + 6);
      ui.whisper('You bind it tight. The cloth darkens, then holds.');
    } else if (id === 'splint') {
      if (!this.broken) { ui.toast('Nothing is broken.'); return false; }
      this.splinted = true; this.brokenT = 900;
      ui.whisper('Two slats and a lot of cloth. It still hurts, but it holds straight.');
    } else if (id === 'medicine') {
      if (this.infection <= 0.05 && this.ctx.survival.sick <= 0) return false;
      this.infection = 0;
    } else return false;
    inv.remove(id);
    return true;
  }

  update(dt) {
    if (this.dead) return;
    const { survival, player, atmosphere } = this.ctx;
    // bleeding drains health; it slows on its own, faster out of the water
    if (this.bleeding > 0) {
      this.health -= this.bleeding * 1.4 * dt;
      this.bleeding = Math.max(0, this.bleeding - dt * (atmosphere.underwater ? 0.004 : 0.012));
      if (atmosphere.underwater) this.infection = Math.min(1, this.infection + dt * 0.002 * this.bleeding);
    } else if (this.health < 100 && survival.hunger > 20 && survival.thirst > 20) {
      this.health = Math.min(100, this.health + dt * (this.infection > 0.4 ? 0 : 0.08));
    }
    // infection slowly becomes sickness
    if (this.infection > 0.3) survival.sick = Math.min(1, survival.sick + dt * 0.003 * this.infection);
    // a splinted bone mends
    if (this.broken && this.splinted) { this.brokenT -= dt; if (this.brokenT <= 0) { this.ctx.ui.whisper(this.broken === 'leg' ? 'You can stand on the leg again.' : 'Your arm closes properly again.'); this.broken = null; } }
    if (this.health <= 0) this.die(this.lastHit || { kind: 'blood' });
    // the edge of your vision darkens when you're hurt; a heartbeat when it's bad
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.5);
    const low = Math.max(0, (45 - this.health) / 45);
    this.vig.style.opacity = Math.min(0.95, this.hurtFlash * 0.8 + low * 0.55 + this.bleeding * 0.2).toFixed(3);
    this.beatT = (this.beatT || 0) - dt;
    if (low > 0.3 && this.beatT <= 0) { this.beatT = 1.3 - low * 0.6; this.ctx.audio?.synth && this.ctx.audio.started && this.ctx.audio.synth.heartbeat(this.ctx.audio.master); }
    void player;
  }
  describe() {
    const w = [];
    w.push(this.health > 80 ? 'Unhurt, more or less.' : this.health > 45 ? 'Bruised and cut.' : this.health > 20 ? 'Badly hurt.' : 'Barely standing.');
    if (this.bleeding > 0.05) w.push(this.bleeding > 0.4 ? 'Bleeding hard — bandage it.' : 'Bleeding.');
    if (this.broken) w.push(`Broken ${this.broken}${this.splinted ? ', splinted' : ' — splint it'}.`);
    if (this.infection > 0.2) w.push('A wound is going bad — medicine.');
    return w.join(' ');
  }
  // movement multipliers for the player
  speedMul(mode) {
    let k = 1;
    if (this.broken === 'leg') k *= this.splinted ? 0.75 : 0.55;
    if (this.broken === 'arm' && mode === 'swim') k *= this.splinted ? 0.8 : 0.6;
    if (this.health < 25) k *= 0.8;
    return k;
  }
  canSprint() { return this.broken !== 'leg' && this.health > 15; }
  oxygenMul() { return 1 + this.bleeding * 0.5 + (this.health < 30 ? 0.3 : 0); }

  // ---------------------------------------------------------------- death
  die(cause = {}) {
    if (this.dead) return;
    this.dead = true;
    const { ctx } = this;
    ctx.events.emit('player:died', cause);
    ctx.input.enabled = false;
    // cut to black: no lingering on it
    this.card.style.transition = 'none'; this.card.style.opacity = '1';
    ctx.audio?.silence?.(4);
    ctx.audio?.started && ctx.audio.synth.thud(ctx.audio.master, 1.4);
    const place = ctx.player.mode === 'swim' || ctx.atmosphere.underwater ? 'water' : ctx.state.community && ctx.state.community.rafts && [...ctx.state.community.rafts.values()].some((r) => r.root.position.distanceTo(ctx.player.position) < 40) ? 'raft' : 'roof';
    const name = ctx.life?.s?.name || 'Wren';
    const line = AFTERMATH[place][Math.floor(Math.random() * AFTERMATH[place].length)].replace('{name}', name).replace('{what}', cause.what || 'something in the water');
    this.line.textContent = line;
    this.sub.textContent = ctx.mode === 'life' || ctx.lifeScene ? 'This life ends here.' : 'You wake at your last safe place.';
    setTimeout(() => { this.line.style.opacity = '1'; }, 900);
    (ctx.state.deaths ||= []).push({ day: ctx.time.day, cause: cause.source || cause.kind || 'unknown', place });
    ctx.state.notes?.push({ text: line, day: ctx.time.day });
    setTimeout(() => this.respawn(), 6500);
  }
  respawn() {
    const { ctx } = this;
    // the life sim: this life ends and the legacy continues there
    if (ctx.lifeScene) { ctx.events.emit('life:died', this.lastHit); }
    const cp = ctx.state.checkpoint;
    if (cp) {
      ctx.player.position.set(cp.x, cp.y, cp.z);
      ctx.player.mode = cp.mode || 'foot';
      if (cp.mode === 'boat') { ctx.boat.pos.set(cp.x, 0, cp.z); ctx.boat.tied = null; }
    } else { ctx.game.newGame?.(); }
    ctx.player.velocity.set(0, 0, 0);
    ctx.player.flashlight = false;
    this.health = 55; this.bleeding = 0; this.broken = null; this.infection = Math.max(0, this.infection - 0.3);
    ctx.survival.oxygen = 100; ctx.survival.warmth = Math.max(40, ctx.survival.warmth);
    // what was lost stays lost
    const inv = ctx.inventory;
    for (const id of ['scrap', 'canned_fish', 'ration_bar']) { const n = inv.count(id); if (n > 1) inv.remove(id, Math.ceil(n / 2)); }
    ctx.time.hour = (ctx.time.hour + 6) % 24;
    ctx.creatures?.calmAll();
    this.dead = false;
    ctx.input.enabled = true;
    this.line.style.opacity = '0';
    this.card.style.transition = 'opacity 2.2s'; this.card.style.opacity = '0';
  }
  toJSON() { return { health: this.health, bleeding: this.bleeding, broken: this.broken, splinted: this.splinted, brokenT: this.brokenT, infection: this.infection }; }
  load(o) { if (o) Object.assign(this, o); }
}

const AFTERMATH = {
  water: [
    'They never found {name}. A week later a bottle came in on the tide at Portage, with a dive tag inside and nothing else.',
    'The water went quiet over the place where {name} went down. By morning there was nothing to show anyone had been there at all.',
    'Teo\'s sibling went the same way Teo did. The Vigil lit two lanterns that night instead of one.',
  ],
  raft: [
    'Raft-folk found {name} at first light, at the edge of the deck. They covered the body with a sail and nobody spoke at breakfast.',
    'The lamps had gone out. In the morning there was blood on the planks and the gulls would not come down. Portage paid for the burial in salt.',
  ],
  roof: [
    'Days later a salvage crew found what was left on the roof, and a journal open to a page that just said: "too close".',
    'Nobody came looking for {name}. The silt kept the roof clean. The journal went to the Vigil, unread.',
  ],
};

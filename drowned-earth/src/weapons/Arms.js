import * as THREE from 'three';
import { buildWeapon, setWear } from './WeaponKit.js';

// Weapons in hand. Owned weapons are instances { id, cond, salt, mods, loaded };
// one is drawn at a time and shown as a first-person viewmodel.
// Mouse/keyboard: 1–4 draw owned weapons, 0 holster · LMB light attack / fire
// (hold for a heavy swing) · RMB block (melee) / aim down sights (ranged) ·
// T reload / clear a jam · Y shove · U throw a net · O inspect & mods.
// Gamepad hooks: `this.pad` exposes trigger-effect callbacks (setTrigger) so
// DualSense adaptive triggers can be wired later without touching combat.
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const WOUNDED = { siltwolf: 'flee_or_enrage', gullrat: 'flee', needlefish: 'frenzy', netweaver: 'enrage', listener: 'enrage', bloomwalker: 'recoil', tide_crab: 'enrage' };

export class Arms {
  constructor(ctx) {
    this.ctx = ctx;
    this.d = ctx.data.weapons;
    this.state = { owned: [], drawn: -1, confiscated: false, licence: false };
    this.stamina = 100;
    this.held = { lmb: false, rmb: false }; this.lmbT = 0;
    this.cool = 0; this.reloadT = 0; this.jammed = false; this.swing = 0; this.recoil = 0; this.ads = 0;
    this.pad = { setTrigger: (side, effect) => { this.padEffect = { side, effect }; }, rumble: (ms) => ctx.game.haptic?.(ms) }; // DualSense hook point
    if (!this.d) return;
    if (!ctx.camera.parent) ctx.scene.add(ctx.camera);
    this.vm = new THREE.Group(); this.vm.name = 'viewmodel'; ctx.camera.add(this.vm);
    this.vmLight = new THREE.PointLight(0xffe0c0, 0.25, 1.6); this.vmLight.position.set(0.3, 0.2, 0.2); ctx.camera.add(this.vmLight);
    this.def = (id) => this.d.melee[id] || this.d.ranged[id];
    this.kind = (id) => (this.d.melee[id] ? 'melee' : 'ranged');
    this.bindInput();
    this.addVendors();
    this.buildHud();
    if (ctx.params.has('armed')) { for (const id of ctx.params.get('armed').split(',')) this.give(id); this.draw(0); }
  }
  give(id) {
    const def = this.def(id); if (!def) return null;
    const mods = Object.fromEntries(Object.entries(def.slots).map(([k, v]) => [k, v[0]]));
    if (this.d.ranged[id]) mods.barrel = mods.barrel || 'stock';
    const w = { id, cond: 0.85, salt: 0.05, mods, loaded: this.d.ranged[id]?.mag || 0, kills: 0 };
    this.state.owned.push(w);
    this.ctx.events.emit('weapon:got', id);
    return w;
  }
  get cur() { return this.state.owned[this.state.drawn] || null; }
  get drawn() { return !!this.cur; }
  stat(w, key) {
    const def = this.def(w.id); let v = def[key];
    for (const m of Object.values(w.mods)) { const md = this.d.mods[m]; if (md && md[key] != null) v = key === 'adsZoom' ? v + md[key] : v * (1 + md[key]); }
    return v;
  }
  draw(i) {
    if (this.state.confiscated) { this.ctx.ui.toast('Your weapons are in the Club\'s cloakroom.'); return; }
    if (i === this.state.drawn || i < 0 || i >= this.state.owned.length) { this.holster(); return; }
    this.state.drawn = i; this.rebuildVM(); this.drawT = 0.35;
    this.ctx.events.emit('weapon:draw', this.cur.id);
    this.ctx.ui.toast(`${this.def(this.cur.id).name}${this.kind(this.cur.id) === 'ranged' ? ` · ${this.cur.loaded}/${this.def(this.cur.id).mag} · ${this.ammoCount(this.cur)} spare` : ''}`);
  }
  holster() { this.state.drawn = -1; this.vm.clear(); this.ctx.events.emit('weapon:holster'); }
  rebuildVM() {
    this.vm.clear();
    const w = this.cur; if (!w) return;
    const def = this.def(w.id);
    this.mesh = buildWeapon(w.id, def, w.mods, this.d.styles, this.kind(w.id));
    this.mesh.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.renderOrder = 10; } });
    setWear(this.mesh, w.cond, w.salt);
    this.vm.add(this.mesh);
  }
  ammoCount(w) { const def = this.d.ranged[w.id]; return def ? this.ctx.inventory.count(def.ammo) : 0; }

  // ---------------------------------------------------------------- input
  bindInput() {
    const c = this.ctx.renderer?.domElement || document.querySelector('canvas');
    addEventListener('mousedown', (e) => { if (!this.ctx.input.pointerLocked || this.ctx.ui.panel) return; if (e.button === 0) { this.held.lmb = true; this.lmbT = 0; } if (e.button === 2) this.held.rmb = true; });
    addEventListener('mouseup', (e) => { if (e.button === 0 && this.held.lmb) { this.held.lmb = false; this.release(); } if (e.button === 2) this.held.rmb = false; });
    c?.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      if (this.ctx.mode !== 'play' || this.ctx.ui.panel || e.repeat) return;
      if (/^Digit[1-4]$/.test(e.code)) this.draw(+e.code.slice(5) - 1);
      if (e.code === 'Digit0') this.holster();
      if (e.code === 'KeyT') this.reload();
      if (e.code === 'KeyY') this.shove();
      if (e.code === 'KeyU') this.throwNet();
      if (e.code === 'KeyO') this.inspect();
    });
  }
  release() {
    const w = this.cur; if (!w || this.cool > 0 || this.ctx.injury?.dead) return;
    if (this.kind(w.id) === 'melee') this.swingAttack(this.lmbT > 0.35);
    else this.fire();
  }

  // ---------------------------------------------------------------- melee
  swingAttack(heavy) {
    const w = this.cur, def = this.def(w.id);
    const weight = this.stat(w, 'weight'), cost = this.stat(w, 'stamina') * (heavy ? 2 : 1);
    const tired = this.stamina < cost;
    this.stamina = Math.max(0, this.stamina - cost);
    this.cool = (1 / this.stat(w, 'speed')) * (heavy ? 1.6 : 1) * (1 + weight * 0.08) * (tired ? 1.5 : 1);
    this.swing = 1; this.swingHeavy = heavy;
    const dmg = this.stat(w, 'dmg') * (heavy ? def.heavy : 1) * (0.6 + 0.4 * w.cond) * (tired ? 0.6 : 1);
    this.noise(this.stat(w, 'noise'));
    setTimeout(() => this.resolveHit({ dmg, reach: this.stat(w, 'reach'), stun: this.stat(w, 'stun') * (heavy ? 1.5 : 1), material: def.material, heavy }), 120);
    this.wearOut(w, def.wear * (heavy ? 1.5 : 1));
  }
  targets(range, cosTol) {
    const ctx = this.ctx, eye = ctx.camera.getWorldPosition(new THREE.Vector3()), fwd = ctx.camera.getWorldDirection(new THREE.Vector3());
    const out = [];
    const test = (pos, obj, type) => { const d = _v.copy(pos).sub(eye); const L = d.length(); if (L > range) return; if (d.normalize().dot(fwd) < cosTol) return; if (ctx.collision.raycast(eye, d, L) < L - 0.6) return; out.push({ obj, type, d: L, pos: pos.clone() }); };
    for (const c of ctx.creatures?.list || []) if (c.active && (c.health > 0)) test(c.body?.focus ? c.body.focus().clone() : _w.copy(c.pos).setY(c.pos.y + 0.6), c, 'creature');
    for (const a of ctx.society?.actors || []) if (a.alive) test(_w.copy(a.pos).setY(a.pos.y + 1.2), a, 'actor');
    for (const com of Object.values(ctx.state.communities || {})) for (const n of com.npcs || []) if (n.root.visible) test(n.worldPos(new THREE.Vector3()).setY(n.worldPos(_w).y + 1.2), n, 'npc');
    return out.sort((a, b) => a.d - b.d);
  }
  resolveHit(h) {
    const t = this.targets(h.reach + 0.6, 0.72)[0];
    if (!t) { this.ctx.audio?.started && this.ctx.audio.synth.creak?.(this.ctx.audio.master, false); return; }
    this.feel(h.material, t.type === 'creature' && t.obj.kind === 'tide_crab' ? 'shell' : 'flesh', h.heavy);
    this.hitTarget(t, h.dmg, h.stun, h.heavy);
  }
  // hit-stop, a camera nudge, a sound that matches what met what
  feel(material, surface, heavy) {
    this.ctx.hitStop = heavy ? 0.09 : 0.05;
    this.ctx.events.emit('shake', heavy ? 0.35 : 0.18);
    this.pad.rumble(heavy ? 70 : 35);
    const a = this.ctx.audio; if (!a?.started) return;
    const s = a.synth;
    if (surface === 'shell' || material === 'iron' || material === 'steel') s.thud(a.master, heavy ? 1.1 : 0.7);
    if (material === 'steel' || material === 'iron') s.click(a.master, surface === 'shell' ? 1800 : 900);
    if (material === 'glass') s.click(a.master, 3200);
    if (material === 'wood') s.thud(a.master, 0.5);
  }
  hitTarget(t, dmg, stun, heavy) {
    const ctx = this.ctx;
    if (t.type === 'creature') {
      const c = t.obj, before = c.health;
      c.takeDamage(dmg); c.prey = null;
      ctx.events.emit('weapon:hit', { kind: 'creature', id: c.id, dmg });
      // wounded animals react by species: flee, enrage, frenzy
      const r = WOUNDED[c.kind] || 'enrage';
      if (c.health <= 0) return;
      if (r === 'flee' || (r === 'flee_or_enrage' && c.health < (c.spec.health || 60) * 0.5) || r === 'recoil') c.setState('return', 'wounded');
      else if (c.state !== 'attack') c.setState('attack', 'wounded');
      if (r === 'frenzy') c.threat = 1;
      void before;
    } else if (t.type === 'actor') { t.obj.hit(dmg, { source: 'player' }); }
    else if (t.type === 'npc') this.hitNPC(t.obj, dmg, stun, heavy);
  }
  // people: a blunt heavy hit usually knocks them down; a killing blow has a long tail
  hitNPC(npc, dmg, stun) {
    const ctx = this.ctx, soc = ctx.society, a = soc?.agents.get(npc.def.id);
    ctx.heat?.crime('assault_ward', `Attacked ${npc.def.name}`);
    ctx.events.emit('weapon:hit', { kind: 'npc', id: npc.def.id, dmg });
    if (!a) { ctx.ui.subtitle(`${npc.def.name}: Hey! HEY!`, 2.5, 'speech'); return; }
    a.hp = (a.hp ?? 100) - dmg;
    a.attitude -= 3; a.memory.push({ day: ctx.time.day, type: 'attacked by you' });
    if (a.hp > 0 && Math.random() < stun) { a.memory.push({ day: ctx.time.day, type: 'subdued' }); npc.override = { from: 0, to: 24, do: 'sit' }; setTimeout(() => { npc.override = null; }, 45000); ctx.ui.subtitle(`${a.name} goes down hard and stays down, groaning.`, 3, 'speech'); ctx.events.emit('people:subdued', { who: a.id }); return; }
    if (a.hp <= 0) {
      soc.death(a, { creature: 'you' }, 'you', 'raft');
      for (const k of Object.keys(ctx.crews?.state.standing || {})) ctx.crews.bump(k, -10);
      ctx.crews?.report('villain', `${a.name} was killed on Portage. Everyone saw who did it.`);
      ctx.heat?.add(40, 'murder');
      return;
    }
    this.npcReact(npc, a, true);
  }
  // a drawn weapon near people: fear, anger, a call for help, running
  npcReact(npc, a, struck) {
    const ctx = this.ctx, t = a.traits;
    const r = t.courage > 0.7 && t.temper > 0.5 ? 'anger' : t.courage < 0.4 ? 'run' : t.warmth > 0.6 ? 'help' : 'fear';
    const line = { anger: 'Put it down or I\'ll put you down.', run: 'No— no, please—', help: 'Help! Somebody! They\'ve got a weapon!', fear: 'Easy. Easy. I don\'t want trouble.' }[r];
    ctx.ui.subtitle(`${a.name}: ${line}`, 3, 'speech');
    a.memory.push({ day: ctx.time.day, type: struck ? 'hit' : 'threatened' }); a.attitude -= struck ? 0 : 1;
    if (r === 'run') { npc.override = { from: 0, to: 24, do: 'walk', pos: [npc.local.x + 6 * Math.sign(npc.local.x || 1), npc.local.z] }; setTimeout(() => (npc.override = null), 20000); }
    if (r === 'help') ctx.heat?.add(4, 'Someone called for help');
    ctx.events.emit('people:weapon', { who: a.id, reaction: r });
    return r;
  }
  shove() {
    if (this.stamina < 10) return;
    this.stamina -= 10; this.swing = 0.7;
    const t = this.targets(2.2, 0.7)[0]; if (!t) return;
    this.feel('wood', 'flesh', false);
    if (t.type === 'creature') { const c = t.obj; c.pos.addScaledVector(_v.copy(c.pos).sub(this.ctx.player.position).setY(0).normalize(), 1.5); if (c.state === 'warning' && Math.random() < 0.5) c.setState('return', 'shoved off'); }
    if (t.type === 'npc') { const a = this.ctx.society?.agents.get(t.obj.def.id); if (a) { a.attitude -= 1; this.ctx.ui.subtitle(`${a.name}: Watch it!`, 2, 'speech'); } }
    this.ctx.events.emit('weapon:shove', t.type);
  }
  throwNet() {
    const inv = this.ctx.inventory; if (!inv.has('throw_net')) { this.ctx.ui.toast('No net.'); return; }
    const t = this.targets(this.d.throwables.throw_net.range, 0.85)[0];
    inv.remove('throw_net', 1); this.noise(2);
    if (!t) { this.ctx.ui.toast('The net lands in the water, empty.'); return; }
    if (t.type === 'creature') { const c = t.obj; c.stunT = this.d.throwables.throw_net.stun; c.cool = c.stunT; c.setState('return', 'netted'); this.ctx.ui.whisper(`The net wraps the ${c.spec.name.toLowerCase().replace(/s$/, '')}. It thrashes, tangled, then backs away dragging it.`); }
    if (t.type === 'npc' || t.type === 'actor') this.ctx.ui.whisper('The net drops over them. Nobody dies of a net. They will be very cross.');
    this.ctx.events.emit('weapon:net', t.type);
  }

  // ---------------------------------------------------------------- ranged
  fire() {
    const w = this.cur, def = this.d.ranged[w.id];
    if (this.reloadT > 0) return;
    if (this.ctx.atmosphere.underwater && !def.underwater) { this.ctx.ui.toast('It won\'t fire underwater.'); return; }
    if (this.jammed) { this.ctx.ui.toast('Jammed — T to clear it.'); this.ctx.audio?.started && this.ctx.audio.synth.click(this.ctx.audio.master, 400); return; }
    if (w.loaded <= 0) { this.ctx.ui.toast(this.ammoCount(w) ? 'Empty — T to reload.' : `No ${this.d.ammo[def.ammo].name.toLowerCase()}.`); return; }
    // jams and fouling: salt and wear make it worse
    if (Math.random() < def.jam + w.salt * 0.15 + (1 - w.cond) * 0.12) { this.jammed = true; this.ctx.ui.toast('Click. Jammed.'); this.ctx.events.emit('weapon:jam', w.id); return; }
    w.loaded--; this.cool = def.rate; this.recoil = 1;
    this.noise(this.stat(w, 'noise'));
    this.pad.setTrigger('R2', { type: 'weapon', start: 3, end: 6, strength: Math.min(8, def.dmg / 8) });
    const spread = this.stat(w, 'spread') * (1 - this.ads * 0.7) * (1 + this.ctx.survival.swayAmount()) * Math.PI / 180;
    const n = def.pellets || 1;
    for (let k = 0; k < n; k++) {
      const t = this.targets(this.stat(w, 'range'), Math.cos(Math.max(0.035, spread * 1.2)))[0];
      if (def.projectile === 'flare') { this.flare(t); continue; }
      if (t) { this.feel('steel', t.type === 'creature' && t.obj.kind === 'tide_crab' ? 'shell' : 'flesh', false); this.hitTarget(t, def.dmg * (0.7 + 0.3 * w.cond), 0, false); }
    }
    this.tracer(def.projectile);
    this.wearOut(w, def.wear);
    this.ctx.events.emit('weapon:fire', { id: w.id, noise: this.stat(w, 'noise') });
  }
  flare(t) {
    const c = this.ctx.creatures; if (!c) return;
    const eye = this.ctx.camera.getWorldPosition(new THREE.Vector3()), fwd = this.ctx.camera.getWorldDirection(new THREE.Vector3());
    const pos = t ? t.pos.clone() : eye.addScaledVector(fwd, 30);
    if (!t) pos.y = Math.max(pos.y, this.ctx.waves.height(pos.x, pos.z));
    const light = new THREE.PointLight(0xff3a1a, 8, 28, 2); light.position.copy(pos); this.ctx.scene.add(light);
    const f = { kind: 'flare', pos, t: 30, light }; c.flares.push(f);
    const tick = setInterval(() => { light.intensity = f.t > 0 ? 6 + Math.random() * 3 : 0; if (f.t <= 0) { clearInterval(tick); this.ctx.scene.remove(light); } }, 60);
    if (t?.type === 'creature' && (t.obj.spec.senses.light || 0) < 0) t.obj.setState('return', 'flare in the face');
  }
  tracer(kind) {
    const eye = this.ctx.camera.getWorldPosition(new THREE.Vector3()), fwd = this.ctx.camera.getWorldDirection(new THREE.Vector3());
    const geo = new THREE.BufferGeometry().setFromPoints([eye.clone().addScaledVector(fwd, 0.8), eye.clone().addScaledVector(fwd, 40)]);
    const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: kind === 'flare' ? 0xff6030 : 0xffe0a0, transparent: true, opacity: kind === 'bolt' || kind === 'stone' ? 0.25 : 0.6 }));
    this.ctx.scene.add(l); setTimeout(() => { this.ctx.scene.remove(l); geo.dispose(); }, 70);
  }
  reload() {
    const w = this.cur; if (!w || this.kind(w.id) !== 'ranged' || this.reloadT > 0) return;
    const def = this.d.ranged[w.id];
    if (this.jammed) { this.reloadT = 1.0; this.jammed = false; this.ctx.ui.toast('You work the action until it frees.'); return; }
    const need = def.mag - w.loaded, have = this.ammoCount(w);
    if (!need || !have) { this.ctx.ui.toast(have ? 'Already loaded.' : 'No ammo.'); return; }
    this.reloadT = def.reload * (this.ctx.injury?.broken === 'arm' ? 1.6 : 1);
    setTimeout(() => { const k = Math.min(need, this.ammoCount(w)); this.ctx.inventory.remove(def.ammo, k); w.loaded += k; }, this.reloadT * 1000);
  }

  // ---------------------------------------------------------------- noise, wear, law
  noise(radius) {
    const ctx = this.ctx, p = ctx.player.position;
    ctx.events.emit('noise', { level: Math.min(1, radius / 60), pos: p.clone() });
    // loud near the Ward, or in Highmark waters, is a crime
    const law = this.d.law, hm = ctx.data.locations.farLandmarks?.[0]?.pos || law.highmark;
    const inHighmark = Math.hypot(p.x - hm[0], p.z - hm[1]) < law.highmarkRadius;
    const wardNear = [ctx.patrol, ...(ctx.ward?.boats || [])].some((b) => b?.active && b.pos.distanceTo(p) < Math.max(law.wardRadius, radius));
    if (radius >= 30 && (inHighmark || wardNear)) ctx.heat?.add(law.shotHeat, 'Gunfire');
  }
  wearOut(w, k) { w.cond = Math.max(0.05, w.cond - k); if (this.mesh) setWear(this.mesh, w.cond, w.salt); }
  maintain(w) {
    const cost = Math.ceil((1 - w.cond) * 10 + w.salt * 5);
    if (!this.ctx.inventory.has('scrap', cost)) { this.ctx.ui.toast(`Needs ${cost} scrap in parts.`); return false; }
    this.ctx.inventory.remove('scrap', cost); w.cond = Math.min(1, w.cond + 0.6); w.salt = 0; this.jammed = false;
    if (this.mesh && w === this.cur) setWear(this.mesh, w.cond, w.salt);
    this.ctx.events.emit('weapon:maintain', w.id); return true;
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    if (!this.d) return;
    const ctx = this.ctx, w = this.cur;
    this.cool = Math.max(0, this.cool - dt); this.reloadT = Math.max(0, this.reloadT - dt);
    if (this.held.lmb) this.lmbT += dt;
    const heavyW = w ? this.stat(w, 'weight') : 0;
    this.stamina = Math.min(100, this.stamina + dt * (14 - heavyW * 1.5) * (ctx.input.held.sprint ? 0.3 : 1));
    // salt water gets into everything you carry
    if (w && ctx.player.mode === 'swim') w.salt = Math.min(1, w.salt + dt * 0.01);
    // blocking: halves what gets through
    ctx.injury && (ctx.injury.guard = w && this.kind(w.id) === 'melee' && this.held.rmb && this.stamina > 5 ? 0.5 : 1);
    this.lawCheck(dt);
    this.hud(w);
    if (!w || !this.mesh) return;
    // viewmodel: rest pose, ADS, swing, recoil, sway that worsens when tired or hurt
    const ranged = this.kind(w.id) === 'ranged';
    const wantAds = ranged && this.held.rmb ? 1 : 0;
    this.ads += (wantAds - this.ads) * Math.min(1, dt * 10);
    const zoom = ranged ? this.stat(w, 'adsZoom') : 1;
    ctx.camera.fov = 70 / (1 + (zoom - 1) * this.ads); ctx.camera.updateProjectionMatrix();
    const tired = 1 - this.stamina / 100, hurt = ctx.survival.swayAmount() + (ctx.injury ? (100 - ctx.injury.health) / 200 : 0);
    const t = performance.now() / 1000, sw = (0.004 + tired * 0.01 + hurt * 0.012) * (1 + heavyW * 0.1);
    this.swing = Math.max(0, this.swing - dt * 3.2); this.recoil = Math.max(0, this.recoil - dt * 6);
    this.drawT = Math.max(0, (this.drawT || 0) - dt);
    const restX = ranged ? 0.16 : 0.24, restY = ranged ? -0.16 : -0.22, restZ = ranged ? -0.32 : -0.36;
    const x = restX * (1 - this.ads) + Math.sin(t * 1.3) * sw, y = (restY + 0.1 * this.ads * (ranged ? 0.55 : 0)) * (1 - this.ads * 0.1) + Math.sin(t * 2.1) * sw * 0.7 - this.drawT * 0.6;
    this.mesh.position.set(x, y + (ranged ? -0.06 * this.ads : 0), restZ + this.recoil * 0.06);
    const sweep = Math.sin(this.swing * Math.PI) * (this.swingHeavy ? 1.3 : 0.9);
    this.mesh.rotation.set(ranged ? this.recoil * 0.15 : -0.3 + sweep * 1.2, ranged ? 0.02 : -0.2 - sweep * 0.9, ranged ? 0 : 0.35 - sweep * 0.6);
    if (!ranged) this.mesh.rotation.x += 1.2; // melee held angled up and forward
    if (this.held.rmb && !ranged) this.mesh.rotation.z = 1.2; // a guard across the body
  }
  // drawn weapons around people, bars, the Ward
  lawCheck(dt) {
    const ctx = this.ctx, w = this.cur;
    this.lawT = (this.lawT || 0) - dt;
    if (!w || this.lawT > 0) return;
    this.lawT = 1;
    const p = ctx.player.position;
    // bars: the bouncer has a hook and a long memory
    const bar = ctx.nightlife?.nearestBar?.(9);
    if (bar && ctx.nightlife.isOpen(bar.bar)) {
      this.barT = (this.barT || 0) + 1;
      if (this.barT === 1) ctx.ui.subtitle(`Bouncer at ${bar.bar.name}: ${this.d.law.barRule} Put it away.`, 4, 'speech');
      if (this.barT > 6) { this.barT = 0; this.holster(); ctx.heat?.add(3, 'Thrown out of a bar'); ctx.ui.whisper('A hand like a cargo hook closes on your collar. You are on the dock before you finish the thought. "Come back without it."'); ctx.player.teleport(p.clone().add(new THREE.Vector3(0, 0, 8))); ctx.events.emit('weapon:ejected', bar.bar.id); }
    } else this.barT = 0;
    // people nearby react to it, once a minute each
    const com = ctx.state.communities?.portage;
    if (com && ctx.society) for (const n of com.npcs) {
      const a = ctx.society.agents.get(n.def.id); if (!a || a.dead || !n.root.visible) continue;
      if (n.worldPos(_v).distanceTo(p) < 5 && (!a._wpn || ctx.time.day * 24 + ctx.time.hour - a._wpn > 1)) { a._wpn = ctx.time.day * 24 + ctx.time.hour; this.npcReact(n, a, false); break; }
    }
    // the Ward tolerates licensed weapons only, and only in Highmark waters does it ask
    const def = this.def(w.id);
    if (!def.licensed && ctx.ward?.seen) { const hm = ctx.data.locations.farLandmarks?.[0]?.pos || this.d.law.highmark; if (Math.hypot(p.x - hm[0], p.z - hm[1]) < this.d.law.highmarkRadius || ctx.heat.stars > 0) ctx.heat.add(this.d.law.armedHeat / 10, 'Armed (unlicensed)'); }
  }

  // ---------------------------------------------------------------- vendors
  addVendors() {
    for (const [vid, v] of Object.entries(this.d.vendors)) {
      const pos = (out) => { const r = this.ctx.state.communities?.[v.community]?.rafts.get(v.platform); return r ? r.worldPoint(_w.set(v.at[0], r.deckAt(v.at[0], v.at[1]) + 1.2, v.at[1]), out) : out.set(0, -999, 0); };
      this.ctx.interact.add({ kind: 'shop', mode: 'foot', radius: 2.6, requireLook: false, pos, prompt: `${v.name} — ${v.keeper}`, onUse: () => this.shop(vid) });
    }
  }
  reluctance() { const rep = this.ctx.crews?.reputation; const stars = this.ctx.heat?.stars || 0; return stars >= 2 ? 'refuse' : rep === 'villain' ? 1.4 : 1; }
  shop(vid) {
    const v = this.d.vendors[vid], ui = this.ctx.ui, inv = this.ctx.inventory, rel = this.reluctance();
    if (rel === 'refuse') { ui.showNote(v.name, `${v.keeper} looks past you at the water, where the searchlights are. "Not today. Come back when you're not news."`); return; }
    const items = [...Object.entries(this.d.melee), ...Object.entries(this.d.ranged), ...Object.entries(this.d.throwables)].filter(([, d]) => d.sold?.includes(vid));
    const ammo = Object.entries(this.d.ammo).filter(([id, a]) => a.price && items.some(([, d]) => d.ammo === id));
    const price = (p) => Math.ceil(p * rel);
    const render = () => `<button class="btn close" data-close>Leave</button><h2>${esc(v.name)}</h2><div class="sub">${esc(v.keeper)} · ${esc(v.sells)}${rel > 1 ? ' · <span style="color:#d99">your name makes them nervous (×' + rel + ')</span>' : ''}</div>
      <div class="row"><div class="name hand">“${esc(v.line)}”</div></div><h3>${inv.count('scrap')} scrap</h3>
      ${items.map(([id, d]) => `<div class="row"><div class="name">${esc(d.name)}${d.licensed ? ' <span style="color:#9c9;font-size:11px">Ward-licensed</span>' : ''}<small>${d.dmg ? `dmg ${d.dmg} · noise ${d.noise} m${d.mag ? ` · ${d.mag}-shot` : ''}` : esc(d.desc || '')}</small></div><button class="btn" data-b="${id}" ${inv.has('scrap', price(d.price)) ? '' : 'disabled'}>${price(d.price)} scrap</button></div>`).join('')}
      ${ammo.map(([id, a]) => `<div class="row"><div class="name">${esc(a.name)} ×3</div><button class="btn" data-a="${id}" ${inv.has('scrap', price(a.price * 3)) ? '' : 'disabled'}>${price(a.price * 3)} scrap</button></div>`).join('')}
      <div class="row"><div class="name">Maintenance (your drawn weapon)</div><button class="btn" data-m ${this.cur ? '' : 'disabled'}>Clean & fix</button></div>`;
    const bind = (el) => {
      el.querySelectorAll('[data-b]').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.b, d = this.def(id) || this.d.throwables[id]; inv.remove('scrap', price(d.price)); if (this.d.throwables[id]) inv.add(id, 1, true); else { this.give(id); ui.toast(`${d.name}. Press ${this.state.owned.length} to draw it.`); } el.innerHTML = render(); bind(el); }));
      el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => { const a = this.d.ammo[b.dataset.a]; inv.remove('scrap', price(a.price * 3)); inv.add(b.dataset.a, 3, true); el.innerHTML = render(); bind(el); }));
      el.querySelector('[data-m]')?.addEventListener('click', () => { if (this.maintain(this.cur)) ui.toast('Cleaned, oiled, the salt picked out.'); el.innerHTML = render(); bind(el); });
      el.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => ui.close()));
    };
    ui.openPanel('shop', render(), bind);
  }

  // ---------------------------------------------------------------- inspect & mods
  inspect(index = this.state.drawn >= 0 ? this.state.drawn : 0) {
    const ui = this.ctx.ui, w = this.state.owned[index];
    if (!w) { ui.toast('You don\'t own a weapon.'); return; }
    const def = this.def(w.id), kind = this.kind(w.id), S = this.d.styles[def.style];
    const atBench = this.nearBench();
    const html = `<button class="btn close" data-close>Close</button><h2>${esc(def.name)}</h2><div class="sub">${esc(S.desc)}</div>
      <div style="display:flex;gap:14px;flex-wrap:wrap"><canvas class="wv" width="460" height="300" style="width:460px;max-width:100%;height:300px;background:radial-gradient(#3a3530,#111);cursor:grab;pointer-events:auto"></canvas>
      <div style="flex:1;min-width:200px">${this.state.owned.map((o, i) => `<button class="btn ${i === index ? 'on' : ''}" data-w="${i}">${esc(this.def(o.id).name)}</button>`).join(' ')}
      <h3>Condition</h3><div class="row"><div class="name">wear ${Math.round(w.cond * 100)}% · salt ${Math.round(w.salt * 100)}%${this.jammed && index === this.state.drawn ? ' · JAMMED' : ''}</div><button class="btn" data-fix ${atBench ? '' : 'disabled'}>${atBench ? 'Maintain' : 'Needs a bench'}</button></div>
      <h3>Stats</h3><div class="sub" style="font-style:normal">${kind === 'melee' ? `damage ${this.stat(w, 'dmg').toFixed(0)} (heavy ×${def.heavy}) · ${this.stat(w, 'speed').toFixed(2)} swings/s · reach ${def.reach} m · stun ${Math.round(this.stat(w, 'stun') * 100)}%` : `damage ${def.dmg}${def.pellets ? '×' + def.pellets : ''} · ${def.mag}-shot · reload ${def.reload}s · range ${this.stat(w, 'range').toFixed(0)} m · zoom ×${this.stat(w, 'adsZoom').toFixed(1)}`} · weight ${this.stat(w, 'weight').toFixed(1)} kg · noise ${this.stat(w, 'noise').toFixed(0)} m · ${def.licensed ? 'Ward-licensed' : 'unlicensed'}</div>
      <h3>Mods</h3>${Object.entries(def.slots).map(([slot, opts]) => `<div class="row"><div class="name">${slot}</div>${opts.map((o) => `<button class="btn ${w.mods[slot] === o ? 'on' : ''}" data-mod="${slot}:${o}">${o.replace(/_/g, ' ')}</button>`).join('')}</div>`).join('')}
      <div class="sub">Swapping a mod costs 2 scrap. Drag the weapon to turn it.</div></div></div>`;
    const p = ui.openPanel('inspect', html, (el) => {
      el.querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', () => this.inspect(+b.dataset.w)));
      el.querySelectorAll('[data-mod]').forEach((b) => b.addEventListener('click', () => { const [slot, o] = b.dataset.mod.split(':'); if (w.mods[slot] === o) return; if (!this.ctx.inventory.has('scrap', 2)) { ui.toast('2 scrap per mod.'); return; } this.ctx.inventory.remove('scrap', 2); w.mods[slot] = o; if (index === this.state.drawn) this.rebuildVM(); this.ctx.events.emit('weapon:mod', { id: w.id, slot, mod: o }); this.inspect(index); }));
      el.querySelector('[data-fix]')?.addEventListener('click', () => { if (this.maintain(w)) this.inspect(index); });
    });
    this.viewer(p.querySelector('.wv'), w);
  }
  nearBench() { const p = this.ctx.player.position; for (const com of Object.values(this.ctx.state.communities || {})) for (const r of com.rafts?.values?.() || []) if (r.info?.workbench && r.worldPoint(_v.copy(r.info.workbench)).distanceTo(p) < 4) return true; return false; }
  // a little turntable with its own renderer, lit like a workbench lamp
  viewer(canvas, w) {
    if (this.vr) { this.vr.dispose(); this.vr = null; }
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); r.setPixelRatio(Math.min(2, devicePixelRatio)); r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
    this.vr = r;
    const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, canvas.width / canvas.height, 0.01, 20);
    sc.environment = this.ctx.scene.environment || null;
    sc.add(new THREE.HemisphereLight(0xdfe8ff, 0x302820, 1.2));
    const key = new THREE.DirectionalLight(0xffe2c0, 2.6); key.position.set(1, 2, 1.5); sc.add(key);
    const rim = new THREE.DirectionalLight(0x9fc0ff, 1.6); rim.position.set(-1.5, 0.5, -1); sc.add(rim);
    const def = this.def(w.id), m = buildWeapon(w.id, def, w.mods, this.d.styles, this.kind(w.id)); setWear(m, w.cond, w.salt);
    const box = new THREE.Box3().setFromObject(m), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
    m.position.sub(c); const pivot = new THREE.Group(); pivot.add(m); sc.add(pivot);
    cam.position.set(0, size * 0.25, size * 1.25); cam.lookAt(0, 0, 0);
    let rotY = 0.9, rotX = 0.25, drag = null;
    canvas.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (!drag) return; rotY += (e.clientX - drag[0]) * 0.01; rotX += (e.clientY - drag[1]) * 0.01; drag = [e.clientX, e.clientY]; });
    canvas.addEventListener('pointerup', () => (drag = null));
    const loop = () => { if (!document.body.contains(canvas)) { r.dispose(); if (this.vr === r) this.vr = null; return; } if (!drag) rotY += 0.004; pivot.rotation.set(rotX, rotY, 0); r.render(sc, cam); requestAnimationFrame(loop); };
    loop();
  }

  // ---------------------------------------------------------------- HUD
  buildHud() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;right:18px;bottom:64px;z-index:20;pointer-events:none;font:13px ui-monospace,monospace;color:#efe6d4;text-shadow:0 1px 3px #000;text-align:right';
    document.body.appendChild(el); this.hudEl = el;
  }
  hud(w) {
    if (!w || this.ctx.mode !== 'play') { if (this.hudEl.textContent) this.hudEl.textContent = ''; return; }
    const def = this.def(w.id);
    const ammo = this.kind(w.id) === 'ranged' ? `${w.loaded}/${def.mag} · ${this.ammoCount(w)} spare${this.jammed ? ' · JAMMED' : ''}${this.reloadT > 0 ? ' · reloading' : ''}` : (this.held.rmb ? 'guard' : '');
    const s = `${def.name}${ammo ? ' — ' + ammo : ''} · stamina ${Math.round(this.stamina)}`;
    if (s !== this._hud) { this._hud = s; this.hudEl.textContent = s; }
  }
  toJSON() { return this.state; }
  load(o) { if (o) { this.state = { ...this.state, ...o, drawn: -1 }; } }
}

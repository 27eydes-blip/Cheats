import * as THREE from 'three';
import { Creature } from './Creature.js';
import { BODIES } from './species.js';

// The territorial bestiary: spawns the placed creatures near the player,
// runs their senses + state machines, keeps the journal bestiary, handles
// player tools (flares, noise-makers, bait, spears, salt), the Bloomwalker
// struggle, the three scripted encounters, and a debug overlay that shows
// territories, radii, sight cones and live states.
const ACTIVATE = 170;
const STATE_COL = { idle: 0x50c878, alert: 0xf0d050, warning: 0xf08a30, attack: 0xe03a3a, return: 0x60a0f0 };

export class Creatures {
  constructor(ctx) {
    this.ctx = ctx;
    this.data = ctx.data.creatures;
    this.senses = ctx.senses;
    this.group = new THREE.Group(); this.group.name = 'creatures';
    ctx.scene.add(this.group);
    this.list = [];
    this.log = [];
    this.struggle = null;
    this.flares = [];
    this.encounterState = {};
    this.debug = ctx.params.get('creatures') === 'debug';
    const only = ctx.params.get('creaturetest');
    if (ctx.params.get('creatures') !== 'off') {
      for (const place of this.data.placements) {
        const spec = this.data.species[place.species];
        if (!spec || spec.stub || !BODIES[place.species]) continue;
        if (only && only !== place.species && only !== place.id) continue;
        this.spawn(spec, place);
      }
    }
    this.buildDebug();
    this.buildStruggleUI();
    this.setupEncounters();
    ctx.events.on('player:died', () => this.endStruggle(false));
    addEventListener('keydown', (e) => {
      if (e.code === 'F7') this.toggleDebug();
      if (ctx.mode !== 'play' || ctx.ui.panel || e.repeat) return;
      const key = { KeyG: 'flare', KeyN: 'noisemaker', KeyB: 'bait', KeyH: 'spear', KeyX: 'salt', KeyZ: 'bandage' }[e.code];
      if (!key) return;
      if (!ctx.inventory.has(key)) { ctx.ui.toast(`No ${ctx.inventory.def(key)?.name?.toLowerCase() || key}.`); return; }
      ctx.survival.useItem(key);
    });
    window.__creatures = this;
  }
  spawn(spec, place) {
    const c = new Creature(this, spec, place, null);
    c.body = BODIES[place.species](this, c);
    c.body.group.visible = false;
    this.group.add(c.body.group);
    this.list.push(c);
    return c;
  }
  byId(id) { return this.list.find((c) => c.id === id); }
  byKind(k) { return this.list.filter((c) => c.kind === k); }

  // homes on rafts follow the raft; homes on roofs sit on the roof
  resolveHome(c) {
    const pl = c.place;
    if (pl.community) {
      const com = this.ctx.state.communities?.[pl.community];
      const r = com && [...com.rafts.values()][0];
      if (!r) return false;
      const o = pl.offset || [0, 0, 0];
      const before = c.home.clone();
      r.worldPoint(_a.set(o[0], r.deckAt(o[0], o[2]) + 0.02, o[2]), c.home);
      if (!c.homed) { c.pos.copy(c.home); c.homed = true; } else c.pos.add(_b.copy(c.home).sub(before)); // ride the deck
      return true;
    }
    if (pl.roof && !c.homed) {
      const g = this.ctx.collision.groundAt(pl.x, pl.z, 120);
      if (!Number.isFinite(g) || g < 1) return false;
      c.home.y = g; c.pos.copy(c.home); c.homed = true;
    }
    return true;
  }

  update(dt) {
    const ctx = this.ctx, pp = ctx.player.position;
    this.senses.update(dt);
    if (ctx.audio) ctx.audio.listenerNear = 0;
    this.flares = this.flares.filter((f) => (f.t -= dt) > 0);
    for (const c of this.list) {
      const near = Math.hypot(c.home.x - pp.x, c.home.z - pp.z) < ACTIVATE;
      if (near !== c.active) { c.active = near; c.body.group.visible = near; if (!near) { c.state = 'idle'; c.threat = 0; c.pos.copy(c.home); } }
      if (!near) continue;
      if (c.gone > 0) { c.gone -= dt; c.body.group.visible = false; continue; } else if (c.gone != null) { c.gone = null; c.health = c.spec.health ?? 60; c.body.group.visible = true; }
      if (c.place.roof && !this.resolveHome(c)) continue;
      if (c.place.community) this.resolveHome(c);
      this.applyTools(c, dt);
      c.update(dt);
    }
    this.updateStruggle(dt);
    this.updateEncounters(dt);
    if (this.debug) this.updateDebug();
  }

  // ---------------------------------------------------------------- tools
  applyTools(c, dt) {
    c.lure = null;
    for (const f of this.flares) {
      const d = c.pos.distanceTo(f.pos);
      if (f.kind === 'flare' && d < 18) {
        // light-shy creatures keep away from a burning flare; light-drawn ones go to it
        if ((c.spec.senses.light || 0) < 0) { if (c.state === 'attack' || c.state === 'warning') c.setState('return', 'flare'); c.threat *= 0.9; }
        else if ((c.spec.senses.light || 0) > 1) c.lure = f.pos;
      } else if (f.kind === 'noise' && d < 40 && (c.spec.senses.hearing || 0) > 0.4) {
        c.lure = f.pos;
        if (c.state === 'attack' && c.kind !== 'siltwolf') c.setState('return', 'chased the noise');
      } else if (f.kind === 'bait' && d < 25 && (c.spec.senses.food || 0) > 0.3) {
        c.lure = f.pos; c.threat *= Math.pow(0.4, dt);
        if (c.state === 'attack' || c.state === 'warning') c.setState('return', 'took the bait');
      }
    }
    if (c.saltT > 0) c.saltT -= dt;
  }
  throwPoint(dist) {
    const p = this.ctx.player;
    const out = p.eye.clone().add(p.forward.clone().multiplyScalar(dist));
    if (!this.ctx.atmosphere.underwater) out.y = Math.max(this.ctx.collision.groundAt(out.x, out.z, p.position.y + 2), this.ctx.waves.height(out.x, out.z));
    return out;
  }
  useTool(id) {
    const { ui, inventory, audio, events } = this.ctx;
    if (id === 'flare') {
      const pos = this.throwPoint(6);
      const light = new THREE.PointLight(0xff4a2a, 6, 22, 2); light.position.copy(pos).add(_a.set(0, 0.3, 0));
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffb0a0 })); core.position.copy(pos);
      this.ctx.scene.add(light, core);
      const f = { kind: 'flare', pos, t: 45, light, core };
      this.flares.push(f);
      const tick = setInterval(() => { light.intensity = (f.t > 0 ? 5 + Math.random() * 2 : 0) * Math.min(1, f.t / 5); if (f.t <= 0) { clearInterval(tick); this.ctx.scene.remove(light, core); } }, 60);
      ui.whisper('The flare catches with a hiss. Red light everywhere. Anything that hates light keeps its distance.');
      events.emit('noise', { level: 0.3, pos });
    } else if (id === 'noisemaker') {
      const pos = this.throwPoint(14);
      this.flares.push({ kind: 'noise', pos, t: 14 });
      audio?.started && audio.synth.clicks(audio.panner(pos, 6, 0.8), 10);
      ui.whisper('It lands with a clatter and starts to tick, loud and steady, away from you.');
    } else if (id === 'bait') {
      const pos = this.throwPoint(5);
      this.flares.push({ kind: 'bait', pos, t: 60 });
      ui.whisper('You toss the bait. Fish guts, wrapped in a rag. Something will want it more than you.');
    } else if (id === 'spear') {
      const c = this.nearestInFront(3.2);
      if (!c) { ui.toast('Nothing in reach.'); return false; }
      c.takeDamage(28);
      audio?.impact?.(c.pos, 0.6);
      if (c.health > 0) { if (c.kind === 'siltwolf' && c.health < 30) c.setState('return', 'hurt'); else if (c.state !== 'attack') c.setState('attack', 'struck'); }
      ui.whisper(c.health > 0 ? 'You drive the spear in. It jerks back.' : 'It breaks off and goes.');
      return true; // spears are kept
    } else if (id === 'salt') {
      if (this.struggle) { this.endStruggle(true, 'salt'); inventory.remove('salt'); return true; }
      const c = this.nearestInFront(4, 'bloomwalker');
      if (!c) { ui.toast('Salt is for the glow. Nothing glowing in reach.'); return false; }
      c.saltT = 30; c.setState('return', 'salted'); inventory.remove('salt');
      ui.whisper('The salt clouds the water. The glow on it shrinks back, like a hand from a stove.');
      return true;
    } else return false;
    inventory.remove(id);
    return true;
  }
  nearestInFront(range, kind) {
    const p = this.ctx.player;
    let best = null, bd = range;
    for (const c of this.list) {
      if (!c.active || (kind && c.kind !== kind)) continue;
      const d = c.pos.distanceTo(p.position);
      if (d < bd && _a.copy(c.pos).sub(p.eye).normalize().dot(p.forward) > 0.5) { bd = d; best = c; }
    }
    return best;
  }

  // ---------------------------------------------------------------- the Bloomwalker hold
  buildStruggleUI() {
    const el = document.createElement('div');
    el.className = 'struggle';
    el.innerHTML = '<p>It has you. <b>Struggle</b> — press <kbd>E</kbd> / <kbd>Space</kbd> fast. Salt breaks the hold.</p><div class="bar"><i></i></div>';
    document.body.appendChild(el);
    const st = document.createElement('style');
    st.textContent = `.struggle{position:fixed;left:50%;bottom:22%;transform:translateX(-50%);display:none;text-align:center;color:#e8efe8;font:15px Georgia,serif;text-shadow:0 1px 4px #000;z-index:35;pointer-events:none}
      .struggle .bar{width:280px;height:8px;margin:10px auto 0;background:rgba(255,255,255,.15);border-radius:4px;overflow:hidden}.struggle i{display:block;height:100%;width:0;background:#7fe0c8}
      .struggle kbd{border:1px solid #9aa;border-radius:3px;padding:0 4px;font:12px sans-serif}`;
    document.head.appendChild(st);
    this.struggleEl = el; this.struggleBar = el.querySelector('i');
  }
  startStruggle(c) {
    if (this.ctx.settings.difficulty === 'calm') { c.cool = 10; c.setState('return', 'calm mode'); return; }
    this.struggle = { c, prog: 0.15, t: 0, hurtT: 1 };
    this.struggleEl.style.display = 'block';
    this.ctx.events.emit('shake', 0.8);
    this.ctx.ui.whisper('Cold hands, soft as weed, close around your arm. It pulls you down, slowly, toward the light.');
    this.sound('moanSoft', c.pos, 1);
    this.noteSeen(c, 'hurt');
    this.logTransition(c, c.state, 'grab', 'hold');
  }
  updateStruggle(dt) {
    const s = this.struggle;
    if (!s) return;
    const { input, player, survival, injury } = this.ctx;
    s.t += dt;
    if (input.pressed('use') || input.pressed('dive')) s.prog += 0.09;
    s.prog = Math.max(0, s.prog - dt * 0.1);
    // held in place and drawn down; breath goes faster
    player.velocity.multiplyScalar(0.2);
    player.position.lerp(_a.copy(s.c.pos).add(_b.set(0, 0.6, 0)), Math.min(1, dt * 0.8));
    survival.oxygen = Math.max(0, survival.oxygen - dt * 2.5);
    s.hurtT -= dt;
    if (s.hurtT <= 0) { s.hurtT = 1.6; injury.hit(s.c.spec.damage * 0.4, { source: 'bloomwalker', what: 'a bloomwalker' }); }
    this.struggleBar.style.width = Math.round(Math.min(1, s.prog) * 100) + '%';
    if (s.prog >= 1) this.endStruggle(true, 'struggle');
    else if (!this.ctx.atmosphere.underwater && s.t > 1) this.endStruggle(true, 'surface');
  }
  endStruggle(free, how) {
    const s = this.struggle;
    if (!s) return;
    this.struggle = null;
    this.struggleEl.style.display = 'none';
    if (!free) return;
    s.c.cool = 9; s.c.saltT = how === 'salt' ? 30 : 0;
    s.c.setState('return', how === 'salt' ? 'salted' : 'broke free');
    this.ctx.player.velocity.y += 4;
    this.ctx.ui.whisper(how === 'salt' ? 'You grind the salt into the glow. It lets go at once, curling away.' : 'You tear loose. Up. Go up.');
  }

  // ---------------------------------------------------------------- calm-down, death of a creature
  calmAll() {
    this.endStruggle(false);
    for (const c of this.list) { c.threat = 0; c.wary = 0.5; if (c.state !== 'idle') c.setState('return', 'reset'); c.pos.copy(c.home); }
  }
  died(c) {
    // never shown: it breaks off and is gone for a while; what it leaves is salvage
    c.gone = 600; c.setState('return', 'driven off');
    const drop = { siltwolf: 'pelt', gullrat: 'feathers', needlefish: null }[c.kind];
    if (drop && this.ctx.inventory.def(drop)) { this.ctx.inventory.add(drop, 1); this.ctx.ui.toast('It leaves something behind: ' + this.ctx.inventory.def(drop).name); }
    this.noteSeen(c, 'driven');
    this.ctx.events.emit('creature:driven', c.kind);
  }

  // ---------------------------------------------------------------- bestiary + log
  logTransition(c, from, to, why) {
    const e = { t: +(this.ctx.state.playTime || 0).toFixed(1), id: c.id, from, to, why };
    this.log.push(e); if (this.log.length > 200) this.log.shift();
    if (this.debug || this.ctx.params.has('creaturelog')) console.log(`[creature] ${e.t}s ${c.id}: ${from} → ${to} (${why})`);
  }
  noteSeen(c, what) {
    if (what === 'idle' || what === 'return') return;
    const b = (this.ctx.state.bestiary ||= {});
    const e = (b[c.kind] ||= { seen: 0, warned: 0, hurt: 0, driven: 0, first: this.ctx.time.day });
    const first = !e.seen;
    if (what === 'alert' || what === 'warning' || what === 'attack') e.seen++;
    if (what === 'warning') e.warned++;
    if (what === 'hurt') e.hurt++;
    if (what === 'driven') e.driven++;
    if (first && e.seen) this.ctx.ui.toast(`Bestiary: ${c.spec.name}`);
  }
  // how much of each entry is known (0..3 notes revealed)
  known(kind) {
    const e = this.ctx.state.bestiary?.[kind];
    if (!e) return 0;
    return Math.min(3, (e.seen ? 1 : 0) + (e.warned || e.hurt ? 1 : 0) + (e.hurt + e.driven > 1 || e.seen > 4 ? 1 : 0));
  }
  sound(name, pos, k = 1) {
    const a = this.ctx.audio;
    if (!a?.started || !a.synth.creature) return;
    a.synth.creature(a.panner(pos.clone(), 4, 1.1), name, k);
  }

  // ---------------------------------------------------------------- encounters
  setupEncounters() {
    const E = this.data.encounters, ctx = this.ctx;
    // a flooded-street dive: the cache sits past the Net-Weaver's threads
    const sd = E.street_dive;
    if (sd && this.byId('nw_street')) {
      const [x, z] = sd.cache;
      const pos = new THREE.Vector3(x, -9, z);
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: 0x3d4a52, roughness: 0.6, metalness: 0.4 }));
      crate.position.copy(pos); this.group.add(crate);
      const fixY = () => { const g = ctx.collision.groundAt(x, z, -1.5); if (Number.isFinite(g)) { pos.y = g + 0.3; crate.position.y = pos.y; } };
      ctx.interact.add({
        kind: 'container', radius: 2.2, pos, prompt: 'Open the clinic lockbox',
        enabled: () => !this.encounterState.street_dive,
        onUse: () => { fixY(); for (const [id, n] of Object.entries(sd.loot)) ctx.inventory.add(id, n); this.encounterState.street_dive = 'done'; ctx.ui.whisper('A clinic lockbox, sealed. Bandages, medicine. Worth every thread you didn\'t touch.'); crate.visible = false; return true; },
      });
      this.streetCache = { pos, fixY };
    }
    // the silent crawl: a cache in the drowned station past the Listener
    const lc = E.listener_crawl;
    if (lc?.cache && this.byId('ls_cask')) {
      const [x, z] = lc.cache;
      const pos = new THREE.Vector3(x, -13, z);
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.5), new THREE.MeshStandardMaterial({ color: 0x5a3c2a, roughness: 0.8 }));
      box.position.copy(pos); this.group.add(box);
      ctx.interact.add({
        kind: 'container', radius: 2.2, pos, prompt: 'Open the station locker',
        enabled: () => !this.encounterState.listener_crawl,
        onUse: () => { for (const [id, n] of Object.entries(lc.loot || {})) ctx.inventory.add(id, n); this.encounterState.listener_crawl = 'done'; ctx.ui.whisper('A maintenance locker. You open it a millimetre at a time.'); box.visible = false; return true; },
      });
      this.crawlCache = { pos, box };
    }
  }
  updateEncounters(dt) {
    const ctx = this.ctx, pp = ctx.player.position, E = this.data.encounters, st = this.encounterState, ui = ctx.ui;
    const under = ctx.atmosphere.underwater;
    // hints as you approach (once each)
    const nw = this.byId('nw_street');
    if (nw && !st.street_hint && under && pp.distanceTo(nw.home) < 26) { st.street_hint = 1; ui.whisper(E.street_dive.hint); this.streetCache?.fixY(); }
    const ls = this.byId('ls_cask');
    if (ls && !st.crawl_hint && under && Math.hypot(pp.x - ls.home.x, pp.z - ls.home.z) < 42) { st.crawl_hint = 1; ui.whisper(E.listener_crawl.hint); ctx.audio?.silence?.(6); }
    if (this.crawlCache && !this.crawlCache.fixed) { const g = ctx.collision.groundAt(this.crawlCache.pos.x, this.crawlCache.pos.z, -2); if (Number.isFinite(g)) { this.crawlCache.pos.y = g + 0.25; this.crawlCache.box.position.y = g + 0.25; this.crawlCache.fixed = true; } }
    // the night raft raid: open food on the deck after dark
    const gr = this.byId('gr_portage');
    if (gr && gr.active) {
      const night = ctx.time.out.night > 0.6;
      const onDeck = pp.distanceTo(gr.home) < 14 && ctx.player.mode === 'foot';
      if (!night) st.raid = null;
      if (night && onDeck && this.senses.food > 0 && !st.raid) {
        st.raid = { t: 0, phase: 'start' };
        ui.whisper(E.raft_raid.text);
        gr.pos.copy(gr.home); gr.threat = 0.7; gr.setState('warning', 'raid');
      }
      if (st.raid && st.raid.phase === 'start') {
        st.raid.t += dt;
        // a lamp on them, or sealing the food away, ends it
        if (gr.state === 'return' && st.raid.t > 1) {
          st.raid.phase = 'over';
          if (gr.reason === 'driven off by light' || gr.reason === 'took the bait' || gr.reason === 'flare') {
            ctx.inventory.add('scrap', 6);
            ui.whisper('They scatter into the dark under the planks. In the morning Vance pays you six scrap for the watch. "Bounty\'s a bounty."');
          }
        }
      }
    }
  }
  // the bed at Portage: a raid interrupts sleep if food is out
  interruptSleep() {
    const gr = this.byId('gr_portage');
    if (!gr || !gr.active || this.ctx.time.out.night < 0.6 || this.senses.food <= 0 || this.encounterState.raid) return false;
    this.encounterState.raid = { t: 0, phase: 'start' };
    this.ctx.ui.whisper('You are almost asleep when you hear it. ' + this.data.encounters.raft_raid.text);
    gr.threat = 0.8; gr.setState('warning', 'raid');
    return true;
  }

  // ---------------------------------------------------------------- debug overlay
  buildDebug() {
    this.dbg = new THREE.Group(); this.dbg.visible = this.debug; this.ctx.scene.add(this.dbg);
    this.labels = document.createElement('div');
    this.labels.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:30;font:11px ui-monospace,monospace;color:#fff;text-shadow:0 0 3px #000';
    this.labels.style.display = this.debug ? 'block' : 'none';
    document.body.appendChild(this.labels);
    const ring = (r, col) => {
      const pts = []; for (let i = 0; i <= 48; i++) pts.push(new THREE.Vector3(Math.cos(i / 48 * 6.283) * r, 0, Math.sin(i / 48 * 6.283) * r));
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthTest: false }));
      l.renderOrder = 999; return l;
    };
    for (const c of this.list) {
      const g = new THREE.Group();
      const terr = ring(c.spec.territoryR, 0x50c878), alert = ring(c.spec.alertR, 0xf0d050), warn = ring(c.spec.warnR, 0xe03a3a);
      const cone = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-Math.sin(1.27) * 8, 0, Math.cos(1.27) * 8), new THREE.Vector3(), new THREE.Vector3(Math.sin(1.27) * 8, 0, Math.cos(1.27) * 8)]), new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }));
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
      cone.renderOrder = dot.renderOrder = 999;
      g.add(terr); this.dbg.add(g, alert, warn, cone, dot);
      const lab = document.createElement('div'); lab.style.position = 'absolute'; this.labels.appendChild(lab);
      c.dbg = { terr: g, alert, warn, cone, dot, lab };
    }
  }
  toggleDebug() { this.debug = !this.debug; this.dbg.visible = this.debug; this.labels.style.display = this.debug ? 'block' : 'none'; }
  updateDebug() {
    const cam = this.ctx.camera;
    for (const c of this.list) {
      const D = c.dbg, show = c.active;
      D.terr.visible = D.alert.visible = D.warn.visible = D.cone.visible = D.dot.visible = show;
      D.lab.style.display = show ? 'block' : 'none';
      if (!show) continue;
      D.terr.position.copy(c.home).setY(c.home.y + 0.05);
      D.alert.position.copy(c.pos).setY(c.pos.y + 0.05); D.warn.position.copy(D.alert.position);
      D.cone.position.copy(c.pos).setY(c.pos.y + 0.1); D.cone.rotation.y = c.heading; D.cone.visible = (c.spec.senses.vision || 0) > 0;
      D.dot.position.copy(c.pos).setY(c.pos.y + 1.2);
      D.dot.material.color.setHex(STATE_COL[c.state] || 0xffffff);
      const p = _a.copy(c.pos).setY(c.pos.y + 2.2).project(cam);
      if (p.z > 1) { D.lab.style.display = 'none'; continue; }
      D.lab.style.left = ((p.x * 0.5 + 0.5) * innerWidth).toFixed(0) + 'px';
      D.lab.style.top = ((-p.y * 0.5 + 0.5) * innerHeight).toFixed(0) + 'px';
      D.lab.innerHTML = `<b style="color:#${(STATE_COL[c.state] || 0xffffff).toString(16).padStart(6, '0')}">${c.id} ${c.state.toUpperCase()}</b><br>threat ${c.threat.toFixed(2)} · ${c.perceived?.why || '-'} · ${c.perceived?.d?.toFixed(1) ?? '?'}m${c.awake ? '' : ' · asleep'}`;
    }
  }

  toJSON() { return { bestiary: this.ctx.state.bestiary || {}, enc: this.encounterState }; }
  load(o) { if (!o) return; this.ctx.state.bestiary = o.bestiary || {}; this.encounterState = o.enc || {}; }
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

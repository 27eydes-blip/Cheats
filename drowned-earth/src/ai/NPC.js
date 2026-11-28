import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { prepGeometry, boxGeometry } from '../world/Builder.js';
import { mat } from '../world/Materials.js';
import { damp } from '../core/rng.js';
import { Character, charactersAvailable } from './Characters.js';
import { Person } from '../humans/Person.js';
import { personFor, voicePitch } from '../humans/Roster.js';
import { Manners } from '../people/Manners.js';

// Raft-folk. Low-poly figures with procedural animation, living on a raft
// (they are children of the raft so they ride its motion). Each follows a
// daily schedule of chores from data/npcs.json, keeps a polite distance from
// the player, and can be talked to (or traded with).
const geoCache = {};
function part(name) {
  if (geoCache[name]) return geoCache[name];
  let g;
  if (name === 'torso') { g = boxGeometry(0.42, 0.62, 0.24); g.translate(0, 0.31, 0); }
  if (name === 'head') { g = new THREE.SphereGeometry(0.13, 8, 6); g.scale(1, 1.15, 1.05); g.translate(0, 0.14, 0); }
  if (name === 'limbA') { g = boxGeometry(0.12, 0.62, 0.12); g.translate(0, -0.31, 0); }
  if (name === 'limbL') { g = boxGeometry(0.15, 0.82, 0.15); g.translate(0, -0.41, 0); }
  if (name === 'hood') { g = new THREE.SphereGeometry(0.16, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6); g.translate(0, 0.16, -0.01); }
  if (name === 'hat') { g = new THREE.CylinderGeometry(0.28, 0.28, 0.03, 10); const t = new THREE.CylinderGeometry(0.13, 0.15, 0.14, 8); t.translate(0, 0.08, 0); g = mergeGeometries([g.toNonIndexed(), t.toNonIndexed()]); g.translate(0, 0.24, 0); }
  if (name === 'mask') { g = boxGeometry(0.2, 0.1, 0.06); g.translate(0, 0.1, 0.12); }
  geoCache[name] = prepGeometry(g, [1, 1, 1]);
  return geoCache[name];
}

export class NPC {
  constructor(ctx, def, raft) {
    this.ctx = ctx;
    this.def = def;
    this.raft = raft;
    this.root = new THREE.Group();
    this.root.name = 'npc:' + def.id;
    // realistic people are built lazily, one per frame, as the player comes near
    this.wantsHuman = !!ctx.humans;
    if (!this.wantsHuman && charactersAvailable(ctx.assets)) this.buildRigged(ctx, def);
    else if (!this.wantsHuman) this.buildBlocky(def);
    raft.root.add(this.root);
    this.local = new THREE.Vector3(def.spawn?.[0] ?? 0, raft.deckAt(def.spawn?.[0] ?? 0, def.spawn?.[1] ?? 0), def.spawn?.[1] ?? 0);
    this.target = this.local.clone();
    this.heading = 0;
    this.activity = 'idle';
    this.phase = Math.random() * 10;
    this.walk = 0;
    this.speech = null;
    this.backoff = 0;
    this.taskTimer = 0;
    this.root.position.copy(this.local);
  }
  buildHuman(ctx, def) {
    const community = { market: 'portage', dock: 'portage', chapel: 'portage', lookout: 'portage', gt_plots: 'greentide', rh_rig: 'rusthold' }[def.raft] || 'default';
    const tier = def.role === 'leader' ? 4 : def.role === 'trader' || def.role === 'fixer' ? 5 : 6;
    this.rig = new Person(ctx, ctx.humans, personFor(def.id, { palette: community, tier, labour: /mechanic|dock|water/.test(def.role) ? 1 : 0, name: def.name, presents: def.presents, role: def.role }));
    this.root.add(this.rig.root);
    this.root.scale.setScalar(1);
    this.manners = new Manners(this); this.voicePitch = voicePitch;
  }
  buildRigged(ctx, def) {
    let seed = 0;
    for (const ch of def.id) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
    const skinLum = def.skin ? (def.skin[0] + def.skin[1] + def.skin[2]) / 3 : null;
    this.rig = new Character(ctx.assets, {
      seed,
      female: def.female,
      outfit: def.headwear === 'hood' ? 'Ranger' : undefined,
      skin: skinLum == null ? undefined : Math.max(0, Math.min(5, Math.round((0.95 - skinLum) / 0.11))),
      cloth: def.coat ? def.coat.map((c) => c * 1.9 + 0.15) : undefined,
    });
    this.root.add(this.rig.root);
    this.root.scale.setScalar(def.scale || 1);
  }
  buildBlocky(def) {
    const fabric = mat('fabric');
    const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color(...(def.skin || [0.62, 0.46, 0.36])), roughness: 0.8 });
    const coat = fabric.clone(); coat.color = new THREE.Color(...(def.coat || [0.4, 0.38, 0.32]));
    const pants = fabric.clone(); pants.color = new THREE.Color(...(def.pants || [0.25, 0.25, 0.27]));
    const mk = (g, m) => { const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; return mesh; };
    this.hips = new THREE.Group(); this.hips.position.y = 0.88;
    this.torso = mk(part('torso'), coat); this.hips.add(this.torso);
    this.head = mk(part('head'), skin); this.head.position.y = 0.66; this.torso.add(this.head);
    const eyeM = new THREE.MeshBasicMaterial({ color: 0x1a1512 });
    for (const ex of [-0.045, 0.045]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 5, 4), eyeM); e.position.set(ex, 0.17, 0.125); this.head.add(e); }
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.03, 0.03), new THREE.MeshStandardMaterial({ color: new THREE.Color(...(def.pants || [0.2, 0.2, 0.2])).multiplyScalar(0.6) })); brow.position.set(0, 0.215, 0.115); this.head.add(brow);
    if (def.headwear === 'hood') this.head.add(mk(part('hood'), coat));
    if (def.headwear === 'hat') this.head.add(mk(part('hat'), pants));
    if (def.mask) this.head.add(mk(part('mask'), new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 1 })));
    this.armL = mk(part('limbA'), coat); this.armL.position.set(-0.27, 0.58, 0); this.torso.add(this.armL);
    this.armR = mk(part('limbA'), coat); this.armR.position.set(0.27, 0.58, 0); this.torso.add(this.armR);
    this.legL = mk(part('limbL'), pants); this.legL.position.set(-0.11, 0, 0); this.hips.add(this.legL);
    this.legR = mk(part('limbL'), pants); this.legR.position.set(0.11, 0, 0); this.hips.add(this.legR);
    this.root.add(this.hips);
    this.root.scale.setScalar(def.scale || 1);
  }
  currentTask() {
    if (this.override) return this.override; // the Society bends the routine
    const h = this.ctx.time.hour;
    let best = this.def.schedule[0];
    for (const s of this.def.schedule) if (h >= s.from && h < s.to) best = s;
    // wrap-around night entries
    for (const s of this.def.schedule) if (s.from > s.to && (h >= s.from || h < s.to)) best = s;
    return best;
  }
  update(dt, playerLocal, playerNear) {
    this.phase += dt;
    const task = this.currentTask();
    if (task !== this.task) {
      this.task = task;
      const spot = this.raft.info.spots.find((s) => s.kind === task.at) || null;
      const [x, z] = task.pos || (spot ? [spot.x, spot.z] : [this.local.x, this.local.z]);
      this.target.set(x, this.raft.deckAt(x, z), z);
      this.activity = task.do;
      this.face = task.face ?? spot?.face ?? null;
      // off-shift people go home (out of sight) and come back on schedule
      this.root.visible = task.do !== 'away' && task.do !== 'sleep';   // sleepers are in their shelters, not hovering on deck
      if (task.do === 'away') { this.local.copy(this.target); }
    }
    // manners: gaze, greetings, mood, chats and reactions (only for built, drawn people)
    const mind = this.manners && this.rig?.root.visible ? this.manners : null;
    if (mind) mind.update(dt);
    // keep a polite distance
    let tx = this.target.x, tz = this.target.z;
    if (mind?.goal) { tx = mind.goal.x; tz = mind.goal.z; }
    if (playerNear && playerLocal) {
      const dx = this.local.x - playerLocal.x, dz = this.local.z - playerLocal.z;
      const d = Math.hypot(dx, dz);
      const keep = this.def.respect ? 1.1 : this.ctx.standing.shown === 7 ? 2.4 : 1.5;
      if (d < keep && d > 0.01) { tx = this.local.x + (dx / d) * 1.2; tz = this.local.z + (dz / d) * 1.2; this.backoff = 1.2; }
    }
    this.backoff = Math.max(0, this.backoff - dt);
    const dx = tx - this.local.x, dz = tz - this.local.z;
    const dist = Math.hypot(dx, dz);
    let moving = false;
    if (dist > 0.15) {
      const sp = (this.backoff > 0 ? 0.8 : 1.0) * (this.speedK ?? 1);   // a calm step aside, not a sprint
      const step = Math.min(dist, sp * dt);
      this.local.x += (dx / dist) * step; this.local.z += (dz / dist) * step;
      // stay on deck
      const r = this.raft.rects;
      let inside = r.some((q) => this.local.x > q.x0 + 0.3 && this.local.x < q.x1 - 0.3 && this.local.z > q.z0 + 0.3 && this.local.z < q.z1 - 0.3);
      if (!inside) { this.local.x -= (dx / dist) * step; this.local.z -= (dz / dist) * step; }
      this.local.y = this.raft.deckAt(this.local.x, this.local.z);
      this.heading = damp(this.heading, Math.atan2(dx, dz), 8, dt);
      moving = true;
    } else if (this.chatFace != null) {
      this.heading = damp(this.heading, this.chatFace, 4, dt);   // face whoever they're talking with
    } else if (this.face != null && !(playerNear && playerLocal && this.talkT > 0)) {
      this.heading = damp(this.heading, this.face, 4, dt);
    } else if (playerNear && playerLocal && this.activity !== 'sleep') {
      // turn to face the player when they are close
      const fx = playerLocal.x - this.local.x, fz = playerLocal.z - this.local.z;
      if (Math.hypot(fx, fz) < 5) this.heading = damp(this.heading, Math.atan2(fx, fz), 3, dt);
    }
    this.walk = damp(this.walk, moving ? 1 : 0, 6, dt);
    this.animate(dt, moving);
    this.root.position.copy(this.local);
    this.root.rotation.y = this.heading;
  }
  animate(dt, moving) {
    if (this.wantsHuman && !this.rig) {
      const d2 = this.worldPos(_w).distanceToSquared(this.ctx.player.position);
      const frame = this.ctx.game.frame;
      if (d2 < 75 * 75 && NPC.lastBuild !== frame) { NPC.lastBuild = frame; this.buildHuman(this.ctx, this.def); }
      else return;
    }
    // far away: free the whole human (geometry, skinning, textures stay cached in the kit) instead of keeping a
    // hidden body in memory; it's rebuilt when you come back within 75 m
    if (this.rig?.human && this.worldPos(_w).distanceToSquared(this.ctx.player.position) > 170 * 170) {
      this.root.remove(this.rig.root); this.rig.dispose(); this.rig = null; this.manners = null; return;
    }
    if (this.rig) {
      const p = this.ctx.player.position;
      const near = this.worldPos(_w).distanceToSquared(p) < 36;
      this.talkT = Math.max(0, (this.talkT || 0) - dt);
      const sitting = ['sit', 'fish', 'mend'].includes(this.activity);
      // people who sit get a crate under them (Gestures places it); hard workers don't stand idle — they sweep
      const m = this.manners, now = performance.now() / 1000;
      const work = this.activity === 'idle' && (m?.tr.industry ?? 0) > 0.6 ? 'sweep' : this.activity;
      const speaking = this.chatTalk && now >= this.chatTalk[0] && now < this.chatTalk[1];
      const carrying = moving && !this.fleeing && /dock|runner|scavenger/.test(this.def.role || '');
      const act = moving ? (this.fleeing ? 'run' : carrying ? 'carry' : 'walk') : this.talkT > 0 || speaking ? (sitting ? 'sitTalk' : 'talk') : work;
      if (this.rig.doing) this.rig.doing(act, moving, moving ? null : m?.layer ?? null);
      else this.rig.play(act);
      // distant people animate at a lower rate (cheap crowd)
      const d2 = this.worldPos(_w).distanceToSquared(p);
      const far = d2 > 900;
      // people beyond the preset's crowd distance aren't drawn at all
      const vis = this.ctx.settings.quality === 'laptop' ? 35 : this.ctx.settings.q.npcDetail === 0 ? 45 : 90;
      // and never more than the preset's head count drawn at once (Laptop 12), first come first drawn each frame
      const frame = this.ctx.game.frame, cap = this.ctx.settings.q.maxDrawn || 999;
      if (NPC.drawnFrame !== frame) { NPC.drawnFrame = frame; NPC.drawn = 0; }
      this.rig.root.visible = d2 < vis * vis && NPC.drawn < cap;
      if (this.rig.root.visible) NPC.drawn++;
      if (!this.rig.root.visible) return;
      this.animAcc = (this.animAcc || 0) + dt;
      if (far && this.animAcc < 0.1) return;
      if (this.rig.human) {
        // realistic people: LOD by distance, rain soaks them, walking speed matches the feet
        const phone = this.ctx.settings.q.npcDetail === 0;
        this.rig.human.setLod(d2 > (phone ? 64 : 400) ? 1 : 0);
        this.rig.detail = d2 <= (phone ? 64 : 400);   // seats and props only at full detail
        this.rig.human.setWet(Math.min(1, this.ctx.weather.cur.rain * 1.3), this.ctx.time.out.sunI > 2 && /hammer|repair|haul/.test(this.activity) ? 0.5 : 0);
        this.rig.setSpeed(moving ? (this.fleeing ? 1.4 : this.backoff > 0 ? 0.8 : 1.0) : 0);
        // they read your wristband: how far apart you stand in the Order shows on their face
        if (near && !this.faceSet) {
          const gap = (this.rig.p.tier ?? 6) - (this.ctx.standing?.shown ?? 7);
          this.rig.human.face.setEmotion(this.def.respect ? 'calm' : gap <= -2 ? 'suspicious' : gap < 0 ? 'worried' : 'calm', 0.8);
          this.faceSet = true;
        } else if (!near && this.faceSet) { this.rig.human.face.setEmotion(this.rig.p.emotion || 'calm'); this.faceSet = false; }
      }
      this.rig.update(this.animAcc, this.manners?.lookOn ? _e.copy(this.manners.look) : near && this.activity !== 'sleep' ? _e.copy(this.ctx.camera.position) : null);
      this.animAcc = 0;
      return;
    }
    const t = this.phase;
    const w = this.walk;
    const s = Math.sin(t * 7) * w;
    this.legL.rotation.x = s * 0.6; this.legR.rotation.x = -s * 0.6;
    this.armL.rotation.x = -s * 0.5; this.armR.rotation.x = s * 0.5;
    this.hips.position.y = 0.88 + Math.abs(Math.cos(t * 7)) * 0.03 * w;
    this.torso.rotation.set(0, 0, 0); this.head.rotation.set(0, 0, 0);
    this.armL.rotation.z = 0; this.armR.rotation.z = 0;
    if (moving) return;
    const a = this.activity;
    const breathe = Math.sin(t * 1.6) * 0.015;
    this.torso.rotation.x = breathe;
    if (a === 'hammer' || a === 'repair') { this.torso.rotation.x = 0.35; this.armR.rotation.x = -1.2 + Math.abs(Math.sin(t * 5)) * 1.1; }
    else if (a === 'cook' || a === 'stir') { this.torso.rotation.x = 0.25; this.armR.rotation.x = -0.9; this.armR.rotation.z = Math.sin(t * 3) * 0.3; }
    else if (a === 'garden') { this.torso.rotation.x = 0.9; this.hips.position.y = 0.7; this.armL.rotation.x = -0.6 + Math.sin(t * 2) * 0.3; this.armR.rotation.x = -0.6 - Math.sin(t * 2) * 0.3; }
    else if (a === 'watch') { this.head.rotation.y = Math.sin(t * 0.3) * 0.8; this.armR.rotation.x = -2.2; }
    else if (a === 'sell') { this.armR.rotation.x = -0.4 + Math.sin(t * 0.8) * 0.2; this.head.rotation.y = Math.sin(t * 0.5) * 0.4; }
    else if (a === 'laundry') { this.armL.rotation.x = -2.4 + Math.sin(t * 2) * 0.2; this.armR.rotation.x = -2.4 - Math.sin(t * 2) * 0.2; }
    else if (a === 'sit') { /* no seats on the rafts: stand */ }
    else if (a === 'sleep') { this.hips.position.y = 0.2; this.torso.rotation.x = -1.45; this.legL.rotation.x = -1.5; this.legR.rotation.x = -1.5; }
    else if (a === 'pray') { this.torso.rotation.x = 0.15; this.head.rotation.x = 0.4; this.armL.rotation.x = -0.8; this.armR.rotation.x = -0.8; }
    else if (a === 'festival') { this.head.rotation.x = -0.15; this.armR.rotation.x = -0.5 + Math.sin(t * 0.6) * 0.1; }
    else if (a === 'fish') { this.armR.rotation.x = -1.0 + Math.sin(t * 0.7) * 0.1; this.armL.rotation.x = -0.9; }
    else { this.head.rotation.y = Math.sin(t * 0.4 + 1) * 0.5; }
  }
  worldPos(out = new THREE.Vector3()) { return this.root.getWorldPosition(out); }
}
const _w = new THREE.Vector3(), _e = new THREE.Vector3();

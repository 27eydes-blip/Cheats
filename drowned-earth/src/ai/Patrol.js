import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { prepGeometry, boxGeometry } from '../world/Builder.js';
import { mat } from '../world/Materials.js';
import { LAYER_FX } from '../render/Pipeline.js';

// Tide Warden patrol boat with a state machine:
//   patrol → suspicious (heard an engine / saw a lamp) → search → chase → stop (boarding)
// Detection uses the searchlight cone + line of sight, the player's boat noise,
// lamps, fog, and distance. Hide by cutting the engine (C), killing lights and
// putting a building between you and the beam. Standing decides how a stop goes.
const ROUTE = [[-620, 600], [620, 600], [640, -40], [600, -620], [-600, -640], [-640, 60]];
const FOG_ROUTE = [[180, 330], [250, 160], [380, 120], [440, 300], [300, 400]]; // fog-night run past Portage
const LINES = {
  suspicious: ['Engine noise, port side. Bring the light round.', 'Hold. Did you hear that?'],
  chase: ['Unregistered craft! Heave to and show your wrist!', 'Cut your engine and stand where we can see you!', 'Heave to! This is the Tide Ward!'],
  lost: ['Lost them in the wreck. Mark it.', "Probably a drifter. Let's go."],
};

export class Patrol {
  constructor(ctx) {
    this.ctx = ctx;
    const parts = [];
    const add = (g, c, x, y, z) => { g.translate(x, y, z); parts.push(prepGeometry(g, c)); };
    add(boxGeometry(3, 1.6, 10), [0.16, 0.18, 0.24], 0, 0.3, 0);
    add(boxGeometry(2.2, 1.6, 3.5), [0.22, 0.24, 0.3], 0, 1.9, 0.8);
    add(boxGeometry(0.12, 2.5, 0.12), [0.3, 0.3, 0.3], 0, 3.6, 1.5);
    add(boxGeometry(3.1, 0.25, 10.1), [0.82, 0.82, 0.78], 0, 1.0, 0);
    add(boxGeometry(0.6, 0.5, 0.8), [0.12, 0.12, 0.14], 0, 2.9, -1.2);
    this.group = new THREE.Group();
    const mesh = new THREE.Mesh(mergeGeometries(parts), mat('metal'));
    mesh.castShadow = true;
    this.group.add(mesh);
    this.red = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
    this.red.position.set(0, 4.9, 1.5);
    this.group.add(this.red);
    this.spot = new THREE.SpotLight(0xe8f2ff, 0, 170, 0.13, 0.4, 1.0);
    this.spot.position.set(0, 3.2, -1.6);
    this.spot.layers.enableAll();
    this.spotTarget = new THREE.Object3D();
    this.spot.target = this.spotTarget;
    this.group.add(this.spot);
    const cg = new THREE.ConeGeometry(9, 70, 16, 1, true); cg.translate(0, -35, 0); cg.rotateX(-Math.PI / 2);
    this.beam = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0xcfe4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true }));
    this.beam.layers.set(LAYER_FX);
    this.group.add(this.beam);
    ctx.scene.add(this.group, this.spotTarget);
    this.route = ROUTE; this.seg = 0; this.u = 0;
    this.pos = new THREE.Vector3(ROUTE[0][0], 0, ROUTE[0][1]);
    this.heading = 0;
    this.state = 'patrol';
    this.stateT = 0;
    this.target = new THREE.Vector3();
    this.lastSeen = new THREE.Vector3();
    this.sweep = 0;
    this.awareness = 0;   // 0..1 build-up before a sighting counts
    this.cooldown = 0;
    this.emitter = null;
    this.forceActive = false;
    this.lineT = 0;
  }
  get active() {
    if (this.ctx.settings.difficulty === 'calm') return false;
    const h = this.ctx.time.hour;
    return this.forceActive || h >= 21 || h < 4.5 || this.ctx.heat.hunted || this.ctx.params.has('patrol');
  }
  setState(s) { if (this.state !== s) { this.state = s; this.stateT = 0; this.ctx.events.emit('patrol:state', s); } }
  say(kind) {
    if (this.lineT > 0) return;
    this.lineT = 7;
    const l = LINES[kind]; const text = l[Math.floor(Math.random() * l.length)];
    if (this.pos.distanceTo(this.ctx.player.position) < 160) { this.ctx.ui.subtitle(`Loudspeaker: ${text}`, 4, 'radio'); this.ctx.audio?.loudspeaker(this.pos, 3.5); }
  }
  // Fog-bound night: a patrol sweeps past Portage on the first night.
  startFogRun() { this.route = FOG_ROUTE; this.seg = 0; this.u = 0; this.pos.set(FOG_ROUTE[0][0], 0, FOG_ROUTE[0][1]); this.forceActive = true; this.fogRun = true; }
  moveToward(p, speed, dt) {
    const d = new THREE.Vector3(p.x - this.pos.x, 0, p.z - this.pos.z);
    const len = d.length();
    if (len < 0.5) return len;
    d.divideScalar(len);
    const want = Math.atan2(-d.x, -d.z);
    let diff = want - this.heading; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
    this.heading += Math.max(-1.2 * dt, Math.min(1.2 * dt, diff));
    const v = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading)).multiplyScalar(speed);
    this.pos.addScaledVector(v, dt);
    this.ctx.collision.resolveHull(this.pos, 2.4, v);
    return len;
  }
  // 0..1 how visible the player is to this patrol right now
  visibility(dir) {
    const { player, boat, weather, collision, atmosphere } = this.ctx;
    if (player.headUnder) return 0;
    const sp = this.spot.getWorldPosition(new THREE.Vector3());
    const toP = player.eye.clone().sub(sp);
    const d = toP.length();
    const fog = Math.exp(-Math.pow(atmosphere.fog.near * d * 1.3, 2));
    let v = 0;
    const inBeam = d < 150 && toP.clone().normalize().dot(dir) > Math.cos(0.16);
    if (inBeam) v = 1;
    else if (d < 30) v = 0.35;
    const lit = (boat.lantern || boat.spotOn || player.flashlight) ? 1 : 0;
    if (lit && d < 220) v = Math.max(v, 0.6);
    if (v > 0 && collision.raycast(sp, toP.normalize(), d) < d - 1.5) v = 0; // occluded
    return v * fog * (1 - weather.cur.rain * 0.3);
  }
  update(dt) {
    const { waves, player, boat, heat, ui } = this.ctx;
    const on = this.active;
    this.group.visible = on;
    if (!on) { this.spot.intensity = 0; this.setState('patrol'); return; }
    this.stateT += dt; this.cooldown = Math.max(0, this.cooldown - dt); this.lineT = Math.max(0, this.lineT - dt);
    const fwd = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
    // beam aim
    this.sweep += dt * (this.state === 'patrol' ? 0.35 : 0.9);
    let dir;
    if (this.state === 'chase' || this.state === 'stop') dir = player.eye.clone().sub(this.pos).setY(0).normalize().setY(-0.08).normalize();
    else if (this.state === 'suspicious' || this.state === 'search') { const toT = this.target.clone().sub(this.pos).setY(0).normalize(); const a = Math.sin(this.sweep) * 0.5; dir = toT.applyAxisAngle(new THREE.Vector3(0, 1, 0), a).setY(-0.1).normalize(); }
    else { const a = Math.sin(this.sweep) * 1.1; dir = fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a).setY(-0.12).normalize(); }
    const vis = this.visibility(dir);
    const noise = player.mode === 'boat' ? boat.noise() : player.mode === 'swim' ? 6 : 0;
    const d = this.pos.distanceTo(player.position);
    const heard = d < noise * (1 - this.ctx.weather.cur.rain * 0.4);
    this.awareness = Math.max(0, Math.min(1, this.awareness + (vis > 0.2 ? vis * dt * 1.4 : -dt * 0.25)));
    const seen = this.awareness > 0.6;
    if (seen) this.lastSeen.copy(player.position);
    switch (this.state) {
      case 'patrol': {
        const r = this.route, a = r[this.seg], b = r[(this.seg + 1) % r.length];
        const len = this.moveToward({ x: b[0], z: b[1] }, 7, dt);
        if (len < 6) { this.seg = (this.seg + 1) % r.length; if (this.fogRun && this.seg === 0) { this.fogRun = false; this.forceActive = false; this.route = ROUTE; } }
        if (this.cooldown <= 0 && (seen || (heated(heat) && vis > 0.1))) { this.setState('chase'); this.say('chase'); }
        else if (this.cooldown <= 0 && (heard || vis > 0.1)) { this.target.copy(player.position); this.setState('suspicious'); this.say('suspicious'); }
        break;
      }
      case 'suspicious':
        this.moveToward(this.target, 4, dt);
        if (seen) { this.setState('chase'); this.say('chase'); }
        else if (heard) this.target.lerp(player.position, dt * 0.5);
        else if (this.stateT > 12) this.setState('search');
        break;
      case 'search':
        this.moveToward(this.target.clone().add(new THREE.Vector3(Math.cos(this.stateT * 0.3) * 25, 0, Math.sin(this.stateT * 0.3) * 25)), 5, dt);
        if (seen) { this.setState('chase'); this.say('chase'); }
        else if (heard) { this.target.copy(player.position); this.setState('suspicious'); }
        else if (this.stateT > 22) { this.say('lost'); this.setState('patrol'); this.cooldown = 20; this.ctx.events.emit('patrol:evaded'); }
        break;
      case 'chase': {
        this.moveToward(seen ? player.position : this.lastSeen, 11, dt);
        heat.add(dt * 2.2, null);
        this.say('chase');
        if (!seen && this.awareness < 0.3) { this.target.copy(this.lastSeen); this.setState('search'); }
        if (d < 16 && player.mode === 'boat' && boat.speed < 2.5) this.startStop();
        if (d < 16 && player.mode !== 'boat' && !player.headUnder && this.stateT > 4) { ui.whisper('The searchlight pins you. A voice: "We know that boat. We\'ll find it." They leave a buoy marker and move on.'); heat.add(15, 'seen on foot'); this.setState('patrol'); this.cooldown = 60; }
        break;
      }
      case 'stop':
        boat.vel.multiplyScalar(0.9);
        if (player.mode === 'boat' && boat.speed > 3.5 && this.stateT > 1.5 && !ui.open) { heat.add(30, 'fled an inspection'); ui.whisper('You open the throttle. Shouts behind you, then the searchlight swings after you.'); this.setState('chase'); }
        break;
      default: break;
    }
    // visuals
    this.pos.y = waves.height(this.pos.x, this.pos.z) - 0.1;
    this.group.position.copy(this.pos);
    this.group.rotation.set(Math.sin(waves.time * 0.8) * 0.02, this.heading, Math.sin(waves.time * 0.6) * 0.03);
    this.group.updateMatrixWorld();
    const sp = this.spot.getWorldPosition(new THREE.Vector3());
    this.spotTarget.position.copy(sp).addScaledVector(dir, 40); this.spotTarget.updateMatrixWorld();
    this.spot.intensity = 1100;
    const localDir = dir.clone().applyQuaternion(this.group.quaternion.clone().invert());
    this.beam.position.copy(this.spot.position);
    this.beam.lookAt(this.beam.position.clone().add(localDir)); this.beam.rotateY(Math.PI);
    this.beam.material.opacity = 0.05 + this.ctx.atmosphere.fog.near * 25 + this.ctx.weather.cur.rain * 0.05;
    this.red.visible = Math.sin(waves.time * 3) > 0;
    if (!this.emitter && this.ctx.audio?.started) this.emitter = this.ctx.audio.addEmitter({ type: 'patrolEngine', pos: (v) => v.copy(this.pos) });
    if (this.ctx.audio?.started) this.ctx.audio.danger = this.state === 'chase' ? 1 : this.state === 'search' || this.state === 'suspicious' ? 0.5 : 0;
  }
  startStop() {
    if (this.state === 'stop') return;
    this.setState('stop');
    this.ctx.events.emit('patrol:stop');
    this.ctx.ui.openInspection(this);
  }
  endStop(outcome) {
    this.setState('patrol');
    this.cooldown = 90;
    this.awareness = 0;
    this.ctx.events.emit('patrol:stopEnded', outcome);
  }
  // The boarding search: Standing decides the tone; contraband is seized.
  inspect() {
    const { standing, inventory, heat, data } = this.ctx;
    const out = { lines: [], seized: [], fine: 0, forged: false };
    const mode = standing.info().patrol;
    out.forged = standing.inspect();
    if (out.forged) out.lines.push('"This is Sal\'s work." The Warden snaps your yellow tag in half and writes your boat\'s name in a ledger.');
    const searched = mode === 'search' || mode === 'seize' || out.forged || heat.value > 40;
    if (!searched) { out.lines.push('A Warden glances at your wrist, nods, and waves you on. "Safe waters."'); return out; }
    for (const [id, n] of Object.entries(inventory.items)) {
      const d = data.items.items[id];
      if (!d) continue;
      const contraband = d.tags.includes('contraband') || (mode === 'seize' && d.tags.includes('sealed') && id !== 'seal');
      if (contraband) { inventory.remove(id, n); out.seized.push(`${d.name}${n > 1 ? ' ×' + n : ''}`); }
    }
    if (out.seized.length) { heat.add(15, 'contraband'); out.fine = Math.min(inventory.count('scrap'), 5 + Math.round(heat.value / 10)); if (out.fine) inventory.remove('scrap', out.fine); }
    out.lines.push(mode === 'seize' ? 'They search the boat like it owes them something. A conscript deckhand opens your locker, sees the dive tally on your sleeve, and quietly closes it again.' : 'They search the boat, unhurried, thorough.');
    if (out.seized.length) out.lines.push(`Seized: ${out.seized.join(', ')}.${out.fine ? ` Fined ${out.fine} scrap.` : ''}`);
    else out.lines.push('They find nothing worth taking. That is almost a disappointment to them.');
    return out;
  }
}
const heated = (heat) => heat.value > 55;

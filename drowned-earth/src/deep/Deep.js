import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { propGeometry } from '../world/Props.js';
import { mat } from '../world/Materials.js';
import { LAYER_FX } from '../render/Pipeline.js';
import { G } from '../world/WorldShader.js';

// The Deep: depth zones (light, fog, pressure, dread), lanternfish swarms
// that go dark when something passes, Listeners that hunt by sound and are
// never shown clearly, and the glowing growth creeping up from the Sounding.
const _v = new THREE.Vector3();

export class Deep {
  constructor(ctx) {
    this.ctx = ctx;
    this.def = ctx.data.deep;
    this.zone = this.def.zones[0];
    this.lastZone = null;
    this.seenZones = new Set();
    this.noise = 0;              // player's underwater noise (0..1)
    this.noisePos = new THREE.Vector3();
    if (ctx.state.glow == null) ctx.state.glow = this.def.glow.start;
    this.buildSwarms();
    this.buildListeners();
    this.buildGrowth();
    ctx.events.on('slept', () => this.addGlow(this.def.glow.perDay * 0.5));
    this.day = ctx.time.day;
  }
  addGlow(v) { this.ctx.state.glow = Math.min(1, this.ctx.state.glow + v); this.refreshGrowth(); }

  // ---------- lanternfish ----------
  buildSwarms() {
    const pts = [], seeds = [];
    const rng = new RNG(77);
    this.swarms = this.def.swarms.map(([x, y, z, r, n], si) => {
      const start = pts.length / 3;
      for (let i = 0; i < n; i++) { pts.push(x, y, z); seeds.push(rng.next() * 100, r, si); }
      return { c: new THREE.Vector3(x, y, z), r, start, n, dark: 0 };
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setAttribute('seed', new THREE.Float32BufferAttribute(seeds, 3));
    this.swarmDark = new Float32Array(this.swarms.length);
    this.fishU = { uTime: G.uTime, uDark: { value: this.swarmDark }, map: { value: this.ctx.fx.soft } };
    this.fish = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: this.fishU,
      vertexShader: `uniform float uTime; uniform float uDark[${this.swarms.length}]; attribute vec3 seed; varying float vA;
        void main(){ float s = seed.x, r = seed.y; int si = int(seed.z + 0.5);
          vec3 p = position + vec3(cos(uTime * 0.3 + s) * r * fract(s * 1.7), sin(uTime * 0.21 + s * 2.0) * r * 0.35, sin(uTime * 0.27 + s) * r * fract(s * 3.1));
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = 70.0 / max(-mv.z, 0.5);
          vA = (0.55 + 0.45 * sin(uTime * 2.0 + s * 9.0)) * (1.0 - uDark[si]); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: 'uniform sampler2D map; varying float vA; void main(){ float a = texture2D(map, gl_PointCoord).a * vA; gl_FragColor = vec4(vec3(0.55, 1.3, 1.0) * a * 1.6, a); }',
    }));
    this.fish.frustumCulled = false;
    this.fish.layers.set(LAYER_FX);
    this.ctx.scene.add(this.fish);
  }
  // ---------- Listeners ----------
  buildListeners() {
    this.listeners = this.def.listeners.map((a, i) => {
      const g = new THREE.Group();
      const pale = new THREE.MeshBasicMaterial({ color: 0xb8c4c2, transparent: true, opacity: 0.85, fog: true });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 3.2, 4, 8), pale);
      body.rotation.z = Math.PI / 2;
      g.add(body);
      const limbs = [];
      for (let k = 0; k < 10; k++) {
        const lg = new THREE.CylinderGeometry(0.03, 0.12, 4.5, 4); lg.translate(0, -2.25, 0);
        const limb = new THREE.Mesh(lg, pale);
        limb.position.set(-1.4 + (k % 5) * 0.7, 0, (k < 5 ? 1 : -1) * 0.35);
        g.add(limb); limbs.push(limb);
      }
      g.visible = false;
      this.ctx.scene.add(g);
      const y = -(a.minDepth + a.maxDepth) / 2;
      return { a, g, limbs, pos: new THREE.Vector3(a.x + Math.cos(i) * a.radius * 0.6, y, a.z + Math.sin(i) * a.radius * 0.6), target: new THREE.Vector3(), state: 'drift', t: i * 10, close: 0, cool: 0 };
    });
  }
  // ---------- growth ----------
  buildGrowth() {
    const g = this.def.glow, wm = this.ctx.worldMap;
    const rng = new RNG(919);
    this.growthPts = [];
    for (let i = 0; i < g.count; i++) {
      let x, z;
      if (i < g.count * 0.45) { const a = rng.range(0, 6.28), r = rng.range(8, 60); x = 96 + Math.cos(a) * r; z = -128 + Math.sin(a) * r; }
      else if (i < g.count * 0.7) { x = rng.range(-520, 520); z = rng.range(-520, 520); }
      else { const a = rng.range(0, 6.28), r = rng.range(560, 1600); x = Math.cos(a) * r; z = Math.sin(a) * r; }
      const y = wm.seabedAt(x, z);
      this.growthPts.push({ x, y, z, s: rng.range(0.4, 1.4), ry: rng.range(0, 6) });
    }
    this.growthPts.sort((a, b) => a.y - b.y);
    this.growth = new THREE.InstancedMesh(propGeometry('growth'), mat('glow'), this.growthPts.length);
    this.growth.frustumCulled = false;
    this.ctx.scene.add(this.growth);
    this.refreshGrowth();
  }
  refreshGrowth() {
    const g = this.def.glow, lvl = this.ctx.state.glow;
    const threshold = Math.min(-0.6, g.base + lvl * g.rise);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let shown = 0;
    this.growthPts.forEach((pt, i) => {
      const on = pt.y < threshold;
      if (on) shown++;
      m.compose(p.set(pt.x, pt.y + 0.1, pt.z), q.setFromAxisAngle(s.set(0, 1, 0), pt.ry), s.setScalar(on ? pt.s : 0));
      this.growth.setMatrixAt(i, m);
    });
    this.growth.instanceMatrix.needsUpdate = true;
    this.growth.count = Math.max(1, shown); // sorted deepest-first, so only visible ones are drawn
    this.threshold = threshold;
    this.ctx.events.emit('glow', { level: lvl, threshold, shown });
  }
  zoneAt(depth) { return this.def.zones.find((z) => depth >= z.from && depth < z.to) || this.def.zones[0]; }

  update(dt) {
    const { player, atmosphere, survival, input, ui, audio, time } = this.ctx;
    if (time.day !== this.day) { this.day = time.day; this.addGlow(this.def.glow.perDay); }
    if (this.ctx.story.flag('finale_done') && !this.finaleGlow) { this.finaleGlow = true; this.addGlow(this.def.glow.finale); }
    const under = atmosphere.underwater;
    const depth = player.depth;
    this.zone = under ? this.zoneAt(depth) : this.def.zones[0];
    if (under && this.zone !== this.lastZone) {
      if (!this.seenZones.has(this.zone.id) && this.zone.id !== 'shallows') { this.seenZones.add(this.zone.id); ui.whisper(this.zone.id === 'shelf' ? 'The Dark Shelf. The light gives up here. So does the warmth.' : this.zone.id === 'abyss' ? 'The Abyss. Your ears scream. Without a pressure suit you cannot stay.' : 'The Drowned Streets. Kerbs, cars, a bus stop sign, all under you.'); this.ctx.events.emit('music:moment', 'discovery'); }
      this.lastZone = this.zone;
    }
    if (!under) this.lastZone = null;
    // zone water colour + pressure
    atmosphere.zoneColor = under ? this.zone.color : null;
    atmosphere.zoneFog = under ? this.zone.fog : 1;
    survival.pressureDrain = under && !this.ctx.inventory.has('pressure_suit') ? this.zone.drain : 1;
    // the player's noise underwater
    let n = 0;
    if (under) {
      if (input.held.sprint) n = 0.8;
      else if (Math.hypot(player.velocity.x, player.velocity.z) > 1.2) n = 0.35;
      if (survival.tanks && input.held.sprint) n = 1;
    }
    if (player.mode === 'boat' && !this.ctx.boat.paddling && !this.ctx.boat.engineOff) { const bn = this.ctx.boat.noise() / 150; if (bn > n) n = bn * 0.8; }
    this.noise += (n - this.noise) * Math.min(1, dt * 3);
    if (n > 0.3) this.noisePos.copy(player.position);
    // listeners
    let nearest = Infinity;
    const calm = this.ctx.settings.difficulty === 'calm';
    for (const L of this.listeners) {
      L.t += dt; L.cool = Math.max(0, L.cool - dt);
      const a = L.a;
      const dP = L.pos.distanceTo(player.position);
      const inArea = Math.hypot(player.position.x - a.x, player.position.z - a.z) < a.radius + 30;
      const hears = !calm && inArea && this.noise > 0.25 && dP < 30 + this.noise * 50 && L.cool <= 0;
      if (hears) { L.state = 'hunt'; L.target.copy(this.noisePos); }
      else if (L.state === 'hunt' && this.noise < 0.15 && L.pos.distanceTo(L.target) < 3) L.state = 'drift';
      if (L.state === 'drift') {
        L.target.set(a.x + Math.cos(L.t * 0.04) * a.radius, -(a.minDepth + (a.maxDepth - a.minDepth) * (0.5 + 0.5 * Math.sin(L.t * 0.03))), a.z + Math.sin(L.t * 0.05) * a.radius);
        // they keep their distance from a still, quiet diver
        if (dP < 16) L.target.copy(L.pos).add(_v.copy(L.pos).sub(player.position).setLength(10));
      }
      const sp = L.state === 'hunt' ? 3.2 : 0.8;
      const dir = _v.copy(L.target).sub(L.pos);
      if (dir.length() > 0.3) { dir.setLength(Math.min(dir.length(), sp * dt)); L.pos.add(dir); }
      L.pos.y = Math.min(L.pos.y, -a.minDepth + 2);
      L.g.position.copy(L.pos);
      L.g.lookAt(L.target.x, L.pos.y, L.target.z);
      L.g.rotateY(Math.PI / 2);
      L.limbs.forEach((l, k) => { l.rotation.x = Math.sin(L.t * 1.3 + k) * 0.5; l.rotation.z = Math.cos(L.t * 0.9 + k * 1.7) * 0.4; });
      L.g.visible = under && dP < 45;
      nearest = Math.min(nearest, dP);
      // contact: dread, then it lets you go
      if (under && dP < 6 && this.noise > 0.2 && L.cool <= 0) {
        L.cool = 25; L.state = 'drift';
        survival.oxygen = Math.max(5, survival.oxygen - 35);
        this.ctx.events.emit('shake', 1.2);
        audio?.play('deepMoan');
        ui.whisper('Something brushes past you in the dark. Many-limbed. Pale. It stops, as if listening. You do not breathe. It goes.');
        player.velocity.y += 3;
        this.ctx.story.setFlag('met_listener');
      }
    }
    if (audio) audio.listenerNear = under ? Math.max(0, 1 - (nearest - 8) / 25) : 0;
    // lanternfish go dark when a Listener passes near the swarm
    this.swarms.forEach((s, i) => {
      let d = Infinity;
      for (const L of this.listeners) d = Math.min(d, L.pos.distanceTo(s.c));
      const want = d < 28 ? 1 : 0;
      this.swarmDark[i] += (want - this.swarmDark[i]) * Math.min(1, dt * (want ? 4 : 0.5));
    });
    this.fish.visible = under;
    // the growth pulses with the Beacon tone / finale
    mat('glow').emissiveIntensity = 0.65 + Math.sin(G.uTime.value * 1.3) * 0.2 + G.uGlow.value * 1.2;
  }
  toJSON() { return { glow: this.ctx.state.glow }; }
  load(o) { if (o?.glow != null) { this.ctx.state.glow = o.glow; this.refreshGrowth(); } }
}

import * as THREE from 'three';
import { Person } from './Person.js';
import { HEROES, generatePerson, personFor } from './Roster.js';
import { EMOTIONS } from './Face.js';
import { G } from '../world/WorldShader.js';

// Character viewer (?viewer=1): every hero and a page of generated raft-folk,
// any lighting preset, any emotion, close/mid/full framing, turntable, talk.
// Renders through the game's own pipeline so what you see is what ships.
// URL: ?viewer=1&who=bram&light=dusk&shot=close&emotion=angry&yaw=0.4&talk=1&row=1
const LIGHTS = {
  day: { sun: [0.55, 0.62, 0.45], sunCol: 0xfff2e0, sunI: 2.6, hemi: [0xb9cde0, 0x5a5048, 0.7], hdri: 'day', exposure: 1.0, wet: 0 },
  overcast: { sun: [0.2, 0.9, 0.3], sunCol: 0xdfe6ee, sunI: 0.8, hemi: [0xc8d2dc, 0x6a645c, 1.1], hdri: 'overcast', exposure: 1.05, wet: 0 },
  dusk: { sun: [-0.8, 0.12, 0.35], sunCol: 0xff9a55, sunI: 1.8, hemi: [0x6c6680, 0x3a2c26, 0.45], hdri: 'dusk', exposure: 1.1, wet: 0 },
  night: { sun: [0.3, 0.5, -0.6], sunCol: 0x8fa6d6, sunI: 0.45, hemi: [0x223044, 0x0c0d10, 0.35], hdri: 'night', exposure: 1.25, wet: 0, lantern: true },
  rain: { sun: [0.2, 0.8, 0.4], sunCol: 0xc8d0d8, sunI: 0.6, hemi: [0x9aa6b0, 0x4a4844, 1.0], hdri: 'overcast', exposure: 1.0, wet: 1 },
  backlit: { sun: [0.1, 0.35, -0.95], sunCol: 0xffd8a8, sunI: 3.0, hemi: [0x8a96a8, 0x403830, 0.35], hdri: 'dawn', exposure: 1.15, wet: 0 },
};
const SHOTS = { close: [0.55, 0.0], mid: [1.4, -0.3], full: [4.6, -0.75] };

export class Viewer {
  constructor(ctx) {
    this.ctx = ctx;
    const q = ctx.params;
    this.scene = new THREE.Scene();
    this.farScene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.03, 200);
    this.farCamera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 20, 60000);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = sc.bottom = -1.5; sc.right = sc.top = 1.5; sc.near = 0.5; sc.far = 20; this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.01;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    this.lantern = new THREE.PointLight(0xffa04a, 0, 8, 2); this.lantern.position.set(0.9, 1.5, 1.1);
    this.scene.add(this.sun, this.sun.target, this.hemi, this.lantern);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.MeshStandardMaterial({ color: 0x3a3530, roughness: 0.85 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);
    this.floor = floor;
    this.pmrem = new THREE.PMREMGenerator(ctx.renderer);
    this.list = [...Object.keys(HEROES), ...Array.from({ length: 24 }, (_, i) => 'npc' + (i + 1))];
    this.who = q.get('who') || 'wren';
    this.light = q.get('light') || 'day';
    this.shot = q.get('shot') || 'close';
    this.emotion = q.get('emotion') || null;
    this.yaw = +(q.get('yaw') || 0.35);
    this.spin = q.has('spin');
    this.row = q.has('row');
    this.people = [];
    this.world = { scene: this.scene, camera: this.camera, farScene: this.farScene, farCamera: this.farCamera, atmosphere: { underwater: false, sun: this.sun, indoor: 0 }, ssrWet: 0, volDensity: 0, motionBlur: 0 };
    this.buildUI();
    this.setLight(this.light);
    this.show(this.who);
    if (q.has('talk')) setTimeout(() => this.talk(), 300);
  }
  buildUI() {
    const el = document.createElement('div');
    el.className = 'viewer-ui';
    el.innerHTML = `<b>Character viewer</b>
      <select data-who>${this.list.map((k) => `<option value="${k}">${HEROES[k]?.name || k}</option>`).join('')}</select>
      <div>${Object.keys(LIGHTS).map((k) => `<button data-light="${k}">${k}</button>`).join('')}</div>
      <div>${Object.keys(SHOTS).map((k) => `<button data-shot="${k}">${k}</button>`).join('')}<button data-spin>turntable</button><button data-row>crowd row</button></div>
      <div>${Object.keys(EMOTIONS).map((k) => `<button data-emo="${k}">${k}</button>`).join('')}<button data-talk>talk</button></div>
      <small data-info></small>`;
    document.body.appendChild(el);
    el.querySelector('[data-who]').value = this.who;
    el.querySelector('[data-who]').onchange = (e) => this.show(e.target.value);
    el.querySelectorAll('[data-light]').forEach((b) => (b.onclick = () => this.setLight(b.dataset.light)));
    el.querySelectorAll('[data-shot]').forEach((b) => (b.onclick = () => { this.shot = b.dataset.shot; }));
    el.querySelectorAll('[data-emo]').forEach((b) => (b.onclick = () => this.people.forEach((p) => p.human.face.setEmotion(b.dataset.emo))));
    el.querySelector('[data-spin]').onclick = () => { this.spin = !this.spin; };
    el.querySelector('[data-row]').onclick = () => { this.row = !this.row; this.show(this.who); };
    el.querySelector('[data-talk]').onclick = () => this.talk();
    this.info = el.querySelector('[data-info]');
    const st = document.createElement('style');
    st.textContent = '.viewer-ui{position:fixed;left:10px;top:10px;z-index:30;background:rgba(10,12,14,.75);color:#ddd;padding:8px 10px;font:12px sans-serif;display:flex;flex-direction:column;gap:5px;max-width:420px;pointer-events:auto}.viewer-ui button{margin:1px;background:#2a2e33;color:#ddd;border:1px solid #444;padding:2px 6px;cursor:pointer}.viewer-ui select{background:#222;color:#ddd}';
    document.head.appendChild(st);
    if (this.ctx.params.has('clean')) el.style.display = 'none';
  }
  params(key) { return key.startsWith('npc') ? generatePerson(1000 + +key.slice(3), { palette: ['portage', 'greentide', 'rusthold', 'default'][+key.slice(3) % 4] }) : personFor(key); }
  show(key) {
    this.who = key;
    for (const p of this.people) { p.root.removeFromParent(); p.dispose(); }
    this.people = [];
    const keys = this.row ? this.list.slice(Math.max(0, this.list.indexOf(key)), Math.max(0, this.list.indexOf(key)) + 7) : [key];
    keys.forEach((k, i) => {
      const t0 = performance.now();
      const p = new Person(this.ctx, this.ctx.humans, this.params(k));
      p.buildMs = performance.now() - t0;
      p.root.position.set((i - (keys.length - 1) / 2) * 0.75, 0, i % 2 ? -0.5 : 0);
      if (this.emotion) p.human.face.setEmotion(this.emotion);
      this.scene.add(p.root);
      this.people.push(p);
    });
    const h = this.people[0].human;
    let tris = 0; for (const m of h.meshes) tris += (m.geometry.index ? m.geometry.index.count : 0) / 3;
    this.info.textContent = `${this.params(key).name || key} · age ${this.params(key).age} · built in ${this.people[0].buildMs.toFixed(0)} ms · ${Math.round(tris / 1000)}k tris`;
  }
  setLight(name) {
    const L = LIGHTS[name] || LIGHTS.day;
    this.light = name;
    const d = new THREE.Vector3(...L.sun).normalize();
    this.sun.position.copy(d).multiplyScalar(6).add(new THREE.Vector3(0, 1, 0));
    this.sun.target.position.set(0, 1.2, 0);
    this.sun.color.set(L.sunCol); this.sun.intensity = L.sunI;
    this.hemi.color.set(L.hemi[0]); this.hemi.groundColor.set(L.hemi[1]); this.hemi.intensity = L.hemi[2];
    this.lantern.intensity = L.lantern ? 2.2 : 0;
    G.uSunDir.value.copy(d); G.uSunColor.value.copy(this.sun.color).multiplyScalar(this.sun.intensity * 0.5);
    this.ctx.renderer.toneMappingExposure = L.exposure;
    const h = this.ctx.assets.hdris[L.hdri];
    if (h) {
      this.envRT?.dispose();
      this.envRT = this.pmrem.fromEquirectangular(h.texture);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = L.lantern ? 0.25 : 0.6;
      this.scene.environmentRotation = new THREE.Euler(0, Math.atan2(d.z, d.x) - (h.sunU - 0.5) * Math.PI * 2, 0);
      // backdrop lives in the far scene: the main scene is rendered in several passes
      this.farScene.background = new THREE.Color().copy(this.hemi.color).multiplyScalar(L.lantern ? 0.08 : 0.35);
    }
    this.wet = L.wet;
    const u = this.ctx.pipeline.uniforms;
    u.uSunDir.value.copy(d); u.uSunCol.value.copy(this.sun.color).multiplyScalar(this.sun.intensity);
    u.uMist.value = 0; u.uShaft.value = 0; u.uWetLens.value = 0; u.uGrain.value = 0.012; u.uVignette.value = 0.6;
  }
  talk() {
    const lines = ['Tide comes in, tide goes out. You still owe me for the rope.', 'Not tonight. The water is too quiet.', 'You look like your brother when you frown.'];
    this.people.forEach((p, i) => p.say(lines[i % lines.length], 3.5));
  }
  update(dt) {
    const p0 = this.people[0];
    if (!p0) return;
    if (this.spin) this.yaw += dt * 0.35;
    if (!SHOTS[this.shot]) { for (const p of this.people) p.update(dt, this.camera.position); this.ctx.renderer.info.reset(); this.ctx.pipeline.render(this.world); return; }
    const [dist, drop] = SHOTS[this.shot];
    const h = p0.human;
    const head = h.bone.head.getWorldPosition(new THREE.Vector3());
    const tgt = this.shot === 'full' ? new THREE.Vector3(0, h.height * 0.5, 0) : this.shot === 'mid' ? new THREE.Vector3(head.x, head.y - 0.2, head.z) : head.clone().add(new THREE.Vector3(0, 0.02, 0));
    if (this.row) { tgt.set(0, h.height * 0.55, 0); }
    const r = this.row ? 4.2 : dist;
    this.camera.position.set(tgt.x + Math.sin(this.yaw) * r, tgt.y - drop * 0.1 + (this.shot === 'close' ? 0.02 : 0.05), tgt.z + Math.cos(this.yaw) * r);
    this.camera.lookAt(tgt);
    this.camera.updateMatrixWorld();
    const eye = this.camera.position;
    for (const p of this.people) {
      p.human.setWet(this.wet, 0);
      if (this.ctx.params.get('pose') === 'rest') { p.mixer.stopAllAction(); p.human.face.update(dt, {}); continue; }
      if (this.ctx.params.get('clip')) p.play(this.ctx.params.get('clip'), 0);
      p.update(dt, eye);
    }
    this.ctx.lightLevel = this.light === 'night' ? 0.15 : this.light === 'dusk' ? 0.45 : 0.85;
    // depth of field focused on the face for close-ups
    const u = this.ctx.pipeline.uniforms;
    u.uDof.value = this.shot === 'close' && this.ctx.settings.q.postPipeline ? 1 : 0;
    u.uDofAmt.value = 0.18; // portrait lens: a soft background, not a smear
    u.uFocus.value = head.distanceTo(eye);
    G.uTime.value += dt;
    u.uTime.value = G.uTime.value;
    this.farCamera.position.copy(this.camera.position); this.farCamera.quaternion.copy(this.camera.quaternion);
    this.farCamera.aspect = this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.farCamera.updateProjectionMatrix(); this.farCamera.updateMatrixWorld();
    this.ctx.renderer.shadowMap.needsUpdate = true;
    this.ctx.renderer.info.reset();
    this.ctx.pipeline.render(this.world);
  }
}

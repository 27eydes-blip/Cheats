import * as THREE from 'three';
import { LAYER_FX } from './Pipeline.js';
import { G } from '../world/WorldShader.js';

// Particle FX: rain streaks, cooking smoke, breath fog, underwater motes,
// splashes, lantern halos, and the player's flashlight.
function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Effects {
  constructor(ctx) {
    this.ctx = ctx;
    const q = ctx.settings.q;
    this.soft = radialTexture();
    this.glowMaterial = new THREE.SpriteMaterial({ map: radialTexture('rgba(255,190,110,0.9)', 'rgba(255,140,60,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    this.smokes = new Set();
    // smoke particle pool (shared)
    this.smokeN = 260;
    const sg = new THREE.BufferGeometry();
    this.smokePos = new Float32Array(this.smokeN * 3);
    this.smokeAge = new Float32Array(this.smokeN);
    this.smokeVel = new Float32Array(this.smokeN * 3);
    sg.setAttribute('position', new THREE.BufferAttribute(this.smokePos, 3));
    sg.setAttribute('age', new THREE.BufferAttribute(this.smokeAge, 1));
    this.smokeAge.fill(99);
    this.smoke = new THREE.Points(sg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { map: { value: this.soft }, uCol: { value: new THREE.Color(0.6, 0.6, 0.6) }, uScale: { value: 300 } },
      vertexShader: 'attribute float age; varying float vA; uniform float uScale; void main(){ vA = age; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = uScale * (0.4 + age*0.35) / -mv.z; gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform sampler2D map; uniform vec3 uCol; varying float vA; void main(){ if (vA > 6.0) discard; float a = texture2D(map, gl_PointCoord).a * smoothstep(0.0,0.6,vA) * (1.0 - vA/6.0) * 0.35; gl_FragColor = vec4(uCol, a); }',
    }));
    this.smoke.frustumCulled = false;
    this.smoke.layers.set(LAYER_FX);
    ctx.scene.add(this.smoke);
    this.smokeIdx = 0;
    // rain
    const rn = q.rainCount;
    const rg = new THREE.BufferGeometry();
    const rp = new Float32Array(rn * 2 * 3), rs = new Float32Array(rn * 2);
    for (let i = 0; i < rn; i++) {
      const x = Math.random() * 60 - 30, y = Math.random() * 30, z = Math.random() * 60 - 30;
      rp.set([x, y, z, x, y, z], i * 6); rs[i * 2] = 0; rs[i * 2 + 1] = 1;
    }
    rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    rg.setAttribute('tail', new THREE.BufferAttribute(rs, 1));
    this.rainU = { uTime: G.uTime, uCam: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2() }, uI: { value: 0 }, uCol: { value: new THREE.Color() } };
    this.rain = new THREE.LineSegments(rg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: this.rainU,
      vertexShader: `uniform float uTime; uniform vec3 uCam; uniform vec2 uWind; attribute float tail; varying float vT;
        void main(){ vec3 p = position; float sp = 11.0; p.y = mod(p.y - uTime * sp, 30.0) - 12.0; p.x += uWind.x * (p.y) * 0.25; p.z += uWind.y * (p.y) * 0.25;
          p.xz = mod(p.xz - uCam.xz + 30.0, 60.0) - 30.0; vec3 w = vec3(uCam.x, 0.0, uCam.z) + p + vec3(0.0, uCam.y, 0.0);
          w.y += tail * 0.55; w.xz += tail * uWind * 0.08; vT = tail; gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); }`,
      fragmentShader: 'uniform float uI; uniform vec3 uCol; varying float vT; void main(){ gl_FragColor = vec4(uCol, (0.25 + vT*0.3) * uI); }',
    }));
    this.rain.frustumCulled = false;
    this.rain.layers.set(LAYER_FX);
    ctx.scene.add(this.rain);
    // underwater motes + breath fog (one points system each)
    const mn = q.particleCount;
    const mg = new THREE.BufferGeometry();
    const mp = new Float32Array(mn * 3);
    for (let i = 0; i < mn; i++) mp.set([Math.random() * 30 - 15, Math.random() * 30 - 15, Math.random() * 30 - 15], i * 3);
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    this.moteU = { uTime: G.uTime, uCam: { value: new THREE.Vector3() }, uCol: { value: new THREE.Color() }, map: { value: this.soft } };
    this.motes = new THREE.Points(mg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: this.moteU,
      vertexShader: `uniform float uTime; uniform vec3 uCam; varying float vD;
        void main(){ vec3 p = position; p += vec3(sin(uTime*0.2 + p.y)*0.6, sin(uTime*0.13 + p.x)*0.4, cos(uTime*0.17 + p.z)*0.6);
          p = mod(p - uCam + 15.0, 30.0) - 15.0; vec4 mv = viewMatrix * vec4(uCam + p, 1.0); vD = -mv.z; gl_PointSize = 60.0 / max(vD, 0.5); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: 'uniform sampler2D map; uniform vec3 uCol; varying float vD; void main(){ float a = texture2D(map, gl_PointCoord).a * 0.5 * smoothstep(14.0, 3.0, vD); gl_FragColor = vec4(uCol, a); }',
    }));
    this.motes.frustumCulled = false;
    this.motes.layers.set(LAYER_FX);
    this.motes.visible = false;
    ctx.scene.add(this.motes);
    // breath
    this.breath = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.soft, transparent: true, opacity: 0, depthWrite: false, color: 0xdde4ea }));
    this.breath.layers.set(LAYER_FX);
    ctx.scene.add(this.breath);
    this.breathT = 0;
    // flashlight
    this.flash = new THREE.SpotLight(0xfff1dc, 0, 38, 0.42, 0.55, 1.3);
    this.flash.layers.enableAll();
    this.flashTarget = new THREE.Object3D();
    this.flash.target = this.flashTarget;
    ctx.scene.add(this.flash, this.flashTarget);
    // splash bursts
    ctx.events.on('splash', (e) => { ctx.water.ripple(e.pos.x, e.pos.z, e.big ? 1.4 : 0.8, 1.8); ctx.water.ripple(e.pos.x, e.pos.z, e.big ? 0.8 : 0.4, 1.0); });
  }
  addSmoke(src) { const s = { ...src, acc: Math.random() }; this.smokes.add(s); return s; }
  removeSmoke(s) { this.smokes.delete(s); }
  emitSmoke(p, vx, vy, vz) {
    const i = this.smokeIdx = (this.smokeIdx + 1) % this.smokeN;
    this.smokePos.set([p.x, p.y, p.z], i * 3);
    this.smokeVel.set([vx, vy, vz], i * 3);
    this.smokeAge[i] = 0;
  }
  burst(pos, n) { for (let i = 0; i < n; i++) this.emitSmoke(pos, (Math.random() - 0.5) * 1.5, Math.random() * 1.5 + 0.5, (Math.random() - 0.5) * 1.5); }
  update(dt) {
    const { camera, weather, player, atmosphere, survival, time } = this.ctx;
    const v = new THREE.Vector3();
    for (const s of this.smokes) {
      s.acc += dt * (s.kind === 'exhaust' ? 3 : 1.6);
      if (s.acc > 1) { s.acc = 0; s.getPos(v); if (v.distanceTo(camera.position) < 160) this.emitSmoke(v, 0, 0.6, 0); }
    }
    const w = weather.windVec.multiplyScalar(weather.cur.wind * 1.5);
    for (let i = 0; i < this.smokeN; i++) {
      if (this.smokeAge[i] > 6) continue;
      this.smokeAge[i] += dt;
      this.smokePos[i * 3] += (this.smokeVel[i * 3] + w.x) * dt;
      this.smokePos[i * 3 + 1] += this.smokeVel[i * 3 + 1] * dt;
      this.smokePos[i * 3 + 2] += (this.smokeVel[i * 3 + 2] + w.y) * dt;
    }
    this.smoke.geometry.attributes.position.needsUpdate = true;
    this.smoke.geometry.attributes.age.needsUpdate = true;
    const light = Math.max(0.12, 1 - time.out.night * 0.85);
    this.smoke.material.uniforms.uCol.value.setRGB(0.62 * light, 0.62 * light, 0.64 * light);
    // rain
    this.rainU.uI.value = atmosphere.underwater ? 0 : weather.cur.rain;
    this.rain.visible = weather.cur.rain > 0.02 && !atmosphere.underwater;
    this.rainU.uCam.value.copy(camera.position);
    this.rainU.uWind.value.copy(weather.windVec).multiplyScalar(weather.cur.wind * 3);
    this.rainU.uCol.value.setRGB(0.6, 0.65, 0.7).multiplyScalar(light);
    // motes
    this.motes.visible = atmosphere.underwater;
    this.moteU.uCam.value.copy(camera.position);
    this.moteU.uCol.value.copy(atmosphere.fog.color).multiplyScalar(5).addScalar(0.03);
    // breath fog when cold (or at night/rain)
    const cold = survival ? survival.coldness() : 0;
    this.breathT += dt;
    const cycle = (this.breathT % 3.2) / 3.2;
    const show = cold > 0.35 && !player.headUnder;
    if (show && cycle < 0.4) {
      const k = cycle / 0.4;
      this.breath.position.copy(player.eye).addScaledVector(player.forward, 0.35 + k * 0.5);
      this.breath.position.y -= 0.12 - k * 0.1;
      this.breath.scale.setScalar(0.15 + k * 0.5);
      this.breath.material.opacity = Math.sin(k * Math.PI) * 0.22 * Math.min(1, cold) * light;
    } else this.breath.material.opacity = 0;
    // flashlight
    const on = player.flashlight;
    this.flash.intensity = on ? (survival && survival.battery <= 0 ? 0 : 60) : 0;
    this.flash.position.copy(camera.position).addScaledVector(new THREE.Vector3(0.25, -0.2, 0).applyQuaternion(camera.quaternion), 1);
    this.flashTarget.position.copy(camera.position).addScaledVector(player.forward, 10);
    this.flashTarget.updateMatrixWorld();
  }
}

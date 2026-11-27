import * as THREE from 'three';
import { LAYER_FX } from '../render/Pipeline.js';

// Ambient life in and on the water: schools of small fish that wheel around
// the player underwater (and show as dark flickers from the surface), the odd
// fish that leaps and splashes, and midges dancing over the water and around
// lamps at dusk. All instanced; counts come from the quality preset.

function fishGeometry() {
  // a slim body with a forked tail; x = forward
  const g = new THREE.BufferGeometry();
  const v = [
    0.16, 0, 0, 0.02, 0.035, 0, 0.02, -0.03, 0, -0.1, 0.012, 0, -0.1, -0.01, 0, // side profile
    0.02, 0, 0.018, 0.02, 0, -0.018, // belly width
    -0.17, 0.045, 0, -0.17, -0.04, 0, // tail fork
  ];
  const idx = [0, 1, 5, 0, 5, 2, 0, 6, 1, 0, 2, 6, 1, 3, 5, 5, 3, 4, 5, 4, 2, 1, 6, 3, 6, 4, 3, 6, 2, 4, 3, 7, 4, 4, 7, 8, 3, 8, 7, 4, 8, 7];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Fish {
  constructor(ctx) {
    this.ctx = ctx;
    const q = ctx.settings.q;
    this.n = q.particleCount >= 1000 ? 220 : q.particleCount >= 500 ? 140 : 60;
    const mat = new THREE.MeshStandardMaterial({ color: 0x7d8a86, roughness: 0.35, metalness: 0.55 });
    mat.onBeforeCompile = (s) => {
      s.uniforms.uT = this.uT = { value: 0 };
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          // swim: a wave travels down the body, the tail swings most
          float ph = uT * 14.0 + float(gl_InstanceID) * 1.7;
          float along = clamp(-position.x / 0.17, 0.0, 1.0);
          transformed.z += sin(ph - position.x * 18.0) * 0.035 * along * along;`)
        ;
      s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.35, 1.25, smoothstep(0.4, -0.6, vNormal.y)); // countershading');
    };
    this.mesh = new THREE.InstancedMesh(fishGeometry(), mat, this.n);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'fish';
    ctx.scene.add(this.mesh);
    // schools: a centre that wanders; members orbit with personal offsets
    this.schools = Array.from({ length: 4 }, (_, i) => ({ c: new THREE.Vector3(), v: new THREE.Vector3(), seed: i * 13.7, depth: 2 + i * 1.5 }));
    this.fish = Array.from({ length: this.n }, (_, i) => ({
      s: i % 4, off: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 6),
      p: new THREE.Vector3(), v: new THREE.Vector3(1, 0, 0), k: 0.6 + Math.random() * 0.8, scale: 0.7 + Math.random() * 0.8,
    }));
    this.placed = false;
    // a fish leaping clear of the surface now and then
    this.jumper = new THREE.Mesh(fishGeometry().scale(2.4, 2.4, 2.4), mat);
    this.jumper.visible = false;
    ctx.scene.add(this.jumper);
    this.jumpT = 6;
    // midges: a points cloud that follows the camera, denser at dusk, drawn to lamps
    const M = q.particleCount >= 500 ? 600 : 220;
    const pos = new Float32Array(M * 3), seed = new Float32Array(M);
    for (let i = 0; i < M; i++) { pos.set([(Math.random() - 0.5) * 40, Math.random() * 3, (Math.random() - 0.5) * 40], i * 3); seed[i] = Math.random() * 100; }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    mg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.midgeU = { uT: { value: 0 }, uOrigin: { value: new THREE.Vector3() }, uI: { value: 0 }, uCol: { value: new THREE.Color() } };
    this.midges = new THREE.Points(mg, new THREE.ShaderMaterial({
      uniforms: this.midgeU, transparent: true, depthWrite: false,
      vertexShader: `uniform float uT; uniform vec3 uOrigin; attribute float aSeed; varying float vA;
        void main() {
          vec3 p = position;
          // swarms: each midge circles a slowly drifting knot
          float k = floor(aSeed / 12.5);
          vec3 knot = vec3(sin(k * 3.1 + uT * 0.05) * 14.0, 0.8 + mod(k, 3.0) * 0.6, cos(k * 1.7 + uT * 0.04) * 14.0);
          p = knot + vec3(sin(uT * (2.0 + mod(aSeed, 3.0)) + aSeed) * 0.6, sin(uT * 5.1 + aSeed * 1.3) * 0.35, cos(uT * (2.3 + mod(aSeed, 2.0)) + aSeed) * 0.6);
          p.xz += floor(uOrigin.xz / 40.0) * 40.0; p.xz = mod(p.xz - uOrigin.xz + 20.0, 40.0) - 20.0 + uOrigin.xz;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(18.0 / -mv.z, 1.0, 3.0);
          vA = smoothstep(30.0, 4.0, -mv.z);
        }`,
      fragmentShader: `uniform float uI; uniform vec3 uCol; varying float vA; void main() { gl_FragColor = vec4(uCol, vA * uI * 0.7); }`,
    }));
    this.midges.frustumCulled = false;
    this.midges.layers.set(LAYER_FX);
    ctx.scene.add(this.midges);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._d = new THREE.Vector3();
  }

  update(dt) {
    const { camera, waves, time, atmosphere, worldMap } = this.ctx;
    const t = (this.t = (this.t || 0) + dt);
    if (this.uT) this.uT.value = t;
    const cam = camera.position;
    // schools roam within ~25 m of the camera, below the surface, above the bottom
    for (const sc of this.schools) {
      const a = t * 0.07 + sc.seed;
      const want = this._d.set(cam.x + Math.sin(a) * 18, -sc.depth - Math.sin(a * 0.7) * 1.2, cam.z + Math.cos(a * 1.3) * 18);
      const bed = worldMap?.seabedAt ? worldMap.seabedAt(want.x, want.z) : -20;
      want.y = Math.max(want.y, bed + 1.2);
      if (!this.placed || sc.c.distanceTo(cam) > 60) sc.c.copy(want);
      sc.v.lerp(this._d.subVectors(want, sc.c).clampLength(0, 2.2), 1 - Math.exp(-dt * 0.8));
      sc.c.addScaledVector(sc.v, dt);
    }
    this.placed = true;
    const night = time.out.night;
    for (let i = 0; i < this.n; i++) {
      const f = this.fish[i], sc = this.schools[f.s];
      const swirl = t * 0.5 * f.k + i;
      const target = this._s.copy(sc.c).add(f.off).add(this._d.set(Math.sin(swirl) * 1.2, Math.sin(swirl * 1.3) * 0.25, Math.cos(swirl) * 1.2));
      if (target.y > -0.35) target.y = -0.35;
      const desired = target.sub(f.p).multiplyScalar(1.6);
      f.v.lerp(desired.clampLength(0.2, 3.5), 1 - Math.exp(-dt * 2.5));
      if (f.p.lengthSq() === 0 || f.p.distanceTo(cam) > 80) f.p.copy(sc.c).add(f.off);
      f.p.addScaledVector(f.v, dt);
      // face the direction of travel (geometry forward = +x)
      const dir = this._d.copy(f.v).normalize();
      this._q.setFromUnitVectors(_X, dir);
      this._m.compose(f.p, this._q, _S.setScalar(f.scale));
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = !(night > 0.9 && !atmosphere.underwater);
    // leaping fish
    this.jumpT -= dt;
    if (this.jumpT < 0 && !atmosphere.underwater && this.ctx.mode === 'play') {
      const a = Math.random() * 6.28, r = 12 + Math.random() * 25;
      this.jump = { x: cam.x + Math.cos(a) * r, z: cam.z + Math.sin(a) * r, h: Math.random() * 6.28, t: 0 };
      this.ctx.events.emit('splash', { pos: new THREE.Vector3(this.jump.x, 0, this.jump.z), big: false });
      this.jumpT = 9 + Math.random() * 20;
    }
    if (this.jump) {
      const j = this.jump; j.t += dt;
      const T = 0.9, u = j.t / T;
      if (u >= 1) { this.ctx.events.emit('splash', { pos: new THREE.Vector3(j.x + Math.cos(j.h) * 1.6, 0, j.z + Math.sin(j.h) * 1.6), big: false }); this.jump = null; this.jumper.visible = false; }
      else {
        const x = j.x + Math.cos(j.h) * 1.6 * u, z = j.z + Math.sin(j.h) * 1.6 * u;
        const y = waves.height(x, z) + Math.sin(u * Math.PI) * 0.9;
        this.jumper.position.set(x, y, z);
        this.jumper.rotation.set(0, -j.h, Math.cos(u * Math.PI) * 0.9);
        this.jumper.visible = true;
      }
    }
    // midges: dusk and warm evenings, not in rain or underwater
    const h = time.hour;
    const dusk = Math.max(Math.exp(-((h - 19.4) ** 2) / 1.2), Math.exp(-((h - 6.6) ** 2) / 0.8) * 0.6, night * 0.35);
    const w = this.ctx.weather.cur;
    this.midgeU.uT.value = t;
    this.midgeU.uOrigin.value.copy(cam);
    this.midgeU.uI.value = atmosphere.underwater ? 0 : dusk * (1 - w.rain) * (1 - w.wind * 0.7);
    this.midgeU.uCol.value.copy(atmosphere.sun.color).multiplyScalar(0.25).add(_C.setRGB(0.05, 0.05, 0.045));
    this.midges.visible = this.midgeU.uI.value > 0.02;
  }
}
const _X = new THREE.Vector3(1, 0, 0), _S = new THREE.Vector3(), _C = new THREE.Color();

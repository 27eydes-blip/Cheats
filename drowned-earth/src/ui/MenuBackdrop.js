// The title-menu backdrop: a deliberately tiny scene (a gradient sky, a sea with
// two cheap sine swells, a skyline of drowned towers as dark instanced boxes and
// a far lighthouse blink). No lights, no shadows, no post-processing, no world
// simulation. Rendered at ~50% resolution, capped at 30 fps, with a slow camera
// drift. It costs a few draw calls, so the menu stays responsive on any GPU.
import * as THREE from 'three';

const SKY_VS = `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FS = `varying vec3 vD; uniform float uT;
void main(){
  float h = clamp(vD.y * 1.6 + 0.08, 0.0, 1.0);
  vec3 low = vec3(0.78, 0.64, 0.55), mid = vec3(0.42, 0.45, 0.5), top = vec3(0.12, 0.16, 0.22);
  vec3 c = mix(low, mid, smoothstep(0.0, 0.35, h)); c = mix(c, top, smoothstep(0.35, 1.0, h));
  // a soft dawn glow low on the horizon
  float sun = pow(max(dot(normalize(vD), normalize(vec3(0.6, 0.05, -1.0))), 0.0), 24.0);
  c += vec3(1.0, 0.7, 0.45) * sun * 0.5;
  gl_FragColor = vec4(c, 1.0);
}`;
const SEA_VS = `uniform float uT; varying vec3 vW; varying float vH;
void main(){
  vec3 p = position;
  float h = sin(p.x * 0.05 + uT * 0.6) * 0.5 + sin(p.y * 0.08 - uT * 0.45) * 0.35;
  p.z += h; vH = h;
  vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const SEA_FS = `varying vec3 vW; varying float vH; uniform vec3 uFog; uniform float uFogFar;
void main(){
  float d = length(vW.xz - cameraPosition.xz);
  vec3 deep = vec3(0.09, 0.13, 0.15), sheen = vec3(0.62, 0.56, 0.52);
  float glint = smoothstep(0.55, 0.85, vH) * 0.25;
  vec3 c = mix(deep, sheen, 0.18 + glint + smoothstep(80.0, 600.0, d) * 0.5);
  c = mix(c, uFog, smoothstep(60.0, uFogFar, d));
  gl_FragColor = vec4(c, 1.0);
}`;

export class MenuBackdrop {
  constructor(renderer) {
    this.r = renderer;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 1, 4000);
    this.t = 0;
    this.scale = 0.5;      // fraction of full resolution
    this.static = false;   // safe mode: draw once and stop
    const fog = new THREE.Color(0.6, 0.55, 0.53);
    this.scene.fog = new THREE.Fog(fog, 300, 3200);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 24, 12), new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, uniforms: { uT: { value: 0 } }, side: THREE.BackSide, depthWrite: false }));
    this.scene.add(this.sky);
    this.seaU = { uT: { value: 0 }, uFog: { value: fog }, uFogFar: { value: 1400 } };
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000, 48, 48), new THREE.ShaderMaterial({ vertexShader: SEA_VS, fragmentShader: SEA_FS, uniforms: this.seaU }));
    sea.rotation.x = -Math.PI / 2;
    this.scene.add(sea);
    // drowned towers: one instanced draw, fogged into the haze
    const n = 70, box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const towers = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 1.6 - Math.PI * 1.3 + rnd() * 0.2, d = 220 + rnd() * 900;
      p.set(Math.cos(a) * d, -2, Math.sin(a) * d);
      s.set(18 + rnd() * 40, 20 + rnd() * (d < 500 ? 90 : 160), 18 + rnd() * 40);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI);
      towers.setMatrixAt(i, m.compose(p, q, s));
      // silhouettes: near towers dark, far ones fading into the haze (baked per tower, no fog cost)
      const haze = Math.min(1, (d - 220) / 1100) * 0.55;
      towers.setColorAt(i, new THREE.Color(0.07, 0.085, 0.095).lerp(new THREE.Color(0.42, 0.42, 0.44), haze));
    }
    this.scene.add(towers);
    // the far lighthouse and its blink
    const lh = new THREE.Mesh(new THREE.CylinderGeometry(4, 7, 60, 8), new THREE.MeshBasicMaterial({ color: 0x2a2e33, fog: false }));
    lh.position.set(380, 28, -900); this.scene.add(lh);
    this.lamp = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe2a0, fog: false }));
    this.lamp.position.set(380, 62, -900); this.scene.add(this.lamp);
    this.drawn = false;
  }
  // full-resolution pixel ratio the game uses, restored when the menu closes
  enter(basePixelRatio) {
    this.base = basePixelRatio;
    this.r.setPixelRatio(Math.max(0.35, basePixelRatio * this.scale));
    this.r.setSize(innerWidth, innerHeight, false);
    this.r.setRenderTarget(null);
    this.drawn = false;
  }
  setScale(s) { this.scale = s; this.enter(this.base); }
  resize() { this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix(); this.enter(this.base); }
  render(dt) {
    if (this.static && this.drawn) return false;
    this.t += dt;
    const a = this.t * 0.012;   // a slow drift around the bay
    this.cam.position.set(Math.sin(a) * 40, 9 + Math.sin(this.t * 0.25) * 0.6, Math.cos(a) * 40);
    this.cam.lookAt(Math.sin(a + 0.6) * 400, 22, -600);
    this.seaU.uT.value = this.t;
    this.lamp.visible = (this.t % 5) < 0.4;
    this.r.render(this.scene, this.cam);
    this.drawn = true;
    return true;
  }
  dispose() { this.scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); }
}

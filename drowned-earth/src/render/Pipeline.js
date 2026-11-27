import * as THREE from 'three';

// Rendering pipeline.
//  low:        far layer → clear depth → everything, straight to the screen.
//  medium/high: far layer + opaque world into an HDR target (color + depth),
//              composite to screen (tonemap, grade, underwater shafts) while
//              restoring depth via gl_FragDepth, then water + transparent FX on
//              top. The water samples the opaque color/depth for refraction,
//              depth tint and shoreline foam.
export const LAYER_WORLD = 0, LAYER_WATER = 1, LAYER_FX = 2;

const compositeVS = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const compositeFS = /* glsl */`
#include <common>
#include <packing>
uniform sampler2D tColor; uniform sampler2D tDepth;
uniform float uNear; uniform float uFar; uniform float uTime;
uniform float uUnder; uniform vec2 uSunScreen; uniform float uSunVis; uniform vec3 uUnderColor;
uniform float uVignette; uniform float uGrain; uniform float uSat; uniform float uFlash; uniform float uFade;
uniform float uCamDepth;
varying vec2 vUv;
float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float d = texture2D(tDepth, vUv).x;
  vec3 col = texture2D(tColor, vUv).rgb;
  float viewZ = -perspectiveDepthToViewZ(d, uNear, uFar);
  if (uUnder > 0.5) {
    // light shafts: streaks radiating from the sun's position, scrolling noise
    vec2 dir = vUv - uSunScreen;
    float ang = atan(dir.y, dir.x);
    float rays = sin(ang * 23.0 + uTime * 0.3) * sin(ang * 41.0 - uTime * 0.21) * 0.5 + 0.5;
    rays = pow(rays, 3.0) * smoothstep(1.2, 0.0, length(dir)) * uSunVis;
    float distFade = 1.0 - exp(-viewZ * 0.09);
    col += uUnderColor * rays * 2.4 * distFade * exp(-uCamDepth * 0.06);
    // drifting murk
    float murk = rnd(floor(vUv * 180.0 + uTime * 0.6)) * 0.02;
    col += uUnderColor * murk;
  }
  // grade
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSat);
  col += uFlash * vec3(0.75, 0.8, 1.0);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // vignette + grain after tonemapping
  vec2 q = vUv - 0.5;
  gl_FragColor.rgb *= 1.0 - dot(q, q) * uVignette;
  gl_FragColor.rgb += (rnd(vUv * 1000.0 + fract(uTime)) - 0.5) * uGrain;
  gl_FragColor.rgb *= 1.0 - uFade;
  gl_FragDepth = d;
}`;

// Planar reflection camera for the water (adapted from the standard oblique-clip reflector).
const _n = new THREE.Vector3(0, 1, 0), _rp = new THREE.Vector3(), _cp = new THREE.Vector3(), _rot = new THREE.Matrix4();
const _look = new THREE.Vector3(), _tgt = new THREE.Vector3(), _view = new THREE.Vector3(), _plane = new THREE.Plane(), _clip = new THREE.Vector4(), _q = new THREE.Vector4();

export class Pipeline {
  constructor(renderer, settings) {
    this.renderer = renderer;
    this.settings = settings;
    this.size = new THREE.Vector2();
    this.target = null;
    this.uniforms = {
      tColor: { value: null }, tDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 2000 },
      uTime: { value: 0 }, uUnder: { value: 0 }, uSunScreen: { value: new THREE.Vector2(0.5, 1) }, uSunVis: { value: 0 },
      uUnderColor: { value: new THREE.Color(0.1, 0.3, 0.3) }, uVignette: { value: 0.9 }, uGrain: { value: 0.025 }, uSat: { value: 1 },
      uFlash: { value: 0 }, uFade: { value: 0 }, uCamDepth: { value: 0 },
    };
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      vertexShader: compositeVS, fragmentShader: compositeFS, uniforms: this.uniforms,
      depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth, toneMapped: true,
    }));
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.reflCam = new THREE.PerspectiveCamera();
    this.reflMatrix = new THREE.Matrix4();
    this.reflTarget = null;
    this.configure();
  }
  updateReflection(world) {
    const { camera, scene, renderer } = { ...world, renderer: this.renderer };
    const vc = this.reflCam;
    _cp.setFromMatrixPosition(camera.matrixWorld);
    _rp.set(_cp.x, 0, _cp.z);
    _rot.extractRotation(camera.matrixWorld);
    _view.subVectors(_rp, _cp).reflect(_n).negate().add(_rp);
    _look.set(0, 0, -1).applyMatrix4(_rot).add(_cp);
    _tgt.subVectors(_rp, _look).reflect(_n).negate().add(_rp);
    vc.position.copy(_view);
    vc.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_n);
    vc.lookAt(_tgt);
    vc.far = camera.far; vc.near = camera.near;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);
    this.reflMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);
    _plane.setFromNormalAndCoplanarPoint(_n, _rp).applyMatrix4(vc.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const pm = vc.projectionMatrix.elements;
    _q.set((Math.sign(_clip.x) + pm[8]) / pm[0], (Math.sign(_clip.y) + pm[9]) / pm[5], -1, (1 + pm[10]) / pm[14]);
    _clip.multiplyScalar(2 / _clip.dot(_q));
    pm[2] = _clip.x; pm[6] = _clip.y; pm[10] = _clip.z + 1 - 0.003; pm[14] = _clip.w;
    vc.layers.set(LAYER_WORLD);
    const prevAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.reflTarget);
    renderer.setClearAlpha(0);
    renderer.clear(true, true, true);
    renderer.render(scene, vc);
    renderer.setClearAlpha(prevAlpha);
  }
  get usePost() { return this.settings.q.postPipeline; }
  configure() {
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.settings.q.pixelRatio, 2));
    this.resize();
  }
  resize() {
    const r = this.renderer;
    const w = window.innerWidth, h = window.innerHeight;
    r.setSize(w, h, false);
    r.getDrawingBufferSize(this.size);
    if (this.usePost) {
      if (!this.target) {
        this.target = new THREE.WebGLRenderTarget(this.size.x, this.size.y, {
          type: THREE.HalfFloatType, depthBuffer: true,
          depthTexture: new THREE.DepthTexture(this.size.x, this.size.y, THREE.UnsignedIntType),
        });
        this.target.texture.generateMipmaps = false;
      } else this.target.setSize(this.size.x, this.size.y);
      this.uniforms.tColor.value = this.target.texture;
      this.uniforms.tDepth.value = this.target.depthTexture;
    } else if (this.target) { this.target.dispose(); this.target = null; }
    const rs = this.settings.q.reflections;
    if (rs && this.usePost) {
      const w2 = Math.max(64, Math.floor(this.size.x * rs)), h2 = Math.max(64, Math.floor(this.size.y * rs));
      if (!this.reflTarget) { this.reflTarget = new THREE.WebGLRenderTarget(w2, h2, { type: THREE.HalfFloatType }); this.reflTarget.texture.generateMipmaps = false; }
      else this.reflTarget.setSize(w2, h2);
    }
  }

  render(world) {
    const { scene, camera, farScene, farCamera } = world;
    const r = this.renderer;
    r.autoClear = false;
    if (this.usePost && this.target) {
      if (this.reflTarget && !world.atmosphere.underwater) { this.updateReflection(world); this.reflActive = true; } else this.reflActive = false;
      r.setRenderTarget(this.target);
      r.clear(true, true, true);
      r.render(farScene, farCamera);
      r.clearDepth();
      camera.layers.set(LAYER_WORLD);
      r.render(scene, camera);
      r.setRenderTarget(null);
      r.clear(true, true, true);
      this.uniforms.uNear.value = camera.near; this.uniforms.uFar.value = camera.far;
      r.render(this.quadScene, this.quadCam);
      camera.layers.disableAll(); camera.layers.enable(LAYER_WATER); camera.layers.enable(LAYER_FX);
      r.render(scene, camera);
      camera.layers.enableAll();
    } else {
      r.setRenderTarget(null);
      r.clear(true, true, true);
      r.render(farScene, farCamera);
      r.clearDepth();
      camera.layers.enableAll();
      r.render(scene, camera);
    }
  }
}

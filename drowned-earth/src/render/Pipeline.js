import * as THREE from 'three';

// Rendering pipeline.
//  low:        far layer → clear depth → everything, straight to the screen.
//  medium/high: far layer + opaque world into an HDR target (color + depth),
//              composite to screen (tonemap, grade, underwater shafts) while
//              restoring depth via gl_FragDepth, then water + transparent FX on
//              top. The water samples the opaque color/depth for refraction,
//              depth tint and shoreline foam.
// LAYER_DETAIL: small props — drawn in the main pass, skipped by water reflections
export const LAYER_WORLD = 0, LAYER_WATER = 1, LAYER_FX = 2, LAYER_DETAIL = 3;

const compositeVS = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// Pass 1: copy the opaque HDR scene into the second target and restore its depth.
const copyFS = /* glsl */`
uniform sampler2D tColor; uniform sampler2D tDepth; varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tColor, vUv).rgb, 1.0); gl_FragDepth = texture2D(tDepth, vUv).x; }`;

// Bloom: bright-pass downsample, then separable gaussian blurs at low resolution.
const brightFS = /* glsl */`
uniform sampler2D tColor; uniform vec2 uTexel; uniform float uThreshold; varying vec2 vUv;
void main() {
  vec3 c = vec3(0.0);
  c += texture2D(tColor, vUv + uTexel * vec2(-1.0, -1.0)).rgb; c += texture2D(tColor, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture2D(tColor, vUv + uTexel * vec2(-1.0, 1.0)).rgb;  c += texture2D(tColor, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  float k = max(l - uThreshold, 0.0); k = k * k / (k + 0.5);
  gl_FragColor = vec4(min(c * (k / max(l, 1e-4)), vec3(40.0)), 1.0);
}`;
const blurFS = /* glsl */`
uniform sampler2D tColor; uniform vec2 uDir; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tColor, vUv).rgb * 0.227;
  c += (texture2D(tColor, vUv + uDir * 1.385).rgb + texture2D(tColor, vUv - uDir * 1.385).rgb) * 0.316;
  c += (texture2D(tColor, vUv + uDir * 3.231).rgb + texture2D(tColor, vUv - uDir * 3.231).rgb) * 0.07;
  gl_FragColor = vec4(c, 1.0);
}`;

// Final pass: lens, depth of field, mist hugging the water, sun shafts,
// underwater rays, bloom, filmic tonemap and grade, vignette, grain.
const compositeFS = /* glsl */`
#include <common>
#include <packing>
uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tBloom; uniform sampler2D tBloom2;
uniform float uNear; uniform float uFar; uniform float uTime;
uniform float uUnder; uniform vec2 uSunScreen; uniform float uSunVis; uniform vec3 uUnderColor;
uniform float uVignette; uniform float uGrain; uniform float uSat; uniform float uFlash; uniform float uFade;
uniform float uCamDepth; uniform float uIndoor;
uniform float uWetLens; uniform float uTunnel; uniform float uDof; uniform float uBloom; uniform vec2 uTexel; uniform float uCondense;
uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform vec3 uCamPos; uniform vec3 uSunDir; uniform vec3 uSunCol;
uniform float uMist; uniform vec3 uMistCol; uniform vec2 uSunUV; uniform float uShaft; uniform float uLens;
varying vec2 vUv;
float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 worldAt(vec2 uv, float d) {
  vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); v /= v.w;
  return (uCamWorld * vec4(v.xyz, 1.0)).xyz;
}
void main() {
  vec2 uv = vUv;
  if (uWetLens > 0.01) {
    vec2 cell = floor(vUv * vec2(18.0, 10.0)); vec2 f = fract(vUv * vec2(18.0, 10.0)) - 0.5;
    float h = rnd(cell); vec2 c = (vec2(rnd(cell + 3.1), rnd(cell + 7.7)) - 0.5) * 0.6;
    float r = 0.12 + 0.22 * h; float dd = length(f - c);
    float drop = smoothstep(r, r * 0.6, dd) * step(1.0 - uWetLens, h);
    uv += (f - c) * drop * 0.035;
  }
  float d = texture2D(tDepth, uv).x;
  // subtle chromatic aberration toward the frame edges
  vec2 ca = (uv - 0.5) * uLens * 0.0035;
  vec3 col = vec3(texture2D(tColor, uv + ca).r, texture2D(tColor, uv).g, texture2D(tColor, uv - ca).b);
  if (uDof > 0.5) {
    float fz = -perspectiveDepthToViewZ(texture2D(tDepth, vec2(0.5)).x, uNear, uFar);
    float vz = -perspectiveDepthToViewZ(d, uNear, uFar);
    float coc = clamp(abs(vz - fz) / max(fz, 1.0), 0.0, 1.0);
    vec3 acc = col; float wsum = 1.0;
    for (int i = 0; i < 16; i++) { float a = float(i) * 2.399; float rr = sqrt(float(i) + 0.5) * 2.2 * coc; vec2 o = vec2(cos(a), sin(a)) * rr * uTexel * 2.0; acc += texture2D(tColor, uv + o).rgb; wsum += 1.0; }
    col = acc / wsum;
  }
  float viewZ = -perspectiveDepthToViewZ(d, uNear, uFar);
  if (uUnder > 0.5) {
    vec2 dir = vUv - uSunScreen;
    float ang = atan(dir.y, dir.x);
    float rays = sin(ang * 23.0 + uTime * 0.3) * sin(ang * 41.0 - uTime * 0.21) * 0.5 + 0.5;
    rays = pow(rays, 3.0) * smoothstep(1.2, 0.0, length(dir)) * uSunVis * (1.0 - uIndoor);
    float distFade = 1.0 - exp(-viewZ * 0.09);
    col += uUnderColor * rays * 2.4 * distFade * exp(-uCamDepth * 0.13);
    col += uUnderColor * rnd(floor(vUv * 180.0 + uTime * 0.6)) * 0.02;
  } else {
    // low mist that hugs the water: exponential height fog integrated along the view ray
    vec3 wp = d >= 0.99999 ? uCamPos + normalize(worldAt(uv, 0.5) - uCamPos) * 2500.0 : worldAt(uv, d);
    vec3 rd = wp - uCamPos; float dist = length(rd); rd /= dist;
    float H = 7.0;
    float y0 = max(uCamPos.y, 0.0), y1 = max(wp.y, 0.0);
    float dy = y1 - y0;
    float avg = abs(dy) > 0.05 ? H * (exp(-y0 / H) - exp(-y1 / H)) / dy : exp(-y0 / H);
    float mist = 1.0 - exp(-uMist * min(dist, 2500.0) * avg);
    float toSun = pow(max(dot(rd, uSunDir), 0.0), 6.0);
    vec3 mcol = uMistCol + uSunCol * toSun * 0.9;
    col = mix(col, mcol, clamp(mist, 0.0, 0.92));
    // god rays: march toward the sun, gathering open sky between the towers
    if (uShaft > 0.001) {
      vec2 delta = (uSunUV - uv) / 36.0;
      vec2 suv = uv; float illum = 0.0, decay = 1.0;
      for (int i = 0; i < 36; i++) {
        suv += delta;
        if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) break;
        float sky = step(0.99999, texture2D(tDepth, suv).x);
        illum += sky * decay; decay *= 0.955;
      }
      float fall = smoothstep(1.1, 0.0, length((uv - uSunUV) * vec2(uTexel.y / uTexel.x, 1.0)));
      col += uSunCol * illum / 36.0 * uShaft * fall * (0.6 + 0.4 * step(d, 0.99999));
    }
  }
  // bloom: tight + wide
  col += (texture2D(tBloom, vUv).rgb * 0.7 + texture2D(tBloom2, vUv).rgb * 0.9) * uBloom * 0.22;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat);
  col += uFlash * vec3(0.75, 0.8, 1.0);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  // filmic grade: cool, slightly lifted shadows; warm highlights; gentle S-curve
  vec3 g = gl_FragColor.rgb;
  float lum = dot(g, vec3(0.299, 0.587, 0.114));
  g += vec3(-0.012, 0.004, 0.018) * (1.0 - smoothstep(0.0, 0.45, lum));
  g += vec3(0.02, 0.008, -0.018) * smoothstep(0.55, 1.0, lum);
  g = mix(g, g * g * (3.0 - 2.0 * g), 0.22);
  vec2 q = vUv - 0.5;
  g *= 1.0 - dot(q, q) * (uVignette + uTunnel * 3.5);
  g = mix(g, vec3(0.75, 0.78, 0.8) * (0.4 + 0.6 * g), uCondense * smoothstep(0.15, 0.6, length(q)) * 0.6);
  g += (rnd(vUv * 1000.0 + fract(uTime)) - 0.5) * uGrain;
  g *= 1.0 - uFade;
  gl_FragColor.rgb = g;
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
      uFlash: { value: 0 }, uFade: { value: 0 }, uCamDepth: { value: 0 }, uIndoor: { value: 0 }, uWetLens: { value: 0 }, uTunnel: { value: 0 }, uDof: { value: 0 }, uBloom: { value: 1 }, uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) }, uCondense: { value: 0 },
      tBloom: { value: null }, tBloom2: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uMist: { value: 0 }, uMistCol: { value: new THREE.Color() },
      uSunUV: { value: new THREE.Vector2(0.5, 0.5) }, uShaft: { value: 0 }, uLens: { value: 1 },
    };
    const mk = (fs, uniforms, extra = {}) => new THREE.ShaderMaterial({ vertexShader: compositeVS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, toneMapped: false, ...extra });
    this.copyMat = mk(copyFS, { tColor: { value: null }, tDepth: { value: null } }, { depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth });
    this.brightMat = mk(brightFS, { tColor: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.0 } });
    this.blurMat = mk(blurFS, { tColor: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      vertexShader: compositeVS, fragmentShader: compositeFS, uniforms: this.uniforms,
      depthTest: false, depthWrite: false, toneMapped: true,
    }));
    this.quad.frustumCulled = false;
    this.finalMat = this.quad.material;
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
  pass(mat, target) { this.quad.material = mat; this.renderer.setRenderTarget(target); this.renderer.render(this.quadScene, this.quadCam); }
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
      const hdr = (w, h, depth) => { const t = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: !!depth, depthTexture: depth ? new THREE.DepthTexture(w, h, THREE.UnsignedIntType) : null }); t.texture.generateMipmaps = false; return t; };
      const W = this.size.x, H = this.size.y;
      if (!this.targetB) { this.targetB = hdr(W, H, true); this.bloomA = hdr(W >> 1, H >> 1); this.bloomB = hdr(W >> 2, H >> 2); this.bloomC = hdr(W >> 2, H >> 2); this.bloomD = hdr(W >> 3, H >> 3); this.bloomE = hdr(W >> 3, H >> 3); }
      else { this.targetB.setSize(W, H); this.bloomA.setSize(W >> 1, H >> 1); this.bloomB.setSize(W >> 2, H >> 2); this.bloomC.setSize(W >> 2, H >> 2); this.bloomD.setSize(W >> 3, H >> 3); this.bloomE.setSize(W >> 3, H >> 3); }
      this.copyMat.uniforms.tColor.value = this.target.texture; this.copyMat.uniforms.tDepth.value = this.target.depthTexture;
      this.uniforms.tColor.value = this.targetB.texture;
      this.uniforms.tDepth.value = this.targetB.depthTexture;
      this.uniforms.tBloom.value = this.bloomC.texture; this.uniforms.tBloom2.value = this.bloomE.texture;
      this.uniforms.uTexel.value.set(1 / W, 1 / H);
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
      // underwater the far layer is replaced by the murk itself
      const under = world.atmosphere.underwater;
      if (under) r.setClearColor(world.scene.fog.color, 1);
      r.clear(true, true, true);
      if (under) r.setClearColor(0x000000, 1); else r.render(farScene, farCamera);
      r.clearDepth();
      camera.layers.set(LAYER_WORLD);
      camera.layers.enable(LAYER_DETAIL);
      r.render(scene, camera);
      // the opaque world + water + effects, all in HDR
      this.uniforms.uNear.value = camera.near; this.uniforms.uFar.value = camera.far;
      r.setRenderTarget(this.targetB);
      r.clear(true, true, true);
      this.pass(this.copyMat, this.targetB);
      camera.layers.disableAll(); camera.layers.enable(LAYER_WATER); camera.layers.enable(LAYER_FX);
      r.render(scene, camera);
      camera.layers.enableAll();
      // bloom chain
      const bm = this.blurMat.uniforms;
      this.brightMat.uniforms.tColor.value = this.targetB.texture; this.brightMat.uniforms.uTexel.value.set(1 / this.size.x, 1 / this.size.y);
      this.pass(this.brightMat, this.bloomA);
      bm.tColor.value = this.bloomA.texture; bm.uDir.value.set(2 / this.size.x, 0); this.pass(this.blurMat, this.bloomB);
      bm.tColor.value = this.bloomB.texture; bm.uDir.value.set(0, 4 / this.size.y); this.pass(this.blurMat, this.bloomC);
      bm.tColor.value = this.bloomC.texture; bm.uDir.value.set(8 / this.size.x, 0); this.pass(this.blurMat, this.bloomD);
      bm.tColor.value = this.bloomD.texture; bm.uDir.value.set(0, 8 / this.size.y); this.pass(this.blurMat, this.bloomE);
      // final
      const u = this.uniforms;
      u.uInvProj.value.copy(camera.projectionMatrixInverse); u.uCamWorld.value.copy(camera.matrixWorld); u.uCamPos.value.copy(camera.position);
      r.setRenderTarget(null);
      r.clear(true, true, true);
      this.pass(this.finalMat, null);
    } else {
      r.setRenderTarget(null);
      const under = world.atmosphere.underwater;
      if (under) r.setClearColor(world.scene.fog.color, 1);
      r.clear(true, true, true);
      if (under) r.setClearColor(0x000000, 1); else r.render(farScene, farCamera);
      r.clearDepth();
      camera.layers.enableAll();
      r.render(scene, camera);
    }
  }
}

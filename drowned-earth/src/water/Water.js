import * as THREE from 'three';
import { WAVES_GLSL } from './Waves.js';
import { SKY_GLSL, skyUniforms } from '../weather/Sky.js';
import { getTexture } from '../world/Textures.js';
import { LAYER_WATER } from '../render/Pipeline.js';
import { G } from '../world/WorldShader.js';

// The water surface: a radial LOD grid that follows the camera (dense near,
// sparse far), displaced by the shared wave model, shaded with fresnel sky
// reflection, sun glitter, refraction + depth absorption from the opaque pass,
// contact/crest/wake foam, rain rings and procedural ripples.
const MAX_RIPPLES = 24;

const vs = /* glsl */`
${WAVES_GLSL}
uniform float uFadeNear; uniform float uFadeFar;
varying vec3 vW; varying vec3 vN; varying float vCrest; varying float vDist;
#include <fog_pars_vertex>
void main() {
  vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
  float dist = length(wp.xz - cameraPosition.xz);
  float fade = 1.0 - smoothstep(uFadeNear, uFadeFar, dist);
  vec3 ws = waveSample(wp.xz);
  wp.y += ws.x * fade;
  vN = normalize(vec3(-ws.y * fade, 1.0, -ws.z * fade));
  vCrest = ws.x * fade;
  vW = wp; vDist = dist;
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const fs = /* glsl */`
#include <common>
#include <packing>
${SKY_GLSL}
uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uNight;
uniform sampler2D tNormal; uniform sampler2D tNoise;
uniform sampler2D tScene; uniform sampler2D tDepth; uniform float uHasScene;
uniform sampler2D tRefl; uniform mat4 uReflMatrix; uniform float uHasRefl;
uniform vec2 uResolution; uniform float uNear; uniform float uFar;
uniform vec3 uScatter; uniform vec3 uDeep; uniform float uWind; uniform vec2 uWindDir; uniform float uRain;
uniform vec4 uRip[${MAX_RIPPLES}]; uniform float uRipStr[${MAX_RIPPLES}];
uniform float uUnder; uniform vec3 uUnderColor; uniform float uGlow; uniform vec3 uGlowPos;
uniform vec3 uLightPos[4]; uniform vec3 uLightCol[4];
uniform vec4 uHullA; uniform vec4 uHullB; // boat cutout: (x, z, fwd.x, fwd.z), (half length, half beam, gunwale y, on)
varying vec3 vW; varying vec3 vN; varying float vCrest; varying float vDist;
#include <fog_pars_fragment>

vec3 ripples(vec2 p, out float foam) {
  vec2 g = vec2(0.0); foam = 0.0;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 r = uRip[i];
    float age = uTime - r.z;
    if (age < 0.0 || age > 6.0 || uRipStr[i] <= 0.0) continue;
    vec2 d = p - r.xy; float dist = length(d) + 1e-4;
    float front = age * r.w;
    float x = dist - front;
    float env = exp(-x * x * 1.5) * exp(-age * 0.7) * uRipStr[i] / (1.0 + front * 0.6);
    g += (d / dist) * cos(x * 5.0) * env * 0.9;
    foam += smoothstep(1.2, 0.0, dist) * exp(-age * 1.6) * uRipStr[i];
  }
  return vec3(g.x, 0.0, g.y);
}

// fine wave octaves (GPU only: too small to matter for buoyancy). Analytic
// gradients of 6 short directional waves spread around the wind.
vec2 fineWaves(vec2 p, float t, float amp) {
  vec2 g = vec2(0.0);
  float a = atan(uWindDir.y, uWindDir.x);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float ang = a + (fract(fi * 0.618) - 0.5) * 2.2;
    vec2 d = vec2(cos(ang), sin(ang));
    float L = 3.6 * pow(0.68, fi);
    float k = 6.2831853 / L, w = sqrt(9.81 * k);
    float A = amp * L * 0.012;
    float ph = k * dot(d, p) - w * t + fi * 1.7;
    g += d * (A * k * cos(ph));
  }
  return g;
}
float rainRings(vec2 p) {
  if (uRain < 0.01) return 0.0;
  vec2 cell = floor(p * 1.6); vec2 f = fract(p * 1.6) - 0.5;
  float h = fract(sin(dot(cell, vec2(12.9, 78.2))) * 43758.5);
  float t = fract(uTime * 1.3 + h);
  float r = length(f + (vec2(h, fract(h * 7.3)) - 0.5) * 0.4);
  return sin((r - t * 0.5) * 60.0) * smoothstep(0.5 * t + 0.05, 0.5 * t, r) * (1.0 - t) * step(h, uRain);
}

void main() {
  // no water inside the boat's hull (its floor sits below the waterline, like a real skiff)
  if (uHullB.w > 0.5 && uUnder < 0.5) {
    vec2 d = vW.xz - uHullA.xy;
    float a = dot(d, uHullA.zw) / uHullB.x, b = dot(d, vec2(-uHullA.w, uHullA.z)) / uHullB.y;
    float taper = a > 0.0 ? 1.0 - a * a * 0.85 : 1.0;   // the bow narrows
    if (abs(a) < 1.0 && abs(b) < taper && vW.y < uHullB.z) discard;
  }
  vec3 V = normalize(cameraPosition - vW);
  float detailFade = 1.0 - smoothstep(30.0, 400.0, vDist);
  vec2 wind = uWindDir * uTime * (0.25 + uWind * 0.6);
  vec3 n1 = texture2D(tNormal, vW.xz * 0.11 + wind * 0.05).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(tNormal, vW.xz * 0.31 - wind.yx * 0.09 + 0.3).xyz * 2.0 - 1.0;
  vec3 n3 = texture2D(tNormal, vW.xz * 0.023 + wind * 0.01).xyz * 2.0 - 1.0;
  float chop = (0.25 + uWind * 0.75);
  vec3 detail = vec3(n1.x + n2.x * 0.6, 0.0, n1.y + n2.y * 0.6) * chop * detailFade + vec3(n3.x, 0.0, n3.y) * 0.25;
  float ripFoam;
  vec3 rip = ripples(vW.xz, ripFoam);
  float rr = rainRings(vW.xz);
  // fade the fine octaves out where they'd be smaller than a pixel (blocky glints otherwise)
  float pix = length(fwidth(vW.xz));
  vec2 fw = fineWaves(vW.xz, uTime, 0.35 + uWind) * detailFade * clamp(1.0 - (pix - 0.02) * 12.0, 0.0, 1.0);
  vec3 N = normalize(vN + detail * 0.22 + rip + vec3(rr * 0.3, 0.0, rr * 0.3) - vec3(fw.x, 0.0, fw.y));
  bool below = uUnder > 0.5;
  if (below) N = -N;
  float NdV = max(dot(N, V), 0.0);
  vec3 col;
  // screen-space refraction
  vec2 suv = gl_FragCoord.xy / uResolution;
  float waterZ = -perspectiveDepthToViewZ(gl_FragCoord.z, uNear, uFar);
  float thick = 30.0;
  vec3 refr = uDeep;
  if (uHasScene > 0.5) {
    vec2 off = N.xz * 0.045 * clamp(1.0 - vDist / 300.0, 0.15, 1.0);
    vec2 ruv = clamp(suv + off, 0.001, 0.999);
    float sz = -perspectiveDepthToViewZ(texture2D(tDepth, ruv).x, uNear, uFar);
    if (sz < waterZ) { ruv = suv; sz = -perspectiveDepthToViewZ(texture2D(tDepth, suv).x, uNear, uFar); }
    thick = max(sz - waterZ, 0.0);
    vec3 sceneCol = texture2D(tScene, ruv).rgb;
    // Beer-Lambert along the in-water path, plus in-scatter toward the water color
    float pathK = below ? 0.0 : 1.0;
    vec3 trans = exp(-vec3(0.55, 0.3, 0.36) * thick * pathK);
    float scatterAmt = 1.0 - exp(-thick * 0.35 * pathK);
    refr = sceneCol * trans + uScatter * scatterAmt;
  } else {
    refr = mix(uScatter, uDeep, 0.4 + 0.6 * (1.0 - NdV));
  }
  if (!below) {
    // Fresnel, capped: a rough sea never mirrors the hazy sky completely, so distant water keeps its own colour
    float F = (0.02 + 0.98 * pow(1.0 - NdV, 5.0)) * 0.74;
    vec3 R = reflect(-V, N); R.y = abs(R.y);
    // the reflected sky is a little darker and greener than the sky itself (absorption + polarisation)
    vec3 refl = skyClouds(R, skyBase(R), true) * (1.0 - uCloud * 0.2) * vec3(0.8, 0.86, 0.86);
    if (uHasRefl > 0.5) {
      vec4 rc = uReflMatrix * vec4(vW.x, 0.0, vW.z, 1.0);
      vec2 ruv = rc.xy / rc.w + N.xz * 0.06 * clamp(1.0 - vDist / 400.0, 0.2, 1.0);
      vec4 rf = texture2D(tRefl, clamp(ruv, 0.001, 0.999));
      refl = mix(refl, rf.rgb, rf.a * 0.92);
    }
    // sun glitter / moon path
    float spec = pow(max(dot(R, uSunDir), 0.0), mix(700.0, 180.0, clamp(pix * 8.0, 0.0, 1.0))) * mix(30.0, 8.0, clamp(pix * 8.0, 0.0, 1.0)) + pow(max(dot(R, uSunDir), 0.0), 60.0) * 0.6;
    refl += uSunColor * min(spec, 8.0) * (1.0 - uCloud * 0.85);   // a bright glint, never a white-out
    // point lights (lanterns, searchlights) streak on the water
    for (int i = 0; i < 4; i++) {
      vec3 L = uLightPos[i] - vW; float ld = length(L); L /= ld;
      float s = pow(max(dot(R, L), 0.0), 900.0) * 5.0 / (1.0 + ld * 0.08);
      refl += uLightCol[i] * s;
    }
    col = mix(refr, refl, F);
    // subsurface scattering: sunlight through the thin water of wave crests
    float sssView = pow(max(dot(V, -normalize(uSunDir + N * 0.35)), 0.0), 4.0);
    float sss = sssView * (0.4 + max(vCrest, 0.0) * 3.0) * max(uSunDir.y + 0.1, 0.0) * (1.0 - uCloud * 0.7);
    col += uScatter * uSunColor * sss * 1.6 * (1.0 - F);
    // foam: contact with walls, crests in wind, wake
    float fn = texture2D(tNoise, vW.xz * 0.21 + wind * 0.02).r * 0.6 + texture2D(tNoise, vW.xz * 0.7 - wind * 0.03).g * 0.4;
    float contact = (uHasScene > 0.5) ? smoothstep(0.45, 0.0, thick) * smoothstep(0.35, 0.65, fn + 0.15) * 0.6 : 0.0;
    float crest = smoothstep(0.35, 0.9, vCrest / max(0.2, 0.3 + uWind * 0.5)) * smoothstep(0.45, 0.75, fn) * smoothstep(0.45, 1.0, uWind);
    float wake = smoothstep(0.1, 0.8, ripFoam * fn * 1.6);
    // wind streaks: long foam lines lying along the wind in a blow
    vec2 wp2 = vec2(dot(vW.xz, uWindDir), dot(vW.xz, vec2(-uWindDir.y, uWindDir.x)));
    float streak = texture2D(tNoise, vec2(wp2.x * 0.012 - uTime * 0.01, wp2.y * 0.22)).r;
    crest += smoothstep(0.62, 0.8, streak) * smoothstep(0.55, 1.0, uWind) * 0.35 * detailFade;
    float foam = clamp(contact + crest + wake, 0.0, 1.0);
    vec3 foamCol = (skyBase(vec3(0.0, 1.0, 0.0)) * 0.6 + uSunColor * max(uSunDir.y, 0.0) * 0.5) * 0.9 + 0.04;
    col = mix(col, foamCol * 0.8, foam * 0.7);
  } else {
    // seen from beneath: Snell's window, total internal reflection outside it
    vec3 T = refract(-V, N, 1.0 / 1.333);
    float window = dot(T, T) > 0.0 ? smoothstep(0.0, 0.25, T.y) : 0.0;
    vec3 through = skyBase(normalize(T + vec3(0.0, 0.001, 0.0))) * 0.9;
    if (uHasScene > 0.5) through = mix(through, texture2D(tScene, clamp(suv + N.xz * 0.08, 0.001, 0.999)).rgb, 0.35);
    col = mix(uUnderColor * 0.6, through, window);
    col += uSunColor * pow(max(dot(T, uSunDir), 0.0), 40.0) * window * 2.0;
  }
  // deep structure glow from far below (finale)
  col += vec3(0.1, 0.9, 0.75) * uGlow * 0.35 * exp(-length(vW.xz - uGlowPos.xz) * 0.02);
  gl_FragColor = vec4(min(col, vec3(2.2)), 1.0);
  #define FOG_NO_STREAM_FADE
  #include <fog_fragment>
  #ifdef USE_FOG
  // distant water sits a touch darker than the haze, so the horizon line reads instead of melting into the sky
  if (uUnder < 0.5) gl_FragColor.rgb *= 1.0 - fogFactor * 0.16;
  #endif
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function radialGrid(rings, segs, rMin, rMax) {
  const pos = [0, 0, 0];
  const idx = [];
  for (let r = 0; r < rings; r++) {
    const t = r / (rings - 1);
    const rad = rMin + (rMax - rMin) * Math.pow(t, 2.6);
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * rad, 0, Math.sin(a) * rad);
    }
  }
  for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
  for (let r = 0; r < rings - 1; r++) for (let s = 0; s < segs; s++) {
    const a = 1 + r * segs + s, b = 1 + r * segs + ((s + 1) % segs);
    const c = a + segs, d = b + segs;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export class Water {
  constructor(ctx) {
    this.ctx = ctx;
    const q = ctx.settings.q;
    this.ripIdx = 0;
    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
    Object.assign(this.uniforms, skyUniforms, ctx.waves.uniforms, {
      uTime: G.uTime, uSunDir: G.uSunDir, uSunColor: G.uSunColor, uNight: G.uNight, uGlow: G.uGlow,
      tNormal: { value: getTexture('waterN') }, tNoise: { value: getTexture('noise') },
      tScene: { value: null }, tDepth: { value: null }, uHasScene: { value: 0 },
      tRefl: { value: null }, uReflMatrix: { value: new THREE.Matrix4() }, uHasRefl: { value: 0 },
      uResolution: { value: new THREE.Vector2(1, 1) }, uNear: { value: 0.1 }, uFar: { value: 2000 },
      uScatter: { value: new THREE.Color(0.022, 0.045, 0.035) }, uDeep: { value: new THREE.Color(0.008, 0.02, 0.02) },
      uWind: { value: 0.3 }, uWindDir: { value: new THREE.Vector2(1, 0) }, uRain: { value: 0 },
      uRip: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -100, 1)) },
      uRipStr: { value: new Array(MAX_RIPPLES).fill(0) },
      uUnder: { value: 0 }, uUnderColor: { value: new THREE.Color(0.04, 0.16, 0.16) },
      uGlowPos: { value: new THREE.Vector3() },
      uFadeNear: { value: 250 }, uFadeFar: { value: 900 },
      uHullA: { value: new THREE.Vector4() }, uHullB: { value: new THREE.Vector4() },
      uLightPos: { value: Array.from({ length: 4 }, () => new THREE.Vector3(0, -1000, 0)) },
      uLightCol: { value: Array.from({ length: 4 }, () => new THREE.Color(0, 0, 0)) },
    });
    this.material = new THREE.ShaderMaterial({
      vertexShader: vs, fragmentShader: fs, uniforms: this.uniforms, fog: true, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(radialGrid(q.waterRings, q.waterSegments, 0.6, 2200), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(LAYER_WATER);
    this.mesh.renderOrder = 1;
    this.mesh.name = 'water';
    ctx.scene.add(this.mesh);
    this.far = this.makeFarOcean();
    ctx.farScene.add(this.far);
  }
  makeFarOcean() {
    const m = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uSunDir: G.uSunDir, uSunColor: G.uSunColor }]),
      vertexShader: `varying vec3 vW;\n#include <fog_pars_vertex>\nvoid main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;\n#include <fog_vertex>\n}`,
      fragmentShader: `${SKY_GLSL}\nuniform vec3 uSunDir; uniform vec3 uSunColor; varying vec3 vW;\n#include <fog_pars_fragment>\nvoid main(){ vec3 V = normalize(cameraPosition - vW); vec3 R = reflect(-V, vec3(0,1,0)); float F = 0.02 + 0.98*pow(1.0-max(V.y,0.0),5.0); vec3 c = mix(vec3(0.01,0.03,0.035), skyBase(R), F); c += uSunColor * pow(max(dot(R,uSunDir),0.0), 300.0) * 6.0; gl_FragColor = vec4(c,1.0);\n#include <fog_fragment>\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`,
      fog: true,
    });
    Object.assign(m.uniforms, skyUniforms);
    const g = new THREE.RingGeometry(Math.min(1500, this.ctx.settings.q.chunkFarRadius), 40000, 64, 1);   // starts where the near camera stops drawing
    g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.name = 'farOcean';
    return mesh;
  }
  ripple(x, z, strength = 1, speed = 1.4) {
    const i = this.ripIdx = (this.ripIdx + 1) % MAX_RIPPLES;
    this.uniforms.uRip.value[i].set(x, z, G.uTime.value, speed);
    this.uniforms.uRipStr.value[i] = strength;
  }
  setLights(list) {
    for (let i = 0; i < 4; i++) {
      const l = list[i];
      if (l) { this.uniforms.uLightPos.value[i].copy(l.pos); this.uniforms.uLightCol.value[i].copy(l.color); }
      else this.uniforms.uLightCol.value[i].setRGB(0, 0, 0);
    }
  }
  update(dt, camera, pipeline) {
    // cut the water out of the boat's hull while it's afloat near the camera
    const bt = this.ctx.boat, hb = this.uniforms.uHullB.value;
    if (bt?.pos && bt.group?.visible !== false && camera.position.distanceTo(bt.pos) < 60) {
      const H = bt.type?.hull || { length: 5.6, beam: 1.9, depth: 0.75 };
      this.uniforms.uHullA.value.set(bt.pos.x, bt.pos.z, -Math.sin(bt.heading), -Math.cos(bt.heading));
      hb.set(H.length * 0.46, H.beam * 0.44, bt.pos.y + H.depth, 1);
    } else hb.w = 0;
    const u = this.uniforms;
    const step = 2;
    this.mesh.position.set(Math.round(camera.position.x / step) * step, 0, Math.round(camera.position.z / step) * step);
    this.far.position.set(camera.position.x, 0, camera.position.z);
    const w = this.ctx.weather;
    u.uWind.value = w.cur.wind;
    u.uWindDir.value.set(Math.cos(w.windDir), Math.sin(w.windDir));
    u.uRain.value = w.cur.rain;
    u.uHasScene.value = pipeline.usePost && pipeline.target ? 1 : 0;
    if (pipeline.target) { u.tScene.value = pipeline.target.texture; u.tDepth.value = pipeline.target.depthTexture; }
    u.uHasRefl.value = pipeline.reflTarget && !this.ctx.atmosphere.underwater ? 1 : 0;
    if (pipeline.reflTarget) { u.tRefl.value = pipeline.reflTarget.texture; u.uReflMatrix.value = pipeline.reflMatrix; }
    u.uResolution.value.copy(pipeline.size);
    u.uNear.value = camera.near; u.uFar.value = camera.far;
    const night = this.ctx.time.out.night;
    const day = Math.max(0.04, 1 - night) * (1 - w.cur.cloud * 0.4);
    u.uScatter.value.setRGB(0.024, 0.05, 0.04).multiplyScalar(day);
    u.uDeep.value.setRGB(0.006, 0.016, 0.017).multiplyScalar(day + 0.1);
    u.uUnder.value = this.ctx.atmosphere.underwater ? 1 : 0;
    u.uUnderColor.value.copy(this.ctx.atmosphere.fog.color);
  }
}

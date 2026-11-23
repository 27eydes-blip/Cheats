// The 3D presence: a luminous gold organism built from a plasma core, tilted rings,
// floating particles, a gyroscope of thin rings, soft light rays and speech pulses, in a starfield.
// It only *shows* state: the app tells it the mode, mic level and voice analyser.
import * as THREE from "three";
import { createPipeline, pixelRatioFor, TIER_ORDER, TIERS } from "./postfx.js";
import { BOOT_FLASH_AT } from "../power.js";

const TAU = Math.PI * 2;
const GOLD = new THREE.Color(0xf2b950);
const AMBER = new THREE.Color(0xff8a2a);
const PALE = new THREE.Color(0xfff1cc);
const TEAL = new THREE.Color(0x3fd6c8);
const VIOLET = new THREE.Color(0x9a6bff);
const HALO_GOLD = new THREE.Color(0xffc070);
const HALO_RED = new THREE.Color(0xff2a18);
const HEART_GOLD = new THREE.Color(0xfff3d6);
const HEART_RED = new THREE.Color(0xff5a48);

// Ashima/Stefan Gustavson simplex noise (MIT), used to make the core feel organic.
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

/** How each state looks. Every value eases toward these targets, so nothing snaps. */
const LOOKS = {
  off: { glow: 0.25, breath: 0.25, ringSpeed: 0.12, arcs: 0, pulse: 0, ripple: 0, swirl: 0.15, spread: 1.0 },
  idle: { glow: 0.45, breath: 1, ringSpeed: 0.25, arcs: 0, pulse: 0, ripple: 0, swirl: 0.3, spread: 1.0 },
  active: { glow: 0.8, breath: 0.6, ringSpeed: 0.4, arcs: 0, pulse: 0, ripple: 0, swirl: 0.45, spread: 0.92 },
  confirm: { glow: 0.85, breath: 0.6, ringSpeed: 0.35, arcs: 0, pulse: 0, ripple: 0, swirl: 0.4, spread: 0.95 },
  thinking: { glow: 0.85, breath: 0.3, ringSpeed: 2.2, arcs: 1, pulse: 0, ripple: 0, swirl: 1.1, spread: 0.9 },
  speaking: { glow: 1.0, breath: 0.2, ringSpeed: 0.6, arcs: 0, pulse: 1, ripple: 0, swirl: 0.6, spread: 1.05 },
};

function makeGlowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, "rgba(255,244,214,1)");
  grad.addColorStop(0.12, "rgba(255,214,140,0.7)");
  grad.addColorStop(0.3, "rgba(255,180,90,0.28)");
  grad.addColorStop(0.6, "rgba(200,120,40,0.08)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const rand = (a, b) => a + Math.random() * (b - a);

/** Shared GLSL: soft round sprite with depth of field (sharp in focus, wide and dim when not). */
const SPRITE_VERT = /* glsl */ `
  uniform float uPixel, uFocus, uDof, uMinPx;
  // returns the point size in pixels and writes the blur amount and an energy factor
  float spriteSize(float baseSize, float dist, out float blur, out float energy){
    blur = clamp((abs(dist - uFocus) - 1.2) * 0.09 * uDof, 0.0, 1.5);  // a sharp zone around the being
    float s = baseSize * uPixel * (18.0 / dist) * (1.0 + blur * 2.2);
    float minPx = uMinPx * uPixel;
    energy = 1.0 / ((1.0 + blur * 2.2) * (1.0 + blur * 2.2)) * (1.0 + blur * 0.6);
    if (s < minPx) { energy *= s / minPx; s = minPx; }   // never sub-pixel: dimmer instead, so no flicker
    return min(s, 42.0 * uPixel);
  }`;
const SPRITE_FRAG = /* glsl */ `
  float spriteShape(vec2 pc, float blur){
    float d = length(pc - 0.5) * 2.0;                       // 0 centre, 1 edge
    float sharp = exp(-d * d * 7.0) * (1.0 - smoothstep(0.82, 1.0, d));
    float bokeh = (1.0 - smoothstep(0.7, 1.0, d)) * (0.55 + 0.45 * d * d); // out of focus: a soft disc
    return mix(sharp, bokeh * 0.55, clamp(blur, 0.0, 1.0));
  }`;

/**
 * opts: { mobile, reducedMotion, glow, particles, quality ("auto"|"low"|"medium"|"high"|"ultra"), onTap, onQuality }
 */
export async function createScene(canvas, opts) {
  const { mobile, reducedMotion } = opts;
  let glowScale = opts.glow ?? 1;
  let particleScale = opts.particles ?? 1;
  let quality = opts.quality || "auto";
  const maxTier = mobile ? 1 : 3; // phones: Auto stays at Low or Medium
  let tierIdx = quality === "auto" ? (mobile ? 1 : 2) : TIER_ORDER.indexOf(quality); // Auto starts at Medium on phones, High elsewhere
  if (tierIdx < 0) tierIdx = mobile ? 1 : 2;

  // Antialiasing happens in the HDR render target (MSAA) or FXAA, so the canvas itself doesn't need it.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", alpha: false, stencil: false, depth: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.setClearColor(0x050403, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050403, 0.04);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);
  const being = new THREE.Group();
  scene.add(being);

  const uniforms = {
    uTime: { value: 0 },
    uGlow: { value: 0.5 },
    uBreath: { value: 1 },
    uLevel: { value: 0 }, // voice or mic loudness, 0..1
    uSwirl: { value: 0.3 },
    uSpread: { value: 1 },
    uPixel: { value: 1 },
    uMotion: { value: reducedMotion ? 0.3 : 1 },
    // particles: their own clock (stops when they freeze), red shift, tremble, voice flare
    uPTime: { value: 0 },
    uPSpread: { value: 1 },
    uRed: { value: 0 },
    uTremble: { value: 0 },
    uFlare: { value: 0 },
    // image quality
    uFocus: { value: 8.2 },
    uDof: { value: 1 },
    uMinPx: { value: 1.6 },
    uViewH: { value: 1000 },
    uTanHalfFov: { value: Math.tan(THREE.MathUtils.degToRad(26)) },
    uOctaves: { value: 4 },
  };

  // ---- starfield: soft round points, slightly out of focus ------------------------
  const starCount = mobile ? 1200 : 3200;
  const starGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(starCount * 3);
  const sc = new Float32Array(starCount * 3);
  const ss = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    const r = rand(25, 90);
    const th = Math.random() * TAU;
    const ph = Math.acos(rand(-1, 1));
    sp.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i * 3);
    const c = Math.random() < 0.06 ? (Math.random() < 0.5 ? TEAL : VIOLET) : PALE.clone().lerp(GOLD, Math.random() * 0.6);
    sc.set([c.r, c.g, c.b], i * 3);
    ss[i] = Math.random() < 0.02 ? rand(2.2, 3.4) : rand(0.8, 1.8);
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  starGeo.setAttribute("color", new THREE.BufferAttribute(sc, 3));
  starGeo.setAttribute("aSize", new THREE.BufferAttribute(ss, 1));
  const stars = new THREE.Points(
    starGeo,
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        attribute vec3 color; attribute float aSize;
        uniform float uPixel, uTime, uMotion; varying vec3 vColor; varying float vA;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float s = aSize * uPixel;
          vA = 0.75 + 0.25 * sin(uTime * uMotion * 0.8 + position.x * 3.1);
          if (s < 1.6 * uPixel) { vA *= s / (1.6 * uPixel); s = 1.6 * uPixel; }
          gl_PointSize = s; vColor = color;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = exp(-d * d * 5.0) * (1.0 - smoothstep(0.8, 1.0, d)) * vA * 0.8; gl_FragColor = vec4(vColor * a, a); }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  stars.frustumCulled = false;
  scene.add(stars);

  // ---- core: a luminous body of plasma with fine glowing veins -----------------------
  const coreMat = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uColorA: { value: AMBER }, uColorB: { value: PALE }, uRim: { value: TEAL } },
    vertexShader: /* glsl */ `
      ${NOISE}
      uniform float uTime, uBreath, uLevel, uMotion;
      varying vec3 vNormal; varying vec3 vView; varying vec3 vObj;
      void main(){
        float t = uTime * uMotion;
        float n = snoise(normal * 0.9 + vec3(t * 0.22)) * 0.7 + snoise(normal * 2.2 - vec3(t * 0.3)) * 0.3;
        float breath = sin(t * 1.1) * 0.06 * uBreath;
        vec3 p = position * (1.0 + breath + uLevel * 0.12) + normal * n * (0.05 + uLevel * 0.12);
        vObj = normal;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vNormal = normalize(normalMatrix * normal); vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform float uGlow, uLevel, uRed, uTime, uMotion; uniform int uOctaves; uniform vec3 uColorA, uColorB, uRim;
      varying vec3 vNormal; varying vec3 vView; varying vec3 vObj;
      float fbm(vec3 p){
        float a = 0.5, s = 0.0;
        for (int i = 0; i < 5; i++) { if (i >= uOctaves) break; s += a * snoise(p); p *= 2.07; a *= 0.5; }
        return s;
      }
      void main(){
        float t = uTime * uMotion;
        vec3 n = normalize(vNormal);
        float facing = abs(dot(n, vView));
        float fres = pow(1.0 - facing, 2.5);
        // plasma: domain-warped noise that flows slowly over the surface
        vec3 q = vObj * 1.9 + vec3(0.0, t * 0.12, t * 0.05);
        float warp = fbm(q * 0.8 + vec3(t * 0.08));
        float f = fbm(q + warp * 0.9);
        float veins = pow(1.0 - abs(f), 9.0);                  // thin bright filaments
        float fine = pow(1.0 - abs(fbm(q * 2.6 - warp)), 14.0) * 0.6; // finer hair-lines
        float plasma = 0.5 + 0.5 * fbm(vObj * 1.2 - vec3(t * 0.1));
        vec3 col = mix(uColorA * 0.45, uColorB * 0.8, plasma * 0.4);
        col += vec3(1.0, 0.72, 0.36) * (veins * 1.6 + fine * 0.9);   // HDR: the veins drive the bloom
        col = mix(col, uRim, fres * 0.2);                            // faint teal edge
        col = mix(col, vec3(0.85, 0.08, 0.05) * (1.0 + veins * 1.5), uRed * 0.65); // red tint while you're talking
        float a = (0.04 + plasma * 0.06 + veins * 0.5 + fine * 0.22 + fres * 0.6) * (0.45 + uGlow * 0.5 + uLevel * 0.3) * (1.0 - uRed * 0.25);
        gl_FragColor = vec4(col * a, a);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide, // the far side's veins show through, giving it depth
  });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.78, mobile ? 32 : 64), coreMat);
  being.add(core);

  const glowTex = makeGlowTexture();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(6);
  being.add(halo);
  const heart = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff3d6, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  heart.scale.setScalar(2);
  being.add(heart);

  // ---- rings: fine thin bands that never fall below a pixel (so they don't shimmer) --------
  const ringMat = (color, dashes, R, tube) =>
    new THREE.ShaderMaterial({
      uniforms: { ...uniforms, uColor: { value: color }, uDashes: { value: dashes }, uOpacity: { value: 1 }, uR: { value: R }, uTube: { value: tube } },
      vertexShader: /* glsl */ `
        uniform float uR, uTube, uViewH, uTanHalfFov;
        varying vec2 vUv; varying float vThin;
        void main(){
          vUv = uv;
          // widen the tube to at least ~0.9 px on screen, and remember how much to dim it
          vec2 dir = normalize(position.xy);
          vec3 centre = vec3(dir * uR, 0.0);
          vec3 off = position - centre;
          vec4 mvc = modelViewMatrix * vec4(centre, 1.0);
          float worldPerPx = 2.0 * -mvc.z * uTanHalfFov / uViewH;
          float minR = worldPerPx * 0.9;
          float r = max(uTube, minR);
          vThin = uTube / r;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(centre + normalize(off) * r, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uDashes, uGlow, uLevel, uOpacity, uRed;
        varying vec2 vUv; varying float vThin;
        void main(){
          float d = fract(vUv.x * uDashes);
          float dash = uDashes > 0.0 ? smoothstep(0.0, 0.08, d) * smoothstep(0.62, 0.5, d) : 1.0;
          float tick = step(0.985, fract(vUv.x * 96.0)) * 0.8;
          float edge = sin(vUv.y * 3.14159);   // softer at the tube's silhouette
          float a = (max(dash, tick) * 0.55 + 0.08) * (0.35 + uGlow * 0.8 + uLevel * 0.9) * uOpacity * mix(0.55, 1.0, edge) * vThin;
          vec3 col = mix(uColor, vec3(0.85, 0.08, 0.05), uRed * 0.85); // red while you're talking
          gl_FragColor = vec4(col * a * 1.4, a);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  const ringSpecs = [
    { r: 1.45, tube: 0.007, tilt: [1.2, 0.2, 0], speed: 0.9, dashes: 0, color: GOLD },
    { r: 1.95, tube: 0.006, tilt: [0.5, 0.9, 0.3], speed: -0.6, dashes: 18, color: PALE },
    { r: 2.55, tube: 0.005, tilt: [1.9, -0.4, 0.6], speed: 0.4, dashes: 7, color: GOLD },
    { r: 3.25, tube: 0.004, tilt: [0.2, 0.3, 1.3], speed: -0.25, dashes: 40, color: AMBER },
    { r: 4.1, tube: 0.003, tilt: [1.5, 1.1, -0.2], speed: 0.15, dashes: 3, color: AMBER },
  ];
  const rings = ringSpecs.map((s) => {
    const pivot = new THREE.Group();
    pivot.rotation.set(...s.tilt);
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(s.r, s.tube, 8, mobile ? 360 : 720), ringMat(s.color, s.dashes, s.r, s.tube));
    pivot.add(mesh);
    being.add(pivot);
    return { pivot, mesh, ...s };
  });

  // ---- floating particles (animated entirely on the GPU) -----------------------
  // They drift, swirl and wander through the whole scene on their own clock (uPTime).
  // While you talk, that clock stops: every particle freezes where it is, turns deep red
  // and trembles very slightly with your voice. When you stop, the clock eases back up.
  const particleMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      ${SPRITE_VERT}
      attribute vec4 aOrbit;   // radius, angle, inclination, swirl speed
      attribute vec3 aWander;  // wander frequencies
      attribute vec3 aColor; attribute float aSize; attribute float aPhase;
      uniform float uTime, uPTime, uPSpread, uFlare, uTremble, uRed;
      varying vec3 vColor; varying float vAlpha; varying float vBlur;
      void main(){
        float t = uPTime;
        float r0 = aOrbit.x * uPSpread;
        float ang = aOrbit.y + t * aOrbit.w;
        // slow swirl around the being...
        vec3 p = vec3(cos(ang) * r0, sin(ang * 0.5 + aPhase) * (0.25 + aOrbit.x * 0.06), sin(ang) * r0);
        float ci = cos(aOrbit.z), si = sin(aOrbit.z);
        p = vec3(p.x, p.y * ci - p.z * si, p.y * si + p.z * ci);
        // ...plus a random wander, wider for the ones further out
        float amp = 0.2 + aOrbit.x * 0.1;
        p += vec3(sin(t * aWander.x + aPhase), sin(t * aWander.y + aPhase * 1.7), cos(t * aWander.z + aPhase * 0.6)) * amp;
        p.y += sin(t * 0.045 + aPhase * 2.0) * 0.08 * aOrbit.x;          // the far ones rise and sink slowly
        // speaking: the cloud breathes out with Jericho's voice
        p *= 1.0 + uFlare * 0.1 * (0.6 + 0.4 * sin(aPhase * 3.0 + uTime * 7.0));
        // listening: frozen, but trembling with your voice (real time, not the stopped clock)
        p += vec3(sin(uTime * 37.0 + aPhase * 11.0), sin(uTime * 43.0 + aPhase * 7.0), sin(uTime * 31.0 + aPhase * 5.0)) * uTremble * 0.03;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float dist = -mv.z;
        float energy;
        gl_PointSize = spriteSize(aSize * (1.0 + uFlare * 0.5 + uRed * 0.15), dist, vBlur, energy);
        gl_Position = projectionMatrix * mv;
        vec3 red = vec3(0.62, 0.025, 0.02) * (0.75 + 0.4 * fract(aPhase * 3.7)); // deep red
        vColor = mix(aColor, red, uRed);
        float twinkle = 0.55 + 0.45 * sin(t * 1.3 + aPhase * 5.0);
        float shimmer = 1.0 + uTremble * 0.45 * sin(uTime * 23.0 + aPhase * 13.0);
        vAlpha = twinkle * shimmer * smoothstep(0.5, 2.2, dist) * (1.0 + uFlare * 0.45) * energy;
      }`,
    fragmentShader: /* glsl */ `
      ${SPRITE_FRAG}
      uniform float uGlow, uRed; varying vec3 vColor; varying float vAlpha; varying float vBlur;
      void main(){
        float shape = spriteShape(gl_PointCoord, vBlur);
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float glow = (1.0 - smoothstep(0.2, 1.0, d)) * 0.3 * uRed;   // soft red glow around each point
        float a = (shape + glow) * vAlpha * (0.6 + uGlow * 0.6) * (1.0 + uRed * 0.15);
        gl_FragColor = vec4(vColor * a * 1.5, a);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  // The particles live outside the turning being, so when they freeze they really stand still.
  const cloud = new THREE.Group();
  scene.add(cloud);
  let particles = null;
  let builtCount = 0;
  function buildParticles() {
    const count = Math.round(7000 * TIERS[TIER_ORDER[tierIdx]].particles * particleScale);
    if (particles && count === builtCount) return;
    if (particles) {
      cloud.remove(particles);
      particles.geometry.dispose();
    }
    builtCount = count;
    const g = new THREE.BufferGeometry();
    const orbit = new Float32Array(count * 4);
    const wander = new Float32Array(count * 3);
    const color = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const band = Math.random();
      // close around the being, a middle cloud, and a sparse haze through the whole scene
      const r = band < 0.45 ? rand(1.2, 2.8) : band < 0.75 ? rand(2.8, 5) : rand(5, 13);
      const incl = r > 5 ? rand(-Math.PI, Math.PI) : rand(-1.4, 1.4) * (Math.random() < 0.6 ? 0.35 : 1);
      orbit.set([r, Math.random() * TAU, incl, (rand(0.12, 0.45) * (Math.random() < 0.5 ? -1 : 1)) / Math.sqrt(r)], i * 4);
      wander.set([rand(0.05, 0.22), rand(0.04, 0.18), rand(0.05, 0.2)], i * 3);
      const c = Math.random() < 0.04 ? (Math.random() < 0.5 ? TEAL : VIOLET) : GOLD.clone().lerp(Math.random() < 0.5 ? AMBER : PALE, Math.random());
      color.set([c.r, c.g, c.b], i * 3);
      // varied sizes: mostly fine dust, some motes, a few large glints
      const roll = Math.random();
      size[i] = (roll < 0.6 ? rand(0.8, 1.6) : roll < 0.96 ? rand(1.6, 3.0) : rand(3.5, 5.5)) * (r > 5 ? 0.85 : 1);
      phase[i] = Math.random() * TAU;
    }
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3)); // computed in the shader
    g.setAttribute("aOrbit", new THREE.BufferAttribute(orbit, 4));
    g.setAttribute("aWander", new THREE.BufferAttribute(wander, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    particles = new THREE.Points(g, particleMat);
    particles.frustumCulled = false;
    cloud.add(particles);
  }
  buildParticles();

  // ---- gyroscope: three thin gold rings close around the orb, each turning on its own axis,
  // with small bright beads travelling round them --------------------------------------------
  // fewer beads and rays on lower quality levels
  const DETAIL = {
    low: { beads: 2, rays: 10, bgLines: 0, ripples: 3 },
    medium: { beads: 3, rays: 16, bgLines: 3, ripples: 4 },
    high: { beads: 5, rays: 24, bgLines: 5, ripples: 6 },
    ultra: { beads: 7, rays: 32, bgLines: 7, ripples: 6 },
  };
  const gyroSpecs = [
    { r: 1.12, tube: 0.009, axis: new THREE.Vector3(1, 0, 0), tilt: [0.35, 0, 0.2], speed: 0.22 },
    { r: 1.24, tube: 0.008, axis: new THREE.Vector3(0, 1, 0), tilt: [1.3, 0.4, 0], speed: -0.17 },
    { r: 1.36, tube: 0.007, axis: new THREE.Vector3(0, 0, 1), tilt: [0.8, -0.9, 0.5], speed: 0.13 },
  ];
  const beadMat = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uBeadTime: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aAngle; attribute float aSpeed; attribute float aR; attribute float aSize;
      uniform float uBeadTime, uPixel, uLevel;
      varying float vA;
      void main(){
        float ang = aAngle + uBeadTime * aSpeed;
        vec4 mv = modelViewMatrix * vec4(cos(ang) * aR, sin(ang) * aR, 0.0, 1.0);
        float s = aSize * uPixel * (20.0 / -mv.z) * (1.0 + uLevel * 0.6);
        vA = 1.0;
        if (s < 1.6 * uPixel) { vA = s / (1.6 * uPixel); s = 1.6 * uPixel; } // never sub-pixel
        gl_PointSize = s;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGlow, uRed; varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = (exp(-d * d * 6.0) + exp(-d * d * 1.6) * 0.35) * (1.0 - smoothstep(0.85, 1.0, d)) * vA * (0.7 + uGlow * 0.5);
        vec3 col = mix(vec3(1.0, 0.86, 0.55), vec3(0.85, 0.08, 0.05), uRed * 0.85);
        gl_FragColor = vec4(col * a * 1.6, a);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const gyro = gyroSpecs.map((g) => {
    const pivot = new THREE.Group();
    pivot.rotation.set(...g.tilt);
    const spin = new THREE.Group(); // turns on the ring's own axis
    pivot.add(spin);
    const ringMesh = new THREE.Mesh(new THREE.TorusGeometry(g.r, g.tube, 8, mobile ? 256 : 512), ringMat(PALE, 0, g.r, g.tube));
    ringMesh.material.uniforms.uOpacity.value = 1.6; // a touch brighter than the outer rings
    spin.add(ringMesh);
    being.add(pivot);
    return { ...g, pivot, spin, beads: null };
  });
  let gyroBeadCount = 0;
  function buildGyroBeads() {
    const n = DETAIL[TIER_ORDER[tierIdx]].beads;
    if (n === gyroBeadCount) return;
    gyroBeadCount = n;
    for (const g of gyro) {
      if (g.beads) {
        g.spin.remove(g.beads);
        g.beads.geometry.dispose();
      }
      const angle = [];
      const speed = [];
      const radius = [];
      const size = [];
      for (let i = 0; i < n; i++) {
        angle.push((i / n) * TAU + rand(-0.3, 0.3));
        speed.push(rand(0.25, 0.5) * (Math.random() < 0.5 ? -1 : 1));
        radius.push(g.r);
        size.push(i === 0 ? 3.4 : rand(1.8, 2.6)); // one brighter lead bead per ring
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      geo.setAttribute("aAngle", new THREE.Float32BufferAttribute(angle, 1));
      geo.setAttribute("aSpeed", new THREE.Float32BufferAttribute(speed, 1));
      geo.setAttribute("aR", new THREE.Float32BufferAttribute(radius, 1));
      geo.setAttribute("aSize", new THREE.Float32BufferAttribute(size, 1));
      g.beads = new THREE.Points(geo, beadMat);
      g.beads.frustumCulled = false;
      g.spin.add(g.beads);
    }
  }

  // ---- soft light rays: a fan of faint gold beams turning slowly behind the orb, like a halo ----
  const rayMat = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uRays: { value: 24 }, uRayRot: { value: 0 }, uRayStrength: { value: 0.1 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uRays, uRayRot, uRayStrength, uRed, uLevel;
      varying vec2 vUv;
      float hash(float n){ return fract(sin(n * 127.1) * 43758.5453); }
      void main(){
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float ang = atan(p.y, p.x) + uRayRot;
        float slot = ang / 6.28318 * uRays;
        float id = floor(slot);
        float f = fract(slot) - 0.5;
        float width = 0.06 + 0.08 * hash(id);                     // thin beams of varied width
        float beam = smoothstep(width, 0.0, abs(f));
        float len = 0.55 + 0.45 * hash(id + 7.0);                  // and varied length
        float radial = smoothstep(0.12, 0.3, r) * (1.0 - smoothstep(len * 0.6, len, r));
        float a = beam * radial * (0.5 + 0.5 * hash(id + 3.0)) * uRayStrength * (1.0 + uLevel * 0.8);
        vec3 col = mix(vec3(1.0, 0.78, 0.42), vec3(0.85, 0.08, 0.05), uRed * 0.85);
        gl_FragColor = vec4(col * a, a);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const rays = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), rayMat);
  rays.renderOrder = -1; // drawn first, behind the orb
  scene.add(rays);
  function applyDetail() {
    const d = DETAIL[TIER_ORDER[tierIdx]];
    rayMat.uniforms.uRays.value = d.rays;
    buildGyroBeads();
    bg.lines.material.uniforms.uLines.value = d.bgLines;
    bg.lines.visible = d.bgLines > 0;
    bg.rippleCount = d.ripples;
  }

  // ---- reactive background: a perspective grid of light under the orb, faint energy lines
  // behind it. Jericho's voice sends ripples of light out across the grid. The lines run on
  // their own clock, which stops (and they turn red) exactly when the particles freeze.
  // Kept dim so the text stays readable. Fewer lines on Low and Medium.
  const MAX_RIPPLES = 6;
  const bg = {
    ripples: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector2(0, 0)), // radius, strength
    rippleCount: 4,
    clock: 0,
    fade: 1,
  };
  const gridMat = new THREE.ShaderMaterial({
    uniforms: {
      uRed: uniforms.uRed,
      uGlow: uniforms.uGlow,
      uIntensity: { value: 0.0 },
      uRipples: { value: bg.ripples },
      uClock: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uRed, uGlow, uIntensity, uClock; uniform vec2 uRipples[${MAX_RIPPLES}];
      varying vec3 vWorld;
      float lineAA(vec2 p){ vec2 g = abs(fract(p - 0.5) - 0.5) / max(fwidth(p), vec2(1e-4)); return 1.0 - min(min(g.x, g.y), 1.0); }
      void main(){
        vec2 p = vWorld.xz;
        float d = length(p);
        float grid = lineAA(p * 0.5);                        // 2-unit cells, always about a pixel wide
        float major = lineAA(p * 0.1) * 0.6;                 // every fifth line a little brighter
        float circle = 1.0 - min(abs(fract(d * 0.25 + uClock * 0.02) - 0.5) / max(fwidth(d * 0.25), 1e-4), 1.0); // faint rings
        float rip = 0.0;
        for (int i = 0; i < ${MAX_RIPPLES}; i++) {
          vec2 r = uRipples[i];
          if (r.y <= 0.001) continue;
          rip += exp(-pow((d - r.x) * 1.4, 2.0)) * r.y;
        }
        float fade = smoothstep(30.0, 7.0, d) * smoothstep(1.2, 3.5, d);   // fades far away and right under the orb
        float light = (max(grid, major) * (0.55 + rip * 4.0) + circle * 0.18 + rip * 0.12) * fade;
        vec3 col = mix(vec3(1.0, 0.74, 0.36), vec3(0.85, 0.08, 0.05), uRed * 0.85);
        float a = light * uIntensity * (0.7 + uGlow * 0.4);
        gl_FragColor = vec4(col * a, a);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  bg.grid = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), gridMat);
  bg.grid.rotation.x = -Math.PI / 2;
  bg.grid.position.y = -2.7;
  bg.grid.renderOrder = -3;
  bg.grid.frustumCulled = false;
  scene.add(bg.grid);

  const linesMat = new THREE.ShaderMaterial({
    uniforms: { uRed: uniforms.uRed, uLevel: uniforms.uLevel, uIntensity: { value: 0 }, uClock: { value: 0 }, uLines: { value: 5 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uRed, uLevel, uIntensity, uClock; uniform int uLines; varying vec2 vUv;
      void main(){
        float x = vUv.x * 2.0 - 1.0;
        float y = vUv.y * 2.0 - 1.0;
        float px = fwidth(y);
        float sum = 0.0;
        for (int i = 0; i < 7; i++) {
          if (i >= uLines) break;
          float fi = float(i);
          float base = -0.55 + fi * 0.18 + 0.05 * sin(fi * 2.3);
          float yy = base + 0.09 * sin(x * (2.2 + fi * 0.37) + uClock * (0.35 + fi * 0.05) + fi * 1.7)
                          + 0.035 * sin(x * (6.1 - fi * 0.4) - uClock * 0.6 + fi);
          float dy = abs(y - yy);
          float core = 1.0 - smoothstep(px * 0.6, px * 1.8, dy);           // a crisp hair-line
          float glow = exp(-dy * dy / 0.0012) * 0.25;
          float travel = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(x * 5.0 - uClock * 1.4 + fi * 2.1), 3.0); // light running along it
          sum += (core + glow) * travel * (0.6 + 0.4 * fract(fi * 0.618));
        }
        float edge = smoothstep(1.0, 0.55, abs(x)) * smoothstep(1.0, 0.6, abs(y));
        vec3 col = mix(vec3(1.0, 0.76, 0.38), vec3(0.85, 0.08, 0.05), uRed * 0.85);
        float a = sum * edge * uIntensity * (1.0 + uLevel * 0.8);
        gl_FragColor = vec4(col * a, a);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  bg.lines = new THREE.Mesh(new THREE.PlaneGeometry(46, 20), linesMat);
  bg.lines.renderOrder = -2;
  bg.lines.frustumCulled = false;
  scene.add(bg.lines);
  function spawnRipple(strength) {
    let slot = -1;
    for (let i = 0; i < bg.rippleCount; i++) if (bg.ripples[i].y <= 0.001) { slot = i; break; }
    if (slot < 0) {
      slot = 0;
      for (let i = 1; i < bg.rippleCount; i++) if (bg.ripples[i].x > bg.ripples[slot].x) slot = i; // reuse the oldest
    }
    bg.ripples[slot].set(1.5, Math.min(1, 0.35 + strength * 0.65));
  }

  // ---- speech pulses: glowing ring waves that spread from the orb with Jericho's voice ----------
  const PULSES = mobile ? 5 : 8;
  const pulseGeo = new THREE.PlaneGeometry(1, 1);
  const pulses = Array.from({ length: PULSES }, () => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uAlpha: { value: 0 }, uRed: uniforms.uRed },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uAlpha, uRed; varying vec2 vUv;
        void main(){
          float r = length(vUv * 2.0 - 1.0);
          float ring = exp(-pow((r - 0.9) * 30.0, 2.0)) + exp(-pow((r - 0.9) * 10.0, 2.0)) * 0.12; // thin line + a little glow
          float a = ring * uAlpha;
          vec3 col = mix(vec3(1.0, 0.82, 0.5), vec3(0.85, 0.08, 0.05), uRed * 0.85);
          gl_FragColor = vec4(col * a, a);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const m = new THREE.Mesh(pulseGeo, mat);
    m.visible = false;
    m.userData = { age: 1, strength: 0 };
    scene.add(m);
    return m;
  });
  let pulseTimer = 0;
  let lastPulseLevel = 0;
  function spawnPulse(strength) {
    const p = pulses.find((x) => x.userData.age >= 1) || pulses.reduce((a, b) => (a.userData.age > b.userData.age ? a : b));
    p.userData.age = 0;
    p.userData.strength = Math.min(1, strength);
    p.visible = true;
  }

  // ---- energy arcs (thinking) ----------------------------------------------------
  const ARCS = mobile ? 5 : 8;
  const ARC_SEG = 18;
  const arcGeo = new THREE.BufferGeometry();
  const arcPos = new Float32Array(ARCS * (ARC_SEG - 1) * 2 * 3);
  arcGeo.setAttribute("position", new THREE.BufferAttribute(arcPos, 3));
  const arcMat = new THREE.LineBasicMaterial({ color: new THREE.Color(1.6, 1.4, 1.0), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const arcLines = new THREE.LineSegments(arcGeo, arcMat);
  arcLines.frustumCulled = false;
  being.add(arcLines);
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  function ringPoint(ring, angle, out) {
    out.set(Math.cos(angle) * ring.r, Math.sin(angle) * ring.r, 0);
    return ring.mesh.localToWorld(out);
  }
  function rebuildArcs() {
    let o = 0;
    for (let a = 0; a < ARCS; a++) {
      const r1 = rings[Math.floor(Math.random() * rings.length)];
      let r2 = rings[Math.floor(Math.random() * rings.length)];
      if (r2 === r1) r2 = rings[(rings.indexOf(r1) + 1) % rings.length];
      ringPoint(r1, Math.random() * TAU, tmpA);
      ringPoint(r2, Math.random() * TAU, tmpB);
      being.worldToLocal(tmpA);
      being.worldToLocal(tmpB);
      let prev = tmpA.clone();
      for (let i = 1; i < ARC_SEG; i++) {
        const f = i / (ARC_SEG - 1);
        const p = tmpA.clone().lerp(tmpB, f);
        if (i < ARC_SEG - 1) p.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(0.16 * Math.sin(f * Math.PI)));
        arcPos.set([prev.x, prev.y, prev.z, p.x, p.y, p.z], o);
        o += 6;
        prev = p;
      }
    }
    arcGeo.attributes.position.needsUpdate = true;
  }

  // ---- calling: slow outward ripples -------------------------------------------
  const rippleMat = () =>
    new THREE.MeshBasicMaterial({ color: 0x8ff0e4, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ripples = [0, 1, 2].map((i) => {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 256), rippleMat());
    m.rotation.x = -Math.PI / 2 + 0.25;
    m.userData.offset = i / 3;
    being.add(m);
    return m;
  });
  const callGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x5fe6d6, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  callGlow.scale.setScalar(9);
  being.add(callGlow);

  // ---- camera: slow drifting orbit, drag/pinch/scroll, parallax -------------------
  const cam = { theta: 0.6, phi: 1.25, radius: 10.5, targetRadius: 10.5, vTheta: 0, vPhi: 0, baseRadius: 8.2 };
  const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
  let dragging = false;
  let userActive = 0;

  // ---- quality level + post-processing ---------------------------------------------
  let pipeline = null; // built after the first frame, so the page shows something at once
  let size = { w: 1, h: 1 };
  function applyTier() {
    const name = TIER_ORDER[tierIdx];
    const cfg = TIERS[name];
    renderer.setPixelRatio(pixelRatioFor(name, size.w, size.h));
    renderer.setSize(size.w, size.h, false);
    uniforms.uPixel.value = renderer.getPixelRatio();
    uniforms.uViewH.value = size.h * renderer.getPixelRatio();
    uniforms.uDof.value = cfg.dof * (reducedMotion ? 0.8 : 1);
    uniforms.uOctaves.value = cfg.octaves;
    buildParticles();
    applyDetail();
    if (pipeline) {
      pipeline.dispose();
      pipeline = createPipeline(renderer, scene, camera, name, size.w, size.h);
    }
    document.body.dataset.quality = name;
    opts.onQuality?.(name);
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    size = { w, h };
    renderer.setPixelRatio(pixelRatioFor(TIER_ORDER[tierIdx], w, h));
    renderer.setSize(w, h, false); // the canvas is sized by CSS; the drawing buffer matches it exactly
    uniforms.uPixel.value = renderer.getPixelRatio();
    uniforms.uViewH.value = h * renderer.getPixelRatio();
    camera.aspect = w / h;
    // portrait phones: pull back so the whole being fits
    cam.baseRadius = w < h ? 11.5 : 8.2;
    camera.updateProjectionMatrix();
    pipeline?.setSize(w, h);
  }
  resize();
  cam.radius = cam.targetRadius = cam.baseRadius;
  window.addEventListener("resize", resize);
  // moving the window to a screen with a different pixel density
  let dprQuery = null;
  function watchDpr() {
    dprQuery?.removeEventListener("change", onDpr);
    dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    dprQuery.addEventListener("change", onDpr);
  }
  function onDpr() {
    resize();
    watchDpr();
  }
  watchDpr();
  applyTier();

  // ---- state ---------------------------------------------------------------------
  let mode = "off";
  // particle freeze while you talk
  // "You're speaking" = a clearly loud mic, or the level jumping up (each burst of speech
  // does that). The level fades slowly afterwards, so a fading level means you've stopped.
  const TALK_LOUD = 0.15;
  const TALK_RISE = 0.015;
  let talkHold = 0;
  let prevMic = 0;
  const fx = { freeze: 0, red: 0, tremble: 0, flare: 0, spread: 1 };
  let calling = false;
  let micLevel = 0;
  let speech = { analyser: null, fake: false };
  let freq = null;
  let fakeLevel = 0;
  const look = { ...LOOKS.off, calling: 0, level: 0 };
  let last = performance.now();
  let arcTimer = 0;
  let running = true;
  // the startup sequence: { start, delay, dur } in ms, null when not booting
  let boot = null;
  let alarmOn = false; // a ringing alarm: the orb pulses red and gold
  const smooth = (a, b, x) => {
    const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };
  const coreScreen = new THREE.Vector3();
  const light = new THREE.Vector2(0.5, 0.5);

  // Auto quality: measure the frame rate in 2-second windows and step up or down.
  const auto = { start: performance.now(), frames: 0, time: 0, goodWindows: 0, failed: new Set(), fps: 0 };
  function setTier(idx) {
    if (idx === tierIdx) return;
    tierIdx = idx;
    applyTier();
    auto.start = performance.now();
    auto.frames = auto.time = auto.goodWindows = 0;
  }
  function measure(now, raw) {
    if (document.hidden || raw > 3000) {
      auto.frames = auto.time = 0; // tab was hidden: don't count that gap
      return;
    }
    if (now - auto.start < 2000) return; // let a new level settle first
    auto.frames++;
    auto.time += raw;
    if (auto.time < 2000) return;
    const fps = (auto.frames * 1000) / auto.time;
    auto.fps = fps;
    auto.frames = auto.time = 0;
    if (quality !== "auto") return;
    if (fps < 50 && tierIdx > 0) {
      auto.failed.add(tierIdx); // don't try this level again this visit
      setTier(tierIdx - 1);
    } else if (fps >= 57) {
      auto.goodWindows++;
      const next = tierIdx + 1;
      if (auto.goodWindows >= 3 && next <= maxTier && !auto.failed.has(next)) setTier(next);
    } else {
      auto.goodWindows = 0;
    }
  }

  function voiceLevel(t) {
    if (speech.analyser) {
      if (!freq || freq.length !== speech.analyser.frequencyBinCount) freq = new Uint8Array(speech.analyser.frequencyBinCount);
      speech.analyser.getByteFrequencyData(freq);
      let sum = 0;
      const n = Math.floor(freq.length * 0.5);
      for (let i = 0; i < n; i++) sum += freq[i];
      return Math.min(1, (sum / n / 255) * 2.4);
    }
    if (speech.fake) {
      const target = 0.45 + 0.25 * Math.sin(t * 7.3) * Math.sin(t * 2.1) + 0.15 * Math.sin(t * 13.7);
      fakeLevel += (target - fakeLevel) * 0.15;
      return fakeLevel;
    }
    return 0;
  }

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const raw = now - last; // real time since the last frame, in ms
    const dt = Math.min(0.05, raw / 1000);
    const realDt = Math.min(0.25, raw / 1000);
    last = now;
    const t = now / 1000;
    const motion = reducedMotion ? 0.3 : 1;
    if (pipeline) measure(now, raw);

    // ease every look value toward the current state (never snaps)
    const target = LOOKS[mode] || LOOKS.idle;
    const k = 1 - Math.exp(-dt * 2.2);
    for (const key of Object.keys(target)) look[key] += (target[key] - look[key]) * k;
    look.calling += ((calling ? 1 : 0) - look.calling) * (1 - Math.exp(-dt * 1.2));
    const rawLevel = mode === "speaking" ? voiceLevel(t) : mode === "active" || mode === "confirm" ? Math.min(1, micLevel * 2.5) * 0.7 : 0;
    const lk = rawLevel > look.level ? 1 - Math.exp(-dt * 18) : 1 - Math.exp(-dt * 6);
    look.level += (rawLevel - look.level) * lk;
    const level = look.level * (reducedMotion ? 0.5 : 1);

    // ---- startup: a point of light, a flash, the orb grows, the rings spin up -----------------
    let bootK = 1;
    if (boot) {
      bootK = Math.max(0, (now - boot.start - boot.delay) / boot.dur);
      if (bootK >= 1) boot = null;
    }
    const grow = boot ? smooth(0.12, 0.55, bootK) : 1;
    const flash = boot ? Math.exp(-Math.pow((bootK - BOOT_FLASH_AT) / 0.045, 2)) : 0; // lands on the power-up chime
    const spinUp = boot ? 1 + 7 * Math.sin(Math.PI * smooth(0.15, 1.0, bootK)) : 1;
    // overshoot a little, like something powering on
    const scaleIn = boot ? Math.max(0.035, grow + Math.sin(grow * Math.PI) * 0.08) : 1;
    being.scale.setScalar(scaleIn);

    uniforms.uTime.value = t;
    uniforms.uGlow.value = look.glow * (0.6 + 0.4 * glowScale) + look.calling * 0.2;
    uniforms.uBreath.value = look.breath;
    uniforms.uLevel.value = level * (0.4 + 0.6 * look.pulse) + (mode === "active" ? level * 0.6 : 0);
    uniforms.uSwirl.value = look.swirl;
    uniforms.uSpread.value = look.spread + look.calling * 0.08;

    // Particles: freeze and turn red the moment you start talking while Jericho listens;
    // thaw back to gold over about half a second after you stop.
    const listening = mode === "active" || mode === "confirm";
    const rising = micLevel - prevMic > TALK_RISE;
    prevMic = micLevel;
    if (listening && (micLevel > TALK_LOUD || rising)) talkHold = 0.4; // hold through the gaps between words (phones report speech in bursts)
    else talkHold = Math.max(0, talkHold - realDt);
    const talking = listening && talkHold > 0;
    // real elapsed time, so the timings hold even on a slow device
    const ease = (v, to, rate) => v + (to - v) * (1 - Math.exp(-realDt * rate));
    fx.freeze = ease(fx.freeze, talking ? 1 : 0, talking ? 30 : 6); // ~0.1s to stop, ~0.5s to drift again
    fx.red = ease(fx.red, talking ? 1 : 0, talking ? 14 : 6);
    fx.tremble = ease(fx.tremble, talking ? Math.min(1, micLevel * 2.5) : 0, 20) * (reducedMotion ? 0.6 : 1);
    fx.flare = ease(fx.flare, mode === "speaking" ? level : 0, mode === "speaking" ? 20 : 5);
    // the drift clock: slower in reduced motion, faster while thinking, stopped while frozen
    const drift = dt * motion * (0.6 + look.swirl * 0.6) * (1 - fx.freeze);
    uniforms.uPTime.value += drift;
    fx.spread = ease(fx.spread, look.spread + look.calling * 0.06, 2 * (1 - fx.freeze)); // no shrinking while frozen
    uniforms.uPSpread.value = fx.spread;
    uniforms.uRed.value = fx.red;
    uniforms.uTremble.value = fx.tremble;
    uniforms.uFlare.value = fx.flare;
    if (alarmOn) {
      // pulse between gold and red about once a second, with a beat in the glow
      const a = 0.5 + 0.5 * Math.sin(t * 6.3);
      uniforms.uRed.value = Math.max(fx.red, a * 0.9);
      uniforms.uFlare.value = Math.max(fx.flare, 0.25 + a * 0.35);
      uniforms.uLevel.value = Math.max(uniforms.uLevel.value, 0.2 + a * 0.4);
    }
    cloud.rotation.y += drift * 0.05; // the whole cloud turns slowly too
    cloud.rotation.x = Math.sin(uniforms.uPTime.value * 0.02) * 0.15;

    // core + halos
    const breathe = 0.5 + 0.5 * Math.sin(t * 1.1 * motion);
    halo.material.opacity = (0.16 + 0.22 * look.glow + 0.12 * breathe * look.breath + level * 0.15) * (0.5 + 0.5 * glowScale) * (pipeline?.bloom ? 0.7 : 1.3); // without bloom the halo does more of the glowing
    halo.scale.setScalar(5 + breathe * 0.6 * look.breath + level * 1.0);
    halo.material.color.copy(HALO_GOLD).lerp(HALO_RED, fx.red * 0.6);
    halo.material.opacity *= 1 - fx.red * 0.35; // a deeper, less hazy red
    heart.material.color.copy(HEART_GOLD).lerp(HEART_RED, fx.red * 0.85);
    heart.material.opacity = Math.min(1, 0.5 + 0.4 * look.glow + level * 0.3) * (1 - fx.red * 0.3);
    heart.scale.setScalar(1.9 + breathe * 0.25 * look.breath + level * 0.6);
    core.rotation.y += dt * 0.15 * motion;

    // calm: slow in idle, slower still (and red) while you talk
    const calm = (1 - fx.red * 0.75) * motion;

    // gyroscope: each ring turns on its own axis, beads travel round them
    const gyroSpeed = (0.45 + look.ringSpeed * 0.55) * calm;
    for (const g of gyro) {
      g.spin.rotateOnAxis(g.axis, dt * g.speed * gyroSpeed * (boot ? spinUp : 1));
      g.pivot.rotation.y += dt * 0.02 * Math.sign(g.speed) * calm;
    }
    beadMat.uniforms.uBeadTime.value += dt * gyroSpeed;

    // soft rays: a billboard behind the orb, facing the camera, turning slowly
    rays.quaternion.copy(camera.quaternion);
    rays.position.copy(camera.position).normalize().multiplyScalar(-0.6);
    rayMat.uniforms.uRayRot.value += dt * 0.035 * calm;
    rayMat.uniforms.uRayStrength.value = (0.11 + look.glow * 0.07 + level * 0.04) * (0.6 + 0.4 * glowScale) * (1 - fx.red * 0.3);

    // speech pulses: ring waves that spread out in time with Jericho's voice, then fade
    pulseTimer -= dt;
    if (mode === "speaking" && level > 0.12) {
      const peak = level - lastPulseLevel > 0.15;
      if (pulseTimer <= 0 || peak) {
        spawnPulse(level);
        spawnRipple(level); // and a ripple of light across the grid
        pulseTimer = (0.22 + (1 - level) * 0.3) * (reducedMotion ? 2.5 : 1);
      }
    }
    lastPulseLevel = level;
    for (const pz of pulses) {
      if (!pz.visible) continue;
      pz.userData.age += dt / (reducedMotion ? 2.4 : 1.6);
      const age = pz.userData.age;
      if (age >= 1) {
        pz.visible = false;
        continue;
      }
      pz.quaternion.copy(camera.quaternion);
      pz.scale.setScalar(2.2 + age * 8);
      pz.material.uniforms.uAlpha.value = (0.25 + pz.userData.strength * 0.35) * (1 - age) * (1 - age) * glowScale;
    }

    // (the startup values are worked out at the top of the frame)
    if (boot) {
      heart.scale.multiplyScalar(1 + flash * 26 + (1 - grow) * 3);
      heart.material.opacity = Math.min(1, heart.material.opacity + flash + (bootK < 0.12 ? 0.6 : 0));
      halo.material.opacity *= grow + flash * 2;
      uniforms.uPSpread.value *= 0.04 + 0.96 * smooth(0.14, 0.85, bootK);
    }

    // ---- background grid, ripples and energy lines --------------------------------------------
    bg.fade = boot ? smooth(0.45, 1.0, bootK) : Math.min(1, bg.fade + dt);
    bg.clock += dt * motion * (1 - fx.freeze); // stops when the particles freeze
    gridMat.uniforms.uClock.value = bg.clock;
    linesMat.uniforms.uClock.value = bg.clock;
    const dim = (0.6 + 0.4 * glowScale) * bg.fade * (1 - fx.red * 0.2);
    gridMat.uniforms.uIntensity.value = 0.3 * dim * (1 + look.calling * 0.3);
    linesMat.uniforms.uIntensity.value = 0.3 * dim * (0.85 + look.glow * 0.3);
    gridMat.uniforms.uRed.value = fx.red;
    // fade the floor out when the camera is turned underneath it
    gridMat.uniforms.uIntensity.value *= smooth(-2.0, 0.5, camera.position.y);
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const r = bg.ripples[i];
      if (r.y <= 0.001) continue;
      if (i >= bg.rippleCount) {
        r.y = 0;
        continue;
      }
      // ripples travel outward at ~6 units/s (slower with reduced motion) and fade as they go;
      // they stop where they are while the scene is frozen
      r.x += dt * (reducedMotion ? 2.5 : 6) * (1 - fx.freeze);
      r.y *= Math.exp(-dt * (reducedMotion ? 0.9 : 0.55));
      if (r.x > 34 || r.y < 0.01) r.y = 0;
    }
    // the lines hang far behind the orb, facing the camera
    bg.lines.quaternion.copy(camera.quaternion);
    bg.lines.position.copy(camera.position).normalize().multiplyScalar(-13);

    // rings at their own speeds and depths
    rings.forEach((ring, i) => {
      if (boot) ring.mesh.scale.setScalar(smooth(0.2 + i * 0.07, 0.5 + i * 0.07, bootK));
    });
    for (const ring of rings) {
      ring.mesh.rotation.z += dt * ring.speed * look.ringSpeed * (1 - fx.red * 0.75) * motion * spinUp;
      ring.pivot.rotation.y += dt * 0.03 * ring.speed * motion;
      const ringIn = boot ? Math.max(0.001, ring.mesh.scale.x) : 1;
      ring.mesh.scale.setScalar(ringIn * (1 + level * 0.06 * Math.sign(ring.speed) + look.calling * 0.03 * Math.sin(t * 1.5 + ring.r)));
    }

    // arcs crackle while thinking
    arcTimer -= dt;
    if (look.arcs > 0.05 && arcTimer <= 0) {
      rebuildArcs();
      arcTimer = reducedMotion ? 0.5 : rand(0.06, 0.16);
    }
    arcMat.opacity = look.arcs * (0.35 + Math.random() * 0.5) * (reducedMotion ? 0.5 : 1);

    // calling: slow rings expanding outward, with a teal shimmer
    for (const r of ripples) {
      const p = (t * 0.22 * motion + r.userData.offset) % 1;
      r.scale.setScalar(1.2 + p * 7);
      r.material.opacity = look.calling * (1 - p) * 0.5;
    }
    callGlow.material.opacity = look.calling * (0.12 + 0.06 * Math.sin(t * 1.6));

    being.rotation.y += dt * 0.05 * motion;
    stars.rotation.y += dt * 0.004 * motion;
    stars.rotation.x += dt * 0.0015 * motion;

    // camera: drift, momentum from drags, zoom, parallax
    userActive = Math.max(0, userActive - dt);
    if (!dragging) {
      cam.theta += cam.vTheta;
      cam.phi += cam.vPhi;
      cam.vTheta *= 0.94;
      cam.vPhi *= 0.94;
      if (userActive <= 0) cam.theta += dt * 0.05 * motion;
    }
    cam.phi = Math.min(2.6, Math.max(0.45, cam.phi + Math.sin(t * 0.13) * 0.0006 * motion));
    cam.radius += (cam.targetRadius - cam.radius) * (1 - Math.exp(-dt * 5));
    parallax.x += (parallax.tx - parallax.x) * (1 - Math.exp(-dt * 3));
    parallax.y += (parallax.ty - parallax.y) * (1 - Math.exp(-dt * 3));
    const th = cam.theta + parallax.x * 0.18;
    const ph = cam.phi + parallax.y * 0.12;
    camera.position.set(cam.radius * Math.sin(ph) * Math.sin(th), cam.radius * Math.cos(ph), cam.radius * Math.sin(ph) * Math.cos(th));
    camera.lookAt(0, camera.aspect < 1 ? -0.9 : -0.45, 0); // portrait: being sits a little higher, above the chat
    uniforms.uFocus.value = cam.radius; // focus on the being; nearer and further particles blur gently

    if (pipeline) {
      // where the core is on screen, for the light shafts and lens flare
      coreScreen.set(0, 0, 0).project(camera);
      light.set(coreScreen.x * 0.5 + 0.5, coreScreen.y * 0.5 + 0.5);
      const onScreen = coreScreen.z < 1 && Math.abs(coreScreen.x) < 1.2 && Math.abs(coreScreen.y) < 1.2 ? 1 : 0;
      pipeline.render({
        // a little less bloom while red, so the red stays red instead of washing out to white
        bloom: (0.55 + look.glow * 0.3 + level * 0.25 + look.calling * 0.15) * glowScale * (1 - fx.red * 0.35) * (1 + flash * 1.6),
        light,
        lightVisible: onScreen,
        rays: (0.25 + look.glow * 0.15) * (1 - fx.red * 0.5) * glowScale, // the soft ray fan now does most of this
        flare: (0.4 + look.glow * 0.4 + level * 0.3) * (1 - fx.red * 0.6),
        time: t,
      });
    } else {
      renderer.render(scene, camera); // first frames: plain render while the effects get built
    }
  }

  // ---- input -------------------------------------------------------------------------
  const pointers = new Map();
  let pinchStart = 0;
  let tap = null;
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    tap = pointers.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
    dragging = true;
    userActive = 4;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) {
      // mouse hover: gentle parallax
      parallax.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      parallax.ty = (e.clientY / window.innerHeight - 0.5) * 2;
      return;
    }
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 1) {
      cam.vTheta = -dx * 0.005;
      cam.vPhi = -dy * 0.004;
      cam.theta += cam.vTheta;
      cam.phi += cam.vPhi;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart) cam.targetRadius = Math.min(22, Math.max(5, cam.targetRadius * (pinchStart / dist)));
      pinchStart = dist;
    }
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) dragging = false;
    if (tap && e.type === "pointerup" && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 8 && performance.now() - tap.t < 350) {
      opts.onTap?.();
    }
    tap = null;
  };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      cam.targetRadius = Math.min(22, Math.max(5, cam.targetRadius * (1 + Math.sign(e.deltaY) * 0.08)));
      userActive = 4;
    },
    { passive: false },
  );
  function onTilt(e) {
    if (e.gamma == null) return;
    parallax.tx = Math.max(-1, Math.min(1, e.gamma / 30));
    parallax.ty = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
  }
  window.addEventListener("deviceorientation", onTilt);

  // Compile the shaders without freezing the page (where the browser supports it),
  // draw the first frame, then build the heavy effects.
  try {
    await renderer.compileAsync(scene, camera);
  } catch {
    /* falls back to compiling on first draw */
  }
  requestAnimationFrame((now) => {
    last = now;
    frame(now);
    setTimeout(() => {
      if (!running) return;
      pipeline = createPipeline(renderer, scene, camera, TIER_ORDER[tierIdx], size.w, size.h);
      auto.start = performance.now();
    }, 0);
  });

  return {
    setState(s) {
      mode = s;
    },
    /** Startup sequence: the orb powers on from a point after `delay` ms, over `dur` ms. */
    boot({ delay = 0, dur = 3800 } = {}) {
      if (reducedMotion) {
        boot = null;
        return;
      }
      boot = { start: performance.now(), delay, dur };
      bg.fade = 0;
    },
    /** A ringing alarm: pulse red and gold (also wakes the orb if it's still waiting for the first tap). */
    setAlarm(on) {
      alarmOn = Boolean(on);
      if (alarmOn && boot && boot.delay > 1e9) boot = null;
    },
    /** Before power-on: the orb waits as a single point of light. */
    hold() {
      if (reducedMotion) return;
      boot = { start: performance.now(), delay: 1e12, dur: 1 };
      bg.fade = 0;
    },
    setMicLevel(v) {
      micLevel = v;
    },
    setSpeechSource(analyser, fake = false) {
      speech = { analyser, fake };
    },
    setCalling(on) {
      calling = Boolean(on);
    },
    setGlow(v) {
      glowScale = v;
    },
    setParticles(v) {
      particleScale = v;
      buildParticles();
    },
    /** "auto" | "low" | "medium" | "high" | "ultra" */
    setQuality(q) {
      quality = q;
      auto.failed.clear();
      if (q === "auto") setTier(Math.min(tierIdx, maxTier));
      else setTier(TIER_ORDER.indexOf(q));
    },
    /** Current level and measured frame rate, for the settings panel. */
    info() {
      return {
        quality,
        tier: TIER_ORDER[tierIdx],
        fps: auto.fps,
        pixelRatio: renderer.getPixelRatio(),
        width: Math.round(size.w * renderer.getPixelRatio()),
        height: Math.round(size.h * renderer.getPixelRatio()),
        msaa: pipeline?.samples ?? 0,
      };
    },
    /** Read-only numbers for checking the effects (open the page with ?debug). */
    stats() {
      return { particleClock: uniforms.uPTime.value, freeze: fx.freeze, red: fx.red, tremble: fx.tremble, flare: fx.flare, mic: micLevel };
    },
    dispose() {
      running = false;
      window.removeEventListener("resize", resize);
      window.removeEventListener("deviceorientation", onTilt);
      dprQuery?.removeEventListener("change", onDpr);
      pipeline?.dispose();
      renderer.dispose();
    },
  };
}

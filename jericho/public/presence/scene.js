// The 3D presence: a luminous gold organism built from a pulsing core, tilted rings,
// orbiting particles and rippling tendrils, floating in a starfield.
// It only *shows* state: the app tells it the mode, mic level and voice analyser.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const TAU = Math.PI * 2;
const GOLD = new THREE.Color(0xf2b950);
const AMBER = new THREE.Color(0xff8a2a);
const PALE = new THREE.Color(0xfff1cc);
const TEAL = new THREE.Color(0x3fd6c8);
const VIOLET = new THREE.Color(0x9a6bff);

// Ashima/Stefan Gustavson simplex noise (MIT), used to make the core and tendrils feel organic.
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
  off: { glow: 0.25, breath: 0.25, ringSpeed: 0.12, arcs: 0, lean: 0, pulse: 0, ripple: 0, swirl: 0.15, spread: 1.0 },
  idle: { glow: 0.45, breath: 1, ringSpeed: 0.25, arcs: 0, lean: 0, pulse: 0, ripple: 0, swirl: 0.3, spread: 1.0 },
  active: { glow: 0.8, breath: 0.6, ringSpeed: 0.4, arcs: 0, lean: 1, pulse: 0, ripple: 0, swirl: 0.45, spread: 0.92 },
  confirm: { glow: 0.85, breath: 0.6, ringSpeed: 0.35, arcs: 0, lean: 0.7, pulse: 0, ripple: 0, swirl: 0.4, spread: 0.95 },
  thinking: { glow: 0.85, breath: 0.3, ringSpeed: 2.2, arcs: 1, lean: 0.3, pulse: 0, ripple: 0, swirl: 1.1, spread: 0.9 },
  speaking: { glow: 1.0, breath: 0.2, ringSpeed: 0.6, arcs: 0, lean: 0, pulse: 1, ripple: 0, swirl: 0.6, spread: 1.05 },
};

function makeGlowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,244,214,1)");
  grad.addColorStop(0.25, "rgba(255,200,110,0.55)");
  grad.addColorStop(0.6, "rgba(220,140,50,0.12)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const rand = (a, b) => a + Math.random() * (b - a);

export function createScene(canvas, opts) {
  const { lowPower, reducedMotion } = opts;
  let glowScale = opts.glow ?? 1;
  let particleScale = opts.particles ?? 1;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, powerPreference: "high-performance", alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.setClearColor(0x050403, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050403, 0.045);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);
  const being = new THREE.Group();
  scene.add(being);

  const uniforms = {
    uTime: { value: 0 },
    uGlow: { value: 0.5 },
    uBreath: { value: 1 },
    uLevel: { value: 0 }, // voice or mic loudness, 0..1
    uLean: { value: 0 },
    uSwirl: { value: 0.3 },
    uSpread: { value: 1 },
    uPixel: { value: renderer.getPixelRatio() },
    uMotion: { value: reducedMotion ? 0.3 : 1 },
  };

  // ---- starfield ----------------------------------------------------------------
  const starCount = lowPower ? 900 : 2600;
  const starGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(starCount * 3);
  const sc = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = rand(25, 90);
    const th = Math.random() * TAU;
    const ph = Math.acos(rand(-1, 1));
    sp.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i * 3);
    const c = Math.random() < 0.06 ? (Math.random() < 0.5 ? TEAL : VIOLET) : PALE.clone().lerp(GOLD, Math.random() * 0.6);
    sc.set([c.r, c.g, c.b], i * 3);
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  starGeo.setAttribute("color", new THREE.BufferAttribute(sc, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ size: lowPower ? 0.16 : 0.09, vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false, fog: false, sizeAttenuation: true }),
  );
  scene.add(stars);

  // ---- core ---------------------------------------------------------------------
  const coreMat = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uColorA: { value: AMBER }, uColorB: { value: PALE }, uRim: { value: TEAL } },
    vertexShader: /* glsl */ `
      ${NOISE}
      uniform float uTime, uBreath, uLevel, uMotion;
      varying vec3 vNormal; varying vec3 vView; varying float vN;
      void main(){
        float t = uTime * uMotion;
        float n = snoise(normal * 0.9 + vec3(t * 0.22)) * 0.7 + snoise(normal * 2.2 - vec3(t * 0.3)) * 0.3;
        float breath = sin(t * 1.1) * 0.06 * uBreath;
        vec3 p = position * (1.0 + breath + uLevel * 0.3) + normal * n * (0.05 + uLevel * 0.22);
        vN = n;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vNormal = normalize(normalMatrix * normal); vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGlow, uLevel; uniform vec3 uColorA, uColorB, uRim;
      varying vec3 vNormal; varying vec3 vView; varying float vN;
      void main(){
        float facing = max(dot(vNormal, vView), 0.0);
        float fres = pow(1.0 - facing, 2.5);
        // see-through body: bright veins of light inside, a glowing rim outside
        float veins = smoothstep(0.15, 0.6, vN) * 0.6;
        vec3 col = mix(uColorA, uColorB, 0.35 + veins);
        col = mix(col, uRim, fres * 0.22);            // faint teal edge
        float a = (0.1 + veins * 0.3 + fres * 0.7) * (0.45 + uGlow * 0.55 + uLevel * 0.8);
        gl_FragColor = vec4(col * a, a);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.78, lowPower ? 24 : 48), coreMat);
  being.add(core);

  const glowTex = makeGlowTexture();
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(6);
  being.add(halo);
  const heart = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff3d6, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  heart.scale.setScalar(2);
  being.add(heart);

  // ---- rings -------------------------------------------------------------------
  const ringMat = (color, dashes) =>
    new THREE.ShaderMaterial({
      uniforms: { ...uniforms, uColor: { value: color }, uDashes: { value: dashes }, uOpacity: { value: 1 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uDashes, uGlow, uLevel, uOpacity, uTime;
        varying vec2 vUv;
        void main(){
          float d = fract(vUv.x * uDashes);
          float dash = uDashes > 0.0 ? smoothstep(0.0, 0.08, d) * smoothstep(0.62, 0.5, d) : 1.0;
          float tick = step(0.985, fract(vUv.x * 96.0)) * 0.8;
          float a = (max(dash, tick) * 0.55 + 0.08) * (0.35 + uGlow * 0.8 + uLevel * 0.9) * uOpacity;
          gl_FragColor = vec4(uColor * a, a);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  const ringSpecs = [
    { r: 1.45, tube: 0.012, tilt: [1.2, 0.2, 0], speed: 0.9, dashes: 0, color: GOLD },
    { r: 1.95, tube: 0.01, tilt: [0.5, 0.9, 0.3], speed: -0.6, dashes: 18, color: PALE },
    { r: 2.55, tube: 0.008, tilt: [1.9, -0.4, 0.6], speed: 0.4, dashes: 7, color: GOLD },
    { r: 3.25, tube: 0.006, tilt: [0.2, 0.3, 1.3], speed: -0.25, dashes: 40, color: AMBER },
    { r: 4.1, tube: 0.004, tilt: [1.5, 1.1, -0.2], speed: 0.15, dashes: 3, color: AMBER },
  ];
  const rings = ringSpecs.slice(0, lowPower ? 4 : 5).map((s) => {
    const pivot = new THREE.Group();
    pivot.rotation.set(...s.tilt);
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(s.r, s.tube, 6, lowPower ? 160 : 320), ringMat(s.color, s.dashes));
    pivot.add(mesh);
    being.add(pivot);
    return { pivot, mesh, ...s };
  });

  // ---- orbiting particles (animated entirely on the GPU) -----------------------
  const particleMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec4 aOrbit;   // radius, angle, inclination, speed
      attribute vec3 aColor; attribute float aSize; attribute float aPhase;
      uniform float uTime, uSwirl, uSpread, uLevel, uLean, uPixel, uMotion;
      varying vec3 vColor; varying float vFade;
      void main(){
        float t = uTime * uMotion;
        float ang = aOrbit.y + t * aOrbit.w * (0.4 + uSwirl);
        float r = aOrbit.x * uSpread * (1.0 - uLean * 0.12) + sin(t * 0.7 + aPhase) * 0.12 + uLevel * 0.6 * sin(aPhase * 3.0 + t * 6.0);
        vec3 p = vec3(cos(ang) * r, sin(ang * 0.5 + aPhase) * 0.25, sin(ang) * r);
        float ci = cos(aOrbit.z), si = sin(aOrbit.z);
        p = vec3(p.x, p.y * ci - p.z * si, p.y * si + p.z * ci);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aSize * uPixel * (1.0 + uLevel * 1.5) * (18.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
        vColor = aColor; vFade = 0.55 + 0.45 * sin(t * 1.3 + aPhase * 5.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGlow; varying vec3 vColor; varying float vFade;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vFade * (0.38 + uGlow * 0.4);
        gl_FragColor = vec4(vColor * a, a);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  let particles = null;
  function buildParticles() {
    if (particles) {
      being.remove(particles);
      particles.geometry.dispose();
    }
    const count = Math.round((lowPower ? 1800 : 7000) * particleScale);
    const g = new THREE.BufferGeometry();
    const orbit = new Float32Array(count * 4);
    const color = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const band = Math.random();
      const r = band < 0.55 ? rand(1.2, 2.6) : band < 0.9 ? rand(2.6, 4.4) : rand(4.4, 6.5);
      orbit.set([r, Math.random() * TAU, rand(-1.4, 1.4) * (Math.random() < 0.6 ? 0.35 : 1), rand(0.15, 0.6) * (Math.random() < 0.5 ? -1 : 1) / Math.sqrt(r)], i * 4);
      const c = Math.random() < 0.04 ? (Math.random() < 0.5 ? TEAL : VIOLET) : GOLD.clone().lerp(Math.random() < 0.5 ? AMBER : PALE, Math.random());
      color.set([c.r, c.g, c.b], i * 3);
      size[i] = rand(0.9, 2.8) * (Math.random() < 0.03 ? 2.5 : 1);
      phase[i] = Math.random() * TAU;
    }
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3)); // computed in the shader
    g.setAttribute("aOrbit", new THREE.BufferAttribute(orbit, 4));
    g.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8);
    particles = new THREE.Points(g, particleMat);
    being.add(particles);
  }
  buildParticles();

  // ---- tendrils ------------------------------------------------------------------
  const SEG = lowPower ? 48 : 96;
  const tendrilMat = (pointMode) =>
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        ${NOISE}
        attribute float aT; attribute vec3 aDir; attribute float aSeed; attribute float aLen;
        uniform float uTime, uLean, uLevel, uBreath, uPixel, uMotion;
        varying float vT;
        void main(){
          float t = uTime * uMotion;
          vec3 dir = normalize(aDir);
          vec3 side = normalize(cross(dir, vec3(0.0, 1.0, 0.2)));
          vec3 up = cross(side, dir);
          float s = aT * aLen * (1.0 + uLevel * 0.25) * (1.0 - uLean * 0.35);
          // ripple travelling down the tendril, like a jellyfish arm
          float w = sin(aT * 7.0 - t * 1.8 + aSeed) * (0.12 + aT * 0.55);
          float n = snoise(vec3(aT * 2.0, aSeed, t * 0.25)) * aT * 0.8;
          vec3 p = dir * (0.8 + s) + side * (w + n) + up * cos(aT * 5.0 - t * 1.3 + aSeed) * aT * 0.35;
          // listening: arms curl in toward the core
          p = mix(p, p * (1.0 - aT * 0.45), uLean);
          p.y -= aT * aT * 0.6 * (1.0 - uLean);   // a gentle droop
          vT = aT;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = ${pointMode ? "(1.0 - aT) * 3.0 * uPixel * (14.0 / -mv.z) * (1.0 + uLevel)" : "1.0"};
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uGlow, uLevel; varying float vT;
        void main(){
          ${pointMode ? "if (length(gl_PointCoord - 0.5) > 0.5) discard;" : ""}
          vec3 col = mix(vec3(1.0, 0.86, 0.55), vec3(1.0, 0.45, 0.12), vT);
          col = mix(col, vec3(0.45, 0.4, 1.0), smoothstep(0.75, 1.0, vT) * 0.35); // violet tips
          float a = pow(1.0 - vT, 0.9) * (0.3 + uGlow * 0.45 + uLevel * 0.5);
          gl_FragColor = vec4(col * a, a);
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  const tendrilCount = lowPower ? 9 : 16;
  const tGeo = new THREE.BufferGeometry();
  const tPos = new Float32Array(tendrilCount * SEG * 3);
  const tT = new Float32Array(tendrilCount * SEG);
  const tDir = new Float32Array(tendrilCount * SEG * 3);
  const tSeed = new Float32Array(tendrilCount * SEG);
  const tLen = new Float32Array(tendrilCount * SEG);
  const tIndex = [];
  for (let k = 0; k < tendrilCount; k++) {
    // mostly downward and outward, a few reaching sideways and up
    const th = (k / tendrilCount) * TAU + rand(-0.2, 0.2);
    const down = k % 4 === 0 ? rand(-0.2, 0.5) : rand(-1.0, -0.35);
    const dir = new THREE.Vector3(Math.cos(th), down, Math.sin(th)).normalize();
    const seed = rand(0, 100);
    const len = rand(2.2, 4.2);
    for (let i = 0; i < SEG; i++) {
      const idx = k * SEG + i;
      tT[idx] = i / (SEG - 1);
      tDir.set([dir.x, dir.y, dir.z], idx * 3);
      tSeed[idx] = seed;
      tLen[idx] = len;
      if (i < SEG - 1) tIndex.push(idx, idx + 1);
    }
  }
  tGeo.setAttribute("position", new THREE.BufferAttribute(tPos, 3));
  tGeo.setAttribute("aT", new THREE.BufferAttribute(tT, 1));
  tGeo.setAttribute("aDir", new THREE.BufferAttribute(tDir, 3));
  tGeo.setAttribute("aSeed", new THREE.BufferAttribute(tSeed, 1));
  tGeo.setAttribute("aLen", new THREE.BufferAttribute(tLen, 1));
  tGeo.setIndex(tIndex);
  tGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8);
  being.add(new THREE.LineSegments(tGeo, tendrilMat(false)));
  const beadGeo = tGeo.clone();
  beadGeo.setIndex(null);
  beadGeo.boundingSphere = tGeo.boundingSphere;
  being.add(new THREE.Points(beadGeo, tendrilMat(true)));

  // ---- energy arcs (thinking) ----------------------------------------------------
  const ARCS = lowPower ? 4 : 8;
  const ARC_SEG = 14;
  const arcGeo = new THREE.BufferGeometry();
  const arcPos = new Float32Array(ARCS * (ARC_SEG - 1) * 2 * 3);
  arcGeo.setAttribute("position", new THREE.BufferAttribute(arcPos, 3));
  const arcMat = new THREE.LineBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
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
        if (i < ARC_SEG - 1) p.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(0.18 * Math.sin(f * Math.PI)));
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
    const m = new THREE.Mesh(new THREE.RingGeometry(0.98, 1, 128), rippleMat());
    m.rotation.x = -Math.PI / 2 + 0.25;
    m.userData.offset = i / 3;
    being.add(m);
    return m;
  });
  const callGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x5fe6d6, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  callGlow.scale.setScalar(9);
  being.add(callGlow);

  // ---- bloom -----------------------------------------------------------------------
  let composer = null;
  let bloom = null;
  if (!lowPower) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.55, 0.18);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  // ---- camera: slow drifting orbit, drag/pinch/scroll, parallax -------------------
  const cam = { theta: 0.6, phi: 1.25, radius: 10.5, targetRadius: 10.5, vTheta: 0, vPhi: 0 };
  const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
  let dragging = false;
  let userActive = 0;

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // portrait phones: pull back so the whole being fits
    cam.baseRadius = w < h ? 11.5 : 8.2;
    camera.updateProjectionMatrix();
    if (composer) {
      composer.setSize(w, h);
      bloom.resolution.set(w / 2, h / 2);
    }
  }
  resize();
  cam.radius = cam.targetRadius = cam.baseRadius;
  window.addEventListener("resize", resize);

  // ---- state ---------------------------------------------------------------------
  let mode = "off";
  let calling = false;
  let micLevel = 0;
  let speech = { analyser: null, fake: false };
  let freq = null;
  let fakeLevel = 0;
  const look = { ...LOOKS.off, calling: 0, level: 0 };
  let last = performance.now();
  let arcTimer = 0;
  let running = true;
  const perf = { start: performance.now(), frames: 0, time: 0 };
  let onSlow = null;

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
    last = now;
    const t = now / 1000;
    const motion = reducedMotion ? 0.3 : 1;

    // watch the frame rate (after a 1s warm-up, over 3s): if it's struggling, ask for low power once
    if (onSlow && now - perf.start > 1000) {
      perf.frames++;
      perf.time += raw;
      if (perf.time >= 3000) {
        const fps = (perf.frames * 1000) / perf.time;
        perf.frames = 0;
        perf.time = 0;
        if (fps < 38) {
          const cb = onSlow;
          onSlow = null;
          cb();
          return;
        }
      }
    }

    // ease every look value toward the current state (never snaps)
    const target = LOOKS[mode] || LOOKS.idle;
    const k = 1 - Math.exp(-dt * 2.2);
    for (const key of Object.keys(target)) look[key] += (target[key] - look[key]) * k;
    look.calling += ((calling ? 1 : 0) - look.calling) * (1 - Math.exp(-dt * 1.2));
    const rawLevel = mode === "speaking" ? voiceLevel(t) : mode === "active" || mode === "confirm" ? Math.min(1, micLevel * 2.5) * 0.7 : 0;
    const lk = rawLevel > look.level ? 1 - Math.exp(-dt * 18) : 1 - Math.exp(-dt * 6);
    look.level += (rawLevel - look.level) * lk;
    const level = look.level * (reducedMotion ? 0.5 : 1);

    uniforms.uTime.value = t;
    uniforms.uGlow.value = look.glow * (0.6 + 0.4 * glowScale) + look.calling * 0.2;
    uniforms.uBreath.value = look.breath;
    uniforms.uLevel.value = level * (0.4 + 0.6 * look.pulse) + (mode === "active" ? level * 0.6 : 0);
    uniforms.uLean.value = look.lean;
    uniforms.uSwirl.value = look.swirl;
    uniforms.uSpread.value = look.spread + look.calling * 0.08;

    // core + halos
    const breathe = 0.5 + 0.5 * Math.sin(t * 1.1 * motion);
    // without bloom (low power) the halo does more of the glowing
    halo.material.opacity = (0.16 + 0.22 * look.glow + 0.12 * breathe * look.breath + level * 0.4) * (0.5 + 0.5 * glowScale) * (lowPower ? 1.5 : 0.75);
    halo.scale.setScalar(5 + breathe * 0.6 * look.breath + level * 2.5);
    heart.material.opacity = Math.min(1, 0.55 + 0.45 * look.glow + level * 0.6);
    heart.scale.setScalar(1.9 + breathe * 0.25 * look.breath + level * 1.4);
    core.rotation.y += dt * 0.15 * motion;

    // rings at their own speeds and depths
    for (const ring of rings) {
      ring.mesh.rotation.z += dt * ring.speed * look.ringSpeed * motion;
      ring.pivot.rotation.y += dt * 0.03 * ring.speed * motion;
      ring.mesh.scale.setScalar(1 + level * 0.06 * Math.sign(ring.speed) + look.calling * 0.03 * Math.sin(t * 1.5 + ring.r));
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

    if (composer) {
      bloom.strength = (0.3 + look.glow * 0.3 + level * 0.6 + look.calling * 0.15) * glowScale;
      composer.render();
    } else {
      renderer.render(scene, camera);
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

  requestAnimationFrame(frame);

  return {
    setState(s) {
      mode = s;
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
      if (Math.abs(v - particleScale) < 0.01) return;
      particleScale = v;
      buildParticles();
    },
    onSlow(cb) {
      onSlow = cb;
    },
    dispose() {
      running = false;
      window.removeEventListener("resize", resize);
      window.removeEventListener("deviceorientation", onTilt);
      renderer.dispose();
    },
    lowPower,
  };
}

import * as THREE from 'three';

// Photographed skies (Poly Haven HDRIs) for image-based lighting.
// The dome is drawn over the procedural sky only in the environment scene that
// feeds the PMREM, so reflections and ambient light carry real-world sky
// detail while the visible sky stays dynamic (moving clouds, storms).
//  - the two HDRIs bracketing the current hour cross-fade, an overcast HDRI
//    fades in with cloud cover;
//  - each HDRI is rotated so its sun (or moon) sits at our sun's azimuth;
//  - brightness is normalised to the procedural sky so exposure stays stable,
//    and the sun itself is clamped out (the directional light already has it).
const SLOTS = [
  // [hour, key]: ordered keyframes; night wraps around
  [0, 'night'], [4.6, 'night'], [6.3, 'dawn'], [9.5, 'day'], [16.2, 'day'], [18.9, 'dusk'], [20.6, 'night'], [24, 'night'],
];

const vs = /* glsl */`
varying vec3 vDir;
void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const fs = /* glsl */`
uniform sampler2D tA; uniform sampler2D tB; uniform sampler2D tO;
uniform float kAB; uniform float kO; uniform float uMix; uniform float uTarget;
uniform vec3 rot; // azimuth offsets (radians) for A, B, O
uniform vec3 mean; // mean luminance of A, B, O
varying vec3 vDir;
vec3 eq(sampler2D t, vec3 d, float off) {
  float phi = atan(d.z, d.x) + off;
  vec2 uv = vec2(phi * 0.15915494 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * 0.31830989 + 0.5);
  return texture2D(t, uv).rgb;
}
void main() {
  vec3 d = normalize(vDir);
  vec3 a = eq(tA, d, rot.x) / mean.x;
  vec3 b = eq(tB, d, rot.y) / mean.y;
  vec3 o = eq(tO, d, rot.z) / mean.z;
  vec3 c = mix(mix(a, b, kAB), o, kO) * uTarget;
  // the sun/moon disc is the directional light's job
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c *= min(1.0, uTarget * 5.0 / max(l, 1e-5));
  float alpha = uMix * smoothstep(-0.12, 0.03, d.y);
  gl_FragColor = vec4(c, alpha);
}`;

export class HdriDome {
  constructor(assets) {
    this.h = assets.hdris;
    const any = Object.values(this.h)[0]?.texture;
    this.uniforms = {
      tA: { value: any }, tB: { value: any }, tO: { value: this.h.overcast?.texture || any },
      kAB: { value: 0 }, kO: { value: 0 }, uMix: { value: 0.85 }, uTarget: { value: 0.5 },
      rot: { value: new THREE.Vector3() }, mean: { value: new THREE.Vector3(1, 1, 1) },
    };
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(50, 48, 24),
      new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, transparent: true }),
    );
    this.mesh.renderOrder = 10;
    this.mesh.frustumCulled = false;
  }
  get ok() { return Object.keys(this.h).length >= 4; }

  // azimuth offset that puts the HDRI's light source at `dir`'s azimuth
  offset(key, dir) {
    const e = this.h[key];
    const phiH = (e.sunU - 0.5) * Math.PI * 2;
    // image u grows with atan(z, x); the build measured u from the left edge
    const phiS = Math.atan2(dir.z, dir.x);
    return phiH - phiS;
  }

  update(hour, cloud, sunDir, moonDir, skyLum) {
    let i = 0;
    while (i < SLOTS.length - 2 && hour >= SLOTS[i + 1][0]) i++;
    const [h0, kA] = SLOTS[i], [h1, kB] = SLOTS[i + 1];
    const t = h1 > h0 ? THREE.MathUtils.smoothstep(hour, h0, h1) : 0;
    const A = this.h[kA] || this.h.day, B = this.h[kB] || this.h.day, O = this.h.overcast || this.h.day;
    const u = this.uniforms;
    u.tA.value = A.texture; u.tB.value = B.texture; u.tO.value = O.texture;
    u.kAB.value = t;
    u.kO.value = THREE.MathUtils.clamp((cloud - 0.35) / 0.5, 0, 1) * 0.85;
    const lightDir = sunDir.y > -0.04 ? sunDir : moonDir;
    u.rot.value.set(this.offset(kA, kA === 'night' ? moonDir : lightDir), this.offset(kB, kB === 'night' ? moonDir : lightDir), this.offset('overcast', lightDir));
    u.mean.value.set(A.mean, B.mean, O.mean);
    u.uTarget.value = skyLum;
  }
}

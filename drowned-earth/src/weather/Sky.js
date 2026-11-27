import * as THREE from 'three';

// Sky dome for the far layer: gradient, sun/moon, stars, two cloud decks,
// horizon haze. Uniforms are shared with the water for reflections.
export const skyUniforms = {
  uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
  uSkySun: { value: new THREE.Vector3(0, 1, 0) }, uSkySunColor: { value: new THREE.Color() },
  uMoon: { value: new THREE.Vector3(0, 1, 0) }, uNightK: { value: 0 }, uCloud: { value: 0.3 },
  uSkyTime: { value: 0 }, uCloudDark: { value: 0 }, uFlashSky: { value: 0 }, uHaze: { value: 0.3 },
};

export const SKY_GLSL = /* glsl */`
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSkySun; uniform vec3 uSkySunColor;
uniform vec3 uMoon; uniform float uNightK; uniform float uCloud; uniform float uSkyTime; uniform float uCloudDark;
uniform float uFlashSky; uniform float uHaze;
vec3 skyBase(vec3 d) {
  float y = max(d.y, 0.0);
  vec3 c = mix(uHorizon, uZenith, pow(y, 0.45));
  float sd = max(dot(d, uSkySun), 0.0);
  c += uSkySunColor * (pow(sd, 8.0) * 0.25 + pow(sd, 64.0) * 0.4) * (1.0 - uCloud * 0.7);
  // horizon haze band
  c = mix(c, uHorizon * 1.05, exp(-y * 18.0) * (0.5 + uHaze));
  return c;
}
float skh(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }
float skn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(skh(i), skh(i + vec2(1, 0)), f.x), mix(skh(i + vec2(0, 1)), skh(i + vec2(1, 1)), f.x), f.y); }
float skfbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * skn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
// Lit cumulus/stratus deck + high cirrus, projected on a dome. 'cheap' skips the self-shadow sample.
vec3 skyClouds(vec3 d, vec3 base, bool cheap) {
  if (d.y <= 0.0) return base;
  vec2 uv = d.xz / (d.y + 0.1) * 0.55;
  float t = uSkyTime * 0.004;
  vec2 w = vec2(skfbm(uv * 0.8 + t), skfbm(uv * 0.8 - t + 5.2));
  vec2 p = uv * 1.25 + w * 0.9 + vec2(t * 1.3, t * 0.5);
  float cov = mix(0.7, 0.3, uCloud);
  float n = skfbm(p) * 0.8 + skfbm(p * 2.7) * 0.32;
  float dens = smoothstep(cov, cov + 0.32, n);
  float sd = max(dot(d, uSkySun), 0.0);
  // self-shadowing: density a little way toward the sun
  float shade = 1.0;
  if (!cheap) {
    vec2 ps = p + normalize(uSkySun.xz + 1e-4) * 0.09;
    float ns = skfbm(ps) * 0.8 + skfbm(ps * 2.7) * 0.32;
    shade = 1.0 - smoothstep(cov, cov + 0.5, ns) * 0.65;
  }
  vec3 sunLit = uSkySunColor * 0.85 + uHorizon * 0.55;
  vec3 dark = mix(uZenith * 0.55 + uHorizon * 0.35, uHorizon * 0.45, uCloudDark);
  vec3 cc = mix(dark, sunLit, shade * (1.0 - uCloudDark * 0.7));
  // bright silver edges when looking toward the sun, thin parts glowing
  cc += uSkySunColor * pow(sd, 6.0) * (1.0 - dens) * 1.6 * (1.0 - uCloudDark);
  cc *= mix(1.0, 0.18, uNightK);
  float a = dens * smoothstep(0.0, 0.14, d.y) * (0.75 + uCloud * 0.25);
  vec3 c = mix(base, cc, a);
  // cirrus: thin, streaky, high
  float ci = skfbm(vec2(uv.x * 0.6, uv.y * 3.5) * 1.4 + t * 2.0);
  c += (uSkySunColor * 0.25 + uHorizon * 0.3) * smoothstep(0.55, 0.85, ci) * 0.25 * (1.0 - uCloud) * smoothstep(0.05, 0.4, d.y) * (1.0 - uNightK * 0.8);
  // distance haze over the cloud deck
  return mix(c, uHorizon, exp(-d.y * 9.0) * 0.6);
}
`;

const vs = /* glsl */`
varying vec3 vDir;
void main() { vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }`;

const fs = /* glsl */`
${SKY_GLSL}
varying vec3 vDir;
float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  vec3 c = skyBase(d);
  float y = max(d.y, 0.0);
  // stars: hashed 3D cells, point-like
  if (uNightK > 0.01 && d.y > 0.0) {
    vec3 sp = d * 220.0;
    vec3 cell = floor(sp);
    float s = fract(sin(dot(cell, vec3(127.1, 311.7, 74.7))) * 43758.5453);
    vec3 jitter = vec3(fract(s * 13.7), fract(s * 71.3), fract(s * 29.1));
    float dd = length(fract(sp) - jitter);
    float star = step(0.985, s) * smoothstep(0.12, 0.0, dd) * (0.6 + 0.4 * sin(uSkyTime * 1.5 + s * 90.0));
    c += vec3(0.8, 0.85, 1.0) * star * uNightK * (1.0 - uCloud) * smoothstep(0.0, 0.25, y) * 1.4;
  }
  // sun disc / moon disc
  float sdot = dot(d, uSkySun);
  c += uSkySunColor * smoothstep(0.9993, 0.9997, sdot) * 6.0 * (1.0 - uCloud * 0.85);
  float md = dot(d, uMoon);
  c += vec3(0.75, 0.8, 0.9) * smoothstep(0.9994, 0.9997, md) * uNightK * (1.0 - uCloud * 0.8) * 1.4;
  c += vec3(0.2, 0.25, 0.35) * pow(max(md, 0.0), 60.0) * uNightK * 0.3;
  c = skyClouds(d, c, false);
  c += vec3(0.6, 0.65, 0.8) * uFlashSky;
  // below horizon: blend to the haze color (far ocean covers most of it)
  c = mix(c, uHorizon * 0.8, smoothstep(0.0, -0.05, d.y));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createSky() {
  const geo = new THREE.SphereGeometry(30000, 32, 16);
  const m = new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms: skyUniforms, side: THREE.BackSide, depthWrite: false, toneMapped: true });
  const mesh = new THREE.Mesh(geo, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.name = 'sky';
  return mesh;
}

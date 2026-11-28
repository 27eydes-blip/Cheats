import * as THREE from 'three';

// Sky dome for the far layer: gradient, sun/moon, stars, two cloud decks,
// horizon haze. Uniforms are shared with the water for reflections.
export const skyUniforms = {
  uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
  uSkySun: { value: new THREE.Vector3(0, 1, 0) }, uSkySunColor: { value: new THREE.Color() },
  uMoon: { value: new THREE.Vector3(0, 1, 0) }, uNightK: { value: 0 }, uCloud: { value: 0.3 },
  uSkyTime: { value: 0 }, uCloudDark: { value: 0 }, uFlashSky: { value: 0 }, uHaze: { value: 0.3 },
  // physically based scattering weight (0 = the scripted gradient only), the fog colour the horizon fades into,
  // and the quality tier (0 Laptop: 3-octave clouds, no cirrus or self-shadow)
  uPhys: { value: 0.4 }, uFogCol: { value: new THREE.Color(0.6, 0.65, 0.7) }, uFogK: { value: 0.0 }, uSkyTier: { value: 2 },
};

export const SKY_GLSL = /* glsl */`
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSkySun; uniform vec3 uSkySunColor;
uniform vec3 uMoon; uniform float uNightK; uniform float uCloud; uniform float uSkyTime; uniform float uCloudDark;
uniform float uFlashSky; uniform float uHaze; uniform float uPhys; uniform vec3 uFogCol; uniform float uFogK; uniform float uSkyTier;
// Preetham daylight (after the three.js Sky example): Rayleigh + Mie single scattering with the sun's own
// extinction, so the zenith is deep blue, the horizon warm and milky, sunsets red, and the sun has a halo.
const vec3 skTotalRayleigh = vec3(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5);
const vec3 skMieConst = vec3(1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14);
vec3 skyPhysical(vec3 d) {
  float sy = uSkySun.y;
  float sunfade = 1.0 - clamp(1.0 - exp(sy), 0.0, 1.0);
  float turb = 2.0 + uHaze * 2.5 + uCloud * 1.5;
  vec3 betaR = skTotalRayleigh * (2.6 - (1.0 - sunfade));
  vec3 betaM = 0.434 * (0.2 * turb) * 10E-18 * skMieConst * 0.005;
  float zc = clamp(sy, -1.0, 1.0);
  float sunE = 1000.0 * max(0.0, 1.0 - exp(-((1.6110731556870734 - acos(zc)) / 1.5)));
  float za = acos(max(0.0, d.y));
  float inv = 1.0 / (cos(za) + 0.15 * pow(max(93.885 - za * 57.29578, 1e-3), -1.253));
  vec3 Fex = exp(-(betaR * 8.4E3 * inv + betaM * 1.25E3 * inv));
  float ct = dot(d, uSkySun);
  float rPhase = 0.05968310365946075 * (1.0 + pow(ct * 0.5 + 0.5, 2.0));
  float g = 0.76, g2 = g * g;
  float mPhase = 0.07957747154594767 * (1.0 - g2) / pow(1.0 - 2.0 * g * ct + g2, 1.5);
  vec3 ratio = (betaR * rPhase + betaM * mPhase) / (betaR + betaM);
  vec3 Lin = pow(sunE * ratio * (1.0 - Fex), vec3(1.5));
  Lin *= mix(vec3(1.0), pow(sunE * ratio * Fex, vec3(0.5)), clamp(pow(1.0 - sy, 5.0), 0.0, 1.0));
  vec3 tex = (Lin + vec3(0.1) * Fex) * 0.04 + vec3(0.0, 0.0003, 0.00075);
  return pow(tex, vec3(1.0 / (1.2 + 1.2 * sunfade))) * 0.6;
}
vec3 skyBase(vec3 d) {
  float y = max(d.y, 0.0);
  vec3 c = mix(uHorizon, uZenith, pow(y, 0.45));
  float sd = max(dot(d, uSkySun), 0.0);
  c += uSkySunColor * (pow(sd, 8.0) * 0.25 + pow(sd, 64.0) * 0.4) * (1.0 - uCloud * 0.7);
  // the physical sky over the scripted one, by day, less under cloud (the scripted grey carries storms)
  float w = uPhys * smoothstep(-0.1, 0.08, uSkySun.y) * (1.0 - uCloud * 0.75);
  if (w > 0.001) c = mix(c, skyPhysical(vec3(d.x, max(d.y, 0.0), d.z)), w);
  // horizon haze band, then into the fog colour itself so sky and fogged world meet without a seam
  c = mix(c, uHorizon * 1.05, exp(-y * 18.0) * (0.5 + uHaze) * (1.0 - w * 0.6));
  c = mix(c, uFogCol, exp(-y * 14.0) * uFogK);
  return c;
}
float skh(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }
float skn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(skh(i), skh(i + vec2(1, 0)), f.x), mix(skh(i + vec2(0, 1)), skh(i + vec2(1, 1)), f.x), f.y); }
float skfbm(vec2 p) { float s = 0.0, a = 0.5; int oct = uSkyTier < 0.5 ? 3 : 5; for (int i = 0; i < 5; i++) { if (i >= oct) break; s += a * skn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
// Lit cumulus/stratus deck + high cirrus, projected on a dome. 'cheap' skips the self-shadow sample.
vec3 skyClouds(vec3 d, vec3 base, bool cheap) {
  if (d.y <= 0.0) return base;
  vec2 uv = d.xz / (d.y + 0.1) * 0.55;
  float t = uSkyTime * 0.004;
  vec2 w = uSkyTier < 0.5 ? vec2(0.5) : vec2(skfbm(uv * 0.8 + t), skfbm(uv * 0.8 - t + 5.2));
  vec2 p = uv * 1.25 + w * 0.9 + vec2(t * 1.3, t * 0.5);
  float cov = mix(0.7, 0.3, uCloud);
  float n = skfbm(p) * 0.8 + skfbm(p * 2.7) * 0.32;
  float dens = smoothstep(cov, cov + 0.32, n);
  float sd = max(dot(d, uSkySun), 0.0);
  // self-shadowing: density a little way toward the sun
  float shade = 1.0;
  if (!cheap && uSkyTier > 0.5) {
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
  float ci = uSkyTier < 0.5 ? 0.0 : skfbm(vec2(uv.x * 0.6, uv.y * 3.5) * 1.4 + t * 2.0);
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
  // the faint band of the galaxy on clear nights
  if (uNightK > 0.01 && d.y > 0.0 && uSkyTier > 0.5) {
    vec3 gal = normalize(vec3(0.35, 0.25, 0.9));
    float band = exp(-pow(dot(d, gal) * 5.0, 2.0)) * (0.5 + 0.5 * fbm(d.xz / (d.y + 0.2) * 3.0));
    c += vec3(0.18, 0.2, 0.26) * band * uNightK * (1.0 - uCloud) * 0.22 * smoothstep(0.0, 0.3, y);
  }
  // the sun: a soft disc (limb-darkened, dimmer and bigger through haze) inside a halo, never a flat coin
  float sdot = dot(d, uSkySun);
  float disc = smoothstep(0.99955 - uHaze * 0.0004, 0.99975, sdot);
  float halo = pow(max(sdot, 0.0), 900.0) * 1.2 + pow(max(sdot, 0.0), 120.0) * 0.25 * (0.4 + uHaze);
  c += uSkySunColor * (disc * mix(5.0, 2.2, uHaze) * (0.75 + 0.25 * smoothstep(0.99955, 0.99985, sdot)) + halo) * (1.0 - uCloud * 0.85);
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

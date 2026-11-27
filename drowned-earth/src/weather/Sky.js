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
  // stars
  if (uNightK > 0.01 && d.y > 0.0) {
    vec3 sd = d * 300.0;
    vec2 cell = floor(sd.xz / (1.0 + sd.y * 0.0) );
    float s = h21(floor(d.xz * 420.0 / (0.3 + y)) + floor(d.y * 300.0));
    float star = step(0.9975, s) * (0.5 + 0.5 * sin(uSkyTime * 2.0 + s * 100.0));
    c += vec3(0.8, 0.85, 1.0) * star * uNightK * (1.0 - uCloud) * smoothstep(0.0, 0.2, y);
  }
  // sun disc / moon disc
  float sdot = dot(d, uSkySun);
  c += uSkySunColor * smoothstep(0.9993, 0.9997, sdot) * 6.0 * (1.0 - uCloud * 0.85);
  float md = dot(d, uMoon);
  c += vec3(0.75, 0.8, 0.9) * smoothstep(0.9994, 0.9997, md) * uNightK * (1.0 - uCloud * 0.8) * 1.4;
  c += vec3(0.2, 0.25, 0.35) * pow(max(md, 0.0), 60.0) * uNightK * 0.3;
  // clouds on a virtual plane
  if (d.y > 0.0) {
    vec2 uv = d.xz / (d.y + 0.08) * 0.6;
    float t = uSkyTime * 0.004;
    float n = fbm(uv * 1.3 + vec2(t, t * 0.4));
    float n2b = fbm(uv * 3.1 - vec2(t * 1.7, 0.0));
    float cov = mix(0.72, 0.28, uCloud);
    float cl = smoothstep(cov, cov + 0.28, n * 0.75 + n2b * 0.35);
    vec3 lit = mix(uHorizon * 1.1, uSkySunColor * 0.9 + uHorizon * 0.4, pow(max(sdot, 0.0), 3.0) * 0.6);
    vec3 cloudCol = mix(lit, uZenith * 0.6 + uHorizon * 0.25, uCloudDark);
    cloudCol *= mix(1.0, 0.25, uNightK);
    c = mix(c, cloudCol, cl * smoothstep(0.0, 0.12, d.y) * (0.6 + uCloud * 0.4));
  }
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

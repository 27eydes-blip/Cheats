import * as THREE from 'three';

// One wave model shared by the GPU (water surface, floating debris) and the CPU
// (boat buoyancy, swimming, rafts). Keeping them identical is what makes things
// sit *on* the water instead of clipping through it.
export const WAVE_COUNT = 5;
const BASE = [
  // dirAngle(rad offset from wind), wavelength m, amplitude m, phase
  [0.0, 22, 0.16, 0.0],
  [0.55, 13, 0.09, 1.7],
  [-0.4, 8.5, 0.055, 3.1],
  [1.1, 5.2, 0.03, 4.4],
  [-1.3, 31, 0.11, 2.2],
];
const G = 9.81;

export class Waves {
  constructor() {
    this.windDir = 0.6;     // radians, direction waves travel toward
    this.amp = 0.6;         // global amplitude multiplier from weather
    this.time = 0;
    this.data = new Float32Array(WAVE_COUNT * 4); // dir.x dir.y k omega
    this.amps = new Float32Array(WAVE_COUNT * 2); // amplitude phase
    this.uniforms = {
      uWaveA: { value: Array.from({ length: WAVE_COUNT }, () => new THREE.Vector4()) },
      uWaveB: { value: Array.from({ length: WAVE_COUNT }, () => new THREE.Vector2()) },
      uWaveTime: { value: 0 },
    };
    this.rebuild();
  }
  rebuild() {
    for (let i = 0; i < WAVE_COUNT; i++) {
      const [ang, L, A, ph] = BASE[i];
      const a = this.windDir + ang;
      const k = (Math.PI * 2) / L;
      const w = Math.sqrt(G * k);
      this.data.set([Math.cos(a), Math.sin(a), k, w], i * 4);
      this.amps[i * 2] = A * this.amp * (L > 10 ? 1 : 0.6 + 0.4 * Math.min(1, this.amp));
      this.amps[i * 2 + 1] = ph;
      this.uniforms.uWaveA.value[i].set(Math.cos(a), Math.sin(a), k, w);
      this.uniforms.uWaveB.value[i].set(this.amps[i * 2], ph);
    }
  }
  setWeather(amp, windDir) {
    if (Math.abs(amp - this.amp) > 0.002 || Math.abs(windDir - this.windDir) > 0.002) {
      this.amp = amp; this.windDir = windDir; this.rebuild();
    }
  }
  update(dt) { this.time += dt; this.uniforms.uWaveTime.value = this.time; }

  height(x, z, t = this.time) {
    let h = 0;
    const d = this.data, a = this.amps;
    for (let i = 0; i < WAVE_COUNT; i++) {
      const o = i * 4;
      h += a[i * 2] * Math.sin(d[o + 2] * (d[o] * x + d[o + 1] * z) - d[o + 3] * t + a[i * 2 + 1]);
    }
    return h;
  }
  // returns [height, dh/dx, dh/dz]
  sample(x, z, out = [0, 0, 0], t = this.time) {
    let h = 0, dx = 0, dz = 0;
    const d = this.data, a = this.amps;
    for (let i = 0; i < WAVE_COUNT; i++) {
      const o = i * 4, k = d[o + 2], A = a[i * 2];
      const ph = k * (d[o] * x + d[o + 1] * z) - d[o + 3] * t + a[i * 2 + 1];
      h += A * Math.sin(ph);
      const c = A * k * Math.cos(ph);
      dx += c * d[o]; dz += c * d[o + 1];
    }
    out[0] = h; out[1] = dx; out[2] = dz;
    return out;
  }
}

export const WAVES_GLSL = /* glsl */`
uniform vec4 uWaveA[${WAVE_COUNT}];
uniform vec2 uWaveB[${WAVE_COUNT}];
uniform float uWaveTime;
vec3 waveSample(vec2 p) {
  float h = 0.0; vec2 d = vec2(0.0);
  for (int i = 0; i < ${WAVE_COUNT}; i++) {
    vec4 w = uWaveA[i];
    float ph = w.z * dot(w.xy, p) - w.w * uWaveTime + uWaveB[i].y;
    h += uWaveB[i].x * sin(ph);
    d += uWaveB[i].x * w.z * cos(ph) * w.xy;
  }
  return vec3(h, d);
}
`;

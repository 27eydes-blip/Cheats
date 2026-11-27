import * as THREE from 'three';

// Game clock + the color script of the day. One real minute ≈ one game hour /
// DAY_SPEED. Keyframes are blended, then weather darkens/desaturates on top.
export const MINUTES_PER_GAME_HOUR = 0.85; // real minutes per game hour (≈20 min days)

const K = [
  // hour, sunCol, sunI, skyZenith, skyHorizon, hemiSky, hemiGround, hemiI, fog, exposure
  [0, 0x8fa6d6, 0.12, 0x03060e, 0x111a2a, 0x33466a, 0x0a0c10, 0.42, 0x0d1520, 1.5],
  [4.6, 0x8fa6d6, 0.1, 0x04070f, 0x141d2c, 0x33466a, 0x0a0c10, 0.42, 0x121a26, 1.45],
  [5.6, 0xff9a6a, 0.35, 0x1d2c48, 0x9e7a72, 0x5a6a85, 0x252220, 0.35, 0x6d6670, 1.0],
  [6.4, 0xffb27a, 1.4, 0x3b5a82, 0xe0b196, 0x93a3b8, 0x4a3f38, 0.55, 0xb7a9a2, 1.0],
  [8, 0xfff0d8, 2.0, 0x4a76a8, 0xb9c8d2, 0xa9bccc, 0x5a554c, 0.56, 0xaebbc2, 1.0],
  [12, 0xfff8ec, 2.4, 0x3f6fa3, 0xbfd0da, 0xb4c6d4, 0x5e5a50, 0.62, 0xb6c4cb, 1.0],
  [16.5, 0xffeacc, 2.1, 0x456f9e, 0xc8cdd0, 0xaab8c4, 0x5c554a, 0.56, 0xb5bcbf, 1.0],
  [18.2, 0xff9a52, 1.5, 0x334b72, 0xe29a6a, 0x8a8aa0, 0x47382e, 0.5, 0xb08670, 1.0],
  [19.1, 0xff6a3a, 0.4, 0x1a2342, 0x8a5050, 0x45465e, 0x221a18, 0.33, 0x5a4048, 1.0],
  [20.2, 0x8fa6d6, 0.12, 0x060a18, 0x1a1e30, 0x2a3a55, 0x07080c, 0.32, 0x141a28, 1.4],
  [24, 0x8fa6d6, 0.12, 0x03060e, 0x111a2a, 0x33466a, 0x0a0c10, 0.42, 0x0d1520, 1.5],
];
const cA = new THREE.Color(), cB = new THREE.Color();

export class TimeOfDay {
  constructor(hour = 5.8) {
    this.hour = hour;
    this.day = 1;
    this.speed = 1;   // multiplier (debug / sleeping)
    this.frozen = false;
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3();
    this.out = {
      sunColor: new THREE.Color(), sunI: 1, zenith: new THREE.Color(), horizon: new THREE.Color(),
      hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemiI: 1, fog: new THREE.Color(), night: 0, exposure: 1,
    };
    this.update(0);
  }
  update(dt) {
    if (!this.frozen) {
      this.hour += (dt * this.speed) / (MINUTES_PER_GAME_HOUR * 60);
      if (this.hour >= 24) { this.hour -= 24; this.day++; }
    }
    const h = this.hour;
    // sun path: rises east (+x) ~5.9, sets west ~18.9, slightly to the south (+z)
    const t = ((h - 6.4) / 12.5) * Math.PI;
    this.sunDir.set(Math.cos(t), Math.sin(t) * 0.92, 0.35).normalize();
    const mt = ((h - 18.5) / 12) * Math.PI;
    this.moonDir.set(Math.cos(mt) * 0.8, Math.max(0.25, Math.sin(mt)) * 0.9, -0.3).normalize();
    let i = 0;
    while (i < K.length - 2 && K[i + 1][0] <= h) i++;
    const a = K[i], b = K[i + 1];
    const f = (h - a[0]) / (b[0] - a[0]);
    const o = this.out;
    const mix = (idx, target) => target.copy(cA.setHex(a[idx])).lerp(cB.setHex(b[idx]), f);
    mix(1, o.sunColor); mix(3, o.zenith); mix(4, o.horizon); mix(5, o.hemiSky); mix(6, o.hemiGround); mix(8, o.fog);
    o.sunI = a[2] + (b[2] - a[2]) * f;
    o.hemiI = a[7] + (b[7] - a[7]) * f;
    o.exposure = a[9] + (b[9] - a[9]) * f;
    o.night = THREE.MathUtils.clamp(1 - (this.sunDir.y + 0.08) / 0.22, 0, 1);
    this.lightDir.copy(this.sunDir.y > -0.02 ? this.sunDir : this.moonDir);
  }
  get isNight() { return this.out.night > 0.6; }
  label() {
    const h = this.hour;
    return h < 5 ? 'night' : h < 7.5 ? 'dawn' : h < 11 ? 'morning' : h < 15 ? 'midday' : h < 18 ? 'afternoon' : h < 20 ? 'dusk' : 'night';
  }
  clockString() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}

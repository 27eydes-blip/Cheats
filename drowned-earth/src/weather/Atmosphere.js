import * as THREE from 'three';
import { skyUniforms, createSky } from './Sky.js';
import { G } from '../world/WorldShader.js';
import { setEnvIntensity } from '../world/Materials.js';
import { HdriDome } from './HdriDome.js';
import { patchCascadeChunk, makeNearCascade } from '../render/Cascades.js';

// Combines time of day + weather + underwater state into lights, fog, sky and
// the shared shader uniforms. The only place that touches global lighting.
const tmp = new THREE.Color();
const _f = new THREE.Vector3();

function daylightK(a) { return 1 - (a.ctx.time.out.night || 0); }
export class Atmosphere {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, farScene, settings } = ctx;
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.layers.enableAll();
    this.sun.castShadow = settings.q.shadows;
    if (settings.q.shadows) {
      this.sun.shadow.mapSize.set(settings.q.shadowMapSize, settings.q.shadowMapSize);
      const c = this.sun.shadow.camera;
      const R = settings.q.shadowRange || 70; c.left = -R; c.right = R; c.top = R; c.bottom = -R; c.near = 1; c.far = 600;
      this.sun.shadow.bias = -0.0008;
      this.sun.shadow.normalBias = 0.04;
    }
    if (settings.q.shadows && settings.q.csm) {
      // near cascade first: it must take shadow index 0
      patchCascadeChunk();
      this.near = makeNearCascade(2048, 26);
      this.near.layers.enableAll();
      scene.add(this.near, this.near.target);
    }
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    this.hemi.layers.enableAll();
    scene.add(this.hemi);
    // THREE.Fog is repurposed by render/FogChunk.js: near = exp2 density, far = streaming fade distance
    this.fog = new THREE.Fog(0x9aa8b0, 0.002, settings.q.chunkFarRadius * 0.95);
    scene.fog = this.fog;
    this.farFog = new THREE.FogExp2(0x9aa8b0, 0.00005);
    farScene.fog = this.farFog;
    this.farSun = new THREE.DirectionalLight(0xffffff, 2);
    this.farHemi = new THREE.HemisphereLight(0xffffff, 0x333333, 0.5);
    farScene.add(this.farSun, this.farHemi);
    this.sky = createSky();
    farScene.add(this.sky);
    this.pmrem = new THREE.PMREMGenerator(ctx.renderer);
    this.envScene = new THREE.Scene();
    this.envSky = createSky();
    this.envSky.scale.setScalar(0.01);
    this.envScene.add(this.envSky);
    this.envTimer = 0;
    this.envRT = null;
    if (ctx.assets && Object.keys(ctx.assets.hdris).length >= 4) {
      this.dome = new HdriDome(ctx.assets);
      this.envScene.add(this.dome.mesh);
    }
    this.underwater = false;
    this.underColor = new THREE.Color(0.024, 0.085, 0.075);
    this.indoor = 0;
    this.updateEnv();
  }
  updateEnv() {
    if (this.dome) {
      const { time, weather } = this.ctx;
      const z = skyUniforms.uZenith.value, h = skyUniforms.uHorizon.value;
      const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      this.dome.update(time.hour, weather.cur.cloud, time.sunDir, time.moonDir, (lum(z) + lum(h)) * 0.5);
    }
    const old = this.envRT;
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 1, 1000);
    this.ctx.scene.environment = this.envRT.texture;
    this.ctx.farScene.environment = this.envRT.texture;
    if (old) old.dispose();
  }
  update(dt, camera) {
    const { time, weather } = this.ctx;
    const o = time.out, w = weather.cur;
    const night = o.night;
    const cloudDim = 1 - w.cloud * 0.55 - w.rain * 0.15;
    // sky
    skyUniforms.uZenith.value.copy(o.zenith).lerp(tmp.copy(o.horizon).multiplyScalar(0.7), w.cloud * 0.6);
    const gray = (o.horizon.r + o.horizon.g + o.horizon.b) / 3;
    skyUniforms.uHorizon.value.copy(o.horizon).lerp(tmp.setRGB(gray, gray, gray * 1.02), w.cloud * 0.6).multiplyScalar(1 - w.rain * 0.3);
    skyUniforms.uSkySun.value.copy(time.sunDir);
    skyUniforms.uSkySunColor.value.copy(o.sunColor).multiplyScalar(Math.min(1.5, o.sunI * 0.5 + 0.2) * (1 - night));
    skyUniforms.uMoon.value.copy(time.moonDir);
    skyUniforms.uNightK.value = night;
    skyUniforms.uCloud.value = w.cloud;
    skyUniforms.uCloudDark.value = w.cloudDark;
    skyUniforms.uSkyTime.value += dt;
    skyUniforms.uHaze.value = Math.min(1, w.fog * 60);
    skyUniforms.uFlashSky.value = weather.flash * 0.5;
    skyUniforms.uSkyTier.value = this.ctx.settings.q.skyTier ?? 2;
    skyUniforms.uFogCol.value.copy(this.fog.color); skyUniforms.uFogK.value = this.underwater ? 0 : 0.6;
    // lights
    const ld = time.lightDir;
    const isMoon = time.sunDir.y <= -0.02;
    this.sun.color.copy(isMoon ? tmp.setHex(0x8fa6d6) : o.sunColor);
    this.sun.intensity = (isMoon ? 1.0 * (1 - w.cloud * 0.6) : o.sunI * Math.max(0.15, cloudDim)) * (1 - this.indoor * 0.3);
    const target = this.ctx.player.position;
    this.sun.position.copy(target).addScaledVector(ld, 300);
    this.sun.target.position.copy(target);
    if (this.near) {
      // centre the near cascade a little ahead of the camera, snapped to its texels
      const cam = this.ctx.camera;
      const f = _f.set(0, 0, -1).applyQuaternion(cam.quaternion).setY(0).normalize().multiplyScalar(12).add(cam.position);
      const texel = (26 * 2) / 2048;
      f.x = Math.round(f.x / texel) * texel; f.z = Math.round(f.z / texel) * texel;
      this.near.position.copy(f).addScaledVector(ld, 300);
      this.near.target.position.copy(f);
      this.near.target.updateMatrixWorld();
    }
    // snap shadow camera to texels to avoid shimmering
    this.hemi.color.copy(o.hemiSky).lerp(tmp.setRGB(0.55, 0.58, 0.6), w.cloud * 0.4 * (1 - night));
    this.hemi.groundColor.copy(o.hemiGround);
    this.hemi.intensity = (o.hemiI * (1 + w.cloud * 0.2) + weather.flash * 2.5) * (1 - this.indoor * 0.82);
    this.farSun.color.copy(this.sun.color); this.farSun.intensity = this.sun.intensity; this.farSun.position.copy(ld).multiplyScalar(1000);
    this.farHemi.color.copy(this.hemi.color); this.farHemi.groundColor.copy(this.hemi.groundColor); this.farHemi.intensity = this.hemi.intensity;
    // fog
    const fogCol = tmp.copy(o.fog).lerp(skyUniforms.uHorizon.value, 0.5);
    if (this.underwater) {
      const depth = Math.max(0, -camera.position.y);
      const daylight = Math.max(0.03, (1 - night) * cloudDim);
      const zc = this.zoneColor ? tmp.setRGB(...this.zoneColor).multiplyScalar(3) : this.underColor;
      this.fog.color.copy(zc).multiplyScalar(daylight * Math.exp(-depth * 0.05) + 0.004);
      this.fog.near = (this.zoneFog || 1) * (0.05 + depth * 0.0022 + w.rain * 0.02 + this.indoor * 0.04) * (1 - G.uGlow.value * 0.6);
      if (G.uGlow.value > 0) this.fog.color.lerp(tmp.setRGB(0.01, 0.12, 0.1), G.uGlow.value * 0.5);
    } else {
      this.fog.color.copy(fogCol);
      // local fog banks (Lowlight hides in one): thicker the closer you are
      let bank = 0;
      for (const f of this.fogBanks || (this.fogBanks = (this.ctx.data.locations.landmarks || []).filter((l) => this.ctx.data.rafts.communities?.[l.id]?.fog).map((l) => ({ x: l.pos[0], z: l.pos[1], k: this.ctx.data.rafts.communities[l.id].fog })))) {
        const d = Math.hypot(this.ctx.camera.position.x - f.x, this.ctx.camera.position.z - f.z);
        bank = Math.max(bank, f.k * Math.max(0, Math.min(1, (140 - d) / 90)));
      }
      this.fog.near = w.fog * (1 + w.rain * 0.4) + bank * 0.03;
      // Laptop: a shorter world needs thicker haze so its edge never shows (≈90 % at 340 m)
      const fb = this.ctx.settings.q.fogBoost; if (fb) this.fog.near = Math.max(this.fog.near * fb, 0.0038);
      if (bank > 0) this.fog.color.lerp(tmp.setRGB(0.42, 0.47, 0.5).multiplyScalar(0.25 + daylightK(this) * 0.75), bank * 0.7);
    }
    this.farFog.color.copy(fogCol);
    this.farFog.density = w.farFog;
    // shared world uniforms
    G.uSunDir.value.copy(ld);
    G.uSunColor.value.copy(this.sun.color).multiplyScalar(this.sun.intensity * 0.5);
    G.uNight.value = night;
    G.uAmbient.value.copy(this.hemi.color).multiplyScalar(this.hemi.intensity * 0.9).add(tmp.copy(this.sun.color).multiplyScalar(this.sun.intensity * 0.12 * (1 - night)));
    G.uWet.value += (Math.min(1, w.rain * 1.4) - G.uWet.value) * Math.min(1, dt * 0.05);
    G.uCaustics.value = cloudDim * (1 - night);
    this.ctx.renderer.toneMappingExposure = o.exposure * (this.underwater ? 1.0 : 1);
    const envI = (1 - this.indoor * 0.85) * (0.25 + (1 - night) * 0.75);
    if (Math.abs(envI - (this.envI ?? -1)) > 0.02) { this.envI = envI; setEnvIntensity(envI); }
    // environment reflections refresh
    this.envTimer -= dt;
    if (this.envTimer <= 0) {
      this.envTimer = this.ctx.settings.q.envMapUpdates ? 8 : 45;
      this.fog.far = this.ctx.settings.q.chunkFarRadius * 0.95;
      this.updateEnv();
    }
  }
}

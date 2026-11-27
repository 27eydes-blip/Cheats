import * as THREE from 'three';
import { skyUniforms, createSky } from './Sky.js';
import { G } from '../world/WorldShader.js';
import { setEnvIntensity } from '../world/Materials.js';

// Combines time of day + weather + underwater state into lights, fog, sky and
// the shared shader uniforms. The only place that touches global lighting.
const tmp = new THREE.Color();

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
      c.left = -70; c.right = 70; c.top = 70; c.bottom = -70; c.near = 1; c.far = 400;
      this.sun.shadow.bias = -0.0008;
      this.sun.shadow.normalBias = 0.04;
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
    this.underwater = false;
    this.underColor = new THREE.Color(0.024, 0.085, 0.075);
    this.indoor = 0;
    this.updateEnv();
  }
  updateEnv() {
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
    // lights
    const ld = time.lightDir;
    const isMoon = time.sunDir.y <= -0.02;
    this.sun.color.copy(isMoon ? tmp.setHex(0x8fa6d6) : o.sunColor);
    this.sun.intensity = (isMoon ? 0.7 * (1 - w.cloud * 0.6) : o.sunI * Math.max(0.15, cloudDim)) * (1 - this.indoor * 0.3);
    const target = this.ctx.player.position;
    this.sun.position.copy(target).addScaledVector(ld, 200);
    this.sun.target.position.copy(target);
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
      this.fog.color.copy(this.underColor).multiplyScalar(daylight * Math.exp(-depth * 0.05) + 0.004);
      this.fog.near = 0.07 + depth * 0.0025 + w.rain * 0.02 + this.indoor * 0.04;
    } else {
      this.fog.color.copy(fogCol);
      this.fog.near = w.fog * (1 + w.rain * 0.4);
    }
    this.farFog.color.copy(fogCol);
    this.farFog.density = w.farFog;
    // shared world uniforms
    G.uSunDir.value.copy(ld);
    G.uSunColor.value.copy(this.sun.color).multiplyScalar(this.sun.intensity * 0.5);
    G.uNight.value = night;
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

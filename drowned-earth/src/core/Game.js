import * as THREE from 'three';
import '../render/FogChunk.js';
import { EventBus } from './EventBus.js';
import { Settings } from './Settings.js';
import { Input } from './Input.js';
import { Pipeline } from '../render/Pipeline.js';
import { loadData } from '../data/index.js';
import { WorldMap } from '../world/WorldMap.js';
import { ChunkManager } from '../world/ChunkManager.js';
import { Collision } from '../world/Collision.js';
import { Interactables } from '../world/Interactables.js';
import { initMaterials } from '../world/Materials.js';
import { G, bindWaveUniforms } from '../world/WorldShader.js';
import { getTexture } from '../world/Textures.js';
import { cityChunk } from '../world/generators/city.js';
import { ruinsChunk, oceanChunk } from '../world/generators/ruins.js';
import { Waves } from '../water/Waves.js';
import { Water } from '../water/Water.js';
import { TimeOfDay } from '../weather/TimeOfDay.js';
import { Weather } from '../weather/Weather.js';
import { Atmosphere } from '../weather/Atmosphere.js';
import { Player } from '../player/Player.js';
import { Boat } from '../player/Boat.js';
import { CameraRig } from '../player/CameraRig.js';
import { applyDebugParams } from './Debug.js';

// The game: owns the renderer, scenes and every system, and runs the loop.
// Systems receive a shared `ctx` so they can find each other without imports
// in both directions.
export class Game {
  constructor(container) {
    this.container = container;
    this.ctx = { game: this };
  }

  async boot() {
    const ctx = this.ctx;
    ctx.events = new EventBus();
    ctx.settings = new Settings();
    ctx.params = new URLSearchParams(location.search);
    ctx.data = loadData();
    ctx.state = { flags: {}, looted: new Set(), logs: new Set(), playTime: 0 };

    const renderer = new THREE.WebGLRenderer({ antialias: !ctx.settings.q.postPipeline, powerPreference: 'high-performance', stencil: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = ctx.settings.q.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    this.container.appendChild(renderer.domElement);
    ctx.renderer = renderer;
    ctx.canvas = renderer.domElement;

    ctx.scene = new THREE.Scene();
    ctx.farScene = new THREE.Scene();
    ctx.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.12, 2600);
    ctx.farCamera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 20, 60000);
    ctx.pipeline = new Pipeline(renderer, ctx.settings);
    ctx.input = new Input(renderer.domElement, ctx.events);

    G.uNoiseTex.value = getTexture('noise');
    initMaterials();
    ctx.worldMap = new WorldMap(ctx.data.locations);
    ctx.collision = new Collision();
    ctx.interact = new Interactables(ctx);
    ctx.waves = new Waves();
    bindWaveUniforms(ctx.waves);
    ctx.time = new TimeOfDay(5.75);
    ctx.weather = new Weather(ctx, ctx.data.weather);
    ctx.player = new Player(ctx);
    ctx.atmosphere = new Atmosphere(ctx);
    ctx.water = new Water(ctx);
    ctx.chunks = new ChunkManager(ctx);
    ctx.chunks.registerGenerator('drowned_city', cityChunk);
    ctx.chunks.registerGenerator('sunken_ruins', ruinsChunk);
    ctx.chunks.registerGenerator('open_ocean', oceanChunk);
    ctx.boat = new Boat(ctx);
    ctx.rig = new CameraRig(ctx, ctx.camera);

    this.systems = [];
    ctx.boat.pos.set(-262, 0, 250); ctx.boat.heading = 0.4;
    applyDebugParams(ctx);
    ctx.chunks.update(ctx.player.position.x, ctx.player.position.z, true);
    addEventListener('resize', () => this.onResize());
    this.onResize();
    this.clock = new THREE.Clock();
    this.frame = 0;
    this.running = true;
    this.fps = 60; this.fpsAcc = 0; this.fpsN = 0;
    renderer.setAnimationLoop(() => this.loop());
    window.__game = this;
    ctx.events.emit('booted');
  }

  onResize() {
    const { camera, farCamera, pipeline } = this.ctx;
    camera.aspect = farCamera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix(); farCamera.updateProjectionMatrix();
    pipeline.resize();
  }

  loop() {
    const ctx = this.ctx;
    let dt = Math.min(this.clock.getDelta(), 0.1);
    if (this.fixedDt) dt = this.fixedDt;
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 1) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
    const paused = ctx.paused;
    ctx.input.poll();
    if (!paused) this.update(dt);
    this.render(dt);
    ctx.input.endFrame();
    this.frame++;
  }

  update(dt) {
    const ctx = this.ctx;
    ctx.state.playTime += dt;
    const prevHour = ctx.time.hour;
    ctx.time.update(dt);
    let dh = ctx.time.hour - prevHour; if (dh < 0) dh += 24;
    ctx.weather.update(dt, dh);
    ctx.waves.setWeather(ctx.weather.cur.waves, ctx.weather.windDir);
    ctx.waves.update(dt);
    G.uTime.value += dt;
    if (ctx.input.pressed('view')) ctx.rig.toggleView();
    ctx.player.update(dt);
    ctx.boat.update(dt);
    for (const s of this.systems) s.update?.(dt);
    ctx.rig.update(dt);
    const cam = ctx.camera;
    ctx.atmosphere.underwater = ctx.waves.height(cam.position.x, cam.position.z) > cam.position.y + 0.02;
    ctx.atmosphere.update(dt, cam);
    ctx.chunks.update(cam.position.x, cam.position.z);
    ctx.chunks.tick(dt);
    ctx.water.update(dt, cam, ctx.pipeline);
    const mode = ctx.player.mode === 'boat' ? 'boat' : 'foot';
    ctx.interact.update(ctx.player.eye, ctx.player.forward, mode);
    if (ctx.input.pressed('use')) ctx.interact.use();
    for (const s of this.systems) s.lateUpdate?.(dt);
  }

  render() {
    const ctx = this.ctx;
    const cam = ctx.camera, far = ctx.farCamera;
    far.position.copy(cam.position);
    far.quaternion.copy(cam.quaternion);
    far.fov = cam.fov; far.updateProjectionMatrix();
    far.updateMatrixWorld();
    const u = ctx.pipeline.uniforms;
    u.uTime.value = G.uTime.value;
    u.uUnder.value = ctx.atmosphere.underwater ? 1 : 0;
    u.uCamDepth.value = Math.max(0, -cam.position.y);
    u.uUnderColor.value.copy(ctx.atmosphere.fog.color).multiplyScalar(4);
    u.uFlash.value = ctx.weather.flash * 0.25;
    const sp = ctx.time.sunDir.clone().multiplyScalar(1000).add(cam.position).project(cam);
    u.uSunScreen.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
    u.uSunVis.value = Math.max(0, ctx.time.sunDir.y) * (1 - ctx.weather.cur.cloud * 0.6);
    ctx.renderer.shadowMap.needsUpdate = ctx.settings.q.shadows;
    ctx.pipeline.render(ctx);
  }
}

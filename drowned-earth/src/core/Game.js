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
import { initMaterials, applySurfaces } from '../world/Materials.js';
import { AssetLibrary } from '../assets/AssetLibrary.js';
import { setPropAssets } from '../world/Props.js';
import { ScanInstancer } from '../world/ScanInstancer.js';
import { showLoading } from '../ui/Loading.js';
import { HumanKit } from '../humans/HumanKit.js';
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
import { Effects } from '../render/Effects.js';
import { LandmarkManager } from '../world/LandmarkManager.js';
import { buildLindenCourt } from '../world/landmarks/lindenCourt.js';
import { buildHospital } from '../world/landmarks/hospital.js';
import { buildSubway } from '../world/landmarks/subway.js';
import { buildCargoShip } from '../world/landmarks/cargoShip.js';
import { buildSounding, buildVesper } from '../world/landmarks/sounding.js';
import { Highmark } from '../world/landmarks/Highmark.js';
import { buildRaftCommunity } from '../raft/RaftCommunity.js';
import { Inventory } from '../survival/Inventory.js';
import { Loot } from '../survival/Loot.js';
import { Crafting } from '../survival/Crafting.js';
import { Trade } from '../survival/Trade.js';
import { Survival } from '../survival/Survival.js';
import { Story } from '../story/Story.js';
import { Radio } from '../story/Radio.js';
import { Dialogue } from '../story/Dialogue.js';
import { UI } from '../ui/UI.js';
import { TouchControls } from '../ui/TouchControls.js';
import { AudioEngine } from '../audio/AudioEngine.js';
import { SaveSystem } from '../save/SaveSystem.js';
import { Birds } from '../ai/Birds.js';
import { Fish } from '../ai/Fish.js';
import { Patrol } from '../ai/Patrol.js';
import { DeepShapes } from '../ai/DeepShapes.js';
import { Life } from '../life/Life.js';
import { LifeUI } from '../life/LifeUI.js';
import { Scenarios } from '../life/Scenarios.js';
import { Deep } from '../deep/Deep.js';
import { Senses } from '../creatures/Senses.js';
import { Injury } from '../creatures/Injury.js';
import { Creatures } from '../creatures/Creatures.js';
import { Nightlife } from '../night/Nightlife.js';
import { Club } from '../night/Club.js';
import { ageGate } from '../ui/AgeGate.js';
import { Fleet } from '../vehicles/Fleet.js';
import { Ward } from '../crime/Ward.js';
import { Crews } from '../crime/Crews.js';
import { loadCreatureModels, ambientFishGeometry } from '../creatures/Models.js';
import { Journal } from '../ui/Journal.js';
import { Photo } from '../ui/Photo.js';
import { DebugPanel } from '../ui/DebugPanel.js';
import { Onboarding } from '../ui/Onboarding.js';
import { Bottles } from '../world/Bottles.js';
import { Standing } from '../society/Standing.js';
import { Economy } from '../society/Economy.js';
import { Heat } from '../society/Heat.js';

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
    renderer.info.autoReset = false;
    this.container.appendChild(renderer.domElement);
    ctx.renderer = renderer;
    ctx.canvas = renderer.domElement;

    ctx.scene = new THREE.Scene();
    ctx.farScene = new THREE.Scene();
    ctx.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.12, 2600);
    ctx.farCamera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 20, 60000);
    ctx.pipeline = new Pipeline(renderer, ctx.settings);
    ctx.input = new Input(renderer.domElement, ctx.events);

    const loading = showLoading(document.getElementById('ui'));
    ctx.assets = new AssetLibrary(renderer, ctx.settings);
    if (!ctx.params.has('noassets')) await ctx.assets.load((p, what) => loading.set(p, what));
    // people: the MakeHuman-based kit (falls back to the simpler rigged characters if missing)
    if (!ctx.params.has('noassets') && !ctx.params.has('nohumans')) {
      loading.phase('Waking the raft-folk…');
      try { ctx.humans = await new HumanKit(ctx.assets).load(); } catch (e) { console.warn('[humans] kit unavailable:', e.message); ctx.humans = null; }
    }
    if (ctx.params.has('viewer') && ctx.humans) {
      const { Viewer } = await import('../humans/Viewer.js');
      const v = new Viewer(ctx);
      loading.done();
      const clock = new THREE.Clock();
      window.__viewer = v; window.__game = this; this.frame = 0; this.running = true; this.fps = 60;
      renderer.setAnimationLoop(() => { v.update(Math.min(0.05, clock.getDelta())); this.frame++; });
      addEventListener('resize', () => ctx.pipeline.resize());
      return;
    }
    loading.phase('Raising the district…');
    await new Promise((r) => setTimeout(r, 30));

    G.uNoiseTex.value = getTexture('noise');
    initMaterials();
    applySurfaces(ctx.assets);
    ctx.instancer = new ScanInstancer(ctx.scene, ctx.settings);
    setPropAssets(ctx.assets, ctx.instancer);
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
    ctx.audio = new AudioEngine(this);
    ctx.ui = new UI(ctx);
    ctx.fx = new Effects(ctx);
    ctx.inventory = new Inventory(ctx);
    ctx.boatStorage = new Inventory(ctx, 80);
    ctx.loot = new Loot(ctx);
    ctx.crafting = new Crafting(ctx);
    ctx.trade = new Trade(ctx);
    ctx.nightlife = new Nightlife(ctx);
    ctx.survival = new Survival(ctx);
    ctx.story = new Story(ctx);
    ctx.standing = new Standing(ctx);
    ctx.economy = new Economy(ctx);
    ctx.heat = new Heat(ctx);
    ctx.radio = new Radio(ctx);
    ctx.dialogue = new Dialogue(ctx);
    ctx.boat = new Boat(ctx);
    ctx.rig = new CameraRig(ctx, ctx.camera);
    ctx.landmarks = new LandmarkManager(ctx);
    ctx.landmarks.register('start_tower', buildLindenCourt);
    ctx.landmarks.register('hospital', buildHospital);
    ctx.landmarks.register('subway', buildSubway);
    ctx.landmarks.register('cargo_ship', buildCargoShip);
    ctx.landmarks.register('sinkhole', buildSounding);
    ctx.landmarks.register('lone_window', buildVesper);
    ctx.landmarks.register('raft_community', buildRaftCommunity);
    ctx.highmark = new Highmark(ctx, ctx.data.locations.farLandmarks[0]);
    ctx.birds = new Birds(ctx);
    ctx.fish = new Fish(ctx);
    ctx.patrol = new Patrol(ctx);
    ctx.ward = new Ward(ctx);
    ctx.fleet = new Fleet(ctx);
    ctx.crews = new Crews(ctx);
    ctx.deep = new DeepShapes(ctx);
    ctx.abyss = new Deep(ctx);
    ctx.save = new SaveSystem(ctx);
    ctx.touch = new TouchControls(ctx);
    ctx.journal = new Journal(ctx);
    ctx.photo = new Photo(ctx);
    ctx.debug = new DebugPanel(ctx);
    ctx.onboarding = new Onboarding(ctx);
    ctx.bottles = new Bottles(ctx);
    ctx.life = new Life(ctx);
    ctx.lifeUI = new LifeUI(ctx, ctx.life);
    ctx.scenarios = new Scenarios(ctx);
    ctx.injury = new Injury(ctx);
    ctx.senses = new Senses(ctx);
    if (ctx.params.get('creatures') !== 'basic' && ctx.params.get('creatures') !== 'off') { loading.set?.(0.97, 'creatures'); ctx.creatureModels = await loadCreatureModels(ctx); const fg = ambientFishGeometry(ctx.creatureModels); if (fg) ctx.fish.useGeometry?.(fg); }
    ctx.creatures = new Creatures(ctx);
    ctx.club = new Club(ctx);
    ageGate(ctx.settings, ctx.params);
    ctx.ui.applyAccessibility();
    this.systems = [ctx.survival, ctx.story, ctx.radio, ctx.fx, ctx.birds, ctx.fish, ctx.patrol, ctx.deep, ctx.highmark, ctx.save, ctx.economy, ctx.heat, ctx.abyss, ctx.journal, ctx.onboarding, ctx.injury, ctx.creatures, ctx.nightlife, ctx.ward, ctx.club, ctx.crews];
    this.ambientSystems = [ctx.fx, ctx.birds, ctx.fish, ctx.highmark, ctx.abyss];
    this.wireEvents();
    this.newGame();
    applyDebugParams(ctx);
    ctx.story.checkObjectives();
    ctx.landmarks.update(ctx.player.position.x, ctx.player.position.z);
    ctx.chunks.update(ctx.player.position.x, ctx.player.position.z, true);
    ctx.paused = ctx.params.has('pause');
    this.onTitleChoice = (choice) => {
      if (choice === 'continue') { if (ctx.save.load()) this.enterStory(true); else this.enterStory(false); }
      else if (choice === 'story') this.enterStory(false);
      else if (choice === 'life') this.enterLife();
    };
    if (ctx.params.has('skipintro')) { this.setMode('play'); ctx.story.checkObjectives(); }
    else if (ctx.params.has('life')) this.enterLife();
    else ctx.ui.titleScreen(ctx.save.has(), this.onTitleChoice);
    const unlock = () => ctx.audio.start();
    addEventListener('pointerdown', unlock, { once: true });
    addEventListener('keydown', unlock, { once: true });
    addEventListener('resize', () => this.onResize());
    this.onResize();
    this.clock = new THREE.Clock();
    this.frame = 0;
    this.running = true;
    this.fps = 60; this.fpsAcc = 0; this.fpsN = 0;
    renderer.setAnimationLoop(() => this.loop());
    loading.done();
    window.__game = this;
    window.__THREE = THREE;
    ctx.events.emit('booted');
  }

  // test helper: advance the simulation n fixed steps
  step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) { this.ctx.input.poll(); this.update(dt); this.ctx.input.endFrame(); } }

  setMode(m) { this.ctx.mode = m; document.body.classList.toggle('mode-play', m === 'play'); }
  toTitle() {
    const ctx = this.ctx;
    this.setMode('title');
    ctx.input.enabled = false;
    ctx.paused = false;
    ctx.time.hour = 6.05; ctx.time.frozen = true; ctx.time.update(0);
    ctx.weather.set('mist', true);
  }
  enterStory(loaded) {
    const ctx = this.ctx;
    ctx.lifeUI.hide();
    ctx.time.frozen = !!ctx.params.has('freeze');
    if (!loaded) { this.resetStory(); this.newGame(); ctx.weather.set('mist', true); ctx.weather.locked = false; ctx.weather.scheduleIdx = 0; ctx.weather.hoursLeft = ctx.data.weather.schedule[0].hours; }
    this.setMode('play');
    ctx.input.enabled = true;
    ctx.ui.fade(0.01, null, 0.4);
    ctx.chunks.update(ctx.player.position.x, ctx.player.position.z, true);
    ctx.story.current = null;
    ctx.story.checkObjectives();
    if (!loaded) ctx.onboarding?.begin();
  }
  resetStory() {
    const ctx = this.ctx, st = ctx.state;
    for (const k of Object.keys(st.flags)) delete st.flags[k];
    st.looted.clear(); st.logs.clear(); st.playTime = 0; st.glow = ctx.data.deep.glow.start; ctx.abyss.refreshGrowth();
    st.explored.clear(); st.route.length = 0; st.discovered.clear(); st.notes.length = 0; st.met = {}; st.hints = ctx.onboarding.done = {};
    for (const k of Object.keys(st.seenLines || {})) delete st.seenLines[k];
    ctx.inventory.items = {}; ctx.boatStorage.items = {};
    ctx.standing = new Standing(ctx); ctx.economy = new Economy(ctx); ctx.heat = new Heat(ctx);
    this.systems = this.systems.map((s) => (s instanceof Economy ? ctx.economy : s instanceof Heat ? ctx.heat : s));
    Object.assign(ctx.survival, { thirst: 82, hunger: 75, warmth: 70, rest: 72, oxygen: 100, sick: 0, battery: 70, tanks: 0, oxygenSeconds: 50 });
    ctx.story.fired.clear(); ctx.story.pending.length = 0; ctx.story.finale = null;
    ctx.boat.upgrades = {}; ctx.boat.mods = { thrust: 1, noise: 1, fuel: 1, damage: 1 }; ctx.boat.platesMesh.visible = false; ctx.boat.spotLamp.visible = false;
    ctx.boat.fuel = 6; ctx.boat.hull = 78; ctx.boat.hasLanternRig = false; ctx.boat.lantern = false;
    ctx.events.emit('standing', 7);
  }
  enterLife() {
    const ctx = this.ctx;
    this.toTitle();
    this.setMode('life');
    const s = ctx.save.read();
    if (s?.life && !ctx.life.s) ctx.life.load(s.life);
    ctx.lifeUI.show();
  }
  // test helper: advance the simulation n fixed steps
  haptic(ms) { if (this.ctx.input.usingTouch && navigator.vibrate && !this.ctx.settings.reduceMotion) try { navigator.vibrate(ms); } catch { /* not allowed */ } }

  isIndoors(p) {
    for (const l of this.ctx.landmarks.loaded.values()) for (const b of l.interiors || []) if (p.x > b[0] && p.y > b[1] && p.z > b[2] && p.x < b[3] && p.y < b[4] && p.z < b[5]) return true;
    return false;
  }

  newGame() {
    const ctx = this.ctx;
    const def = ctx.data.locations.landmarks.find((l) => l.kind === 'start_tower');
    const [cx, cz] = def.pos;
    const moor = { pos: new THREE.Vector3(cx, 0, cz + 11 + 3.6), step: new THREE.Vector3(cx, 0.46, cz + 11 - 1.3), facing: 0 };
    ctx.boat.pos.copy(moor.pos);
    ctx.boat.heading = -Math.PI / 2;
    ctx.boat.tied = moor;
    ctx.player.mode = 'boat';
    ctx.player.yaw = -Math.PI / 2 - 0.35; ctx.player.pitch = 0.03;
    ctx.time.hour = 5.75;
    const inv = ctx.inventory;
    inv.add('scrap', 4, true); inv.add('dirty_water', 1, true); inv.add('kelp', 1, true); inv.add('fibre', 2, true);
    ctx.boatStorage.add('bottle', 2, true); ctx.boatStorage.add('fibre', 1, true); ctx.boatStorage.add('tape', 1, true);
    ctx.boat.update(0);
  }

  wireEvents() {
    const { events, audio, story, ui } = this.ctx;
    events.on('footstep', (e) => audio.footstep(e));
    events.on('splash', (e) => audio.splash(e.pos, e.big ? 1 : 0.5));
    events.on('swimstroke', (e) => (e.under ? audio.play('bubbles', { n: 3 }) : audio.splash(e.pos, 0.25)));
    events.on('boat:impact', (e) => { audio.impact(e.pos, e.speed); this.haptic(Math.min(200, e.speed * 40)); });
    events.on('shake', (v) => this.haptic(v * 120));
    events.on('blackout', () => this.haptic([80, 60, 80]));
    events.on('lightning', (e) => audio.play('thunder', { dist: e.dist }));
    events.on('boat:tie', () => audio.play('ui'));
    events.on('climbout', () => audio.splash(this.ctx.player.position.clone(), 0.4));
    events.on('craft', (r) => { if (r.id === 'lantern') { this.ctx.boat.hasLanternRig = true; ui.whisper('You rig the lantern on the boat pole. F lights it while piloting.'); } });
    events.on('flashlight', (on) => audio.play('ui'));
    events.on('objective:done', () => story.checkObjectives());
    events.on('trade', (e) => { if (e.item === 'teo_bag' && e.dir === 'buy') setTimeout(() => { ui.close(true); story.openLog('teo_02'); }, 300); });
    events.on('log:read', () => { audio.play('page'); audio.music?.setMoment('discovery'); });
    events.on('music:moment', (k) => audio.music?.setMoment(k));
    events.on('music:festival', () => audio.music?.setMoment('festival'));
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
    this.governResolution(dt);
    if (this.fpsAcc > 1) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
    const paused = ctx.paused;
    ctx.input.poll();
    if (!paused || ctx.mode !== 'play') this.update(dt);
    else if (ctx.photoMode) { ctx.input.poll(); ctx.player.look(ctx.input.look.x, ctx.input.look.y); ctx.rig.update(0); }
    ctx.ui.update(dt);
    ctx.debug.update(dt);
    this.render(dt);
    ctx.input.endFrame();
    this.frame++;
  }

  // Dynamic resolution: hold the preset's frame-rate target by scaling the
  // render resolution between minScale and 1 (hysteresis, small steps).
  governResolution(dt) {
    const ctx = this.ctx, q = ctx.settings.q;
    if (this.fixedDt || ctx.params.get('dynres') === '0') return;
    const ms = dt * 1000;
    this.frameEma = this.frameEma == null ? ms : this.frameEma * 0.95 + ms * 0.05;
    this.govT = (this.govT || 0) + dt;
    if (this.govT < 1.5 || this.frame < 120) return;
    this.govT = 0;
    const target = 1000 / (q.targetFps || 60);
    const p = ctx.pipeline;
    if (this.frameEma > target * 1.18 && p.scale > (q.minScale || 0.6)) p.setScale(Math.max(q.minScale || 0.6, p.scale - 0.1));
    else if (this.frameEma < target * 0.78 && p.scale < 1) p.setScale(Math.min(1, p.scale + 0.05));
  }

  update(dt) {
    const ctx = this.ctx;
    ctx.state.playTime += dt;
    this.minuteT = (this.minuteT || 0) + dt;
    if (this.minuteT > 5) { this.minuteT = 0; ctx.events.emit('tick:minute'); }
    const prevHour = ctx.time.hour;
    ctx.time.update(dt);
    let dh = ctx.time.hour - prevHour; if (dh < 0) dh += 24;
    ctx.weather.update(dt, dh);
    ctx.waves.setWeather(ctx.weather.cur.waves, ctx.weather.windDir);
    ctx.waves.update(dt);
    G.uTime.value += dt;
    const playing = ctx.mode === 'play';
    if (playing && ctx.input.pressed('view')) ctx.rig.toggleView();
    if (playing && !ctx.injury.dead) ctx.player.update(dt);
    ctx.boat.update(dt);
    ctx.landmarks.tick(dt);
    const focus = playing ? ctx.player.position : ctx.camera.position;
    ctx.landmarks.update(focus.x, focus.z);
    for (const s of playing ? this.systems : this.ambientSystems) s.update?.(dt);
    ctx.scenarios.update(dt);
    ctx.rig.update(dt);
    const cam = ctx.camera;
    ctx.atmosphere.underwater = ctx.waves.height(cam.position.x, cam.position.z) > cam.position.y + 0.02;
    ctx.atmosphere.indoor += ((this.isIndoors(cam.position) ? 1 : 0) - ctx.atmosphere.indoor) * Math.min(1, dt * 2);
    ctx.atmosphere.update(dt, cam);
    ctx.chunks.update(cam.position.x, cam.position.z);
    ctx.chunks.tick(dt);
    ctx.instancer.update(dt, cam.position);
    ctx.water.update(dt, cam, ctx.pipeline);
    ctx.audio.update(dt);
    const mode = ctx.player.mode === 'boat' ? 'boat' : 'foot';
    if (playing && ctx.player.mode !== 'climb') ctx.interact.update(ctx.player.eye, ctx.player.forward, mode);
    else ctx.interact.focus = null;
    if (playing && ctx.input.pressed('use')) ctx.interact.use();
    // warmth near raft fires
    const comm = ctx.state.community;
    if (comm) for (const r of comm.rafts.values()) if (r.fireLight && r.fireLight.getWorldPosition(this._fv || (this._fv = new THREE.Vector3())).distanceTo(ctx.player.position) < 3) ctx.survival.nearFire = true;
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
    u.uIndoor.value = ctx.atmosphere.indoor;
    // sun shafts + water mist
    const sunDir = ctx.time.sunDir;
    u.uSunDir.value.copy(sunDir);
    const sunUp = Math.max(0, sunDir.y);
    u.uSunCol.value.copy(ctx.atmosphere.sun.color).multiplyScalar(ctx.atmosphere.sun.intensity * (1 - ctx.time.out.night));
    const sp = sunDir.clone().multiplyScalar(1000).add(cam.position).project(cam);
    const inFront = sp.z < 1 && Math.abs(sp.x) < 1.6 && Math.abs(sp.y) < 1.6;
    u.uSunUV.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
    u.uShaft.value = inFront && sunDir.y > -0.02 ? (0.55 - Math.min(0.4, sunUp * 0.9)) * (1 - ctx.weather.cur.cloud * 0.75) * (1 - ctx.atmosphere.indoor) : 0;
    const w = ctx.weather.cur, h = ctx.time.hour;
    const dawnDusk = Math.max(Math.exp(-((h - 6.2) ** 2) / 2), Math.exp(-((h - 19.2) ** 2) / 1.5), ctx.time.out.night * 0.6);
    u.uMist.value = (0.0012 + w.fog * 0.28 + dawnDusk * 0.0032 + w.rain * 0.0025) * (ctx.mode === 'play' || ctx.mode === 'title' || ctx.mode === 'life' ? 1 : 1);
    u.uMistCol.value.copy(ctx.atmosphere.fog.color).lerp(ctx.atmosphere.hemi.color, 0.25).multiplyScalar(0.95);
    u.uLens.value = ctx.settings.lensFx ? 1 : 0;
    const lens = ctx.settings.lensFx && ctx.mode === 'play';
    this.wasUnder = this.wasUnder ?? false;
    if (this.wasUnder && !ctx.atmosphere.underwater) this.wet = 1;
    this.wasUnder = ctx.atmosphere.underwater;
    this.wet = Math.max(ctx.atmosphere.underwater ? 0 : ctx.weather.cur.rain * 0.6, (this.wet || 0) - 0.004);
    u.uWetLens.value = lens && ctx.player.mode !== 'boat' ? this.wet : lens && ctx.rig.thirdPerson ? 0 : this.wet * 0.5;
    u.uTunnel.value = ctx.player.headUnder ? Math.max(0, (30 - ctx.survival.oxygen) / 30) : 0;
    u.uCondense.value = lens ? Math.max(0, ctx.survival.coldness() - 0.5) * 0.5 : 0;
    u.uGrain.value = lens ? 0.025 : 0;
    u.uUnderColor.value.copy(ctx.atmosphere.fog.color).multiplyScalar(4);
    u.uFlash.value = ctx.weather.flash * 0.25;
    // underwater shafts fan down from the surface above, leaning toward the sun
    const sv = ctx.time.sunDir.clone().applyQuaternion(cam.quaternion.clone().invert());
    u.uSunScreen.value.set(0.5 + THREE.MathUtils.clamp(sv.x, -1, 1) * 0.45, 1.25);
    u.uSunVis.value = Math.max(0, ctx.time.sunDir.y) * (1 - ctx.weather.cur.cloud * 0.6);
    // screen-space reflections on wet ground, volumetric light density, motion blur
    ctx.ssrWet = G.uWet.value;
    ctx.volDensity = ctx.atmosphere.underwater ? 0 : (0.0015 + w.fog * 0.15 + dawnDusk * 0.0025 + w.rain * 0.002) * (1 - ctx.atmosphere.indoor * 0.6);
    ctx.motionBlur = ctx.mode === 'play' && !ctx.photoMode ? 0.45 : 0;
    // depth of field focus pull: on the speaker during dialogue, otherwise centre-screen
    const talkTo = ctx.dialogue?.target?.();
    if (talkTo && ctx.settings.q.postPipeline) {
      u.uDof.value = 1; u.uDofAmt.value = 0.45;
      u.uFocus.value = talkTo.distanceTo(cam.position);
      this.dofTalk = true;
    } else if (this.dofTalk) { u.uDof.value = 0; u.uFocus.value = 0; u.uDofAmt.value = 1; this.dofTalk = false; }
    // mip bias: preset base, sharper still when dynamic resolution renders below native
    G.uMipBias.value = (ctx.settings.q.mipBias || 0) + Math.log2(Math.max(0.5, ctx.pipeline.scale));
    ctx.renderer.info.reset();
    ctx.renderer.shadowMap.needsUpdate = ctx.settings.q.shadows;
    ctx.pipeline.render(ctx);
  }
}

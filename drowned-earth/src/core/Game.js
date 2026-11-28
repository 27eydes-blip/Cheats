import * as THREE from 'three';
import '../render/FogChunk.js';
import { EventBus } from './EventBus.js';
import { Settings, ORDER } from './Settings.js';
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
import { Pad } from '../input/Pad.js';
import { LightPool } from '../render/LightPool.js';
import { Killers } from '../killers/Killers.js';
import { PortageLife } from '../world/PortageLife.js';
import { EmergencyExit } from '../input/Emergency.js';
import { MenuBackdrop } from '../ui/MenuBackdrop.js';
import { PerfOverlay } from '../ui/PerfOverlay.js';
import { Scenarios } from '../life/Scenarios.js';
import { Deep } from '../deep/Deep.js';
import { Senses } from '../creatures/Senses.js';
import { Injury } from '../creatures/Injury.js';
import { Creatures } from '../creatures/Creatures.js';
import { Nightlife } from '../night/Nightlife.js';
import { Club } from '../night/Club.js';
import { Society } from '../people/Society.js';
import { Arms } from '../weapons/Arms.js';
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
    if (import.meta.env?.VITE_LITE) for (const k of ['noassets', 'nohumans']) ctx.params.set(k, ''); // lite build: procedural only, no binary assets
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
    ctx.input = new Input(renderer.domElement, ctx.events);
    this.frame = 0; this.running = true; this.fps = 60; this.fpsAcc = 0; this.fpsN = 0;
    this.clock = new THREE.Clock();
    window.__THREE = THREE;   // window.__game is published once there's something to drive (menu up, or world loaded)
    this.perf = ctx.perf = new PerfOverlay(ctx);
    // graphics context lost (driver reset, GPU out of memory — the "grey 3D view, HUD still up" freeze on
    // integrated graphics): pause and save straight away, then either carry on when the browser restores the
    // context, or reload one preset lower with a message if it doesn't come back quickly
    renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true; ctx.paused = true; this.perf.note('graphics context lost');
      const lostAt = performance.now();
      if (this.worldLoaded) { try { if (ctx.save.save('auto')) sessionStorage.setItem('de.autocontinue', '1'); } catch { /* keep going */ } }
      this.gpuMsg = this.gpuMsg || Object.assign(document.createElement('div'), { className: 'gpu-msg' });
      this.gpuMsg.style.cssText = 'position:fixed;inset:auto 0 40% 0;text-align:center;z-index:300;font:16px Georgia;color:#f1e8d6;text-shadow:0 1px 4px #000;pointer-events:none';
      this.gpuMsg.textContent = 'The graphics driver reset. Your game is saved — recovering…';
      document.body.appendChild(this.gpuMsg);
      this.lostTimer = setTimeout(() => this.recoverFromContextLoss(true), 4000);
      this.lossTimes = [...(this.lossTimes || []), lostAt].filter((t) => lostAt - t < 120000);
    }, false);
    renderer.domElement.addEventListener('webglcontextrestored', () => {
      clearTimeout(this.lostTimer);
      // a second loss within two minutes means this preset is too much for the machine
      this.recoverFromContextLoss((this.lossTimes || []).length > 1);
    }, false);
    addEventListener('resize', () => this.onResize());
    this.onTitleChoice = (choice) => this.chooseFromMenu(choice);
    // a quality step-down in play saves and reloads straight back into the game
    let auto = null; try { auto = sessionStorage.getItem('de.autocontinue'); sessionStorage.removeItem('de.autocontinue'); } catch { /* no storage */ }
    renderer.setAnimationLoop(() => this.loop());
    if (auto || ['skipintro', 'life', 'viewer'].some((k) => ctx.params.has(k))) {
      await this.loadWorld();
      window.__game = this;
      if (auto) this.chooseFromMenu('continue');
      return;
    }
    // the menu: no world yet. Just the UI, the save check, controller navigation and a cheap backdrop.
    ctx.ui = new UI(ctx); ctx.save = new SaveSystem(ctx); ctx.pad = new Pad(ctx);
    ageGate(ctx.settings, ctx.params); this.gated = true;
    ctx.ui.applyAccessibility();
    ctx.ui.titleScreen(ctx.save.has(), this.onTitleChoice);
    window.__game = this;
    ctx.events.emit('menu');
  }

  // build the whole world (assets, district, people, creatures, shaders) behind the loading bar
  async loadWorld() {
    const ctx = this.ctx, renderer = ctx.renderer;
    this.loadingWorld = true;
    ctx.pipeline = new Pipeline(renderer, ctx.settings);
    // the fog is fully opaque just inside the streaming radius: don't draw anything past it (the sky and far
    // skyline live in the separate far scene). Raft cities 600–900 m away were costing ~300k triangles in fog.
    ctx.camera.far = ctx.settings.q.chunkFarRadius + 30; ctx.camera.updateProjectionMatrix();
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
      window.__viewer = v; window.__game = this; this.frame = 0; this.running = true; this.fps = 60; this.loadingWorld = false;
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
    ctx.ui = ctx.ui || new UI(ctx);
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
    ctx.save = ctx.save || new SaveSystem(ctx);
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
    // late boot stages: show what's happening and yield so the label actually repaints
    const bootT = (window.__bootTimes = []); let stT = performance.now(), stName = 'start';
    const stage = async (p, label) => { const now = performance.now(); bootT.push([stName, Math.round(now - stT)]); stT = now; stName = label; loading.set?.(p, label); await new Promise((r) => setTimeout(r, 0)); };
    await stage(0.97, 'Waking the creatures');
    if (ctx.params.get('creatures') !== 'basic' && ctx.params.get('creatures') !== 'off') { ctx.creatureModels = await loadCreatureModels(ctx); const fg = ambientFishGeometry(ctx.creatureModels); if (fg) ctx.fish.useGeometry?.(fg); }
    await stage(0.975, 'Teaching the creatures their territory');
    ctx.creatures = new Creatures(ctx);
    await stage(0.98, 'Opening the Club');
    ctx.club = new Club(ctx);
    await stage(0.985, 'Giving the raft-folk their lives');
    ctx.society = new Society(ctx);
    ctx.portageLife = new PortageLife(ctx);
    ctx.killers = new Killers(ctx);
    await stage(0.99, 'Sharpening scrap');
    ctx.arms = new Arms(ctx);
    ctx.pad = ctx.pad || new Pad(ctx); ctx.pad.attachArms();
    if (!this.gated) ageGate(ctx.settings, ctx.params);
    ctx.ui.applyAccessibility();
    this.systems = [ctx.survival, ctx.story, ctx.radio, ctx.fx, ctx.birds, ctx.fish, ctx.patrol, ctx.deep, ctx.highmark, ctx.save, ctx.economy, ctx.heat, ctx.abyss, ctx.journal, ctx.onboarding, ctx.injury, ctx.creatures, ctx.nightlife, ctx.ward, ctx.club, ctx.crews, ctx.society, ctx.arms, ctx.portageLife, ctx.killers];
    this.ambientSystems = [ctx.fx, ctx.birds, ctx.fish, ctx.highmark, ctx.abyss];
    this.wireEvents();
    await stage(0.993, 'Setting the tide');
    this.newGame();
    applyDebugParams(ctx);
    ctx.story.checkObjectives();
    ctx.landmarks.update(ctx.player.position.x, ctx.player.position.z, true);
    await stage(0.996, 'Raising the district');
    ctx.chunks.update(ctx.player.position.x, ctx.player.position.z, true);
    // compile shaders without blocking the page (uses parallel compile where the driver allows);
    // a weak GPU otherwise freezes the tab on the first frames and the browser calls it unresponsive
    // a fixed number of real point lights for the whole game, so shaders never rebuild when lights come and go
    ctx.lightPool = new LightPool(ctx, Math.max(4, ctx.settings.q.pointLights || 4));
    ctx.lightPool.refresh(); ctx.lightPool.update(0);
    this.systems.push(ctx.lightPool); this.ambientSystems.push(ctx.lightPool);
    await stage(0.998, 'Preparing shaders');
    // warm materials and textures up front — in small batches with the page breathing between them, and with
    // a time limit. Doing it all in one call froze the page on machines whose browser compiles shaders on the
    // main thread (no parallel-compile support): "Preparing shaders… 100%" and then nothing for minutes.
    // Whatever isn't done in time compiles on first use instead.
    try {
      const yieldNow = () => new Promise((r) => setTimeout(r, 0));
      const t0 = performance.now(), budget = 20000;
      const texs = [], seen = new Set();
      ctx.scene.traverse((o) => { for (const m of [].concat(o.material || [])) for (const k in m) { const t = m[k]; if (t && t.isTexture && !seen.has(t)) { seen.add(t); texs.push(t); } } });
      let slice = performance.now();
      for (let i = 0; i < texs.length && performance.now() - t0 < budget * 0.3; i++) {
        try { renderer.initTexture(texs[i]); } catch { /* not uploadable yet */ }
        if (performance.now() - slice > 30) { loading.set?.(0.998, `Preparing textures ${i + 1}/${texs.length}`); await yieldNow(); slice = performance.now(); }
      }
      // one representative object per material, compiled on its own
      const reps = [], mats = new Set();
      ctx.scene.traverse((o) => { if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return; for (const m of [].concat(o.material || [])) if (!mats.has(m)) { mats.add(m); reps.push(o); break; } });
      const tgt = ctx.settings.q.postPipeline ? ctx.pipeline?.target : null;
      for (let i = 0; i < reps.length && performance.now() - t0 < budget; i++) {
        const o = reps[i], was = o.visible, prevT = renderer.getRenderTarget(); let p = null;
        try { if (tgt) renderer.setRenderTarget(tgt); o.visible = true; p = renderer.compileAsync(o, ctx.camera, ctx.scene); } catch { /* compile on first use */ } finally { renderer.setRenderTarget(prevT); o.visible = was; }
        if (p) await Promise.race([p.catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
        if (i % 4 === 3) { loading.set?.(0.998, `Preparing shaders ${i + 1}/${reps.length}`); await yieldNow(); }
      }
    } catch { /* compile on first use instead */ }
    await stage(1, 'Almost there');
    ctx.paused = ctx.params.has('pause');
    const unlock = () => ctx.audio.start();
    addEventListener('pointerdown', unlock, { once: true });
    addEventListener('keydown', unlock, { once: true });
    if (navigator.userActivation?.hasBeenActive) unlock();   // the menu click already counts as a gesture
    this.perf.watch(ctx.events);
    ctx.emergency = new EmergencyExit(ctx);   // hold Esc / Options for 1 s: get unstuck
    this.worldLoaded = true; this.loadingWorld = false;
    this.onResize();
    loading.done();
    if (ctx.params.has('skipintro')) { this.setMode('play'); ctx.story.checkObjectives(); }
    else if (ctx.params.has('life')) this.enterLife();
    ctx.events.emit('booted');
  }

  // a menu choice: build the world first (once), then go
  async chooseFromMenu(choice) {
    const ctx = this.ctx;
    if (!this.worldLoaded) {
      if (this.loadingWorld) return;
      try { await this.loadWorld(); } catch (e) {
        console.error(e); this.loadingWorld = false;
        document.getElementById('ui').innerHTML = `<div class="fatal">Drowned Earth could not load the world.<br><small>${String(e?.message || e)}</small></div>`;
        return;
      }
    }
    if (choice === 'continue') { if (ctx.save.load()) this.enterStory(true); else this.enterStory(false); }
    else if (choice === 'story') this.enterStory(false);
    else if (choice === 'life') this.enterLife();
  }

  // a ?quality= in the address would put the old preset straight back after a safe-mode reload
  recoverFromContextLoss(lower) {
    const ctx = this.ctx, s = ctx.settings;
    if (!lower) {
      // three.js rebuilds its programs and re-uploads textures lazily after a restore; just resume
      this.contextLost = false; ctx.paused = false; this.shaderWarm = false; this.gpuMsg?.remove(); this.perf.note('graphics context restored, resumed');
      return;
    }
    const order = ['high', 'medium', 'low', 'laptop'], i = order.indexOf(s.quality);
    const to = order[Math.min(order.length - 1, Math.max(0, i) + 1)];
    s.quality = to; s.auto = false; s.autoCap = to; s.qualityChosen = true; s.save();
    if (this.gpuMsg) this.gpuMsg.textContent = `The graphics driver reset. Reloading on ${Settings.label(to)} quality — your game is saved.`;
    this.perf.note(`context loss: reloading on ${to}`);
    this.reloadWithoutQualityParam();
  }
  reloadWithoutQualityParam() {
    setTimeout(() => { try { const u = new URL(location.href); u.searchParams.delete('quality'); history.replaceState(null, '', u); } catch { /* keep the url */ } location.reload(); }, 1200);
  }
  // ---------------------------------------------------------------- the menu
  basePixelRatio() { return Math.min(devicePixelRatio || 1, this.ctx.settings.q.pixelRatio || 1); }
  menuFrame() {
    const ctx = this.ctx, now = performance.now();
    const dt = Math.min(0.25, (now - (this.menuLast || now)) / 1000); this.menuLast = now;
    this.menuAcc = (this.menuAcc || 0) + dt;
    if (this.menuAcc < 1 / 30 - 0.003) return;            // capped at 30 fps
    const fdt = this.menuAcc; this.menuAcc = 0;
    if (!this.backdrop) { this.backdrop = new MenuBackdrop(ctx.renderer); this.backdrop.enter(this.basePixelRatio()); }
    if (!this.inMenu) { this.inMenu = true; this.backdrop.enter(this.basePixelRatio()); this.menuSlowT = 0; }
    ctx.input.poll();
    const t = performance.now();
    this.backdrop.render(fdt);
    ctx.input.endFrame();
    this.frame++;
    this.perf.sample(fdt, performance.now() - t, 'menu');
    // safe mode on the menu: if even this can't hold 25 fps for 5 s, lower the game's preset and the backdrop
    this.menuFps = this.menuFps == null ? 1 / fdt : this.menuFps * 0.9 + (1 / fdt) * 0.1;
    if (this.menuFps < 25) this.menuSlowT += fdt; else this.menuSlowT = 0;
    if (this.menuSlowT > 5) {
      this.menuSlowT = 0;
      const s = ctx.settings, B = this.backdrop;
      if (s.quality !== 'laptop') {
        const to = ORDER[Math.max(0, ORDER.indexOf(s.quality) - 1)]; s.quality = to; s.auto = false; s.autoCap = to; s.qualityChosen = true; s.save();
        ctx.ui?.toast(`Safe mode: quality set to ${Settings.label(to)} for this computer.`);
        if (this.worldLoaded) { try { if (ctx.save.save('auto')) sessionStorage.setItem('de.autocontinue', '1'); } catch { /* menu */ } }
        this.reloadWithoutQualityParam(); this.menuSlowT = -999;
      }
      else if (B.scale > 0.35) { B.setScale(0.35); }
      else if (!B.static) { B.static = true; }
    }
  }
  leaveMenu() {
    if (!this.inMenu) return;
    this.inMenu = false;
    this.playFrames = 0; this.frameEma = null; this.overT = this.underT = this.slowT = 0;   // judge play on play frames only
    const pl = this.ctx.pipeline;
    if (this.worldLoaded && pl) { this.ctx.renderer.setPixelRatio(pl.basePixelRatio * pl.scale); this.onResize(); }
  }

  // test helper: advance the simulation n fixed steps
  step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) { this.ctx.input.poll(); this.update(dt); this.ctx.input.endFrame(); } }

  setMode(m) { this.ctx.perf?.act?.('mode ' + m); this.ctx.mode = m; document.body.classList.toggle('mode-play', m === 'play'); if (m !== 'title') this.leaveMenu(); }
  toTitle() {
    const ctx = this.ctx;
    this.setMode('title');
    ctx.input.enabled = false;
    ctx.paused = false;
    if (!this.worldLoaded) return;
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
    ctx.arms?.reset(); ctx.portageLife?.reset(); ctx.killers?.reset(); ctx.player.clearSafe();
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
    if (this.ctx.state.inLair) return true;   // the hunters' lairs: sealed, no sky, no sun shafts
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
    if (this.inMenu || !this.worldLoaded) { this.backdrop?.resize(); if (!this.worldLoaded) return; }
    const { camera, farCamera, pipeline } = this.ctx;
    camera.aspect = farCamera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix(); farCamera.updateProjectionMatrix();
    pipeline.resize();
  }

  loop() {
    const ctx = this.ctx;
    if (this.loadingWorld) return;                                     // the loading bar is up; leave the CPU to the build
    if (!this.worldLoaded || ctx.mode === 'title') { this.menuFrame(); return; }   // the menu never simulates the world
    if (this.contextLost) return;
    // a frame-rate cap (Laptop: 30): skip display refreshes that come too early, for steady pacing
    const cap = ctx.settings.q.fpsCap;
    if (cap && !this.fixedDt) { const now = performance.now(); if (now - (this.lastFrameAt || 0) < 1000 / cap - 4) return; this.lastFrameAt = now; }
    const frameStart = performance.now();
    let dt = Math.min(this.clock.getDelta(), 0.1);
    if (this.fixedDt) dt = this.fixedDt;
    this.fpsAcc += dt; this.fpsN++;
    this.governResolution(dt);
    if (this.fpsAcc > 1) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
    const paused = ctx.paused;
    // the life sim is a menu: draw the world once as a still backdrop, then stop simulating and rendering it
    if (ctx.lifeActive && !ctx.scenarioActive) {
      ctx.input.poll(); ctx.ui.update(dt);
      if (!this.lifeDrawn) { this.lifeDrawn = true; this.render(dt); }
      ctx.input.endFrame(); this.frame++;
      return;
    }
    this.lifeDrawn = false;
    ctx.input.poll();
    if (!paused || ctx.mode !== 'play') this.update(dt);
    else if (ctx.photoMode) { ctx.input.poll(); ctx.player.look(ctx.input.look.x, ctx.input.look.y); ctx.rig.update(0); }
    ctx.ui.update(dt);
    ctx.debug.update(dt);
    this.render(dt);
    ctx.input.endFrame();
    this.frame++;
    this.perf.sample(dt, performance.now() - frameStart, ctx.mode);
  }

  // Dynamic resolution: hold the preset's frame-rate target by scaling the
  // render resolution between minScale and 1 (hysteresis, small steps).
  governResolution(dt) {
    const ctx = this.ctx, q = ctx.settings.q;
    if (this.fixedDt || ctx.params.get('dynres') === '0') return;
    const ms = dt * 1000;
    this.frameEma = this.frameEma == null ? ms : this.frameEma * 0.95 + ms * 0.05;
    // dynamic resolution first: over 20 ms per frame for a second → lower the resolution a step (never below 60%)
    const p = ctx.pipeline, MIN = ctx.settings.quality === 'low' ? 0.8 : (ctx.settings.q.minScale ?? 0.6);   // Light never drops below 80% (it has no sharpen pass to hide it)
    // over budget for a second → a resolution step down; the budget is 20 ms or the preset's own target (Light aims at 30 fps)
    const budget = Math.max(20, 1000 / (q.targetFps || 60) * 1.2);
    this.playFrames = (this.playFrames || 0) + 1;
    this.overT = ms > budget ? (this.overT || 0) + dt : 0;
    this.underT = ms < budget * 0.7 ? (this.underT || 0) + dt : 0;
    if (this.playFrames > 90 && this.overT >= 1 && p.scale > MIN + 0.001) { p.setScale(Math.max(MIN, p.scale - 0.1)); this.overT = 0; }
    else if (this.underT >= 3 && p.scale < 1) { p.setScale(Math.min(1, p.scale + 0.05)); this.underT = 0; }
    this.govT = (this.govT || 0) + dt;
    if (this.govT < 1.5 || this.playFrames < 150) return;
    this.govT = 0;
    // safe mode: still under 25 fps at the lowest resolution for ~5 s → drop a preset, save, and come straight back
    const s = ctx.settings;
    // first 10 s of play on an automatic preset averaging under 22 fps: straight to Laptop
    this.firstT = (this.firstT || 0) + 1.5;
    if (this.firstT <= 10 && !s.qualityChosen && s.quality !== 'laptop' && ctx.mode === 'play' && this.frameEma > 1000 / 22) this.slowT = 99;
    if (s.quality !== 'laptop' && ctx.mode === 'play' && (this.slowT >= 99 || p.scale <= MIN + 0.01 && this.frameEma > 1000 / 25)) {
      this.slowT = (this.slowT || 0) + 1.5;
      if (this.slowT >= 4.5) {
        // only when the game can save right now (not mid-climb, in a scene or a blackout): otherwise try again later
        let saved = false; try { saved = !!ctx.save.save('auto'); } catch { saved = false; }
        if (!saved) { this.slowT = 3; return; }
        const to = this.slowT >= 99 ? 'laptop' : ORDER[Math.max(0, ORDER.indexOf(s.quality) - 1)];
        s.quality = to; s.auto = false; s.autoCap = to; s.qualityChosen = true; s.save();
        ctx.ui.toast(`Safe mode: lowering quality to ${Settings.label(to)}…`);
        try { sessionStorage.setItem('de.autocontinue', '1'); } catch { /* reload to the menu instead */ }
        this.reloadWithoutQualityParam(); this.slowT = -999;
      }
    } else if (this.slowT > 0) this.slowT = 0;
  }

  update(dt) {
    const ctx = this.ctx;
    // hit-stop: a few frames of near-freeze when a heavy blow lands
    if (ctx.hitStop > 0) { ctx.hitStop -= dt; dt *= 0.08; }
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
    // per-system timing (cheap), so the watchdog can say which system ate a long frame
    const sysMs = this.perf.sysMs || (this.perf.sysMs = {});
    // one system throwing must not take the whole frame down with it (an exception every frame is a freeze):
    // log it to the watchdog once a second and carry on
    for (const s of playing ? this.systems : this.ambientSystems) {
      const t0 = performance.now();
      try { s.update?.(dt); } catch (e) { const n = s.constructor.name; if (!this.sysErrT?.[n] || performance.now() - this.sysErrT[n] > 1000) { (this.sysErrT ||= {})[n] = performance.now(); this.perf.note(`${n} threw: ${e?.message || e}`); console.error(e); } }
      sysMs[s.constructor.name] = performance.now() - t0;
    }
    ctx.scenarios.update(dt);
    ctx.rig.update(dt);
    // a camera with a bad position would poison audio, culling and every shader: put it back at the player
    if (!Number.isFinite(ctx.camera.position.x + ctx.camera.position.y + ctx.camera.position.z)) { ctx.camera.position.copy(Number.isFinite(ctx.player.position.x) ? ctx.player.position : ctx.boat.pos).y += 1.6; this.perf.note('camera position went bad — reset'); }
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
    // E: the thing in front of you wins (a mooring, a dock); on a boat with nothing in focus, it gets you off
    if (playing && ctx.input.pressed('use')) { if (ctx.interact.focus) ctx.interact.use(); else if (ctx.player.mode === 'boat' && !ctx.ui.open) ctx.boat.leave(); }
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

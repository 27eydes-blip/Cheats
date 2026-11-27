import * as THREE from 'three';
import { Band } from './Band.js';
import { Synth } from './Synth.js';
import { Music } from './Music.js';

// All sound is synthesized with WebAudio: ambience beds driven by weather and
// depth, spatial emitters streamed by distance, one-shots, NPC murmur voices
// and the radio. Underwater everything passes through a closing low-pass.
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3();

export class AudioEngine {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.emitters = new Map();
    this.nextId = 1;
    this.started = false;
    this.gullSilence = 0;
  }
  get g() { return this.game.ctx; }
  // must be called from a user gesture
  start() {
    if (this.started) { this.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ac = (this.ac = new AC({ latencyHint: 'interactive' }));
    this.started = true;
    this.master = ac.createGain(); this.master.gain.value = this.g.settings.volume;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
    this.master.connect(comp).connect(ac.destination);
    this.world = ac.createGain();
    this.under = ac.createBiquadFilter(); this.under.type = 'lowpass'; this.under.frequency.value = 20000; this.under.Q.value = 0.7;
    this.world.connect(this.under).connect(this.master);
    this.reverb = ac.createConvolver();
    this.reverb.buffer = this.impulse(3.2, 2.2);
    this.reverbSend = ac.createGain(); this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(this.reverb).connect(this.under);
    this.ui = ac.createGain(); this.ui.gain.value = 0.5; this.ui.connect(this.master);
    this.radio = ac.createGain(); this.radio.gain.value = 0;
    const rbp = ac.createBiquadFilter(); rbp.type = 'bandpass'; rbp.frequency.value = 1400; rbp.Q.value = 0.7;
    this.radio.connect(rbp).connect(this.master);
    this.radioIn = ac.createGain(); this.radioIn.connect(this.radio);
    this.synth = new Synth(ac);
    this.listener = ac.listener;
    this.hrtf = this.g.settings.quality !== 'low';
    this.beds();
    this.music = new Music(this);
  }
  impulse(sec, decay) {
    const ac = this.ac, len = ac.sampleRate * sec;
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  noiseSrc(type = 'white') {
    const s = this.ac.createBufferSource();
    s.buffer = this.synth.noise(type); s.loop = true; s.start(this.ac.currentTime, Math.random() * 4);
    return s;
  }
  // ---- ambience beds ----
  beds() {
    const ac = this.ac;
    const mk = (type, filt, f, q, gain = 0, dest = this.world) => {
      const src = this.noiseSrc(type);
      const fl = ac.createBiquadFilter(); fl.type = filt; fl.frequency.value = f; fl.Q.value = q;
      const g = ac.createGain(); g.gain.value = gain;
      src.connect(fl).connect(g).connect(dest);
      return { src, fl, g };
    };
    this.windBed = mk('brown', 'bandpass', 500, 0.6);
    this.windHigh = mk('pink', 'bandpass', 1800, 3);
    this.seaBed = mk('pink', 'lowpass', 420, 0.5);
    this.rainBed = mk('white', 'highpass', 1600, 0.4);
    this.rainLow = mk('pink', 'lowpass', 900, 0.5);
    this.underBed = mk('brown', 'lowpass', 180, 0.7, 0, this.master);
    // deep drone: two low sines beating
    this.drone = ac.createGain(); this.drone.gain.value = 0; this.drone.connect(this.master);
    for (const f of [31, 31.7, 46.5]) { const o = ac.createOscillator(); o.frequency.value = f; o.connect(this.drone); o.start(); }
    // boat engine
    this.engine = this.synth.engine(); this.engine.out.connect(this.world);
    // radio static bed
    this.radioStatic = mk('white', 'bandpass', 2500, 0.5, 0, this.radioIn);
    this.timers = { foghorn: 25, moan: 60, gull: 4, drops: 0 };
  }
  setVolume(v) { if (this.master) this.master.gain.value = v; }

  // ---- spatial emitters (streamed by distance) ----
  addEmitter(def) { const id = this.nextId++; this.emitters.set(id, { def, node: null, timer: Math.random() * 3 }); return id; }
  removeEmitter(id) { const e = this.emitters.get(id); if (e?.node) this.killNode(e.node); this.emitters.delete(id); }
  posOf(def) { if (typeof def.pos === 'function') return def.pos(_v); return Array.isArray(def.pos) ? _v.fromArray(def.pos) : _v.copy(def.pos); }
  panner(pos, ref = 4, rolloff = 1.2) {
    const p = this.ac.createPanner();
    p.panningModel = this.hrtf ? 'HRTF' : 'equalpower';
    p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = rolloff; p.maxDistance = 400;
    p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    p.connect(this.world);
    const send = this.ac.createGain(); send.gain.value = 0.25; p.connect(send).connect(this.reverbSend);
    return p;
  }
  killNode(n) { try { n.stop?.(); n.disconnect?.(); n.parts?.forEach((x) => { try { x.stop?.(); } catch { /**/ } x.disconnect?.(); }); } catch { /**/ } }
  continuousNode(def, pos) {
    const ac = this.ac, s = this.synth;
    const p = this.panner(pos, def.type === 'crowd' ? 6 : 3, def.type === 'deepHum' ? 0.6 : 1.3);
    const parts = [];
    const out = ac.createGain(); out.connect(p); out.gain.value = 0;
    const add = (n) => { parts.push(n); return n; };
    switch (def.type) {
      case 'whistle': { const src = add(this.noiseSrc('pink')); const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900 + (def.seed % 900); f.Q.value = 25; src.connect(f).connect(out); out.base = 0.9; out.windK = true; break; }
      case 'hum': { for (const h of [1, 2, 3]) { const o = add(ac.createOscillator()); o.frequency.value = (def.freq || 50) * h; const g = ac.createGain(); g.gain.value = 0.06 / h; o.connect(g).connect(out); o.start(); } out.base = 0.5; break; }
      case 'deepHum': { const o = add(ac.createOscillator()); o.frequency.value = 38; const o2 = add(ac.createOscillator()); o2.frequency.value = 57.3; const g = ac.createGain(); g.gain.value = 0.5; o.connect(g); o2.connect(g); g.connect(out); o.start(); o2.start(); out.base = (def.gain || 1) * 0.8; break; }
      case 'generator': { const n = s.chug(add); n.connect(out); out.base = 0.35; break; }
      case 'patrolEngine': { const n = s.chug(add, 22, 6); n.connect(out); out.base = 0.9; break; }
      case 'crowd': { const n = s.murmur(add, 5); n.connect(out); out.base = 0.5 * (def.gain ?? 1); out.dayOnly = true; break; }
      case 'fire': { const src = add(this.noiseSrc('brown')); const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300; src.connect(f).connect(out); out.base = 0.25; out.crackle = true; break; }
      case 'band': { const band = new Band(ac, out, def.style, def.seed || 1); out.band = band; parts.push({ stop: () => band.stop(), disconnect() {} }); out.base = 0.55; out.fn = def.gainFn; break; }
      case 'barCrowd': { const n = s.murmur(add, 7); n.connect(out); out.base = 0.6; out.fn = def.gainFn; break; }
      case 'lap': { const src = add(this.noiseSrc('pink')); const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 1.2; src.connect(f).connect(out); out.base = 0.0; out.lap = true; break; }
      default: out.base = 0;
    }
    return { out, panner: p, parts, stop() {}, disconnect() { p.disconnect(); out.disconnect(); } };
  }
  updateEmitters(dt, cam) {
    const t = this.ac.currentTime;
    const night = this.g.time.out.night, wind = this.g.weather.cur.wind;
    for (const e of this.emitters.values()) {
      const def = e.def;
      const pos = this.posOf(def);
      const d = pos.distanceTo(cam);
      const range = def.type === 'band' || def.type === 'barCrowd' ? 70 : def.type === 'deepHum' ? 160 : def.type === 'crowd' ? 140 : def.type === 'patrolEngine' ? 260 : 90;
      const isOneShotType = ['creak', 'drip', 'ropes', 'chimes'].includes(def.type);
      if (isOneShotType) {
        if (d > range) continue;
        e.timer -= dt;
        if (e.timer <= 0) {
          if (def.type === 'creak') { e.timer = 7 + Math.random() * 16; this.synth.creak(this.panner(pos.clone(), 6, 1), def.heavy); this.cap('creak', d); }
          else if (def.type === 'drip') { e.timer = 0.7 + Math.random() * 2.5; this.synth.drip(this.panner(pos.clone(), 2, 1.5)); }
          else if (def.type === 'ropes') { e.timer = 1.5 + Math.random() * 4; const off = new THREE.Vector3((Math.random() - 0.5) * 60, 1, (Math.random() - 0.5) * 60).add(pos); this.synth.ropeCreak(this.panner(off, 3, 1.4)); }
          else if (def.type === 'chimes') { e.timer = 0.4 + Math.random() * (3 - wind * 2.5); if (Math.random() < 0.3 + wind) this.synth.chime(this.panner(pos.clone(), 3, 1.3)); }
        }
        continue;
      }
      if (d > range + 10) { if (e.node) { this.killNode(e.node); e.node.parts.forEach((x) => { try { x.stop(); } catch { /**/ } }); e.node = null; } continue; }
      if (!e.node && d < range) { e.node = this.continuousNode(def, pos); this.cap(def.type, d); }
      if (!e.node) continue;
      const n = e.node;
      n.panner.positionX.setTargetAtTime(pos.x, t, 0.05); n.panner.positionY.setTargetAtTime(pos.y, t, 0.05); n.panner.positionZ.setTargetAtTime(pos.z, t, 0.05);
      let g = n.out.base;
      if (n.out.windK) g *= Math.max(0, wind - 0.2) * 1.5;
      if (n.out.dayOnly) g *= 1 - night * 0.8;
      if (n.out.crackle) g *= 0.7 + Math.random() * 0.6;
      if (n.out.fn) g *= n.out.fn();
      if (n.out.band) { if (g > 0.01) n.out.band.tick(); }
      if (n.out.lap) g = 0.12 + Math.max(0, Math.sin(t * 1.3 + pos.x)) * 0.25 * (0.4 + wind);
      n.out.gain.setTargetAtTime(g, t, 0.15);
    }
  }
  // ---- per-frame ----
  update(dt) {
    if (!this.started) return;
    const g = this.g, ac = this.ac, t = ac.currentTime;
    const cam = g.camera;
    cam.getWorldDirection(_f); _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const L = this.listener;
    if (L.positionX) {
      L.positionX.setTargetAtTime(cam.position.x, t, 0.02); L.positionY.setTargetAtTime(cam.position.y, t, 0.02); L.positionZ.setTargetAtTime(cam.position.z, t, 0.02);
      L.forwardX.setTargetAtTime(_f.x, t, 0.02); L.forwardY.setTargetAtTime(_f.y, t, 0.02); L.forwardZ.setTargetAtTime(_f.z, t, 0.02);
      L.upX.setTargetAtTime(_u.x, t, 0.02); L.upY.setTargetAtTime(_u.y, t, 0.02); L.upZ.setTargetAtTime(_u.z, t, 0.02);
    } else { L.setPosition(cam.position.x, cam.position.y, cam.position.z); L.setOrientation(_f.x, _f.y, _f.z, _u.x, _u.y, _u.z); }
    const w = g.weather.cur;
    const under = g.atmosphere.underwater;
    const depth = Math.max(0, -cam.position.y);
    const height = Math.max(0, cam.position.y);
    const indoor = g.atmosphere.indoor;
    const set = (param, v, tc = 0.3) => param.setTargetAtTime(v, t, tc);
    set(this.under.frequency, under ? Math.max(180, 700 - depth * 12) : 20000, under ? 0.08 : 0.25);
    set(this.windBed.g.gain, (0.05 + w.wind * 0.35 + height * 0.003) * (1 - indoor * 0.6));
    set(this.windBed.fl.frequency, 300 + w.wind * 500 + Math.sin(t * 0.21) * 120 + Math.sin(t * 0.07) * 160, 0.5);
    set(this.windHigh.g.gain, Math.max(0, w.wind - 0.35) * 0.08 * (1 + Math.sin(t * 0.33)) * (1 - indoor));
    set(this.seaBed.g.gain, (0.08 + w.waves * 0.12) * (0.7 + 0.3 * Math.sin(t * 0.4)) * (1 - indoor * 0.5) * (1 / (1 + height * 0.03)));
    set(this.rainBed.g.gain, w.rain * 0.22 * (1 - indoor * 0.7));
    set(this.rainLow.g.gain, w.rain * 0.18);
    set(this.underBed.g.gain, under ? 0.35 + depth * 0.004 : 0, 0.1);
    const nearSounding = Math.hypot(cam.position.x - 96, cam.position.z + 128);
    const droneK = (under ? 0.25 + depth * 0.008 : 0.04 * g.time.out.night) + Math.max(0, 1 - nearSounding / 120) * 0.25 + (g.story.finale ? 0.5 : 0);
    set(this.drone.gain, droneK, 0.8);
    // engine
    const boat = g.boat, piloting = g.player.mode === 'boat';
    const rpm = piloting && !boat.paddling && !boat.engineOff ? 0.2 + Math.abs(boat.throttle) : 0;
    this.engine.setRpm(rpm, boat.pos.distanceTo(cam.position));
    if (piloting && (boat.paddling || boat.engineOff) && Math.abs(boat.throttle) > 0.2) { this.paddleT = (this.paddleT || 0) - dt; if (this.paddleT <= 0) { this.paddleT = 1.1; this.synth.splash(this.panner(boat.pos.clone(), 2, 1), 0.3); } }
    // the hull creaks harder the faster you push it
    if (piloting && boat.speed > 2.5) { this.hullT = (this.hullT || 0) - dt * boat.speed * 0.15; if (this.hullT <= 0) { this.hullT = 2 + Math.random() * 3; this.synth.ropeCreak(this.panner(boat.pos.clone(), 2, 1.5)); } }
    // occasional far sounds
    const T = this.timers;
    T.foghorn -= dt; T.moan -= dt; T.gull -= dt;
    this.gullSilence = Math.max(0, this.gullSilence - dt);
    if (T.foghorn <= 0) { T.foghorn = 70 + Math.random() * 90; this.cap('foghorn'); const a = Math.random() * 6.28; this.synth.foghorn(this.panner(cam.position.clone().add(new THREE.Vector3(Math.cos(a) * 600, 10, Math.sin(a) * 600)), 200, 0.3)); }
    if (T.moan <= 0) { T.moan = (under ? 25 : 70) + Math.random() * 80; if (under || g.time.out.night > 0.5 || Math.random() < 0.3) this.play('deepMoan'); }
    if (T.gull <= 0) {
      T.gull = 2 + Math.random() * 7;
      if (!under && this.gullSilence <= 0 && g.time.out.night < 0.5 && w.rain < 0.5) {
        const p = g.birds?.randomBirdPos() || cam.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 120, 30, (Math.random() - 0.5) * 120));
        this.synth.gull(this.panner(p, 12, 1)); if (Math.random() < 0.3) this.cap('gull');
      }
    }
    // rain drops on surfaces
    if (w.rain > 0.1 && !under) { T.drops -= dt; if (T.drops <= 0) { T.drops = 0.05 / w.rain; this.synth.tick(this.world, 0.03 * w.rain); } }
    // radio static level
    if (this.radioOn) set(this.radioStatic.g.gain, this.radioVoice === 'static' ? 0.2 : this.radioVoice === 'numbers' ? 0.07 + (1 - g.time.out.night) * 0.06 : 0.025);
    this.updateEmitters(dt, cam.position);
    this.music?.update(dt);
    // your own breathing underwater; ear pressure at depth thresholds
    if (under) { this.br = (this.br || 0) - dt; if (this.br <= 0) { this.br = 3.4; this.synth.breath(this.master); } }
    const band = Math.floor(depth / 10);
    if (under && band > (this.lastBand ?? 0)) this.play('earPop');
    this.lastBand = under ? band : 0;
    // heartbeat on low oxygen
    const s = g.survival;
    if (s && g.player.headUnder && s.oxygen < 35) { this.hb = (this.hb || 0) - dt; if (this.hb <= 0) { this.hb = 0.5 + s.oxygen / 60; this.synth.heartbeat(this.master); } }
  }
  cap(type, d = 0) {
    const C = { creak: '[metal groans]', crowd: '[voices, bargaining]', generator: '[a generator chugs]', patrolEngine: '[a patrol engine, somewhere]', deepHum: '[a low hum from below]', fire: '[a fire crackles]', whistle: '[wind through broken glass]', gull: '[gulls]', foghorn: '[a distant foghorn]', moan: '[something vast, far below]', thunder: '[thunder]', tone: '[a deep tone shakes the water]', loudspeaker: '[a loudspeaker]', heartbeat: '[your heartbeat]' };
    if (C[type] && d < 120) this.game.ctx.events.emit('caption', C[type]);
  }
  loudspeaker(pos, dur) { if (this.started) { this.synth.voice(this.panner(pos.clone().setY(3), 30, 0.6), dur, 0.75, true); this.cap('loudspeaker'); } }
  // Drop everything but the deepest sounds for a moment before something big.
  silence(sec = 3) {
    if (!this.started) return;
    const t = this.ac.currentTime;
    this.world.gain.cancelScheduledValues(t);
    this.world.gain.setTargetAtTime(0.08, t, 0.4);
    this.world.gain.setTargetAtTime(1, t + sec, 1.5);
  }
  // ---- one-shots ----
  play(name, opts = {}) {
    if (!this.started) return;
    const s = this.synth, g = this.g, cam = g.camera.position;
    switch (name) {
      case 'answerTone': s.deepTone(this.master, 8, 0.35); this.cap('tone'); break;
      case 'ropeSnap': s.thud(this.world, 3); s.creak(this.world, true); break;
      case 'chimeSwell': for (let i = 0; i < 5; i++) setTimeout(() => s.chime(this.ui), i * 380); break;
      case 'ping': s.click(this.master, 2400); s.click(this.master, 2400, 0.9); s.click(this.master, 2400, 1.7); break;
      case 'earPop': s.thud(this.master, 0.6); break;
      case 'breath': s.breath(this.master); break;
      case 'deepMoan': this.cap('moan'); s.moan(this.panner(cam.clone().add(new THREE.Vector3((Math.random() - 0.5) * 200, -80, (Math.random() - 0.5) * 200)), 60, 0.4)); break;
      case 'deepTone': s.deepTone(this.master, 22); this.cap('tone'); break;
      case 'hydrophone': s.clicks(this.master, 9); break;
      case 'thunder': s.thunder(this.world, opts.dist || 1000); break;
      case 'pickup': s.click(this.ui, 900); s.click(this.ui, 1300, 0.06); break;
      case 'page': s.page(this.ui); break;
      case 'ui': s.click(this.ui, 700); break;
      case 'bubbles': s.bubbles(this.master, opts.n || 6); break;
      default: break;
    }
  }
  footstep(e) {
    if (!this.started) return;
    this.synth.step(this.panner(new THREE.Vector3(e.pos.x, e.pos.y, e.pos.z), 1.5, 2), e.surface, e.speed);
  }
  splash(pos, k) { if (this.started) this.synth.splash(this.panner(pos.clone(), 3, 1.2), k); }
  impact(pos, k) { if (this.started) { this.synth.thud(this.panner(pos.clone(), 4, 1), k); this.synth.creak(this.panner(pos.clone(), 4, 1), true); } }
  speak(pos, dur, scale = 1) { if (this.started) this.synth.voice(this.panner(pos.clone().setY(pos.y + 1.6), 2, 1.6), dur, 1 / scale); }
  radioTune(voice) {
    if (!this.started) return;
    this.radioOn = !!voice; this.radioVoice = voice;
    const t = this.ac.currentTime;
    this.radio.gain.setTargetAtTime(voice ? 0.9 : 0, t, 0.05);
    this.radioStatic.g.gain.setTargetAtTime(voice ? 0.2 : 0, t, 0.02);
    if (voice) this.radioStatic.g.gain.setTargetAtTime(0.03, t + 0.6, 0.2);
  }
  radioSpeak(voice, dur, text, pitch = 0.85) {
    if (!this.started || !this.radioOn) return;
    if (voice === 'numbers') this.synth.numbersVoice(this.radioIn, dur);
    else if (voice === 'song') this.synth.sing(this.radioIn, dur);
    else if (voice === 'hymn') { this.synth.sing(this.radioIn, dur, 0.8); this.synth.sing(this.radioIn, dur, 1.2); }
    else this.synth.voice(this.radioIn, dur, pitch, true);
  }
}

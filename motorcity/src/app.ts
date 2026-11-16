/** Application controller: owns the renderer, the current race, screens and the save. */
import { Renderer } from './render/renderer';
import { Film } from './render/film';
import { Hud } from './render/hud';
import { Race, type RaceOpts } from './game/race';
import { input } from './core/input';
import { TouchControls } from './ui/controls';
import { HudDom } from './ui/hudDom';
import { load, store, type SaveData } from './save/save';
import { audio, type MusicId } from './audio/audio';
import { trackById } from './track/tracks';
import { PAINTS } from './data/cars';
import { setClickSound, toast } from './ui/dom';

const OFF = { on: false, boost: false, offroad: false, spin: false };

export class App {
  cv: HTMLCanvasElement;
  renderer: Renderer;
  film = new Film();
  hud = new Hud();
  hudDom = new HudDom();
  controls = new TouchControls();
  save: SaveData;
  race: Race | null = null;
  attract: Race | null = null;
  paused = false;
  ui: HTMLElement;
  onRaceEnd: ((r: Race) => void) | null = null;
  private endTimer = -1;
  private frameTimes: number[] = [];
  safeTop = 0; safeL = 0; safeR = 0;

  constructor() {
    this.cv = document.getElementById('game') as HTMLCanvasElement;
    this.ui = document.getElementById('ui')!;
    this.renderer = new Renderer(this.cv);
    this.save = load();
    setClickSound(() => audio.click());
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { audio.suspend(); if (this.race && !this.paused && this.race.state !== 'finished') this.pause(); }
      else audio.resume();
    });
    const first = () => { audio.init(); this.applyVolumes(); window.removeEventListener('pointerdown', first); window.removeEventListener('keydown', first); };
    window.addEventListener('pointerdown', first);
    window.addEventListener('keydown', first);
    document.getElementById('btn-pause')!.addEventListener('click', () => this.pause());
    input.tiltEnabled = this.save.settings.tilt;
    // Debug mode — press D, or tap the pause button 5 times: draws every hitbox, the kerb and the soft
    // walls, and logs each collision (type, position, lane, effect) on screen and to the console.
    input.anyKeyListeners.push((e) => { if (e.code === 'KeyD' && !e.repeat) this.toggleDebug(); });
    const pauseBtn = document.getElementById('btn-pause')!;
    let taps: number[] = [];
    pauseBtn.addEventListener('pointerdown', () => {
      const now = performance.now();
      taps = taps.filter((x) => now - x < 2500); taps.push(now);
      if (taps.length >= 5) { taps = []; this.toggleDebug(); }
    });
    this.resize();
  }

  resize() {
    this.renderer.resize();
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) 0 env(safe-area-inset-left,0px)';
    document.body.append(probe);
    const cs = getComputedStyle(probe);
    const st = parseFloat(cs.paddingTop) || 0, sl = parseFloat(cs.paddingLeft) || 0, sr = parseFloat(cs.paddingRight) || 0;
    probe.remove();
    // safe-area insets in low-res canvas pixels, so the canvas HUD clears notches and the home indicator
    this.safeTop = Math.round((st / window.innerHeight) * this.renderer.H);
    this.safeL = Math.round((sl / window.innerWidth) * this.renderer.W);
    this.safeR = Math.round((sr / window.innerWidth) * this.renderer.W);
  }

  debug = false;
  private hitLog = document.getElementById('hitlog')!;
  private hitsShown = 0;
  toggleDebug() {
    this.debug = !this.debug;
    this.renderer.debug = this.debug;
    if (this.race) this.race.debug = this.debug;
    this.hitLog.hidden = !this.debug;
    this.hitLog.innerHTML = '';
    this.hitsShown = this.race?.hits.length ?? 0;
    toast(this.debug ? 'Debug: hitboxes and collision log ON' : 'Debug: off');
  }
  /** Debug overlay: the latest collisions, newest first. */
  private updateHitLog() {
    const r = this.race;
    if (!this.debug || !r || r.hits.length === this.hitsShown) return;
    for (; this.hitsShown < r.hits.length; this.hitsShown++) {
      const h = r.hits[this.hitsShown];
      const row = document.createElement('div');
      row.textContent = `${h.t.toFixed(1)}s  ${h.kind.toUpperCase()} ${h.id} · ${h.lane} · z ${h.objZ} x ${h.objX.toFixed(2)} · gap ${h.dz}/${h.dx.toFixed(2)} · ${h.effect} · ${h.speedBefore}→${h.speedAfter}`;
      this.hitLog.prepend(row);
    }
    while (this.hitLog.children.length > 6) this.hitLog.lastElementChild!.remove();
  }

  persist() { store(this.save); }
  applyVolumes() { const s = this.save.settings; audio.setVolumes(s.master, s.sfx, s.music); }
  music(id: MusicId | null) { audio.music(id); }

  paintHex(car = this.save.car) { const id = this.save.paints[car] ?? 'carmine'; return (PAINTS.find((p) => p.id === id) ?? PAINTS[0]).hex; }

  startAttract() {
    const ids = ['woodward', 'depot', 'fifth', 'belleisle', 'brooklyn'];
    const id = ids[Math.floor(Math.random() * ids.length)];
    const weathers = ['overcast', 'clear', 'dusk', 'night', 'rain'] as const;
    this.attract = new Race({ track: trackById(id), weather: weathers[Math.floor(Math.random() * weathers.length)], mode: 'attract', car: this.save.car, paint: this.paintHex(), upgrades: {}, rivals: 5, difficulty: 0.95, laps: 99 });
  }

  startRace(opts: RaceOpts, onEnd: (r: Race) => void) {
    this.race = new Race(opts);
    this.race.debug = this.debug;
    this.hitsShown = 0; this.hitLog.innerHTML = '';
    this.attract = null;
    this.onRaceEnd = onEnd;
    this.endTimer = -1;
    this.paused = false;
    this.controls.show(true, this.save.settings.tilt);
    this.hudDom.show(true, this.race);
    this.music(opts.weather === 'night' ? 'night' : 'race');
  }

  endRace() {
    this.race = null;
    this.controls.show(false, false);
    this.hudDom.show(false, null);
    audio.engine(0, OFF);
    audio.skid(0); audio.crowd(0); audio.rivals(0); audio.rain(false);
  }

  pauseHandler: (() => void) | null = null;
  pause() {
    if (!this.race || this.paused) return;
    this.paused = true;
    this.controls.show(false, false);
    audio.engine(0, OFF);
    audio.skid(0);
    this.pauseHandler?.();
  }
  unpause() {
    if (!this.race) return;
    this.paused = false;
    input.clearPressed();
    this.controls.show(true, this.save.settings.tilt);
  }

  update(dt: number) {
    input.poll();
    if (this.race && !this.paused) {
      if (input.pressed('pause')) { this.pause(); return; }
      const r = this.race;
      r.update(dt, { steer: input.steer, brake: input.held.brake, boost: input.pressed('boost') || (input.held.boost && r.player.boostT <= 0 && r.player.boost >= 1), horn: input.pressed('horn') });
      audio.rain(r.weather.rain);
      if (r.state === 'finished' && this.endTimer < 0) this.endTimer = 3.2;
      if (this.endTimer > 0) { this.endTimer -= dt; if (this.endTimer <= 0) { const cb = this.onRaceEnd; this.endRace(); cb?.(r); } }
    } else if (this.attract) {
      this.attract.update(dt, { steer: 0, brake: false, boost: false, horn: false });
      audio.engine(0, OFF);
      audio.crowd(0); audio.skid(0); audio.rivals(0);
    } else input.clearPressed();
  }

  render(dt: number, alpha = 1) {
    const t0 = performance.now();
    const r = this.race ?? this.attract;
    const ctx = this.renderer.ctx;
    if (r) {
      this.renderer.render(r.scene(alpha));
      if (this.race) {
        const hs = this.race.hud();
        ctx.save(); ctx.translate(0, this.safeTop);
        this.hud.draw(ctx, this.renderer.W, this.renderer.H, { ...hs, portrait: this.renderer.portrait, dt, safeL: this.safeL, safeR: this.safeR });
        ctx.restore();
        this.hudDom.update(this.race);
        this.updateHitLog();
        this.controls.cooldown('horn', this.race.hornCool / this.race.hornMax);
        const p = this.race.player;
        this.controls.cooldown('boost', p.boost >= 1 ? 0 : 1 - (p.boost % 1), p.boost >= 1 && p.boostT <= 0);
      }
    } else { ctx.fillStyle = '#0d0a07'; ctx.fillRect(0, 0, this.renderer.W, this.renderer.H); }
    this.film.apply(ctx, this.renderer.W, this.renderer.H, dt, this.save.settings.film);
    const wv = this.film.weave;
    this.cv.style.transform = wv.x || wv.y ? `translate(${wv.x.toFixed(2)}px, ${wv.y.toFixed(2)}px) scale(1.005)` : 'none';
    // adaptive quality: shorten draw distance if frames are slow
    const ft = performance.now() - t0;
    this.frameTimes.push(ft);
    if (this.frameTimes.length >= 60) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      this.frameTimes.length = 0;
      const q = this.renderer.quality;
      if (avg > 11 && q > 0.55) this.renderer.quality = q - 0.1;
      else if (avg < 6 && q < 1) this.renderer.quality = Math.min(1, q + 0.05);
    }
  }
}

// Public audio API for Motor City 1915. Everything is synthesized with the
// Web Audio API; every method is a safe no-op until init() has run from a user
// gesture (or when Web Audio is unavailable).

import { Core, clamp, gain, getAudioCtor, makeBank } from './core';
import { EngineVoice, GearBox, RivalVoice } from './engine';
import { CrowdLayer, RainLayer, SkidLayer } from './layers';
import { Music } from './music';
import type { MusicId } from './music';
import { Sfx } from './sfx';

export type { MusicId } from './music';

export interface Audio {
  init(): void;
  readonly ready: boolean;
  setVolumes(master: number, sfx: number, music: number): void;
  suspend(): void;
  resume(): void;
  engine(speedPct: number, opts: { on: boolean; boost: boolean; offroad: boolean; spin: boolean }): number;
  skid(intensity: number): void;
  crowd(intensity: number): void;
  rain(on: boolean): void;
  rivals(nearPct: number): void;
  horn(): void;
  /** Deep two-tone horn (the Gatsby). */
  hornDeep(): void;
  backfire(): void;
  crash(): void;
  bump(): void;
  scrape(): void;
  cheer(): void;
  whinny(): void;
  clop(): void;
  trolleyBell(): void;
  steam(): void;
  countdown(final: boolean): void;
  click(): void;
  coin(): void;
  gearShift(): void;
  music(id: MusicId | null): void;
  musicEnabled: boolean;
}

interface Parts {
  core: Core;
  master: GainNode;
  engine: EngineVoice;
  rivals: RivalVoice;
  skid: SkidLayer;
  crowd: CrowdLayer;
  rain: RainLayer;
  sfx: Sfx;
  music: Music;
}

const vol01 = (v: number): number => clamp(Number.isFinite(v) ? v : 0, 0, 1);

function tryPromise(p: unknown): void {
  if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => undefined);
}

class AudioImpl implements Audio {
  private p: Parts | null = null;
  private failed = false;
  private userSuspended = false;
  private volMaster = 0.9;
  private volSfx = 1;
  private volMusic = 0.6;
  private _musicEnabled = true;
  private wantMusic: MusicId | null = null;
  private wantRain = false;
  private readonly gears = new GearBox();

  get ready(): boolean {
    return this.p !== null;
  }

  get musicEnabled(): boolean {
    return this._musicEnabled;
  }

  set musicEnabled(v: boolean) {
    this._musicEnabled = !!v;
    const p = this.p;
    if (!p) return;
    p.music.enabled = this._musicEnabled;
    this.applyVolumes();
  }

  init(): void {
    if (this.p) {
      // Idempotent, but a later gesture is also a chance to un-stick iOS.
      if (!this.userSuspended) this.kick();
      return;
    }
    if (this.failed) return;
    const Ctor = getAudioCtor();
    if (!Ctor) {
      this.failed = true;
      return;
    }
    let ctx: AudioContext;
    try {
      try {
        ctx = new Ctor({ latencyHint: 'interactive' });
      } catch {
        ctx = new Ctor();
      }
    } catch {
      this.failed = true;
      return;
    }
    try {
      tryPromise(ctx.resume());
      // iOS unlock: play a one-sample silent buffer inside the gesture.
      const silent = ctx.createBuffer(1, 1, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = silent;
      src.connect(ctx.destination);
      src.start(0);

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 12;
      comp.ratio.value = 6;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;
      comp.connect(ctx.destination);
      const master = gain(ctx, 0, comp);
      const sfxBus = gain(ctx, 0, master);
      const musicBus = gain(ctx, 0, master);
      const core: Core = { ctx, sfx: sfxBus, music: musicBus, bank: makeBank(ctx) };
      const music = new Music(core);
      music.enabled = this._musicEnabled;
      this.p = {
        core,
        master,
        engine: new EngineVoice(core),
        rivals: new RivalVoice(core),
        skid: new SkidLayer(core),
        crowd: new CrowdLayer(core),
        rain: new RainLayer(core),
        sfx: new Sfx(core),
        music,
      };
    } catch (e) {
      this.p = null;
      this.failed = true;
      try {
        tryPromise(ctx.close());
      } catch {
        /* ignore */
      }
      if (typeof console !== 'undefined') console.warn('[audio] init failed', e);
      return;
    }
    this.applyVolumes();
    if (this.wantRain) this.p.rain.set(true);
    if (this.wantMusic) this.p.music.play(this.wantMusic);
    // iOS can "interrupt" the context (calls, Siri, lock screen); any later
    // touch is a valid gesture to bring it back.
    if (typeof document !== 'undefined') {
      const unstick = (): void => {
        if (!this.userSuspended) this.kick();
      };
      document.addEventListener('pointerdown', unstick, { passive: true, capture: true });
      document.addEventListener('touchend', unstick, { passive: true, capture: true });
      document.addEventListener('keydown', unstick, { passive: true, capture: true });
    }
  }

  private kick(): void {
    const p = this.p;
    if (!p) return;
    const st = p.core.ctx.state as string;
    if (st !== 'running' && st !== 'closed') {
      try {
        tryPromise(p.core.ctx.resume());
      } catch {
        /* ignore */
      }
    }
  }

  private applyVolumes(): void {
    const p = this.p;
    if (!p) return;
    const t = p.core.ctx.currentTime;
    p.master.gain.setTargetAtTime(this.volMaster, t, 0.05);
    p.core.sfx.gain.setTargetAtTime(this.volSfx, t, 0.05);
    p.core.music.gain.setTargetAtTime(this._musicEnabled ? this.volMusic : 0, t, 0.15);
  }

  setVolumes(master: number, sfx: number, music: number): void {
    this.volMaster = vol01(master);
    this.volSfx = vol01(sfx);
    this.volMusic = vol01(music);
    this.applyVolumes();
  }

  suspend(): void {
    this.userSuspended = true;
    const p = this.p;
    if (!p) return;
    try {
      if (p.core.ctx.state === 'running') tryPromise(p.core.ctx.suspend());
    } catch {
      /* ignore */
    }
  }

  resume(): void {
    this.userSuspended = false;
    this.kick();
  }

  // ---- continuous layers --------------------------------------------------

  engine(speedPct: number, opts: { on: boolean; boost: boolean; offroad: boolean; spin: boolean }): number {
    const shift = this.gears.update(speedPct);
    const p = this.p;
    if (p) {
      if (shift !== 0 && opts.on && !opts.spin) {
        p.engine.dip();
        p.sfx.gearShift();
      }
      p.engine.update(this.gears.rpm, opts);
      p.rivals.update(this.rivalNear, p.engine.fire);
    }
    return this.gears.gear;
  }

  private rivalNear = 0;

  skid(intensity: number): void {
    this.p?.skid.update(intensity);
  }

  crowd(intensity: number): void {
    this.p?.crowd.update(intensity);
  }

  rain(on: boolean): void {
    this.wantRain = !!on;
    this.p?.rain.set(this.wantRain);
  }

  rivals(nearPct: number): void {
    this.rivalNear = vol01(nearPct);
    const p = this.p;
    if (p) p.rivals.update(this.rivalNear, p.engine.fire);
  }

  // ---- one-shots ------------------------------------------------------------

  /** Run a one-shot; never lets a Web Audio quirk throw into the game loop. */
  private fx(fn: (s: Sfx) => void): void {
    const p = this.p;
    if (!p || p.core.ctx.state === 'closed') return;
    try {
      fn(p.sfx);
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('[audio]', e);
    }
  }

  horn(): void { this.fx((s) => s.horn()); }
  hornDeep(): void { this.fx((s) => s.hornDeep()); }
  backfire(): void { this.fx((s) => s.backfire()); }
  crash(): void { this.fx((s) => s.crash()); }
  bump(): void { this.fx((s) => s.bump()); }
  scrape(): void { this.fx((s) => s.scrape()); }
  cheer(): void { this.fx((s) => s.cheer()); }
  whinny(): void { this.fx((s) => s.whinny()); }
  clop(): void { this.fx((s) => s.clop()); }
  trolleyBell(): void { this.fx((s) => s.trolleyBell()); }
  steam(): void { this.fx((s) => s.steam()); }
  countdown(final: boolean): void { this.fx((s) => s.countdown(!!final)); }
  click(): void { this.fx((s) => s.click()); }
  coin(): void { this.fx((s) => s.coin()); }

  gearShift(): void {
    const p = this.p;
    if (!p) return;
    p.engine.dip();
    this.fx((s) => s.gearShift());
  }

  music(id: MusicId | null): void {
    this.wantMusic = id;
    this.p?.music.play(id);
  }
}

export const audio: Audio = new AudioImpl();

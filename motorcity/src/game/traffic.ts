/** Slow street traffic: horse carriages, trolleys on the rails, delivery trucks. */
import { Rng } from '../core/rng';
import { wrap, approach, clamp } from '../core/math';
import { SEG_LEN, type Segment } from '../track/types';
import type { Mover } from './ai';

export type TrafficKind = 'carriage' | 'trolley' | 'truck' | 'wagon';

export class Traffic implements Mover {
  kind: TrafficKind;
  z: number; x: number; speed: number; base: number;
  half: number; len: number;
  variant: number;
  shyT = 0; shyDir = 0;
  rearT = 0;
  bob = 0;
  wheel = 0;
  constructor(kind: TrafficKind, z: number, x: number, rng: Rng) {
    this.kind = kind; this.z = z; this.x = x;
    this.variant = rng.int(0, 2);
    this.base = kind === 'trolley' ? 2600 : kind === 'truck' ? 3600 : kind === 'wagon' ? 2000 : 2400;
    this.base *= rng.range(0.9, 1.1);
    this.speed = this.base;
    this.half = kind === 'trolley' ? 0.32 : kind === 'truck' ? 0.27 : 0.25;
    this.len = kind === 'trolley' ? 2000 : kind === 'truck' ? 1000 : 1300;
  }
  update(dt: number, segs: Segment[], t: number) {
    const seg = segs[Math.floor(this.z / SEG_LEN) % segs.length];
    let target = this.base;
    if (this.rearT > 0) { this.rearT -= dt; target = 0; }
    if (this.shyT > 0) {
      this.shyT -= dt;
      this.x = clamp(this.x + this.shyDir * dt * 0.8, -0.85, 0.85);
    }
    if (this.kind === 'trolley') this.x = approach(this.x, 0, dt * 0.3);
    this.speed = approach(this.speed, target, dt * 3000);
    this.z += this.speed * dt;
    this.bob = Math.sin(t * (this.kind === 'carriage' || this.kind === 'wagon' ? 9 : 14) + this.z * 0.001);
    this.wheel += this.speed * dt * 0.004;
    void seg;
  }
  horn(px: number, rng: Rng): string | null {
    if (this.kind === 'trolley') return 'bell';
    if (this.kind === 'carriage' || this.kind === 'wagon') {
      this.shyT = 1.2; this.shyDir = this.x >= px ? 1 : -1;
      if (rng.chance(0.5)) this.rearT = 0.7;
      return 'whinny';
    }
    this.shyT = 0.8; this.shyDir = this.x >= px ? 1 : -1;
    return null;
  }
}

/** Keeps a handful of vehicles circulating near the player. */
export class TrafficManager {
  list: Traffic[] = [];
  private rng: Rng;
  constructor(private segs: Segment[], private trackLen: number, density: number, seed: number) {
    this.rng = new Rng(seed);
    const n = Math.round(density);
    for (let i = 0; i < n; i++) this.list.push(this.spawn(SEG_LEN * (60 + (i * (segs.length - 80)) / Math.max(1, n))));
  }
  private spawn(z: number): Traffic {
    z = wrap(z, this.trackLen);
    const seg = this.segs[Math.floor(z / SEG_LEN) % this.segs.length];
    let kind: TrafficKind;
    if (seg.rails && this.rng.chance(0.5)) kind = 'trolley';
    else if (seg.zone === 'park' || seg.zone === 'river') kind = this.rng.chance(0.75) ? 'carriage' : 'wagon';
    else if (seg.zone === 'industrial') kind = this.rng.chance(0.7) ? 'truck' : 'wagon';
    else kind = this.rng.pick(['carriage', 'truck', 'wagon', 'carriage'] as const);
    const x = kind === 'trolley' ? 0 : (this.rng.chance(0.5) ? -1 : 1) * this.rng.range(0.4, 0.7);
    return new Traffic(kind, z, x, this.rng);
  }
  update(dt: number, playerZ: number, t: number, active: boolean) {
    for (let i = 0; i < this.list.length; i++) {
      const v = this.list[i];
      if (active) v.update(dt, this.segs, t);
      const behind = wrap(playerZ - v.z, this.trackLen);
      if (behind < this.trackLen / 2 && behind > 30 * SEG_LEN) {
        // recycle well ahead, out of sight
        this.list[i] = this.spawn(playerZ + SEG_LEN * this.rng.range(160, 320));
      }
    }
  }
}

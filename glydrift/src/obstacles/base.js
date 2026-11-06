// © 2026 Sam Eyde III. All rights reserved. Glydrift — see LICENSE. Not open source.
// Base class and helpers shared by every obstacle. Collision uses signed clearance
// (see geometry.js); hitboxes follow exactly what is drawn.
import Phaser from "phaser";
import { S } from "../pixel/px.js";

/** How far a pillar/stalk reaches past the screen edge. */
export const OFF = 600;
/** Spiked gate-cap height (art 12 px). */
export const CAP_H = 12 * S;
/** Lethal parts and warnings draw above the Abyss darkness (depth 20) so nothing is hidden. */
export const HAZ_TOP = 21;
export const ADD = Phaser.BlendModes.ADD;
export const TAU = Math.PI * 2;
/** Snap to the art-pixel grid. */
export const snap = (v) => Math.round(v / S) * S;
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Seconds until the player reaches this obstacle's x (-1 if already past). */
export function eta(o) {
  const m = o.mgr;
  const d = o.x - m.px;
  return d < 0 ? -1 : d / Math.max(60, m.scroll);
}

export class PxObstacle {
  constructor(mgr) {
    this.mgr = mgr;
    this.scene = mgr.scene;
    this.active = false;
    this.objects = [];
    this.lit = 0;
    this.kind = "obstacle";
  }
  add(obj) {
    this.objects.push(obj);
    obj.setVisible(false);
    return obj;
  }
  get theme() {
    return this.mgr.theme;
  }
  arm(x) {
    this.x = x;
    this.active = true;
    this.passed = false;
    this.centerSeen = false;
    this.inWard = false; // RONIN's Fire Ward state from a previous use
    this.minClear = Infinity;
    this.t = 0;
    for (const o of this.objects) o.setVisible(true);
  }
  kill() {
    this.active = false;
    for (const o of this.objects) o.setVisible(false);
  }
  get left() {
    return this.x - this.halfW;
  }
  get right() {
    return this.x + this.halfW;
  }
}

/** Harmless fields: the manager asks inside() and lets them add their effect to the frame. */
export class Field extends PxObstacle {
  constructor(mgr, type, tex, alpha) {
    super(mgr);
    this.type = type;
    this.kind = "field";
    this.strip = this.add(
      this.scene.add.tileSprite(0, 0, 100, 100, tex).setOrigin(0.5, 0).setDepth(1).setAlpha(alpha),
    );
  }
  arm(x) {
    super.arm(x);
    this.strip.setTileScale(S);
  }
  inside(px) {
    return Math.abs(px - this.x) < this.halfW;
  }
  clearance() {
    return Infinity;
  }
}

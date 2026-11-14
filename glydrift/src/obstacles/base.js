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
    this.inPhase = false; // WASP LORD is inside it right now (phasing through)
    this.phasedThrough = false; // ...at any point of this pass (no CLOSE! / PERFECT! for it)
    this.perfectPending = false;
    this.minClear = Infinity;
    this.t = 0;
    for (const o of this.objects) o.setVisible(true);
  }
  kill() {
    this.active = false;
    this.phaseClear();
    for (const o of this.objects) o.setVisible(false);
  }
  /**
   * WASP LORD is phasing through: the obstacle's sprites flicker (alpha × k this frame). The
   * hazard's own update may set an alpha every frame (warnings, blink blocks), so a value that
   * changed since the last flicker is taken as the new base; phaseClear puts the base back.
   */
  phaseFlicker(k) {
    const m = (this.phaseAlpha ||= new Map());
    for (const obj of this.objects) {
      if (!obj.visible || obj.setAlpha === undefined) continue;
      const was = m.get(obj);
      const base = was && Math.abs(obj.alpha - was.out) < 1e-4 ? was.base : obj.alpha;
      const out = base * k;
      obj.setAlpha(out);
      m.set(obj, { base, out });
    }
  }
  phaseClear() {
    if (!this.phaseAlpha) return;
    for (const [obj, { base, out }] of this.phaseAlpha)
      if (Math.abs(obj.alpha - out) < 1e-4) obj.setAlpha(base);
    this.phaseAlpha = null;
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

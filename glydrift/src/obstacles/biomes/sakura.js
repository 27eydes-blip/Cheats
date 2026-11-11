// Sakura Skies (gentle, a small step up from the Neon Void): TempleBell (a red bell swinging on
// a rope; its whole swing is dotted on the sky, only the bell hurts), BambooBlade (a red
// bamboo staff with leaf blades spinning slowly about its hub), PaperLantern (hangs high,
// flickers inside a red warning ring with its drop line showing, then falls) and WindGust
// (harmless field: white petal streaks push the bird gently up or down).
//
// Everything lethal is deep red with a near-black outline (see sakuraHazardArt.js) and its
// hitbox follows the drawn shape. Reduce Flashing: the lantern doesn't flicker, its warning
// ring pulses softly instead.
import { reduceFlashing } from "../../effects/ScreenFlash.js";
import { S } from "../../pixel/px.js";
import { BAMBOO, BELL, LANTERN } from "../../pixel/sakuraHazardArt.js";
import { clamp01, eta, Field, HAZ_TOP, OFF, PxObstacle, snap, TAU } from "../base.js";
import { circleClear, segClear } from "../geometry.js";
import { lay } from "./prism.js";

/** Sakura tuning (kept here, next to the hazards it tunes). */
export const SAKURA = {
  lanternWarn: 0.95, // seconds a lantern flickers before it drops
  lanternGravity: 1200, // px/s² (paper: slower than a meteor's 1700 px/s straight drop)
  lanternMaxFall: 720, // px/s
  gustPush: 900, // px/s² (the Tidal current pushes 1500; gravity pulls 2750)
};

// ------------------------------------------------------------------ temple bell
export class TempleBell extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "bell";
    // the swing's path, dotted faintly on the sky (drawn once per spawn, then only moved)
    this.arc = this.add(this.scene.add.graphics().setDepth(HAZ_TOP - 0.3));
    this.rope = this.add(
      this.scene.add
        .tileSprite(0, 0, 4 * S, 100, "sk_rope")
        .setOrigin(0.5, 0)
        .setDepth(HAZ_TOP - 0.2),
    );
    this.bracket = this.add(
      this.scene.add.image(0, 0, "skh", "bracket").setOrigin(0.5, 0.25).setDepth(HAZ_TOP - 0.1),
    );
    this.bell = this.add(
      this.scene.add
        .image(0, 0, "skh", "bell")
        .setOrigin((BELL.cx + 0.5) / BELL.w, (BELL.cy + 0.5) / BELL.h)
        .setDepth(HAZ_TOP),
    );
  }
  /** Half the width a bell's swing covers (the spawner lays patterns out with it). */
  static halfWFor(L, amp) {
    return Math.sin(amp) * L + BELL.r * S + 8;
  }
  spawn(x, { L, amp = 0.42, period = 2.9, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { L, amp, period, phase });
    this.ay = -S * 2;
    this.bc = 1;
    this.bs = 0;
    this.halfW = TempleBell.halfWFor(L, amp);
    // dotted arc of the bell's centre (+ end ticks), in pivot-local coordinates
    const g = this.arc.clear();
    g.fillStyle(0x7a0a14, 0.4);
    const N = 18;
    for (let i = 0; i <= N; i++) {
      const a = -amp + (2 * amp * i) / N;
      g.fillRect(snap(Math.sin(a) * L) - S, snap(Math.cos(a) * L) - S, 2 * S, 2 * S);
    }
  }
  update(dt, clock) {
    const a = this.amp * Math.sin((clock / this.period + this.phase) * TAU);
    const s = Math.sin(a);
    const c = Math.cos(a);
    this.bx = this.x + s * this.L;
    this.by = this.ay + c * this.L;
    this.bc = c; // (the bell's tilt, for its lip and shoulders in clearance())
    this.bs = s;
    const top = this.L - BELL.cy * S; // the rope ends at the bell's hanging loop
    lay(this.rope, this.x, this.ay, this.x + s * top, this.ay + c * top);
    this.arc.setPosition(snap(this.x), this.ay);
    this.bracket.setPosition(snap(this.x), 0);
    this.bell.setPosition(snap(this.bx), snap(this.by)).setRotation(-a);
  }
  clearance(px, py, r) {
    // the round body, plus the flared lip and the shoulders (a circle alone left the lip's
    // corners, drawn ~11 px wider than it, safe to fly through: the bird could visibly
    // overlap the bell by ~21 px and live). Points are bell-local art px, tilted with the bell.
    const { bx, by, bc: c, bs: s } = this;
    const X = (u, v) => bx + (u * c + v * s) * S;
    const Y = (u, v) => by + (v * c - u * s) * S;
    return Math.min(
      circleClear(px, py, r, bx, by, BELL.r * S),
      segClear(px, py, r, X(-8.5, 7.5), Y(-8.5, 7.5), X(8.5, 7.5), Y(8.5, 7.5), 1.5 * S),
      segClear(px, py, r, X(-3.5, -7.5), Y(-3.5, -7.5), X(3.5, -7.5), Y(3.5, -7.5), 2.5 * S),
    );
  }
}

// ------------------------------------------------------------------ bamboo blade
export class BambooBlade extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "bamboo";
    this.img = this.add(this.scene.add.image(0, 0, "skh", "bamboo_s").setDepth(HAZ_TOP));
  }
  spawn(x, { y, long = false, speed = 1.3, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { y, speed, phase });
    const D = long ? BAMBOO.long : BAMBOO.short;
    this.img.setFrame(long ? "bamboo_l" : "bamboo_s");
    this.hl = (D / 2) * S; // hub to blade tip (px)
    this.halfW = this.hl + 8;
  }
  update(dt, clock) {
    // turns in 32 crisp steps (smooth rotation would smear the pixels)
    const steps = 32;
    const a = Math.round(((clock * this.speed + this.phase) / TAU) * steps) * (TAU / steps);
    this.ca = Math.cos(a);
    this.sa = Math.sin(a);
    this.img.setPosition(snap(this.x), snap(this.y)).setRotation(a);
  }
  clearance(px, py, r) {
    // The staff (5 px + outline) out to where the leaf blades start, each pointed leaf as
    // three capsules that narrow toward its tip, and the hub. (One full-width capsule out to
    // the tip used to reach ~16 px past the drawn point: a clear miss off the tip killed.)
    const { x, y, ca, sa } = this;
    const hl = this.hl;
    let m = circleClear(px, py, r, x, y, 4.5 * S);
    const ux = ca * hl;
    const uy = sa * hl;
    for (const k of [1, -1]) {
      // point `u` art px in from this end's tip
      const PX = (u) => x + k * (ux - ca * u * S);
      const PY = (u) => y + k * (uy - sa * u * S);
      m = Math.min(
        m,
        segClear(px, py, r, x, y, PX(8.5), PY(8.5), 3.5 * S),
        segClear(px, py, r, PX(8.5), PY(8.5), PX(7.5), PY(7.5), 5.5 * S),
        segClear(px, py, r, PX(7.5), PY(7.5), PX(5), PY(5), 4.2 * S),
        segClear(px, py, r, PX(5), PY(5), PX(2.5), PY(2.5), 2.8 * S),
      );
    }
    return m;
  }
}

// ------------------------------------------------------------------ paper lantern
export class PaperLantern extends PxObstacle {
  constructor(mgr) {
    super(mgr);
    this.type = "lantern";
    this.drop = this.add(
      this.scene.add
        .tileSprite(0, 0, 2 * S, 100, "sk_drop")
        .setOrigin(0.5, 0)
        .setDepth(1),
    );
    this.cord = this.add(
      this.scene.add
        .tileSprite(0, 0, 2 * S, 100, "sk_cord")
        .setOrigin(0.5, 0)
        .setDepth(HAZ_TOP - 0.2),
    );
    this.ring = this.add(this.scene.add.image(0, 0, "skh", "lantern_ring").setDepth(HAZ_TOP - 0.1));
    this.img = this.add(this.scene.add.image(0, 0, "skh", "lantern_0").setDepth(HAZ_TOP));
  }
  spawn(x, { y, lead = 1.7, phase = 0 }) {
    this.arm(x);
    Object.assign(this, { y0: y, y, lead, phase });
    this.halfW = (LANTERN.w / 2 + 1) * S;
    this.state = "hang";
    this.timer = 0;
    this.vy = 0;
    this.calm = reduceFlashing(); // read once per lantern (a settings change applies to the next)
    this.drop.setVisible(false);
    this.ring.setVisible(false);
    this.img.setFrame("lantern_0").setRotation(0);
  }
  update(dt, clock) {
    const H = this.mgr.H;
    if (this.state === "hang") {
      const t = eta(this);
      if (t >= 0 && t < this.lead) {
        this.state = "warn";
        this.timer = 0;
      }
    } else if (this.state === "warn") {
      this.timer += dt;
      if (this.timer >= SAKURA.lanternWarn) {
        this.state = "fall";
        this.timer = 0;
        this.mgr.fx.burst("pixel", this.x, this.y - 10 * S, 4, 0x4a2e20, {
          speed: { min: 40, max: 140 },
        });
      }
    } else if (this.state === "fall") {
      this.timer += dt;
      this.vy = Math.min(SAKURA.lanternMaxFall, this.vy + SAKURA.lanternGravity * dt);
      this.y += this.vy * dt;
      if (this.y > H - 6 * S) {
        this.state = "done";
        // it bursts into paper scraps and embers on the ground
        this.mgr.fx.burst("pixel", this.x, H - 8 * S, 14, 0xcc2a28, {
          angle: { min: 200, max: 340 },
          speed: { min: 90, max: 320 },
        });
        this.mgr.fx.burst("pixel", this.x, H - 8 * S, 6, 0xffc060, {
          angle: { min: 220, max: 320 },
          speed: { min: 60, max: 220 },
        });
        this.mgr.onImpact?.(this);
      }
    }
    const st = this.state;
    const warn = st === "warn";
    // hanging lanterns sway a little; a warning one shakes on its cord
    const sway = st === "fall" ? 0 : Math.sin(clock * 1.6 + this.phase * TAU) * S * (warn ? 1.5 : 0.75);
    this.cx = this.x + sway;
    const lx = snap(this.cx);
    const ly = snap(this.y);
    this.img.setVisible(st !== "done").setPosition(lx, ly);
    if (st === "fall") this.img.setRotation(Math.sin(this.timer * 9) * 0.12);
    // the flicker: the light inside stutters (Reduce Flashing: it stays lit, the ring pulses)
    let lit = true;
    if (warn && !this.calm) lit = Math.sin(this.timer * 31) + Math.sin(this.timer * 19.3) > -0.4;
    this.img.setFrame(lit ? "lantern_0" : "lantern_1");
    const k = clamp01(this.timer / SAKURA.lanternWarn);
    this.ring
      .setVisible(warn)
      .setPosition(lx, ly)
      .setAlpha(this.calm ? 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(this.timer * TAU * 1.4)) : 0.5 + 0.45 * k);
    // the drop line: where it will fall (from the lantern to the ground)
    const below = ly + LANTERN.h * 0.5 * S;
    this.drop
      .setVisible(warn || st === "fall")
      .setPosition(lx, below)
      .setSize(2 * S, Math.max(4, H - below))
      .setAlpha(warn ? 0.35 + 0.45 * k : 0.6);
    this.cord
      .setVisible(st === "hang" || warn)
      .setPosition(lx, -S * 2)
      .setSize(2 * S, Math.max(4, ly - LANTERN.h * 0.5 * S + S * 2));
  }
  clearance(px, py, r) {
    if (this.state === "done") return Infinity;
    // the round paper body, plus its black caps top and bottom (drawn ~4 px past the circle:
    // the bird could overlap a cap by ~17 px and live)
    const { cx, y } = this;
    return Math.min(
      circleClear(px, py, r, cx, y + 0.5 * S, LANTERN.r * S),
      segClear(px, py, r, cx - 2.5 * S, y - 7.5 * S, cx + 2.5 * S, y - 7.5 * S, 2 * S),
      segClear(px, py, r, cx - 2.5 * S, y + 8 * S, cx + 2.5 * S, y + 8 * S, 2 * S),
    );
  }
}

// ------------------------------------------------------------------ wind gust (harmless)
export class WindGust extends Field {
  constructor(mgr) {
    super(mgr, "gust", "sk_gust_up", 0.75);
    this.back = this.add(
      this.scene.add.image(0, 0, "sk_gust_back").setOrigin(0.5, 0).setDepth(0.9).setAlpha(0.14),
    );
  }
  spawn(x, { w = 360, dir = -1 }) {
    this.arm(x);
    this.dir = dir; // -1 pushes up, +1 pushes down
    this.halfW = w / 2;
    const H = this.mgr.H;
    this.strip.setTexture(dir < 0 ? "sk_gust_up" : "sk_gust_down").setTileScale(S);
    this.strip.setSize(w, H + OFF * 2);
    this.back.setDisplaySize(w, H + OFF * 2);
    this.petalT = 0;
  }
  update(dt) {
    this.strip.setPosition(this.x, -OFF);
    this.back.setPosition(this.x, -OFF);
    // streaks flow with the push
    this.strip.tilePositionY -= (this.dir < 0 ? 1 : -1) * dt * 110;
    // a few loose petals blow along it (none on Low Graphics: the streaks already show it)
    if (this.mgr.lowGfx || this.x > this.mgr.rightEdge) return;
    this.petalT -= dt;
    if (this.petalT <= 0) {
      this.petalT = 0.12;
      const H = this.mgr.H;
      this.mgr.fx.burst(
        "pixel",
        this.x + (Math.random() - 0.5) * this.halfW * 1.6,
        this.dir < 0 ? H * (0.6 + Math.random() * 0.4) : H * Math.random() * 0.4,
        1,
        Math.random() < 0.5 ? 0xff9ab8 : 0xe0507a,
        {
          angle: this.dir < 0 ? { min: 255, max: 285 } : { min: 75, max: 105 },
          speed: { min: 260, max: 420 },
        },
      );
    }
  }
  apply(ev) {
    ev.push += this.dir * SAKURA.gustPush;
  }
}

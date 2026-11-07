// JAMAL, the lovably ugly little white dog. Everything here is cosmetic: the hitbox, speed and
// gravity are the standard ones, and nothing changes how big he is (poses swap art frames of
// the same size; the zoomies move only the picture, never the hitbox).
//   flap   his whole body scrunches, ears flop up, tongue flaps, tufts bounce (frame 1), and a
//          random weird noise (sfx.js: jamalFlap)
//   glide  tongue flapping in the wind, eye wide, tail spinning like a propeller (frames 0 / 8)
//   near   the eye goes huge and every tuft stands straight up (frame 2)
//   best   happy zoomies: two quick laps of a little circle and a loud triumphant honk
//   death  a long, dramatic wheeze; he flops over (frame 7: X eyes, tongue out) and the diaper
//          bounces before he drops away
//   trail  little floating tufts of white fur and tiny sparkles
//   idle   (character select) tilts his head, sneezes, scratches his ear, then stares at you
//          with his one big eye
// Low Graphics: fewer tufts and sparkles. Reduce Flashing: no bursts of light.
import { reduceFlashing } from "../effects/ScreenFlash.js";
import { Sfx } from "../audio/sfx.js";

const FUR = 0xf6f1e6;
const CREAM = 0xe2d6bf;
const SPARK = 0xfff6c0;

export class DogBits {
  constructor(rig, depth) {
    this.rig = rig;
    this.depth = depth;
    this.flapT = 0;
    this.nearT = 0;
    this.zoomT = 0; // the zoomies (new best)
    this.tiltT = this.sneezeT = this.scratchT = this.stareT = 0;
    this.dieT = -1;
    this.idleT = 0.6;
    this.idleStep = 0;
    this.menu = rig.scene.sys.settings.key !== "Game";
    // (his idle sneeze and showcase honk are heard on the hero screen only, not in other menus)
    this.showcase = rig.scene.sys.settings.key === "Characters";
  }

  get objects() {
    return [];
  }

  frame() {
    if (this.dieT >= 0) return this.dieT < 0.25 ? 2 : 7; // the shock, then flopped over
    if (this.nearT > 0) return 2;
    if (this.flapT > 0) return 1;
    if (this.menu) {
      if (this.sneezeT > 0) return 4;
      if (this.scratchT > 0) return 5;
      if (this.tiltT > 0) return 3;
      if (this.stareT > 0) return 6;
    }
    // the glide: tongue and propeller tail flapping between two frames
    return Math.floor(this.rig.time * (this.menu ? 6 : 11)) % 2 ? 8 : 0;
  }

  // ---------------------------------------------------------------- reactions
  flap() {
    if (this.rig.dead) return;
    this.flapT = 0.2;
    const { fx } = this.rig;
    if (!fx) return;
    const sp = this.rig.sprite;
    const u = this.rig.u;
    // a puff of loose fur off the scrunch
    fx.burst("pixel", sp.x - 6 * u, sp.y + 8 * u, this.rig.lowGfx ? 2 : 4, FUR, {
      speed: { min: 40, max: 140 },
    });
  }

  near() {
    if (this.rig.dead) return;
    this.nearT = 0.45;
    const { x, y, fx } = this.rig;
    if (!fx) return;
    const u = this.rig.u;
    fx.floatText(x - 20 * u, y - 70 * u, "?!", "#ffffff", 34);
  }

  best() {
    if (this.rig.dead) return;
    this.zoomT = 1.3;
    if (this.rig.sounds || this.showcase) Sfx.jamal("honk");
    const { x, y, fx } = this.rig;
    if (!fx) return;
    const u = this.rig.u;
    fx.floatText(x, y - 100 * u, "HONK!", "#ffd23f", 64);
    fx.burst("star", x, y - 10 * u, this.rig.lowGfx ? 6 : 14, SPARK, {
      speed: { min: 140, max: 380 },
    });
    if (!reduceFlashing()) fx.ring(x, y, 0xffffff, { scale: 1.3 * this.rig.u, duration: 420, width: 2 });
  }

  /** A new run (retry / revive): back on his paws. */
  reset() {
    this.dieT = -1;
    this.flapT = this.nearT = this.zoomT = 0;
    this.by = this.bvy = 0;
  }

  // ---------------------------------------------------------------- death
  die() {
    this.dieT = 0;
    this.by = 0;
    this.bvy = -260;
    this.bounces = 0;
    this.flapT = this.nearT = this.zoomT = 0;
    Sfx.jamal("wheeze");
    const { x, y, fx } = this.rig;
    if (!fx) return;
    fx.burst("pixel", x, y, this.rig.lowGfx ? 8 : 18, FUR, { speed: { min: 80, max: 320 } });
    fx.burst("pixel", x, y, this.rig.lowGfx ? 3 : 6, CREAM, { speed: { min: 60, max: 200 } });
  }

  // ---------------------------------------------------------------- every frame
  update(dt) {
    const rig = this.rig;
    for (const k of ["flapT", "nearT", "zoomT", "tiltT", "sneezeT", "scratchT", "stareT"])
      this[k] = Math.max(0, this[k] - dt);
    if (this.dieT >= 0) {
      this.dieT += dt;
      // a little hop of shock, then he flops down and the diaper bounces twice, then he drops
      if (this.dieT > 0.25) {
        this.bvy += 1500 * dt;
        this.by += this.bvy * dt;
        const floor = 10;
        if (this.by > floor && this.bounces < 2 && this.dieT < 1.4) {
          this.by = floor;
          this.bvy = -this.bvy * 0.45;
          this.bounces++;
        }
      } else {
        this.by += this.bvy * dt;
        this.bvy += 400 * dt;
      }
      if (this.dieT > 2.2) rig.setVisible(false);
      return;
    }
    if (rig.dead) return;
    if (this.menu) this.idle(dt);
  }

  /** Character select: tilt the head, sneeze, scratch an ear, then stare at the player. */
  idle(dt) {
    this.idleT -= dt;
    if (this.idleT > 0) return;
    const steps = [
      [() => (this.tiltT = 1.1), 1.3],
      [() => this.sneeze(), 0.9],
      [() => (this.scratchT = 1.3), 1.5],
      [() => (this.stareT = 2.2), 2.6],
    ];
    const [fn, wait] = steps[this.idleStep % steps.length];
    fn();
    this.idleT = wait;
    this.idleStep++;
  }

  sneeze() {
    this.sneezeT = 0.35;
    if (this.rig.sounds || this.showcase) Sfx.jamal("sneeze");
    const { fx } = this.rig;
    const sp = this.rig.sprite;
    if (fx)
      fx.burst("pixel", sp.x + 10 * this.rig.u, sp.y, 4, 0xffffff, { speed: { min: 60, max: 160 } });
  }

  /** After the sprite is placed: the scrunch, zoomies, scratching, the death flop. */
  post(sp) {
    const rig = this.rig;
    const m = Math.abs(sp.displayWidth) / 26;
    if (this.dieT >= 0) {
      // flopped over: lies on his back on the way down, the diaper squashing on each bounce
      const squash = this.dieT > 0.25 && Math.abs(this.bvy) < 120 ? 0.875 : 1;
      sp.setPosition(Math.round(sp.x - this.dieT * 40 * m), Math.round(sp.y + this.by * m * 0.4));
      sp.setScale(sp.scaleX, sp.scaleY * squash);
      sp.setAngle(this.dieT < 0.25 ? -8 : 0);
      return;
    }
    if (this.zoomT > 0) {
      // zoomies: two fast laps of a little circle, tilted into the turn
      const k = 1 - this.zoomT / 1.3;
      const a = k * Math.PI * 4;
      const r = 10 * m;
      sp.setPosition(Math.round(sp.x + Math.sin(a) * r), Math.round(sp.y - (1 - Math.cos(a)) * r * 0.6));
      sp.setAngle(Math.round((Math.cos(a) * -20) / 5) * 5);
      return;
    }
    if (this.flapT > 0) {
      // the scrunch: squished down, then springs back
      const k = this.flapT / 0.2;
      sp.setScale(sp.scaleX * (1 + 0.125 * k), sp.scaleY * (1 - 0.125 * k));
    }
    if (this.menu && this.scratchT > 0) {
      // scratching: a quick shake
      sp.setX(Math.round(sp.x + (Math.floor(rig.time * 24) % 2 ? m : -m)));
    }
    if (this.menu && this.tiltT > 0) sp.setAngle(-15);
    else if (!this.menu) sp.setAngle(Math.round(sp.angle / 3) * 3);
    // a scruffy little bob as he glides
    sp.setY(Math.round(sp.y - Math.abs(Math.sin(rig.time * 6)) * 1.5 * m));
  }

  /** Floating tufts of white fur and tiny sparkles. */
  trail(g) {
    const rig = this.rig;
    const pts = rig.points;
    const n = pts.length;
    if (n < 3) return;
    const u = rig.u;
    const P = 4;
    const snap = (v) => Math.round(v / P) * P;
    for (let i = 2; i < n; i += rig.lowGfx ? 4 : 2) {
      const t = i / n;
      const p = pts[i];
      const a = Math.max(0, 0.9 - t);
      // a tuft: a little clump of 3 squares, drifting up as it ages
      const drift = t * 18 * u;
      const wob = Math.sin(i * 1.7) * 6 * u;
      const x = snap(p.x + wob);
      const y = snap(p.y - drift + (i % 3) * 4 * u);
      g.fillStyle(i % 4 ? FUR : CREAM, a);
      g.fillRect(x, y, P * 2, P).fillRect(x + P, y - P, P, P);
      if (!rig.lowGfx && i % 6 === 0 && t < 0.75) {
        // a tiny sparkle (a plus)
        g.fillStyle(SPARK, a);
        const sx = snap(p.x - wob);
        const sy = snap(p.y + 10 * u);
        g.fillRect(sx - P, sy, P * 3, P).fillRect(sx, sy - P, P, P * 3);
      }
    }
  }
}

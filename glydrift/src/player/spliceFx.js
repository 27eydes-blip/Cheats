// SXE (id "splice"), the black peregrine falcon. Everything here is visual: his hitbox is the standard
// one (Player.radius) and his only perk, +25% speed, lives in his def (characterDefs.js).
//   flight  a sharp stroke (wings up, then driven down), then he tucks into a dive between
//           flaps; after a while without flapping he glides, wings swept back like a stoop.
//   near    a quick barrel roll (he flips over his long axis) with a burst of wind.
//   best    a fierce screech and a sonic-boom ring as he shoots forward (a short lunge of the
//           drawing only; the hitbox never moves).
//   trail   sharp wind streaks and speed lines with a faint blue-steel shimmer.
//   death   black feathers burst out in a spiral and he tumbles away.
//   idle    (character select) he lands on a perch, ruffles his feathers, snaps his head
//           round, then launches off again.
// Low Graphics: fewer streaks and feathers. Reduce Flashing: no shimmer, softer rings.
import Phaser from "phaser";
import { reduceFlashing } from "../effects/ScreenFlash.js";
import { Sfx } from "../audio/sfx.js";

const ADD = Phaser.BlendModes.ADD;
const STEEL = 0x7aa0d0;
const STEEL_L = 0xbfe0ff;
const BLACK = 0x15171f;
const FEATHER_A = 0x2a3040;
const FEATHER_B = 0x4a6a98;

export class FalconBits {
  constructor(rig, depth) {
    this.rig = rig;
    this.scene = rig.scene;
    this.rollT = 0; // barrel roll time left
    this.screechT = 0; // screech pose time left
    this.lungeT = 0; // new-best lunge (drawing only)
    this.dieT = -1;
    this.key = rig.scene.sys.settings.key;
    // the character-select showcase: perch routine
    this.showcase = this.key === "Characters";
    this.perchT = 0;
    this.phase = "fly";
    this.phaseT = 1.2;
    this.perchPose = 4;
    this.perchDrop = 0;
    if (this.showcase) {
      this.perch = rig.scene.add
        .graphics()
        .setDepth(depth - 0.5)
        .setVisible(false);
    }
  }

  /** Character select: true while he's landing on / sitting on the perch (the scene holds still). */
  get holding() {
    return this.showcase && (this.phase === "land" || this.phase === "perched");
  }

  get objects() {
    return this.perch ? [this.perch] : [];
  }

  /** Which of the 8 frames to show. */
  frame() {
    const r = this.rig;
    if (this.dieT >= 0) return 3;
    if (this.phase === "perched") return this.perchPose;
    if (this.screechT > 0) return 7;
    if (r.flapT < 0.08) return 1; // wings up
    if (r.flapT < 0.17) return 2; // driven down
    if (r.flapT < 0.55) return 3; // tucked into a dive between flaps
    return 0; // glide: wings swept back
  }

  // ---------------------------------------------------------------- reactions
  flap() {
    const r = this.rig;
    if (r.dead || !r.fx) return;
    // a sharp puff of wind off the wingtips
    r.fx.burst(
      "pixel",
      r.x - 6 * r.u,
      r.y + 6 * r.u,
      r.lowGfx ? 2 : 4,
      STEEL_L,
      {
        angle: { min: 150, max: 210 },
        speed: { min: 160, max: 380 },
      },
    );
  }

  near() {
    const r = this.rig;
    if (r.dead) return;
    this.rollT = 0.42;
    if (!r.fx) return;
    // a burst of wind as he rolls
    r.fx.burst("pixel", r.x, r.y, r.lowGfx ? 6 : 14, STEEL_L, {
      angle: { min: 120, max: 240 },
      speed: { min: 220, max: 520 },
    });
    r.fx.ring(r.x, r.y, STEEL, {
      scale: 0.9 * r.u,
      duration: reduceFlashing() ? 520 : 320,
      alpha: reduceFlashing() ? 0.45 : 0.8,
      width: 0.45,
    });
  }

  best() {
    const r = this.rig;
    if (r.dead) return;
    this.screechT = 0.8;
    this.lungeT = 0.5;
    Sfx.falconScreech();
    if (!r.fx) return;
    const calm = reduceFlashing();
    // the sonic boom: a flattened cone of rings just ahead of him, then a wide white ring
    const ahead = r.x + 34 * r.u;
    r.fx.ring(ahead, r.y, 0xffffff, {
      scale: 1.2 * r.u,
      duration: calm ? 700 : 420,
      alpha: calm ? 0.45 : 0.95,
      width: 1.6,
    });
    r.scene.time.delayedCall(70, () =>
      r.fx?.ring(ahead - 20 * r.u, r.y, STEEL_L, {
        scale: 2.4 * r.u,
        duration: calm ? 900 : 560,
        alpha: calm ? 0.35 : 0.8,
        width: 1.8,
      }),
    );
    r.fx.burst("pixel", ahead, r.y, r.lowGfx ? 10 : 24, 0xffffff, {
      angle: { min: 120, max: 240 },
      speed: { min: 300, max: 700 },
    });
  }

  // ---------------------------------------------------------------- death
  die() {
    const r = this.rig;
    this.dieT = 0;
    this.bx = 0;
    this.by = 0;
    this.bvx = 120;
    this.bvy = -420;
    this.spin = 0;
    Sfx.featherBurst();
    if (!r.fx) return;
    // black feathers burst out in a spiral (six quick waves, each turned a little further)
    const waves = r.lowGfx ? 3 : 6;
    for (let i = 0; i < waves; i++)
      r.scene.time.delayedCall(i * 45, () => {
        const a = i * 60;
        r.fx?.burst(
          "feather",
          r.x + this.bx,
          r.y + this.by,
          r.lowGfx ? 4 : 6,
          i % 2 ? FEATHER_A : FEATHER_B,
          {
            angle: { min: a, max: a + 50 },
            speed: { min: 160, max: 420 },
          },
        );
      });
    r.fx.burst("pixel", r.x, r.y, r.lowGfx ? 8 : 16, STEEL_L, {
      speed: { min: 120, max: 380 },
    });
  }

  /** Extra spin (degrees) for the sprite this frame. */
  spinNow() {
    if (this.dieT >= 0) return this.spin;
    return 0;
  }

  /** A new run (retry / revive): undo the death tumble and any pose in progress. */
  reset() {
    this.dieT = -1;
    this.rollT = 0;
    this.screechT = 0;
    this.lungeT = 0;
    this.spin = 0;
    this.bx = this.by = this.bvx = this.bvy = 0;
  }

  // ---------------------------------------------------------------- every frame
  update(dt) {
    const r = this.rig;
    this.rollT = Math.max(0, this.rollT - dt);
    this.screechT = Math.max(0, this.screechT - dt);
    this.lungeT = Math.max(0, this.lungeT - dt);
    if (this.dieT >= 0) {
      // he tumbles away: a little hop, then gravity and a spin
      this.dieT += dt;
      this.bvy += 1400 * dt;
      this.bx += this.bvx * dt;
      this.by += this.bvy * dt;
      this.spin += 720 * dt;
      if (this.dieT > 1.3) r.setVisible(false);
      return;
    }
    if (this.showcase && !r.dead) this.updateShowcase(dt);
  }

  /** Character select: fly, land on the perch, ruffle, snap the head round, launch. */
  updateShowcase(dt) {
    const r = this.rig;
    const u = r.u;
    this.phaseT -= dt;
    const drop = 26 * u; // how far he drops to land on the perch
    if (this.phase === "fly") {
      this.perchDrop = Math.max(0, this.perchDrop - dt * 160 * u);
      if (this.phaseT <= 0) {
        this.phase = "land";
        this.phaseT = 0.5;
        r.flap();
      }
    } else if (this.phase === "land") {
      this.perchDrop = Math.min(drop, this.perchDrop + dt * 120 * u);
      if (this.phaseT <= 0) {
        this.phase = "perched";
        this.perchStep = 0;
        this.phaseT = 0.7;
        this.perchPose = 4;
      }
    } else if (this.phase === "perched") {
      this.perchDrop = drop;
      if (this.phaseT <= 0) {
        // perched (4) → ruffle (5) → look back (6) → front (4) → look back (6) → front → launch
        const seq = [
          [5, 0.55],
          [4, 0.35],
          [6, 0.4],
          [4, 0.3],
          [6, 0.3],
          [4, 0.5],
        ];
        const step = seq[this.perchStep++];
        if (step) {
          [this.perchPose, this.phaseT] = step;
          if (this.perchPose === 5 && r.fx)
            r.fx.burst(
              "feather",
              r.x,
              r.y + drop * 0.6,
              r.lowGfx ? 2 : 4,
              FEATHER_B,
              {
                angle: { min: 200, max: 340 },
                speed: { min: 40, max: 120 },
              },
            );
        } else {
          this.phase = "fly";
          this.phaseT = 2.6;
          r.flap();
          r.scene.time.delayedCall(180, () => r.flap());
        }
      }
    }
    r.offY = this.perchDrop;
    // the perch: a dark branch under his feet while he's on it (or landing / leaving)
    const g = this.perch;
    const on = this.perchDrop > drop * 0.4;
    g.setVisible(true).clear();
    const a = Math.min(1, this.perchDrop / drop);
    if (a <= 0.02) return;
    // anchored to the drawing: his feet sit ~7 art px below the sprite's centre
    const k = Math.abs(r.sprite.displayHeight) / 24 || u;
    const py = r.y + drop + 7.5 * k;
    const half = 15 * k;
    const P = Math.max(2, Math.round(k));
    // a pixel branch: dark outline, warm wood, a lit top edge, a twig and a stub
    g.fillStyle(0x140a04, a).fillRect(
      r.x - half - P,
      py - P,
      half * 2 + P * 2,
      P * 5,
    );
    g.fillStyle(0x7a5030, a).fillRect(r.x - half, py, half * 2, P * 3);
    g.fillStyle(0xc89058, a).fillRect(r.x - half, py, half * 2, P);
    g.fillStyle(0x4a2e18, a).fillRect(r.x - half, py + P * 2, half * 2, P);
    g.fillStyle(0x140a04, a).fillRect(
      r.x + half * 0.55 - P,
      py - P * 4,
      P * 4,
      P * 4,
    );
    g.fillStyle(0x7a5030, a).fillRect(
      r.x + half * 0.55,
      py - P * 3,
      P * 2,
      P * 3,
    ); // twig
    g.fillStyle(0x140a04, a).fillRect(r.x - half - P * 4, py, P * 4, P * 3);
    g.fillStyle(0x7a5030, a).fillRect(r.x - half - P * 3, py + P, P * 3, P); // stub
    if (!on) g.setAlpha(a);
  }

  /** After the sprite is placed: the barrel roll, the dive tilt, the lunge, the tumble. */
  post(sp) {
    const r = this.rig;
    if (this.dieT >= 0) {
      sp.x += this.bx;
      sp.y += this.by;
      sp.angle += this.spin;
      return;
    }
    // barrel roll: he flips over his long axis (the drawing squashes through to its back)
    if (this.rollT > 0) {
      const p = 1 - this.rollT / 0.42;
      sp.scaleY *= Math.cos(p * Math.PI * 2);
    }
    // dive: nose down a little between flaps
    if (this.phase !== "perched" && r.flapT > 0.17 && r.flapT < 0.55)
      sp.angle += 8;
    // new best: a quick lunge forward (the drawing only) as the boom goes off
    if (this.lungeT > 0) {
      const k = Math.sin((1 - this.lungeT / 0.5) * Math.PI);
      sp.x += k * 22 * r.u;
    }
  }

  /** Trail: sharp wind streaks and speed lines with a faint blue-steel shimmer. */
  trail(g) {
    const r = this.rig;
    const pts = r.points;
    const n = pts.length;
    if (n < 3) return true;
    const calm = reduceFlashing();
    const T = r.time;
    const u = r.u;
    // two streaks off the wingtips, above and below the body
    for (const off of [-9, 8]) {
      for (let i = 1; i < n; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const t = i / n;
        const shimmer = calm ? 0 : 0.25 * Math.sin(T * 18 + i * 0.7);
        g.lineStyle(
          Math.max(1, (1 - t) * 3 * u),
          t < 0.35 ? 0xffffff : STEEL_L,
          (0.75 + shimmer) * (1 - t),
        );
        g.lineBetween(
          a.x,
          a.y + off * u * (1 - t * 0.4),
          b.x,
          b.y + off * u * (1 - t * 0.4),
        );
      }
    }
    // speed lines: short dashes streaming past behind him
    const lines = r.lowGfx ? 3 : 6;
    for (let k = 0; k < lines; k++) {
      const ph = (T * 2.6 + k * 0.37) % 1;
      const y = r.y + (((k * 37) % 46) - 23) * u;
      const x0 = r.x - (30 + ph * 220) * u;
      const len = (26 + (k % 3) * 12) * u;
      g.lineStyle(
        Math.max(1, 1.5 * u),
        k % 2 ? STEEL : 0xffffff,
        0.5 * (1 - ph),
      );
      g.lineBetween(x0, y, x0 - len, y);
    }
    return true;
  }
}

export { BLACK };

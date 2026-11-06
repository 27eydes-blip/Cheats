// SXE (id "splice"), the black peregrine falcon. Everything here is visual: his hitbox is the standard
// one (Player.radius) and his only perk, +25% speed, lives in his def (characterDefs.js).
//   flight  a sharp stroke (wings up, then driven down), then he tucks into a dive between
//           flaps; after a while without flapping he glides, wings swept back like a stoop.
//   near    a quick barrel roll (he flips over his long axis) with a burst of wind.
//   best    a fierce screech and a sonic-boom ring as he shoots forward (a short lunge of the
//           drawing only; the hitbox never moves).
//   trail   AFTERBURNER (his signature, "trail_afterburner"): twin blue-white jet flames with a
//           flickering orange core, white contrails, heat shimmer, sparks and smoke puffs.
//           Longer and brighter with speed. Flap: the burners flare ("fwoom"). Near-miss:
//           wing-tip vapour streaks. New best: a sonic boom ring behind him ("boom").
//           Death: the engines sputter out in smoke and sparks. A soft engine hum (GameScene).
//           With another trail equipped he shows that trail and the reactions below.
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
// afterburner flame, base to tip
const FLAME = [
  0xfff4c0, 0xffb040, 0xffffff, 0xd8f4ff, 0x8ad0ff, 0x3a8aff, 0x2a4ad8,
];
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
    this.flareT = 0; // flap: afterburners flare
    this.vaporT = 0; // near-miss: wing-tip vapour
    this.speedK = 0; // 0..1 from the world scroll
    this.emitT = 0;
    this.smokeT = 0;
    this.sputterT = 0; // death: the engines sputter out
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

  /** Is the Afterburner his trail right now? (his default; another equipped trail replaces it) */
  get burner() {
    const r = this.rig;
    if (r.trailOverride) return false;
    const t = r.cos?.trail;
    return !t || t === "trail_afterburner";
  }

  /** Where the two engine nozzles are (behind him, turned with the drawing), and "back". */
  engines() {
    const r = this.rig;
    const sp = r.sprite;
    const u = r.u;
    const a = Phaser.Math.DegToRad(sp.angle || 0);
    const c = Math.cos(a);
    const s = Math.sin(a);
    const at = (ox, oy) => ({
      x: sp.x + ox * c - oy * s,
      y: sp.y + ox * s + oy * c,
    });
    return {
      list: [at(-22 * u, -4 * u), at(-21 * u, 4 * u)], // at his tail
      bx: -c,
      by: -s,
    };
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
    if (r.dead) return;
    if (this.burner) {
      this.flareT = 0.35;
      if (r.sounds) Sfx.afterburner(this.speedK);
      if (r.fx) {
        const e = this.engines();
        for (const p of e.list)
          r.fx.burst("spark", p.x, p.y, r.lowGfx ? 2 : 4, 0xffc060, {
            angle: { min: 160, max: 200 },
            speed: { min: 200, max: 420 },
          });
      }
      return;
    }
    if (!r.fx) return;
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
    if (this.burner) this.vaporT = 0.5; // wing-tip vapour, like a jet pulling a tight turn
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
    if (this.burner) return this.sonicBoom();
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

  /** New best with the Afterburner: a sonic boom ring bursts out behind him. */
  sonicBoom() {
    const r = this.rig;
    this.flareT = 0.6;
    Sfx.sonicBoom();
    Sfx.falconScreech();
    if (!r.fx) return;
    const calm = reduceFlashing();
    const e = this.engines();
    const bx = r.x + e.bx * 40 * r.u;
    const by = r.y + e.by * 40 * r.u;
    r.fx.ring(bx, by, 0xffffff, {
      scale: 2.2 * r.u,
      duration: calm ? 760 : 460,
      alpha: calm ? 0.45 : 1,
      width: 1.8,
    });
    r.scene.time.delayedCall(80, () =>
      r.fx?.ring(bx - 26 * r.u, by, 0x8ad0ff, {
        scale: 3 * r.u,
        duration: calm ? 1000 : 620,
        alpha: calm ? 0.35 : 0.85,
        width: 2,
      }),
    );
    // a shock collar of vapour and sparks
    r.fx.burst("smoke", bx, by, r.lowGfx ? 4 : 10, 0xeaf6ff, {
      speed: { min: 60, max: 220 },
    });
    r.fx.burst("pixel", bx, by, r.lowGfx ? 10 : 24, 0xffffff, {
      speed: { min: 260, max: 620 },
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
    if (this.burner) {
      // the engines sputter out: a cough of smoke and sparks, then a few dying pops
      this.sputterT = 0.9;
      Sfx.engineSputter();
      if (r.fx) {
        for (const p of this.engines().list) {
          r.fx.burst("smoke", p.x, p.y, r.lowGfx ? 3 : 7, 0x3a3a46, {
            angle: { min: 120, max: 240 },
            speed: { min: 40, max: 160 },
          });
          r.fx.burst("spark", p.x, p.y, r.lowGfx ? 4 : 10, 0xffa040, {
            speed: { min: 120, max: 380 },
          });
        }
      }
    }
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
    this.flareT = 0;
    this.vaporT = 0;
    this.sputterT = 0;
    this.spin = 0;
    this.bx = this.by = this.bvx = this.bvy = 0;
  }

  // ---------------------------------------------------------------- every frame
  update(dt, scroll = 0) {
    const r = this.rig;
    this.flareT = Math.max(0, this.flareT - dt);
    this.vaporT = Math.max(0, this.vaporT - dt);
    this.sputterT = Math.max(0, this.sputterT - dt);
    // speed 0..1: SXE's scroll runs ~400 px/s at the start to ~780 at top speed
    const k = Phaser.Math.Clamp((scroll - 380) / 420, 0, 1);
    this.speedK += (k - this.speedK) * Math.min(1, dt * 3);
    if (this.burner && !r.dead && !this.holding) {
      // a longer trail as he speeds up
      r.trailTime = (r.lowGfx ? 0.32 : 0.5) * (1 + this.speedK * 0.6);
      this.emitBits(dt);
    }
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

  /** Sparks and smoke puffs drifting off the exhaust (fewer in Low Graphics). */
  emitBits(dt) {
    const r = this.rig;
    if (!r.fx || !r.sprite.visible) return;
    this.emitT -= dt;
    this.smokeT -= dt;
    const e = this.engines();
    const tip = (p, d) => ({
      x: p.x + e.bx * d * r.u,
      y: p.y + e.by * d * r.u,
    });
    if (this.emitT <= 0) {
      this.emitT = (r.lowGfx ? 0.3 : 0.11) * (1 - this.speedK * 0.4);
      const p = tip(e.list[Math.random() < 0.5 ? 0 : 1], 18 + this.speedK * 10);
      r.fx.burst(
        "spark",
        p.x,
        p.y,
        1,
        Math.random() < 0.5 ? 0xffc060 : 0xbfe8ff,
        {
          angle: { min: 150, max: 210 },
          speed: { min: 60, max: 180 },
        },
      );
    }
    if (this.smokeT <= 0) {
      this.smokeT = r.lowGfx ? 0.6 : 0.26;
      const p = tip(e.list[Math.random() < 0.5 ? 0 : 1], 30 + this.speedK * 16);
      r.fx.burst("smoke", p.x, p.y, 1, 0xc8d4e4, {
        angle: { min: 160, max: 200 },
        speed: { min: 20, max: 70 },
      });
    }
  }

  /** The Afterburner: twin jet flames, contrails, heat shimmer, vapour on a near-miss. */
  afterburner(g) {
    const r = this.rig;
    const u = r.u;
    const T = r.time;
    const calm = reduceFlashing();
    const k = this.speedK;
    const pts = r.points;
    const n = pts.length;
    // 1. contrails: two thin white streaks from the nozzles, fading out slowly
    if (n >= 3 && this.dieT < 0) {
      for (const off of [-3, 4]) {
        for (let i = 1; i < n; i++) {
          const t = i / n;
          const a = pts[i - 1];
          const b = pts[i];
          g.lineStyle(
            Math.max(1, (1.6 - t) * 1.6 * u),
            0xffffff,
            (0.55 + k * 0.3) * (1 - t) ** 1.4,
          );
          g.lineBetween(
            a.x - 14 * u,
            a.y + off * u,
            b.x - 14 * u,
            b.y + off * u,
          );
        }
      }
      // near-miss: wing-tip vapour streaks above and below, like a jet in a hard turn
      if (this.vaporT > 0) {
        const va = this.vaporT / 0.5;
        const m = Math.min(n, Math.ceil(n * 0.6));
        for (const off of [-13, 12]) {
          for (let i = 1; i < m; i++) {
            const t = i / m;
            const a = pts[i - 1];
            const b = pts[i];
            g.lineStyle(
              Math.max(1, (1 - t) * 3 * u),
              0xf4fbff,
              0.8 * va * (1 - t),
            );
            g.lineBetween(
              a.x - 4 * u,
              a.y + off * u * (1 + t * 0.6),
              b.x - 4 * u,
              b.y + off * u * (1 + t * 0.6),
            );
          }
        }
      }
    }
    // 2. the flames: stepped pixel cones out of each nozzle
    let on = 1;
    if (this.dieT >= 0) {
      // sputtering: flickers off and on, shrinking, then out
      if (this.sputterT <= 0) return true;
      on = (this.sputterT / 0.9) * (Math.sin(T * 60) > 0.1 ? 1 : 0.15);
    }
    if (this.holding) return true; // engines off while he's on the perch
    const e = this.engines();
    const flare = this.flareT > 0 ? Math.min(1, this.flareT / 0.35) : 0;
    const P = Math.max(2, Math.round(2.4 * u)); // flame "pixel"
    const len = (30 + k * 26 + flare * 30) * u * on;
    const bright = calm ? 0.8 : 1;
    if (len < P) return true;
    for (let ei = 0; ei < 2; ei++) {
      const p = e.list[ei];
      // a calm flicker (Reduce Flashing: steadier)
      const fl = calm
        ? 1
        : 0.88 +
          0.12 * Math.sin(T * 41 + ei * 2.1) +
          0.06 * Math.sin(T * 97 + ei);
      const L = len * fl;
      const steps = Math.max(3, Math.round(L / P));
      for (let s2 = 0; s2 < steps; s2++) {
        const t = s2 / steps;
        const x = p.x + e.bx * t * L;
        const y = p.y + e.by * t * L;
        // a cone: wide and hot at the nozzle, tapering to a point
        const w = Math.max(
          P,
          Math.round(((1 - t * 0.8) * (7.5 + flare * 3.5 + k * 1.5) * u) / P) *
            P,
        );
        const ci = Math.min(FLAME.length - 1, Math.floor(t * FLAME.length));
        // blue outer glow, then the colour band, then a hot orange core at the base
        const gw = Math.round(w * 1.7);
        g.fillStyle(0x3a8aff, (0.18 + k * 0.1) * bright * (1 - t) * on);
        g.fillRect(Math.round(x - gw / 2), Math.round(y - gw / 2), gw, gw);
        g.fillStyle(FLAME[ci], (1 - t * 0.55) * bright * on);
        g.fillRect(Math.round(x - w / 2), Math.round(y - w / 2), w, w);
        if (t < 0.32) {
          const flick = calm ? 1 : Math.sin(T * 53 + ei * 3) > -0.3 ? 1 : 0.45;
          const cw = Math.max(P, Math.round((w * 0.55) / P) * P);
          g.fillStyle(t < 0.14 ? 0xfff4c0 : 0xff8a2a, flick * on);
          g.fillRect(Math.round(x - cw / 2), Math.round(y - cw / 2), cw, cw);
        }
      }
    }
    // 3. heat shimmer: faint wavy lines just past the flames (not in Low Graphics / Reduce Flashing)
    if (!r.lowGfx && !calm && this.dieT < 0) {
      for (let j = 0; j < 4; j++) {
        const d = len + (4 + j * 5) * u;
        const cx = (e.list[0].x + e.list[1].x) / 2 + e.bx * d;
        const cy = (e.list[0].y + e.list[1].y) / 2 + e.by * d;
        const wob = Math.sin(T * 24 + j * 1.7) * 2 * u;
        g.lineStyle(1, 0xffffff, 0.1 + 0.05 * Math.sin(T * 30 + j));
        g.lineBetween(cx + wob, cy - 6 * u, cx - wob, cy + 6 * u);
      }
    }
    return true;
  }

  /** Trail: sharp wind streaks and speed lines with a faint blue-steel shimmer. */
  trail(g) {
    const r = this.rig;
    if (this.burner) return this.afterburner(g);
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

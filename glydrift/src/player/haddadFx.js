// THE HADDAD, the boxer. Everything here is cosmetic: the hitbox, speed and gravity are the
// standard ones, and nothing changes how big he is (poses swap art frames of the same size).
//   flap   a quick uppercut (frame 1): the near glove drives up, leaving a red streak
//   glide  boxer stance, gloves up (frame 0), bouncing lightly on the air
//   near   a slip: he ducks and leans back (frame 2) with a "WHOOSH"
//   combo  each step of the combo is a punch count ("1!", "2!", "3!"…) with a jab
//   best   the K.O. pose (frame 3): a big "K.O.!" burst and the ring bell, "ding ding"
//   death  he spins like he took a knockout punch, cartoon stars circle his head, then he
//          drops (X eyes, frame 5) with a heavy thud
//   trail  red glove streaks with small white impact sparks
//   idle   (character select) shadowboxes (jabs, frame 6), bounces on his toes, taps his
//          gloves together, then flashes his smile (frame 4)
// Low Graphics: fewer sparks and no extra streak. Reduce Flashing: no bursts of light, softer
// rings.
import { reduceFlashing } from "../effects/ScreenFlash.js";
import { Sfx } from "../audio/sfx.js";

const RED = 0xe8202a;
const RED_L = 0xff7a72;
const RED_D = 0x9c0e16;
const GOLD = 0xffd23f;

export class BoxerBits {
  constructor(rig, depth) {
    this.rig = rig;
    this.g = rig.scene.add.graphics().setDepth(depth - 1.5);
    this.fg = rig.scene.add.graphics().setDepth(depth + 1.2); // stars over his head
    this.punchT = 0; // uppercut pose
    this.slipT = 0; // slip pose
    this.koT = 0; // K.O. pose
    this.jabT = 0; // jab pose (combo punches, shadowboxing)
    this.smileT = 0; // the showcase smile (gloves together)
    this.tapT = 0;
    this.dieT = -1;
    this.idleT = 0.8;
    this.idleStep = 0;
    this.menu = rig.scene.sys.settings.key !== "Game";
  }

  get objects() {
    return [this.g, this.fg];
  }

  frame() {
    if (this.dieT >= 0) return this.dieT < 0.55 ? 2 : 5; // reeling, then out cold
    if (this.koT > 0) return 3;
    if (this.slipT > 0) return 2;
    if (this.punchT > 0) return 1;
    if (this.jabT > 0) return 6;
    if (this.smileT > 0 || this.tapT > 0) return 4;
    return 0;
  }

  /** Where the near glove is (world), for the uppercut streak. */
  glovePos(frame) {
    const sp = this.rig.sprite;
    const m = Math.abs(sp.displayWidth) / 26; // world px per art pixel (26 with the rim)
    const flip = sp.scaleY < 0 ? -1 : 1;
    const art = frame === 6 ? [22, 10] : [19, 2]; // rimmed art coords of the glove
    return { x: sp.x + (art[0] - 13) * m, y: sp.y + (art[1] - 13) * m * flip, m, flip };
  }

  // ---------------------------------------------------------------- reactions
  flap() {
    if (this.rig.dead) return;
    this.punchT = 0.22;
    this.jabT = 0;
    const { fx } = this.rig;
    if (!fx) return;
    const p = this.glovePos(1);
    fx.burst("spark", p.x, p.y, this.rig.lowGfx ? 2 : 4, 0xffffff, {
      speed: { min: 60, max: 180 },
    });
  }

  near() {
    if (this.rig.dead) return;
    this.slipT = 0.32;
    const { x, y, fx } = this.rig;
    if (!fx) return;
    const u = this.rig.u;
    fx.floatText(x - 30 * u, y - 70 * u, "WHOOSH", "#ffffff", 30);
    Sfx.whoosh();
    if (!reduceFlashing())
      fx.ring(x, y, 0xffffff, { scale: 0.8 * u, duration: 260, width: 2, alpha: 0.6 });
  }

  /** A combo step: a jab and the punch count over him. */
  combo(step) {
    if (this.rig.dead || !step) return;
    this.jabT = 0.16;
    const { x, y, fx } = this.rig;
    if (!fx) return;
    const u = this.rig.u;
    fx.floatText(x + 40 * u, y - 60 * u - step * 6, `${step}!`, step >= 4 ? "#ffd23f" : "#ff5a5a", 34 + step * 4);
    const p = this.glovePos(6);
    fx.burst("spark", p.x, p.y, this.rig.lowGfx ? 2 : 5, 0xffffff, {
      speed: { min: 80, max: 220 },
    });
  }

  best() {
    if (this.rig.dead) return;
    this.koT = 1.6;
    Sfx.bell();
    const { x, y, fx } = this.rig;
    if (!fx) return;
    const u = this.rig.u;
    const calm = reduceFlashing();
    fx.floatText(x, y - 110 * u, "K.O.!", "#ff2a34", 84);
    fx.ring(x, y, RED, { scale: 1.6 * u, duration: calm ? 700 : 480, width: 3 });
    if (!calm) fx.ring(x, y, 0xffffff, { scale: 1.1 * u, duration: 360, width: 2 });
    fx.burst("star", x, y - 20 * u, this.rig.lowGfx ? 8 : 18, GOLD, {
      angle: { min: 200, max: 340 },
      speed: { min: 180, max: 480 },
    });
  }

  /** A new run (retry / revive): back on his feet. */
  reset() {
    this.dieT = -1;
    this.punchT = this.slipT = this.koT = this.jabT = this.smileT = this.tapT = 0;
    this.spin = 0;
    this.by = this.bvy = 0;
    this.g.clear();
    this.fg.clear();
  }

  // ---------------------------------------------------------------- death
  die() {
    this.dieT = 0;
    this.spin = 0;
    this.by = 0;
    this.bvy = -220;
    this.koT = this.slipT = this.punchT = 0;
    Sfx.thud();
    const { x, y, fx } = this.rig;
    if (!fx) return;
    const u = this.rig.u;
    fx.burst("star", x + 14 * u, y - 10 * u, this.rig.lowGfx ? 6 : 12, 0xffffff, {
      speed: { min: 120, max: 360 },
    });
    fx.burst("pixel", x, y, this.rig.lowGfx ? 6 : 14, RED, { speed: { min: 80, max: 300 } });
    fx.ring(x, y, 0xffffff, { scale: 1.2 * u, duration: reduceFlashing() ? 650 : 420, width: 2 });
  }

  // ---------------------------------------------------------------- every frame
  update(dt) {
    const rig = this.rig;
    for (const k of ["punchT", "slipT", "koT", "jabT", "smileT", "tapT"])
      this[k] = Math.max(0, this[k] - dt);
    if (this.dieT >= 0) {
      this.dieT += dt;
      // spins like he took the punch, stars round his head, then drops
      if (this.dieT > 0.55) {
        this.bvy += 1700 * dt;
        this.by += this.bvy * dt;
      } else {
        this.by += this.bvy * dt;
        this.bvy += 500 * dt;
      }
      this.spin += (this.dieT < 0.55 ? 1100 : 380) * dt;
      if (this.dieT > 1.6) rig.setVisible(false);
      this.drawStars();
      this.g.clear();
      return;
    }
    this.fg.clear();
    if (rig.dead) return;
    if (this.menu) this.idle(dt);
    this.drawStreak();
  }

  /** Character select: jab, jab, jab (bouncing), tap the gloves together, flash the smile. */
  idle(dt) {
    this.idleT -= dt;
    if (this.idleT > 0) return;
    const steps = [
      [() => (this.jabT = 0.18), 0.32],
      [() => (this.jabT = 0.18), 0.32],
      [() => (this.jabT = 0.2), 0.6],
      [() => this.tap(), 0.28],
      [() => this.tap(), 0.5],
      [() => this.flashSmile(), 2.4],
    ];
    const [fn, wait] = steps[this.idleStep % steps.length];
    fn();
    this.idleT = wait;
    this.idleStep++;
  }

  tap() {
    this.tapT = 0.16;
    const { fx } = this.rig;
    const sp = this.rig.sprite;
    if (fx) fx.burst("spark", sp.x + 4 * this.rig.u, sp.y, 3, 0xffffff, { speed: { min: 40, max: 120 } });
  }

  flashSmile() {
    this.smileT = 1.6;
    const rig = this.rig;
    if (!rig.fx) return;
    const sp = rig.sprite;
    const m = Math.abs(sp.displayWidth) / 26;
    // a glint on the smile
    rig.fx.burst("star", sp.x + 4 * m, sp.y - 6 * m, reduceFlashing() ? 1 : 3, 0xffffff, {
      speed: { min: 0, max: 40 },
    });
  }

  /** The red streak under the glove while the uppercut plays. */
  drawStreak() {
    const g = this.g.clear();
    if (this.punchT <= 0 || this.rig.lowGfx) return;
    const { x, y, m, flip } = this.glovePos(1);
    const P = Math.max(2, Math.round(m));
    const k = this.punchT / 0.22;
    const len = 16 * m * (1 - k * 0.4);
    for (const [w, col, a] of [
      [5, RED_D, 0.5],
      [3, RED, 0.8],
      [1, RED_L, 0.9],
    ]) {
      g.fillStyle(col, a * k);
      g.fillRect(
        Math.round((x - (w * m) / 2) / P) * P,
        flip > 0 ? y : y - len,
        Math.round((w * m) / P) * P || P,
        len,
      );
    }
  }

  /** Cartoon stars circling his head while he goes down. */
  drawStars() {
    const g = this.fg.clear();
    const rig = this.rig;
    const sp = rig.sprite;
    if (!sp.visible || this.dieT > 1.5) return;
    const m = Math.abs(sp.displayWidth) / 26;
    const P = Math.max(2, Math.round(m));
    const cx = sp.x;
    const cy = sp.y - 13 * m;
    const a0 = this.dieT * 7;
    for (let i = 0; i < 3; i++) {
      const a = a0 + (i * Math.PI * 2) / 3;
      const sx = cx + Math.cos(a) * 9 * m;
      const sy = cy + Math.sin(a) * 3 * m;
      const s = Math.round(sx / P) * P;
      const t = Math.round(sy / P) * P;
      g.fillStyle(i === 1 ? 0xffffff : GOLD, 1);
      g.fillRect(s - P, t, P * 3, P).fillRect(s, t - P, P, P * 3); // a pixel star (a plus)
    }
  }

  /** After the sprite is placed: the glide bounce, the slip, the knockout spin and drop. */
  post(sp) {
    const rig = this.rig;
    const m = Math.abs(sp.displayWidth) / 26;
    if (this.dieT >= 0) {
      sp.setPosition(Math.round(sp.x - this.dieT * 60 * m), Math.round(sp.y + this.by));
      sp.setAngle(-this.spin);
      return;
    }
    if (this.slipT > 0) {
      // the slip: a quick lean back and down, out of the way
      const k = Math.sin((this.slipT / 0.32) * Math.PI);
      sp.setPosition(Math.round(sp.x - 5 * m * k), Math.round(sp.y + 3 * m * k));
      sp.setAngle(Math.round((sp.angle - 16 * k) / 2) * 2);
      return;
    }
    // bouncing lightly on his toes (a steady rhythm, quicker in the menus)
    const b = Math.abs(Math.sin(rig.time * (this.menu ? 7 : 5.5))) * (this.menu ? 2.5 : 1.5) * m;
    sp.setY(Math.round(sp.y - b));
    if (this.koT > 0) sp.setAngle(Math.round((Math.sin(rig.time * 18) * 6) / 2) * 2); // victory shake
    else sp.setAngle(Math.round(sp.angle / 3) * 3);
  }

  /** Two red glove streaks (top and bottom glove) with small white impact sparks. */
  trail(g) {
    const rig = this.rig;
    const pts = rig.points;
    const n = pts.length;
    if (n < 3) return;
    const u = rig.u;
    const P = 4;
    const snap = (v) => Math.round(v / P) * P;
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const p = pts[i];
      const a = Math.max(0, 0.95 - t);
      const w = Math.max(P, snap(12 * (1 - t) * u));
      for (const off of [-7, 7]) {
        g.fillStyle(t < 0.3 ? RED_L : t < 0.65 ? RED : RED_D, a);
        g.fillRect(snap(p.x - w / 2), snap(p.y + off * u), w, P);
      }
      // impact sparks: little white crosses every few points
      if (!rig.lowGfx && i % 5 === 0 && t < 0.7) {
        g.fillStyle(0xffffff, a);
        const sx = snap(p.x);
        const sy = snap(p.y + (i % 10 ? -12 : 12) * u);
        g.fillRect(sx - P, sy, P * 3, P).fillRect(sx, sy - P, P, P * 3);
      }
    }
  }
}


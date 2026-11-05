// MATTOE, the big toe with a massive aura. Everything here is cosmetic: the hitbox is the
// standard one (Player.radius), and the aura is a translucent glow drawn BEHIND the sprite, so
// his silhouette (and how big he looks) never changes.
//   aura   always on: blue-and-gold flame tongues flicker upward, sparks rise off him. It pulses
//          slowly while gliding, flares on every flap, grows with speed and with the combo.
//   near   a near-miss flares it with a shockwave ring.
//   best   a new best erupts into a golden pillar of light (+ a deep power-up sound) while he
//          does a victory toe-wiggle in the power pose.
//   trail  glowing footprints and aura sparks.
//   death  "STUBBED!": the aura shatters like glass, he flattens like he hit a table leg, then
//          bounces away spinning with cartoon stars.
//   idle   (menus) wiggle, tap, then power up: the aura surges, the toenail shines, he poses.
// Low Graphics: a smaller, single-layer aura and fewer sparks. Reduce Flashing: no flicker
// jitter, softer flares, a dimmer pillar.
import Phaser from "phaser";
import { reduceFlashing } from "../effects/ScreenFlash.js";
import { Sfx } from "../audio/sfx.js";

const ADD = Phaser.BlendModes.ADD;
const BLUE = 0x1e7cff;
const BLUE_L = 0x7ad8ff;
const GOLD = 0xffd23f;
const GOLD_L = 0xfff6c0;

export class ToeBits {
  constructor(rig, depth) {
    this.rig = rig;
    this.g = rig.scene.add.graphics().setDepth(depth - 1.5).setBlendMode(ADD);
    this.flare = 0; // 0..1.4, decays: flaps, near-misses, surges
    this.pillarT = 0; // new-best pillar time left
    this.poseT = 0; // power pose (frame 2) time left
    this.sparkT = 0;
    this.glintT = 1.5;
    this.idleT = 1.2;
    this.idleStep = 0;
    this.dieT = -1;
    this.menu = rig.scene.sys.settings.key !== "Game";
  }

  get objects() {
    return [this.g];
  }

  frame() {
    if (this.dieT >= 0) return 1;
    if (this.poseT > 0) return 2;
    return this.rig.flapT < 0.2 ? 1 : 0;
  }

  // ---------------------------------------------------------------- reactions
  flap() {
    this.flare = Math.max(this.flare, 1);
    this.burstSparks(this.rig.lowGfx ? 2 : 5);
  }

  near() {
    if (this.rig.dead) return;
    this.flare = 1.3;
    const { x, y, fx } = this.rig;
    if (!fx) return;
    const u = this.rig.u;
    fx.ring(x, y, BLUE_L, { scale: 1.1 * u, duration: 380, width: 2 });
    if (!this.rig.lowGfx) fx.ring(x, y, GOLD, { scale: 0.75 * u, duration: 300 });
  }

  best() {
    if (this.rig.dead) return;
    this.pillarT = 1.5;
    this.poseT = 1.5;
    this.flare = 1.4;
    Sfx.powerUp();
    const { x, y, fx } = this.rig;
    if (fx) fx.burst("star", x, y, this.rig.lowGfx ? 8 : 20, GOLD, {
      angle: { min: 250, max: 290 },
      speed: { min: 200, max: 520 },
    });
  }

  /** Menus: the aura surges, the toenail shines, he strikes the power pose. */
  surge() {
    this.flare = 1.4;
    this.poseT = 1.1;
    this.glint(true);
  }

  // ---------------------------------------------------------------- death
  die() {
    const { x, y, fx } = this.rig;
    this.dieT = 0;
    this.flare = 0;
    this.spin = 0;
    this.bx = 0;
    this.by = 0;
    this.bvx = 150;
    this.bvy = -560;
    Sfx.bonk();
    Sfx.shatter();
    if (!fx) return;
    const calm = reduceFlashing();
    fx.floatText(x, y - 80 * this.rig.u, "STUBBED!", "#ffd23f", 64);
    // the aura shatters like glass (blue + gold shards flying out)
    fx.burst("shard", x, y, this.rig.lowGfx ? 14 : 30, BLUE_L, { speed: { min: 220, max: 620 } });
    fx.burst("shard", x, y, this.rig.lowGfx ? 8 : 18, GOLD, { speed: { min: 180, max: 520 } });
    fx.ring(x, y, BLUE_L, { scale: 1.6 * this.rig.u, duration: calm ? 700 : 450, width: 2 });
    fx.burst("star", x, y - 10, 10, 0xffffff, { speed: { min: 80, max: 260 } });
  }

  // ---------------------------------------------------------------- every frame
  update(dt) {
    const rig = this.rig;
    this.flare = Math.max(0, this.flare - dt * 2.6);
    this.pillarT = Math.max(0, this.pillarT - dt);
    this.poseT = Math.max(0, this.poseT - dt);
    if (this.dieT >= 0) {
      this.dieT += dt;
      // flat for a beat, then bounces away spinning with cartoon stars
      if (this.dieT > 0.24) {
        const t = dt;
        this.bvy += 1500 * t;
        this.bx += this.bvx * t;
        this.by += this.bvy * t;
        if (this.by > 0 && this.bvy > 0 && this.dieT < 0.9) this.bvy = -this.bvy * 0.55; // one bounce
        this.spin += 900 * t;
        this.starT = (this.starT || 0) - dt;
        if (this.starT <= 0 && rig.fx) {
          this.starT = rig.lowGfx ? 0.2 : 0.1;
          rig.fx.burst("star", rig.x + this.bx, rig.y + this.by - 16 * rig.u, 1, 0xffd23f, {
            speed: { min: 20, max: 70 },
          });
        }
      }
      if (this.dieT > 1.15) rig.setVisible(false);
      this.g.clear();
      return;
    }
    if (rig.dead) return;
    // menus: wiggle, tap, then power up (every ~5 s)
    if (this.menu) {
      this.idleT -= dt;
      if (this.idleT <= 0) {
        const steps = [
          [() => rig.flap(), 0.35],
          [() => rig.flap(), 0.6],
          [() => this.surge(), 3.6],
        ];
        const [fn, wait] = steps[this.idleStep % steps.length];
        fn();
        this.idleT = wait;
        this.idleStep++;
      }
    }
    // the toenail glints now and then
    this.glintT -= dt;
    if (this.glintT <= 0) this.glint(false);
    // sparks and light motes rise off him
    const k = this.level();
    this.sparkT -= dt * (rig.lowGfx ? 2.5 : 7) * (0.6 + k * 0.6);
    if (this.sparkT <= 0) {
      this.sparkT = 1;
      this.burstSparks(1);
    }
    this.draw(k);
  }

  /** Aura strength: a slow pulse, + speed, + the combo, + flares. */
  level() {
    const sc = this.rig.scene;
    const speed = sc.speedNorm || 0;
    const combo = Math.min(sc.chain || 0, 8);
    const calm = reduceFlashing();
    const pulse = 0.1 * Math.sin(this.rig.time * 2.2);
    const rest = this.menu ? 0.8 : 0.5; // menus show him at a proud, steady glow
    return rest + pulse + speed * 0.35 + combo * 0.04 + this.flare * (calm ? 0.25 : 0.45);
  }

  burstSparks(n) {
    const rig = this.rig;
    if (!rig.fx || rig.dead) return;
    const u = rig.u;
    for (let i = 0; i < n; i++)
      rig.fx.burst(
        "pixel",
        rig.x + (Math.random() - 0.5) * 22 * u,
        rig.y + (Math.random() - 0.2) * 12 * u,
        1,
        Math.random() < 0.5 ? GOLD : BLUE_L,
        { angle: { min: 255, max: 285 }, speed: { min: 50, max: 140 } },
      );
  }

  glint(big) {
    this.glintT = 1.6 + Math.random() * 1.6;
    const rig = this.rig;
    if (!rig.fx || rig.dead) return;
    const sp = rig.sprite;
    const m = Math.abs(sp.displayWidth) / 24;
    const flip = sp.scaleY < 0 ? -1 : 1;
    rig.fx.burst("star", sp.x + 3 * m, sp.y - 9 * m * flip, big ? 6 : 1, 0xffffff, {
      speed: big ? { min: 60, max: 180 } : { min: 0, max: 12 },
    });
  }

  /**
   * The aura: stepped pixel flame tongues rising from behind his body, blue outside and gold
   * inside. Sized from the sprite, so it stays a glow around him at any zoom.
   */
  draw(k) {
    const g = this.g.clear();
    const rig = this.rig;
    const sp = rig.sprite;
    if (!sp.visible) return;
    const m = Math.abs(sp.displayWidth) / 24; // world px per art pixel (sprites are 24 art px)
    const flip = sp.scaleY < 0 ? -1 : 1;
    const calm = reduceFlashing();
    const low = rig.lowGfx;
    const T = rig.time;
    const P = Math.max(2, Math.round(m)); // pixel step
    const half = (low ? 9 : 11) * m; // half-width of the aura
    const base = sp.y + 5 * m * flip; // flames start behind his lower body
    const layers = low
      ? [[BLUE, 0.42, 1]]
      : [
          [BLUE, 0.4, 1],
          [GOLD, 0.45, 0.6],
        ];
    for (const [col, alpha, w] of layers) {
      const hw = half * w;
      for (let x = -hw; x <= hw; x += P * 2) {
        const d = Math.abs(x) / hw; // 0 centre → 1 edge
        const dome = Math.sqrt(1 - d * d);
        const flick = calm
          ? 0.5 + 0.5 * Math.sin(T * 3 + x * 0.3)
          : 0.5 + 0.5 * Math.sin(T * 11 + x * 0.9) * Math.sin(T * 7.3 + x * 0.5);
        const h = (10 + 9 * k * w + flick * 5 * k) * m * dome;
        const top = base - h * flip;
        g.fillStyle(col, alpha * (0.7 + 0.3 * flick) * (0.5 + 0.5 * Math.min(1, k)));
        const y0 = Math.min(base, top);
        g.fillRect(Math.round((sp.x + x) / P) * P, Math.round(y0 / P) * P, P * 2, Math.abs(base - top));
        // a bright tip on the tallest tongues
        if (flick > 0.75 && dome > 0.5)
          g.fillStyle(col === GOLD ? GOLD_L : BLUE_L, alpha * 0.9).fillRect(
            Math.round((sp.x + x) / P) * P,
            Math.round(top / P) * P,
            P * 2,
            P,
          );
      }
    }
    // the new-best pillar: a column of golden light erupting up through him
    if (this.pillarT > 0) {
      const life = this.pillarT / 1.5;
      const a = Math.sin(Math.min(1, (1 - life) * 4) * Math.PI * 0.5) * life * (calm ? 0.35 : 0.6);
      const H = rig.scene.scale?.gameSize?.height || 1280;
      const top = flip > 0 ? sp.y - H : sp.y;
      const bottom = flip > 0 ? sp.y + 14 * m : sp.y + H;
      for (const [w, col, mul] of [
        [44, GOLD, 0.45],
        [26, GOLD_L, 0.7],
        [10, 0xffffff, 0.95],
      ]) {
        g.fillStyle(col, a * mul).fillRect(
          Math.round((sp.x - (w * m) / 2) / P) * P,
          top,
          Math.round((w * m) / P) * P,
          bottom - top,
        );
      }
    }
  }

  /** After the sprite is placed: the glide wiggle, the flattened death and its spin. */
  post(sp) {
    const rig = this.rig;
    if (this.dieT >= 0) {
      const flat = this.dieT < 0.24;
      sp.setScale(sp.scaleX * (flat ? 1.5 : 1), sp.scaleY * (flat ? 0.45 : 1));
      sp.setPosition(Math.round(sp.x + this.bx), Math.round(sp.y + this.by));
      sp.setAngle(this.spin);
      return;
    }
    // gliding: a gentle side-to-side wiggle; power pose: a quick victory wiggle
    const w = this.poseT > 0 ? Math.sin(rig.time * 24) * 9 : Math.sin(rig.time * 4.5) * 4;
    sp.setAngle(Math.round((sp.angle + w) / 3) * 3);
  }

  /** Glowing footprints (left, right, left…) and aura sparks along the path. */
  trail(g) {
    const rig = this.rig;
    const pts = rig.points;
    const n = pts.length;
    if (n < 3) return;
    const u = rig.u;
    const P = 4;
    const snap = (v) => Math.round(v / P) * P;
    let walked = 0;
    let next = 6;
    let foot = 0;
    for (let i = 1; i < n; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      while (next <= walked + seg) {
        const kk = seg > 0 ? (next - walked) / seg : 0;
        const x = a.x + (b.x - a.x) * kk;
        const t = i / n;
        const y = a.y + (b.y - a.y) * kk + (foot % 2 ? 5 : -5) * u;
        const al = Math.max(0, 0.9 - t);
        // a little footprint: the sole and five toe dots (the big one first)
        g.fillStyle(t < 0.35 ? GOLD : BLUE, al);
        g.fillRect(snap(x - 6), snap(y - 2), 10, 5);
        g.fillStyle(t < 0.35 ? GOLD_L : BLUE_L, al);
        g.fillRect(snap(x + 5), snap(y - 4), 4, 4);
        g.fillRect(snap(x + 5), snap(y + 1), 2, 2);
        g.fillRect(snap(x + 4), snap(y + 3), 2, 2);
        // aura sparks between the steps
        if (!rig.lowGfx) g.fillStyle(0xffffff, al * 0.8).fillRect(snap(x - 10), snap(y - 8 * u), 2, 2);
        foot++;
        next += 15 * Math.max(0.6, u);
      }
      walked += seg;
    }
  }
}

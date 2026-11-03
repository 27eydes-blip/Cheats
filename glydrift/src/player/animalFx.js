// Per-animal behaviour for the 30 animal heroes, driven by each def's `animal` block:
//   trailFx   { kind, color, every, rainbow? }   particles shed along the trail
//   trail     "aurora" | "web" | "ripple"         a special trail drawing
//   after     "rainbow"                           rainbow afterimages (Flicker)
//   glow      { color, x, y, scale, speed?, beat?, alpha? }   a light on the sprite (art px)
//   yawn      true                                frame 3 now and then while gliding slowly
//   near      { frame?, burst?: [kind, color, n], sound? }   reaction to a near-miss
//   best      { burst?: [kind, color, n] }        reaction to a new best (sound in Sfx)
//   death     "slide" | "circle" | "chains" | "shatter" | null   a special death move
//   revive    "reform"                            shatters into light and reforms (Prismara)
//   blink     true                                random eye blinks (frame 0/1 swap at random)
// Everything respects Low Graphics (fewer particles) and Reduce Flashing (no fast blinking).
import Phaser from "phaser";
import { reduceFlashing } from "../effects/ScreenFlash.js";
import { Music } from "../audio/music.js";
import { Sfx } from "../audio/sfx.js";

const ADD = Phaser.BlendModes.ADD;
const hsv = (h, s, v) => {
  const c = Phaser.Display.Color.HSVToRGB(((h % 1) + 1) % 1, s, v);
  return (c.r << 16) | (c.g << 8) | c.b;
};

export class AnimalBits {
  constructor(rig) {
    this.rig = rig;
    this.a = rig.def.animal || {};
    this.emitT = 0;
    this.specialT = 0; // frame 3 time left (yawn / fanned tail)
    this.yawnT = 4 + Math.random() * 4;
    this.blinkF = 0;
    this.blinkT = 0.5;
    const scene = rig.scene;
    const depth = rig.sprite.depth;
    if (this.a.glow) {
      this.glow = scene.add
        .image(0, 0, "glow")
        .setBlendMode(ADD)
        .setTint(this.a.glow.color)
        .setDepth(depth + 0.6);
      rig.extras.push(this.glow);
    }
    if (this.a.after) {
      this.ghosts = [];
      for (let i = 0; i < 6; i++) {
        const im = scene.add
          .image(0, 0, rig.px.atlas, rig.px.frames[1])
          .setVisible(false)
          .setActive(false)
          .setBlendMode(ADD)
          .setDepth(depth - 1);
        this.ghosts.push(im);
      }
    }
  }

  get objects() {
    return this.ghosts || [];
  }

  /** Which animation frame to show. */
  frame() {
    const r = this.rig;
    const n = r.px.frames.length;
    if (this.specialT > 0 && n > 3) return 3;
    if (r.flapT < (this.a.flapHold ?? 0.2)) return 2;
    if (this.a.blink) return this.blinkF;
    return Math.floor(r.time * (r.px.idleHz ?? 3)) % 2;
  }

  flap() {
    const r = this.rig;
    if (this.a.after) this.stampGhost(0.8);
    if (this.a.flapRainbow && r.fx)
      for (let i = 0; i < 3; i++)
        r.fx.burst("star", r.x, r.y, 2, hsv(Math.random(), 0.6, 1), {
          speed: { min: 80, max: 260 },
        });
  }

  update(dt, scroll) {
    const r = this.rig;
    const a = this.a;
    if (this.specialT > 0) this.specialT -= dt;
    // sleepy yawn while gliding
    if (a.yawn && !r.dead && r.flapT > 0.8) {
      this.yawnT -= dt;
      if (this.yawnT <= 0) {
        this.yawnT = 5 + Math.random() * 5;
        this.specialT = 1.1;
      }
    }
    // random blinking eyes (slow when Reduce Flashing is on)
    if (a.blink) {
      this.blinkT -= dt;
      if (this.blinkT <= 0) {
        this.blinkF = 1 - this.blinkF;
        this.blinkT = (this.blinkF ? 0.12 : 0.4 + Math.random() * 1.2) * (reduceFlashing() ? 3 : 1);
      }
    }
    // particles along the trail
    const tf = a.trailFx;
    if (tf && !r.dead && r.fx && !r.trailOverride && !r.cos.trail) {
      this.emitT -= dt;
      if (this.emitT <= 0) {
        this.emitT = (tf.every ?? 0.12) * (r.lowGfx ? 2 : 1);
        const col = tf.rainbow ? hsv(r.time * 0.3 + Math.random() * 0.2, 0.5, 1) : tf.color;
        r.fx.burst(tf.kind, r.x - 14 * r.u, r.y + (Math.random() - 0.5) * 14 * r.u, 1, col, {
          angle: tf.angle ?? { min: 150, max: 210 },
          speed: tf.speed ?? { min: 20, max: 80 },
        });
      }
    }
    // ghosts fade and drift with the world
    if (this.ghosts) {
      this.ghostT = (this.ghostT || 0) - dt;
      if (!r.dead && this.ghostT <= 0 && r.flapT < 0.6) {
        this.ghostT = 0.05;
        this.stampGhost(0.5);
      }
      for (const im of this.ghosts) {
        if (!im.active) continue;
        im.life -= dt;
        im.x -= scroll * dt;
        im.alpha = Math.max(0, im.alpha - dt * 1.8);
        if (im.life <= 0) im.setActive(false).setVisible(false);
      }
    }
  }

  /** Called after the sprite is placed: lights that ride on the sprite. */
  place(scroll) {
    const r = this.rig;
    const g = this.glow;
    if (!g) return;
    const sp = r.sprite;
    const G = this.a.glow;
    const vis = sp.visible && !r.dead;
    g.setVisible(vis);
    if (!vis) return;
    const k = 4 * sp.scaleX;
    const flip = sp.scaleY < 0 ? -1 : 1;
    const ox = (G.x ?? 0) * k;
    const oy = (G.y ?? 0) * k * flip;
    const rot = sp.rotation;
    g.setPosition(
      sp.x + ox * Math.cos(rot) - oy * Math.sin(rot),
      sp.y + ox * Math.sin(rot) + oy * Math.cos(rot),
    );
    let s = G.scale ?? 0.5;
    let al = G.alpha ?? 0.6;
    if (G.speed) {
      // brighter the faster you fly (Aurora Stag's antlers)
      const v = Phaser.Math.Clamp((scroll - 300) / 500, 0, 1);
      al *= 0.45 + v * 0.8;
      s *= 0.8 + v * 0.5;
      g.setTint(hsv(r.time * 0.15, 0.5, 1));
    }
    if (G.beat) {
      // pulses with the music's beat (Leviathan Jr. and the Abyss heartbeat)
      const ph = Music.beatPhase(r.time);
      const kk = Math.exp(-ph * 5);
      s *= 1 + kk * 0.35;
      al *= 0.6 + kk * 0.6;
      if (!r.dead) r.sx = r.sy = 1 + kk * 0.06;
    }
    if (G.pulse) al *= 0.75 + 0.25 * Math.sin(r.time * 4);
    g.setScale(s * Math.abs(sp.scaleX)).setAlpha(Math.min(1, al));
  }

  stampGhost(alpha) {
    const im = this.ghosts?.find((o) => !o.active);
    if (!im) return;
    const sp = this.rig.sprite;
    im.setActive(true).setVisible(true).setFrame(sp.frame.name);
    im.setPosition(sp.x, sp.y).setRotation(sp.rotation).setScale(sp.scaleX, sp.scaleY);
    im.setTintFill(hsv(this.rig.time * 0.8, 0.6, 1)).setAlpha(alpha);
    im.life = 0.3;
  }

  /** Special trail drawings. Returns true when it drew the trail. */
  trail(g) {
    const r = this.rig;
    const style = this.a.trail;
    if (!style) return false;
    const pts = r.points;
    const n = pts.length;
    if (style === "aurora") {
      // ribbons of northern light that shimmer through green, teal and violet
      for (let band = 0; band < 3; band++) {
        for (let i = 1; i < n; i += 2) {
          const a = pts[i - 1];
          const b = pts[i];
          const t = i / n;
          const wob = Math.sin(r.time * 3 + i * 0.4 + band) * 5 * t;
          g.lineStyle(
            Math.max(1, (5 - band * 1.5) * (1 - t) * r.sizeMul + 1),
            hsv(0.38 + band * 0.12 + t * 0.25 + r.time * 0.05, 0.6, 1),
            (0.8 - t * 0.75) * (band ? 0.6 : 0.9),
          );
          g.lineBetween(a.x, a.y + wob + (band - 1) * 5, b.x, b.y + wob + (band - 1) * 5);
        }
      }
      return true;
    }
    if (style === "web") {
      // a faint silk line with little cross-threads
      g.lineStyle(2, 0xe8e0d8, 0.5);
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 2; i < n; i += 2) g.lineTo(pts[i].x, pts[i].y);
      g.strokePath();
      for (let i = 6; i < n; i += 8) {
        const p = pts[i];
        const t = i / n;
        g.lineStyle(1, 0xffffff, 0.45 * (1 - t));
        g.lineBetween(p.x - 6, p.y - 6, p.x + 6, p.y + 6);
        g.lineBetween(p.x - 6, p.y + 6, p.x + 6, p.y - 6);
      }
      return true;
    }
    if (style === "ripple") {
      // concentric water ripples left behind (Kai)
      for (let i = 3; i < n; i += 6) {
        const p = pts[i];
        const t = i / n;
        g.lineStyle(2, i % 12 < 6 ? 0xbff4ff : 0xffb070, 0.7 * (1 - t));
        g.strokeEllipse(p.x, p.y, 8 + t * 40, 4 + t * 18);
      }
      return true;
    }
    return false;
  }

  near() {
    const r = this.rig;
    const N = this.a.near;
    if (!N || r.dead) return;
    if (N.frame) this.specialT = N.frame;
    if (N.burst && r.fx) {
      const [kind, color, n] = N.burst;
      r.fx.burst(kind, r.x, r.y - 6 * r.u, n, color, { speed: { min: 120, max: 360 } });
    }
    if (r.sounds) Sfx.hero(r.def.id, "near");
  }

  best() {
    const r = this.rig;
    const B = this.a.best;
    if (!B || r.dead) return;
    if (B.burst && r.fx) {
      const [kind, color, n] = B.burst;
      r.fx.burst(kind, r.x, r.y, n, color, { speed: { min: 150, max: 420 } });
    }
    if (r.sounds) Sfx.hero(r.def.id, "best");
  }

  /** Prismara: shatter into light and reform on a Second Chance. */
  revive() {
    const r = this.rig;
    if (this.a.revive !== "reform" || !r.fx) return;
    const sp = r.sprite;
    r.fx.burst("shard", r.x, r.y, 26, 0xffffff, { speed: { min: 150, max: 420 } });
    for (let i = 0; i < 4; i++)
      r.fx.burst("star", r.x, r.y, 6, hsv(i / 4, 0.5, 1), { speed: { min: 100, max: 300 } });
    sp.setAlpha(0);
    r.scene.tweens.add({ targets: sp, alpha: 1, duration: 600, ease: "Cubic.easeIn" });
    r.sx = r.sy = 0.2;
    if (r.sounds) Sfx.hero(r.def.id, "revive");
  }

  /**
   * Special death moves. Returns true when it handles hiding the sprite itself (the burst
   * plays when the move ends).
   */
  die(burst) {
    const r = this.rig;
    const mode = this.a.death;
    const scene = r.scene;
    const sp = r.sprite;
    if (!mode || !scene.tweens) return false;
    const end = () => {
      r.setVisible(false);
      burst(sp.x, sp.y);
    };
    if (mode === "slide") {
      // belly-slide: flops flat and skids forward
      r.frozen = true;
      sp.setAngle(80);
      scene.tweens.add({
        targets: sp,
        x: sp.x + 130,
        y: sp.y + 10,
        angle: 90,
        duration: 520,
        ease: "Cubic.easeOut",
        onUpdate: () => r.fx?.burst("flake", sp.x - 10, sp.y + 8, 1, 0xffffff),
        onComplete: end,
      });
      return true;
    }
    if (mode === "circle") {
      // one last lap: a slow circle, then it falls apart
      r.frozen = true;
      const o = { a: 0 };
      const cx = sp.x;
      const cy = sp.y - 50;
      scene.tweens.add({
        targets: o,
        a: Math.PI * 2,
        duration: 760,
        ease: "Sine.easeInOut",
        onUpdate: () => {
          sp.setPosition(cx + Math.sin(o.a) * 50, cy + Math.cos(o.a) * 50);
          sp.setRotation(-o.a);
        },
        onComplete: end,
      });
      return true;
    }
    if (mode === "chains") {
      // the chains snap, a roar, then the burst
      r.frozen = true;
      r.fx?.burst("chain", sp.x, sp.y, 12, 0xffffff, { speed: { min: 200, max: 520 } });
      r.fx?.ring(sp.x, sp.y, 0xb45cff, { scale: 2.2, duration: 600, width: 3 });
      scene.tweens.add({
        targets: sp,
        scaleX: sp.scaleX * 1.3,
        scaleY: sp.scaleY * 1.3,
        duration: 140,
        yoyo: true,
        repeat: 1,
        onComplete: end,
      });
      return true;
    }
    return false;
  }

  destroy() {
    for (const o of this.ghosts || []) o.destroy();
  }
}

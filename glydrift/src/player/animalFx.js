// © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE. Not open source.
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
// DRIFT PASS+ heroes (pass: true) have 7 frames (0-3 idle, 4-5 flap, 6 special) and:
//   flapFx    { kind, color, n, from: [x, y] }    particles from a spot on the sprite (art px)
//   barkHeads true                                each flap, the next head barks (frames 4-6)
//   ripple    true                                ripples instead of flaps (no flap squash)
//   slash     true                                near-miss: a slash pose + blade arcs
//   chameleon true                                skin layer tinted to the current realm
//   best.vanish / best.breath                     flicker near-invisible / breathe dark fire
//   death     "firestorm"                         a red firestorm
// Everything respects Low Graphics (fewer particles) and Reduce Flashing (no fast blinking).
import Phaser from "phaser";
import { reduceFlashing } from "../effects/ScreenFlash.js";
import { Music } from "../audio/music.js";
import { Sfx } from "../audio/sfx.js";
import { BIOMES } from "../biomes/biomes.js";

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
    this.flaps = 0;
    this.glowBoost = 0;
    this.vanishT = 0;
    this.breathT = 0;
    if (this.a.chameleon) {
      // the recolourable skin layer (frames <id>_s<f>), tinted to the realm in play
      this.skinLayer = scene.add
        .image(0, 0, rig.px.atlas, `${rig.def.id}_s1`)
        .setDepth(depth + 0.05)
        .setVisible(false);
      this.skinCol = rig.def.color;
      rig.extras.push(this.skinLayer);
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
    if (this.a.pass) {
      if (this.specialT > 0) return 6;
      if (this.a.barkHeads && r.flapT < 0.24) return 4 + ((this.flaps + 2) % 3);
      if (r.flapT < (this.a.ripple ? 0.16 : 0.1)) return 4;
      if (r.flapT < (this.a.ripple ? 0.32 : 0.2)) return 5;
      return Math.floor(r.time * (r.px.idleHz ?? 6)) % 4;
    }
    if (this.specialT > 0 && n > 3) return 3;
    if (r.flapT < (this.a.flapHold ?? 0.2)) return 2;
    if (this.a.blink) return this.blinkF;
    // blinking Christmas lights slow right down with Reduce Flashing
    const hz = this.a.lights && reduceFlashing() ? 0.8 : (r.px.idleHz ?? 3);
    return Math.floor(r.time * hz) % 2;
  }

  flap() {
    const r = this.rig;
    this.flaps++;
    if (this.a.ripple) r.sx = r.sy = 1; // a ripple, not a wing beat: no squash
    const F = this.a.flapFx;
    if (F && r.fx && !r.dead) {
      const [ox, oy] = this.artToWorld(F.from?.[0] ?? 0, F.from?.[1] ?? 0);
      r.fx.burst(F.kind, ox, oy, F.n, F.color, {
        angle: { min: 60, max: 150 },
        speed: { min: 60, max: 220 },
      });
    }
    if (this.a.after) this.stampGhost(0.6);
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
    // pass heroes: a brief glow after a near-miss, the vanish flicker, fire breath, realm skin
    if (this.glowBoost > 0) this.glowBoost = Math.max(0, this.glowBoost - dt);
    if (this.vanishT > 0) this.vanishT -= dt;
    if (this.breathT > 0 && !r.dead) {
      this.breathT -= dt;
      this.breathEmit = (this.breathEmit || 0) - dt;
      if (this.breathEmit <= 0 && r.fx) {
        this.breathEmit = r.lowGfx ? 0.07 : 0.035;
        // from the mouth, forward — on top of the drift that sweeps particles back with the world
        const [mx, my] = this.artToWorld(13, -3);
        const fwd = (r.sprite.rotation * 180) / Math.PI;
        const d = r.fx.drift || 0;
        r.fx.burst("darkfire", mx, my, 3, undefined, {
          angle: { min: fwd - 9, max: fwd + 9 },
          speed: { min: d + 320, max: d + 520 },
        });
        r.fx.burst("smoke", mx, my, 1, 0x1a0418, {
          angle: { min: fwd - 8, max: fwd + 8 },
          speed: { min: 260, max: 420 },
        });
        r.fx.burst("ember", mx, my, 1, 0xff2a4a, {
          angle: { min: fwd - 18, max: fwd + 18 },
          speed: { min: d + 260, max: d + 520 },
        });
      }
    }
    if (this.skinLayer) {
      const sc = r.scene;
      const seg = sc.course?.segAt?.(sc.meters);
      const target = r.realmTint ?? (seg && BIOMES[seg.biome]?.neon) ?? r.def.color;
      // ease toward the realm's colour (a smooth ~1 s shift, never a snap; kept in floats so
      // small steps don't round away)
      const k = Math.min(1, dt * 3);
      const c = (this.skinRgb ||= [(this.skinCol >> 16) & 255, (this.skinCol >> 8) & 255, this.skinCol & 255]);
      const t = [(target >> 16) & 255, (target >> 8) & 255, target & 255];
      for (let i = 0; i < 3; i++) c[i] += (t[i] - c[i]) * k;
      this.skinCol = (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2]);
    }
    // particles along the trail
    const tf = a.trailFx;
    if (tf && !r.dead && r.fx && !r.trailOverride && !r.cos.trail) {
      this.emitT -= dt;
      if (this.emitT <= 0) {
        this.emitT = (tf.every ?? 0.12) * (r.lowGfx ? 2 : 1);
        const alt = tf.alt && (this.altT = !this.altT) ? tf.alt : tf;
        const col = tf.rainbow
          ? hsv(r.time * 0.3 + Math.random() * 0.2, 0.5, 1)
          : tf.realm && this.skinLayer
            ? this.skinCol
            : alt.color;
        r.fx.burst(alt.kind, r.x - 14 * r.u, r.y + (Math.random() - 0.5) * 14 * r.u, 1, col, {
          angle: tf.angle ?? { min: 150, max: 210 },
          speed: tf.speed ?? { min: 20, max: 80 },
        });
      }
    }
    // ghosts fade and drift with the world
    if (this.ghosts) {
      this.ghostT = (this.ghostT || 0) - dt;
      if (!r.dead && this.ghostT <= 0 && r.flapT < 0.6) {
        this.ghostT = 0.085;
        this.stampGhost(0.42);
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
  /** Art px on the sprite (from its centre) → world position. */
  artToWorld(ax, ay) {
    const r = this.rig;
    const sp = r.sprite;
    const k = (r.px.artK ?? 4) * Math.abs(sp.scaleX);
    const flip = sp.scaleY < 0 ? -1 : 1;
    const rot = sp.rotation;
    const ox = ax * k;
    const oy = ay * k * flip;
    return [sp.x + ox * Math.cos(rot) - oy * Math.sin(rot), sp.y + ox * Math.sin(rot) + oy * Math.cos(rot)];
  }

  place(scroll) {
    const r = this.rig;
    const sp = r.sprite;
    // Gloomeleon: on a new best it flickers nearly invisible (purely visual: still hittable).
    // With Reduce Flashing it fades smoothly instead of flickering.
    if (this.vanishT > 0 && !r.dead) {
      const k = Math.min(1, this.vanishT / 0.25, (1.6 - this.vanishT) / 0.25);
      const lo = reduceFlashing() ? 0.15 : Math.floor(r.time * 14) % 2 ? 0.1 : 0.32;
      sp.setAlpha(1 - (1 - lo) * Math.max(0, k));
    } else if (this.a.best?.vanish && sp.alpha < 1 && !r.dead) sp.setAlpha(1);
    if (this.skinLayer) {
      const show = sp.visible && !r.dead && !r.skin && (!!r.scene.course || r.realmTint != null);
      this.skinLayer.setVisible(show);
      if (show)
        this.skinLayer
          .setFrame(sp.frame.name.replace(/_(\d)$/, "_s$1"))
          .setPosition(sp.x, sp.y)
          .setRotation(sp.rotation)
          .setScale(sp.scaleX, sp.scaleY)
          .setTint(this.skinCol)
          .setAlpha(sp.alpha * 0.92);
    }
    const g = this.glow;
    if (!g) return;
    const G = this.a.glow;
    const vis = sp.visible && !r.dead;
    g.setVisible(vis);
    if (!vis) return;
    const k = (r.px.artK ?? 4) * sp.scaleX;
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
    if (this.glowBoost > 0) {
      // a near-miss lights the glow up (gently with Reduce Flashing)
      const b = this.glowBoost / 0.4;
      al *= 1 + b * (reduceFlashing() ? 0.6 : 1.6);
      s *= 1 + b * 0.4;
    }
    if (this.vanishT > 0) al *= sp.alpha;
    g.setScale(s * Math.abs(sp.scaleX)).setAlpha(Math.min(1, al));
  }

  stampGhost(alpha) {
    const im = this.ghosts?.find((o) => !o.active);
    if (!im) return;
    const sp = this.rig.sprite;
    im.setActive(true).setVisible(true).setFrame(sp.frame.name);
    im.setPosition(sp.x, sp.y).setRotation(sp.rotation).setScale(sp.scaleX, sp.scaleY);
    this.ghostHue = ((this.ghostHue ?? 0) + 0.17) % 1; // each ghost a new rainbow colour
    im.setTintFill(hsv(this.ghostHue, 0.65, 1)).setAlpha(alpha);
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
    if (style === "smoke") {
      // Phantom Ray: soft, wavy bands of smoke that widen as they fade
      for (let band = 0; band < 2; band++)
        for (let i = 2; i < n; i += 2) {
          const a = pts[i - 2];
          const b = pts[i];
          const t = i / n;
          const wob = Math.sin(r.time * 4 - i * 0.35 + band * 2) * (3 + t * 9);
          g.lineStyle(
            Math.max(1, (9 - band * 4) * (1 - t * 0.5) * r.sizeMul),
            band ? 0xb48aff : 0x4a4460,
            (band ? 0.35 : 0.55) * (1 - t),
          );
          g.lineBetween(a.x, a.y + wob, b.x, b.y + wob);
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
    if (this.a.pass) this.glowBoost = 0.4;
    if (N.burst && r.fx) {
      const [kind, color, n] = N.burst;
      if (this.a.slash) {
        // blade arcs flung forward from the arms
        const [ax, ay] = this.artToWorld(10, -2);
        r.fx.burst(kind, ax, ay, n, color, { angle: { min: -25, max: 15 } });
      } else r.fx.burst(kind, r.x, r.y - 6 * r.u, n, color, { speed: { min: 120, max: 360 } });
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
    if (B.vanish) this.vanishT = 1.6;
    if (B.breath) {
      this.specialT = 0.9;
      this.breathT = 0.9;
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
    if (mode === "firestorm") {
      // Umbra Drake: the flame heart bursts into a spinning red firestorm
      r.frozen = true;
      const o = { k: 0 };
      const cx = sp.x;
      const cy = sp.y;
      const soft = reduceFlashing();
      r.fx?.ring(cx, cy, 0xff2a4a, { scale: 1.6, duration: 500 });
      scene.tweens.add({
        targets: o,
        k: 1,
        duration: 620,
        ease: "Sine.easeIn",
        onUpdate: () => {
          const a = o.k * Math.PI * 5;
          const rad = 14 + o.k * 70;
          for (let i = 0; i < 2; i++) {
            const aa = a + i * Math.PI;
            r.fx?.burst("redfire", cx + Math.cos(aa) * rad, cy + Math.sin(aa) * rad, 2, undefined, {
              speed: { min: 20, max: 90 },
            });
          }
          r.fx?.burst("ember", cx, cy, 1, 0xff2a4a, { speed: { min: 120, max: 380 } });
          sp.setAlpha(1 - o.k * 0.8).setScale(sp.scaleX * 1.01, sp.scaleY * 1.01);
        },
        onComplete: () => {
          sp.setAlpha(1);
          if (!soft) r.fx?.ring(cx, cy, 0xff5a3a, { scale: 3, duration: 700 });
          r.fx?.ring(cx, cy, 0x7a0a2a, { scale: 2.2, duration: 900, alpha: 0.6 });
          r.fx?.burst("redfire", cx, cy, 50, undefined, { speed: { min: 200, max: 620 } });
          end();
        },
      });
      return true;
    }
    if (mode === "chains") {
      // the chains snap, a roar, then the burst
      r.frozen = true;
      r.fx?.burst("chain", sp.x, sp.y, 12, 0xffffff, { speed: { min: 200, max: 520 } });
      r.fx?.ring(sp.x, sp.y, 0xb45cff, { scale: 2.2, duration: 600 });
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

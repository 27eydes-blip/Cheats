// TUNG (legendary): the super cute baby unicorn. Cosmetic only: standard hitbox, speed and
// gravity; poses swap art frames of the same size and move only the picture (tungArt.js).
//   flap   tiny wings flutter fast (frames 1/2), mane and tail bounce, little hearts pop off;
//          a soft twinkly chime with a random pitch (sfx.js FLAP.tung)
//   glide  gentle floaty bobbing, mane flowing behind her, the horn twinkling
//   idle   (hero screen) prances in place, flicks her mane, blinks slowly, then a sparkle burst
//          from her horn
//   near   a quick wink (frame 3) with a star sparkle
//   best   a rainbow arcs across the screen behind her (behind gameplay) with a magical chime
//   death  bursts into pastel sparkles, hearts and tiny stars with a gentle sparkly "poof"
//   trail  a soft pastel rainbow with floating sparkles and tiny hearts
//   combo  every combo step pops a tiny heart; at x10, a burst of hearts
//   pose   (victory) on a new best she rears up on her back legs (frame 7) with a sparkle burst
// UPGRADE LEVELS (runs and levels flown with her): 1 Foal, 2 Sparkle (10: a brighter horn,
// orbiting stars), 3 Blossom (25: a flower crown, petals in the trail), 4 Starlight (50: a
// starlight mane, bigger wings, a soft glow), 5 Celestial (100: a galaxy mane, a full aura, a
// halo of sparkles, a shooting-star trail). Her flap chime rises with each level. Any unlocked
// level's look can be picked on her hero card (settings.tungLook).
// SKINS: Cotton Candy, Moonbeam, Rose Gold and Nightmare Tung (tungArt.js).
// Low Graphics: fewer particles, a steady horn glow. Reduce Flashing: a softer rainbow, no
// flashing rings or pulsing glow.
import Phaser from "phaser";
import { reduceFlashing } from "../effects/ScreenFlash.js";
import { Sfx } from "../audio/sfx.js";
import { HeroBits } from "./hybridFx.js";
import { neonText, plainText } from "../ui/ui.js";
import { Save } from "../data/save.js";
import { Titles } from "../data/titles.js";
import { PORTRAIT_SCALE, rim } from "../pixel/common.js";
import { addAtlas, addTexture } from "../pixel/px.js";
import { TUNG_LEVEL_NAMES, TUNG_SKINS, tung, tungLook } from "../pixel/tungArt.js";

const PASTEL = [0xffa8d8, 0xffc8a8, 0xfff0a0, 0xa8f0d0, 0xa8d8ff, 0xc8a8ff]; // the rainbow
const HEART = 0xff8ac0;
const GOLD = 0xffd23f;
const IDLE_CYCLE = 4.5; // s: prance → flick → blink → horn sparkle
const REAR = 0.7; // s: the victory pose, then her delighted face

/** Runs (or levels) flown with her for each upgrade level. */
export const TUNG_LEVEL_RUNS = [0, 10, 25, 50, 100];
export const tungLevelFor = (runs = 0) => TUNG_LEVEL_RUNS.filter((n) => runs >= n).length;
/** Her upgrade progress: { level, name, runs, next } (next: runs for the next level, or null). */
export function tungProgress() {
  const runs = Save.data?.stats?.tungRuns || 0;
  const level = tungLevelFor(runs);
  return { level, name: TUNG_LEVEL_NAMES[level - 1], runs, next: TUNG_LEVEL_RUNS[level] ?? null };
}
/** The level whose look she wears: the one picked on her hero card (if unlocked), else her best. */
export function tungLookLevel() {
  const top = tungProgress().level;
  const pick = Save.data?.settings?.tungLook;
  return pick >= 1 && pick <= top ? pick : top;
}
/** A run (or level) with her ended: count it; returns the new level if she levelled up. */
export function countTungRun() {
  const st = Save.data.stats;
  const before = tungLevelFor(st.tungRuns || 0);
  st.tungRuns = (st.tungRuns || 0) + 1;
  const after = tungLevelFor(st.tungRuns);
  Titles.sync(); // "Too Cute to Crash" at level 5
  Save.write();
  return after > before ? after : 0;
}
/** A portrait of her at an upgrade level (or in a skin), built on first use. */
export function tungPortrait(scene, level, skin = null) {
  const key = skin ? `hero_tung_${skin}` : level > 1 ? `hero_tung_lv${level}` : "hero_tung";
  if (!scene.textures.exists(key)) addTexture(scene, key, rim(tung(4, tungLook(level, skin))), PORTRAIT_SCALE);
  return key;
}

export class UnicornBits extends HeroBits {
  constructor(rig, depth) {
    super(rig, depth);
    const sc = rig.scene;
    this.live = !!rig.fx && !!rig.sounds && sc.sys.settings.key === "Game";
    this.rainbowT = 0;
    this.idleT = 0.3;
    this.twinkleT = 0.8;
    // the horn's soft glow (additive, at the horn tip)
    this.hornGlow = sc.add
      .image(rig.x, rig.y, "glow")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xfff0a0)
      .setDepth(depth + 0.1)
      .setVisible(false);
    this.arc = null; // the new-best rainbow (graphics, made on the first new best)
    // upgrade-level extras: orbiting stars / halo (graphics) and the aura (Starlight, Celestial)
    this.fxg = sc.add.graphics().setDepth(depth + 0.3);
    this.aura = sc.add
      .image(rig.x, rig.y, "glow")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(depth - 1)
      .setVisible(false);
  }
  get objects() {
    return [this.hornGlow, this.arc, this.fxg, this.aura].filter(Boolean);
  }

  // ---------------------------------------------------------------- look
  look() {
    const skin = TUNG_SKINS[this.rig.cos?.tskin] ? this.rig.cos.tskin : null;
    return { level: this.rig.cos?.tlevel ?? tungLookLevel(), skin };
  }
  get skinned() {
    return !!this.look().skin;
  }
  get level() {
    return this.look().level;
  }
  /** The atlas key for her current look (built on first use, 8 small frames). */
  lookKey() {
    const { level, skin } = this.look();
    const key = `tlook_${skin || "base"}_${level}`;
    const sc = this.rig.scene;
    if (!sc.textures.exists(key)) {
      const L = tungLook(level, skin);
      const frames = {};
      for (let f = 0; f < 8; f++) frames[`tung_${f}`] = rim(tung(f, L));
      addAtlas(sc, key, frames);
    }
    Sfx.tungLevel = level; // her flap chime rises with each level
    return key;
  }

  /** (The hero screen runs her idle routine instead of repeating the new-best moment.) */
  tick(dt) {
    for (const k of ["flapT", "nearT", "bestT"]) this[k] = Math.max(0, this[k] - dt);
    if (this.menu && !this.rig.dead) {
      this.idleT += dt;
      if (this.idleT >= IDLE_CYCLE) this.idleT -= IDLE_CYCLE;
      // the horn sparkle at the end of the routine
      const t = this.idleT;
      if (t >= 2.6 && t - dt < 2.6) this.hornSparkle(this.rig.lowGfx ? 6 : 12);
    }
  }

  frame() {
    if (this.bestT > 1.4 - REAR) return 7; // the victory pose: rearing up
    if (this.bestT > 0) return 4;
    if (this.nearT > 0) return 3;
    if (this.flapT > 0) return Math.floor(this.flapT / 0.05) % 2 ? 1 : 2; // a fast flutter
    if (this.menu) {
      const t = this.idleT;
      if (t < 1.2) return Math.floor(t / 0.2) % 2 ? 6 : 0; // prancing in place
      if (t < 1.5) return 1; // the mane flick
      if (t >= 2 && t < 2.35) return 5; // a slow blink
      return 0;
    }
    return 0;
  }

  /** Her horn tip, in world space (the art faces right; flips with gravity). */
  hornTip() {
    const sp = this.rig.sprite;
    const m = Math.abs(sp.displayWidth) / 26;
    const fl = sp.scaleY < 0 ? -1 : 1;
    return { x: sp.x + 6 * m, y: sp.y - 11 * m * fl, m };
  }

  hornSparkle(n) {
    const { fx } = this.rig;
    if (!fx) return;
    const h = this.hornTip();
    fx.burst("star", h.x, h.y, n, GOLD, { speed: { min: 60, max: 200 } });
    fx.burst("star", h.x, h.y, Math.ceil(n / 2), PASTEL[4], { speed: { min: 40, max: 160 } });
    if (this.showcase) Sfx.moment("tung", "near");
  }

  flap() {
    if (this.rig.dead) return;
    this.flapT = 0.24;
    const { fx } = this.rig;
    if (!fx) return;
    const sp = this.rig.sprite;
    const u = this.rig.u;
    // little hearts pop off
    fx.burst("heart", sp.x - 6 * u, sp.y - 8 * u, this.rig.lowGfx ? 1 : 2, HEART, {
      angle: { min: 200, max: 320 },
      speed: { min: 40, max: 120 },
    });
  }

  near() {
    if (this.rig.dead) return;
    this.nearT = 0.45;
    const { fx } = this.rig;
    if (fx) {
      // a star sparkle by the wink
      const sp = this.rig.sprite;
      const m = Math.abs(sp.displayWidth) / 26;
      fx.burst("star", sp.x + 8 * m, sp.y - 5 * m, this.rig.lowGfx ? 3 : 6, GOLD, { speed: { min: 60, max: 180 } });
    }
    if (this.rig.sounds || this.showcase) Sfx.moment("tung", "near");
  }

  /** A combo step: a tiny heart; at x10 (step 4) a burst of hearts. */
  combo(step) {
    const { fx } = this.rig;
    if (!fx || this.rig.dead) return;
    const sp = this.rig.sprite;
    const big = step >= 4;
    fx.burst("heart", sp.x, sp.y - 12 * this.rig.u, big ? (this.rig.lowGfx ? 6 : 14) : 1, HEART, {
      angle: big ? { min: 0, max: 360 } : { min: 240, max: 300 },
      speed: big ? { min: 120, max: 320 } : { min: 40, max: 90 },
    });
  }

  best() {
    if (this.rig.dead) return;
    this.bestT = 1.4;
    if (this.rig.sounds || this.showcase) Sfx.moment("tung", "best");
    const { x, y, fx } = this.rig;
    if (!fx) return;
    fx.burst("heart", x, y - 10 * this.rig.u, this.rig.lowGfx ? 3 : 7, HEART, { speed: { min: 80, max: 240 } });
    this.hornSparkle(this.rig.lowGfx ? 8 : 16); // the victory pose's sparkle burst
    if (!reduceFlashing()) fx.ring(x, y, 0xfff0a0, { scale: 1.4 * this.rig.u, duration: 520, width: 3 });
    // a rainbow arcs across the screen behind her (behind gameplay)
    if (this.live) this.rainbowT = 1.4;
  }

  die() {
    this.dieT = 0;
    this.flapT = this.nearT = this.bestT = 0;
    Sfx.moment("tung", "death");
    this.rig.setVisible(false); // poof
    this.hornGlow.setVisible(false);
    const { x, y, fx } = this.rig;
    if (!fx) return;
    const low = this.rig.lowGfx;
    // pastel sparkles, hearts and tiny stars
    for (const c of low ? PASTEL.filter((_, i) => i % 2 === 0) : PASTEL)
      fx.burst("spark", x, y, low ? 2 : 4, c, { speed: { min: 80, max: 320 } });
    fx.burst("heart", x, y, low ? 3 : 7, HEART, { speed: { min: 60, max: 240 } });
    fx.burst("star", x, y, low ? 4 : 9, 0xfff6c0, { speed: { min: 60, max: 260 } });
    fx.burst("smoke", x, y, low ? 3 : 6, 0xf4e4ff, { speed: { min: 20, max: 90 } });
  }

  reset() {
    super.reset();
    this.rainbowT = 0;
    // a new run: she may have levelled up (or a new look was picked) since the last one
    this.rig.setCosmetics(this.rig.cos);
  }

  update(dt) {
    this.tick(dt);
    if (this.dieT >= 0) this.dieT += dt;
    // the horn twinkles now and then as she glides
    if (this.live && this.dieT < 0 && !this.rig.lowGfx) {
      this.twinkleT -= dt;
      if (this.twinkleT <= 0) {
        this.twinkleT = 0.7 + Math.random() * 0.6;
        const h = this.hornTip();
        this.rig.fx?.burst("spark", h.x, h.y, 1, 0xfff6c0, { speed: { min: 10, max: 40 } });
      }
    }
    this.updateRainbow(dt);
  }

  /** The new-best rainbow: pastel bands arc across the screen, behind the hazards (depth 0.5). */
  updateRainbow(dt) {
    if (!(this.rainbowT > 0)) {
      if (this.arc?.visible) this.arc.clear().setVisible(false);
      return;
    }
    this.rainbowT = Math.max(0, this.rainbowT - dt);
    const sc = this.rig.scene;
    if (!this.arc) this.arc = sc.add.graphics().setDepth(0.5);
    const g = this.arc.clear().setVisible(true);
    const p = 1 - this.rainbowT / 1.4; // 0 → 1
    const sweep = Math.min(1, p / 0.35); // it arcs across in 0.5 s
    const fade = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
    const alpha = (reduceFlashing() ? 0.22 : 0.42) * fade;
    const cx = sc.W * 0.5;
    const cy = sc.H * 0.95;
    const R = sc.W * 0.62;
    const band = sc.W * 0.035;
    const P = 8;
    const steps = this.rig.lowGfx ? 28 : 48;
    PASTEL.forEach((col, k) => {
      const r = R - k * band;
      g.fillStyle(col, alpha);
      // a stepped pixel arc from the left horizon, sweeping over to the right
      for (let i = 0; i <= steps * sweep; i++) {
        const a = Math.PI - (i / steps) * Math.PI;
        const x = Math.round((cx + Math.cos(a) * r) / P) * P;
        const y = Math.round((cy - Math.sin(a) * r) / P) * P;
        g.fillRect(x - P, y - band / 2, P * 2, band);
      }
    });
  }

  post(sp) {
    const m = Math.abs(sp.displayWidth) / 26;
    if (this.dieT >= 0) return;
    // gentle floaty bobbing as she glides (a little hop while prancing on the hero screen)
    if (this.menu && this.idleT < 1.2) sp.setY(Math.round(sp.y - Math.abs(Math.sin(this.idleT * Math.PI * 5)) * 3 * m));
    else if (this.flapT <= 0) sp.setY(Math.round(sp.y - Math.sin(this.rig.time * 2.6) * 1.5 * m));
    if (this.flapT > 0) sp.setAngle(0); // (the wings do the work: she stays upright)
    if (this.bestT > 1.4 - REAR) sp.setAngle(-24); // rearing up on her back legs
    // the horn glows softly (steady on Low Graphics / Reduce Flashing)
    const h = this.hornTip();
    const steady = this.rig.lowGfx || reduceFlashing();
    const lv = this.level;
    const bright = lv >= 2 ? 1.5 : 1; // Sparkle and up: a brighter horn
    this.hornGlow
      .setVisible(sp.visible)
      .setPosition(h.x, h.y)
      .setScale(0.22 * m * bright * (this.bestT > 0 ? 1.6 : 1))
      .setAlpha(Math.min(0.9, (steady ? 0.5 : 0.45 + 0.15 * Math.sin(this.rig.time * 3)) + (lv >= 2 ? 0.2 : 0)));
    this.drawLevelFx(sp, m, steady);
  }

  /** Orbiting stars (Sparkle+), the aura (Starlight+, Nightmare), the halo (Celestial). */
  drawLevelFx(sp, m, steady) {
    const g = this.fxg.clear();
    const lv = this.level;
    const L = tungLook(lv, this.look().skin);
    const on = sp.visible && this.dieT < 0;
    const auraCol = L.glow || (lv >= 5 ? 0xc8a8ff : lv >= 4 ? 0xd8f0ff : 0);
    if (on && auraCol) {
      const k = lv >= 5 || L.glow ? 0.38 : 0.18;
      this.aura
        .setVisible(true)
        .setTint(auraCol)
        .setPosition(sp.x, sp.y)
        .setScale(1.1 * m)
        .setAlpha(steady ? k : k + 0.08 * Math.sin(this.rig.time * 2));
    } else this.aura.setVisible(false);
    if (!on) return;
    const t = this.rig.time;
    const P = Math.max(2, Math.round(m * 1.5));
    const star = (x, y, col, a) => {
      g.fillStyle(col, a);
      g.fillRect(Math.round(x) - P, Math.round(y), P * 3, P).fillRect(Math.round(x), Math.round(y) - P, P, P * 3);
    };
    if (lv >= 2) {
      // a few stars orbit her
      const n = this.rig.lowGfx ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const a = t * 1.6 + (i / n) * Math.PI * 2;
        star(sp.x + Math.cos(a) * 17 * m, sp.y + Math.sin(a) * 7 * m - 2 * m, i % 2 ? 0xfff0a0 : 0xffffff, 0.9);
      }
    }
    if (lv >= 5) {
      // a halo of sparkles above her head
      const n = this.rig.lowGfx ? 5 : 9;
      const hx = sp.x + 1 * m * Math.sign(sp.scaleX || 1);
      const hy = sp.y - 15 * m * Math.sign(sp.scaleY || 1);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (steady ? 0 : t * 0.8);
        const tw = steady ? 0.85 : 0.6 + 0.4 * Math.sin(t * 6 + i);
        g.fillStyle(i % 2 ? 0xfff0a0 : 0xe8d8ff, tw).fillRect(Math.round(hx + Math.cos(a) * 8 * m), Math.round(hy + Math.sin(a) * 2.5 * m), P, P);
      }
    }
  }

  /** A soft pastel rainbow ribbon with floating sparkles and tiny hearts (+ petals at Blossom;
   *  Celestial: a shooting-star trail). */
  trail(g) {
    const rig = this.rig;
    const pts = rig.points;
    const n = pts.length;
    if (n < 3) return;
    const u = rig.u;
    const P = 4;
    const snap = (v) => Math.round(v / P) * P;
    const lv = this.level;
    if (lv >= 5) {
      // a shooting star: a bright tapering streak with gold sparkles
      for (let i = 1; i < n; i++) {
        const t = i / n;
        const p = pts[i];
        const w = Math.max(1, Math.round((1 - t) * 3));
        g.fillStyle(t < 0.3 ? 0xffffff : t < 0.6 ? 0xfff0a0 : 0xc8a8ff, Math.max(0, 0.95 - t));
        g.fillRect(snap(p.x), snap(p.y) - Math.floor(w / 2) * P, P, P * w);
        if (!rig.lowGfx && i % 6 === 3) {
          const sx = snap(p.x + Math.sin(i * 2.1 + rig.time * 3) * 8 * u);
          const sy = snap(p.y + Math.cos(i * 1.7 + rig.time * 3) * 8 * u);
          g.fillStyle(0xffd23f, Math.max(0, 0.8 - t)).fillRect(sx - P, sy, P * 3, P).fillRect(sx, sy - P, P, P * 3);
        }
      }
      return;
    }
    if (lv >= 3)
      // Blossom: flower petals drift in her trail
      for (let i = 3; i < n; i += rig.lowGfx ? 9 : 5) {
        const t = i / n;
        const p = pts[i];
        const px = snap(p.x + Math.sin(i * 1.9 + rig.time * 2) * 10 * u);
        const py = snap(p.y + (6 + t * 22) * u);
        g.fillStyle(i % 2 ? 0xffb0d8 : 0xffe0f0, Math.max(0, 0.85 - t));
        g.fillRect(px, py, P * 2, P).fillRect(px + P, py + P, P, P);
      }
    const bands = rig.lowGfx ? 3 : 6;
    for (let i = 2; i < n; i += rig.lowGfx ? 3 : 2) {
      const t = i / n;
      const p = pts[i];
      const a = Math.max(0, 0.75 - t);
      const x = snap(p.x);
      // the ribbon: pastel bands stacked under her path
      for (let k = 0; k < bands; k++) {
        g.fillStyle(PASTEL[Math.round((k * (PASTEL.length - 1)) / (bands - 1))], a);
        g.fillRect(x, snap(p.y - (bands / 2) * P + k * P), P, P);
      }
      if (!rig.lowGfx && i % 7 === 0) {
        // a floating sparkle
        const sx = snap(p.x + Math.sin(i + rig.time) * 6 * u);
        const sy = snap(p.y - (10 + t * 18) * u);
        g.fillStyle(0xfff6c0, a).fillRect(sx - P, sy, P * 3, P).fillRect(sx, sy - P, P, P * 3);
      }
      if (!rig.lowGfx && i % 11 === 5) {
        // a tiny heart
        const hx = snap(p.x);
        const hy = snap(p.y + (12 + t * 10) * u);
        g.fillStyle(HEART, a);
        g.fillRect(hx - P, hy, P, P).fillRect(hx + P, hy, P, P).fillRect(hx - P, hy + P, P * 3, P).fillRect(hx, hy + P * 2, P, P);
      }
    }
  }
}

/**
 * "TUNG LEVELED UP!": she spins, sparkles burst and the banner pops in (results screens).
 * Non-blocking (never takes input) and gone in ~2 s. Gentler with Reduce Flashing.
 */
export function tungLevelUpCelebration(scene, level, x, y) {
  const calm = reduceFlashing();
  const cont = scene.add.container(x, y).setDepth(700);
  const plate = scene.add.rectangle(0, 10, 540, 200, 0x14082a, 0.94).setStrokeStyle(3, 0xffa8d8);
  const im = scene.add.image(0, -24, tungPortrait(scene, level));
  const k = 120 / im.height;
  im.setScale(0.2 * k);
  const name = TUNG_LEVEL_NAMES[level - 1];
  const head = neonText(scene, 0, 52, "TUNG LEVELED UP!", 36, 0xffa8d8, { blur: 12 });
  const sub = plainText(scene, 0, 90, `LEVEL ${level} · ${name}`, 20, "#ffe0f4");
  cont.add([plate, im, head, sub]);
  cont.setAlpha(0);
  scene.tweens.add({ targets: cont, alpha: 1, duration: 180 });
  // she spins…
  const sp = { p: 0 };
  scene.tweens.add({
    targets: sp,
    p: 1,
    duration: 700,
    ease: "Cubic.easeOut",
    onUpdate: () => im.setScale(k * (0.2 + 0.8 * sp.p) * Math.cos(sp.p * Math.PI * 4), k * (0.2 + 0.8 * sp.p)),
  });
  // …and sparkles burst
  scene.time.delayedCall(560, () => {
    const n = calm ? 8 : 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const s = scene.add
        .text(0, -24, i % 3 ? "✦" : "♥", { fontSize: i % 3 ? "22px" : "18px", color: ["#fff0a0", "#ffa8d8", "#a8d8ff", "#c8a8ff"][i % 4] })
        .setOrigin(0.5);
      cont.add(s);
      scene.tweens.add({ targets: s, x: Math.cos(a) * 170, y: -24 + Math.sin(a) * 90, alpha: 0, duration: calm ? 900 : 700, ease: "Cubic.easeOut", onComplete: () => s.destroy() });
    }
    Sfx.moment("tung", "best");
  });
  scene.tweens.add({ targets: cont, alpha: 0, delay: 2000, duration: 300, onComplete: () => cont.destroy() });
  return cont;
}

// Pixel-art background for the Backdrop scene (no post-FX, never competes with hazards):
//   soft sky → far silhouettes → hanging layer → mid silhouettes → near cave teeth → weather
// One reusable layer set per biome; switching biomes crossfades the sets (a smooth morph).
import Phaser from "phaser";
import { heartbeat } from "../biomes/Background.js";
import { VIEW } from "../config.js";
import { reduceFlashing } from "../effects/ScreenFlash.js";
import { lerpColor } from "../biomes/biomes.js";
import { ENERGY, FLOOR } from "./colorShift.js";
import { S } from "./px.js";
import { THEMES, themeFor } from "./themes.js";

const FADE = 1.6; // seconds

export class PixelBackground {
  constructor(scene, { lowGfx = false } = {}) {
    this.scene = scene;
    this.lowGfx = lowGfx;
    this.W = VIEW.W;
    this.H = VIEW.H;
    this.time = 0;
    this.beat = 0;
    this.scroll = 0;
    // texture scale so each art pixel is a whole number of physical pixels at this camera zoom
    const z = scene.cameras.main.zoom;
    this.k = Math.max(1, Math.round(S * z)) / (S * z);
    this.sets = {};
    this.current = null;
    this.setTheme("void", true);

    const W = this.W;
    const H = this.H;
    this.pulseVig = scene.add
      .image(W / 2, H / 2, "vignette")
      .setDisplaySize(W, H)
      .setDepth(-19);
    this.pulseVig.setTintFill(0xff0018).setAlpha(0);
    this.dimRect = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(-10);

    // colour energy: an additive wash over the sky (under every silhouette layer, so the
    // pixel art keeps its own colours) and a stepped pixel glow rising from the floor
    this.wash = scene.add
      .rectangle(W / 2, H / 2, W * 3, H * 3, 0xffffff, 1)
      .setDepth(-98.5)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0)
      .setVisible(false);
    floorGlowTexture(scene);
    this.floorGlow = scene.add
      .image(W / 2, H + 4, "floorglow")
      .setOrigin(0.5, 1)
      .setDepth(-60)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0)
      .setVisible(false);
    this.floorGlow.setDisplaySize(W * 3, 40 * S * this.k);
    this.washA = 0;
    this.floorA = 0;
    this.floorCol = FLOOR.void.a;
  }

  buildSet(id) {
    const scene = this.scene;
    const t = themeFor(id);
    const W = this.W;
    const H = this.H;
    const k = this.k;
    const objs = [];
    const sky = scene.add
      .image(W / 2, H / 2, t.sky)
      .setDisplaySize(W + 8, H + 8)
      .setDepth(-100);
    objs.push(sky);
    const layer = (key, y, originY, depth, speed) => {
      const img = scene.textures.get(key).getSourceImage();
      const ts = scene.add
        .tileSprite(W / 2, y, W + 16, img.height * k, key)
        .setOrigin(0.5, originY)
        .setDepth(depth);
      ts.setTileScale(k);
      ts.speed = speed;
      ts.baseDepth = depth;
      objs.push(ts);
      return ts;
    };
    const layers = [
      layer(t.distant, H * 0.66, 1, -97, 0.035),
      layer(t.far, H * 0.72, 1, -95, 0.06),
      layer(t.roots, -4, 0, -93, 0.1),
      layer(t.mid, H + 4, 1, -90, 0.16),
      layer(t.nearTop, -4, 0, -85, 0.3),
      layer(t.nearBot, H + 4, 1, -85, 0.3),
    ];
    // soft glow spots drifting in the open middle (whole-pixel scales keep them crisp)
    const glows = [];
    for (let i = 0; i < (this.lowGfx ? 3 : 5); i++) {
      const gl = scene.add
        .image((i + Math.random() * 0.6) * (W / 4.5), H * (0.22 + Math.random() * 0.5), t.glowspot)
        .setDepth(-96)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(k * (Math.random() < 0.5 ? 2 : 3));
      gl.phase = Math.random() * 10;
      gl.base = 0.16 + Math.random() * 0.12;
      glows.push(gl);
      objs.push(gl);
    }
    // weather particles (pooled)
    const w = t.weather;
    const n = Math.round((this.lowGfx ? 0.4 : 1) * w.rate);
    const parts = [];
    for (let i = 0; i < n; i++) {
      let d;
      if (w.kind === "butterflies") {
        // butterflies + drifting petals (one in three is a petal)
        const petal = i % 3 === 2;
        d = scene.add.image(0, 0, "wx", petal ? "petal" : "bfly_0").setDepth(-70);
        d.setTint(
          petal ? 0xffc8e0 : [0xff6ab0, 0xffb02a, 0x6ab8ff, 0xb07aff, 0xffffff][i % 5],
        );
        d.petal = petal;
        d.setScale(k * (petal ? 1 : Math.random() < 0.4 ? 2 : 1));
      } else {
        const rainy = w.kind === "rain" || w.kind === "storm";
        d = scene.add.image(0, 0, rainy ? "rain" : "px1").setDepth(-70).setTint(w.color);
        d.setScale(k * (rainy ? 1 : Math.random() < 0.3 ? 2 : 1));
        if (w.kind === "storm") d.setRotation(0.55).setScale(k, k * 1.6); // wind-driven sheets
      }
      this.resetPart(d, w.kind, true);
      parts.push(d);
      objs.push(d);
    }
    // fireflies / motes fill the open middle
    const motes = [];
    for (let i = 0; i < (this.lowGfx ? 6 : 14); i++) {
      const m = scene.add
        .image(Math.random() * W, H * (0.2 + Math.random() * 0.6), "px1")
        .setDepth(-72);
      m.setTint(w.kind === "noise" ? 0x5affb0 : 0xbfe6e0).setScale(
        k * (Math.random() < 0.3 ? 2 : 1),
      );
      m.phase = Math.random() * 10;
      m.vx = 10 + Math.random() * 20;
      motes.push(m);
      objs.push(m);
    }
    return { id, objs, sky, layers, glows, parts, motes, kind: w.kind, alpha: 0 };
  }

  resetPart(d, kind, initial) {
    const W = this.W;
    const H = this.H;
    d.x = Math.random() * (W + 200);
    if (kind === "embers") {
      d.y = initial ? Math.random() * H : H + 10 + Math.random() * 60;
      d.vy = -(50 + Math.random() * 90);
      d.vx = -20 + Math.random() * 30;
    } else if (kind === "snow" || kind === "ash") {
      d.y = initial ? Math.random() * H : -10 - Math.random() * 60;
      d.vy = kind === "snow" ? 50 + Math.random() * 80 : 25 + Math.random() * 40;
      d.vx = -30 - Math.random() * 30;
    } else if (kind === "butterflies") {
      d.y = Math.random() * H * 0.75 + H * 0.08;
      if (!initial) d.x = this.W + 20 + Math.random() * 80;
      d.vy = 0;
      d.vx = -(8 + Math.random() * 26);
      d.phase = Math.random() * 10;
      d.base = 0.85;
      return;
    } else if (kind === "storm") {
      d.y = initial ? Math.random() * H : -30 - Math.random() * 80;
      d.x = Math.random() * (W + 600);
      d.vy = 900 + Math.random() * 300;
      d.vx = -(480 + Math.random() * 160);
    } else if (kind === "noise") {
      d.y = Math.random() * H;
      d.life = Math.random() * 0.4;
      d.vy = 0;
      d.vx = 0;
    } else {
      d.y = initial ? Math.random() * H : -20 - Math.random() * 80;
      d.vy = 700 + Math.random() * 300;
      d.vx = 0;
    }
    d.base = 0.18 + Math.random() * 0.32;
  }

  /**
   * Build one not-yet-built biome set (hidden). Called once per frame while idle so every
   * biome is ready before the player reaches it — no mid-run hitch on the first visit.
   * @returns true while there is still work left
   */
  prebuildNext() {
    for (const id of Object.keys(THEMES)) {
      if (this.sets[id]) continue;
      const set = this.buildSet(id);
      set.alpha = 0;
      set.shown = false;
      for (const ob of set.objs) ob.setVisible(false);
      this.sets[id] = set;
      return true;
    }
    return false;
  }

  /** Crossfade to another biome's layer set. */
  setTheme(id, instant = false) {
    if (this.current === id) return;
    if (!this.sets[id]) this.sets[id] = this.buildSet(id);
    this.current = id;
    if (instant) for (const s of Object.values(this.sets)) s.alpha = s.id === id ? 1 : 0;
  }

  update(dt, scroll, pal, o = {}) {
    this.time += dt;
    this.scroll = scroll;
    if (o.theme) this.setTheme(o.theme);
    const ps = o.particleSpeed ?? 1; // The Calm slows the weather down
    const beat = heartbeat(this.time) * (pal?.pulse || 0);
    this.beat = beat;
    const W = this.W;
    const H = this.H;
    this.curAlpha = Object.values(this.sets).find((x) => x.id === this.current)?.alpha ?? 1;
    for (const set of Object.values(this.sets)) {
      // incoming set fades in on top; outgoing sets stay solid until it fully covers them
      const cur = set.id === this.current;
      const target = cur ? 1 : this.curAlpha >= 1 ? 0 : set.alpha;
      const rate = cur ? dt / FADE : (dt * 4) / FADE;
      set.alpha += Math.sign(target - set.alpha) * Math.min(Math.abs(target - set.alpha), rate);
      if (set.alpha <= 0.001) {
        if (set.shown !== false) for (const ob of set.objs) ob.setVisible(false);
        set.shown = false;
        continue;
      }
      if (set.shown === false) for (const ob of set.objs) ob.setVisible(true);
      set.shown = true;
      // the incoming set's whole layer stack draws above the outgoing stack → a true crossfade
      const lift = set.id === this.current ? 0 : -40;
      set.sky.setDepth(-100 + lift).setAlpha(set.alpha);
      for (const d of set.parts) d.setDepth(-70 + lift);
      for (const gl of set.glows) {
        gl.setDepth(-96 + lift);
        gl.x -= scroll * dt * 0.03;
        if (gl.x < -gl.displayWidth / 2) {
          gl.x = W + gl.displayWidth / 2;
          gl.y = H * (0.22 + Math.random() * 0.5);
        }
        gl.setAlpha(
          set.alpha *
            gl.base *
            (ENERGY[set.id]?.glow ?? 1) *
            (0.75 + 0.25 * Math.sin(this.time * 0.8 + gl.phase)),
        );
      }
      for (const m of set.motes) m.setDepth(-72 + lift);
      for (const l of set.layers) {
        l.tilePositionX += (scroll * dt * l.speed) / this.k;
        l.setDepth(l.baseDepth + lift).setAlpha(set.alpha);
      }
      for (const d of set.parts) {
        if (set.kind === "noise") {
          d.life -= dt;
          if (d.life <= 0) {
            this.resetPart(d, "noise", false);
            d.life = 0.05 + Math.random() * 0.35;
            d.setTint([0x2bffef, 0xff5ad8, 0xffffff][Math.floor(Math.random() * 3)]);
          }
          d.setAlpha(set.alpha * (Math.random() < 0.85 ? d.base : 0));
          continue;
        }
        if (set.kind === "butterflies") {
          // lazy flutter: bob, drift, flap (petals tumble instead)
          d.x += (-scroll * 0.1 + d.vx) * dt * ps;
          d.y += Math.sin(this.time * 2.2 + d.phase) * 26 * dt;
          if (!d.petal) d.setFrame(Math.floor(this.time * 9 + d.phase) % 2 ? "bfly_1" : "bfly_0");
          else d.y += 14 * dt;
          d.setAlpha(set.alpha * d.base);
          if (d.x < -30 || d.y > H + 20) this.resetPart(d, set.kind, false);
          continue;
        }
        const drift =
          set.kind === "rain"
            ? -scroll * 0.35 - 90
            : set.kind === "storm"
              ? -scroll * 0.5
              : -scroll * 0.15;
        d.x += (drift + d.vx) * dt * ps;
        d.y += d.vy * dt * ps;
        const flicker = set.kind === "embers" ? 0.6 + 0.4 * Math.sin(this.time * 9 + d.x) : 1;
        d.setAlpha(set.alpha * d.base * flicker);
        if (d.y > H + 20 || d.y < -90 || d.x < -20) this.resetPart(d, set.kind, false);
      }
      for (const m of set.motes) {
        m.x -= (scroll * 0.12 + m.vx) * dt * ps;
        m.y += Math.sin(this.time * 1.3 + m.phase) * 12 * dt;
        m.setAlpha(set.alpha * (0.2 + 0.3 * (0.5 + 0.5 * Math.sin(this.time * 2 + m.phase))));
        if (m.x < -10) {
          m.x = W + 10;
          m.y = H * (0.2 + Math.random() * 0.6);
        }
      }
    }
    this.pulseVig.setAlpha(beat * 0.5);
    // colour energy: wash follows the in-biome colour shift and breathes with the beat
    const amt = o.shiftAmt ?? 0;
    const pb = o.beat ?? 0;
    const en = ENERGY[this.current] || { wash: 1, floor: 1 };
    this.washA +=
      ((amt > 0 ? (0.11 + 0.05 * pb) * en.wash : 0) * amt - this.washA) * Math.min(1, dt * 10);
    let washA = this.washA;
    let washCol = o.shift;
    // Hurricane: distant lightning lights the clouds now and then (a double flicker,
    // at most one strike every 4 s; off with Reduce Flashing)
    if (this.current === "hurricane" && amt > 0) {
      this.boltT = (this.boltT ?? 2) - dt;
      if (this.boltT <= 0) {
        this.boltT = 4 + Math.random() * 5;
        if (!reduceFlashing()) this.bolt = 0.26;
      }
    }
    if (this.bolt > 0) {
      this.bolt -= dt;
      const b = this.bolt;
      if (b > 0.18 || (b < 0.12 && b > 0.04)) {
        washA += 0.16;
        washCol = 0xc8e8ff;
      }
    }
    this.wash.setVisible(washA > 0.002).setAlpha(washA);
    if (amt > 0) this.wash.setFillStyle(washCol, 1);
    const fl = o.floor ? FLOOR[o.floor] : null;
    if (fl) this.floorCol = lerpColor(this.floorCol, fl.a, Math.min(1, dt * 1.5));
    const fT = fl ? (0.6 + 0.4 * pb) * Math.max(0.35, amt) * en.floor : 0;
    this.floorA += (fT - this.floorA) * Math.min(1, dt * 12);
    this.floorGlow
      .setVisible(this.floorA > 0.005)
      .setAlpha(this.floorA)
      .setTint(lerpColor(this.floorCol, o.shift || this.floorCol, 0.25));
    if (amt > 0) {
      const gt = lerpColor(0xffffff, o.shift, 0.45);
      const cur = this.sets[this.current];
      if (cur) for (const gl of cur.glows) gl.setTint(gt).setAlpha(gl.alpha * (1 + 0.6 * pb));
    } else if (this.washA <= 0.002) {
      const cur = this.sets[this.current];
      if (cur && cur.glows[0]?.isTinted) for (const gl of cur.glows) gl.clearTint();
    }
    const dim = o.dim ?? 0;
    this.dimRect.fillAlpha += (dim - this.dimRect.fillAlpha) * Math.min(1, dt * 8);
  }
}

/** Stepped (banded) pixel glow: 8 bands, brightest at the bottom. White; tinted per biome. */
function floorGlowTexture(scene) {
  if (scene.textures.exists("floorglow")) return;
  const rows = 40;
  const c = scene.textures.createCanvas("floorglow", 4, rows);
  const ctx = c.getContext();
  const bands = [0.04, 0.08, 0.13, 0.19, 0.26, 0.34, 0.44, 0.56];
  for (let y = 0; y < rows; y++) {
    const b = Math.min(bands.length - 1, Math.floor((y / rows) * bands.length));
    ctx.fillStyle = `rgba(255,255,255,${bands[b]})`;
    ctx.fillRect(0, y, 4, 1);
  }
  c.refresh();
  c.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

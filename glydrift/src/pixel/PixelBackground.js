// © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE. Not open source.
// Pixel-art background for the Backdrop scene (no post-FX, never competes with hazards):
//   soft sky → far silhouettes → hanging layer → mid silhouettes → near cave teeth → weather
// One reusable layer set per biome; switching biomes crossfades the sets (a smooth morph).
import Phaser from "phaser";
import { VIEW } from "../config.js";
import { reduceFlashing } from "../effects/ScreenFlash.js";
import { lerpColor } from "../biomes/biomes.js";
import { ENERGY, FLOOR } from "./colorShift.js";
import { S } from "./px.js";
import { biomeArtReady, THEMES, themeFor } from "./themes.js";
import { setSideTheme } from "../systems/sideBackdrop.js";

const FADE = 1.6; // seconds

/** Lub-dub pulse curve (one beat every 1.05 s) for the Abyss vignette. */
function heartbeat(t) {
  const p = t % 1.05;
  return Math.exp(-((p - 0.05) ** 2) * 600) + 0.65 * Math.exp(-((p - 0.27) ** 2) * 600);
}

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
    if (t.mirror) {
      // Mirror Realm: the back layers are reflected (upside down, dimmer) in the top half
      for (const [key, y, depth, speed] of [
        [t.distant, H * 0.34, -97, 0.035],
        [t.far, H * 0.28, -95, 0.06],
        [t.mid, -4, -90, 0.16],
      ]) {
        const m = layer(key, y, 0, depth, speed).setFlipY(true);
        m.alphaMul = 0.55;
        layers.push(m);
      }
    }
    // Tidal Sky: soft light rays slanting down through the water
    const rays = [];
    if (t.weather.rays) {
      lightRayTexture(scene);
      for (let i = 0; i < 4; i++) {
        const r = scene.add
          .image(W * (0.15 + i * 0.25), -20, "lightray")
          .setOrigin(0.5, 0)
          .setDisplaySize(W * 0.18, H * 1.1)
          .setRotation(0.22)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(t.weather.rays)
          .setDepth(-94);
        r.phase = i * 1.7;
        rays.push(r);
        objs.push(r);
      }
    }
    // Frozen Nebula: aurora ribbons, stepped pixel curtains drawn each frame (cheap: a few
    // dozen rects; one ribbon on Low Graphics). Kept faint so hazards always read first.
    let aurora = null;
    if (t.weather.aurora) {
      aurora = scene.add.graphics().setDepth(-98).setBlendMode(Phaser.BlendModes.ADD);
      aurora.cols = t.weather.aurora;
      objs.push(aurora);
    }
    // Solar Storm: prominence arcs (half-ellipses of stepped bars) rise off the horizon,
    // swell and fade; kept dim so the lava hazards stay the brightest orange on screen
    let flares = null;
    if (t.weather.flares) {
      flares = scene.add.graphics().setDepth(-96.5).setBlendMode(Phaser.BlendModes.ADD);
      flares.cols = t.weather.flares;
      flares.list = [];
      objs.push(flares);
    }
    // Neon Void: a perspective floor grid below the horizon, scrolling with the run
    let grid = null;
    if (t.weather.grid) {
      grid = scene.add.graphics().setDepth(-91).setBlendMode(Phaser.BlendModes.ADD);
      grid.col = t.weather.grid;
      grid.phase = 0;
      objs.push(grid);
    }
    // Glitch Realm: brief horizontal tear bands (an RGB-split strip) across the sky
    let tears = null;
    if (t.weather.tears) {
      tears = scene.add.graphics().setDepth(-95.5).setBlendMode(Phaser.BlendModes.ADD);
      tears.cols = t.weather.tears;
      tears.list = [];
      objs.push(tears);
    }
    // Abyss: branching veins across the sky, drawn once, brightening with each heartbeat
    let veins = null;
    if (t.weather.veins) {
      veins = scene.add.graphics().setDepth(-96.8).setBlendMode(Phaser.BlendModes.ADD);
      this.paintVeins(veins, t.weather.veins);
      objs.push(veins);
    }
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
      if (w.kind === "bubbles") {
        d = scene.add.image(0, 0, "wx", "bubble").setDepth(-70).setTint(w.color);
        d.setScale(k * (Math.random() < 0.35 ? 2 : 1));
      } else if (w.kind === "butterflies") {
        // butterflies + drifting petals (one in three is a petal)
        const petal = i % 3 === 2;
        d = scene.add.image(0, 0, "wx", petal ? "petal" : "bfly_0").setDepth(-70);
        d.setTint(petal ? 0xffc8e0 : [0xff6ab0, 0xffb02a, 0x6ab8ff, 0xb07aff, 0xffffff][i % 5]);
        d.petal = petal;
        d.setScale(k * (petal ? 1 : Math.random() < 0.4 ? 2 : 1));
      } else {
        const rainy = w.kind === "rain" || w.kind === "storm";
        d = scene.add
          .image(0, 0, rainy ? "rain" : "px1")
          .setDepth(-70)
          .setTint(w.color);
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
      m.setTint(
        w.colors ? w.colors[i % w.colors.length] : w.kind === "noise" ? 0x5affb0 : 0xbfe6e0,
      ).setScale(k * (Math.random() < 0.3 ? 2 : 1));
      m.phase = Math.random() * 10;
      m.vx = 10 + Math.random() * 20;
      motes.push(m);
      objs.push(m);
    }
    return {
      id,
      objs,
      sky,
      layers,
      glows,
      rays,
      parts,
      motes,
      aurora,
      flares,
      grid,
      tears,
      veins,
      kind: w.kind,
      colors: w.colors,
      alpha: 0,
    };
  }

  /**
   * Paint the Abyss veins once: a few stepped branches creeping in from the screen edges
   * (fewer on Low Graphics). Only their alpha changes per frame, so they cost nothing to draw.
   */
  paintVeins(g, col) {
    const W = this.W;
    const H = this.H;
    const px = 2 * S * this.k;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const branch = (x, y, ang, len, w) => {
      for (let i = 0; i < len; i++) {
        ang += (rnd() - 0.5) * 0.5;
        x += Math.cos(ang) * px;
        y += Math.sin(ang) * px;
        g.fillStyle(col, w > 1 ? 1 : 0.7).fillRect(Math.round(x / px) * px, Math.round(y / px) * px, px * w, px * w);
        if (w > 1 && rnd() < 0.06) branch(x, y, ang + (rnd() < 0.5 ? 0.9 : -0.9), Math.floor(len * 0.4), 1);
      }
    };
    const n = this.lowGfx ? 3 : 6;
    for (let i = 0; i < n; i++) {
      const left = i % 2 === 0;
      const y0 = H * (0.12 + (i / n) * 0.7);
      branch(left ? -px : W + px, y0, left ? 0.2 : Math.PI - 0.2, 40 + Math.floor(rnd() * 40), 2);
    }
  }

  /** Aurora ribbons: columns of 4-px bars whose height follows slow travelling waves. */
  drawAurora(g, alpha, lift) {
    g.clear().setDepth(-98 + lift);
    const W = this.W;
    const H = this.H;
    const bar = 4 * S * this.k;
    const t = this.time;
    const calm = reduceFlashing() ? 0.6 : 1; // slower shimmer with Reduce Flashing
    const ribbons = this.lowGfx ? 1 : 2;
    for (let r = 0; r < ribbons; r++) {
      const col = g.cols[r % g.cols.length];
      const col2 = g.cols[(r + 1) % g.cols.length];
      const y0 = H * (0.14 + r * 0.1);
      for (let x = 0; x < W; x += bar) {
        const u = x / W;
        const wv =
          Math.sin(u * 6.3 + t * 0.35 * calm + r * 2) * 0.6 +
          Math.sin(u * 13.1 - t * 0.22 * calm + r) * 0.4;
        const top = y0 + wv * H * 0.05;
        const len = H * (0.07 + 0.05 * (0.5 + 0.5 * Math.sin(u * 9 + t * 0.5 * calm + r * 3)));
        const a = alpha * (0.07 + 0.05 * (0.5 + 0.5 * wv)) * (r ? 0.7 : 1);
        g.fillStyle(col, a).fillRect(x, top, bar, len * 0.55);
        g.fillStyle(col2, a * 0.6).fillRect(x, top + len * 0.55, bar, len * 0.45);
      }
    }
  }

  /**
   * Glitch tear bands: a thin strip appears, its three colour channels offset sideways, and
   * fades over a few tenths of a second. With Reduce Flashing they're rarer and fade slowly.
   */
  drawTears(g, alpha, lift, dt) {
    g.clear().setDepth(-95.5 + lift);
    const W = this.W;
    const H = this.H;
    const calm = reduceFlashing();
    g.spawnT = (g.spawnT ?? 1) - dt;
    if (g.spawnT <= 0) {
      g.spawnT = (calm ? 3 : 1.2) + Math.random() * (calm ? 3 : 2);
      if (g.list.length < (this.lowGfx ? 1 : 2))
        g.list.push({ y: H * (0.1 + Math.random() * 0.6), h: 4 * S * this.k * (1 + Math.floor(Math.random() * 3)), t: 0, life: calm ? 1.2 : 0.45, off: 6 + Math.random() * 14 });
    }
    for (let i = g.list.length - 1; i >= 0; i--) {
      const b = g.list[i];
      b.t += dt;
      if (b.t >= b.life) {
        g.list.splice(i, 1);
        continue;
      }
      const a = alpha * 0.12 * (1 - b.t / b.life);
      g.cols.forEach((c, k) => {
        g.fillStyle(c, a);
        g.fillRect((k - 1) * b.off, b.y + k * 2, W, b.h);
      });
    }
  }

  /** Neon Void floor grid: lines converge on a vanishing point; cross lines slide closer. */
  drawGrid(g, alpha, lift, dt) {
    g.clear().setDepth(-91 + lift);
    const W = this.W;
    const H = this.H;
    const hz = H * 0.7; // horizon
    const vx = W / 2;
    g.phase = (g.phase + dt * (0.25 + this.scroll / 2400)) % 1;
    const a = alpha * 0.11;
    g.lineStyle(2, g.col, a);
    // converging lines
    const n = this.lowGfx ? 7 : 11;
    for (let i = 0; i <= n; i++) {
      const bx = (i / n - 0.5) * W * 3.2 + vx;
      g.lineBetween(vx + (bx - vx) * 0.04, hz, bx, H);
    }
    // cross lines: perspective spacing, sliding toward the viewer
    for (let k = 0; k < 8; k++) {
      const d = (k + g.phase) / 8; // 0 at the horizon, 1 at the bottom
      const y = hz + (H - hz) * d * d;
      g.lineStyle(2, g.col, a * (0.3 + d * 0.7));
      g.lineBetween(0, y, W, y);
    }
  }

  /** Solar prominences: arcs that grow out of the horizon over ~3 s and fade. */
  drawFlares(g, alpha, lift, dt) {
    g.clear().setDepth(-96.5 + lift);
    const W = this.W;
    const H = this.H;
    const max = this.lowGfx ? 1 : 3;
    g.spawnT = (g.spawnT ?? 0.5) - dt;
    if (g.spawnT <= 0 && g.list.length < max) {
      g.spawnT = 1.6 + Math.random() * 2.2;
      g.list.push({
        x: Math.random() * W,
        rx: W * (0.06 + Math.random() * 0.08),
        ry: H * (0.08 + Math.random() * 0.1),
        t: 0,
        life: 3 + Math.random() * 1.5,
        col: g.cols[Math.floor(Math.random() * g.cols.length)],
      });
    }
    const base = H * 0.64;
    const step = 4 * S * this.k;
    for (let i = g.list.length - 1; i >= 0; i--) {
      const f = g.list[i];
      f.t += dt;
      f.x -= this.scroll * dt * 0.03;
      if (f.t >= f.life) {
        g.list.splice(i, 1);
        continue;
      }
      const k = f.t / f.life;
      const grow = Math.min(1, k * 2.5);
      const a = alpha * 0.16 * Math.sin(Math.PI * k);
      g.fillStyle(f.col, a);
      for (let u = 0; u <= 1; u += 0.04) {
        const ang = Math.PI * u;
        const px = f.x - Math.cos(ang) * f.rx;
        const py = base - Math.sin(ang) * f.ry * grow;
        g.fillRect(Math.round(px / step) * step, Math.round(py / step) * step, step, step);
      }
    }
  }

  resetPart(d, kind, initial) {
    const W = this.W;
    const H = this.H;
    d.x = Math.random() * (W + 200);
    if (kind === "bubbles" || kind === "sandup") {
      // rising from below: bubbles wobble up quickly, sand drifts up slowly
      d.y = initial ? Math.random() * H : H + 10 + Math.random() * 60;
      d.vy = kind === "bubbles" ? -(60 + Math.random() * 90) : -(18 + Math.random() * 34);
      d.vx = -10 + Math.random() * 20;
      d.phase = Math.random() * 10;
    } else if (kind === "embers") {
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
      if (this.sets[id] || !biomeArtReady(id)) continue;
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
    // wide screens: the space beside the portrait frame follows the biome
    setSideTheme(this.scene.textures, themeFor(id));
  }

  update(dt, scroll, pal, o = {}) {
    this.time += dt;
    this.scroll = scroll;
    if (o.theme) this.setTheme(o.theme, o.instant);
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
      if (set.aurora) this.drawAurora(set.aurora, set.alpha, lift);
      if (set.flares) this.drawFlares(set.flares, set.alpha, lift, dt);
      if (set.grid) this.drawGrid(set.grid, set.alpha, lift, dt);
      if (set.tears) this.drawTears(set.tears, set.alpha, lift, dt);
      if (set.veins) {
        // faint at rest, swelling on each lub-dub (gentler with Reduce Flashing)
        const hb = heartbeat(this.time) * (reduceFlashing() ? 0.35 : 1);
        set.veins.setDepth(-96.8 + lift).setAlpha(set.alpha * (0.05 + 0.13 * hb));
      }
      for (const r of set.rays) {
        r.setDepth(-94 + lift).setAlpha(
          set.alpha * (0.06 + 0.04 * Math.sin(this.time * 0.6 + r.phase)),
        );
        r.x -= scroll * dt * 0.02;
        if (r.x < -this.W * 0.15) r.x += this.W * 1.25;
      }
      for (const l of set.layers) {
        l.tilePositionX += (scroll * dt * l.speed) / this.k;
        l.setDepth(l.baseDepth + lift).setAlpha(set.alpha * (l.alphaMul ?? 1));
      }
      for (const d of set.parts) {
        if (set.kind === "noise") {
          d.life -= dt;
          if (d.life <= 0) {
            this.resetPart(d, "noise", false);
            d.life = 0.05 + Math.random() * 0.35;
            const cols = set.colors || [0x2bffef, 0xff5ad8, 0xffffff];
            d.setTint(cols[Math.floor(Math.random() * cols.length)]);
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
        if (set.kind === "bubbles") d.x += Math.sin(this.time * 3 + d.phase) * 14 * dt;
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

/** Stepped light-ray strip for the Tidal Sky: brightest in the middle, fading down. */
function lightRayTexture(scene) {
  if (scene.textures.exists("lightray")) return;
  const w = 8;
  const h = 48;
  const c = scene.textures.createCanvas("lightray", w, h);
  const ctx = c.getContext();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const core = x >= 2 && x <= 5 ? 1 : 0.5;
      const a = core * Math.max(0, 1 - Math.floor((y / h) * 6) / 6);
      if (a <= 0) continue;
      ctx.fillStyle = `rgba(255,255,255,${(a * 0.9).toFixed(2)})`;
      ctx.fillRect(x, y, 1, 1);
    }
  c.refresh();
  c.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

// Pixel-art background for the Backdrop scene (no post-FX, never competes with hazards):
//   dithered sky → far cliffs → mid ruins → near cave teeth (top + bottom) → weather (rain…)
// All layers are reusable tiling textures; each art pixel lands on whole screen pixels.
import { heartbeat } from "../biomes/Background.js";
import { VIEW } from "../config.js";
import { S } from "./px.js";
import { themeFor } from "./themes.js";

export class PixelBackground {
  constructor(scene, { lowGfx = false } = {}) {
    this.scene = scene;
    this.lowGfx = lowGfx;
    const W = VIEW.W;
    const H = VIEW.H;
    this.W = W;
    this.H = H;
    this.time = 0;
    this.beat = 0;
    this.scroll = 0;
    // texture scale so each art pixel is a whole number of physical pixels at this camera zoom
    const z = scene.cameras.main.zoom;
    this.k = Math.max(1, Math.round(S * z)) / (S * z);
    this.theme = themeFor("void");
    const t = this.theme;
    const k = this.k;
    const tex = (key) => scene.textures.get(key).getSourceImage();

    this.sky = scene.add
      .image(W / 2, H / 2, t.sky)
      .setDisplaySize(W + 8, H + 8)
      .setDepth(-100);

    const layer = (key, y, originY, depth, speed, alpha = 1) => {
      const img = tex(key);
      const h = img.height * k;
      const ts = scene.add
        .tileSprite(W / 2, y, W + 16, h, key)
        .setOrigin(0.5, originY)
        .setDepth(depth)
        .setAlpha(alpha);
      ts.setTileScale(k);
      ts.speed = speed;
      return ts;
    };
    this.layers = [
      layer(t.far, H * 0.72, 1, -95, 0.06),
      layer(t.roots, -4, 0, -93, 0.1),
      layer(t.mid, H + 4, 1, -90, 0.16),
      layer(t.nearTop, -4, 0, -85, 0.3),
      layer(t.nearBot, H + 4, 1, -85, 0.3),
    ];

    // weather: pooled pixel streaks
    this.drops = [];
    const n = lowGfx ? 26 : t.weather.rate;
    for (let i = 0; i < n; i++) {
      const d = scene.add.image(0, 0, "rain").setDepth(-70).setTint(t.weather.color);
      d.setScale(k);
      this.resetDrop(d, true);
      this.drops.push(d);
    }

    this.motes = [];
    for (let i = 0; i < (lowGfx ? 8 : 18); i++) {
      const m = scene.add
        .image(Math.random() * W, H * (0.2 + Math.random() * 0.6), "px1")
        .setDepth(-72);
      m.setTint(0x9fe8e0)
        .setScale(k * (Math.random() < 0.3 ? 2 : 1))
        .setAlpha(0.25 + Math.random() * 0.35);
      m.phase = Math.random() * 10;
      m.vx = 10 + Math.random() * 20;
      this.motes.push(m);
    }

    this.pulseVig = scene.add
      .image(W / 2, H / 2, "vignette")
      .setDisplaySize(W, H)
      .setDepth(-19);
    this.pulseVig.setTintFill(0xff0018).setAlpha(0);
    this.dimRect = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(-10);
  }

  resetDrop(d, initial) {
    d.x = Math.random() * (this.W + 200);
    d.y = initial ? Math.random() * this.H : -20 - Math.random() * 80;
    d.vy = 700 + Math.random() * 300;
    d.setAlpha(0.18 + Math.random() * 0.3);
  }

  update(dt, scroll, pal, o = {}) {
    this.time += dt;
    this.scroll = scroll;
    const beat = heartbeat(this.time) * (pal?.pulse || 0);
    this.beat = beat;
    for (const l of this.layers) l.tilePositionX += (scroll * dt * l.speed) / this.k;
    const vx = -scroll * 0.35 - 90;
    for (const d of this.drops) {
      d.x += vx * dt;
      d.y += d.vy * dt;
      if (d.y > this.H + 20 || d.x < -20) this.resetDrop(d, false);
    }
    for (const m of this.motes) {
      m.x -= (scroll * 0.12 + m.vx) * dt;
      m.y += Math.sin(this.time * 1.3 + m.phase) * 12 * dt;
      m.alpha = 0.2 + 0.3 * (0.5 + 0.5 * Math.sin(this.time * 2 + m.phase));
      if (m.x < -10) {
        m.x = this.W + 10;
        m.y = this.H * (0.2 + Math.random() * 0.6);
      }
    }
    this.pulseVig.setAlpha(beat * 0.5);
    const dim = o.dim ?? 0;
    this.dimRect.fillAlpha += (dim - this.dimRect.fillAlpha) * Math.min(1, dt * 8);
  }
}

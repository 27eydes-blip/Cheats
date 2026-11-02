// Textured terrain walls along the top and bottom screen edges, spikes on the surface (the
// kill line), plus harmless decorations living in the wall: lamps, blinking eyes, crystals.
// Purely visual — the death boundary is unchanged. Biome changes crossfade the wall set.
import { S } from "./px.js";

const EDGE_H = 11 * S;
const FADE = 1.2;

export class Terrain {
  constructor(scene, theme, { W, H }) {
    this.scene = scene;
    this.W = W;
    this.H = H;
    this.sets = [];
    this.theme = null;
    this.decor = [];
    this.nextDecor = 0;
    this.time = 0;
    this.scrollX = 0;
    this.setTheme(theme, true);
  }

  makeSet(theme) {
    const { scene, W, H } = this;
    const wide = W * 3;
    const top = scene.add
      .tileSprite(W / 2, -EDGE_H + S * 3, wide, 900, theme.wall)
      .setOrigin(0.5, 1)
      .setDepth(7);
    const topEdge = scene.add
      .tileSprite(W / 2, 0, wide, EDGE_H, theme.edge)
      .setOrigin(0.5, 1)
      .setDepth(8);
    const bot = scene.add
      .tileSprite(W / 2, H + EDGE_H - S * 3, wide, 900, theme.wall)
      .setOrigin(0.5, 0)
      .setDepth(7);
    const botEdge = scene.add
      .tileSprite(W / 2, H, wide, EDGE_H, theme.edgeB)
      .setOrigin(0.5, 0)
      .setDepth(8);
    bot.tilePositionY = 16 * S;
    const parts = [top, topEdge, bot, botEdge];
    for (const p of parts) p.tilePositionX = this.scrollX;
    return { id: theme.id, parts, alpha: 0 };
  }

  setTheme(theme, instant = false) {
    if (this.theme && this.theme.id === theme.id) return;
    this.theme = theme;
    let set = this.sets.find((s) => s.id === theme.id);
    if (!set) {
      set = this.makeSet(theme);
      this.sets.push(set);
    }
    if (instant) for (const s of this.sets) s.alpha = s === set ? 1 : 0;
  }

  /** Visible wall bands depend on the camera zoom (top band: [top, -EDGE_H]). */
  setView(zoom) {
    this.viewTop = this.H / 2 - this.H / 2 / zoom;
    this.viewBottom = this.H / 2 + this.H / 2 / zoom;
    this.viewLeft = this.W / 2 - this.W / 2 / zoom;
    this.viewRight = this.W / 2 + this.W / 2 / zoom;
  }

  spawnDecor(x) {
    const t = this.theme;
    const roll = Math.random();
    const top = Math.random() < 0.5;
    const band = top ? -EDGE_H - this.viewTop : this.viewBottom - this.H - EDGE_H;
    let d = this.decor.find((o) => !o.active);
    if (!d) {
      d = this.scene.add.image(0, 0, t.atlas, "eyes_0").setDepth(7.5);
      this.decor.push(d);
    }
    d.setActive(true).setVisible(true).setFlipY(false);
    d.atlas = t.atlas;
    d.kind = roll < 0.4 ? "eyes" : roll < 0.7 ? "torch" : "crystal";
    if (d.kind === "torch" && top) d.kind = "crystal"; // lamps stand on the floor wall
    const frame =
      d.kind === "eyes"
        ? "eyes_0"
        : d.kind === "torch"
          ? "torch_0"
          : `crystal_${Math.floor(Math.random() * 2)}`;
    d.setTexture(t.atlas, frame);
    const h = d.height;
    const inset = Math.max(h / 2 + S, Math.min(band - h / 2 - S, band * 0.55));
    d.y = top ? -EDGE_H - inset : this.H + EDGE_H + inset;
    if (d.kind === "crystal") d.setFlipY(top);
    d.x = x;
    d.blinkT = Math.random() * 3;
    d.phase = Math.random() * 10;
  }

  update(dt, scroll) {
    this.time += dt;
    const dx = scroll * dt;
    this.scrollX += dx;
    this.curAlpha = this.sets.find((x) => x.id === this.theme.id)?.alpha ?? 1;
    for (const set of this.sets) {
      // incoming set fades in on top; outgoing sets stay solid until it fully covers them
      const cur = set.id === this.theme.id;
      const target = cur ? 1 : this.curAlpha >= 1 ? 0 : set.alpha;
      const rate = cur ? dt / FADE : (dt * 4) / FADE;
      set.alpha += Math.sign(target - set.alpha) * Math.min(Math.abs(target - set.alpha), rate);
      const lift = target ? 0.25 : 0;
      for (const p of set.parts) {
        p.tilePositionX = this.scrollX;
        p.setAlpha(set.alpha).setVisible(set.alpha > 0.001);
        p.setDepth(Math.floor(p.depth) + lift);
      }
    }
    this.nextDecor -= dx;
    while (this.nextDecor <= 0) {
      this.spawnDecor((this.viewRight ?? this.W) + 60);
      this.nextDecor += 90 + Math.random() * 160;
    }
    for (const d of this.decor) {
      if (!d.active) continue;
      d.x -= dx;
      if (d.kind === "eyes") {
        d.blinkT -= dt;
        const f = d.blinkT < 0.06 ? 2 : d.blinkT < 0.12 ? 1 : 0;
        d.setFrame(`eyes_${f}`);
        if (d.blinkT < 0) d.blinkT = 1.5 + Math.random() * 3;
      } else if (d.kind === "torch") {
        d.setFrame(`torch_${Math.floor(this.time * 9 + d.phase) % 3}`);
      }
      if (d.x < (this.viewLeft ?? 0) - 80) d.setActive(false).setVisible(false);
    }
  }
}

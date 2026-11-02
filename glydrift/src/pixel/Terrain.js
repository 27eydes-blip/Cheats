// Textured terrain walls along the top and bottom screen edges, spikes on the surface (the
// kill line), plus harmless decorations living in the wall: torches, blinking eyes, crystals.
// Purely visual — the death boundary is unchanged.
import { S } from "./px.js";

const EDGE_H = 11 * S;

export class Terrain {
  constructor(scene, theme, { W, H }) {
    this.scene = scene;
    this.W = W;
    this.H = H;
    const wide = W * 3;
    this.theme = theme;
    this.topBody = scene.add
      .tileSprite(W / 2, -EDGE_H + S * 3, wide, 900, theme.wall)
      .setOrigin(0.5, 1)
      .setDepth(7);
    this.topEdge = scene.add
      .tileSprite(W / 2, 0, wide, EDGE_H, theme.edge)
      .setOrigin(0.5, 1)
      .setDepth(8);
    this.botBody = scene.add
      .tileSprite(W / 2, H + EDGE_H - S * 3, wide, 900, theme.wall)
      .setOrigin(0.5, 0)
      .setDepth(7);
    this.botEdge = scene.add
      .tileSprite(W / 2, H, wide, EDGE_H, theme.edgeB)
      .setOrigin(0.5, 0)
      .setDepth(8);
    this.botBody.tilePositionY = 16 * S;
    this.decor = [];
    this.nextDecor = 0;
    this.time = 0;
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
    const band = top ? -EDGE_H - this.viewTop : this.viewBottom - this.H - EDGE_H; // visible wall thickness
    let d = this.decor.find((o) => !o.active);
    if (!d) {
      d = this.scene.add.image(0, 0, t.atlas, "eyes_0").setDepth(7.5);
      this.decor.push(d);
    }
    d.setActive(true).setVisible(true).setFlipY(false);
    d.kind = roll < 0.4 ? "eyes" : roll < 0.7 ? "torch" : "crystal";
    if (d.kind === "torch" && top) d.kind = "crystal"; // torches stand on the floor wall
    const frame =
      d.kind === "eyes"
        ? "eyes_0"
        : d.kind === "torch"
          ? "torch_0"
          : `crystal_${Math.floor(Math.random() * 2)}`;
    d.setTexture(t.atlas, frame);
    const h = d.height;
    // sit inside the visible strip of wall (partially hidden is fine on short screens)
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
    for (const ts of [this.topBody, this.topEdge, this.botBody, this.botEdge])
      ts.tilePositionX += dx;
    // decorations ride the world
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

// WASP LORD's x16: a red-and-black flaming number. Pixel flame tongues (black smoke edge, red
// body, a hot red-orange core) lick up behind red text with a heavy black outline. Drawn with one
// Graphics (redrawn each frame while shown) and two texts made once, so nothing re-renders text
// mid-run. Reduce Flashing: the flames sway slowly instead of flickering.
import { NUM_FONT, VIEW } from "../config.js";
import { reduceFlashing } from "./ScreenFlash.js";

const P = 3; // flame pixel size (matches the chunky pixel look of the HUD)
const snap = (v) => Math.round(v / P) * P;

export class FlameNumber {
  /**
   * @param {Phaser.Scene} scene
   * @param {string} str the text ("x16")
   * @param {number} size font size in px
   */
  constructor(scene, x, y, str, size, { depth = 32 } = {}) {
    this.scene = scene;
    this.t = 0;
    this.c = scene.add.container(x, y).setDepth(depth);
    this.c.flame = this; // (tests: find the flaming label from the container)
    this.g = scene.add.graphics();
    const style = {
      fontFamily: NUM_FONT,
      fontSize: `${Math.round(size * 1.15)}px`,
      fontStyle: "700",
      color: "#ff1a2a",
      stroke: "#000000",
      strokeThickness: Math.max(4, Math.round(size / 6)),
      resolution: VIEW.Z,
    };
    this.text = scene.add.text(0, 0, str, style).setOrigin(0.5, 0.5);
    this.text.setPadding(8, 8, 8, 8);
    // a soft red glow under the black outline (readable on any realm's sky)
    this.text.setShadow(0, 0, "#ff1a2a", 10 * VIEW.Z, true, false);
    this.w = this.text.width - 16;
    this.h = this.text.height - 16;
    this.c.add([this.g, this.text]);
    this.draw();
  }

  /** Draw this frame's flames (call every frame while the label shows). */
  update(dt) {
    this.t += dt;
    this.draw();
  }

  draw() {
    const calm = reduceFlashing();
    const g = this.g.clear();
    const w = this.w + 10;
    const top = -this.h / 2 + 8; // flames rise from behind the top of the digits
    const n = Math.max(5, Math.round(w / 16));
    const t = this.t * (calm ? 0.9 : 1);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + ((i + 0.5) / n) * w;
      const ph = i * 1.7;
      // calm: a slow sway; otherwise each tongue leaps on its own beat
      const k = calm
        ? 0.75 + 0.15 * Math.sin(t * 1.6 + ph)
        : 0.55 + 0.25 * Math.sin(t * 9 + ph) + 0.2 * Math.sin(t * 23 + ph * 2.3);
      const hgt = snap((this.h * 0.95 + (i % 2 ? 0 : 10)) * k + 8);
      const sway = snap((calm ? 1.5 : 3) * Math.sin(t * (calm ? 1.2 : 5) + ph));
      const tongue = (wd, hh, col, a) => {
        // a stepped pixel tongue: narrower toward its tip
        for (let y = 0; y < hh; y += P) {
          const f = 1 - y / hh;
          const ww = Math.max(P, snap(wd * (0.35 + 0.65 * f)));
          g.fillStyle(col, a).fillRect(snap(x + sway * (1 - f) - ww / 2), snap(top + 10 - y), ww, P);
        }
      };
      tongue(24, hgt + 6, 0x000000, 0.9); // black smoke edge
      tongue(18, hgt, 0xb0000e, 1);
      tongue(12, hgt * 0.75, 0xff1a2a, 1);
      tongue(6, hgt * 0.42, 0xff7a4a, 1); // hot core
    }
  }

  setVisible(v) {
    this.c.setVisible(v);
    return this;
  }
  get visible() {
    return this.c.visible;
  }
  setPosition(x, y) {
    this.c.setPosition(x, y);
    return this;
  }
  setScale(s) {
    this.c.setScale(s);
    return this;
  }
  setAlpha(a) {
    this.c.setAlpha(a);
    return this;
  }
  destroy() {
    this.c.destroy();
  }
}

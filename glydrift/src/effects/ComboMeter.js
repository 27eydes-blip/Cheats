// Combo multiplier label that rides next to the player: "x2", "x3", "x5", "x10" with a
// draining timer bar. Each label is rendered once up front (no text re-renders mid-run).
import { neonText } from "../ui/ui.js";

export const TIERS = [2, 3, 5, 10];
export const TIER_COLORS = { 2: 0x3ef4ff, 3: 0x39ff88, 5: 0xff4fd8, 10: 0xffd23f };

export class ComboMeter {
  constructor(scene, depth = 32) {
    this.scene = scene;
    this.labels = {};
    for (const m of TIERS) {
      this.labels[m] = neonText(scene, 0, 0, `x${m}`, m === 10 ? 50 : 42, TIER_COLORS[m], {
        blur: 12,
      })
        .setDepth(depth)
        .setVisible(false);
    }
    this.bar = scene.add.graphics().setDepth(depth);
    this.mult = 1;
    this.pop = 0;
  }

  reset() {
    this.setTier(1);
  }

  setTier(m) {
    this.mult = m;
    for (const k of TIERS) this.labels[k].setVisible(k === m);
    this.pop = m > 1 ? 1 : 0;
    if (m <= 1) this.bar.clear();
  }

  /** frac = how much of the 3 s combo window is left */
  update(dt, x, y, frac) {
    if (this.mult <= 1) return;
    const t = this.labels[this.mult];
    this.pop = Math.max(0, this.pop - dt * 5);
    const s = 1 + this.pop * this.pop * 0.6;
    const lx = Math.round(x + 74);
    const ly = Math.round(y - 78);
    t.setPosition(lx, ly).setScale(s).setAlpha(frac < 0.25 ? 0.55 + 0.45 * Math.sin(frac * 60) ** 2 : 1);
    const w = 64;
    const g = this.bar;
    g.clear();
    g.fillStyle(0x000000, 0.45).fillRect(lx - w / 2, ly + 28, w, 6);
    g.fillStyle(TIER_COLORS[this.mult], 1).fillRect(lx - w / 2, ly + 28, Math.round(w * frac), 6);
  }
}

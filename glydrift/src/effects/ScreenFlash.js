// Screen flashes made of two plain overlays (a full-screen colour rect + a tinted edge
// vignette): no shaders, no render targets. Safety rules live here:
//   · at most 3 flashes start in any 1-second window (extra ones are dropped)
//   · peaks are capped so hazards stay readable through the brightest frame
//   · "Reduce Flashing" turns every flash into a gentle, dim colour fade
import { Save } from "../data/save.js";
import { FLASH_LIMITS } from "../tuning.js";

const MAX_PER_SEC = FLASH_LIMITS.maxPerSecond;
const PEAK_CAP = FLASH_LIMITS.peakCap;

/** Reduce Flashing: the saved choice, else the device's Reduce Motion setting. */
export function reduceFlashing() {
  const s = Save.data.settings;
  if (typeof s.reduceFlash === "boolean") return s.reduceFlash;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export class ScreenFlash {
  constructor(scene, { depth = 40 } = {}) {
    this.scene = scene;
    this.time = 0;
    this.starts = [];
    this.full = scene.add.rectangle(0, 0, 10, 10, 0xffffff, 1).setDepth(depth).setVisible(false);
    this.edge = scene.add.image(0, 0, "vignette").setDepth(depth).setVisible(false);
    this.layers = [
      { obj: this.full, t: 1, dur: 1, peak: 0 },
      { obj: this.edge, t: 1, dur: 1, peak: 0 },
    ];
    this.refresh();
  }

  /** Re-read the Reduce Flashing setting (cheap; called at run start). */
  refresh() {
    this.reduce = reduceFlashing();
  }

  /**
   * @param color 0xRRGGBB
   * @param o.peak opacity at the brightest moment (capped)
   * @param o.dur seconds to fade out
   * @param o.edge true → coloured screen edges only
   * @param o.priority true → may replace a brighter flash that is still fading
   */
  flash(color, { peak = 0.4, dur = 0.3, edge = false, priority = false } = {}) {
    const now = this.time;
    this.starts = this.starts.filter((t) => now - t < 1);
    if (this.starts.length >= MAX_PER_SEC) return false;
    const L = this.layers[edge ? 1 : 0];
    let p = Math.min(PEAK_CAP, peak);
    let d = dur;
    if (this.reduce) {
      // a soft rise-and-fall in the same colour, never white, never sharp
      if (color === 0xffffff) color = 0xbfe8ff;
      p *= 0.3;
      d = Math.max(0.7, dur * 2.5);
    }
    const cur = L.t < L.dur ? this.alphaOf(L) : 0;
    if (!priority && cur > p) return false;
    this.starts.push(now);
    Object.assign(L, { color, peak: p, dur: d, t: 0, soft: this.reduce });
    if (edge) L.obj.setTintFill(color);
    else L.obj.setFillStyle(color, 1);
    L.obj.setVisible(true);
    return true;
  }

  alphaOf(L) {
    const k = Math.min(1, L.t / L.dur);
    return L.soft ? L.peak * Math.sin(Math.PI * k) : L.peak * (1 - k) * (1 - k);
  }

  update(dt) {
    this.time += dt;
    const v = this.scene.cameras.main.worldView;
    for (const L of this.layers) {
      if (L.t >= L.dur) continue;
      L.t += dt;
      if (L.t >= L.dur) {
        L.obj.setVisible(false);
        continue;
      }
      // cover exactly what the camera sees (zoom / shake safe)
      L.obj
        .setPosition(v.centerX, v.centerY)
        .setDisplaySize(v.width + 40, v.height + 40)
        .setAlpha(this.alphaOf(L));
    }
  }

  clear() {
    for (const L of this.layers) {
      L.t = L.dur;
      L.obj.setVisible(false);
    }
  }
}

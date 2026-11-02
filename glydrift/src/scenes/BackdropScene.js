// Persistent background scene shared by every screen. It renders before the active screen
// and has no post-FX, so bloom only ever touches gameplay elements, never the background.
import Phaser from "phaser";
import { Background } from "../biomes/Background.js";
import { BIOMES, blendPalette } from "../biomes/biomes.js";
import { fitCamera } from "../config.js";
import { Save } from "../systems/save.js";

export function backgroundStyle() {
  const q =
    typeof location !== "undefined" ? new URLSearchParams(location.search).get("style") : null;
  return q || Save.data.settings.bgStyle || "grid";
}

export class BackdropScene extends Phaser.Scene {
  constructor() {
    super("Backdrop");
  }

  create() {
    fitCamera(this);
    this.cameras.main.setBackgroundColor(0x020107);
    this.bg = new Background(this, { lowGfx: Save.data.settings.lowGfx, style: backgroundStyle() });
    this.pal = blendPalette({ a: BIOMES[0], b: BIOMES[0], t: 0 }, {});
    this.state = { scroll: 120, speedNorm: 0, dim: 0, hazards: [] };
  }

  /** Called every frame by the active screen. */
  drive(pal, state) {
    this.pal = pal;
    const st = this.state;
    st.scroll = state.scroll ?? 120;
    st.speedNorm = state.speedNorm ?? 0;
    st.dim = state.dim ?? 0;
    st.hazards = state.hazards ?? [];
    st.scenery = state.scenery ?? true;
  }

  /** Rebuild after a graphics/style setting change. */
  rebuild() {
    this.scene.restart();
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 1 / 30);
    const st = this.state;
    this.bg.update(dt, st.scroll, this.pal, st);
  }
}

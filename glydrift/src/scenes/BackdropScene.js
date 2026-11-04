// Persistent background scene shared by every screen; it renders before the active screen.
import Phaser from "phaser";
import { BIOMES, blendPalette } from "../biomes/biomes.js";
import { fitCamera } from "../config.js";
import { PixelBackground } from "../pixel/PixelBackground.js";
import { Save } from "../data/save.js";

export class BackdropScene extends Phaser.Scene {
  constructor() {
    super("Backdrop");
  }

  create() {
    fitCamera(this);
    this.cameras.main.setBackgroundColor(0x020107);
    this.bg = new PixelBackground(this, { lowGfx: Save.data.settings.lowGfx });
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
    if (state.theme) st.theme = state.theme; // pixel biome to show (crossfades)
    st.instant = !!state.instant; // switch without the crossfade (a rift hides the cut)
    st.particleSpeed = state.particleSpeed ?? 1;
    // colour energy (gameplay only): in-biome colour wash, beat pulse, glowing floor
    st.shift = state.shift ?? 0;
    st.shiftAmt = state.shift === undefined ? 0 : (state.shiftAmt ?? 1);
    st.beat = state.beat ?? 0;
    st.floor = state.floor ?? null;
  }

  /** Rebuild after a graphics/style setting change. */
  rebuild() {
    this.scene.restart();
  }

  update(time, delta) {
    // warm up the other biomes' layers one per frame, including biomes whose art is only
    // built mid-run (otherwise their layers were made on arrival — a hitch at the rift)
    if (time > 600) this.bg.prebuildNext();
    const dt = Math.min(delta / 1000, 1 / 30);
    const st = this.state;
    this.bg.update(dt, st.scroll, this.pal, st);
  }
}

// © 2026 Sam Eyde III. All rights reserved. Glydrift — see LICENSE. Not open source.
// Hidden music test page: tap the GLYDRIFT logo 5 times on the home screen (or open ?music).
// Play every track, jump between them (on-beat crossfade), push intensity, try the death sweep.
import Phaser from "phaser";
import { BIOMES, blendPalette } from "../biomes/biomes.js";
import { fitCamera, VIEW } from "../config.js";
import { Music } from "../audio/music.js";
import { TRACKS } from "../audio/musicTracks.js";
import { button, hex, neonText, plainText, slider } from "../ui/ui.js";

const ORDER = ["menu", "void", "solar", "frozen", "glitch", "abyss"];
const COLORS = {
  menu: 0xb45cff,
  void: 0x3ef4ff,
  solar: 0xffb22e,
  frozen: 0x9ff2ff,
  glitch: 0x39ff88,
  abyss: 0xff2a3d,
};
const PAL = { menu: 0, void: 0, solar: 1, frozen: 2, glitch: 3, abyss: 4 };

export class MusicTestScene extends Phaser.Scene {
  constructor() {
    super("MusicTest");
  }

  create() {
    fitCamera(this);
    const W = VIEW.W;
    const H = VIEW.H;
    const top = (this.registry.get("safeTop") || 0) + 20;
    this.backdrop = this.scene.get("Backdrop");
    this.pal = blendPalette({ a: BIOMES[0], b: BIOMES[0], t: 0 }, {});
    this.intensity = 0.5;
    this.selected = Music.status().id || null;

    button(this, 80, top + 46, 120, 64, "BACK", {
      color: 0xff4fd8,
      size: 18,
      onClick: () => this.scene.start("Menu"),
    });
    neonText(this, W / 2 + 40, top + 46, "MUSIC TEST", 34, 0x39ff88, { blur: 10 });
    plainText(
      this,
      W / 2,
      top + 100,
      "All tracks are synthesized live — tap one to play",
      18,
      "#bfb6e8",
    );

    this.rows = ORDER.map((id, i) => {
      const d = TRACKS[id];
      const y = top + 190 + i * 112;
      const b = button(this, W / 2, y, W - 100, 96, d.name.toUpperCase(), {
        color: COLORS[id],
        size: 24,
        sub: `${d.mood} · ${d.bpm} BPM`,
        onClick: () => this.playTrack(id),
      });
      return { id, b };
    });

    const cy = top + 190 + ORDER.length * 112 + 20;
    slider(
      this,
      90,
      cy + 20,
      W - 180,
      this.intensity,
      0xffd23f,
      (v) => {
        this.intensity = v;
        Music.setIntensity(v);
      },
      { label: "INTENSITY (simulated speed)" },
    );
    button(this, W / 2 - 165, cy + 110, 300, 76, "DEATH SWEEP", {
      color: 0xff2a3d,
      size: 18,
      onClick: () => Music.deathSweep(),
    });
    button(this, W / 2 + 165, cy + 110, 300, 76, "RETRY (RESTORE)", {
      color: 0x39ff88,
      size: 16,
      onClick: () => Music.restore(),
    });
    button(this, W / 2 - 165, cy + 200, 300, 76, "STOP", {
      color: 0x8a80b0,
      size: 18,
      onClick: () => Music.stop(),
    });
    button(this, W / 2 + 165, cy + 200, 300, 76, "JUMP TO DROP", {
      color: 0xb45cff,
      size: 16,
      onClick: () => {
        const id = Music.status().id;
        if (id) {
          Music.stop();
          Music.play(id, { startBar: 32 });
        }
      },
    });
    this.status = plainText(this, W / 2, Math.min(H - 40, cy + 280), "", 20, "#ffffff");
    Music.setIntensity(this.intensity);
  }

  playTrack(id) {
    Music.unlock();
    Music.play(id, { startBar: 0 });
    this.selected = id;
  }

  update() {
    const st = Music.status();
    const id = st.pending || st.id;
    if (id) blendPalette({ a: BIOMES[PAL[id]], b: BIOMES[PAL[id]], t: 0 }, this.pal);
    this.backdrop.drive(this.pal, { scroll: 90, dim: 0.55, scenery: false });
    for (const r of this.rows) r.b.setAlpha(r.id === st.id ? 1 : r.id === st.pending ? 0.8 : 0.55);
    const name = st.id ? TRACKS[st.id].name : "—";
    this.status.setText(
      !st.unlocked
        ? "Tap anywhere to enable audio"
        : `${name}  ·  ${st.section.toUpperCase()}  ·  bar ${st.bar + 1}  ·  ${st.bpm} BPM${st.pending ? `  →  ${TRACKS[st.pending].name}` : ""}`,
    );
    this.status.setColor(st.id ? hex(COLORS[st.id]) : "#ffffff");
  }
}

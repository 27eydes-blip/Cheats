import "@fontsource/orbitron/700.css";
import "@fontsource/orbitron/900.css";
import "@fontsource/rajdhani/600.css";
import "@fontsource/rajdhani/700.css";
import Phaser from "phaser";
import { setupView, VIEW } from "./config.js";
import { GlyPostFX } from "./gfx/shaders.js";
import { BackdropScene } from "./scenes/BackdropScene.js";
import { BootScene } from "./scenes/BootScene.js";
import { CharacterScene } from "./scenes/CharacterScene.js";
import { GameOverScene } from "./scenes/GameOverScene.js";
import { GameScene } from "./scenes/GameScene.js";
import { HudScene } from "./scenes/HudScene.js";
import { LeaderboardScene } from "./scenes/LeaderboardScene.js";
import { MenuScene } from "./scenes/MenuScene.js";
import { MusicTestScene } from "./scenes/MusicTestScene.js";
import { ProgressScene } from "./scenes/ProgressScene.js";
import { SkyScene } from "./scenes/SkyScene.js";
import "./systems/install.js"; // registers beforeinstallprompt early (Android install button)
import { Music } from "./systems/music.js";
import { Save } from "./systems/save.js";

async function boot() {
  // make sure the display fonts are ready before any Text is rasterised
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load("700 32px Orbitron"),
        document.fonts.load("900 32px Orbitron"),
        document.fonts.load("600 32px Rajdhani"),
        document.fonts.load("700 32px Rajdhani"),
      ]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch {
    /* fall back to system fonts */
  }

  // render at the device's full pixel ratio (capped at 2x in Low Graphics)
  setupView(Save.data.settings.lowGfx);
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: "game",
    width: VIEW.PW,
    height: VIEW.PH,
    backgroundColor: "#020107",
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    fps: { target: 60, limit: 60, smoothStep: true },
    render: { antialias: true, powerPreference: "high-performance", roundPixels: false },
    input: { activePointers: 2 },
    disableContextMenu: true,
    pipeline: { GlyPostFX },
    // order matters: scenes render in this order (Sky → Backdrop → screens → overlays)
    scene: [
      BootScene,
      SkyScene,
      BackdropScene,
      MenuScene,
      GameScene,
      HudScene,
      GameOverScene,
      CharacterScene,
      ProgressScene,
      LeaderboardScene,
      MusicTestScene,
    ],
  });

  // safe-area (notch) offset converted into logical game units
  const updateSafe = () => {
    const probe = document.getElementById("safe-probe");
    const inset = probe ? probe.getBoundingClientRect().height : 0;
    const canvasH = game.canvas?.getBoundingClientRect().height || window.innerHeight;
    game.registry.set("safeTop", Math.round((inset * VIEW.H) / canvasH));
  };
  game.events.once("ready", () => {
    updateSafe();
    // Phaser's ADD blend is (ONE, DST_ALPHA): inside a transparent post-FX layer that darkens
    // whatever is under the quad, leaving box artifacts. Use a true premultiplied add.
    const r = game.renderer;
    if (r?.gl && r.blendModes?.[Phaser.BlendModes.ADD]) {
      r.blendModes[Phaser.BlendModes.ADD].func = [r.gl.ONE, r.gl.ONE];
    }
  });
  window.addEventListener("resize", () => setTimeout(updateSafe, 100));
  window.__glydrift = game;
  window.__music = Music; // handy for debugging / the music test page
}

// Audio may only start inside a user gesture (iOS): the first tap anywhere unlocks it.
for (const type of ["pointerdown", "touchend", "keydown"]) {
  window.addEventListener(type, () => Music.unlock(), { capture: true, passive: true });
}

// Installable / offline (production builds only, like the other games on GitHub Pages)
if (
  import.meta.env.PROD &&
  "serviceWorker" in navigator &&
  (location.protocol === "https:" || location.hostname === "localhost")
) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

boot();

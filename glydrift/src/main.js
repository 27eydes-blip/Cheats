import "@fontsource/orbitron/500.css";
import "@fontsource/orbitron/700.css";
import "@fontsource/orbitron/900.css";
import Phaser from "phaser";
import { computeGameHeight, GAME_W } from "./config.js";
import { GlyPostFX } from "./gfx/shaders.js";
import { BootScene } from "./scenes/BootScene.js";
import { CharacterScene } from "./scenes/CharacterScene.js";
import { GameOverScene } from "./scenes/GameOverScene.js";
import { GameScene } from "./scenes/GameScene.js";
import { HudScene } from "./scenes/HudScene.js";
import { MenuScene } from "./scenes/MenuScene.js";
import { ProgressScene } from "./scenes/ProgressScene.js";
import { SkyScene } from "./scenes/SkyScene.js";

async function boot() {
  // make sure the display font is ready before any Text is rasterised
  try {
    await Promise.race([
      Promise.all(["500", "700", "900"].map((w) => document.fonts.load(`${w} 32px Orbitron`))),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch {
    /* fall back to system fonts */
  }

  const H = computeGameHeight();
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: "game",
    width: GAME_W,
    height: H,
    backgroundColor: "#05010d",
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    fps: { target: 60, limit: 60, smoothStep: true },
    render: { antialias: true, powerPreference: "high-performance", roundPixels: false },
    input: { activePointers: 2 },
    disableContextMenu: true,
    pipeline: { GlyPostFX },
    scene: [
      BootScene,
      SkyScene,
      MenuScene,
      GameScene,
      HudScene,
      GameOverScene,
      CharacterScene,
      ProgressScene,
    ],
  });

  // safe-area (notch) offset converted into game units
  const updateSafe = () => {
    const probe = document.getElementById("safe-probe");
    const inset = probe ? probe.getBoundingClientRect().height : 0;
    const canvasH = game.canvas?.getBoundingClientRect().height || window.innerHeight;
    game.registry.set("safeTop", Math.round((inset * H) / canvasH));
  };
  game.events.once("ready", updateSafe);
  window.addEventListener("resize", () => setTimeout(updateSafe, 100));
  window.__glydrift = game;
}

boot();

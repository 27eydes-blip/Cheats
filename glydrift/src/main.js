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
    // ENVELOP: always covers the whole screen (any rounding mismatch is cropped, never barred)
    scale: { mode: Phaser.Scale.ENVELOP, autoCenter: Phaser.Scale.CENTER_BOTH },
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

  // safe areas (notch / home indicator) converted into logical game units, including any
  // part of the canvas cropped off-screen by ENVELOP scaling
  const updateSafe = () => {
    const probe = document.getElementById("safe-probe");
    const cs = probe ? getComputedStyle(probe) : null;
    const insetTop = probe ? probe.getBoundingClientRect().height : 0;
    const insetBottom = cs ? Number.parseFloat(cs.paddingBottom) || 0 : 0;
    const rect = game.canvas?.getBoundingClientRect();
    const canvasH = rect?.height || window.innerHeight;
    const cropTop = Math.max(0, -(rect?.top ?? 0));
    const cropBottom = Math.max(0, (rect?.bottom ?? canvasH) - window.innerHeight);
    game.registry.set("safeTop", Math.round(((insetTop + cropTop) * VIEW.H) / canvasH));
    game.registry.set("safeBottom", Math.round(((insetBottom + cropBottom) * VIEW.H) / canvasH));
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

// Installable / offline (production builds only, like the other games on GitHub Pages).
// Updates: the worker is checked on launch and when the app returns to the foreground; a new
// version that arrives right at launch reloads straight into it (never in the middle of a run).
if (
  import.meta.env.PROD &&
  "serviceWorker" in navigator &&
  (location.protocol === "https:" || location.hostname === "localhost")
) {
  const launchedAt = Date.now();
  // only an *upgrade* (an older worker was already in control) should reload — never the
  // very first install
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloaded || Date.now() - launchedAt > 15000) return;
    reloaded = true;
    window.location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js", { updateViaCache: "none" })
      .then((reg) => {
        reg.update().catch(() => {});
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update().catch(() => {});
        });
      })
      .catch(() => {});
  });
}

boot();

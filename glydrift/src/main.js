import "@fontsource/orbitron/700.css";
import "@fontsource/orbitron/900.css";
import "@fontsource/rajdhani/600.css";
import "@fontsource/rajdhani/700.css";
import Phaser from "phaser";
import "./gfx/tileSpriteFix.js";
import { setupView, VIEW, wantsFit } from "./config.js";
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
    // phones: ENVELOP (edge to edge, rounding is cropped, never barred);
    // iPad / desktop: FIT (whole playfield visible, thin side bars) — see wantsFit()
    scale: {
      mode: wantsFit() ? Phaser.Scale.FIT : Phaser.Scale.ENVELOP,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    // limit 61 (not 60): on 120 Hz screens two 8.33 ms ticks (16.66 ms) fall a hair short of
    // the 60 fps threshold (16.67 ms), so frames randomly took 2 or 3 ticks → 60/40 fps judder.
    fps: { target: 60, limit: 61, smoothStep: true },
    // all sound is Tone.js / raw WebAudio; Phaser's own audio context only caused a
    // "not allowed to start" console warning on load
    audio: { noAudio: true },
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
    let insetTop = probe ? probe.getBoundingClientRect().height : 0;
    // iOS often reports env(safe-area-inset-top) as 0 until layout settles (and in some
    // standalone launches never) → fall back to the known notch / Dynamic Island heights
    const fullScreen =
      window.navigator.standalone === true ||
      window.matchMedia?.("(display-mode: standalone)").matches ||
      window.innerHeight >= Math.max(screen.width, screen.height) - 1;
    if (insetTop < 20 && fullScreen && /iPhone/.test(navigator.userAgent)) {
      const sh = Math.max(screen.width, screen.height);
      if (sh >= 852)
        insetTop = 59; // Dynamic Island models
      else if (sh >= 812) insetTop = 47; // notch models
    }
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
  // rotating an iPad / Split View can cross between "phone-like" and "squarer" shapes
  const updateScaleMode = () => {
    const mode = wantsFit() ? Phaser.Scale.FIT : Phaser.Scale.ENVELOP;
    if (game.scale.scaleMode !== mode) {
      game.scale.scaleMode = mode;
      game.scale.refresh();
    }
  };
  window.addEventListener("resize", () => {
    updateScaleMode();
    setTimeout(updateSafe, 100);
  });
  // taps on the side bars (iPad/desktop) count as game taps: on a big screen the thumb
  // often lands outside the playfield
  document.getElementById("game")?.addEventListener(
    "pointerdown",
    (e) => {
      if (e.target === game.canvas) return;
      const sm = game.scene;
      const go = sm.getScene("GameOver");
      if (go?.sys.isActive()) return go.onBackgroundTap?.();
      const gs = sm.getScene("Game");
      if (gs?.sys.isActive() && !sm.getScene("Hud")?.pauseLayer) gs.onTap();
    },
    { passive: true },
  );
  window.addEventListener("orientationchange", () => setTimeout(updateSafe, 300));
  document.addEventListener("visibilitychange", () => setTimeout(updateSafe, 100));
  for (const ms of [300, 1000, 2500]) setTimeout(updateSafe, ms);
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

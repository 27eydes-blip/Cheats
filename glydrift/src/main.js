import "@fontsource/orbitron/700.css";
import "@fontsource/orbitron/900.css";
import "@fontsource/rajdhani/600.css";
import "@fontsource/rajdhani/700.css";
import "@fontsource/silkscreen/700.css";
import "./fonts/galmuri.css"; // Hangul pixel font (손주원)
import Phaser from "phaser";
import "./gfx/tileSpriteFix.js";
import { watchContext } from "./systems/frameGuard.js";
import {
  setupView,
  VIEW,
  viewDrifted,
  viewportSize,
  wantsFit,
} from "./config.js";
import { BackdropScene } from "./scenes/BackdropScene.js";
import { BootScene } from "./scenes/BootScene.js";
import { CharacterScene } from "./scenes/CharacterScene.js";
import { GameOverScene } from "./scenes/GameOverScene.js";
import { GameScene } from "./scenes/GameScene.js";
import { HudScene } from "./scenes/HudScene.js";
import { LeaderboardScene } from "./scenes/LeaderboardScene.js";
import { LevelSelectScene } from "./scenes/LevelSelectScene.js";
import { LevelCompleteScene } from "./scenes/LevelCompleteScene.js";
import { MenuScene } from "./scenes/MenuScene.js";
import { MusicTestScene } from "./scenes/MusicTestScene.js";
import { ProgressScene } from "./scenes/ProgressScene.js";
import { TitlesScene } from "./scenes/TitlesScene.js";
import { SpinScene } from "./scenes/SpinScene.js";
import { ShopScene } from "./scenes/ShopScene.js";
import { PassScene } from "./scenes/PassScene.js";
import "./systems/install.js"; // registers beforeinstallprompt early (Android install button)
import { Music } from "./audio/music.js";
import { Save } from "./data/save.js";
import { Leaderboard } from "./online/leaderboard.js";
import { Seasons } from "./data/seasons.js";
import { TEST } from "./systems/testFlags.js";
import { CHARACTERS, setSeasonMonth } from "./player/characterDefs.js";

/** Hardware hints that a device can't hold 60 fps with the full effects. */
function isWeakDevice() {
  const mem = navigator.deviceMemory; // Chrome / Edge / Android
  const cores = navigator.hardwareConcurrency;
  if (mem && mem <= 2) return true;
  if (cores && cores <= 2) return true;
  // 4-inch iPhones (SE 1st gen, 5s) and anything else that small
  if (
    Math.min(screen.width, screen.height) < 360 &&
    /iPhone|iPod/.test(navigator.userAgent)
  )
    return true;
  return false;
}

/** WebGL is required; a device / browser without it gets a clear message, not a blank page. */
function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

function showNoWebGL() {
  const el = document.getElementById("game");
  if (!el) return;
  el.innerHTML =
    '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
    'padding:24px;text-align:center;color:#e8e0ff;font:600 18px Rajdhani,system-ui,sans-serif">' +
    "Glydrift needs WebGL graphics.<br>Turn on hardware acceleration in your browser settings," +
    " or try another browser.</div>";
}

async function boot() {
  if (!hasWebGL()) return showNoWebGL();
  // make sure the display fonts are ready before any Text is rasterised
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load("700 32px Orbitron"),
        document.fonts.load("900 32px Orbitron"),
        document.fonts.load("600 32px Rajdhani"),
        document.fonts.load("700 32px Rajdhani"),
        document.fonts.load("700 32px Silkscreen"),
        document.fonts.load("700 32px Galmuri11", "손주원"),
      ]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch {
    /* fall back to system fonts */
  }

  // home-screen app on iPhone: the page's layout box can stop short of the home-indicator
  // strip, leaving a black bar under the game. Size the game's box to the whole screen.
  const fitParent = () => {
    const el = document.getElementById("game");
    if (!el) return;
    const { h } = viewportSize();
    // In an iPhone home-screen app the page box can stop above the home indicator even when
    // innerHeight already reports the full screen, so always pin the game box to the full
    // screen height there (and let html/body follow it).
    const standalone =
      window.navigator.standalone === true ||
      window.matchMedia?.("(display-mode: standalone)").matches;
    const full = standalone ? Math.max(h, window.innerHeight) : 0; // h = full screen (portrait-aware)
    el.style.height = full ? `${full}px` : "";
    el.style.bottom = full ? "auto" : "";
    document.documentElement.style.height = full ? `${full}px` : "";
    document.body.style.height = full ? `${full}px` : "";
  };
  fitParent();
  window.addEventListener("resize", fitParent);
  window.addEventListener("pageshow", fitParent);

  // Weak devices start in Low Graphics (first launch only; the in-play frame-rate check and
  // the Settings toggle still have the final say)
  const settings = Save.data.settings;
  if (!settings.gfxBoot) {
    settings.gfxBoot = true;
    if (isWeakDevice()) settings.lowGfx = true;
    Save.write();
  }
  // render at the device's full pixel ratio (capped at 2x in Low Graphics)
  setupView(settings.lowGfx);
  // seasons: cached / built-in config now, the live one from Supabase in the background
  if (TEST.seasonNow) Seasons.setNow(Date.parse(TEST.seasonNow));
  Seasons.init();
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
    // No frame cap: the game runs at the display's own rate — a locked 60 on 60 Hz screens and
    // 120 on ProMotion iPhones / 120 Hz monitors — so every frame lands on a vsync (a 60 cap on
    // a 120 Hz screen made frames take 2 or 3 ticks at random: judder). Physics steps at most
    // 1/60 s and everything else is time-based, so the game plays the same at any rate.
    fps: { target: 60, smoothStep: true },
    // all sound is Tone.js / raw WebAudio; Phaser's own audio context only caused a
    // "not allowed to start" console warning on load
    audio: { noAudio: true },
    render: {
      antialias: true,
      powerPreference: "high-performance",
      roundPixels: false,
    },
    input: { activePointers: 2 },
    disableContextMenu: true,
    // order matters: scenes render in this order (Backdrop → screens → overlays)
    scene: [
      BootScene,
      BackdropScene,
      MenuScene,
      GameScene,
      HudScene,
      GameOverScene,
      LevelCompleteScene,
      LevelSelectScene,
      CharacterScene,
      ProgressScene,
      LeaderboardScene,
      SpinScene,
      ShopScene,
      PassScene,
      TitlesScene,
      MusicTestScene,
    ],
  });

  if (TEST.renderEvery > 1) {
    const fullStep = game.step.bind(game);
    let k = 0;
    game.step = (time, delta) => {
      if (window.__glyRender || ++k % TEST.renderEvery === 0) {
        window.__glyRender = false;
        fullStep(time, delta);
      } else game.headlessStep(time, delta);
    };
  }

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
    const cropBottom = Math.max(
      0,
      (rect?.bottom ?? canvasH) -
        Math.max(window.innerHeight, viewportSize().h),
    );
    game.registry.set(
      "safeTop",
      Math.round(((insetTop + cropTop) * VIEW.H) / canvasH),
    );
    game.registry.set(
      "safeBottom",
      Math.round(((insetBottom + cropBottom) * VIEW.H) / canvasH),
    );
  };
  game.events.once("ready", () => {
    updateSafe();
    watchContext(game);
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
      // Phaser sizes the canvas from displaySize's aspect mode, which it only sets at boot:
      // without this a rotated iPad / Split View kept the old mode and cropped the game
      game.scale.displaySize.setAspectMode(mode);
    }
    // refresh() works from a cached parent size: re-read it first (Safari fires "resize"
    // before the new layout, so the game was sized for the old window and cropped)
    game.scale.getParentBounds();
    game.scale.refresh();
  };
  // Rotation / window resize / Split View: the game keeps running, scaled to the new shape
  // straight away. Once no run is in progress, the canvas is re-rendered at the new size (if it
  // drifted far enough) so pixel art and text stay crisp: never mid-run, never a reload.
  let reresPending = false;
  const tryReres = () => {
    if (!reresPending) return;
    const sm = game.scene;
    const gs = sm.getScene("Game");
    if (gs && (gs.sys.isActive() || gs.sys.isPaused() || gs.sys.isSleeping()))
      return;
    if (sm.getScenes(true).some((s) => s.leaving)) return; // mid scene transition
    reresPending = false;
    const lowGfx = Save.data.settings.lowGfx;
    if (!viewDrifted(lowGfx)) return;
    setupView(lowGfx);
    game.scale.setGameSize(VIEW.PW, VIEW.PH);
    for (const s of sm.getScenes(true))
      if (s.sys.settings.key !== "Boot") s.scene.restart();
    updateScaleMode();
    setTimeout(updateSafe, 60);
  };
  setInterval(tryReres, 500);
  window.addEventListener("resize", () => {
    updateScaleMode();
    // and again once the new layout has settled
    for (const ms of [120, 400]) setTimeout(updateScaleMode, ms);
    reresPending = true;
    setTimeout(updateSafe, 100);
  });
  // iOS keyboard / home-screen quirks: the page must never stay scrolled — a scrolled page
  // moves the canvas away from where taps land, so the game looks frozen
  const unscroll = () => {
    const typing = document.activeElement?.tagName === "INPUT";
    if (!typing && (window.scrollY || window.scrollX)) {
      window.scrollTo(0, 0);
      game.scale.refresh();
    }
  };
  window.visualViewport?.addEventListener("resize", () =>
    setTimeout(unscroll, 50),
  );
  window.addEventListener("scroll", unscroll, { passive: true });
  document.addEventListener("focusout", () => setTimeout(unscroll, 150));
  // coming back to the app (home-screen launch, app switch): re-measure everything
  window.addEventListener("pageshow", () => {
    unscroll();
    game.scale.refresh();
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
  window.addEventListener("orientationchange", () =>
    setTimeout(updateSafe, 300),
  );
  document.addEventListener("visibilitychange", () =>
    setTimeout(updateSafe, 100),
  );
  for (const ms of [300, 1000, 2500]) setTimeout(updateSafe, ms);
  if (TEST.month !== null) setSeasonMonth(TEST.month);
  // test builds only: handles for test scripts (release builds expose nothing)
  if (TEST.on) {
    window.__glydrift = game;
    window.__leaderboard = Leaderboard;
    window.__heroDefs = CHARACTERS;
    window.__music = Music;
  }
}

// Audio may only start inside a user gesture (iOS): the first tap anywhere unlocks it. Every
// later tap also revives it if iOS suspended / interrupted it (app switch, a phone call, Siri).
for (const type of ["pointerdown", "touchend", "keydown"]) {
  window.addEventListener(
    type,
    () => (Music.unlocked ? Music.revive() : Music.unlock()),
    {
      capture: true,
      passive: true,
    },
  );
}
const reviveSoon = () =>
  document.visibilityState === "visible" && Music.revive();
document.addEventListener("visibilitychange", reviveSoon);
window.addEventListener("pageshow", reviveSoon);
// iOS 16.4+: game sound mixes with other audio and follows the ring/silent switch
try {
  if (navigator.audioSession) navigator.audioSession.type = "ambient";
} catch {
  /* older browsers */
}

// Touch / trackpad: no pinch or double-tap zoom, no pull-to-refresh or rubber-band scroll, no
// long-press menus or text selection, anywhere on the page (the canvas already blocks these
// itself; this covers the side areas on wide screens and the gaps between DOM overlays).
const typing = (e) => e.target?.closest?.("input, textarea");
const keepNative = (e) => typing(e) || e.target?.closest?.("#share-modal img");
const block = (e) => e.cancelable && e.preventDefault();
for (const type of ["gesturestart", "gesturechange", "gestureend", "dblclick"])
  document.addEventListener(type, block, { passive: false });
document.addEventListener("touchmove", (e) => !typing(e) && block(e), {
  passive: false,
});
document.addEventListener("wheel", (e) => e.ctrlKey && block(e), {
  passive: false,
}); // trackpad pinch
document.addEventListener("contextmenu", (e) => !keepNative(e) && block(e));
document.addEventListener("selectstart", (e) => !typing(e) && block(e));

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
          if (document.visibilityState === "visible")
            reg.update().catch(() => {});
        });
      })
      .catch(() => {});
  });
}

boot();

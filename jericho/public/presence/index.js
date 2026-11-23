// Starts the 3D presence (or the 2D visualizer if WebGL isn't available) and the small
// pieces of page chrome around it: HUD glyphs, the look settings panel, the chat toggle,
// and the "call in progress" signal. Everything here is visual; app logic is untouched.
import { createVisualizer } from "../visualizer.js";
import { playPowerUp, powerUpPlan } from "../power.js";

const $ = (id) => document.getElementById(id);
const store = {
  get(k, fallback) {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* private mode */
    }
  },
};

const DEFAULT_LOOK = { glow: 1, particles: 1, quality: "auto" };
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Phones and small screens: lighter geometry, and Auto quality stays at Low or Medium. */
function isMobile() {
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const phone = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return phone || small;
}
const QUALITIES = ["auto", "low", "medium", "high", "ultra"];

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Returns the same interface the app already uses for its visualizer
 * (setState, setMicLevel, setSpeechSource). Calls made before the 3D scene has
 * loaded are remembered and replayed, so nothing is lost while it starts.
 */
export function createPresence({ onTap }) {
  const pending = { state: "off", mic: 0, speech: [null, false], calling: false, alarm: false };
  const power = createPower();
  let impl = null;
  let look = { ...DEFAULT_LOOK, ...store.get("jericho-look", {}) };
  const stateWord = $("orb-label");

  const proxy = {
    setState(s) {
      pending.state = s;
      impl?.setState(s);
      document.body.dataset.state = s;
      power.setMuted(s === "muted"); // the idle hum rests while muted
    },
    /** A ringing alarm: the orb pulses red and gold. */
    setAlarm(on) {
      pending.alarm = Boolean(on);
      impl?.setAlarm?.(pending.alarm);
    },
    /** The first tap: the power-up animation and sound. Returns the timeline (or null if already on). */
    powerOn() {
      return power.powerOn();
    },
    setMicLevel(v) {
      pending.mic = v;
      impl?.setMicLevel(v);
    },
    setSpeechSource(analyser, fake = false) {
      pending.speech = [analyser, fake];
      impl?.setSpeechSource(analyser, fake);
    },
  };

  function attach(next) {
    impl = next;
    impl.setState(pending.state);
    impl.setMicLevel(pending.mic);
    impl.setSpeechSource(...pending.speech);
    impl.setCalling?.(pending.calling);
    power.attach(impl);
    impl.setAlarm?.(pending.alarm);
    document.body.classList.add("presence-ready");
    if (new URLSearchParams(location.search).has("debug")) window.__presence = impl; // for testing only
  }

  function fallback2D() {
    const canvas = $("viz");
    canvas.hidden = false; // it sits inside the start button, so tapping it still starts Jericho
    document.body.classList.add("presence-2d");
    attach(createVisualizer(canvas));
  }

  // Start the 3D scene after the page has painted, so the page never waits for it.
  async function start3D() {
    if (!webglAvailable()) return fallback2D();
    try {
      const { createScene } = await import("./scene.js");
      if (!QUALITIES.includes(look.quality)) look.quality = "auto";
      const scene = await createScene($("stage3d"), {
        mobile: isMobile(),
        reducedMotion: reduced,
        glow: look.glow,
        particles: look.particles,
        quality: look.quality,
        onTap,
        onQuality: (tier) => document.body.classList.toggle("low-power", tier === "low"),
      });
      attach(scene);
    } catch (err) {
      console.warn("3D presence unavailable, using 2D:", err);
      fallback2D();
    }
  }

  requestAnimationFrame(() => setTimeout(start3D, 0));

  // Phones only report tilt after a tap asks for permission (iOS).
  document.addEventListener(
    "pointerup",
    () => {
      const ask = window.DeviceOrientationEvent?.requestPermission;
      if (typeof ask === "function") ask.call(window.DeviceOrientationEvent).catch(() => {});
    },
    { once: true },
  );

  // ---- the status word follows the app's own label ------------------------------
  const word = $("hud-word");
  const sync = () => {
    word.textContent = document.body.classList.contains("calling") && pending.state !== "speaking" ? "Calling" : stateWord.textContent;
  };
  new MutationObserver(sync).observe(stateWord, { childList: true, characterData: true, subtree: true });

  // ---- live call signal: read-only look at /api/calls -----------------------------
  async function pollCalls() {
    try {
      let token = "";
      try {
        token = localStorage.getItem("jericho-token") || "";
      } catch {
        /* private mode */
      }
      const res = await fetch("/api/calls", { headers: { "x-jericho-token": token } });
      if (res.ok) {
        const { calls } = await res.json();
        const live = calls.some((c) => c.status !== "ended" && Date.now() - Date.parse(c.createdAt) < 15 * 60_000);
        pending.calling = live;
        impl?.setCalling?.(live);
        document.body.classList.toggle("calling", live);
        sync();
      }
    } catch {
      /* offline: try again later */
    }
    setTimeout(pollCalls, document.hidden ? 15_000 : 4000);
  }
  setTimeout(pollCalls, 1500);

  // ---- HUD glyphs: an invented alphabet, drawn from strokes on a small grid -----------
  function glyph(seed) {
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const pts = [[2, 2], [8, 2], [14, 2], [2, 8], [8, 8], [14, 8], [2, 14], [8, 14], [14, 14]];
    let d = "";
    const strokes = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < strokes; i++) {
      const a = pts[Math.floor(rnd() * 9)];
      const b = pts[Math.floor(rnd() * 9)];
      d += rnd() < 0.3 ? `M${a[0]} ${a[1]}A6 6 0 0 1 ${b[0]} ${b[1]}` : `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`;
    }
    if (rnd() < 0.5) d += `M8 8m-1.4 0a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0 -2.8 0`;
    return `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${d}"/></svg>`;
  }
  let seed = 7;
  for (const row of document.querySelectorAll(".hud-glyphs")) {
    const n = Number(row.dataset.count || 5);
    row.innerHTML = Array.from({ length: n }, () => `<span class="g">${glyph((seed = (seed * 48271) % 2147483647))}</span>`).join("");
  }
  // every few seconds one glyph changes, like a slow readout
  setInterval(() => {
    if (reduced) return;
    const all = document.querySelectorAll(".hud-glyphs .g");
    const pick = all[Math.floor(Math.random() * all.length)];
    if (pick) pick.innerHTML = glyph(Math.floor(Math.random() * 1e9) + 1);
  }, 2600);

  // ---- chat toggle ---------------------------------------------------------------------
  const chatHidden = store.get("jericho-chat-hidden", false);
  document.body.classList.toggle("chat-hidden", chatHidden);
  const chatBtn = $("chat-toggle");
  const syncChatBtn = () => {
    const hidden = document.body.classList.contains("chat-hidden");
    chatBtn.textContent = hidden ? "Show chat" : "Hide chat";
    chatBtn.setAttribute("aria-pressed", String(hidden));
  };
  syncChatBtn();
  chatBtn.addEventListener("click", () => {
    document.body.classList.toggle("chat-hidden");
    store.set("jericho-chat-hidden", document.body.classList.contains("chat-hidden"));
    syncChatBtn();
  });

  // ---- look settings panel ----------------------------------------------------------------
  const panel = $("look-panel");
  const glowIn = $("look-glow");
  const partIn = $("look-particles");
  const qualIn = $("look-quality");
  const show = () => {
    glowIn.value = Math.round(look.glow * 100);
    partIn.value = Math.round(look.particles * 100);
    qualIn.value = look.quality;
    $("look-glow-val").textContent = `${glowIn.value}%`;
    $("look-particles-val").textContent = `${partIn.value}%`;
  };
  show();
  const save = () => store.set("jericho-look", look);
  $("look-open").addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    $("look-open").setAttribute("aria-expanded", String(!panel.hidden));
  });
  $("look-close").addEventListener("click", () => {
    panel.hidden = true;
    $("look-open").setAttribute("aria-expanded", "false");
  });
  glowIn.addEventListener("input", () => {
    look.glow = glowIn.value / 100;
    impl?.setGlow?.(look.glow);
    show();
    save();
  });
  partIn.addEventListener("change", () => {
    look.particles = partIn.value / 100;
    impl?.setParticles?.(look.particles);
    show();
    save();
  });
  partIn.addEventListener("input", show);
  qualIn.addEventListener("change", () => {
    look.quality = qualIn.value;
    save();
    impl?.setQuality?.(look.quality); // applies straight away
  });
  const bootIn = $("look-boot");
  if (bootIn) {
    bootIn.checked = !store.get(BOOT_OFF_KEY, false);
    bootIn.addEventListener("change", () => store.set(BOOT_OFF_KEY, !bootIn.checked));
  }
  // power-up sound: on/off, volume, idle hum
  const snd = power.sound();
  const sndPower = $("snd-power");
  const sndVol = $("snd-vol");
  const sndIdle = $("snd-idle");
  if (sndPower && sndVol && sndIdle) {
    sndPower.checked = snd.power;
    sndIdle.checked = snd.idle;
    sndVol.value = Math.round(snd.volume * 100);
    $("snd-vol-val").textContent = `${sndVol.value}%`;
    sndPower.addEventListener("change", () => power.updateSound({ power: sndPower.checked }));
    sndIdle.addEventListener("change", () => power.updateSound({ idle: sndIdle.checked }));
    sndVol.addEventListener("input", () => {
      $("snd-vol-val").textContent = `${sndVol.value}%`;
      power.updateSound({ volume: sndVol.value / 100 });
    });
  }
  // live readout: the level in use and the measured frame rate
  setInterval(() => {
    const info = impl?.info?.();
    if (!info || panel.hidden) return;
    const fps = info.fps ? `${Math.round(info.fps)} fps` : "measuring…";
    const level = info.tier[0].toUpperCase() + info.tier.slice(1);
    $("look-note").textContent = `${info.quality === "auto" ? `Auto: ${level}` : level} · ${fps} · ${info.width}×${info.height}${info.msaa ? ` · ${info.msaa}× MSAA` : " · FXAA"}`;
  }, 500);
  $("look-reset").addEventListener("click", () => {
    look = { ...DEFAULT_LOOK };
    save();
    impl?.setGlow?.(look.glow);
    impl?.setParticles?.(look.particles);
    impl?.setQuality?.(look.quality);
    show();
  });

  return proxy;
}

// ---- power on: the startup animation and sound -----------------------------------------------
// The page opens dormant ("Tap to power on"), the orb a single point of light. The first tap
// plays the power-up: hieroglyphs light up, the hum rises, rising tones as the rings spin up,
// a chime exactly when the orb flashes, the wordmark carves in, then a soft idle hum.
// A reload within 10 minutes gets a shorter version. "Startup animation" off, or reduced
// motion, skips the visuals (the sound can still play). Purely look and sound.
const BOOT_OFF_KEY = "jericho-boot-off";
const LAST_POWER_KEY = "jericho-last-power";
const SOUND_KEY = "jericho-sound";
const DEFAULT_SOUND = { power: true, volume: 0.6, idle: true };

function createPower() {
  let impl = null;
  let powered = false;
  let pendingOrb = null; // { plan, at } waiting for the 3D scene
  let audio = null; // controls from playPowerUp
  let muted = false;
  let snd = { ...DEFAULT_SOUND, ...store.get(SOUND_KEY, {}) };
  document.body.classList.add("dormant");

  function startOrb() {
    const { plan, at } = pendingOrb;
    pendingOrb = null;
    const late = (performance.now() - at) / 1000;
    // the scene came up after the flash should have happened: just show it
    if (late > plan.orbDelay + 0.15) impl.boot?.({ delay: 0, dur: 1 });
    else impl.boot?.({ delay: (plan.orbDelay - late) * 1000, dur: plan.orbDur * 1000 });
  }

  return {
    attach(next) {
      impl = next;
      if (pendingOrb) startOrb();
      else if (!powered) impl.hold?.();
    },
    powerOn() {
      if (powered) return null;
      powered = true;
      const last = Number(store.get(LAST_POWER_KEY, 0)) || 0;
      store.set(LAST_POWER_KEY, Date.now());
      const plan = powerUpPlan(Date.now() - last < 10 * 60_000 ? "short" : "full");
      const animate = !reduced && !store.get(BOOT_OFF_KEY, false);
      document.body.classList.remove("dormant");
      if (animate) {
        document.body.classList.add("booting");
        document.body.classList.toggle("booting-short", plan.kind === "short");
        setTimeout(() => document.body.classList.remove("booting", "booting-short"), plan.total * 1000);
        pendingOrb = { plan, at: performance.now() };
        if (impl) startOrb();
      } else {
        impl?.boot?.({ delay: 0, dur: 1 }); // release the waiting point straight away
      }
      // The sound starts inside this tap, which is what lets the browser play it.
      if (snd.power || snd.idle) {
        try {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          const ctx = new Ctx();
          ctx.resume?.();
          audio = playPowerUp(ctx, animate ? plan : powerUpPlan("short"), { volume: snd.volume, power: snd.power, idle: snd.idle && !muted });
        } catch {
          /* no Web Audio: silent power-up */
        }
      }
      return plan;
    },
    setMuted(on) {
      if (on === muted) return;
      muted = on;
      audio?.setIdle(snd.idle && !muted);
    },
    sound: () => ({ ...snd }),
    updateSound(change) {
      snd = { ...snd, ...change };
      store.set(SOUND_KEY, snd);
      if ("volume" in change) audio?.setVolume(snd.volume);
      if ("idle" in change) {
        // turned on later from the panel (a click, so sound is allowed): start just the hum
        if (!audio && powered && snd.idle) {
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            audio = playPowerUp(ctx, powerUpPlan("short"), { volume: snd.volume, power: false, idle: !muted });
          } catch {
            /* no Web Audio */
          }
        } else audio?.setIdle(snd.idle && !muted);
      }
    },
  };
}

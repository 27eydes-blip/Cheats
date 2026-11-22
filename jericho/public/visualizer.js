// The gold visualizer: a glowing core, a ring of thin radial bars and one slowly
// rotating outer ring, drawn on a <canvas> every frame.
//
// States: "off" | "idle" | "active" | "thinking" | "speaking" | "confirm".
// Levels come from outside: setSpeechSource() gives it the voice analyser (or a fake
// pulse for the browser voice), setMicLevel() feeds microphone volume while listening.

const BAR_COUNT = 96;
const TAU = Math.PI * 2;

export function createVisualizer(canvas) {
  const ctx = canvas.getContext("2d");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let state = "off";
  let speech = { analyser: null, fake: false };
  let micLevel = 0;
  let freq = null;
  let size = 0;
  let dpr = 1;

  // Smoothed values, eased towards their targets each frame.
  const bars = new Float32Array(BAR_COUNT);
  let core = 0.2; // 0..1 brightness/size of the core
  let glow = 0.2;
  let ringAngle = 0;
  let ringSpeed = 0.1;
  let fakeLevel = 0;
  let last = performance.now();

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    size = Math.max(1, Math.round(Math.min(rect.width, rect.height)));
    canvas.width = size * dpr;
    canvas.height = size * dpr;
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  /** Overall loudness 0..1 and per-bar levels for the speaking state. */
  function speechLevels(t, out) {
    if (speech.analyser) {
      const a = speech.analyser;
      if (!freq || freq.length !== a.frequencyBinCount) freq = new Uint8Array(a.frequencyBinCount);
      a.getByteFrequencyData(freq);
      // Voices live in the lower bins: use the first ~45%, spread them over a quarter of
      // the circle and mirror it four ways so the ring stays balanced.
      const usable = Math.max(4, Math.floor(freq.length * 0.45));
      const quarter = BAR_COUNT / 4;
      const levels = new Float32Array(quarter);
      let sum = 0;
      for (let i = 0; i < quarter; i++) {
        const start = Math.floor((i / quarter) ** 1.3 * usable);
        const end = Math.max(start + 1, Math.floor(((i + 1) / quarter) ** 1.3 * usable));
        let v = 0;
        for (let j = start; j < end; j++) v = Math.max(v, freq[j]);
        levels[i] = (v / 255) ** 1.4;
        sum += levels[i];
      }
      const overall = Math.min(1, (sum / quarter) * 1.8);
      for (let i = 0; i < BAR_COUNT; i++) {
        const k = i % (2 * quarter);
        const idx = k < quarter ? k : 2 * quarter - 1 - k;
        out[i] = 0.65 * levels[idx] + 0.35 * overall;
      }
      return overall;
    }
    if (speech.fake) {
      // Browser voice: no audio to analyse, so a smooth made-up pulse.
      const target = 0.45 + 0.25 * Math.sin(t * 7.3) * Math.sin(t * 2.1) + 0.15 * Math.sin(t * 13.7);
      fakeLevel += (target - fakeLevel) * 0.15;
      for (let i = 0; i < BAR_COUNT; i++) {
        const a = (i / BAR_COUNT) * TAU;
        out[i] = Math.max(0, fakeLevel * (0.55 + 0.45 * Math.sin(a * 3 + t * 4) * Math.sin(a * 5 - t * 2.6)));
      }
      return fakeLevel;
    }
    out.fill(0);
    return 0;
  }

  const targets = new Float32Array(BAR_COUNT);

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    const calm = reduced.matches;
    const motion = calm ? 0.25 : 1;

    // ---- targets per state ----
    let coreTarget = 0.25;
    let speedTarget = 0.12;
    let dim = 0.35;
    if (state === "off") {
      targets.fill(0.03);
      coreTarget = 0.12;
      speedTarget = 0.04;
      dim = 0.2;
    } else if (state === "idle") {
      // Waiting for the wake word: small, dim bars; the core breathes slowly.
      const breathe = 0.5 + 0.5 * Math.sin(t * 1.3);
      for (let i = 0; i < BAR_COUNT; i++) targets[i] = 0.05 + 0.03 * breathe;
      coreTarget = 0.28 + 0.12 * breathe * motion;
      speedTarget = 0.12;
      dim = 0.35;
    } else if (state === "active" || state === "confirm") {
      // Listening: brighter core, bars twitch lightly with the mic.
      const m = Math.min(1, micLevel * 3);
      for (let i = 0; i < BAR_COUNT; i++) {
        const jitter = calm ? 0.5 : Math.random();
        targets[i] = 0.08 + m * (0.25 + 0.35 * jitter) * motion;
      }
      coreTarget = 0.6 + 0.25 * m;
      speedTarget = 0.2;
      dim = 0.7;
    } else if (state === "thinking") {
      // Thinking: outer ring spins faster, bars ripple in a wave round the circle.
      for (let i = 0; i < BAR_COUNT; i++) {
        const a = (i / BAR_COUNT) * TAU;
        const wave = 0.5 + 0.5 * Math.sin(a * 3 - t * 5 * motion);
        targets[i] = 0.08 + 0.3 * wave ** 2 * motion;
      }
      coreTarget = 0.5 + 0.1 * Math.sin(t * 4 * motion);
      speedTarget = calm ? 0.3 : 1.6;
      dim = 0.75;
    } else if (state === "speaking") {
      // Speaking: bars and core follow Jericho's actual voice.
      const level = speechLevels(t, targets);
      for (let i = 0; i < BAR_COUNT; i++) targets[i] = 0.06 + targets[i] * 0.9 * (calm ? 0.5 : 1);
      coreTarget = 0.55 + 0.45 * level;
      speedTarget = 0.35;
      dim = 1;
    }

    // ---- ease towards targets (frame-rate independent) ----
    const up = 1 - Math.exp(-dt * (calm ? 6 : 22));
    const down = 1 - Math.exp(-dt * (calm ? 4 : 9));
    for (let i = 0; i < BAR_COUNT; i++) {
      const k = targets[i] > bars[i] ? up : down;
      bars[i] += (targets[i] - bars[i]) * k;
    }
    core += (coreTarget - core) * (1 - Math.exp(-dt * 8));
    glow += (dim - glow) * (1 - Math.exp(-dt * 4));
    ringSpeed += (speedTarget - ringSpeed) * (1 - Math.exp(-dt * 3));
    ringAngle = (ringAngle + ringSpeed * dt * (calm ? 0.3 : 1)) % TAU;

    draw();
    requestAnimationFrame(frame);
  }

  function draw() {
    const w = canvas.width;
    const c = w / 2;
    const r = w / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, w);

    // Soft background glow
    const halo = ctx.createRadialGradient(c, c, r * 0.05, c, c, r);
    halo.addColorStop(0, `rgba(240, 190, 90, ${0.16 * glow + 0.1 * core})`);
    halo.addColorStop(0.45, `rgba(200, 140, 50, ${0.06 * glow})`);
    halo.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, w);

    // Core
    const coreR = r * (0.16 + 0.07 * core);
    const g = ctx.createRadialGradient(c, c, 0, c, c, coreR * 1.9);
    g.addColorStop(0, `rgba(255, 244, 214, ${0.75 + 0.25 * core})`);
    g.addColorStop(0.35, `rgba(246, 205, 120, ${0.55 + 0.4 * core})`);
    g.addColorStop(0.62, `rgba(214, 160, 66, ${0.25 + 0.35 * core})`);
    g.addColorStop(1, "rgba(160, 110, 40, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c, c, coreR * 1.9, 0, TAU);
    ctx.fill();

    // Radial bars
    const inner = r * 0.36;
    const maxLen = r * 0.36;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1, r * 0.012);
    for (let i = 0; i < BAR_COUNT; i++) {
      const a = (i / BAR_COUNT) * TAU - Math.PI / 2;
      const len = Math.max(r * 0.012, bars[i] * maxLen);
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const alpha = Math.min(1, 0.25 + 0.6 * glow + bars[i] * 0.8);
      ctx.strokeStyle = `rgba(236, 188, 96, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(c + cos * inner, c + sin * inner);
      ctx.lineTo(c + cos * (inner + len), c + sin * (inner + len));
      ctx.stroke();
    }

    // Rotating outer ring: a thin circle with a few brighter arcs
    const ringR = r * 0.86;
    ctx.lineWidth = Math.max(1, r * 0.006);
    ctx.strokeStyle = `rgba(214, 168, 84, ${0.18 + 0.2 * glow})`;
    ctx.beginPath();
    ctx.arc(c, c, ringR, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, r * 0.01);
    ctx.strokeStyle = `rgba(250, 214, 140, ${0.45 + 0.45 * glow})`;
    for (let k = 0; k < 3; k++) {
      const start = ringAngle + (k * TAU) / 3;
      ctx.beginPath();
      ctx.arc(c, c, ringR, start, start + 0.55);
      ctx.stroke();
    }
    // A small marker dot riding the ring
    ctx.fillStyle = `rgba(255, 236, 190, ${0.6 + 0.4 * glow})`;
    ctx.beginPath();
    ctx.arc(c + Math.cos(ringAngle + 0.55) * ringR, c + Math.sin(ringAngle + 0.55) * ringR, r * 0.012, 0, TAU);
    ctx.fill();
  }

  requestAnimationFrame(frame);

  return {
    setState(s) {
      state = s;
    },
    setMicLevel(v) {
      micLevel = v;
    },
    /** analyser: an AnalyserNode for real audio, or null; fake: true for a made-up pulse. */
    setSpeechSource(analyser, fake = false) {
      speech = { analyser, fake };
    },
  };
}

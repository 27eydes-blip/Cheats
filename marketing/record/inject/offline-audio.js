// Injected after virtual-time.js. Captures the game's own procedural WebAudio in perfect sync with
// the virtual clock: every `new AudioContext()` gets one shared OfflineAudioContext whose
// currentTime follows __rec.now. Everything the game schedules lands at the right virtual time,
// and at the end the recorder renders the whole take to a WAV, sample-accurately.
//
// Real-time-only semantics are translated so they behave the same offline:
//  - start()/stop() with no/past time        -> "now"
//  - param.value = x                          -> setValueAtTime(x, now)
//  - automation times in the past             -> clamped to now
//  - connect/disconnect and node attribute writes after t=0 -> replayed at their virtual time
//    during rendering via OfflineAudioContext.suspend()
//  - <audio>/new Audio() playback             -> decoded and scheduled into the same graph
// Limitation: AnalyserNode reads return silence while recording (no live signal exists yet).
(() => {
  if (!window.__rec || window.__recAudio) return;
  const cfg = window.__REC_CFG__ || {};
  const SR = cfg.sampleRate || 48000;
  const SECONDS = cfg.audioSeconds || 90;
  const RealOffline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!RealOffline) return;

  const vnow = () => window.__rec.now / 1000;
  let ctx = null;
  let rendering = false;
  const deferred = new Map(); // quantised time -> [fn]
  const QUANT = 128 / SR;

  function defer(fn) {
    const t = vnow();
    if (!ctx || rendering || t <= 0) return fn();
    const q = Math.ceil(t / QUANT) * QUANT;
    if (!deferred.has(q)) deferred.set(q, []);
    deferred.get(q).push(fn);
  }

  function getCtx() {
    if (ctx) return ctx;
    ctx = new RealOffline({ numberOfChannels: 2, length: Math.ceil(SR * SECONDS), sampleRate: SR });
    Object.defineProperties(ctx, {
      currentTime: { get: vnow },
      state: { get: () => "running" },
      baseLatency: { value: 0.005 },
      outputLatency: { value: 0.01 },
    });
    ctx.resume = () => Promise.resolve();
    ctx.suspend = () => Promise.resolve();
    ctx.close = () => Promise.resolve();
    ctx.getOutputTimestamp = () => ({ contextTime: vnow(), performanceTime: window.__rec.now });
    ctx.createMediaElementSource = () => ctx.createGain();
    ctx.createMediaStreamSource = () => ctx.createGain();
    ctx.createMediaStreamDestination = () => {
      const g = ctx.createGain();
      g.stream = new MediaStream();
      return g;
    };
    return ctx;
  }

  function FakeAudioContext() {
    return getCtx();
  }
  FakeAudioContext.prototype = (window.AudioContext || RealOffline).prototype;
  window.AudioContext = FakeAudioContext;
  window.webkitAudioContext = FakeAudioContext;

  // --- scheduled sources
  const ASN = window.AudioScheduledSourceNode?.prototype;
  if (ASN) {
    const start = ASN.start;
    const stop = ASN.stop;
    const at = (t) => (t == null || t < vnow() ? vnow() : t);
    ASN.start = function (when, ...rest) {
      return start.call(this, at(when), ...rest);
    };
    ASN.stop = function (when) {
      return stop.call(this, at(when));
    };
  }
  const ABS = window.AudioBufferSourceNode?.prototype;
  if (ABS) {
    const start = ABS.start;
    ABS.start = function (when, ...rest) {
      return start.call(this, when == null || when < vnow() ? vnow() : when, ...rest);
    };
  }

  // --- AudioParam: timed values
  const AP = window.AudioParam.prototype;
  const valueDesc = Object.getOwnPropertyDescriptor(AP, "value");
  const lastValue = new WeakMap();
  Object.defineProperty(AP, "value", {
    configurable: true,
    get() {
      return lastValue.has(this) ? lastValue.get(this) : valueDesc.get.call(this);
    },
    set(v) {
      lastValue.set(this, v);
      if (!ctx || rendering) return valueDesc.set.call(this, v);
      this.setValueAtTime(v, vnow());
    },
  });
  for (const m of [
    "setValueAtTime",
    "linearRampToValueAtTime",
    "exponentialRampToValueAtTime",
    "setTargetAtTime",
    "setValueCurveAtTime",
    "cancelScheduledValues",
    "cancelAndHoldAtTime",
  ]) {
    const orig = AP[m];
    if (!orig) continue;
    const timeArg = m.startsWith("cancel") ? 0 : 1;
    AP[m] = function (...args) {
      if (ctx && !rendering && typeof args[timeArg] === "number" && args[timeArg] < vnow()) {
        args[timeArg] = vnow();
      }
      if (m === "setValueAtTime" || m.endsWith("RampToValueAtTime")) lastValue.set(this, args[0]);
      try {
        return orig.apply(this, args);
      } catch (e) {
        // e.g. overlapping setValueCurveAtTime: in real time this would have been later
        console.warn("[rec-audio]", m, e.message);
        return this;
      }
    };
  }

  // --- topology changes happen at their virtual time
  const AN = window.AudioNode.prototype;
  const connect = AN.connect;
  const disconnect = AN.disconnect;
  AN.connect = function (dest, ...rest) {
    defer(() => connect.call(this, dest, ...rest));
    return dest;
  };
  AN.disconnect = function (...args) {
    defer(() => {
      try {
        disconnect.apply(this, args);
      } catch {}
    });
  };
  // non-AudioParam attributes that change the sound
  const attrs = [
    [window.OscillatorNode, ["type"]],
    [window.BiquadFilterNode, ["type"]],
    [window.WaveShaperNode, ["curve", "oversample"]],
    [window.AudioBufferSourceNode, ["buffer", "loop", "loopStart", "loopEnd"]],
    [window.ConvolverNode, ["buffer", "normalize"]],
  ];
  for (const [C, names] of attrs) {
    if (!C) continue;
    for (const n of names) {
      const d = Object.getOwnPropertyDescriptor(C.prototype, n);
      if (!d?.set) continue;
      const shadow = new WeakMap();
      Object.defineProperty(C.prototype, n, {
        configurable: true,
        get() {
          return shadow.has(this) ? shadow.get(this) : d.get.call(this);
        },
        set(v) {
          shadow.set(this, v);
          // AudioBufferSourceNode.buffer may only be set once and must be set before start
          if (n === "buffer") return d.set.call(this, v);
          defer(() => d.set.call(this, v));
        },
      });
    }
  }
  const setPeriodicWave = window.OscillatorNode?.prototype.setPeriodicWave;
  if (setPeriodicWave) {
    window.OscillatorNode.prototype.setPeriodicWave = function (w) {
      defer(() => setPeriodicWave.call(this, w));
    };
  }

  // --- <audio> elements -> decoded into the same graph
  const playing = new WeakMap();
  const MP = HTMLMediaElement.prototype;
  MP.play = function () {
    const el = this;
    const at = vnow();
    const c = getCtx();
    fetch(el.currentSrc || el.src)
      .then((r) => r.arrayBuffer())
      .then((b) => c.decodeAudioData(b))
      .then((buf) => {
        const src = c.createBufferSource();
        const g = c.createGain();
        src.buffer = buf;
        src.loop = el.loop;
        g.gain.setValueAtTime(el.muted ? 0 : el.volume, at);
        connect.call(src, g);
        connect.call(g, c.destination);
        src.start(at, el.currentTime || 0);
        playing.set(el, src);
      })
      .catch((e) => console.warn("[rec-audio] media element", e.message));
    return Promise.resolve();
  };
  MP.pause = function () {
    const s = playing.get(this);
    if (s) s.stop(vnow());
  };

  // --- rendering: replay deferred ops at their times, return 16-bit stereo WAV bytes
  window.__recAudio = {
    async render(seconds) {
      if (!ctx) return null;
      rendering = true;
      for (const [t, fns] of [...deferred].sort((a, b) => a[0] - b[0])) {
        if (t >= SECONDS) continue;
        RealOffline.prototype.suspend
          .call(ctx, t)
          .then(() => {
            for (const fn of fns) fn();
            return RealOffline.prototype.resume.call(ctx);
          })
          .catch(() => {});
      }
      const buf = await ctx.startRendering();
      const n = Math.min(buf.length, Math.ceil(SR * (seconds || SECONDS)));
      const L = buf.getChannelData(0);
      const R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
      const out = new DataView(new ArrayBuffer(44 + n * 4));
      const str = (o, s) => [...s].forEach((ch, i) => out.setUint8(o + i, ch.charCodeAt(0)));
      str(0, "RIFF");
      out.setUint32(4, 36 + n * 4, true);
      str(8, "WAVEfmt ");
      out.setUint32(16, 16, true);
      out.setUint16(20, 1, true);
      out.setUint16(22, 2, true);
      out.setUint32(24, SR, true);
      out.setUint32(28, SR * 4, true);
      out.setUint16(32, 4, true);
      out.setUint16(34, 16, true);
      str(36, "data");
      out.setUint32(40, n * 4, true);
      let peak = 0;
      for (let i = 0; i < n; i++) {
        const l = Math.max(-1, Math.min(1, L[i]));
        const r = Math.max(-1, Math.min(1, R[i]));
        peak = Math.max(peak, Math.abs(l), Math.abs(r));
        out.setInt16(44 + i * 4, l * 32767, true);
        out.setInt16(46 + i * 4, r * 32767, true);
      }
      this.bytes = new Uint8Array(out.buffer);
      this.peak = peak;
      return { bytes: this.bytes.length, peak, deferredOps: deferred.size };
    },
    chunk(i, size) {
      const b = this.bytes.subarray(i * size, (i + 1) * size);
      let s = "";
      for (let j = 0; j < b.length; j += 0x8000)
        s += String.fromCharCode(...b.subarray(j, j + 0x8000));
      return btoa(s);
    },
    get hasContext() {
      return !!ctx;
    },
  };
})();

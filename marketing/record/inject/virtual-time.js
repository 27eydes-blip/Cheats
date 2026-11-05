// Injected before any game script runs (Playwright addInitScript). Replaces the page's clocks with
// a virtual clock that only moves when the recorder calls __rec.step(ms). Game time therefore runs
// exactly as slowly as the browser needs to render + screenshot each frame, and the captured
// frames play back at a perfect, constant 60fps — no dropped or doubled frames.
//
// Covers: performance.now, Date / Date.now, requestAnimationFrame, setTimeout/setInterval,
// and CSS / Web Animations (seeked per frame through document.getAnimations()).
(() => {
  if (window.__rec) return;
  const cfg = window.__REC_CFG__ || {};
  const realDate = Date;
  const epoch = cfg.epoch ?? realDate.now();
  let now = 0; // virtual ms since page start

  // ---- clocks
  const perfNow = () => now;
  try {
    Object.defineProperty(performance, "now", { value: perfNow, configurable: true });
  } catch {
    performance.now = perfNow;
  }
  function VDate(...args) {
    if (!new.target) return new realDate(epoch + now).toString();
    return args.length ? new realDate(...args) : new realDate(epoch + now);
  }
  VDate.prototype = realDate.prototype;
  VDate.now = () => Math.floor(epoch + now);
  VDate.parse = realDate.parse;
  VDate.UTC = realDate.UTC;
  window.Date = VDate;

  // ---- deterministic randomness (same seed => same run, so audio/video passes agree)
  if (cfg.seed != null) {
    let s = cfg.seed >>> 0 || 1;
    Math.random = () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
  }

  // ---- timers
  let nextId = 1;
  const timers = new Map(); // id -> {at, fn, args, every}
  const vSetTimeout = (fn, ms = 0, ...args) => {
    const id = nextId++;
    timers.set(id, { at: now + Math.max(0, Number(ms) || 0), fn, args, every: 0 });
    return id;
  };
  const vSetInterval = (fn, ms = 0, ...args) => {
    const id = nextId++;
    const every = Math.max(1, Number(ms) || 0);
    timers.set(id, { at: now + every, fn, args, every });
    return id;
  };
  const vClear = (id) => timers.delete(id);
  window.setTimeout = vSetTimeout;
  window.setInterval = vSetInterval;
  window.clearTimeout = vClear;
  window.clearInterval = vClear;

  let rafQ = new Map();
  window.requestAnimationFrame = (cb) => {
    const id = nextId++;
    rafQ.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => rafQ.delete(id);

  const call = (fn, args) => {
    try {
      typeof fn === "function" ? fn(...(args || [])) : (0, eval)(String(fn));
    } catch (e) {
      console.error("[rec] callback error", e);
    }
  };

  function runTimersUntil(t) {
    for (let guard = 0; guard < 10000; guard++) {
      let due = null;
      for (const [id, tm] of timers) if (tm.at <= t && (!due || tm.at < due[1].at)) due = [id, tm];
      if (!due) break;
      const [id, tm] = due;
      now = Math.max(now, tm.at);
      if (tm.every) tm.at += tm.every;
      else timers.delete(id);
      call(tm.fn, tm.args);
    }
    now = t;
  }

  // ---- CSS / Web Animations: pin each to the virtual clock
  const animStart = new WeakMap();
  function seekAnimations() {
    if (!document.getAnimations) return;
    for (const a of document.getAnimations()) {
      if (!animStart.has(a)) {
        animStart.set(a, now - (a.currentTime || 0));
        try {
          a.pause();
        } catch {}
      }
      try {
        a.currentTime = now - animStart.get(a);
      } catch {}
    }
  }

  const hooks = { beforeFrame: [], afterFrame: [] };
  window.__rec = {
    get now() {
      return now;
    },
    hooks,
    /** Advance virtual time by `ms` and run one animation frame. */
    frame(ms) {
      for (const h of hooks.beforeFrame) call(h, [now]);
      runTimersUntil(now + ms);
      const q = rafQ;
      rafQ = new Map();
      for (const cb of q.values()) call(cb, [now]);
      seekAnimations();
      for (const h of hooks.afterFrame) call(h, [now]);
    },
    /** Advance several frames without capturing (fast-forward). */
    run(ms, frameMs = 1000 / 60) {
      for (let t = 0; t < ms; t += frameMs) this.frame(frameMs);
    },
  };
})();

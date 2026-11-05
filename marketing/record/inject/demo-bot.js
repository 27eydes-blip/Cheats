// Injected by the recorder only (never shipped with the game). Activates when the page URL has
// `?demo` AND the recorder set __REC_CFG__.demo — so a release build can't be put into demo mode.
//
// A short-horizon planner: every few frames it tries each input held for a few durations, rolls
// the player forward with the adapter's physics, extrapolates hazards linearly, and picks the plan
// that survives while passing hazards as *close as possible* (the "dramatic near-miss" target).
// Needs window.__glyAdapter (see config/glydrift.adapter.js for the contract).
(() => {
  const cfg = window.__REC_CFG__ || {};
  if (!cfg.demo || !new URLSearchParams(location.search).has("demo") || !window.__rec) return;

  const FRAME = 1000 / 60;
  const bot = {
    enabled: false,
    style: "nearmiss", // "nearmiss" | "safe" | "die"
    target: 3, // desired clearance in game px for near-misses
    nearMissAt: 10, // clearance below which a pass counts as a near-miss event
    horizon: 45, // frames looked ahead (~0.75s)
    holds: [2, 5, 10, 18, 30],
    replanEvery: 2,
    plan: [],
    frame: 0,
    events: [],
    _closest: new Map(),
  };

  const A = () => window.__glyAdapter;

  function clearance(p, h) {
    const r = p.r ?? 0;
    if (h.r != null) return Math.hypot(p.x - h.x, p.y - h.y) - r - h.r;
    const dx = Math.max(h.x - p.x, 0, p.x - (h.x + h.w));
    const dy = Math.max(h.y - p.y, 0, p.y - (h.y + h.h));
    return Math.hypot(dx, dy) - r;
  }

  function simulate(state, seq) {
    const ad = A();
    let p = { ...state.player };
    let minC = Infinity;
    let hit = -1;
    let outOfBounds = 0;
    for (let f = 0; f < bot.horizon; f++) {
      p = ad.predict(p, seq[f] ?? seq[seq.length - 1], FRAME, state);
      const dt = (f + 1) * FRAME;
      for (const h of state.hazards) {
        const hh = { ...h, x: h.x + ((h.vx || 0) * dt) / 1000, y: h.y + ((h.vy || 0) * dt) / 1000 };
        const c = clearance(p, hh);
        if (c < minC) minC = c;
        if (c <= 0 && hit < 0) hit = f;
      }
      if (state.bounds) {
        const b = state.bounds;
        if (p.x < b.x || p.x > b.x + b.w || p.y < b.y || p.y > b.y + b.h) outOfBounds++;
      }
      if (hit >= 0) break;
    }
    return { minC, hit, outOfBounds, end: p };
  }

  function score(sim, seq, prev) {
    const switches = seq.reduce((n, a, i) => n + (i && a !== seq[i - 1] ? 1 : 0), 0);
    const jitter = (seq[0] !== prev ? 1 : 0) + switches;
    if (bot.style === "die") {
      // wait for a hazard to be close, then commit — death on a near miss reads best on camera
      return sim.hit >= 0 ? 1e6 - Math.abs(sim.hit - 20) * 1000 : -sim.minC;
    }
    if (sim.hit >= 0) return -1e6 + sim.hit * 1000;
    let s = -sim.outOfBounds * 500 - jitter * 2;
    if (Number.isFinite(sim.minC)) {
      if (bot.style === "nearmiss") s -= Math.abs(sim.minC - bot.target) * 4;
      else s += Math.min(sim.minC, 80);
    }
    return s;
  }

  function replan(state) {
    const ad = A();
    const acts = ad.actions;
    const prev = bot.plan[0] ?? acts[0];
    let best = null;
    for (const a of acts) {
      for (const k of bot.holds) {
        for (const b of acts) {
          if (b === a && k !== bot.holds[0]) continue;
          const seq = Array.from({ length: bot.horizon }, (_, i) => (i < k ? a : b));
          const sim = simulate(state, seq);
          const s = score(sim, seq, prev);
          if (!best || s > best.s) best = { s, seq };
        }
      }
    }
    bot.plan = best.seq;
  }

  let lastRealm = null;
  let wasAlive = true;
  function tick(now) {
    const ad = A();
    if (!ad) return;
    // pass-through game events (near misses, realm changes...) if the adapter exposes them
    for (const e of ad.events?.() || []) bot.events.push({ t: now, ...e });
    if (!bot.enabled) return;
    const st = ad.state();
    if (!st) return;
    if (st.realm != null && st.realm !== lastRealm) {
      if (lastRealm != null) {
        bot.events.push({ t: now, type: "realm", name: st.realm });
        // also a named event ("calm", "abyss", ...) so edits can say "event": "calm"
        if (typeof st.realm === "string") bot.events.push({ t: now, type: st.realm.toLowerCase() });
      }
      lastRealm = st.realm;
    }
    if (wasAlive && st.alive === false) bot.events.push({ t: now, type: "death", score: st.score });
    wasAlive = st.alive !== false;
    if (!st.alive) return;
    // our own near-miss detector: track each hazard's closest pass, emit when it recedes
    for (const h of st.hazards) {
      const id = h.id ?? `${Math.round(h.x)}:${Math.round(h.y)}`;
      const c = clearance(st.player, h);
      const rec = bot._closest.get(id) || { c: Infinity, emitted: false };
      if (c < rec.c) {
        rec.c = c;
        rec.t = now;
      } else if (!rec.emitted && rec.c < bot.nearMissAt && c > rec.c + 4) {
        rec.emitted = true;
        bot.events.push({
          t: rec.t,
          type: "nearMiss",
          clearance: rec.c,
          score: 1 / Math.max(0.5, rec.c),
          combo: st.combo,
        });
      }
      bot._closest.set(id, rec);
    }
    if (bot._closest.size > 500) bot._closest.clear();
    if (bot.frame++ % bot.replanEvery === 0 || !bot.plan.length) replan(st);
    ad.apply(bot.plan.shift() ?? ad.actions[0]);
  }

  window.__rec.hooks.beforeFrame.push(tick);
  window.__demoBot = bot;
})();

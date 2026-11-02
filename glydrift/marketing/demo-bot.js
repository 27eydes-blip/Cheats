// Glydrift "?demo" mode — injected by the marketing recorder (Playwright addInitScript).
// Nothing here ships with the game: the game code is untouched; this script only drives it
// from the outside through window.__glydrift (the Phaser game the app already exposes).
//
//  • Deterministic: Math.random is a seeded PRNG while game logic steps (the backdrop and
//    audio keep native randomness), and the game is advanced in exact 1/60 s steps, so the
//    video pass (render + capture every step) and the audio pass (real-time, no render)
//    replay the identical run.
//  • Bot: every frame it simulates ~20 "hold this height" flight plans 0.8 s ahead against
//    the real hazards (their own update/clearance code, with side effects stubbed and state
//    restored), flies the safest one, and now and then deliberately takes a plan that
//    grazes a hazard by 8-18 px — a game-counted near-miss with slow-mo and "CLOSE!".
//  • Event log: near-misses, biome titles, The Calm, blackout, Abyss slam, death, game over.
(() => {
  if (!new URLSearchParams(location.search).has("demo")) return;

  // ------------------------------------------------------------------ scoped seeded RNG
  const nativeRandom = Math.random.bind(Math);
  let seed = 1;
  const prng = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const R = { on: false, reseed: (v) => (seed = v >>> 0 || 1) };
  Math.random = () => (R.on ? prng() : nativeRandom());

  const DT = 1000 / 60;
  // Virtual clock: Phaser's tweens time themselves with Date.now(), not the step delta, so a
  // slowly-captured frame would run tweens fast (titles vanished early) and a fast simulated
  // frame would run them slow. While the demo steps, Date.now() advances exactly 1/60 s per
  // frame — tweens then match game time in every pass.
  const realNow = Date.now.bind(Date);
  let vBase = null;
  let inStep = false;
  Date.now = () => (inStep && vBase !== null ? vBase + D.frame * DT : realNow());
  const D = {
    R,
    frame: 0,
    events: [],
    bot: { on: false, mode: "normal", nextDrama: 0, target: null, kill: false },
    log(type, data = {}) {
      D.events.push({ type, frame: D.frame, ...data });
    },
  };
  window.__demo = D;
  const game = () => window.__glydrift;
  const sc = (k) => game().scene.getScene(k);

  // ------------------------------------------------------------------ stepping
  let hooked = false;
  let forceRender = 0;
  function hook() {
    if (hooked) return;
    hooked = true;
    // Chromium's renderer process crashes if Phaser reorders/starts scenes during frames that
    // are never drawn (seen with GameOver's bringToTop). Render a few frames around every
    // scene operation; everything else can still step without drawing.
    const sm = game().scene;
    for (const k of ["queueOp", "bringToTop", "start", "run", "stop"]) {
      const f = sm[k].bind(sm);
      sm[k] = (...a) => {
        forceRender = 6;
        return f(...a);
      };
    }
    // backdrop visuals keep native randomness (their state differs between passes before
    // stepping starts and must not touch the game's seeded sequence)
    const bsys = sc("Backdrop").sys;
    const step = bsys.step.bind(bsys);
    bsys.step = (t, d) => {
      const was = R.on;
      R.on = false;
      step(t, d);
      R.on = was;
    };
  }

  // ------------------------------------------------------------------ the reel script
  // Same actions on the same frames in every pass: menu → hero carousel → menu → PLAY → bot.
  D.reel = {
    on: false,
    seed: 20261102,
    killDelay: 6,
    endAfterGameOver: 420,
    done: false,
  };
  function reelAction(f) {
    const r = D.reel;
    if (!r.on) return;
    if (f === 150) {
      D.log("characters");
      D.act.toCharacters();
    }
    for (let i = 1; i <= 10; i++) if (f === 200 + 36 * i) D.act.selectHero(i % 10);
    if (f === 610) D.act.leaveCharacters();
    if (f === 660) {
      D.runSeed = r.seed;
      D.act.play();
      Object.assign(D.bot, { on: true, mode: "drama", startAt: f + 60, killDelay: r.killDelay, dramaGap: 3 });
    }
    const over = D.events.find((e) => e.type === "gameover");
    if (over && f >= over.frame + r.endAfterGameOver) r.done = true;
  }

  /** Advance the whole game by exactly one 1/60 s frame. */
  D.step = (render) => {
    hook();
    if (vBase === null) vBase = realNow() - D.frame * DT;
    reelAction(D.frame);
    const g = game();
    const t = 100000 + D.frame * DT;
    D.frame++;
    inStep = true;
    beforeStep();
    R.on = true;
    try {
      g.events.emit("prestep", t, DT);
      g.events.emit("step", t, DT);
      g.scene.update(t, DT);
      g.events.emit("poststep", t, DT);
    } finally {
      R.on = false;
      inStep = false;
    }
    afterStep();
    if (forceRender > 0) {
      forceRender--;
      render = true;
    }
    if (render) {
      const r = g.renderer;
      r.preRender();
      g.events.emit("prerender", r, t, DT);
      g.scene.render(r);
      r.postRender();
      g.events.emit("postrender", r, t, DT);
    }
  };

  /** Step n frames; if capture, return PNG data URLs read straight off the canvas. */
  D.run = (n, capture) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      D.step(capture);
      if (capture) out.push(game().canvas.toDataURL("image/png"));
    }
    return out;
  };

  // ------------------------------------------------------------------ scripted actions
  D.act = {
    toCharacters: () => sc("Menu").go("Characters"),
    selectHero: (i) => sc("Characters").select(i),
    leaveCharacters: () => sc("Characters").leave(),
    play: () => {
      // reseed at the exact moment the run scene starts (before its create() draws the
      // obstacle seed), so menu-time randomness can never leak into the run
      sc("Game").sys.events.once("start", () => R.reseed(D.runSeed || 20261102));
      sc("Menu").startGame("normal");
      D.log("play");
    },
  };

  // ------------------------------------------------------------------ event hooks
  let wired = null;
  let calmLogged = false;
  let blackoutLogged = false;
  let overLogged = false;
  function wire() {
    const s = sc("Game");
    if (!s || !s.sys.isActive() || wired === s) return;
    wired = s;
    const near = s.nearMiss.bind(s);
    s.nearMiss = (o) => {
      D.log("near", { obs: o.type, minClear: Math.round(o.minClear), meters: Math.round(s.meters) });
      return near(o);
    };
    const die = s.die.bind(s);
    s.die = () => {
      if (s.state === "playing") D.log("death", { meters: Math.round(s.meters), biome: s.biomeIndex });
      return die();
    };
    const enter = s.enterAbyss.bind(s);
    s.enterAbyss = () => {
      D.log("abyss", { meters: Math.round(s.meters) });
      return enter();
    };
    const hud = sc("Hud");
    const onBiome = hud.onBiome.bind(hud);
    hud.onBiome = (raw, o) => {
      D.log("biome", { raw, slam: !!o?.slam });
      return onBiome(raw, o);
    };
    const start = s.startRun.bind(s);
    s.startRun = () => {
      D.log("runStart");
      return start();
    };
  }
  function afterStep() {
    wire();
    const s = sc("Game");
    if (s?.sys.isActive()) {
      if (s.calm && !calmLogged) {
        calmLogged = true;
        D.log("calm", { meters: Math.round(s.meters) });
      }
      if (s.blackoutT > 0 && !blackoutLogged) {
        blackoutLogged = true;
        D.log("blackout", { meters: Math.round(s.meters) });
      }
    }
    const go = sc("GameOver");
    if (go?.sys.isActive() && !overLogged) {
      overLogged = true;
      D.log("gameover", { newBest: !!go.scene.settings.data?.result?.newBest });
    }
  }

  // ------------------------------------------------------------------ the bot
  const PH = {
    gUp: 2300,
    gDown: 2750,
    flap: -790,
    tFall: 1080,
    tRise: -980,
    miniFlap: 0.86,
    miniG: 0.92,
  };
  const FX_STUB = new Proxy({}, { get: () => () => {} });
  const HORIZON = 90; // frames (1.5 s)
  const OSTEP = 3; // obstacles advance every 3 frames

  function snapshot(o) {
    const own = {};
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (v === null || typeof v !== "object") own[k] = v;
    }
    const objs = (o.objects || []).map((g) => [
      g.x,
      g.y,
      g.alpha,
      g.visible,
      g.rotation,
      g.tilePositionX,
      g.tilePositionY,
      g.frame?.name,
    ]);
    const segs = o.segs?.map((sg) => sg.state);
    return { own, objs, segs };
  }
  function restore(o, snap) {
    for (const k of Object.keys(o)) {
      const v = o[k];
      if ((v === null || typeof v !== "object") && !(k in snap.own)) delete o[k];
    }
    Object.assign(o, snap.own);
    (o.objects || []).forEach((g, i) => {
      const [x, y, a, vis, rot, tx, ty, fr] = snap.objs[i];
      g.x = x;
      g.y = y;
      g.alpha = a;
      g.visible = vis;
      g.rotation = rot;
      if (tx !== undefined) {
        g.tilePositionX = tx;
        g.tilePositionY = ty;
      }
      if (fr !== undefined && g.frame?.name !== fr) g.setFrame(fr);
    });
    if (snap.segs) o.segs.forEach((sg, i) => (sg.state = snap.segs[i]));
  }

  function plan(s) {
    const p = s.player;
    const m = s.obstacles;
    const H = s.H;
    const dt = (1 / 60) * Math.max(0.2, s.timeScale);
    const r = p.radius;
    const mini = p.miniT > 0;
    // plans: hold a height, or a height that drifts up/down (to ride a moving gap)
    const plans = [];
    for (let f = 0.12; f <= 0.885; f += 0.06)
      for (const rate of [0, -260, 260, -520, 520]) plans.push([H * f, rate]);
    const zones = m.active.filter((o) => o.kind === "zone");
    const hazards = m.active.filter((o) => o.kind === "obstacle");
    // player trajectories (zones flip gravity while inside, like the game)
    const traj = plans.map(([target0, rate]) => {
      const target = target0;
      let y = p.y;
      let vy = p.vy;
      let dir = p.gravityDir;
      const base = m.flipped ? -1 : 1;
      const ys = new Float32Array(HORIZON + 1);
      ys[0] = y;
      let first = null;
      for (let f = 1; f <= HORIZON; f++) {
        const shift = s.scroll * dt * f;
        const inZone = zones.some(
          (z) => p.x > z.x - shift - z.w / 2 && p.x < z.x - shift + z.w / 2,
        );
        const want = inZone ? -1 : zones.length ? base : dir;
        if (want !== dir) {
          dir = want;
          vy *= 0.35;
        }
        const tgt = Math.max(60, Math.min(H - 60, target0 + rate * f * dt));
        const doFlap = dir > 0 ? y > tgt && vy > -50 : y < tgt && vy < 50;
        if (f === 1) first = doFlap;
        if (doFlap) vy = PH.flap * (mini ? PH.miniFlap : 1) * dir;
        const rising = vy * dir < 0;
        vy += (rising ? PH.gUp : PH.gDown) * (mini ? PH.miniG : 1) * dir * dt;
        const fall = vy * dir;
        if (fall > PH.tFall) vy = PH.tFall * dir;
        if (fall < PH.tRise) vy = PH.tRise * dir;
        y += vy * dt;
        ys[f] = y;
      }
      return { target, ys, first, minClear: Infinity, hit: Infinity, hitObs: Infinity };
    });
    // walls
    for (const c of traj)
      for (let f = 1; f <= HORIZON; f++)
        if (c.ys[f] < 34 || c.ys[f] > H - 34) {
          c.hit = Math.min(c.hit, f);
          break;
        }
    // hazards: advance their real state machines into the future, then restore
    if (hazards.length) {
      const snaps = hazards.map(snapshot);
      const fx = m.fx;
      const imp = m.onImpact;
      m.fx = FX_STUB;
      m.onImpact = null;
      try {
        for (let f = OSTEP; f <= HORIZON; f += OSTEP) {
          const el = f * dt;
          for (const o of hazards) {
            o.x -= s.scroll * dt * OSTEP;
            o.update(dt * OSTEP, s.clock + el);
            // timed beams count as live: line up with their gap early, like a careful player
            if (o.type === "laser" && o.segs) for (const sg of o.segs) sg.state = sg.state ? 2 : 0;
            else if (o.type === "laser") o.isOn = true;
            if (o.type === "zap") o.zapping = true;
          }
          for (const c of traj) {
            if (c.hit <= f) continue;
            let mc = Infinity;
            for (const o of hazards) {
              if (o.right < p.x - 80 || o.left > p.x + 80) continue;
              const cl = o.clearance(p.x, c.ys[f], r);
              if (cl < mc) mc = cl;
            }
            if (mc < 0) {
              c.hit = Math.min(c.hit, f);
              c.hitObs = Math.min(c.hitObs, f);
            } else if (mc < c.minClear) c.minClear = mc;
          }
        }
      } finally {
        m.fx = fx;
        m.onImpact = imp;
        hazards.forEach((o, i) => restore(o, snaps[i]));
      }
    }
    return traj;
  }

  function choose(s, traj) {
    const b = D.bot;
    const H = s.H;
    const safe = traj.filter((c) => c.hit === Infinity);
    const prev = b.target ?? H * 0.5;
    if (b.kill) {
      const k = traj.filter((c) => c.hitObs < Infinity).sort((a, z) => a.hitObs - z.hitObs)[0];
      if (k) return k;
    }
    if (!safe.length) return traj.slice().sort((a, z) => z.hit - a.hit)[0];
    if (b.mode === "drama" && D.frame >= b.nextDrama) {
      const graze = safe
        .filter((c) => c.minClear >= 8 && c.minClear <= 18)
        .sort((a, z) => Math.abs(a.minClear - 12) - Math.abs(z.minClear - 12))[0];
      if (graze) {
        b.grazing = D.frame;
        return graze;
      }
    }
    let best = null;
    let bestScore = -Infinity;
    for (const c of safe) {
      const room = Math.min(c.minClear, 150);
      const score = room - Math.abs(c.target - prev) * 0.05 - Math.abs(c.target - H * 0.5) * 0.02;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  let lastNear = 0;
  function beforeStep() {
    const b = D.bot;
    if (!b.on) return;
    const s = sc("Game");
    if (!s?.sys.isActive() || s.blackoutT > 0) return;
    if (s.state === "ready") {
      if (D.frame >= (b.startAt ?? 0)) s.onTap();
      return;
    }
    if (s.state !== "playing") return;
    // drama cool-down: after each counted near-miss wait a few seconds
    const nears = D.events.filter((e) => e.type === "near").length;
    if (nears !== lastNear) {
      lastNear = nears;
      b.nextDrama = D.frame + 60 * (b.dramaGap ?? 3.5);
    }
    // the scripted ending: some seconds into the Abyss, fly into the nearest hazard
    if (s.inAbyss && b.abyssAt === undefined) b.abyssAt = D.frame;
    if (b.killDelay !== undefined && b.abyssAt !== undefined && D.frame >= b.abyssAt + 60 * b.killDelay)
      b.kill = true;
    const traj = plan(s);
    const c = choose(s, traj);
    if (!c) return;
    (D.trace ||= []).push([D.frame, Math.round(s.player.y), Math.round(s.player.vy), traj.filter((t) => t.hit === Infinity).length, Math.round(c.target), c.hit === Infinity ? Math.round(c.minClear) : "HIT" + c.hit, c.first ? 1 : 0, +s.timeScale.toFixed(2)]);
    if (D.trace.length > 90) D.trace.shift();
    b.target = c.target;
    if (c.first) s.onTap();
  }
})();

// LEVEL MODE verification bot (runs inside the page). It flies with real flaps (tap when below
// its target height), steering for the safest height through the hazards ahead, and plays the
// level in normal mode: a crash respawns it at the checkpoint, where it tries again with a
// different line. A level is beatable when every checkpoint-to-checkpoint stretch gets cleared
// (each one from a clean respawn, i.e. without a crash); `deaths` measures how hard that was.
// God mode (no collisions) instead flies through every star coin and checks the coin isn't
// inside a hazard when you reach it.
export function botPlay({ maxTriesPerCp = 40, god = false, maxSeconds = 900 } = {}) {
  // hazards whose position or state is a pure function of the game clock (the bot can ask them
  // where they will be when it arrives): Void saws, gates, axes, lasers; Solar fire bars and
  // geysers; Frozen sliders and zaps; Glitch blink blocks; the Abyss slammer
  const CLOCKED = new Set(
    ["saw", "gate", "blade", "laser", "firebar", "geyser", "slider", "zap", "blink", "slammer"],
  );
  const g = window.__glydrift;
  const s = g.scene.getScene("Game");
  const lr = s.levelRun;
  const om = s.obstacles;
  let t = performance.now() + 1e6;
  const step = () => {
    t += 1000 / 60;
    g.step(t, 1000 / 60);
  };
  window.__glyNoRender = true; // logic only: drawing is what makes long runs slow
  let rng = 12345;
  const rand = () => {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  };
  const H = s.H;
  // heroes with a jump perk (THE NEWBLEIZER: perks.jump, flap height ×1.08) rise higher per
  // flap: the bot flies them the way a player who knows that would (waits a little longer)
  const JUMP = s.charDef?.perks?.jump ?? 1;
  const JUMP_V = Math.sqrt(JUMP);
  const JUMP_EXTRA = 135 * (JUMP - 1);
  const res = {
    deaths: 0,
    triesAt: {},
    worstCp: 0,
    stars: [],
    starHazard: [],
    seconds: 0,
    finished: false,
    stuck: null,
  };
  let offset = 0;
  let lastDeathCp = null;
  let waitFrames = null;
  s.onTap();
  let frames = 0;
  while (frames < 60 * maxSeconds) {
    frames++;
    if (s.state === "won" || s.state === "dead") break;
    // after a crash the level waits at its checkpoint for a tap; like a person, the bot
    // takes a different moment each time (the moving hazards keep going while it waits)
    if (s.state === "ready") {
      waitFrames = waitFrames ?? (res.deaths * 7) % 23;
      if (waitFrames-- <= 0) {
        waitFrames = null;
        s.onTap(); // that tap is the flap: let it play out before steering again
        step();
        continue;
      } else {
        step();
        continue;
      }
    }
    const p = s.player;
    if (s.state === "playing") {
      const r = p.radius;
      const px = p.x;
      // the target: a star coin coming up (god mode), else the safest height ahead
      let target = null;
      let starT = 0;
      if (god) {
        for (const st of lr.stars) {
          const x = lr.toX(st.m);
          if (!st.taken && x > px - 10 && x < px + (god ? 1000 : 520)) {
            target = st.y;
            starT = Math.max(1 / 60, (x - px) / Math.max(60, s.scroll));
          }
        }
      }
      let arriveT = 0; // when the nearest obstacle reaches the bird
      if (target === null) {
        let best = -Infinity;
        const near = om.active.filter(
          (o) => o.active && o.right > px - r - 20 && o.left < px + 300,
        );
        if (!near.length) target = H / 2; // nothing ahead: hold the middle
        else {
          const first = near.reduce((m, o) => (o.left < m.left ? o : m), near[0]);
          arriveT = Math.max(0, (first.left - (px + r)) / Math.max(60, s.scroll));
        }
        // (a flap rises ~135 px and the bird sinks ~60 px below its target before the next one,
        // so targets stay far enough from the deadly top and bottom edges)
        for (let y = r + 100; near.length && y <= H - r - 90; y += 16) {
          let worst = 400;
          for (const o of near) {
            // where will it be when I get there? (moving gates, saws and blades are a function
            // of their own clock: look ahead to the arrival and through the pass)
            const sc = Math.max(60, s.scroll);
            const ta = Math.max(0, (o.left - (px + r)) / sc);
            const tb = Math.max(ta, (o.right - (px - r)) / sc);
            const x0 = o.x;
            const t0 = o.t;
            let c = 999;
            // saws, gates, the axe and side lasers move on the game clock alone: ask them where
            // they'll be at that moment (then put them back exactly)
            const clocked = CLOCKED.has(o.type);
            for (const tt of [ta, (ta + tb) / 2, tb]) {
              o.x = x0 - sc * tt;
              o.t = t0 + tt;
              if (clocked) o.update(0, s.clock + tt);
              if (o.type === "pulse" && !(o.state === "grow" && o.timer > 0.6)) {
                // the Neon Pulse's ring will reach R: stay outside it until it has fired
                c = Math.min(c, Math.hypot(px - o.x, y - o.y) - (o.R || 0) - r - 8);
              } else c = Math.min(c, o.clearance(px, y, r));
            }
            o.x = x0;
            o.t = t0;
            if (clocked) o.update(0, s.clock);
            // nearer obstacles matter more
            const w = 1 + Math.max(0, (o.left - px) / 300);
            worst = Math.min(worst, c * w);
          }
          // prefer staying near the current height (and the middle), with this try's bias
          const score =
            worst -
            Math.abs(y - p.y) * 0.08 -
            Math.abs(y - H / 2) * 0.02 +
            offset * (y < H / 2 ? 1 : -1);
          if (score > best) {
            best = score;
            target = y;
          }
        }
      }
      // god mode: is a star coin inside a hazard right where you meet it?
      if (god)
        for (const st of lr.stars) {
          const x = lr.toX(st.m);
          if (!st.checked && Math.abs(x - px) < 6) {
            st.checked = true;
            let c = 999;
            for (const o of om.active)
              if (o.active && o.right > px - 40 && o.left < px + 40)
                c = Math.min(c, o.clearance(px, st.y, 26));
            res.starHazard.push(Math.round(c));
          }
        }
      if (god && starT) {
        // god mode proves a star coin is reachable: a steady pilot flies to its height at most
        // 650 px/s up or down (a real bird manages ~790 up / 1080 down), as the fairness tests do
        const dy = target - p.y;
        p.y += Math.sign(dy) * Math.min(Math.abs(dy), 650 / 60);
        p.vy = 0;
        step();
        frames++;
        continue;
      }
      // real flaps: the bird is below its target (or above, with gravity flipped)
      // flap when the bird will be clearly below its target a moment from now (a flap rises
      // ~135 px, so it hovers in a band around the target, like a careful player)
      const down = p.gravityDir >= 0 ? 1 : -1;
      const vy = p.vy * down;
      const err = (p.y - target) * down;
      // two flying styles; after a crash the next try at that stretch uses the other one
      const precise = ((res.triesAt[lr.lastCp] || 0) + (god ? 0 : 1)) % 2 === 0;
      if (!starT && arriveT > 0 && precise) starT = Math.min(0.7, Math.max(0.12, arriveT));
      const nearTop = p.y * down < (down > 0 ? r + 70 : -(H - r - 70));
      if (p.y * down > (down > 0 ? H - r - 70 : -r - 70) && vy > 0) s.onTap(); // never fall out
      else if (nearTop && vy < 200) {
        // never flap out of the top
      } else if (starT) {
        // aiming at a star coin: flap only if that puts the bird nearer the coin's height
        // when the coin arrives (a one-step look-ahead with the real flight physics)
        const sim = (flap) => {
          let y = p.y * down;
          let v = flap ? -790 * JUMP_V * (p.miniT > 0 ? 0.86 : 1) : vy;
          const tg = target * down;
          for (let k = 0; k < starT * 60; k++) {
            v += ((v < 0 ? 2300 : 2750) * (p.miniT > 0 ? 0.92 : 1)) / 60;
            v = Math.min(v, 1080);
            y += v / 60;
          }
          return Math.abs(y - tg);
        };
        if (sim(true) + 4 < sim(false)) s.onTap();
      } else if (err > 60 + JUMP_EXTRA && vy > -100) s.onTap();
    }
    step();
    if (s.state === "dying" && lastDeathCp === null) {
      res.deaths++;
      const cp = lr.lastCp;
      res.triesAt[cp] = (res.triesAt[cp] || 0) + 1;
      res.worstCp = Math.max(res.worstCp, res.triesAt[cp]);
      lastDeathCp = cp;
      offset = (rand() - 0.5) * 120; // a different line next try
      if (res.triesAt[cp] > maxTriesPerCp) {
        res.stuck = {
          cp,
          m: Math.round(s.meters),
          pct: Math.round(lr.progress() * 100),
        };
        break;
      }
    }
    if (s.state === "playing") lastDeathCp = null;
  }
  window.__glyNoRender = false;
  window.__glyRender = true;
  res.seconds = +(lr.timeMs / 1000).toFixed(1);
  res.finished = s.state === "won" || s.state === "dead";
  res.stars = [...lr.got];
  res.finishM = Math.round(lr.finishM);
  return res;
}

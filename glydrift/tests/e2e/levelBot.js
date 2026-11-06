// LEVEL MODE verification bot (runs inside the page). It flies with real flaps (tap when below
// its target height), steering for the safest height through the hazards ahead, and plays the
// level in normal mode: a crash respawns it at the checkpoint, where it tries again with a
// different line. A level is beatable when every checkpoint-to-checkpoint stretch gets cleared
// (each one from a clean respawn, i.e. without a crash); `deaths` measures how hard that was.
// God mode (no collisions) instead flies through every star coin and checks the coin isn't
// inside a hazard when you reach it.
export function botPlay({
  maxTriesPerCp = 14,
  god = false,
  maxSeconds = 400,
} = {}) {
  const g = window.__glydrift;
  const s = g.scene.getScene("Game");
  const lr = s.levelRun;
  const om = s.obstacles;
  let t = performance.now() + 1e6;
  const step = () => {
    t += 1000 / 60;
    g.step(t, 1000 / 60);
  };
  let rng = 12345;
  const rand = () => {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  };
  const H = s.H;
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
  s.onTap();
  let frames = 0;
  while (frames < 60 * maxSeconds) {
    frames++;
    if (s.state === "won" || s.state === "dead") break;
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
          if (!st.taken && x > px - 10 && x < px + 520) {
            target = st.y;
            starT = Math.max(1 / 60, (x - px) / Math.max(60, s.scroll));
          }
        }
      }
      if (target === null) {
        let best = -Infinity;
        const near = om.active.filter(
          (o) => o.active && o.right > px - r - 20 && o.left < px + 300,
        );
        for (let y = r + 24; y <= H - r - 24; y += 16) {
          let worst = 400;
          for (const o of near) {
            const ox = Math.min(Math.max(px, o.left), o.right);
            const c = o.clearance(ox, y, r);
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
      // real flaps: the bird is below its target (or above, with gravity flipped)
      // flap when the bird will be clearly below its target a moment from now (a flap rises
      // ~135 px, so it hovers in a band around the target, like a careful player)
      const down = p.gravityDir >= 0 ? 1 : -1;
      const vy = p.vy * down;
      const err = (p.y - target) * down;
      if (starT) {
        // aiming at a star coin: flap only if that puts the bird nearer the coin's height
        // when the coin arrives (a one-step look-ahead with the real flight physics)
        const sim = (flap) => {
          let y = p.y * down;
          let v = flap ? -790 * (p.miniT > 0 ? 0.86 : 1) : vy;
          const tg = target * down;
          for (let k = 0; k < starT * 60; k++) {
            v += (v < 0 ? 2300 : 2750) * (p.miniT > 0 ? 0.92 : 1) / 60;
            v = Math.min(v, 1080);
            y += v / 60;
          }
          return Math.abs(y - tg);
        };
        if (sim(true) + 4 < sim(false)) s.onTap();
      } else if (err > 60 && vy > -100) s.onTap();
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
  res.seconds = +(lr.timeMs / 1000).toFixed(1);
  res.finished = s.state === "won" || s.state === "dead";
  res.stars = [...lr.got];
  res.finishM = Math.round(lr.finishM);
  return res;
}

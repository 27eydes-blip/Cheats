// WASP LORD autopilot (runs inside the page, god mode OFF). He phases through every obstacle
// except his lethal ones (lasers, eye beams, zap beams), so the bot only steers around those
// and the screen edges, with real flaps. It asks clocked hazards (lasers, zaps, mirror lasers)
// where they will be when he gets there and steers as if every beam were on (and an eye beam
// that hasn't finished were burning at full reach): the beams warn first, so a careful player
// does the same rather than timing the gaps. This
// is the fairness check for his speed: at ×1.308 every lethal hazard must still be avoidable.
export function waspFly({ frames = 60 * 60, untilM = Infinity, force = null, steer = true, trace = false } = {}) {
  const g = window.__glydrift;
  const s = g.scene.getScene("Game");
  const om = s.obstacles;
  const H = s.H;
  const lethal = new Set(s.charDef.perks?.phase?.lethal || []);
  const CLOCKED = new Set(["laser", "zap", "mlaser"]);
  const ON = { laser: "isOn", zap: "zapping", mlaser: "firing" };
  window.__T ??= performance.now();
  // Abyss: force every multi-hazard pattern, double eye beams most of all (like abyss-crash)
  const spawn = om.spawnPattern;
  const out = {
    frames: 0,
    patterns: 0,
    pairs: 0,
    zones: {},
    lethalSeen: {},
    phased: 0,
    minLethalClear: {},
    killedBy: null,
    killedIn: null,
  };
  if (force) {
    // force: { biome: [pattern kinds…] } — that realm spawns these patterns in turn
    const n = {};
    out.forced = {};
    om.spawnPattern = function (meters, biomeId) {
      const cycle = force[biomeId];
      // (the first metres of a realm or dimension keep their gentle start)
      if (!cycle || this.info.simpleOnly || this.info.pause) return spawn.call(this, meters, biomeId);
      n[biomeId] = (n[biomeId] || 0) + 1;
      const kind = cycle[n[biomeId] % cycle.length];
      out.patterns++;
      out.forced[kind] = (out.forced[kind] || 0) + 1;
      if (kind === "eyepair") out.pairs++;
      const keep = this.level;
      this.level = { i: 0, beats: [{ kind, d: 0.6, gap: 380 }], onBeat() {} };
      try {
        return spawn.call(this, meters, biomeId);
      } finally {
        this.level = keep;
      }
    };
  }
  const beamClear = (o, x, y, r) => {
    // the eye beam at full reach (conservative until it has burnt out)
    const dx = Math.abs(s.player.x - x) - o.bw / 2 - r;
    const dy = o.top ? y - o.L - r : H - o.L - y - r;
    return Math.max(dx, dy);
  };
  const p = s.player;
  const seen = new Map();
  const phased0 = s.run.phased || 0;
  try {
    for (let i = 0; i < frames && s.state === "playing"; i++) {
      if (s.meters >= untilM) break;
      out.frames++;
      out.zones[s.zoneId] = (out.zones[s.zoneId] || 0) + 1;
      const r = p.radius;
      const px = p.x;
      const sc = Math.max(60, s.scroll);
      const near = om.active.filter(
        (o) => o.active && lethal.has(o.type) && o.right > px - r - 20 && o.left < px + 900,
      );
      // a lethal hazard counts once while it stays in view (pooled hazards come back later)
      for (const o of near) {
        if (seen.get(o) !== i - 1) out.lethalSeen[o.type] = (out.lethalSeen[o.type] || 0) + 1;
        seen.set(o, i);
      }
      // the Mirror Realm's twin (reflected across the horizon) crashes too: mind it from just
      // before the border, since hazards already on screen carry into the realm
      const twin = s.mirror || s.course.segAt(s.meters + 60).id === "mirror";
      let target = H / 2;
      if (steer && near.length) {
        let best = -Infinity;
        for (let y = r + 110; y <= H - r - 100; y += 16) {
          let worst = 400;
          for (const o of near) {
            const ta = Math.max(0, (o.left - (px + r)) / sc);
            const tb = Math.max(ta, (o.right - (px - r)) / sc);
            const x0 = o.x;
            const t0 = o.t;
            const clocked = CLOCKED.has(o.type);
            let c = 999;
            const ts = [];
            for (let tt = ta; tt <= tb + 0.1; tt += 0.05) ts.push(tt);
            for (const tt of ts) {
              o.x = x0 - sc * tt;
              o.t = t0 + tt;
              if (clocked) {
                o.update(0, s.clock + tt);
                // a careful pilot never counts on a beam being off: always on, where it will be
                o[ON[o.type]] = true;
              }
              const ys = twin ? [y, H - y] : [y];
              for (const yy of ys)
                c = Math.min(
                  c,
                  o.type === "eyebeam" && o.state !== "done" ? beamClear(o, o.x, yy, r) : o.clearance(px, yy, r),
                );
            }
            o.x = x0;
            o.t = t0;
            if (clocked) o.update(0, s.clock);
            const w = 1 + Math.max(0, (o.left - px) / 300);
            worst = Math.min(worst, c * w);
          }
          const score = Math.min(worst, 120) - Math.abs(y - p.y) * 0.05 - Math.abs(y - H / 2) * 0.02;
          if (score > best) {
            best = score;
            target = y;
          }
        }
      }
      // real flaps: hover in a band around the target (a flap rises ~135 px)
      const down = p.gravityDir >= 0 ? 1 : -1;
      const vy = p.vy * down;
      const err = (p.y - target) * down;
      const nearTop = down > 0 ? p.y < r + 80 : p.y > H - r - 80;
      const nearBottom = down > 0 ? p.y > H - r - 80 : p.y < r + 80;
      if (nearBottom && vy > 0) s.onTap();
      else if (!nearTop && err > 50 && vy > -100) s.onTap();
      if (trace)
        (out.trace ||= []).push([
          i,
          Math.round(p.y),
          Math.round(p.vy),
          Math.round(target),
          near.map((o) => `${o.type}@${Math.round(o.x - px)}:${o.zapping || o.isOn || o.firing || o.burning ? 1 : 0}:${Math.round(o.y1 ?? o.gc ?? o.ym ?? 0)}-${Math.round(o.y2 ?? 0)}`).join(" "),
        ]) > 90 && out.trace.shift();
      window.__T += 1000 / 60;
      g.step(window.__T, 1000 / 60);
      for (const o of near) {
        const c = o.minClear;
        if (c !== Infinity) out.minLethalClear[o.type] = Math.min(out.minLethalClear[o.type] ?? 999, Math.round(c));
      }
    }
  } finally {
    om.spawnPattern = spawn;
  }
  out.phased = (s.run.phased || 0) - phased0;
  out.m = Math.floor(s.meters);
  out.zone = s.zoneId;
  out.state = s.state;
  if (s.state !== "playing") {
    out.killedBy = s.run.killedBy;
    out.killedIn = s.run.killedIn;
    out.y = Math.round(p.y);
  }
  return out;
}

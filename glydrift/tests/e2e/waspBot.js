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
  // the game's flight physics (src/config.js PHYSICS; the spec checks they still match)
  const PH = { up: 2300, down: 2750, flap: -790, fall: 1080, rise: -980 };
  const flapMul = Math.sqrt(s.charDef.perks?.jump ?? 1);
  // hover in a band around the target (a flap rises ~135 px); far below it, climb like a
  // player would, tapping again before the rise fades. Taps stay over 0.25 s apart, so a
  // hover flap never turns into his boosted double jump.
  const tapRule = (nearBottom, nearTop, vy, err, since) =>
    since > 0.27 &&
    ((nearBottom && vy > 0) || (!nearTop && err > 50 && vy > -100) || (!nearTop && err > 200 && vy > -420));
  // look as far ahead in time as at normal speed (900 px at ×1): faster heroes see further
  const LOOK = 900 * Math.max(1, s.charDef.speed ?? 1);
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
  let lastTap = -99;
  let plan = null;
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
        (o) => o.active && lethal.has(o.type) && o.right > px - r - 20 && o.left < px + LOOK,
      );
      // a lethal hazard counts once while it stays in view (pooled hazards come back later)
      for (const o of near) {
        if (seen.get(o) !== i - 1) out.lethalSeen[o.type] = (out.lethalSeen[o.type] || 0) + 1;
        seen.set(o, i);
      }
      // the Mirror Realm's twin (reflected across the horizon) crashes too: mind it from just
      // before the border, since hazards already on screen carry into the realm
      const down = p.gravityDir >= 0 ? 1 : -1;
      const twin = s.mirror || s.course.segAt(s.meters + 60).id === "mirror";
      // (re-plan every other frame: half the work, and a plan 1/60 s old is still good)
      let target = plan ?? H / 2;
      if (steer && near.length && (i % 2 === 0 || plan === null)) {
        // Look ahead 1.6 s: for each height he could aim for, fly him there with the same taps
        // and physics the game uses, and keep the height whose whole flight stays clearest of
        // every lethal hazard (as if every beam were on). Far-off clashes count for less: there
        // is time to change plan once the near ones are passed.
        const STEP = 3; // frames per look-ahead step
        const N = 32;
        const dt = STEP / 60;
        const ys = [];
        for (let y = r + 110; y <= H - r - 100; y += 16) ys.push(y);
        const paths = ys.map((ty) => {
          let y = p.y;
          let v = p.vy;
          let last = (i - lastTap) / 60;
          const out = new Float64Array(N);
          for (let k = 0; k < N; k++) {
            for (let f = 0; f < STEP; f++) {
              const vv = v * down;
              const e = (y - ty) * down;
              const nt = down > 0 ? y < r + 80 : y > H - r - 80;
              const nb = down > 0 ? y > H - r - 80 : y < r + 80;
              if (tapRule(nb, nt, vv, e, last)) {
                v = PH.flap * flapMul * down;
                last = 0;
              }
              last += 1 / 60;
              const g = (v * down < 0 ? PH.up : PH.down) * down;
              v += g / 60;
              if (v * down > PH.fall) v = PH.fall * down;
              if (v * down < PH.rise) v = PH.rise * down;
              y += v / 60;
            }
            out[k] = y;
          }
          return out;
        });
        const worst = ys.map(() => 400);
        const wOf = (c, tt) => (c >= 0 ? c * (1 + tt * 1.5) : c / (1 + tt * 1.5));
        // the floor, the ceiling and the screen edges end his run too
        paths.forEach((pa, j) => {
          for (let k = 0; k < N; k++) {
            const e = Math.min(pa[k] - r, H - r - pa[k]) - 12;
            worst[j] = Math.min(worst[j], wOf(e, (k + 1) * dt));
          }
        });
        for (const o of near) {
          const x0 = o.x;
          const t0 = o.t;
          const clocked = CLOCKED.has(o.type);
          for (let k = 0; k < N; k++) {
            const tt = (k + 1) * dt;
            o.x = x0 - sc * tt;
            o.t = t0 + tt;
            if (o.right < px - r - 20) break; // passed
            if (o.left > px + r + 20) continue; // not reached yet
            if (clocked) {
              if (o.type === "zap") {
                // zap beams flash a 0.75 s charge warning before they fire, and a careful pilot
                // reads it: the beam counts as live while charging or firing, with 0.2 s to spare
                // either side (the orbs are always solid)
                let live = false;
                for (const dtt of [-0.2, 0, 0.2]) {
                  o.update(0, s.clock + tt + dtt);
                  live ||= o.zapping || o.charging;
                }
                o.update(0, s.clock + tt);
                o.zapping = live;
              } else {
                o.update(0, s.clock + tt);
                // lasers: never count on one being off; always on, where it will be
                o[ON[o.type]] = true;
              }
            }
            for (let j = 0; j < ys.length; j++) {
              const y = paths[j][k];
              let c = Infinity;
              for (const yy of twin ? [y, H - y] : [y])
                c = Math.min(c, o.type === "eyebeam" && o.state !== "done" ? beamClear(o, o.x, yy, r) : o.clearance(px, yy, r));
              worst[j] = Math.min(worst[j], wOf(c, tt));
            }
          }
          o.x = x0;
          o.t = t0;
          if (clocked) o.update(0, s.clock);
        }
        let best = -Infinity;
        ys.forEach((y, j) => {
          const score = Math.min(worst[j], 120) - Math.abs(y - p.y) * 0.03 - Math.abs(y - H / 2) * 0.02;
          if (score > best) {
            best = score;
            target = y;
          }
        });
        plan = target;
      } else if (!near.length) plan = null;
      // real flaps, by the same rule the look-ahead flies him with
      const vy = p.vy * down;
      const err = (p.y - target) * down;
      const nearTop = down > 0 ? p.y < r + 80 : p.y > H - r - 80;
      const nearBottom = down > 0 ? p.y > H - r - 80 : p.y < r + 80;
      if (tapRule(nearBottom, nearTop, vy, err, (i - lastTap) / 60)) {
        s.onTap();
        lastTap = i;
      }
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

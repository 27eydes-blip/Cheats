// The run's course: the classic biomes in order (Neon Void → Hurricane), then a rift into a
// random dimension; every DIMENSIONS.length metres another rift leads to a different one.
// Replaces the old "a new biome every 500 m, looping" maths.
import { DIMENSIONS } from "../tuning.js";
import { speedForMeters, WORLD } from "../config.js";
import { BIOMES, biomeIndex, CLASSIC, DIMENSION_IDS, ENDLESS, PLATEAU_IDS } from "./biomes.js";

const smooth = (t) => t * t * (3 - 2 * t);

export class Course {
  /**
   * @param rng () => [0,1) — the run's random source (daily runs use a seeded one)
   * @param start optional dimension id to begin in (test builds: ?dimension=…)
   */
  constructor(rng = Math.random, start = null, only = null) {
    this.rng = rng;
    this.segs = [];
    this.cursor = 0;
    this.seen = new Set();
    const L = WORLD.biomeLength;
    if (only) {
      // level mode: one realm for the whole level (no boundaries, rifts or the Calm)
      this.only = true;
      this.push(biomeIndex(only), 0, 1e9);
      this.push(biomeIndex(only), 1e9, 1e9);
      return;
    } else if (start && DIMENSION_IDS.includes(start)) {
      this.push(biomeIndex(start), 0, DIMENSIONS.length);
    } else {
      // test builds: ?dimension=sakura (or any classic realm) starts the run at that realm
      const from = Math.max(0, ENDLESS.indexOf(biomeIndex(start)));
      for (let i = from; i < CLASSIC; i++) {
        const last = i === CLASSIC - 1;
        this.push(ENDLESS[i], (i - from) * L, last ? DIMENSIONS.riftAfter : L);
      }
    }
    this.extend(0);
  }

  push(biome, start, length) {
    const b = BIOMES[biome];
    const seg = {
      i: this.segs.length, // sequence number (unique per run)
      biome, // BIOMES index
      id: b.id,
      dimension: !!b.dimension,
      start,
      end: start + length,
      length,
      firstVisit: !this.seen.has(b.id),
    };
    this.seen.add(b.id);
    this.segs.push(seg);
    return seg;
  }

  /**
   * "Pace metres": the distance the speed and difficulty curves follow. They hold still while
   * the player crosses a plateau realm (Sakura Skies), so everything after it plays exactly as
   * it did before that realm existed; the score and the distance shown still use real metres.
   */
  pace(m) {
    if (this.only) return m;
    // (plateau realms are only ever in the fixed opening of the course, never past the rift)
    this.plateaus ||= this.segs.filter((s) => PLATEAU_IDS.includes(s.id) && !s.dimension);
    let held = 0;
    for (const s of this.plateaus) if (m > s.start) held += Math.min(m, s.end) - s.start;
    return m - held;
  }

  /** World speed (px/s) at real distance `m`, before realm multipliers. */
  speedAt(m) {
    return speedForMeters(this.pace(m));
  }

  /** Make sure segments exist well past `m`. */
  extend(m) {
    if (this.only) return;
    while (this.segs[this.segs.length - 1].end < m + 3000) {
      const last = this.segs[this.segs.length - 1];
      const pool = DIMENSION_IDS.filter((id) => id !== last.id);
      const id = pool[Math.floor(this.rng() * pool.length) % pool.length];
      this.push(biomeIndex(id), last.end, DIMENSIONS.length);
    }
  }

  segAt(m) {
    this.extend(m);
    let i = Math.min(this.cursor, this.segs.length - 1);
    while (i > 0 && m < this.segs[i].start) i--;
    while (i < this.segs.length - 1 && m >= this.segs[i].end) i++;
    this.cursor = i;
    return this.segs[i];
  }

  next(seg) {
    this.extend(seg.end);
    return this.segs[seg.i + 1] || seg;
  }

  /** Is the boundary at the end of `seg` a rift (into a dimension)? */
  riftAfter(seg) {
    return this.next(seg).dimension;
  }

  /**
   * Palette blend state at `m` (same shape the old biomeStateAt returned, plus the segment).
   * Classic boundaries morph over WORLD.biomeBlend; rifts switch instantly (the tear hides it).
   */
  stateAt(m) {
    const seg = this.segAt(m);
    const nxt = this.next(seg);
    const local = m - seg.start;
    let t = 0;
    if (!nxt.dimension && !seg.dimension) {
      const start = seg.length - WORLD.biomeBlend;
      if (local > start) t = smooth((local - start) / WORLD.biomeBlend);
    }
    const dom = t > 0.5 ? nxt : seg;
    return { a: BIOMES[seg.biome], b: BIOMES[nxt.biome], t, seg, dom, local };
  }
}

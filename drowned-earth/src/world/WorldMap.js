import { fbm2, smoothstep, clamp } from '../core/rng.js';

// Answers "what is at (x,z)?" for any point on the planet: region, seabed depth,
// whether a landmark has claimed the ground. Pure functions of the atlas + seed,
// so generation is deterministic and chunks can be built in any order.
export class WorldMap {
  constructor(atlas) {
    this.atlas = atlas;
    this.seed = atlas.worldSeed;
    this.regions = atlas.regions;
    this.landmarks = atlas.landmarks;
  }
  regionAt(x, z) {
    for (const r of this.regions) {
      if (r.type === 'drowned_city') {
        const dx = Math.abs(x - r.center[0]) - r.halfSize[0], dz = Math.abs(z - r.center[1]) - r.halfSize[1];
        if (dx < 0 && dz < 0) return r;
      } else if (r.radius) {
        if (Math.hypot(x - r.center[0], z - r.center[1]) < r.radius) return r;
      }
    }
    return this.atlas.defaultRegion;
  }
  // 0 inside the city core → 1 at the end of its falloff
  cityFade(x, z) {
    const r = this.regions[0];
    const dx = Math.max(0, Math.abs(x - r.center[0]) - r.halfSize[0]);
    const dz = Math.max(0, Math.abs(z - r.center[1]) - r.halfSize[1]);
    return clamp(Math.hypot(dx, dz) / r.falloff, 0, 1);
  }
  seabedAt(x, z) {
    const city = this.regions[0];
    const n = fbm2(x * 0.004, z * 0.004, this.seed, 3);
    const fade = this.cityFade(x, z);
    let y = city.streetDepth - n * 0.6;
    const outskirts = -16 - n * 8;
    const ocean = -45 - fbm2(x * 0.0008, z * 0.0008, this.seed + 7, 3) * 60;
    const d = Math.hypot(x, z);
    const far = smoothstep(1800, 3200, d);
    y = y * (1 - fade) + outskirts * fade;
    y = y * (1 - far) + ocean * far;
    // The Sounding: a collapsed plaza that falls away into the dark
    const s = this.landmarks.find((l) => l.kind === 'sinkhole');
    if (s) {
      const ds = Math.hypot(x - s.pos[0], z - s.pos[1]);
      const pit = 1 - smoothstep(14, s.clear, ds);
      y = y * (1 - pit) + -78 * pit;
    }
    // Cask Street: the street caved into the station below
    const sub = this.landmarks.find((l) => l.kind === 'subway');
    if (sub) {
      const dx = x - sub.pos[0], dz = z - (sub.pos[1] + 8);
      const d = Math.hypot(dx * 0.8, dz * 0.6);
      const k = 1 - smoothstep(14, 30, d);
      y = Math.min(y, y * (1 - k) + -16 * k);
    }
    return y;
  }
  landmarkClaim(x, z, pad = 0) {
    for (const l of this.landmarks) {
      if (Math.hypot(x - l.pos[0], z - l.pos[1]) < l.clear + pad) return l;
    }
    return null;
  }
  rectClaimed(x0, z0, x1, z1, pad = 0) {
    for (const l of this.landmarks) {
      const cx = clamp(l.pos[0], x0, x1), cz = clamp(l.pos[1], z0, z1);
      if (Math.hypot(cx - l.pos[0], cz - l.pos[1]) < l.clear + pad) return l;
    }
    return null;
  }
}

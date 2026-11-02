// Pixel biome themes. Each theme names its tile textures + its sprite atlas.
// (Neon Void is built first; the other biomes reuse it until their art lands.)
import { buildCommon } from "./common.js";
import { buildNeonVoid, NV } from "./neonVoid.js";

export const THEMES = {
  void: {
    id: "void",
    atlas: "nv",
    pillars: ["nv_pillar_0", "nv_pillar_1", "nv_pillar_2"],
    caps: ["cap_0", "cap_1"],
    wall: "nv_wall",
    edge: "nv_edge",
    edgeB: "nv_edge_b",
    chain: "nv_chain",
    beamV: "nv_beam_v",
    beamH: "nv_beam_h",
    sky: "nv_sky",
    far: "nv_far",
    mid: "nv_mid",
    roots: "nv_roots",
    nearTop: "nv_near_top",
    nearBot: "nv_near_bot",
    weather: { kind: "rain", color: NV.rain, rate: 70 },
    hazard: NV.k2, // spike colour: used only by hazards
    spark: 0xd8ffb0,
  },
};

export function themeFor(biomeId) {
  return THEMES[biomeId] || THEMES.void;
}

let built = false;
export function buildPixelArt(scene) {
  if (built) return;
  built = true;
  buildCommon(scene);
  buildNeonVoid(scene);
}

// Pixel art for the LEVEL MAP: hazard silhouettes for locked nodes, the boss skull, chests,
// coins and sparkles, and each realm's scenery props (ruins and toxic pools, volcanoes, snowy
// peaks, broken screens, cavern spires and eyes in the dark). Original art, one atlas ("lvmap").
import { PixelCanvas, addAtlas, mix, rebuild, shade } from "./px.js";

const WH = 0xffffff;
const GR = 0xb8b8c8;

function pc(w, h, draw) {
  const p = new PixelCanvas(w, h);
  draw(p);
  return p;
}

// ---------------------------------------------------------------- hazard silhouettes (16x16)
const ICONS = {
  saw: (p) => {
    for (let a = 0; a < 8; a++) {
      const x = 7.5 + Math.cos((a * Math.PI) / 4) * 6.5;
      const y = 7.5 + Math.sin((a * Math.PI) / 4) * 6.5;
      p.rect(Math.round(x) - 1, Math.round(y) - 1, 2, 2, WH);
    }
    p.circle(7.5, 7.5, 5.5, WH).circle(7.5, 7.5, 2, GR).circle(7.5, 7.5, 0.6, null);
  },
  gate: (p) => {
    p.rect(4, 0, 8, 5, WH).rect(3, 5, 10, 1, GR);
    p.rect(4, 11, 8, 5, WH).rect(3, 10, 10, 1, GR);
  },
  axe: (p) => {
    p.vline(8, 0, 8, GR).rect(7, 0, 3, 1, WH);
    p.ellipse(8, 11, 6, 4, WH).ellipse(8, 8.5, 5, 2.5, null);
  },
  laser: (p) => {
    p.rect(0, 5, 3, 6, WH).rect(13, 5, 3, 6, WH);
    p.hline(3, 12, 7, WH).hline(3, 12, 8, GR);
  },
  pulse: (p) => {
    p.circle(7.5, 7.5, 7, WH).circle(7.5, 7.5, 5.6, null);
    p.circle(7.5, 7.5, 3.5, GR).circle(7.5, 7.5, 2.2, null).circle(7.5, 7.5, 1, WH);
  },
  flip: (p) => {
    p.poly([[4, 0], [8, 5], [0, 5]], WH).rect(3, 5, 2, 4, WH);
    p.poly([[12, 16], [8, 11], [16, 11]], GR).rect(11, 7, 2, 4, GR);
  },
  mini: (p) => {
    p.rect(5, 5, 6, 6, WH);
    for (const [x, y, dx, dy] of [[0, 0, 1, 1], [15, 0, -1, 1], [0, 15, 1, -1], [15, 15, -1, -1]])
      for (let i = 0; i < 4; i++) p.set(x + dx * i, y + dy * i, GR);
  },
  geyser: (p) => {
    p.rect(6, 5, 4, 11, WH).ellipse(8, 4, 5, 3, WH).rect(2, 14, 12, 2, GR);
    p.set(3, 1, GR).set(12, 2, GR).set(8, 0, GR);
  },
  meteor: (p) => {
    p.circle(11, 5, 4, WH);
    for (let i = 0; i < 6; i++) p.set(6 - i, 9 + i, GR).set(7 - i, 10 + i, GR).set(5 - i, 8 + i, GR);
  },
  firebar: (p) => {
    p.circle(3, 12, 2.5, WH);
    for (let i = 1; i < 5; i++) p.circle(3 + i * 2.6, 12 - i * 2.6, 1.4, i % 2 ? GR : WH);
  },
  flare: (p) => {
    p.circle(7.5, 7.5, 3.5, WH);
    for (let a = 0; a < 8; a++) {
      const c = Math.cos((a * Math.PI) / 4);
      const s = Math.sin((a * Math.PI) / 4);
      p.line(7.5 + c * 5, 7.5 + s * 5, 7.5 + c * 7.4, 7.5 + s * 7.4, GR);
    }
  },
  icicle: (p) => {
    p.rect(0, 0, 16, 2, GR);
    p.poly([[1, 2], [5, 2], [3, 13]], WH).poly([[6, 2], [10, 2], [8, 16]], WH).poly([[11, 2], [15, 2], [13, 10]], WH);
  },
  slider: (p) => {
    p.rect(4, 3, 8, 10, WH).rect(5, 4, 6, 2, GR);
    p.poly([[0, 8], [3, 5], [3, 11]], GR).poly([[16, 8], [13, 5], [13, 11]], GR);
  },
  zap: (p) => {
    p.circle(2.5, 2.5, 2.5, WH).circle(13, 13, 2.5, WH);
    p.line(4, 4, 8, 6, GR).line(8, 6, 7, 9, GR).line(7, 9, 11, 11, GR);
  },
  comet: (p) => {
    p.circle(4, 4, 3.3, WH);
    for (let i = 0; i < 9; i++) p.set(7 + i, 7 + i, GR).set(6 + i, 8 + i, i < 5 ? GR : null);
  },
  blink: (p) => {
    p.rect(1, 1, 8, 8, WH);
    for (let i = 0; i < 8; i += 2) p.set(7 + i, 7, GR).set(7 + i, 14, GR).set(7, 7 + i, GR).set(14, 7 + i, GR);
  },
  zone: (p) => {
    p.rect(2, 0, 1, 16, GR).rect(13, 0, 1, 16, GR);
    for (const y of [1, 7]) p.poly([[5, y], [11, y], [8, y + 5]], WH);
  },
  tendril: (p) => {
    const pts = [[8, 16], [7, 13], [9, 10], [10, 7], [8, 4], [5, 3], [4, 5], [6, 6]];
    for (let i = 1; i < pts.length; i++) p.line(...pts[i - 1], ...pts[i], WH);
    p.rect(7, 13, 2, 3, WH).set(9, 11, WH);
  },
  slammer: (p) => {
    p.rect(1, 0, 14, 5, WH).rect(1, 11, 14, 5, WH);
    for (let x = 2; x < 15; x += 3) p.set(x, 5, GR).set(x, 10, GR);
  },
  walls: (p) => {
    p.rect(0, 0, 3, 16, WH).rect(13, 0, 3, 16, WH);
    p.poly([[4, 8], [7, 5], [7, 11]], GR).poly([[12, 8], [9, 5], [9, 11]], GR);
  },
  eye: (p) => {
    p.ellipse(8, 8, 7.5, 4.2, WH).circle(8, 8, 3, GR).circle(8, 8, 1.3, null);
  },
};

// ---------------------------------------------------------------- icons and pickups
function skull() {
  return pc(14, 14, (p) => {
    p.ellipse(7, 5.5, 6, 5.5, WH).rect(3, 9, 8, 3, WH);
    p.rect(3, 4, 3, 3, null).rect(8, 4, 3, 3, null).set(7, 8, null).set(6, 8, null);
    p.set(4, 12, WH).set(6, 12, WH).set(8, 12, WH).set(10, 12, WH);
    p.set(5, 11, null).set(7, 11, null).set(9, 11, null);
  });
}
function lock() {
  return pc(10, 12, (p) => {
    p.rect(2, 0, 6, 1, GR).rect(1, 1, 1, 4, GR).rect(8, 1, 1, 4, GR);
    p.rect(0, 5, 10, 7, WH).rect(4, 7, 2, 3, 0x6a6090);
  });
}
function chest(open) {
  const wood = 0x8a4a1a;
  const dark = 0x4a2008;
  const gold = 0xffd23f;
  return pc(18, 16, (p) => {
    if (open) {
      p.rect(1, 0, 16, 5, shade(wood, -0.15)).rect(1, 0, 16, 1, gold).rect(1, 4, 16, 1, dark);
      p.rect(2, 5, 14, 3, 0xfff0a0).rect(4, 5, 3, 2, gold).rect(10, 5, 4, 2, gold);
    } else {
      p.rect(1, 3, 16, 5, wood).rect(1, 3, 16, 1, shade(wood, 0.3)).rect(1, 7, 16, 1, gold);
    }
    p.rect(1, 8, 16, 8, wood).rect(1, 15, 16, 1, dark).rect(1, 8, 16, 1, shade(wood, 0.25));
    p.rect(0, 3, 1, 13, dark).rect(17, 3, 1, 13, dark);
    p.rect(4, 8, 1, 8, gold).rect(13, 8, 1, 8, gold);
    p.rect(7, 7, 4, 4, gold).rect(8, 8, 2, 2, dark);
  });
}
function coin() {
  return pc(6, 6, (p) => p.circle(2.5, 2.5, 2.6, 0xffd23f).rect(2, 1, 1, 4, 0xfff0a0));
}
function sparkle() {
  return pc(7, 7, (p) => p.rect(3, 0, 1, 7, 0xfff6c0).rect(0, 3, 7, 1, 0xfff6c0).set(3, 3, WH));
}

// ---------------------------------------------------------------- realm scenery props
function voidPillar() {
  const b = 0x241640;
  const rim = 0x5a3a9a;
  const neon = 0x3ef4ff;
  return pc(12, 44, (p) => {
    p.rect(1, 8, 10, 36, b).rect(0, 40, 12, 4, rim);
    p.poly([[1, 8], [4, 2], [6, 6], [8, 0], [11, 8]], b);
    p.vline(1, 8, 43, rim).vline(4, 12, 40, shade(b, 0.2)).vline(8, 12, 40, shade(b, 0.2));
    p.line(6, 14, 4, 20, neon).line(4, 20, 7, 25, neon).set(7, 26, neon);
  });
}
function voidArch() {
  const b = 0x1e1236;
  const rim = 0x6a4aaa;
  return pc(40, 30, (p) => {
    p.rect(0, 8, 7, 22, b).rect(26, 12, 7, 18, b);
    p.poly([[0, 8], [8, 1], [20, 0], [24, 4], [20, 5], [10, 6], [7, 10]], b);
    p.hline(0, 7, 29, rim).hline(26, 33, 29, rim).line(0, 8, 8, 1, rim).line(8, 1, 20, 0, rim);
    p.rect(35, 25, 5, 5, b).rect(30, 6, 3, 3, b);
    p.set(3, 15, 0xff2bd6).set(3, 16, 0xff2bd6).set(29, 18, 0x3ef4ff);
  });
}
function voidPool() {
  // a toxic pool on a crumbling floating ruin
  return pc(36, 22, (p) => {
    p.poly([[0, 5], [36, 5], [30, 12], [24, 15], [18, 22], [12, 15], [5, 12]], 0x1e1236);
    p.line(0, 5, 18, 22, 0x2e1e52).set(20, 18, 0x3ef4ff).set(10, 10, 0xff2bd6);
    p.ellipse(18, 5, 18, 5, 0x0e3a20).ellipse(18, 5, 16, 3.6, 0x1aa860).ellipse(17, 4.4, 12, 2.2, 0x39ff88);
    p.rect(10, 3, 5, 1, 0xb8ffd0).rect(22, 5, 3, 1, 0xb8ffd0).circle(26, 3, 0.8, 0xb8ffd0);
    p.set(14, 11, 0x39ff88).set(14, 12, 0x1aa860);
  });
}
function solarVolcano() {
  const rock = 0x2a120a;
  const rim = 0x5a2a14;
  return pc(52, 36, (p) => {
    p.poly([[0, 36], [20, 6], [32, 6], [52, 36]], rock);
    p.line(0, 35, 20, 6, rim).line(32, 6, 51, 35, rim);
    p.rect(20, 4, 12, 3, 0xff5a1f).rect(22, 3, 8, 1, 0xffd23f);
    p.line(23, 7, 19, 20, 0xff5a1f).line(19, 20, 21, 30, 0xff3a0a).line(29, 7, 33, 18, 0xff5a1f);
    p.set(24, 1, 0xffd23f).set(28, 0, 0xff8a2a).set(26, 2, 0xff8a2a);
  });
}
function solarRock() {
  return pc(18, 10, (p) => {
    p.poly([[0, 10], [3, 3], [9, 0], [15, 3], [18, 10]], 0x3a1a0e).line(3, 3, 9, 0, 0x7a3a1a);
    p.set(8, 5, 0xff8a2a).set(9, 6, 0xff5a1f).set(12, 7, 0xff5a1f);
  });
}
function frozenPeak() {
  const rock = 0x2a3a6a;
  const snow = 0xeaf6ff;
  return pc(52, 38, (p) => {
    p.poly([[0, 38], [26, 0], [52, 38]], rock).poly([[30, 38], [42, 18], [52, 38]], shade(rock, -0.2));
    p.poly([[19, 10], [26, 0], [33, 10], [29, 8], [26, 12], [23, 8]], snow);
    p.line(26, 0, 0, 38, shade(rock, 0.25)).set(25, 1, WH);
  });
}
function frozenCrystal() {
  return pc(10, 20, (p) => {
    p.poly([[5, 0], [9, 6], [7, 20], [3, 20], [1, 6]], 0x7ad8ff).poly([[5, 0], [7, 6], [5, 20], [3, 6]], 0xd8f4ff);
  });
}
function glitchScreen() {
  return pc(28, 22, (p) => {
    p.rect(0, 0, 28, 18, 0x1a2a1e).rect(2, 2, 24, 14, 0x061008);
    for (const [y, x0, x1, c] of [[4, 3, 18, 0x39ff88], [7, 8, 25, 0xff2bd6], [9, 2, 14, 0x39ff88], [12, 10, 24, 0x3ef4ff]])
      p.hline(x0, x1, y, c);
    p.line(18, 2, 13, 9, 0xd8ffd8).line(13, 9, 16, 15, 0xd8ffd8);
    p.rect(11, 18, 6, 2, 0x1a2a1e).rect(7, 20, 14, 2, 0x2a3a2e);
  });
}
function glitchBlock() {
  return pc(8, 8, (p) => p.rect(0, 0, 8, 8, 0x0e3a20).rect(1, 1, 6, 6, 0x39ff88).rect(2, 2, 2, 2, 0xd8ffd8));
}
function abyssSpire() {
  return pc(16, 46, (p) => {
    p.poly([[0, 46], [6, 0], [9, 10], [16, 46]], 0x170810).line(6, 0, 0, 45, 0x4a1a2a);
    p.set(7, 20, 0xc8102e).set(8, 28, 0x7a0418);
  });
}
function abyssEye() {
  return pc(14, 8, (p) => {
    p.ellipse(7, 4, 7, 3.6, 0x3a0810).circle(7, 4, 2.6, 0xc8102e).rect(6, 2, 2, 4, 0x000000).set(8, 2, 0xffd0d0);
  });
}
function abyssArch() {
  const b = 0x12060c;
  return pc(52, 40, (p) => {
    p.poly([[0, 40], [2, 6], [14, 0], [36, 0], [50, 8], [52, 40], [42, 40], [40, 16], [30, 10], [20, 10], [12, 18], [10, 40]], b);
    p.line(2, 6, 14, 0, 0x3a1020).line(14, 0, 36, 0, 0x3a1020);
    for (const x of [16, 22, 28, 34]) p.vline(x, 10, 14 + (x % 3), b);
  });
}

/** Build the map atlas once (frames: icon_<hazard>, skull, lock, chest, chest_open, coin,
 * sparkle, and the realm props). */
export function ensureMapArt(scene) {
  // (drawn again after a lost GPU context, gfx/rebuildArt.js: it outlives the level map)
  if (scene.textures.exists("lvmap") && !rebuild.on) return;
  rebuild.extra.set("lvmap", () => ensureMapArt(scene));
  const frames = {};
  for (const [k, draw] of Object.entries(ICONS)) frames[`icon_${k}`] = pc(16, 16, draw);
  Object.assign(frames, {
    skull: skull(),
    lock: lock(),
    chest: chest(false),
    chest_open: chest(true),
    coin: coin(),
    sparkle: sparkle(),
    void_pillar: voidPillar(),
    void_arch: voidArch(),
    void_pool: voidPool(),
    solar_volcano: solarVolcano(),
    solar_rock: solarRock(),
    frozen_peak: frozenPeak(),
    frozen_crystal: frozenCrystal(),
    glitch_screen: glitchScreen(),
    glitch_block: glitchBlock(),
    abyss_spire: abyssSpire(),
    abyss_eye: abyssEye(),
    abyss_arch: abyssArch(),
  });
  addAtlas(scene, "lvmap", frames);
}

/** Props per realm (frame names), and a tint for the realm's misty band. */
export const REALM_PROPS = {
  void: ["void_pillar", "void_pool", "void_arch", "void_pool"],
  solar: ["solar_volcano", "solar_rock", "solar_volcano", "solar_rock"],
  frozen: ["frozen_peak", "frozen_crystal", "frozen_peak", "frozen_crystal"],
  glitch: ["glitch_screen", "glitch_block", "glitch_screen", "glitch_block"],
  abyss: ["abyss_spire", "abyss_eye", "abyss_arch", "abyss_eye"],
};
export const mapMix = mix;

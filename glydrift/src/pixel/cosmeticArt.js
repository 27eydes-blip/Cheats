// Pixel art for the coin shop: hats & accessories (sized to sit on any hero's head), particle
// sprites for flap / death / trail effects, the three coin skins, the Mystery Pod and the
// shop's item icons. All original designs, drawn on the same 4x art-pixel grid as the heroes.
import { addAtlas, addTexture, PixelCanvas } from "./px.js";

const OUT = 0x120a1e;

// ------------------------------------------------------------------ hats (anchor: bottom-centre)
function crown() {
  const pc = new PixelCanvas(12, 8);
  pc.poly(
    [
      [0, 7],
      [0, 2],
      [3, 4],
      [6, 0],
      [9, 4],
      [11, 2],
      [11, 7],
    ],
    0xffd23f,
  );
  pc.hline(0, 11, 7, 0xc8901a);
  pc.set(6, 4, 0xff3a5a).set(3, 6, 0x3ef4ff).set(9, 6, 0x39ff88).set(6, 1, 0xfff6c0);
  return pc.outline(0x6a4a00, 1, true);
}
function halo() {
  const pc = new PixelCanvas(14, 5);
  pc.ellipse(6.5, 2, 6.2, 1.8, 0xfff6a0);
  pc.ellipse(6.5, 2, 4.4, 0.6, null);
  pc.set(3, 1, 0xffffff).set(10, 1, 0xffffff);
  return pc;
}
/** Season 1: a black iron crown set with blood-red gems. */
function bloodCrown() {
  const pc = new PixelCanvas(12, 8);
  pc.poly(
    [
      [0, 7],
      [0, 1],
      [2, 4],
      [4, 0],
      [6, 4],
      [8, 0],
      [10, 4],
      [11, 1],
      [11, 7],
    ],
    0x2a1a22,
  );
  pc.hline(0, 11, 7, 0x14080c).hline(0, 11, 5, 0x5a2a34);
  pc.set(4, 1, 0xff3a4a)
    .set(8, 1, 0xff3a4a)
    .set(6, 6, 0xc8102e)
    .set(2, 6, 0xc8102e)
    .set(10, 6, 0xc8102e);
  pc.set(6, 5, 0xff8a8a);
  return pc.outline(0x000000, 1, true);
}
/** Season 1: a single glowing Abyss eye floating on a little stalk of shadow. */
function abyssEye() {
  const pc = new PixelCanvas(10, 9);
  pc.ellipse(4.5, 3.5, 4.2, 3.2, 0x2a0a14);
  pc.ellipse(4.5, 3.5, 3, 2.2, 0xffe0e0);
  pc.circle(4.5, 3.5, 1.6, 0xc8102e);
  pc.set(4, 3, 0x14020a).set(5, 3, 0x14020a).set(3, 2, 0xffffff);
  pc.vline(4, 7, 8, 0x2a0a14).set(5, 7, 0x2a0a14);
  return pc.outline(0x000000, 1, true);
}

function horns() {
  const pc = new PixelCanvas(14, 7);
  for (const [bx, dir] of [
    [2, -1],
    [11, 1],
  ]) {
    pc.poly(
      [
        [bx - 2, 6],
        [bx + 2, 6],
        [bx + dir * 2, 0],
      ],
      0xd81a2a,
    );
    pc.set(bx + dir * 2, 0, 0xff6a5a);
  }
  return pc.outline(0x3a0408, 1, true);
}
function shades() {
  const pc = new PixelCanvas(12, 4);
  pc.rect(0, 0, 12, 1, 0x161616);
  pc.rect(1, 1, 4, 3, 0x161616).rect(7, 1, 4, 3, 0x161616);
  pc.set(2, 1, 0x7a7aff).set(8, 1, 0x7a7aff); // lens glint
  return pc;
}
function phones() {
  const pc = new PixelCanvas(16, 10);
  for (let x = 2; x <= 13; x++) {
    const y = Math.round(4 - Math.sin(((x - 2) / 11) * Math.PI) * 3.6);
    pc.set(x, y, 0x2a2a3a).set(x, y + 1, 0x4a4a6a);
  }
  pc.rect(0, 4, 4, 6, 0xff4fd8).rect(12, 4, 4, 6, 0xff4fd8);
  pc.rect(1, 5, 2, 4, 0x3ef4ff).rect(13, 5, 2, 4, 0x3ef4ff);
  return pc.outline(OUT, 1, true);
}
function helmet() {
  const pc = new PixelCanvas(14, 11);
  pc.ellipse(6.5, 6, 6.5, 5.5, 0x2a6aff);
  pc.rect(0, 7, 14, 4, null);
  pc.rect(0, 6, 14, 2, 0x2a6aff);
  pc.vline(6, 1, 7, 0xffffff).vline(7, 1, 7, 0xffffff); // stripe
  pc.rect(10, 7, 4, 1, 0xd8d8e8).rect(10, 9, 4, 1, 0xd8d8e8).vline(10, 7, 9, 0xd8d8e8); // face mask
  pc.set(3, 3, 0x8ab8ff);
  return pc.outline(OUT, 1, true);
}

/** Where each hat goes relative to the head anchor (art px) and how it's drawn. */
export const HAT_FIT = {
  hat_crown: { frame: "hat_crown", dx: 0, dy: 1 },
  hat_halo: { frame: "hat_halo", dx: 0, dy: -3 },
  hat_horns: { frame: "hat_horns", dx: 0, dy: 1 },
  hat_bloodcrown: { frame: "hat_bloodcrown", dx: 0, dy: 1 },
  hat_abysseye: { frame: "hat_abysseye", dx: 0, dy: 0 },
  hat_shades: { frame: "hat_shades", dx: 2, dy: 6 }, // over the eyes, not on top
  hat_phones: { frame: "hat_phones", dx: -1, dy: 6 },
  hat_helmet: { frame: "hat_helmet", dx: 0, dy: 7 },
};

// ------------------------------------------------------------------ particle sprites
function note() {
  const pc = new PixelCanvas(6, 8);
  pc.vline(4, 0, 5, 0xffffff).set(5, 0, 0xffffff).set(5, 1, 0xffffff);
  pc.ellipse(2.5, 6, 2, 1.4, 0xffffff);
  return pc;
}
function feather() {
  const pc = new PixelCanvas(4, 9);
  pc.ellipse(1.5, 4, 1.6, 4, 0xffffff);
  pc.vline(1, 2, 8, 0xc8d0e8);
  return pc;
}
function heart() {
  const pc = new PixelCanvas(7, 6);
  pc.rect(1, 0, 2, 1, 0xffffff).rect(4, 0, 2, 1, 0xffffff);
  pc.rect(0, 1, 7, 2, 0xffffff).rect(1, 3, 5, 1, 0xffffff).rect(2, 4, 3, 1, 0xffffff);
  pc.set(3, 5, 0xffffff);
  return pc;
}
function confetti() {
  const pc = new PixelCanvas(3, 2);
  pc.rect(0, 0, 3, 2, 0xffffff);
  return pc;
}
function cash() {
  const pc = new PixelCanvas(5, 5);
  pc.circle(2, 2, 2.2, 0xffd23f);
  pc.vline(2, 1, 3, 0xc8901a);
  return pc.outline(0x6a4a00, 1, false);
}
function ghost() {
  const pc = new PixelCanvas(12, 13);
  pc.circle(5.5, 5, 5, 0xf0f4ff);
  pc.rect(1, 5, 10, 6, 0xf0f4ff);
  for (const x of [1, 5, 9]) pc.rect(x, 11, 2, 2, 0xf0f4ff);
  pc.rect(3, 4, 2, 3, 0x1a1a3a).rect(7, 4, 2, 3, 0x1a1a3a);
  pc.rect(5, 8, 2, 2, 0x1a1a3a);
  return pc.outline(0x9ab0e8, 1, false);
}

// ------------------------------------------------------------------ coin skins (10x12, 4 spin frames)
function gem(f) {
  const pc = new PixelCanvas(10, 12);
  const w = [4, 3, 1, 3][f];
  pc.poly(
    [
      [4.5 - w, 4],
      [4.5, 0],
      [4.5 + w, 4],
      [4.5, 11],
    ],
    0x3ef4ff,
  );
  pc.poly(
    [
      [4.5 - w, 4],
      [4.5, 0],
      [4.5, 11],
    ],
    0x9ffcff,
  );
  pc.set(4, 2, 0xffffff);
  return pc.outline(0x0a3a5a, 1, false);
}
function starCoin(f) {
  const pc = new PixelCanvas(10, 12);
  const sx = [1, 0.7, 0.25, 0.7][f];
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 2.2 : 5;
    pts.push([4.5 + Math.cos(a) * r * sx, 6 + Math.sin(a) * r]);
  }
  pc.poly(pts, 0xffe14d);
  pc.set(4, 4, 0xfff6c0);
  return pc.outline(0x7a5a00, 1, false);
}
function heartCoin(f) {
  const pc = new PixelCanvas(10, 12);
  const h = heart();
  const sx = [1, 0.7, 0.3, 0.7][f];
  for (let y = 0; y < h.h; y++)
    for (let x = 0; x < h.w; x++)
      if (h.get(x, y) !== null) {
        const nx = Math.round(4.5 + (x - 3) * sx);
        pc.set(nx, y + 3, y < 2 && x > 0 && x < 3 ? 0xffb0d0 : 0xff3a8a);
      }
  return pc.outline(0x5a0a2a, 1, false);
}

// ------------------------------------------------------------------ mystery pod
function pod(cracked) {
  const pc = new PixelCanvas(26, 30);
  pc.ellipse(12.5, 15, 11, 13.5, 0x2a1660);
  pc.ellipse(12.5, 15, 9, 11.5, 0x5a2ab0);
  pc.ellipse(10, 10, 3, 4, 0x9a6aff);
  pc.set(9, 8, 0xffffff).set(10, 8, 0xffffff);
  pc.hline(2, 23, 15, 0xffd23f).hline(2, 23, 16, 0xc8901a); // gold band
  pc.rect(11, 13, 4, 5, 0xffd23f).set(12, 14, 0xfff6c0); // lock
  pc.set(12, 16, 0x2a1660).set(13, 16, 0x2a1660);
  if (cracked) {
    const crack = [
      [12, 2],
      [13, 5],
      [11, 8],
      [14, 11],
      [12, 13],
    ];
    for (const [x, y] of crack) pc.set(x, y, 0xffffff).set(x + 1, y + 1, 0xfff6c0);
    pc.set(6, 20, 0xffffff).set(7, 21, 0xffffff).set(5, 22, 0xffffff);
    pc.set(19, 19, 0xffffff).set(20, 21, 0xffffff);
  }
  return pc.outline(0x0a0418, 1, true);
}

// ------------------------------------------------------------------ shop icons (16x16)
function swoosh(cols) {
  const pc = new PixelCanvas(16, 16);
  for (let i = 0; i < 12; i++) {
    const x = 2 + i;
    const y = Math.round(11 - Math.sin((i / 11) * Math.PI) * 6);
    const c = cols[Math.floor((i / 12) * cols.length)];
    pc.rect(x, y, 2, Math.max(1, 3 - Math.floor(i / 5)), c);
  }
  return pc;
}
function burstIcon(c1, c2) {
  const pc = new PixelCanvas(16, 16);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    pc.line(
      8,
      8,
      Math.round(8 + Math.cos(a) * 6),
      Math.round(8 + Math.sin(a) * 6),
      i % 2 ? c1 : c2,
    );
  }
  pc.circle(8, 8, 1.5, 0xffffff);
  return pc;
}
function icons() {
  const out = {
    icon_trail_hearts: (() => {
      const pc = swoosh([0xff3a8a, 0xff7ab0, 0xffb0d0]);
      pc.blit(heart(), 9, 1);
      return pc;
    })(),
    icon_trail_fire: swoosh([0xfff1a0, 0xffa21a, 0xff5a1a, 0xb01000]),
    icon_trail_founder: swoosh([0xffffff, 0xffd23f, 0x3ef4ff, 0xb45cff]),
    icon_trail_bloodmoon: swoosh([0xffd0d0, 0xff3a4a, 0xc8102e, 0x5a0414]),
    icon_trail_abyssal: swoosh([0x5a4a6a, 0x2a1a2a, 0xc8102e, 0x14020a]),
    icon_trail_prism: swoosh([0xffffff, 0xff9ad8, 0x6ad8ff, 0xb48aff, 0xfff06a]),
    icon_trail_zen: swoosh([0xffe0ec, 0xff9ac8, 0x9ae86a, 0x4ac84a]),
    icon_trail_storm: swoosh([0xffffff, 0xbffcff, 0x3ef4ff, 0x1a5ad8]),
    icon_trail_aurora: swoosh([0xd8fff0, 0x6affc8, 0x3ef4ff, 0x8a6aff]),
    icon_trail_eclipse: swoosh([0xfff6c0, 0xffd23f, 0x8a5a1a, 0x1a0a2a]),
    icon_death_supernova: burstIcon(0xffffff, 0xffd23f),
    icon_death_glitchout: burstIcon(0x39ff88, 0xff2050),
    // Season 1 Drift Pass+ additions
    icon_trail_pp_galaxydust: (() => {
      const pc = swoosh([0xffffff, 0xc8b0ff, 0x8a5aff, 0x2a1a6a]);
      for (const [x, y] of [[3, 3], [12, 2], [8, 13], [14, 11], [2, 12]]) pc.set(x, y, 0xffffff);
      return pc;
    })(),
    icon_trail_pp_lightning: (() => {
      const pc = new PixelCanvas(16, 16);
      const pts = [[1, 8], [4, 5], [6, 9], [9, 4], [11, 9], [14, 6]];
      for (let i = 1; i < pts.length; i++) pc.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], 0xe8ffff);
      pc.line(6, 9, 5, 13, 0x9af4ff).line(11, 9, 12, 13, 0x9af4ff);
      return pc.outline(0x1a3a8a, 1, false);
    })(),
    icon_trail_pp_comboflame: (() => {
      const pc = swoosh([0xffffff, 0xffd23f, 0x39ff88, 0x3ef4ff, 0xa040ff]);
      pc.set(13, 2, 0xffd23f).set(12, 1, 0xfff6a0);
      return pc;
    })(),
    icon_death_pp_fireworks: (() => {
      const pc = burstIcon(0xff4fd8, 0x3ef4ff);
      pc.set(8, 8, 0xffd23f).set(2, 2, 0xffd23f).set(13, 3, 0xffffff);
      return pc;
    })(),
    icon_death_pp_melt: (() => {
      const pc = new PixelCanvas(16, 16);
      pc.ellipse(8, 6, 5, 5, 0x6a2a8a).ellipse(8, 13, 7, 2, 0x2a0a3a);
      for (const x of [4, 7, 10, 12]) pc.vline(x, 9, 11 + (x % 3), 0x8a2a9a);
      pc.set(6, 5, 0xff3a4a).set(10, 5, 0xff3a4a);
      return pc.outline(0x06030c, 1, false);
    })(),
    icon_death_pp_shatter: (() => {
      const pc = new PixelCanvas(16, 16);
      pc.rect(2, 3, 10, 3, 0xff2050).rect(4, 7, 10, 3, 0x39ff88).rect(1, 11, 10, 3, 0x20c8ff);
      pc.set(14, 4, 0xff2050).set(0, 8, 0x39ff88).set(13, 12, 0x20c8ff);
      return pc;
    })(),
    icon_pose_pp_power: (() => {
      const pc = new PixelCanvas(16, 16);
      pc.ellipse(8, 9, 4, 4, 0xffd23f);
      pc.line(4, 8, 1, 4, 0xffd23f).line(12, 8, 15, 4, 0xffd23f);
      pc.set(1, 3, 0xffffff).set(15, 3, 0xffffff).set(8, 2, 0xfff6a0).set(5, 1, 0xfff6a0).set(11, 1, 0xfff6a0);
      return pc.outline(0x5a3a00, 1, false);
    })(),
    icon_pose_pp_spinflip: (() => {
      const pc = new PixelCanvas(16, 16);
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 1.7 + 0.6;
        pc.set(Math.round(8 + Math.cos(a) * 6), Math.round(8 + Math.sin(a) * 6), i > 15 ? 0xffffff : 0x9af4ff);
      }
      pc.poly([[3, 3], [7, 3], [4, 7]], 0xffffff);
      return pc;
    })(),
    icon_pose_pp_aura: (() => {
      const pc = new PixelCanvas(16, 16);
      pc.ellipse(8, 8, 7, 7, 0xb45cff).ellipse(8, 8, 5, 5, 0x2a1450).ellipse(8, 8, 3, 3, 0xffd23f);
      pc.set(8, 8, 0xffffff);
      return pc;
    })(),
    icon_theme_pp_abyss: (() => {
      const pc = new PixelCanvas(16, 16);
      pc.rect(0, 1, 16, 14, 0x0a0410);
      for (const [x, y] of [[4, 5], [11, 9]]) {
        pc.ellipse(x, y, 2, 1, 0xf4e8ff).set(x, y, 0xff3a4a);
      }
      pc.set(2, 12, 0x8a2a9a).set(13, 3, 0x8a2a9a).set(8, 13, 0xff3a4a);
      return pc;
    })(),
    icon_name_pp_gold: (() => {
      const pc = new PixelCanvas(16, 16);
      pc.rect(1, 5, 14, 6, 0xffd23f).hline(2, 13, 5, 0xfff6c0).hline(1, 14, 10, 0xc89a10);
      for (const x of [3, 6, 9, 12]) pc.vline(x, 7, 8, 0x5a3a00);
      return pc.outline(0x3a2400, 1, false);
    })(),
    icon_badge_pp_s1: (() => {
      const pc = new PixelCanvas(16, 16);
      pc.poly([[2, 1], [13, 1], [13, 9], [8, 14], [2, 9]], 0xc8102e);
      pc.hline(3, 12, 2, 0xff5a6a);
      // "S1" in gold pixels
      pc.hline(4, 6, 4, 0xffd23f).set(4, 5, 0xffd23f).hline(4, 6, 6, 0xffd23f).set(6, 7, 0xffd23f).hline(4, 6, 8, 0xffd23f);
      pc.vline(10, 4, 8, 0xffd23f).set(9, 5, 0xffd23f);
      return pc.outline(0x3a0208, 1, false);
    })(),
    icon_trail_lightning: (() => {
      const pc = new PixelCanvas(16, 16);
      pc.poly(
        [
          [9, 0],
          [3, 9],
          [7, 9],
          [5, 15],
          [13, 5],
          [9, 5],
        ],
        0xbff4ff,
      );
      return pc.outline(0x2a8aff, 1, false);
    })(),
    icon_trail_glitch: swoosh([0xff2050, 0x39ff88, 0x20c8ff, 0x39ff88]),
    icon_trail_rainbow: swoosh([0xff3a5a, 0xff8a1a, 0xffe14d, 0x39ff88, 0x2a8aff, 0xb45cff]),
    icon_trail_galaxy: (() => {
      const pc = swoosh([0x2a1660, 0x5a2ab0, 0xb45cff, 0x7ad8ff]);
      pc.set(4, 4, 0xffffff).set(12, 3, 0xffffff).set(13, 13, 0xffffff);
      return pc;
    })(),
    icon_trail_money: (() => {
      const pc = swoosh([0xffd23f, 0x39ff88, 0xffd23f]);
      pc.blit(cash(), 9, 1);
      pc.blit(cash(), 1, 2);
      return pc;
    })(),
    icon_death_shatter: burstIcon(0x3ef4ff, 0xb45cff),
    icon_death_confetti: (() => {
      const pc = new PixelCanvas(16, 16);
      const cols = [0xff3a5a, 0xffe14d, 0x39ff88, 0x3ef4ff, 0xff4fd8];
      for (let i = 0; i < 14; i++) pc.rect((i * 7) % 15, (i * 5 + 3) % 15, 2, 1, cols[i % 5]);
      return pc;
    })(),
    icon_death_ghost: (() => {
      const pc = new PixelCanvas(16, 16);
      pc.blit(ghost(), 1, 1);
      return pc;
    })(),
    icon_death_firework: burstIcon(0xff4fd8, 0xffd23f),
    icon_death_blackhole: (() => {
      const pc = new PixelCanvas(16, 16);
      pc.circle(8, 8, 7, 0xb45cff);
      pc.circle(8, 8, 5.5, 0x5a2ab0);
      pc.circle(8, 8, 3.6, 0x000000);
      pc.set(2, 3, 0xffffff).set(13, 12, 0xffffff);
      return pc;
    })(),
    icon_flap_sparks: burstIcon(0xffd23f, 0xfff6c0),
    icon_flap_stars: (() => {
      const pc = new PixelCanvas(16, 16);
      for (const [x, y] of [
        [4, 4],
        [11, 7],
        [6, 12],
      ]) {
        pc.hline(x - 2, x + 2, y, 0xffe14d).vline(x, y - 2, y + 2, 0xffe14d);
        pc.set(x, y, 0xffffff);
      }
      return pc;
    })(),
    icon_flap_feathers: (() => {
      const pc = new PixelCanvas(16, 16);
      pc.blit(feather(), 4, 3);
      pc.blit(feather(), 9, 5);
      return pc;
    })(),
    icon_flap_notes: (() => {
      const pc = new PixelCanvas(16, 16);
      pc.blit(note(), 2, 3);
      pc.blit(note(), 9, 6);
      return pc;
    })(),
  };
  return out;
}

function sweat() {
  const pc = new PixelCanvas(3, 5);
  pc.set(1, 0, 0xffffff).rect(0, 1, 3, 3, 0xffffff).set(1, 4, 0xffffff);
  return pc;
}
function dumbbell() {
  const pc = new PixelCanvas(9, 5);
  pc.rect(0, 0, 2, 5, 0x5a5a6a).rect(7, 0, 2, 5, 0x5a5a6a);
  pc.hline(2, 6, 2, 0xb8b8c8);
  pc.set(0, 0, 0x8a8a9a).set(7, 0, 0x8a8a9a);
  return pc.outline(0x161620, 1, false);
}

export function buildCosmeticArt(scene) {
  const frames = {
    hat_crown: crown(),
    hat_halo: halo(),
    hat_horns: horns(),
    hat_bloodcrown: bloodCrown(),
    hat_abysseye: abyssEye(),
    hat_shades: shades(),
    hat_phones: phones(),
    hat_helmet: helmet(),
    pod_0: pod(false),
    pod_1: pod(true),
    ...icons(),
  };
  for (let f = 0; f < 4; f++) {
    frames[`coin_gems_${f}`] = gem(f);
    frames[`coin_stars_${f}`] = starCoin(f);
    frames[`coin_hearts_${f}`] = heartCoin(f);
  }
  addAtlas(scene, "cosm", frames);
  // particle sprites (white, tinted per use)
  addTexture(scene, "fx_note", note(), 3);
  addTexture(scene, "fx_feather", feather(), 3);
  addTexture(scene, "fx_heart", heart(), 3);
  addTexture(scene, "fx_confetti", confetti(), 3);
  addTexture(scene, "fx_cash", cash(), 3);
  addTexture(scene, "fx_ghost", ghost(), 4);
  addTexture(scene, "fx_sweat", sweat(), 3);
  addTexture(scene, "fx_dumbbell", dumbbell(), 3);
}

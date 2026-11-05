// Pixel art for the biome-signature hazards (one atlas: "hz"). Every hazard has a distinct
// warning state drawn here too (bubbling vent, target reticle, shaking icicle, charging orb,
// ghost outline, glowing eyes, red crusher lamp). Hazard colours come from each biome's spike
// palette (k0..k3), which nothing harmless uses.
import { addAtlas, addTexture, canvasTexture, PixelCanvas, S, seeded, shade } from "./px.js";

// ------------------------------------------------------------------ SOLAR STORM
function vent(P, hot) {
  // floor vent the geyser erupts from (16x7), glows + bubbles while it warns
  const pc = new PixelCanvas(18, 8);
  pc.rect(1, 3, 16, 5, P.s2).hline(1, 16, 3, P.s3).hline(1, 16, 7, P.s0);
  pc.rect(4, 1, 10, 3, P.s3).hline(4, 13, 1, P.s4);
  pc.rect(6, 2, 6, 2, hot ? P.k2 : P.k0);
  if (hot) pc.hline(7, 10, 2, P.k3);
  pc.outline(P.O, 1);
  return pc;
}
function lavaTile(P) {
  // vertical, tileable lava column body (12 wide)
  const pc = new PixelCanvas(12, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 12; x++) {
      const edge = x < 2 || x > 9;
      const band = (y + (x >> 1)) % 8 < 2;
      pc.set(x, y, edge ? P.k1 : band ? P.k3 : P.k2);
    }
  pc.vline(0, 0, 15, P.k0).vline(11, 0, 15, P.k0);
  return pc;
}
function lavaHead(P, f) {
  const pc = new PixelCanvas(16, 12);
  pc.ellipse(8, 8, 6 + (f % 2), 4, P.k2);
  pc.ellipse(7, 7, 3, 2, P.k3);
  const drops = [
    [2, 2, 13, 3],
    [3, 1, 12, 1],
    [1, 3, 14, 2],
  ][f];
  pc.rect(drops[0], drops[1], 2, 2, P.k2).rect(drops[2], drops[3], 2, 2, P.k1);
  pc.outline(P.k0, 1);
  return pc;
}
function meteor(P, f) {
  const pc = new PixelCanvas(16, 22);
  // flame tail above (it falls downward)
  const tail = [
    [5, 0, 10, 0],
    [4, 1, 11, 2],
    [6, 0, 9, 1],
  ][f];
  pc.poly(
    [
      [3, 10],
      [tail[0], tail[1]],
      [8, 4],
      [tail[2], tail[3]],
      [13, 10],
    ],
    P.k1,
  );
  pc.poly(
    [
      [5, 11],
      [7, 4],
      [9, 4],
      [11, 11],
    ],
    P.k3,
  );
  // rock
  pc.circle(8, 15, 5.3, 0x4a2a1e);
  pc.circle(7, 14, 2.6, 0x6f4430);
  pc.set(10, 17, 0x2a140c).set(5, 16, 0x2a140c).set(9, 13, P.k2);
  pc.outline(P.O, 1, true);
  return pc;
}
function reticle(on) {
  // red impact marker (always red: universal "danger here")
  const pc = new PixelCanvas(19, 11);
  const c = on ? 0xff3030 : 0x9a1010;
  pc.ellipse(9, 5, 8.5, 4.5, c);
  pc.ellipse(9, 5, 6.5, 3, null);
  pc.ellipse(9, 5, 2.5, 1.2, c);
  pc.hline(0, 3, 5, c).hline(15, 18, 5, c);
  return pc;
}
function firePivot(P) {
  const pc = new PixelCanvas(14, 14);
  pc.rect(1, 1, 12, 12, P.s2).hline(1, 12, 1, P.s4).vline(1, 1, 12, P.s3);
  pc.hline(1, 12, 12, P.s0).vline(12, 1, 12, P.s0);
  pc.rect(5, 5, 4, 4, P.k1).rect(6, 6, 2, 2, P.k3);
  pc.outline(P.O, 1);
  return pc;
}
function fireball(P, f) {
  const pc = new PixelCanvas(10, 10);
  pc.circle(5, 5, 4 - (f === 1 ? 0.4 : 0), P.k1);
  pc.circle(4.6, 4.6, 2.6, P.k2);
  pc.circle(4, 4, 1.2, P.k3);
  pc.outline(P.k0, 1);
  return pc;
}

// ------------------------------------------------------------------ FROZEN NEBULA
function icicle(P) {
  const pc = new PixelCanvas(12, 30);
  pc.rect(0, 0, 12, 4, P.s2).hline(0, 11, 0, P.s4).hline(0, 11, 3, P.s0);
  pc.poly(
    [
      [1, 3],
      [11, 3],
      [6.5, 30],
      [5.5, 30],
    ],
    P.k2,
  );
  for (let y = 4; y < 30; y++)
    for (let x = 0; x < 12; x++) {
      if (pc.get(x, y) !== P.k2) continue;
      if (x >= 7) pc.set(x, y, P.k1);
      if (x <= 3 && y < 14) pc.set(x, y, P.k3);
    }
  pc.outline(P.O, 1);
  return pc;
}
function zapOrb(P, f) {
  // f: 0 idle, 1 charging, 2 firing
  const pc = new PixelCanvas(16, 16);
  pc.circle(8, 8, 6.3, f === 0 ? P.k0 : P.k1);
  pc.circle(8, 8, 4, f === 2 ? P.k3 : P.k2);
  pc.circle(7, 7, 1.5, 0xffffff);
  if (f >= 1) {
    for (const [x, y] of [
      [1, 8],
      [15, 8],
      [8, 1],
      [8, 15],
    ])
      pc.set(x, y, P.k3);
  }
  pc.outline(P.O, 1, true);
  return pc;
}

function comet(P, f) {
  // Frost Comet: a jagged ice core with a bright heart (f: 0/1 spin frames)
  const pc = new PixelCanvas(18, 18);
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + f * 0.4;
    const r = i % 2 ? 5.2 : 8.2;
    pts.push([9 + Math.cos(a) * r, 9 + Math.sin(a) * r]);
  }
  pc.poly(pts, P.k1);
  pc.circle(9, 9, 4.2, P.k2).circle(8, 8, 2, P.k3);
  for (let y = 0; y < 18; y++)
    for (let x = 0; x < 18; x++) if (pc.get(x, y) === P.k1 && x + y > 20) pc.set(x, y, P.k0);
  pc.outline(P.O, 1, true);
  return pc;
}

// ------------------------------------------------------------------ GLITCH REALM
function blinkBlock(P, ghost) {
  // a metal block with hazard spikes on all four sides (20x20); ghost = destination outline
  const N = 22;
  const pc = new PixelCanvas(N, N);
  if (ghost) {
    for (let i = 0; i < N; i++)
      if (i % 3 !== 2) {
        pc.set(i, 0, P.k2)
          .set(i, N - 1, P.k2)
          .set(0, i, P.k2)
          .set(N - 1, i, P.k2);
      }
    return pc;
  }
  // spikes
  for (let i = 0; i < 3; i++) {
    const o = 5 + i * 5;
    pc.poly(
      [
        [o - 2, 4],
        [o + 2, 4],
        [o, 0],
      ],
      P.k2,
    );
    pc.poly(
      [
        [o - 2, N - 4],
        [o + 2, N - 4],
        [o, N],
      ],
      P.k2,
    );
    pc.poly(
      [
        [4, o - 2],
        [4, o + 2],
        [0, o],
      ],
      P.k2,
    );
    pc.poly(
      [
        [N - 4, o - 2],
        [N - 4, o + 2],
        [N, o],
      ],
      P.k2,
    );
  }
  pc.rect(4, 4, N - 8, N - 8, P.s2);
  pc.hline(4, N - 5, 4, P.s4).vline(4, 4, N - 5, P.s3);
  pc.hline(4, N - 5, N - 5, P.s0).vline(N - 5, 4, N - 5, P.s0);
  // circuit core
  pc.rect(9, 9, 4, 4, P.k1).set(10, 10, P.k3);
  pc.hline(6, 8, 10, P.s4).hline(13, 15, 11, P.s4).vline(11, 6, 8, P.s4);
  pc.outline(P.O, 1);
  return pc;
}
function zoneTile(up) {
  // gravity-flip zone: soft magenta stripes + arrows (portal colours = harmless)
  const pc = new PixelCanvas(16, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) if ((x + y) % 8 === 0) pc.set(x, y, 0x7a2a8a);
  const rows = up
    ? ["...w...", "..www..", ".wwwww.", "...w...", "...w..."]
    : ["...w...", "...w...", ".wwwww.", "..www..", "...w..."];
  pc.stamp(5, 6, rows, { w: 0xffa8f0 });
  return pc;
}

// ------------------------------------------------------------------ ABYSS
function tendrilTile(P) {
  const pc = new PixelCanvas(10, 8);
  for (let y = 0; y < 8; y++) {
    const off = Math.round(Math.sin((y / 8) * Math.PI * 2));
    pc.hline(2 + off, 7 + off, y, 0x4a0c18);
    pc.set(3 + off, y, 0x6a1424);
    pc.set(5 + off, y, P.k1);
    pc.set(1 + off, y, P.k0).set(8 + off, y, P.k0);
  }
  pc.set(5, 2, P.k2).set(4, 6, P.k2);
  return pc;
}
function tendrilTip(P) {
  const pc = new PixelCanvas(14, 14);
  pc.poly(
    [
      [3, 0],
      [11, 0],
      [7, 13],
    ],
    0x4a0c18,
  );
  pc.poly(
    [
      [1, 2],
      [5, 4],
      [0, 9],
    ],
    0x4a0c18,
  );
  pc.poly(
    [
      [13, 2],
      [9, 4],
      [14, 9],
    ],
    0x4a0c18,
  );
  pc.vline(7, 2, 11, P.k1).set(7, 12, P.k2).set(0, 8, P.k2).set(13, 8, P.k2);
  pc.outline(P.k0, 1);
  return pc;
}
function warnEyes(P, f) {
  // glowing eyes in the wall: the tendril warning (f: 0 opening, 1 open, 2 bright)
  const pc = new PixelCanvas(15, 7);
  const lid = [2, 1, 0][f];
  pc.ellipse(3.5, 3, 3.5, 2.6, 0x050001).ellipse(11.5, 3, 3.5, 2.6, 0x050001);
  const c = f === 2 ? P.k3 : P.k2;
  pc.rect(2, 2 + lid * 0.5, 4, 3 - lid, c).rect(10, 2 + lid * 0.5, 4, 3 - lid, c);
  pc.set(3, 3, 0x050001).set(11, 3, 0x050001);
  return pc;
}
function beamEye(P, f) {
  // the Eye Beam's great eye in the wall (f: 0 shut, 1 opening, 2 open, 3 glaring)
  const pc = new PixelCanvas(17, 11);
  pc.ellipse(8, 5, 8, 5, 0x1a0507);
  const open = [0, 1.6, 3.4, 4][f];
  if (open) {
    pc.ellipse(8, 5, 7, open, f === 3 ? P.k3 : 0xd8b8b0);
    pc.ellipse(8, 5, 3, Math.min(3, open), f === 3 ? P.k2 : P.k1);
    pc.rect(7, 5 - Math.min(2, Math.floor(open)), 2, Math.min(4, Math.floor(open) * 2) || 1, 0x050001);
    if (f >= 2) pc.set(6, 3, 0xffffff);
  } else pc.hline(2, 14, 5, P.k0);
  // veined lids
  pc.set(1, 3, P.k0).set(15, 3, P.k0).set(2, 8, P.k0).set(14, 8, P.k0);
  pc.outline(0x050001, 1);
  return pc;
}
function lamp(P, on) {
  const pc = new PixelCanvas(8, 8);
  pc.rect(1, 1, 6, 6, 0x2a0a0e);
  pc.rect(2, 2, 4, 4, on ? P.k2 : P.k0);
  if (on) pc.set(2, 2, P.k3);
  pc.outline(0x050001, 1);
  return pc;
}

/** Full-screen darkness with a soft-stepped light hole (Abyss limited vision). */
export function darknessTexture(scene, key, w, h, radius) {
  // drawn at 1/S resolution then scaled S× with NEAREST → chunky pixel falloff rings
  const pw = Math.ceil(w / S);
  const ph = Math.ceil(h / S);
  const cv = document.createElement("canvas");
  cv.width = pw;
  cv.height = ph;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(pw, ph);
  const cx = pw / 2;
  const cy = ph / 2;
  const r = radius / S;
  const rnd = seeded(7);
  for (let y = 0; y < ph; y++)
    for (let x = 0; x < pw; x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      let a;
      if (d < 0.55) a = 0;
      else if (d < 0.75) a = 0.25;
      else if (d < 0.9) a = 0.5;
      else if (d < 1.05) a = (x + y) % 2 ? 0.75 : 0.6;
      else a = 1;
      if (a > 0 && a < 1 && rnd() < 0.06) a = Math.min(1, a + 0.15);
      const i = (y * pw + x) * 4;
      img.data[i] = 2;
      img.data[i + 1] = 0;
      img.data[i + 2] = 4;
      img.data[i + 3] = Math.round(a * 255);
    }
  ctx.putImageData(img, 0, 0);
  const big = document.createElement("canvas");
  big.width = pw * S;
  big.height = ph * S;
  const bctx = big.getContext("2d");
  bctx.imageSmoothingEnabled = false;
  bctx.drawImage(cv, 0, 0, big.width, big.height);
  const tex = canvasTexture(scene, key, big);
  tex.setFilter(1); // NEAREST
  return tex;
}

export function buildHazards(scene, pals) {
  const { solar: SO, frozen: FR, glitch: GL, abyss: AB } = pals;
  const frames = {
    vent_0: vent(SO, false),
    vent_1: vent(SO, true),
    reticle_0: reticle(false),
    reticle_1: reticle(true),
    pivot: firePivot(SO),
    icicle: icicle(FR),
    blink: blinkBlock(GL, false),
    blink_ghost: blinkBlock(GL, true),
    tip: tendrilTip(AB),
    lamp_0: lamp(AB, false),
    lamp_1: lamp(AB, true),
  };
  for (let f = 0; f < 3; f++) {
    frames[`lavahead_${f}`] = lavaHead(SO, f);
    frames[`meteor_${f}`] = meteor(SO, f);
    frames[`orb_${f}`] = zapOrb(FR, f);
    if (f < 2) frames[`comet_${f}`] = comet(FR, f);
    frames[`weyes_${f}`] = warnEyes(AB, f);
  }
  for (let f = 0; f < 4; f++) frames[`beye_${f}`] = beamEye(AB, f);
  for (let f = 0; f < 2; f++) frames[`fireball_${f}`] = fireball(SO, f);
  addAtlas(scene, "hz", frames);
  addTexture(scene, "hz_lava", lavaTile(SO));
  addTexture(scene, "hz_tendril", tendrilTile(AB));
  addTexture(scene, "hz_zone_up", zoneTile(true));
  addTexture(scene, "hz_zone_down", zoneTile(false));
  // dashed warning line (red: reach / impact path preview)
  const dash = new PixelCanvas(2, 6);
  dash.rect(0, 0, 2, 3, 0xff3030);
  addTexture(scene, "hz_dash", dash);
  void shade;
}

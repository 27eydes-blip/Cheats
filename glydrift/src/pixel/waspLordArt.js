// WASP LORD (ILLEGAL LEGENDARY): an original war-wasp king in heavy armour, drawn in the game's
// 24x24 hero style, facing right. Dark gunmetal plates over his helmet, chest and abdomen, with
// sharp angular edges and rivets; a small jagged dark-metal crown forged into the helmet;
// yellow-and-black wasp stripes showing between the abdomen plates; a visor slit of GLOWING RED
// eyes (his signature: the slit sits inside the dark helmet, so it pops on any sky, bright or
// dark); a long silver stinger tipped in red; and 4 see-through wings.
//
// The wings are drawn AFTER the outline and the white rim: their membrane is a sparse checker of
// pale pixels (the sky shows through the gaps, so they read as glassy, not solid), framed by a
// thin steel-blue edge that holds up on bright realms. The far pair sits behind the body, the
// near pair over it.
// Frames (26x26 once rimmed):
//   0 glide: wings swept back over the abdomen
//   1 wings up (the buzz upstroke)
//   2 wings down (the buzz downstroke)
//   3 blur: the wings a fast motion-blur fan (alternates with 1 / 2 while buzzing)
//   4 showcase / portrait: wings spread high, eyes at full burn
//   5 strike: abdomen curled under him, the stinger thrust forward (double jump, near-miss)
//   6 roar: mandibles open, eyes flared, wings up (new best, the unlock)
//   7 broken (death): cracked plates, one torn off, wings ripped, eyes gone dark
// Extras: wasplord_locked (the shop's locked look: a black silhouette, only the red eyes lit)
// and wasplord_plate (a flying armour plate for the death).
import { PixelCanvas } from "./px.js";

export const WL = {
  INK: 0x06060a,
  ARM: 0x2e3040, // gunmetal plate
  ARMD: 0x17181f,
  ARML: 0x4c5064,
  ARMH: 0x8a90a6, // the sharp edge light
  RIV: 0xb4bac8, // rivets
  CROWN: 0x3c3e4c,
  CROWNH: 0x9aa0b4,
  Y: 0xffc81a, // wasp stripes
  YD: 0xb47e00,
  EYE: 0xff1a2a,
  EYED: 0xa00814,
  EYEL: 0xff7a7a,
  EYEW: 0xffe8e8, // the hot core
  SIL: 0xdce0ec, // stinger silver
  SILD: 0x8a90a2,
  TIP: 0xff1a2a,
  TIPD: 0x9a0a14,
  WING: 0xdcf0ff, // membrane (checker)
  WINGE: 0x6e88aa, // wing edge
  WINGV: 0xa8c4e4, // vein
  CRACK: 0xff6a3a, // the glow inside a cracked plate
  DEAD: 0x4a0a12, // eyes gone dark
};
const C = WL;

/** Abdomen pixels: an ellipse along an axis, banded into armour plates and yellow stripes. */
function abdomen(pc, cx, cy, ax, ay, len, wid, broken) {
  // ax, ay: unit vector from the waist toward the stinger end
  const nx = -ay;
  const ny = ax;
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const s = dx * ax + dy * ay; // along (−len/2 .. len/2)
      const t = dx * nx + dy * ny; // across
      const r = wid * Math.sqrt(Math.max(0, 1 - (s / (len / 2)) ** 2 * (s > 0 ? 1 : 1.25)));
      if (Math.abs(t) > r || Math.abs(s) > len / 2) continue;
      const k = s + len / 2; // 0 at the waist
      // three yellow stripes between four plates
      const band = Math.floor(k / 2.1);
      const stripe = band % 2 === 1 && band < 6;
      const top = t < -r + 1.1; // the edge facing up (lit)
      const bot = t > r - 1.1;
      let c;
      if (stripe) c = top ? C.Y : bot ? C.YD : C.Y;
      else c = top ? C.ARML : bot ? C.ARMD : C.ARM;
      // a sharp light along each plate's leading rim
      if (!stripe && k % 2.1 < 0.8 && t < 0) c = C.ARMH;
      if (broken && !stripe && band === 2 && t > -0.5) c = C.CRACK; // a plate torn off: hot inside
      pc.set(x, y, c);
    }
}

/** The long silver stinger from (x0, y0) along (dx, dy), red tip. */
function stinger(pc, x0, y0, dx, dy, len) {
  for (let i = 0; i <= len; i++) {
    const x = Math.round(x0 + dx * i);
    const y = Math.round(y0 + dy * i);
    const tip = i >= len - 1;
    pc.set(x, y, tip ? C.TIP : C.SIL);
    // a darker under edge for the first half (it tapers to a needle)
    if (i < len * 0.55) pc.set(x + Math.round(-dy), y + Math.round(dx), tip ? C.TIPD : C.SILD);
  }
}

/** One wing: a quad with a steel-blue edge, a checker membrane and one vein. */
function wingShape(pc, pts, phase = 0, edge = C.WINGE) {
  const m = new PixelCanvas(pc.w, pc.h);
  m.poly(pts, 1);
  for (let y = 0; y < pc.h; y++)
    for (let x = 0; x < pc.w; x++) {
      if (m.get(x, y) === null) continue;
      const rim = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([a, b]) => m.get(x + a, y + b) === null);
      if (rim) pc.set(x, y, edge);
      else if ((x + y + phase) % 2 === 0) pc.set(x, y, C.WING);
    }
  // a vein from the root toward the tip
  const [r, t] = pts;
  pc.line(Math.round(r[0]), Math.round(r[1]), Math.round((r[0] + t[0] * 2) / 3), Math.round((r[1] + t[1] * 2) / 3), C.WINGV);
}

/** The motion-blur fan of buzzing wings: a sparse arc of streaks, brighter at the tips. */
function wingBlur(pc, ox, oy) {
  for (let a = -2.2; a <= -0.3; a += 0.09) {
    for (let r = 4; r <= 11; r++) {
      const x = Math.round(ox + Math.cos(a + Math.PI) * r * 0.95 + r * 0.25);
      const y = Math.round(oy + Math.sin(a) * r * 0.85);
      if (pc.get(x, y) !== null) continue;
      const k = (x * 3 + y * 5) % 7;
      if (r >= 10) pc.set(x, y, k < 3 ? C.WINGE : null);
      else if (k === 0) pc.set(x, y, C.WING);
      else if (k === 3 && r > 6) pc.set(x, y, C.WINGV);
    }
  }
}

/** Wing quads (root, tip, back corner, rear root) for each pose: [far upper, far lower, near upper, near lower]. */
function wingPose(f) {
  switch (f) {
    case 1: // up
    case 6:
      return [
        [[13, 8], [11, 0], [8, 0], [11, 8]],
        [[12, 8], [6, 2], [5, 4], [11, 9]],
        [[13, 8], [9, 0], [5, 1], [11, 9]],
        [[12, 9], [3, 4], [3, 7], [11, 10]],
      ];
    case 2: // down
      return [
        [[13, 10], [10, 20], [7, 19], [11, 11]],
        [[12, 10], [5, 17], [4, 15], [11, 11]],
        [[13, 10], [8, 21], [5, 20], [11, 11]],
        [[12, 10], [2, 15], [2, 13], [11, 11]],
      ];
    case 4: // spread high, a V
      return [
        [[13, 8], [15, 0], [12, 0], [12, 8]],
        [[12, 8], [8, 1], [6, 3], [11, 9]],
        [[13, 8], [8, 0], [4, 1], [11, 9]],
        [[12, 9], [1, 3], [1, 6], [11, 10]],
      ];
    case 7: // torn: short, ragged
      return [
        [[13, 8], [9, 3], [8, 5], [11, 9]],
        null,
        [[13, 9], [6, 5], [6, 7], [11, 10]],
        [[12, 10], [5, 9], [6, 11], [11, 11]],
      ];
    default: // glide / strike: swept back over the abdomen
      return [
        [[13, 8], [3, 3], [2, 5], [11, 9]],
        [[12, 9], [4, 7], [4, 9], [11, 10]],
        [[13, 8], [1, 4], [1, 7], [11, 10]],
        [[12, 10], [3, 9], [3, 11], [11, 11]],
      ];
  }
}

/** The armoured body (no wings), unoutlined, 24x24. */
function body(f) {
  const pc = new PixelCanvas(24, 24);
  const strike = f === 5;
  const roar = f === 6;
  const dead = f === 7;
  // ---- legs (behind the thorax): two armoured legs a side folded under, silver claws
  const legs = strike
    ? [[[11, 13], [12, 16], [14, 17]], [[14, 13], [16, 15], [18, 16]]]
    : dead
      ? [[[11, 13], [10, 16], [9, 18]], [[14, 13], [15, 16], [16, 18]]]
      : [[[11, 13], [11, 16], [10, 17]], [[14, 13], [14, 16], [15, 17]]];
  for (const [a, b, c] of legs) {
    pc.line(a[0], a[1], b[0], b[1], C.ARMD);
    pc.line(b[0], b[1], c[0], c[1], C.ARML);
    pc.set(c[0], c[1], C.SIL);
  }
  // ---- abdomen + stinger: long, angled back and down (the strike curls it under, stinger forward)
  if (strike) {
    abdomen(pc, 7, 15.8, -0.3, 0.95, 9.5, 3.3, false);
    stinger(pc, 9, 20, 1, 0.4, 7);
  } else {
    const droop = dead ? 0.66 : 0.52;
    const ax = -Math.sqrt(1 - droop * droop);
    abdomen(pc, 5, 14.2, ax, droop, 11, 3.5, dead);
    stinger(pc, 1, 18 + (dead ? 1 : 0), -0.3, 1, 5);
  }
  // the waist (petiole)
  pc.rect(8, 11, 2, 2, C.ARMD);
  // ---- thorax: a heavy angular chest plate with rivets and a spiked shoulder
  pc.poly([[9, 8], [12, 6.5], [15.5, 7.5], [16, 11], [14.5, 13.5], [10, 13.5], [8, 11]], C.ARM);
  pc.hline(11, 14, 7, C.ARML);
  pc.line(9, 9, 11, 7, C.ARMH); // the sharp top-back edge
  pc.hline(10, 14, 13, C.ARMD).set(15, 12, C.ARMD);
  pc.line(12, 8, 13, 12, C.ARMD); // the plate seam
  pc.set(11, 9, C.RIV).set(14, 9, C.RIV).set(14, 11, C.RIV);
  // the spiked pauldron
  pc.set(13, 5, C.ARML).set(14, 4, C.ARMH).set(13, 6, C.ARM).set(14, 5, C.ARM).set(14, 6, C.ARM);
  // ---- helmet (its own block, a dark neck seam between it and the chest): angular, with a
  // pointed jaw, and a brow that slants down to the front (an angry look)
  const hy = dead ? 1 : 0;
  pc.poly([[16, 5 + hy], [20, 3.5 + hy], [23, 6 + hy], [24, 10 + hy], [21.5, 13 + hy], [17, 12.5 + hy], [16, 10 + hy]], C.ARM);
  pc.line(16, 6 + hy, 19, 4 + hy, C.ARMH).set(20, 4 + hy, C.ARMH).set(21, 5 + hy, C.ARML).set(22, 6 + hy, C.ARML);
  pc.hline(18, 21, 12 + hy, C.ARMD).set(17, 11 + hy, C.ARMD);
  pc.set(17, 7 + hy, C.RIV); // the rivet at the temple
  pc.line(15, 7 + hy, 16, 12 + hy, C.INK); // the neck seam
  // the visor slit: slanted down toward the front, the red eyes burning in it
  pc.hline(17, 19, 7 + hy, C.INK).hline(18, 22, 8 + hy, C.INK).hline(20, 23, 9 + hy, C.INK);
  if (dead) {
    pc.hline(19, 21, 8 + hy, C.DEAD).set(22, 9 + hy, C.DEAD);
  } else {
    const hot = roar || f === 4;
    pc.set(18, 7, C.EYED).set(19, 7, C.EYE);
    pc.set(19, 8, C.EYE).set(20, 8, hot ? C.EYEW : C.EYEL).set(21, 8, C.EYEW).set(22, 8, C.EYE);
    pc.set(21, 9, C.EYE).set(22, 9, hot ? C.EYEL : C.EYE).set(23, 9, C.EYED);
  }
  // mandibles: silver, sharp; open in the roar
  if (roar) {
    pc.set(23, 12, C.SIL).set(23, 13, C.SILD).set(22, 13, C.SIL);
    pc.set(23, 11, C.EYED); // a red maw
  } else pc.set(22, 12 + hy, C.SIL).set(23, 11 + hy, C.SIL).set(21, 13 + hy, C.SILD);
  // ---- the crown: a jagged dark-metal circlet forged into the helmet top, three spikes
  const cy = 3 + hy;
  pc.hline(17, 21, cy, C.CROWN).set(18, cy, C.CROWNH).set(20, cy, C.CROWNH);
  for (const [x, h] of [
    [17, 1],
    [19, 3],
    [21, 2],
  ])
    for (let k = 1; k <= h; k++) pc.set(x + (dead && x === 21 ? 1 : 0), cy - k, k === h ? C.CROWNH : C.CROWN);
  pc.set(19, cy, C.EYE); // a red gem at the front of the circlet
  if (dead) {
    // cracks across the plates, a broken crown spike
    pc.line(10, 8, 13, 12, C.CRACK).set(14, 12, C.INK);
    pc.line(19, 5, 21, 11, C.CRACK);
    pc.set(19, cy - 3, null).set(19, cy - 2, null);
  }
  return pc;
}

/** One finished frame: far wings, the outlined + rimmed body, near wings (26x26). */
export function wasplordFrame(f) {
  const b = body(f).outline(C.INK, 1, true);
  const r = new PixelCanvas(26, 26);
  r.blit(b, 1, 1);
  r.outline(0xffffff, 1, false);
  const out = new PixelCanvas(26, 26);
  const shift = (q) => q && q.map(([x, y]) => [x + 1, y + 1]);
  if (f === 3) {
    wingBlur(out, 13, 9);
    out.blit(r, 0, 0);
    wingBlur(out, 12, 10);
    return out;
  }
  const [fu, fl, nu, nl] = wingPose(f);
  // far wings first (behind), a step up and back
  if (fu) wingShape(out, shift(fu), 1);
  if (fl) wingShape(out, shift(fl), 0);
  out.blit(r, 0, 0);
  if (nu) wingShape(out, shift(nu), 0);
  if (nl) wingShape(out, shift(nl), 1);
  return out;
}

/** The shop's locked look: the portrait pose as a black silhouette, only the red eyes lit. */
export function wasplordLocked() {
  const src = wasplordFrame(4);
  const out = new PixelCanvas(26, 26);
  const lit = new Set([C.EYE, C.EYEL, C.EYEW, C.EYED]);
  for (let y = 0; y < 26; y++)
    for (let x = 0; x < 26; x++) {
      const c = src.get(x, y);
      if (c === null) continue;
      // (the crown's red gem goes dark too: just the two eyes glow)
      const eye = lit.has(c) && y >= 8 && y <= 10 && x >= 19;
      out.set(x, y, eye ? c : c === 0xffffff ? 0x5a0a16 : 0x0a0a10);
    }
  return out;
}

/** A gunmetal armour plate (death: plates blow off and spin away). */
export function wasplordPlate() {
  const pc = new PixelCanvas(6, 5);
  pc.poly([[0, 1], [4, 0], [6, 2], [5, 5], [1, 4]], C.ARM);
  pc.hline(1, 4, 1, C.ARMH).set(3, 3, C.RIV).set(4, 4, C.ARMD);
  return pc.outline(C.INK, 1, false);
}

/** Every WASP LORD atlas frame, by name (common.js adds them to the "pxc" atlas). */
export function wasplordFrames() {
  const frames = {};
  for (let f = 0; f < 8; f++) frames[`wasplord_${f}`] = wasplordFrame(f);
  frames.wasplord_locked = wasplordLocked();
  frames.wasplord_plate = wasplordPlate();
  return frames;
}
/** Where his eyes are in the rimmed 26x26 frame (the glow sits here): the visor's hot centre. */
export const WASP_EYE = { x: 21.5, y: 9.5 };

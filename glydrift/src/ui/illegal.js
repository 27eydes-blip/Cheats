// The ILLEGAL LEGENDARY look, shared by the shop, the Heroes screen and the locker: a red
// warning-tape border (black / red diagonal stripes) and a glitchy "ILLEGAL" stamp. Plain
// Graphics and Text only (no shaders); the stamp's glitch is a sideways slip of its colour
// copies now and then, never a flash (and it holds still with Reduce Flashing).
import { PIXEL_FONT, VIEW } from "../config.js";
import { reduceFlashing } from "../effects/ScreenFlash.js";

export const ILLEGAL_RED = 0xff1a2a;
/** On his shop card: his runs go on the ILLEGAL leaderboard only. */
export const ILLEGAL_BOARD_NOTE = "Illegal leaderboard only.";
/** Shown the first time someone flies him. */
export const ILLEGAL_FIRST_PLAY = ["Wasp Lord is ILLEGAL —", "his scores go on the Illegal leaderboard."];
const TAPE_DARK = 0x0a0204;

/** Is this hero (or rarity key) the ILLEGAL LEGENDARY tier? */
export const isIllegal = (r) => (typeof r === "string" ? r : r?.rarity) === "illegal";

/** A band of warning tape: black with red diagonal stripes, filling (x, y, w, h). */
export function tapeBand(g, x, y, w, h, { stripe = 14, col = ILLEGAL_RED, alpha = 1 } = {}) {
  g.fillStyle(TAPE_DARK, alpha).fillRect(x, y, w, h);
  g.fillStyle(col, alpha);
  // parallelograms leaning right, clipped to the band by hand (Graphics has no clip)
  for (let sx = x - h; sx < x + w; sx += stripe * 2) {
    const pts = [
      { x: sx, y: y + h },
      { x: sx + stripe, y: y + h },
      { x: sx + stripe + h, y },
      { x: sx + h, y },
    ].map((p) => ({ x: Math.max(x, Math.min(x + w, p.x)), y: p.y }));
    g.fillPoints(pts, true);
  }
}

/**
 * Warning tape round the inside of a (x, y, w, h) frame: four bands of `band` px, the corners
 * left dark so the stripes meet cleanly.
 */
export function warningTape(g, x, y, w, h, band = 10, opts = {}) {
  tapeBand(g, x, y, w, band, opts);
  tapeBand(g, x, y + h - band, w, band, opts);
  tapeBand(g, x, y + band, band, h - band * 2, { ...opts, stripe: opts.stripe ?? 14 });
  tapeBand(g, x + w - band, y + band, band, h - band * 2, { ...opts, stripe: opts.stripe ?? 14 });
}

/**
 * The glitchy "ILLEGAL" stamp: red block letters in a red box, with cyan and red copies slipped
 * sideways (an RGB split). Call stamp.glitch(time) every frame to make it twitch.
 */
export function illegalStamp(scene, x, y, size = 22, { angle = -10, text = "ILLEGAL" } = {}) {
  const c = scene.add.container(x, y).setAngle(angle);
  c.name = "illegalStamp";
  const style = (color) => ({
    fontFamily: PIXEL_FONT,
    fontSize: `${size}px`,
    fontStyle: "700",
    color,
    resolution: VIEW.Z,
  });
  const cyan = scene.add.text(0, 0, text, style("#30e8ff")).setOrigin(0.5).setAlpha(0.7);
  const red = scene.add.text(0, 0, text, style("#ff1a2a")).setOrigin(0.5).setAlpha(0.8);
  const main = scene.add
    .text(0, 0, text, { ...style("#ffffff"), stroke: "#ff1a2a", strokeThickness: Math.max(3, Math.round(size / 6)) })
    .setOrigin(0.5);
  const w = main.width + size * 0.8;
  const h = main.height + size * 0.3;
  const box = scene.add.graphics();
  box.fillStyle(0x14020a, 0.92).fillRect(-w / 2, -h / 2, w, h);
  box.lineStyle(Math.max(2, Math.round(size / 8)), ILLEGAL_RED, 1).strokeRect(-w / 2, -h / 2, w, h);
  c.add([box, cyan, red, main]);
  c.setSize(w, h);
  const off = Math.max(1, Math.round(size / 10));
  cyan.x = off;
  red.x = -off;
  /** The twitch: every ~1.7 s the colour copies jump apart and the letters slip, for a frame or two. */
  c.glitch = (t) => {
    if (reduceFlashing()) {
      cyan.x = off;
      red.x = -off;
      main.x = 0;
      return;
    }
    const on = t % 1.7 < 0.09 || (t + 0.6) % 2.9 < 0.05;
    cyan.x = on ? off * 3 : off;
    red.x = on ? -off * 3 : -off;
    main.x = on ? (Math.floor(t * 60) % 2 ? off : -off) : 0;
  };
  return c;
}

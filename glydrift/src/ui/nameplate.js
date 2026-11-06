// A player's name as it appears on the leaderboard, home, game over and the profile — with the
// Season 1 Drift Pass+ extras: the animated GOLD NAME (a gold gradient with a soft shine that
// breathes across it) and the forever SEASON 1 BADGE (a small crimson crest beside the name).
// Built from a couple of text objects and one tween (no per-frame redraws), so rows of them
// cost nothing. Reduce Flashing: the shine breathes slowly and stays dim.
import Phaser from "phaser";
import { FONT, VIEW } from "../config.js";
import { reduceFlashing } from "../effects/ScreenFlash.js";

const GOLD_TOP = 0xfff6c0;
const GOLD_BOT = 0xe0a020;

/**
 * @param opts { size, ox (0 left · 0.5 centre · 1 right), color (CSS, plain names), gold, badge,
 *               font, stroke }
 * @returns a Container; `.nameWidth` is the drawn width of the name (without the badge)
 */
export function nameText(scene, x, y, name, opts = {}) {
  const size = opts.size || 18;
  const ox = opts.ox ?? 0;
  const c = scene.add.container(x, y);
  const style = {
    fontFamily: opts.font || FONT,
    fontSize: `${size}px`,
    fontStyle: "700",
    color: opts.gold ? "#ffffff" : opts.color || "#ffffff",
    resolution: VIEW.Z,
    ...(opts.stroke ? { stroke: opts.stroke, strokeThickness: Math.max(2, Math.round(size / 7)) } : {}),
  };
  const t = scene.add.text(0, 0, name, style).setOrigin(ox, 0.5);
  c.add(t);
  c.nameWidth = t.width;
  if (opts.gold) {
    t.setTint(GOLD_TOP, GOLD_TOP, GOLD_BOT, GOLD_BOT);
    // a soft white copy on top that breathes: the "animated gold"
    const shine = scene.add
      .text(0, 0, name, { ...style, stroke: undefined, strokeThickness: 0 })
      .setOrigin(ox, 0.5)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);
    c.add(shine);
    const calm = reduceFlashing();
    const tw = scene.tweens.add({
      targets: shine,
      alpha: calm ? 0.18 : 0.55,
      duration: calm ? 1800 : 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      delay: Math.random() * 600,
    });
    c.once("destroy", () => tw.remove());
  }
  if (opts.badge) {
    // the badge sits just after the name (or before it, for right-aligned names)
    const k = size / 14;
    const bx = ox === 1 ? -t.width - 14 * k : ox === 0.5 ? t.width / 2 + 14 * k : t.width + 14 * k;
    c.add(seasonBadge(scene, bx, 0, k));
  }
  return c;
}

/** The forever Season 1 badge (a crimson crest with "S1" in gold). */
export function seasonBadge(scene, x, y, k = 1) {
  const im = scene.add.image(x, y, "cosm", "icon_badge_pp_s1");
  return im.setScale((20 * k) / Math.max(1, im.height)); // ~20 px tall at k = 1 (a 14 px name)
}

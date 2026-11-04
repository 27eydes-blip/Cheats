// Draw a title (titles.js). Plain titles are a single coloured line; the Drift Pass+ ones are
// animated: SHIMMER (a bright band sweeps across), GLOW (a soft halo breathes) and SHIFT (the
// colour cycles through the neon spectrum). Built from tints and alpha only (no per-frame
// text re-rendering), so they cost nothing.
import Phaser from "phaser";
import { FONT, VIEW } from "../config.js";
import { getTitle } from "../data/titles.js";

const hexNum = (c) => parseInt(String(c).replace("#", ""), 16);

/**
 * @param id title id (or a title object)
 * @param opts { size, ox (0 left / 0.5 centre / 1 right), alpha }
 * @returns a Container (empty when there's no title)
 */
export function titleText(scene, x, y, id, opts = {}) {
  const t = typeof id === "object" ? id : getTitle(id);
  const c = scene.add.container(x, y);
  if (!t) return c;
  // animations stop with the title (leaderboard rows are rebuilt on every refresh)
  const tw = [];
  const add = (cfg) => tw.push(scene.tweens.add(cfg));
  c.once("destroy", () => tw.forEach((x) => x.remove()));
  const size = opts.size || 14;
  const ox = opts.ox ?? 0.5;
  const make = (color) =>
    scene.add
      .text(0, 0, t.name.toUpperCase(), {
        fontFamily: FONT,
        fontSize: `${size}px`,
        fontStyle: "700",
        color,
        resolution: VIEW.Z,
      })
      .setOrigin(ox, 0.5)
      .setLetterSpacing(2);
  const col = hexNum(t.color);
  if (t.style === "glow") {
    // a soft copy behind that breathes
    const halo = make(t.color).setAlpha(0.55);
    halo.setShadow(0, 0, t.color, 10 * VIEW.Z, true, true);
    const main = make("#ffffff").setTint(0xffffff, 0xffffff, col, col);
    c.add([halo, main]);
    add({
      targets: halo,
      alpha: 0.12,
      scale: 1.08,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  } else if (t.style === "shimmer") {
    // the base colour with a white band running across it (tinting the corners in turn)
    const main = make("#ffffff").setTint(col);
    main.setShadow(0, 0, t.color, 6 * VIEW.Z, true, true);
    c.add(main);
    const k = { v: 0 };
    add({
      targets: k,
      v: 1,
      duration: 1600,
      repeat: -1,
      onUpdate: () => {
        const band = (p) => (Math.abs(k.v * 2.4 - 0.7 - p) < 0.35 ? 0xffffff : col);
        main.setTint(band(0), band(1), band(0), band(1));
      },
    });
  } else if (t.style === "shift") {
    // the colour cycles through the neon spectrum
    const main = make("#ffffff");
    main.setShadow(0, 0, "#ffffff", 6 * VIEW.Z, true, true);
    c.add(main);
    const k = { h: 0 };
    add({
      targets: k,
      h: 1,
      duration: 3200,
      repeat: -1,
      onUpdate: () => {
        const a = Phaser.Display.Color.HSVToRGB(k.h, 0.65, 1).color;
        const b = Phaser.Display.Color.HSVToRGB((k.h + 0.25) % 1, 0.65, 1).color;
        main.setTint(a, b, a, b);
      },
    });
  } else {
    c.add(make(t.color));
  }
  if (opts.alpha != null) c.setAlpha(opts.alpha);
  return c;
}

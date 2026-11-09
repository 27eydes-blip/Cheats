// Draw a title (titles.js). Plain titles are a single coloured line; the Drift Pass+ ones are
// animated: SHIMMER (a bright band sweeps across), GLOW (a soft halo breathes) and SHIFT (the
// colour cycles through the neon spectrum). Built from tints and alpha only (no per-frame
// text re-rendering), so they cost nothing. ALL MIGHTY (the world's #1) is the MIGHTY style:
// a gold gradient with a white shine sweeping across, a breathing gold halo and two twinkling
// sparkles; with Reduce Flashing it is a still gold gradient with a slow, dim halo.
import Phaser from "phaser";
import { FONT, VIEW } from "../config.js";
import { getTitle } from "../data/titles.js";
import { reduceFlashing } from "../effects/ScreenFlash.js";
import { Save } from "../data/save.js";

const hexNum = (c) => parseInt(String(c).replace("#", ""), 16);

/**
 * @param id title id (or a title object)
 * @param opts { size, ox (0 left / 0.5 centre / 1 right), alpha }
 * @returns a Container (empty when there's no title)
 */
export function titleText(scene, x, y, id, opts = {}) {
  const t = id && typeof id === "object" ? id : getTitle(id);
  const c = scene.add.container(x, y);
  c.lineWidth = 0;
  if (!t) return c;
  c.setName(`title:${t.id}`);
  // animations stop with the title (leaderboard rows are rebuilt on every refresh)
  const tw = [];
  const add = (cfg) => tw.push(scene.tweens.add(cfg));
  c.once("destroy", () => tw.forEach((x) => x.remove()));
  // never under 15 (~8 pt on a phone): titles under names were 11–12, unreadable on small iPhones
  const size = Math.max(15, opts.size || 15);
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
  if (t.style === "mighty") {
    mighty(scene, c, make, add, t, ox);
  } else if (t.style === "glow") {
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
  c.lineWidth ||= c.list[c.list.length - 1]?.width || 0;
  if (opts.alpha != null) c.setAlpha(opts.alpha);
  return c;
}

const MIGHTY_TOP = 0xfff3b0;
const MIGHTY_BOT = 0xe09a12;

/** ALL MIGHTY: gold gradient + sweeping shine + gold halo + sparkles (calm with Reduce Flashing). */
function mighty(scene, c, make, add, t, ox) {
  const calm = reduceFlashing();
  const low = !!Save.data.settings?.lowGfx;
  const halo = make(t.color).setAlpha(calm ? 0.3 : 0.5);
  if (!low) halo.setShadow(0, 0, "#ffb020", 12 * VIEW.Z, true, true);
  const main = make("#ffffff").setTint(MIGHTY_TOP, MIGHTY_TOP, MIGHTY_BOT, MIGHTY_BOT);
  main.setShadow(0, 2 * VIEW.Z, "#5a3200", 0, false, true);
  c.add([halo, main]);
  c.lineWidth = main.width;
  add({
    targets: halo,
    alpha: calm ? 0.18 : 0.1,
    scale: calm ? 1.03 : 1.1,
    duration: calm ? 2200 : 1000,
    yoyo: true,
    repeat: -1,
    ease: "Sine.easeInOut",
  });
  if (calm) return; // Reduce Flashing: no moving shine, no twinkles
  // the shine: a white band running across the gold (corner tints, like SHIMMER)
  const k = { v: 0 };
  add({
    targets: k,
    v: 1,
    duration: 1900,
    repeat: -1,
    repeatDelay: 500,
    onUpdate: () => {
      const on = (p) => Math.abs(k.v * 2.4 - 0.7 - p) < 0.35;
      const top = (p) => (on(p) ? 0xffffff : MIGHTY_TOP);
      const bot = (p) => (on(p) ? 0xfff3b0 : MIGHTY_BOT);
      main.setTint(top(0), top(1), bot(0), bot(1));
    },
  });
  if (low) return;
  // two little four-point sparkles at the ends that twinkle in turn
  const w = main.width;
  const h = main.height;
  for (const [i, sx] of [
    [0, -w * ox - 12],
    [1, w * (1 - ox) + 12],
  ]) {
    const g = scene.add.graphics({ x: sx, y: (i ? 1 : -1) * h * 0.22 });
    g.fillStyle(0xfff6c0, 1);
    g.fillTriangle(-2, 0, 2, 0, 0, -8).fillTriangle(-2, 0, 2, 0, 0, 8);
    g.fillTriangle(0, -2, 0, 2, -8, 0).fillTriangle(0, -2, 0, 2, 8, 0);
    g.setScale(0.2).setAlpha(0);
    c.add(g);
    add({
      targets: g,
      scale: 0.9,
      alpha: 1,
      duration: 420,
      yoyo: true,
      repeat: -1,
      repeatDelay: 1400,
      delay: 300 + i * 900,
      ease: "Sine.easeOut",
    });
  }
}

/**
 * The FORMER ALL MIGHTY badge: a small gold crown and the words, in a muted gold (it's a
 * memory, not the live title, so it doesn't animate). `.lineWidth` is its drawn width.
 */
export function formerBadge(scene, x, y, opts = {}) {
  const size = Math.max(12, opts.size || 13);
  const ox = opts.ox ?? 0;
  const c = scene.add.container(x, y).setName("formerBadge");
  const k = size / 13;
  const crown = scene.add.graphics();
  const pts = [
    { x: -9, y: 5 },
    { x: -9, y: -3 },
    { x: -4.5, y: 1 },
    { x: 0, y: -6 },
    { x: 4.5, y: 1 },
    { x: 9, y: -3 },
    { x: 9, y: 5 },
  ].map((p) => ({ x: p.x * k, y: p.y * k }));
  crown.fillStyle(0xd8a838, 1).fillPoints(pts, true);
  crown.lineStyle(1.5, 0x5a3a00, 1).strokePoints(pts, true);
  const txt = scene.add
    .text(12 * k, 0, "FORMER ALL MIGHTY", {
      fontFamily: FONT,
      fontSize: `${size}px`,
      fontStyle: "700",
      color: "#d8b25a",
      resolution: VIEW.Z,
    })
    .setOrigin(0, 0.5)
    .setLetterSpacing(1);
  crown.x = 9 * k;
  txt.x = 22 * k;
  c.add([crown, txt]);
  const w = 22 * k + txt.width;
  for (const o of c.list) o.x -= w * ox;
  c.lineWidth = w;
  return c;
}

/**
 * A title with the Former All Mighty badge after it (either can be missing), laid out as one
 * line. opts: { size, ox, alpha, former, badgeSize }.
 */
export function titleLine(scene, x, y, id, opts = {}) {
  const c = scene.add.container(x, y);
  const ox = opts.ox ?? 0.5;
  const parts = [];
  const tt = titleText(scene, 0, 0, id, { size: opts.size, ox: 0 });
  if (tt.list.length) parts.push(tt);
  else tt.destroy();
  if (opts.former) parts.push(formerBadge(scene, 0, 0, { size: opts.badgeSize || 12, ox: 0 }));
  const gap = 14;
  const total = parts.reduce((a, p) => a + p.lineWidth, 0) + gap * Math.max(0, parts.length - 1);
  let px = -total * ox;
  for (const p of parts) {
    p.x = px;
    px += p.lineWidth + gap;
    c.add(p);
  }
  c.lineWidth = total;
  if (opts.alpha != null) c.setAlpha(opts.alpha);
  return c;
}

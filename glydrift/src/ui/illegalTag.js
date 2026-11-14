// The small red "ILLEGAL" tag with a wasp icon, shown next to every score set with an ILLEGAL
// LEGENDARY hero (WASP LORD): leaderboard podium, list rows, your own row, game over and the
// share card. It comes from the score's stored `character`, so every device shows it. Drawn
// with Phaser graphics + one text (crisp at any zoom); the share card uses the canvas twin.
import { FONT, VIEW } from "../config.js";
import { getCharacter } from "../player/characterDefs.js";

/** Was this hero id (a score row's `character`) an ILLEGAL LEGENDARY hero? */
export function isIllegalHero(id) {
  if (!id) return false;
  const def = getCharacter(id);
  return def.id === id && def.rarity === "illegal";
}

// the wasp, 9 × 6 art pixels: w wings, k black, y yellow stripes, r his red eye (head right)
const WASP = [
  "...ww.ww.",
  "...wwwww.",
  ".kykykkk.",
  "kykykkkrk",
  ".kykykkk.",
  "..k...k..",
];
const COL = { w: 0xe6f4ff, k: 0x0a0a0e, y: 0xffd23f, r: 0xff1a2a };
const RED = 0xff1a2a;

/** Draw the wasp into a Graphics at (x, y) = its top-left, `u` px per art pixel. */
function drawWasp(g, x, y, u) {
  WASP.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      if (c === ".") continue;
      g.fillStyle(COL[c], c === "w" ? 0.9 : 1).fillRect(x + i * u, y + j * u, u, u);
    }
  });
}

/**
 * The tag as a container. (x, y) is its left edge (ox 0) or centre (ox 0.5), vertically centred.
 * `k` scales it (1 = 20 px tall). Its full width is `tag.tagWidth` (unscaled).
 */
export function illegalTag(scene, x, y, { ox = 0, k = 1 } = {}) {
  const c = scene.add.container(x, y).setName("illegalTag");
  const u = 2;
  const H = 20;
  const t = scene.add
    .text(0, 0, "ILLEGAL", {
      fontFamily: FONT,
      fontSize: "12px",
      fontStyle: "900",
      color: "#ffffff",
      stroke: "#3a0006",
      strokeThickness: 2,
      resolution: VIEW.Z * 2, // tiny text: render it sharper
    })
    .setOrigin(0, 0.5);
  const waspW = WASP[0].length * u;
  const w = Math.ceil(5 + waspW + 4 + t.width + 6);
  const x0 = -w * ox;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.85).fillRoundedRect(x0 - 1, -H / 2 - 1, w + 2, H + 2, 5);
  g.fillStyle(RED, 1).fillRoundedRect(x0, -H / 2, w, H, 4);
  g.fillStyle(0xff8a8a, 0.55).fillRect(x0 + 4, -H / 2 + 2, w - 8, 2); // a little shine
  drawWasp(g, x0 + 5, -(WASP.length * u) / 2, u);
  t.setPosition(x0 + 5 + waspW + 4, 0);
  c.add([g, t]);
  c.tagWidth = w;
  c.setScale(k);
  return c;
}

/** The canvas twin for the share card: (x, y) = centre, `k` scale (1 = 20 px tall). */
export function drawIllegalTagCanvas(ctx, x, y, k = 1) {
  ctx.save();
  ctx.font = `900 ${12 * k}px ${FONT}`;
  const tw = ctx.measureText("ILLEGAL").width;
  const u = 2 * k;
  const waspW = WASP[0].length * u;
  const w = 5 * k + waspW + 4 * k + tw + 6 * k;
  const h = 20 * k;
  const x0 = x - w / 2;
  const y0 = y - h / 2;
  const css = (c) => `#${c.toString(16).padStart(6, "0")}`;
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  ctx.beginPath();
  ctx.roundRect?.(x0 - k, y0 - k, w + 2 * k, h + 2 * k, 5 * k);
  ctx.fill();
  ctx.fillStyle = css(RED);
  ctx.beginPath();
  ctx.roundRect?.(x0, y0, w, h, 4 * k);
  ctx.fill();
  const wy = y - (WASP.length * u) / 2;
  WASP.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      if (c === ".") continue;
      ctx.fillStyle = css(COL[c]);
      ctx.fillRect(Math.round(x0 + 5 * k + i * u), Math.round(wy + j * u), Math.ceil(u), Math.ceil(u));
    }
  });
  ctx.fillStyle = "#ffffff";
  ctx.shadowBlur = 0;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("ILLEGAL", x0 + 5 * k + waspW + 4 * k, y + k);
  ctx.restore();
}

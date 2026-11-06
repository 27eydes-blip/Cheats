// A level's name as one line: "LEVEL 7: UPSIDE DOWN". Boss levels are red with a skull icon.
// The line shrinks to fit maxW, so long names never run off a small phone.
import { VIEW } from "../config.js";
import { ensureMapArt } from "../pixel/mapArt.js";
import { plainText } from "./ui.js";

export const BOSS_RED = "#ff3a4a";
export const BOSS_RED_HEX = 0xff3a4a;

/** Shrink a display object so it is at most maxW wide (never grows it). */
export function fitWidth(obj, maxW) {
  const w = obj.width * (obj.scaleX || 1);
  if (w > maxW) obj.setScale((obj.scaleX || 1) * (maxW / w));
  return obj;
}

/**
 * @param def a level ({ n, name, boss })
 * @param opts { maxW, color, upper (true), prefix (true: "LEVEL n: "), font }
 */
export function levelNameLine(scene, x, y, def, size, opts = {}) {
  ensureMapArt(scene);
  const { maxW = VIEW.W - 80, color = "#ffffff", upper = true, prefix = true } = opts;
  const c = scene.add.container(x, y);
  let label = prefix ? `Level ${def.n}: ${def.name}` : def.name;
  if (upper) label = label.toUpperCase();
  const t = plainText(scene, 0, 0, label, size, def.boss ? BOSS_RED : color, {
    font: opts.font,
  });
  let iconW = 0;
  let icon = null;
  if (def.boss) {
    icon = scene.add.image(0, 0, "lvmap", "skull");
    icon.setScale((size * 1.1) / icon.height).setTint(BOSS_RED_HEX);
    iconW = icon.displayWidth + size * 0.4;
  }
  const total = iconW + t.width;
  if (icon) icon.x = -total / 2 + icon.displayWidth / 2;
  t.x = -total / 2 + iconW + t.width / 2;
  c.add(icon ? [icon, t] : [t]);
  c.text = t;
  c.lineWidth = total;
  if (total > maxW) c.setScale(maxW / total);
  return c;
}

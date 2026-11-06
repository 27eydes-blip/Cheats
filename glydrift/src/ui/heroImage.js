// © 2026 Sam Eyde III. All rights reserved. Glydrift — see LICENSE. Not open source.
// A hero portrait dressed in the player's shop cosmetics (skin tint, hat, set glow), for the
// static places a hero appears: results, leaderboard rows, the share card.
import Phaser from "phaser";
import { COLLECTIONS, Shop, SKINS } from "../data/cosmetics.js";
import { HAT_FIT } from "../pixel/cosmeticArt.js";
import { HEAD_ANCHORS, PORTRAIT_K } from "../pixel/common.js";
import { HI } from "../gfx/textures.js";
import { getCharacter } from "../player/characterDefs.js";
import { greyPortrait } from "../pixel/grayHero.js";

const PORTRAIT_SCALE = 13; // callers size portraits as if drawn at 13 px per art px

/**
 * @param scale the same scale you'd give the bare hero image (e.g. 0.5 / HI)
 * @param lo loadout ({ skin, hat, title }); defaults to the player's own
 * @returns a Container (add it to your own containers like an image)
 */
export function heroImage(scene, x, y, charId, scale, lo = Shop.loadout()) {
  const def = getCharacter(charId);
  const c = scene.add.container(x, y);
  const set = COLLECTIONS.find((s) => s.id === lo.title);
  const glowCol = (set && Shop.setComplete(set) ? set.glow : null) ?? SKINS[lo.skin]?.glow;
  if (glowCol) {
    const g = scene.add.image(0, 0, "glow").setBlendMode(Phaser.BlendModes.ADD).setTint(glowCol);
    g.setScale(scale * HI * 1.6).setAlpha(0.5);
    c.add(g);
  }
  const skin = SKINS[lo.skin];
  const img = scene.add
    .image(0, 0, skin ? greyPortrait(scene, def) : def.texture)
    .setScale(scale * PORTRAIT_K);
  if (skin) img.setTint(skin.tint);
  c.add(img);
  const fit = HAT_FIT[lo.hat];
  if (fit) {
    const a = HEAD_ANCHORS[def.id] || { x: 2, y: -8 };
    const k = PORTRAIT_SCALE * scale; // art px → screen px
    const hat = scene.add
      .image((a.x + fit.dx) * k, (a.y + fit.dy) * k, "cosm", fit.frame)
      .setOrigin(0.5, 1)
      .setScale((PORTRAIT_SCALE / 4) * scale); // atlas frames are 4 px per art px
    c.add(hat);
  }
  c.img = img;
  return c;
}

// Rebuild every texture after the GPU context comes back (systems/contextGuard.js).
//
// iPad Safari drops the WebGL context under memory pressure. Phaser restores it by uploading
// each texture's source canvas again, but iOS can wipe those 2D canvases in the same GPU reset:
// the game then came back with blank (invisible) hazards, hero and scenery that still collided.
// So nothing is trusted: every texture gets freshly drawn pixels.
//  - pixel art (launch set + every realm in memory): the builders run again, and each texture
//    gets its new canvas in place (px.canvasTexture in rebuild mode), so every object, tile
//    sprite and particle emitter keeps pointing at the same texture
//  - canvas textures (glows, particles, icons): drawn back, onto a new canvas, from the copy of
//    their pixels taken when they were drawn (refresh(), below)
//  - text: every Text redraws itself; tile sprites copy their tile from the new pixels
// Returns { rebuilt, missing }: `missing` = textures whose pixels couldn't be redrawn.
import Phaser from "phaser";
import { rebuild } from "../pixel/px.js";
import { rebuildPixelArt } from "../pixel/themes.js";

// Phaser's own textures (drawn by Phaser itself on restore)
const INTERNAL = new Set(["__DEFAULT", "__MISSING", "__WHITE", "__NORMAL", "__ERROR"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/;

function walk(list, fn) {
  for (const o of list) {
    fn(o);
    if (Array.isArray(o.list)) walk(o.list, fn);
  }
}

// Canvas textures the game draws itself (glows, light rays, particles, icons, grey heroes) all
// call refresh() once drawn: keep a copy of their pixels then, to draw them back from. They're
// small; Phaser's own auto-named canvases (Text, TileSprite) redraw themselves instead.
const SNAP_MAX = 1 << 20; // pixels
const refresh = Phaser.Textures.CanvasTexture.prototype.refresh;
Phaser.Textures.CanvasTexture.prototype.refresh = function () {
  const r = refresh.call(this);
  try {
    if (!UUID.test(this.key) && this.width * this.height <= SNAP_MAX)
      this.__snap = this.context.getImageData(0, 0, this.width, this.height);
  } catch {}
  return r;
};

/** A CanvasTexture drawn back onto a fresh canvas from its saved pixels. */
function redrawCanvasTexture(tex) {
  const img = tex.__snap;
  if (!img || img.width !== tex.width || img.height !== tex.height) return false;
  const c = document.createElement("canvas");
  c.width = tex.width;
  c.height = tex.height;
  const ctx = c.getContext("2d");
  if (!ctx) return false;
  ctx.putImageData(img, 0, 0);
  tex.canvas = c;
  tex.context = ctx;
  const src = tex.source[0];
  src.image = c;
  src.update();
  return true;
}

export function rebuildAllTextures(game) {
  const tm = game.textures;
  const scenes = game.scene.getScenes(false);
  // objects whose pixels are their own (Text, TileSprite display canvases): not textures to redraw
  const own = new Set();
  const texts = [];
  const tiles = [];
  for (const sc of scenes)
    walk(sc.sys.displayList?.list || [], (o) => {
      if (o.type === "Text") {
        texts.push(o);
        if (o.texture) own.add(o.texture.key);
      } else if (o.type === "TileSprite") {
        tiles.push(o);
        if (o.texture) own.add(o.texture.key);
      }
    });

  rebuild.on = true;
  rebuild.done.clear();
  try {
    rebuildPixelArt();
    for (const [key, fn] of rebuild.extra) if (tm.exists(key)) fn();
  } finally {
    rebuild.on = false;
  }
  const done = new Set(rebuild.done);
  const missing = [];
  for (const key of tm.getTextureKeys()) {
    if (INTERNAL.has(key) || own.has(key) || done.has(key)) continue;
    // (Phaser's auto-named canvases of Text / TileSprite objects not on screen: they redraw
    // themselves when next shown or changed)
    if (UUID.test(key)) continue;
    const tex = tm.get(key);
    if (tex instanceof Phaser.Textures.CanvasTexture && redrawCanvasTexture(tex)) done.add(key);
    else missing.push(key);
  }
  // text: draw every Text again (its own canvas) and upload it
  for (const t of texts) {
    try {
      t.dirty = true;
      t.updateText();
    } catch {}
  }
  // tile sprites: copy their tile again from the redrawn texture
  for (const ts of tiles) {
    try {
      ts.dirty = true;
      ts.updateTileTexture();
    } catch {}
  }
  return { rebuilt: done.size, texts: texts.length, tiles: tiles.length, missing };
}

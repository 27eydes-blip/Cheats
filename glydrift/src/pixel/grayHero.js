// Greyscale copies of hero art, made on demand, so shop colour skins (gold, chrome, shadow,
// neon, frozen) recolour any hero properly: tint × grey = that colour's shades, whereas tinting
// a blue bird gold would just turn it green.
import Phaser from "phaser";

function grey(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
    const v = Math.min(255, l * 1.2 + 28); // lift so tints read bright, not muddy
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
}

/** Texture key holding grey versions of the hero's animation frames (same frame names). */
export function greyAtlas(scene, def) {
  const key = `pxg_${def.id}`;
  if (scene.textures.exists(key)) return key;
  const frames = def.pixel.frames.map((n) => scene.textures.getFrame(def.pixel.atlas, n));
  const w = Math.max(...frames.map((f) => f.cutWidth));
  const h = Math.max(...frames.map((f) => f.cutHeight));
  const tex = scene.textures.createCanvas(key, w * frames.length, h);
  const ctx = tex.getContext();
  frames.forEach((f, i) => {
    ctx.drawImage(
      f.source.image,
      f.cutX,
      f.cutY,
      f.cutWidth,
      f.cutHeight,
      i * w,
      0,
      f.cutWidth,
      f.cutHeight,
    );
  });
  grey(ctx, w * frames.length, h);
  frames.forEach((f, i) => tex.add(def.pixel.frames[i], 0, i * w, 0, f.cutWidth, f.cutHeight));
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

/** Grey copy of the big hero portrait (hero_<id>). */
export function greyPortrait(scene, def) {
  const key = `herog_${def.id}`;
  if (scene.textures.exists(key)) return key;
  const src = scene.textures.get(def.texture).getSourceImage();
  const tex = scene.textures.createCanvas(key, src.width, src.height);
  const ctx = tex.getContext();
  ctx.drawImage(src, 0, 0);
  grey(ctx, src.width, src.height);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

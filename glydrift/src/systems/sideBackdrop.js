// Wide screens (iPad landscape, laptops): the portrait game sits centred in a frame and the
// space either side shows the current biome's own background, blurred and darkened, instead
// of black bars. Drawn into two tiny DOM canvases (crossfaded) behind the game canvas only
// when the biome changes, and blurred by CSS: costs nothing per frame.

const W = 96;
const H = 160;
let layers = null;
let front = 0;
let current = null;

function ensureLayers() {
  if (layers) return layers;
  const host = document.getElementById("side-bg");
  if (!host) return null;
  layers = [0, 1].map(() => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    host.appendChild(c);
    return c;
  });
  return layers;
}

const src = (textures, key) => {
  try {
    return textures.exists(key) ? textures.get(key).getSourceImage() : null;
  } catch {
    return null;
  }
};

/** Tile `img` across the strip [y, y+h) of the small canvas, keeping its aspect. */
function strip(ctx, img, y, h, flip = false) {
  if (!img?.width) return;
  const w = (img.width * h) / img.height;
  ctx.save();
  if (flip) {
    ctx.translate(0, y * 2 + h);
    ctx.scale(1, -1);
  }
  for (let x = -((w * 0.37) % w); x < W; x += w) ctx.drawImage(img, x, y, w, h);
  ctx.restore();
}

/** Show `theme` (a THEMES entry) beside the game. */
export function setSideTheme(textures, theme) {
  if (!theme || theme.id === current) return;
  const ls = ensureLayers();
  if (!ls) return;
  const sky = src(textures, theme.sky);
  if (!sky) return; // art not built yet; try again on the next change
  current = theme.id;
  const next = ls[1 - front];
  const ctx = next.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(sky, 0, 0, W, H);
  strip(ctx, src(textures, theme.far), H * 0.42, H * 0.36);
  strip(ctx, src(textures, theme.mid), H * 0.58, H * 0.32);
  strip(ctx, src(textures, theme.nearBot), H * 0.8, H * 0.2);
  strip(ctx, src(textures, theme.nearTop), 0, H * 0.16);
  next.style.opacity = "1";
  ls[front].style.opacity = "0";
  front = 1 - front;
}

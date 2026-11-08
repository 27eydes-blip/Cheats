// VoiceOver / screen readers: the game is drawn on one canvas, which a screen reader sees as a
// single image. This keeps an invisible DOM button over every on-screen game button, labelled
// with its text, so VoiceOver can find and read each one. The DOM buttons don't catch touches
// (pointer-events: none): a VoiceOver double-tap lands on the game button underneath, exactly
// like a finger.
const SKIP = new Set(["Backdrop"]);
let layer = null;
const pool = [];

function collect(game) {
  const out = [];
  for (const sc of game.scene.getScenes(true)) {
    if (SKIP.has(sc.sys.settings.key) || !sc.sys.settings.visible) continue;
    const cam = sc.cameras.main;
    const walk = (o, alpha) => {
      if (!o.visible || alpha * (o.alpha ?? 1) < 0.05) return;
      if (o.a11yLabel && o.input?.enabled !== false) {
        const b = o.getBounds();
        out.push({
          label: o.a11yLabel,
          x: (b.x - cam.scrollX) * cam.zoom,
          y: (b.y - cam.scrollY) * cam.zoom,
          w: b.width * cam.zoom,
          h: b.height * cam.zoom,
          off: o.enabled === false,
        });
      }
      for (const c of o.list || []) walk(c, alpha * (o.alpha ?? 1));
    };
    for (const o of sc.sys.displayList.list) walk(o, 1);
  }
  return out;
}

function sync(game) {
  if (!layer) return;
  let items;
  try {
    items = collect(game);
  } catch {
    return;
  }
  const canvas = game.canvas.getBoundingClientRect();
  const k = canvas.width / game.scale.width;
  items.forEach((it, i) => {
    let el = pool[i];
    if (!el) {
      el = document.createElement("div");
      el.setAttribute("role", "button");
      el.tabIndex = -1;
      layer.appendChild(el);
      pool.push(el);
    }
    if (el.getAttribute("aria-label") !== it.label) el.setAttribute("aria-label", it.label);
    el.setAttribute("aria-disabled", it.off ? "true" : "false");
    el.style.cssText = `position:fixed;left:${canvas.left + it.x * k}px;top:${canvas.top + it.y * k}px;width:${it.w * k}px;height:${it.h * k}px;pointer-events:none;`;
  });
  for (let i = items.length; i < pool.length; i++) pool[i].style.display = "none";
}

/** Start the label layer (a few updates a second: cheap, and screen readers don't need more). */
export function installA11y(game) {
  if (layer || typeof document === "undefined") return;
  layer = document.createElement("div");
  layer.id = "a11y";
  layer.setAttribute("aria-label", "Glydrift");
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:5;";
  document.body.appendChild(layer);
  setInterval(() => sync(game), 300);
}

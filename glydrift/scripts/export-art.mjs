#!/usr/bin/env node
// ART EXPORT (dev only): every sprite, realm layer and UI piece the game draws in code, saved as
// transparent PNGs for the App Store, marketing and future use. The game itself keeps drawing
// in code; this only reads the textures it built.
//
//   npm run build:test && node scripts/export-art.mjs [outDir=art-export]
//
// Output (pixel art at 1× = one art pixel per PNG pixel, plus 2× and 3× nearest-neighbour):
//   heroes/      every hero frame + big portraits          <name>@1x.png @2x @3x
//   sheets/      whole sprite sheets (atlases), as packed  <atlas>@1x.png …
//   effects/     coins, portals, particles, hazards, cosmetics and other launch art
//   realms/<id>/ each realm's layers (sky, far, mid, distant, near, walls, pillars, edges…)
//                as separate tileable PNGs, plus its sprite sheet frames
//   ui/          hologram panels and buttons (vector, drawn at 1×/2×/3×) + UI textures
//   logo/        the GLYDRIFT logo as the home screen draws it
// Textures that aren't pixel art (soft glows, gradients) are saved once at their own size.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, process.argv[2] || "art-export");
const PORT = 4391;

const server = spawn("node", ["tests/serve.mjs", "dist-test", String(PORT)], { cwd: ROOT, stdio: "ignore" });
const stop = () => server.kill();
process.on("exit", stop);

async function waitServer() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("test server didn't start (run `npm run build:test` first)");
}

// ---------------------------------------------------------------- in-page helpers
// (runs in the browser: returns [{ name, scale, files: { "1x": dataURL, … } }])
function pageExport({ keys, frames: wantFrames }) {
  const g = window.__glydrift;
  const tm = g.textures;
  const isPixel = (data, w, h, k) => {
    if (w % k || h % k) return false;
    for (let y = 0; y < h; y += k)
      for (let x = 0; x < w; x += k) {
        const o = (y * w + x) * 4;
        for (let j = 0; j < k; j++)
          for (let i = 0; i < k; i++) {
            const p = ((y + j) * w + x + i) * 4;
            if (data[p] !== data[o] || data[p + 1] !== data[o + 1] || data[p + 2] !== data[o + 2] || data[p + 3] !== data[o + 3])
              return false;
          }
      }
    return true;
  };
  const out = [];
  const grab = (img, sx, sy, w, h, name) => {
    if (!w || !h || w * h > 4096 * 4096) return;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    let empty = true;
    for (let i = 3; i < data.length; i += 4) if (data[i]) { empty = false; break; }
    if (empty) return;
    let k = 1;
    for (const cand of [5, 4, 3, 2]) if (isPixel(data, w, h, cand)) { k = cand; break; }
    const files = {};
    const at = (mul) => {
      const W = Math.round((w / k) * mul);
      const H = Math.round((h / k) * mul);
      const d = document.createElement("canvas");
      d.width = W;
      d.height = H;
      const x = d.getContext("2d");
      x.imageSmoothingEnabled = false;
      x.drawImage(c, 0, 0, W, H);
      return d.toDataURL("image/png");
    };
    if (k > 1) for (const m of [1, 2, 3]) files[`${m}x`] = at(m);
    else files.native = c.toDataURL("image/png");
    out.push({ name, scale: k, files });
  };
  for (const key of keys) {
    if (!tm.exists(key)) continue;
    const tex = tm.get(key);
    const img = tex.source[0]?.image;
    if (!img || !img.width) continue;
    const names = tex.getFrameNames();
    if (names.length && wantFrames) {
      for (const f of names) {
        const fr = tex.get(f);
        grab(img, fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight, `${key}/${f}`);
      }
      grab(img, 0, 0, img.width, img.height, `__sheet__/${key}`);
    } else grab(img, 0, 0, img.width, img.height, key);
  }
  return out;
}

// the UI kit: hologram panels / buttons drawn with the shared neon helpers at 1×, 2×, 3×
function pageUiKit() {
  const { Neon } = window.__glyExport;
  const N = Neon.NEON;
  const scene = window.__glydrift.scene.getScenes(true)[0];
  const kit = [
    ["panel_cyan", 240, 140, { rim: N.cyan, ticks: true }],
    ["panel_magenta", 240, 140, { rim: N.magenta, ticks: true }],
    ["panel_gold", 240, 140, { rim: N.gold, ticks: true }],
    ["panel_purple", 240, 140, { rim: N.purple }],
    ["card_common", 120, 160, { rim: 0xbfe9ff }],
    ["card_rare", 120, 160, { rim: 0x4aa8ff }],
    ["card_epic", 120, 160, { rim: 0xc77dff }],
    ["card_legendary", 120, 160, { rim: N.gold }],
    ["card_illegal", 120, 160, { rim: N.red, fill: 0x14040a }],
    ["button_play", 260, 72, { rim: N.green, fill: 0x062014 }],
    ["button_cyan", 200, 56, { rim: N.cyan }],
    ["button_magenta", 200, 56, { rim: N.magenta }],
    ["button_gold", 200, 56, { rim: N.gold }],
    ["tab_score", 140, 44, { rim: N.gold, cut: 10 }],
    ["tab_distance", 140, 44, { rim: N.cyan, cut: 10 }],
    ["tab_illegal", 140, 44, { rim: N.red, fill: 0x14040a, cut: 10 }],
  ];
  const out = [];
  for (const [name, w, h, opts] of kit)
    for (const m of [1, 2, 3]) {
      const pad = 12;
      const rt = scene.make.renderTexture({ width: (w + pad * 2) * m, height: (h + pad * 2) * m }, false);
      const gfx = scene.make.graphics({}, false);
      gfx.setScale(m);
      Neon.chamferPanel(gfx, pad, pad, w, h, { ...opts, rimW: 2 });
      rt.draw(gfx);
      gfx.destroy();
      out.push({ name, m, rt });
    }
  return Promise.all(
    out.map(
      ({ name, m, rt }) =>
        new Promise((res) =>
          rt.snapshot((img) => {
            const c = document.createElement("canvas");
            c.width = img.width;
            c.height = img.height;
            c.getContext("2d").drawImage(img, 0, 0);
            rt.destroy();
            res({ name, m, url: c.toDataURL("image/png") });
          }),
        ),
    ),
  );
}

// the logo: the home screen's GLYDRIFT text object (its own transparent canvas)
function pageLogo() {
  const g = window.__glydrift;
  const found = [];
  const walk = (list) => {
    for (const o of list) {
      if (o.type === "Text" && /^GLYDRIFT$/i.test(String(o.text).trim())) found.push(o);
      if (o.list) walk(o.list);
    }
  };
  for (const sc of g.scene.getScenes(true)) walk(sc.sys.displayList?.list || []);
  return found.map((t, i) => ({ name: `glydrift_logo${i ? "_" + i : ""}`, url: t.canvas.toDataURL("image/png") }));
}

// ---------------------------------------------------------------- write files
let count = 0;
function save(dir, name, ext, url) {
  const safe = name.replace(/[^a-zA-Z0-9_\-/]/g, "_");
  const path = join(OUT, dir, `${safe}${ext}.png`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(url.split(",")[1], "base64"));
  count++;
}
function saveItems(items, dirFor) {
  for (const it of items) {
    const dir = dirFor(it.name);
    const base = it.name.replace(/^__sheet__\//, "");
    if (it.name.startsWith("__sheet__/")) {
      for (const [k, url] of Object.entries(it.files)) save("sheets", base, k === "native" ? "" : `@${k}`, url);
      continue;
    }
    for (const [k, url] of Object.entries(it.files)) save(dir, base, k === "native" ? "" : `@${k}`, url);
  }
}

const HERO_ATLAS = "pxc";
const heroDir = (name) => (name.startsWith("hero_") || /^pxc\/(?!coin_|portal_)/.test(name) ? "heroes" : "effects");

async function main() {
  await waitServer();
  rmSync(OUT, { recursive: true, force: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  await page.goto(`http://localhost:${PORT}/?offline&noaudio`);
  await page.waitForFunction(() => window.__glydrift?.isBooted && window.__glyExport, null, { timeout: 60_000 });
  await page.waitForTimeout(2500);

  const realms = await page.evaluate(() => window.__glyExport.realms);
  // launch art: everything that isn't a realm's (realm keys start with "<id>_" or are "<id>")
  const bootKeys = await page.evaluate((realms) => {
    const keys = window.__glydrift.textures.getTextureKeys();
    return keys.filter((k) => !k.startsWith("__") && !realms.some((r) => k === r || k.startsWith(r + "_")));
  }, realms);
  const textKeys = new Set(
    await page.evaluate(() => {
      const s = new Set();
      const walk = (l) => { for (const o of l) { if (o.type === "Text" && o.texture) s.add(o.texture.key); if (o.list) walk(o.list); } };
      for (const sc of window.__glydrift.scene.getScenes(false)) walk(sc.sys.displayList?.list || []);
      return [...s];
    }),
  );
  const keep = bootKeys.filter((k) => !textKeys.has(k) && !/^[0-9a-f]{8}-/.test(k));
  for (let i = 0; i < keep.length; i += 20) {
    const items = await page.evaluate(pageExport, { keys: keep.slice(i, i + 20), frames: true });
    saveItems(items, (name) => (name.startsWith(HERO_ATLAS + "/") || name.startsWith("hero_") ? heroDir(name) : /^(ui|btn|panel|icon)/i.test(name) ? "ui" : "effects"));
  }
  console.log(`launch art: ${keep.length} textures`);

  // each realm: build its art, export, free it again (never more than 2 realms in memory here)
  for (const id of realms) {
    const keys = await page.evaluate((id) => {
      const E = window.__glyExport;
      const before = new Set(window.__glydrift.textures.getTextureKeys());
      E.ensureBiomeArt(id);
      return window.__glydrift.textures.getTextureKeys().filter((k) => k === id || k.startsWith(id + "_") || !before.has(k));
    }, id);
    const items = await page.evaluate(pageExport, { keys, frames: true });
    saveItems(items, () => `realms/${id}`);
    await page.evaluate((id) => window.__glyExport.releaseBiomeArt(id), id);
    console.log(`realm ${id}: ${keys.length} textures`);
  }

  // UI kit + logo
  const kit = await page.evaluate(pageUiKit);
  for (const k of kit) save("ui", k.name, `@${k.m}x`, k.url);
  const logos = await page.evaluate(pageLogo);
  for (const l of logos) save("logo", l.name, "", l.url);
  console.log(`ui kit: ${kit.length / 3} pieces, logo: ${logos.length}`);

  writeFileSync(
    join(OUT, "README.md"),
    `# Glydrift art export\n\nMade by \`scripts/export-art.mjs\` from the art the game draws in code (${new Date().toISOString().slice(0, 10)}).\n\n` +
      "- `heroes/`: every hero frame and portrait\n- `sheets/`: the packed sprite sheets\n- `effects/`: coins, portals, particles, hazards, cosmetics\n" +
      "- `realms/<id>/`: each realm's layers (sky, far, mid, distant, near, walls, pillars, edges) as separate tileable PNGs, and its sprite frames\n" +
      "- `ui/`: hologram panels, cards, buttons and tabs\n- `logo/`: the GLYDRIFT logo\n\n" +
      "Pixel art is saved at 1× (one art pixel per PNG pixel), 2× and 3× with hard (nearest-neighbour) edges. " +
      "Soft glows and other non-pixel textures are saved once at their own size.\n\nCreated by Sam Eyde III.\n",
  );
  await browser.close();
  console.log(`${count} files in ${OUT}`);
  stop();
}

main().catch((e) => {
  console.error(e);
  stop();
  process.exit(1);
});

// Tap a Drift Pass reward to see it in action before it's yours: heroes fly and flap, trails
// stream behind a hero, death effects play on a loop, victory poses strike, titles and the gold
// name animate, the badge sits by your name and the Abyss home theme opens its eyes.
// A modal over the current scene; it runs its own little stage and cleans up on close.
import { VIEW, NUM_FONT } from "../config.js";
import { Save } from "../data/save.js";
import { getCosmetic } from "../data/cosmetics.js";
import { getTitle } from "../data/titles.js";
import { getCharacter } from "../player/characterDefs.js";
import { CharacterRig } from "../player/CharacterRig.js";
import { Effects } from "../effects/Effects.js";
import { button, drawNeonRect, neonText, plainText } from "./ui.js";
import { titleText } from "./titleText.js";
import { nameText, seasonBadge } from "./nameplate.js";
import { Sfx } from "../audio/sfx.js";
import { TEST } from "../systems/testFlags.js";

const KIND_LABEL = {
  trail: "TRAIL",
  death: "DEATH EFFECT",
  pose: "VICTORY POSE · plays on a NEW BEST",
  theme: "HOME THEME · choose it in Settings",
  name: "GOLD NAME · on both leaderboards",
  badge: "FOREVER BADGE · stays after the season ends",
  skin: "SKIN",
  hat: "HAT",
  flap: "FLAP EFFECT",
  coin: "COIN SKIN",
};

/** Can this reward be previewed? */
export const previewable = (r) => !!(r && (r.hero || r.item || r.title));

/**
 * @param r a pass reward ({ hero } | { item } | { title })
 * @param opts { tier, plus, depth }
 * @returns { close() }
 */
export function openRewardPreview(scene, r, opts = {}) {
  if (!previewable(r)) return null;
  const W = VIEW.W;
  const H = scene.H || VIEW.H;
  const depth = opts.depth ?? 600;
  const lowGfx = !!Save.data.settings?.lowGfx;
  const c = scene.add.container(0, 0).setDepth(depth);
  const shade = scene.add.rectangle(W / 2, H / 2, W, H, 0x05010d, 0.82).setInteractive();
  c.add(shade);
  const pw = W - 48;
  const ph = Math.min(H - 120, 860);
  const py = H / 2 - ph / 2;
  const g = scene.add.graphics();
  drawNeonRect(g, 24, py, pw, ph, 28, 0xffd23f, { fill: 0x0b0520, fillAlpha: 0.98, width: 4 });
  c.add(g);
  // heading
  const item = r.item ? getCosmetic(r.item) : null;
  const hero = r.hero ? getCharacter(r.hero) : null;
  const title = r.title ? getTitle(r.title) : null;
  const name = hero
    ? `${hero.name}${hero.evolve ? ` · ${hero.title.replace("Evolving · ", "").toUpperCase()}` : ""}`
    : item
      ? item.name.toUpperCase()
      : title
        ? "ANIMATED TITLE"
        : "";
  c.add(neonText(scene, W / 2, py + 56, name, 30, 0xffd23f, { blur: 12 }));
  const sub = hero
    ? hero.evolve
      ? `EVOLVING HERO · form ${hero.evolve.stage} of 4`
      : "PASS HERO"
    : item
      ? KIND_LABEL[item.cat] || "ITEM"
      : "Glows under your name";
  c.add(plainText(scene, W / 2, py + 96, sub, 17, "#cfc6ff"));
  if (opts.plus)
    c.add(
      plainText(
        scene,
        W / 2,
        py + 124,
        `DRIFT PASS+ EXCLUSIVE${opts.tier ? ` · TIER ${opts.tier}` : ""}`,
        15,
        "#ff8a9a",
      ),
    );
  // ---- the stage
  const sx = W / 2;
  const sy = py + ph * 0.48;
  const fx = new Effects(scene, { lowGfx, depth: depth + 2 });
  let rig = null;
  let t = 0;
  let loopT = 0;
  const parts = [];
  const flyer = hero?.id || (getCharacter(Save.data.selected)?.id ?? "volt");
  const makeRig = (lo) => {
    rig?.destroy();
    rig = new CharacterRig(scene, getCharacter(flyer), fx, {
      x: sx,
      y: sy,
      lowGfx,
      depth: depth + 3,
      scale: 2.2,
      cosmetics: lo,
    });
  };
  const cat = item?.cat;
  if (hero) makeRig({});
  else if (cat === "trail" || cat === "death" || cat === "pose" || cat === "flap" || cat === "skin" || cat === "hat")
    makeRig({ [cat]: item.id });
  else if (title) {
    parts.push(titleText(scene, sx, sy, title, { size: 34 }));
  } else if (cat === "name" || cat === "badge") {
    const uname = Save.data.profile?.username || "DRIFTER";
    parts.push(
      nameText(scene, sx, sy - 20, uname, {
        size: 44,
        ox: 0.5,
        gold: cat === "name",
        badge: cat === "badge",
        font: NUM_FONT,
      }),
    );
    if (cat === "badge") parts.push(seasonBadge(scene, sx, sy + 110, 6));
  } else if (cat === "theme") {
    parts.push(...abyssMini(scene, sx, sy, pw - 80, ph * 0.5));
  }
  for (const p of parts) c.add(p);
  // the hint at the bottom
  const hint = hero
    ? hero.evolve
      ? "Same hitbox, speed and score as every hero. Each form stays yours to fly."
      : "Cosmetic only: same hitbox, speed and score as every hero."
    : cat === "pose"
      ? "Tap to play it again."
      : cat === "death"
        ? "Plays when your run ends."
        : "Cosmetic only. Never in the shop, pods, spins or daily deals.";
  c.add(plainText(scene, W / 2, py + ph - 150, hint, 16, "#bfb6e8", { wrap: pw - 80 }));
  const close = () => {
    if (!c.active) return;
    scene.events.off("update", tick);
    rig?.destroy();
    fx.destroy();
    c.destroy();
    opts.onClose?.();
  };
  const done = button(scene, W / 2, py + ph - 70, 280, 80, "CLOSE", {
    color: 0x39ff88,
    size: 26,
    onClick: () => {
      Sfx.ui();
      close();
    },
  });
  c.add(done);
  shade.on("pointerup", (p) => {
    if (p.worldY < py || p.worldY > py + ph) close();
    else if (rig && cat === "pose") rig.cosmeticPose(item.id);
  });
  // ---- animate
  const tick = (_time, delta) => {
    const dt = Math.min(delta / 1000, 1 / 20);
    t += dt;
    loopT += dt;
    if (!rig) return;
    if (cat === "death") {
      // fly a moment, end the run with the effect, come back
      if (!rig.dead && loopT > 1.2) rig.die();
      if (rig.dead && loopT > 3.2) {
        rig.reset(sx, sy);
        loopT = 0;
      }
    } else if (cat === "pose") {
      if (loopT > 2.4) {
        rig.cosmeticPose(item.id);
        loopT = 0;
      }
    } else if (loopT > 0.55) {
      rig.flap();
      loopT = 0;
    }
    if (!rig.dead) {
      rig.x = sx + Math.sin(t * 1.4) * (cat === "trail" ? 40 : 14);
      rig.y = sy + Math.sin(t * 2.2) * 26;
      rig.angle = Math.cos(t * 2.2) * 10;
    }
    // trails need the world to move under the hero
    rig.update(dt, cat === "trail" || cat === "flap" ? 380 : 120);
    fx.update(dt);
  };
  scene.events.on("update", tick);
  // test builds only: a handle for automated tests
  if (TEST.on && typeof window !== "undefined") window.__glyPreview = { fx, get rig() { return rig; }, close };
  c.setAlpha(0);
  scene.tweens.add({ targets: c, alpha: 1, duration: 200 });
  return { close, container: c };
}

/** A miniature of the Abyss home theme: dark, with eyes that blink slowly. */
function abyssMini(scene, x, y, w, h) {
  const out = [];
  const g = scene.add.graphics();
  g.fillStyle(0x05010a, 1).fillRoundedRect(x - w / 2, y - h / 2, w, h, 18);
  g.lineStyle(3, 0xc8102e, 1).strokeRoundedRect(x - w / 2, y - h / 2, w, h, 18);
  g.fillStyle(0x8a2a9a, 0.6);
  for (let i = 0; i < 18; i++)
    g.fillRect(x - w / 2 + 20 + ((i * 97) % (w - 40)), y - h / 2 + 16 + ((i * 53) % (h - 32)), 4, 4);
  out.push(g);
  out.push(plainText(scene, x, y, "GLYDRIFT", 40, "#3a2a5a"));
  const spots = [
    [-0.36, -0.22],
    [0.34, -0.1],
    [-0.28, 0.24],
    [0.4, 0.28],
  ];
  spots.forEach(([fx, fy], i) => {
    const e = scene.add.graphics({ x: x + fx * w, y: y + fy * h });
    e.fillStyle(0x2a0410, 1).fillRect(-20, -6, 40, 12).fillRect(-14, -10, 28, 20);
    e.fillStyle(0xf0e0e8, 1).fillRect(-17, -4, 34, 8).fillRect(-11, -7, 22, 14);
    e.fillStyle(0xc8102e, 1).fillRect(-6, -6, 12, 12);
    e.fillStyle(0x0a0206, 1).fillRect(-1.5, -5, 3, 10);
    scene.tweens.add({
      targets: e,
      scaleY: 0.08,
      duration: 350,
      yoyo: true,
      hold: 150,
      repeat: -1,
      repeatDelay: 2200 + i * 900,
      delay: i * 700,
      ease: "Sine.easeInOut",
    });
    out.push(e);
  });
  return out;
}

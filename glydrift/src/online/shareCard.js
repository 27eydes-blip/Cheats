// Auto-generated shareable result card (1080x1350 PNG) built with Canvas2D,
// shown in a DOM modal with Web Share / download fallbacks.
import { Shop, SKINS } from "../data/cosmetics.js";
import { HAT_FIT } from "../pixel/cosmeticArt.js";
import { HEAD_ANCHORS } from "../pixel/common.js";
import { greyPortrait } from "../pixel/grayHero.js";
import { BIOMES, biomeName } from "../biomes/biomes.js";
import { getCharacter } from "../player/characterDefs.js";
import { dailyNumber } from "../data/rng.js";
import { Save } from "../data/save.js";
import { Titles } from "../data/titles.js";

const css = (c) => `#${c.toString(16).padStart(6, "0")}`;
const FONT = '"Orbitron", "Avenir Next", system-ui, sans-serif';

export function renderShareCard(game, run) {
  const W = 1080;
  const H = 1350;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const c = cv.getContext("2d");
  const biome = BIOMES[run.biome % BIOMES.length];
  const ch = getCharacter(run.char);

  // sky
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, css(biome.sky[0]));
  g.addColorStop(0.55, css(biome.sky[1]));
  g.addColorStop(1, css(biome.sky[2]));
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  // nebula blobs
  let seed = Math.floor(run.score) + 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  c.globalCompositeOperation = "lighter";
  for (let i = 0; i < 9; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 200 + rnd() * 380;
    const rg = c.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `${css(biome.nebula[i % 2])}55`);
    rg.addColorStop(1, `${css(biome.nebula[i % 2])}00`);
    c.fillStyle = rg;
    c.fillRect(0, 0, W, H);
  }
  for (let i = 0; i < 220; i++) {
    c.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`;
    c.beginPath();
    c.arc(rnd() * W, rnd() * H, rnd() * 2.4 + 0.4, 0, 7);
    c.fill();
  }
  c.globalCompositeOperation = "source-over";

  // frame
  c.strokeStyle = css(biome.neon);
  c.lineWidth = 6;
  c.shadowColor = css(biome.neon);
  c.shadowBlur = 30;
  c.beginPath();
  c.roundRect(40, 40, W - 80, H - 80, 48);
  c.stroke();

  const glowText = (txt, x, y, size, color, weight = 900) => {
    c.font = `${weight} ${size}px ${FONT}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.shadowColor = color;
    c.shadowBlur = size * 0.5;
    c.fillStyle = "#fff";
    c.fillText(txt, x, y);
    c.shadowBlur = 0;
    c.lineWidth = Math.max(2, size / 20);
    c.strokeStyle = color;
    c.strokeText(txt, x, y);
    c.fillText(txt, x, y);
  };

  glowText("GLYDRIFT", W / 2, 150, 104, css(biome.neon));
  if (run.mode === "daily")
    glowText(
      `DAILY CHALLENGE #${dailyNumber()}`,
      W / 2,
      245,
      40,
      css(biome.accent),
      700,
    );
  // the player and their title
  const name = Save.data.profile?.username;
  const title = Titles.equipped();
  if (name)
    glowText(name, W / 2, run.mode === "daily" ? 296 : 262, 46, "#ffffff", 800);
  if (title)
    glowText(
      title.name.toUpperCase(),
      W / 2,
      run.mode === "daily" ? 338 : 306,
      30,
      title.color,
      700,
    );

  // character
  try {
    const tex = game.textures.get(ch.texture).getSourceImage();
    c.save();
    c.shadowColor = css(ch.color);
    c.shadowBlur = 80;
    const rg = c.createRadialGradient(W / 2, 520, 0, W / 2, 520, 260);
    rg.addColorStop(0, `${css(ch.color)}88`);
    rg.addColorStop(1, `${css(ch.color)}00`);
    c.fillStyle = rg;
    c.fillRect(0, 260, W, 520);
    // shop skin: tint the portrait (multiply, clipped to the sprite)
    const lo = Shop.loadout();
    const skin = SKINS[lo.skin];
    let art = tex;
    if (skin) {
      const grey = game.textures
        .get(greyPortrait(game.scene.scenes[0], ch))
        .getSourceImage();
      const off = document.createElement("canvas");
      off.width = tex.width;
      off.height = tex.height;
      const o = off.getContext("2d");
      o.drawImage(grey, 0, 0);
      o.globalCompositeOperation = "multiply";
      o.fillStyle = css(skin.tint);
      o.fillRect(0, 0, off.width, off.height);
      o.globalCompositeOperation = "destination-in";
      o.drawImage(grey, 0, 0);
      art = off;
    }
    c.imageSmoothingEnabled = false; // portraits are small pixel art: scale up crisp
    c.drawImage(art, W / 2 - 170, 350, 340, 340);
    c.restore();
    // shop hat on the head
    const fit = HAT_FIT[lo.hat];
    if (fit) {
      const a = HEAD_ANCHORS[ch.id] || { x: 2, y: -8 };
      const k = 340 / (a.w || 26); // art px → card px
      const fr = game.textures.getFrame("cosm", fit.frame);
      const hw = (fr.cutWidth / 4) * k;
      const hh = (fr.cutHeight / 4) * k;
      c.imageSmoothingEnabled = false;
      c.drawImage(
        fr.source.image,
        fr.cutX,
        fr.cutY,
        fr.cutWidth,
        fr.cutHeight,
        W / 2 + (a.x + fit.dx) * k - hw / 2,
        520 + (a.y + fit.dy) * k - hh,
        hw,
        hh,
      );
    }
  } catch {
    /* texture missing — skip */
  }

  glowText(`${Math.floor(run.score)}`, W / 2, 820, 190, css(biome.neon));
  c.font = `700 40px ${FONT}`;
  c.fillStyle = "rgba(255,255,255,0.8)";
  c.fillText("SCORE", W / 2, 930);

  // chips
  const chip = (txt, x, y, color) => {
    c.font = `700 34px ${FONT}`;
    const w = c.measureText(txt).width + 60;
    c.fillStyle = "rgba(5,0,15,0.6)";
    c.strokeStyle = color;
    c.lineWidth = 3;
    c.shadowColor = color;
    c.shadowBlur = 18;
    c.beginPath();
    c.roundRect(x - w / 2, y - 36, w, 72, 36);
    c.fill();
    c.stroke();
    c.shadowBlur = 0;
    c.fillStyle = "#fff";
    c.fillText(txt, x, y + 2);
  };
  chip(`${biomeName(run.biome)}`, W / 2, 1035, css(biome.accent));
  chip(`${Math.floor(run.distance)}m`, W / 2 - 250, 1135, css(biome.neon));
  chip(`${run.nearMiss} CLOSE`, W / 2, 1135, css(biome.neon));
  chip(`${ch.name}`, W / 2 + 250, 1135, css(ch.color));

  c.font = `700 32px ${FONT}`;
  c.fillStyle = "rgba(255,255,255,0.75)";
  c.fillText("CAN YOU DRIFT FURTHER?", W / 2, 1240);
  return cv;
}

let modalBound = false;

export function openShareModal(game, run) {
  const cv = renderShareCard(game, run);
  const modal = document.getElementById("share-modal");
  const img = modal.querySelector("img");
  const url = cv.toDataURL("image/png");
  img.src = url;
  modal.classList.add("open");
  const text =
    run.mode === "daily"
      ? `Glydrift Daily #${dailyNumber()}: ${Math.floor(run.score)} pts — can you beat it?`
      : `I scored ${Math.floor(run.score)} in Glydrift! Can you drift further?`;
  modal.dataset.text = text;
  if (!modalBound) {
    modalBound = true;
    // Phaser also listens on window for mouse/touch; keep modal taps from reaching the game
    for (const type of [
      "pointerdown",
      "pointerup",
      "mousedown",
      "mouseup",
      "touchstart",
      "touchend",
    ]) {
      modal.addEventListener(type, (e) => e.stopPropagation());
    }
    modal.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        const act = b.dataset.act;
        const src = modal.querySelector("img").src;
        if (act === "close") modal.classList.remove("open");
        if (act === "save") {
          const a = document.createElement("a");
          a.href = src;
          a.download = "glydrift-result.png";
          a.click();
        }
        if (act === "share") {
          try {
            const blob = await (await fetch(src)).blob();
            const file = new File([blob], "glydrift-result.png", {
              type: "image/png",
            });
            if (navigator.canShare?.({ files: [file] })) {
              await navigator.share({
                files: [file],
                text: modal.dataset.text,
              });
            } else if (navigator.share) {
              await navigator.share({ text: modal.dataset.text });
            } else {
              await navigator.clipboard?.writeText(modal.dataset.text);
              b.textContent = "COPIED";
              setTimeout(() => {
                b.textContent = "SHARE";
              }, 1400);
            }
          } catch {
            /* user cancelled */
          }
        }
      });
    });
  }
}

export function closeShareModal() {
  document.getElementById("share-modal")?.classList.remove("open");
}

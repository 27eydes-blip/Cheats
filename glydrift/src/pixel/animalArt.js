// © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE. Not open source.
// The 30 animal heroes: shared drawing helpers, their particle sprites, and the "pxa" atlas.
// Every animal is an original 24x24 sprite facing right with a bold dark outline (the white
// rim every hero has is added by rim()). Frames: 0/1 idle loop (1 is the portrait), 2 flap,
// 3 an optional special pose (yawn, fanned tail…).
import { HEAD_ANCHORS, headAnchor, PORTRAIT_SCALE, rim } from "./common.js";
import { addAtlas, addTexture, PixelCanvas } from "./px.js";
import { PEACEFUL_DRAW } from "./animalsPeaceful.js";
import { PRISM_DRAW } from "./animalsPrism.js";
import { ABYSS_DRAW } from "./animalsAbyss.js";
import { XMAS_DRAW } from "./animalsXmas.js";
import { PASS_DRAW, PASS_FRAMES, PASS_TEX, passParticles } from "./passHeroes.js";
import { canvasTexture } from "./px.js";
import Phaser from "phaser";

export const ANIMAL_DRAW = { ...PEACEFUL_DRAW, ...PRISM_DRAW, ...ABYSS_DRAW, ...XMAS_DRAW };

/** Frames each animal has (most have 3; a 4th special pose where the def asks for it). */
export const ANIMAL_FRAMES = (id) => ANIMAL_DRAW[id]?.frames ?? 3;

// ------------------------------------------------------------------ particle sprites
function petal() {
  const pc = new PixelCanvas(5, 4);
  pc.rect(1, 0, 3, 1, 0xffc8e0).rect(0, 1, 5, 2, 0xff9ac8).rect(1, 3, 2, 1, 0xff7ab0);
  pc.set(1, 1, 0xffe8f4);
  return pc;
}
function zzz() {
  const pc = new PixelCanvas(5, 5);
  pc.hline(0, 4, 0, 0xffffff).set(3, 1, 0xffffff).set(2, 2, 0xffffff).set(1, 3, 0xffffff);
  pc.hline(0, 4, 4, 0xffffff);
  return pc;
}
function yarn() {
  const pc = new PixelCanvas(6, 6);
  pc.circle(2.5, 2.5, 2.6, 0xe0304a);
  pc.line(1, 1, 4, 4, 0xff7a8a).line(1, 3, 3, 1, 0xff7a8a);
  pc.set(5, 5, 0xe0304a);
  return pc.outline(0x4a0a14, 1, false);
}
function acorn() {
  const pc = new PixelCanvas(5, 6);
  pc.rect(0, 0, 5, 2, 0x7a4a1a).set(2, 0, 0x4a2a0a);
  pc.ellipse(2, 3.5, 2, 2.2, 0xc8823a);
  pc.set(1, 3, 0xe8a85a);
  return pc;
}
function marsh() {
  const pc = new PixelCanvas(4, 4);
  pc.rect(0, 0, 4, 4, 0xffffff).set(3, 3, 0xe8dcd0).set(0, 0, 0xfff8f0);
  return pc;
}
function berry() {
  const pc = new PixelCanvas(3, 3);
  pc.rect(0, 0, 3, 3, 0xe0203a).set(0, 0, 0xff7a8a).set(2, 2, 0x9a0a1a);
  return pc;
}
function bubble() {
  const pc = new PixelCanvas(6, 6);
  pc.circle(2.5, 2.5, 2.6, 0xffffff);
  pc.circle(2.5, 2.5, 1.5, null);
  for (let y = 1; y < 5; y++) for (let x = 1; x < 5; x++) pc.d[y * 6 + x] = null;
  pc.set(1, 1, 0xffffff);
  return pc;
}
function bone() {
  const pc = new PixelCanvas(7, 3);
  pc.hline(1, 5, 1, 0xf0ead8).set(0, 0, 0xf0ead8).set(0, 2, 0xf0ead8);
  pc.set(6, 0, 0xf0ead8).set(6, 2, 0xf0ead8);
  return pc;
}
function goo() {
  const pc = new PixelCanvas(5, 5);
  pc.circle(2, 2, 2.3, 0xffffff).set(4, 4, 0xffffff);
  return pc;
}
function chain() {
  const pc = new PixelCanvas(6, 4);
  pc.rect(0, 0, 4, 4, 0x9a9ab0).rect(1, 1, 2, 2, null);
  pc.d[1 * 6 + 1] = null;
  pc.d[1 * 6 + 2] = null;
  pc.d[2 * 6 + 1] = null;
  pc.d[2 * 6 + 2] = null;
  pc.hline(4, 5, 2, 0x6a6a80);
  return pc;
}

// ------------------------------------------------------------------ build
let built = false;
export function buildAnimals(scene) {
  if (built) return;
  built = true;
  const frames = {};
  for (const [id, draw] of Object.entries(ANIMAL_DRAW)) {
    const n = draw.frames ?? 3;
    for (let f = 0; f < n; f++) frames[`${id}_${f}`] = rim(draw(f));
    HEAD_ANCHORS[id] = draw.head ?? headAnchor(frames[`${id}_1`]);
  }
  addAtlas(scene, "pxa", frames);
  for (const id of Object.keys(ANIMAL_DRAW))
    addTexture(scene, `hero_${id}`, frames[`${id}_1`], PORTRAIT_SCALE);
  addTexture(scene, "fx_petal", petal(), 3);
  addTexture(scene, "fx_zzz", zzz(), 3);
  addTexture(scene, "fx_yarn", yarn(), 3);
  addTexture(scene, "fx_acorn", acorn(), 3);
  addTexture(scene, "fx_marsh", marsh(), 3);
  addTexture(scene, "fx_berry", berry(), 3);
  addTexture(scene, "fx_bubble", bubble(), 3);
  addTexture(scene, "fx_bone", bone(), 3);
  addTexture(scene, "fx_goo", goo(), 3);
  addTexture(scene, "fx_chain", chain(), 3);
  buildPassHeroes(scene);
}

/**
 * DRIFT PASS+ heroes: their own atlas ("pxp") at 3 texture px per art px, so a 32x32 frame is
 * the same texture size as a standard 24x24 hero at 4x. Hat anchors are stored in standard art
 * px (x 3/4) so shop hats sit right; portraits are ~90% of a standard portrait.
 */
function buildPassHeroes(scene) {
  const frames = {};
  for (const [id, draw] of Object.entries(PASS_DRAW)) {
    for (let f = 0; f < PASS_FRAMES; f++) frames[`${id}_${f}`] = rim(draw(f));
    if (draw.skin) for (let f = 0; f < PASS_FRAMES; f++) frames[`${id}_s${f}`] = rim(draw.skin(f));
    const a = headAnchor(frames[`${id}_1`]);
    const k = PASS_TEX / 4;
    HEAD_ANCHORS[id] = { x: a.x * k, y: a.y * k, w: a.w * k, h: a.h * k };
  }
  // the skin layers keep the white rim out (only the body is recoloured)
  for (const [id, draw] of Object.entries(PASS_DRAW))
    if (draw.skin)
      for (let f = 0; f < PASS_FRAMES; f++) {
        const pc = frames[`${id}_s${f}`];
        const base = frames[`${id}_${f}`];
        for (let i = 0; i < pc.d.length; i++) if (base.d[i] === 0xffffff) pc.d[i] = null;
      }
  addAtlas(scene, "pxp", frames, PASS_TEX);
  // portraits: 90% of a standard portrait (24 art px at PORTRAIT_SCALE), nearest-neighbour
  const px = ((24 * PORTRAIT_SCALE) / 32) * 0.9;
  for (const id of Object.keys(PASS_DRAW)) {
    const src = frames[`${id}_1`].toCanvas(4);
    const cv = document.createElement("canvas");
    cv.width = cv.height = Math.round(34 * px);
    const ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, cv.width, cv.height);
    canvasTexture(scene, `hero_${id}`, cv).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
  for (const [k, pc] of Object.entries(passParticles())) addTexture(scene, k, pc, 3);
}

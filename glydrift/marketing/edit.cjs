#!/usr/bin/env node
// Builds the two TikTok cuts from marketing/work/ (made by record.cjs):
//   output/glydrift_tiktok_abyss.mp4  — 20-25 s, hook on the wildest near-miss, The Calm, the Abyss
//   output/glydrift_tiktok_ai.mp4     — 15 s, "I built this game with AI in one night": menu,
//                                       heroes, biomes
// 1080x1920, 30 fps, H.264 + AAC, cuts land on the music's beat, text stays inside TikTok's
// safe area (not in the top 150 px or bottom 400 px), ending on the Glydrift logo (1.5 s).
const path = require("node:path");
const fs = require("node:fs");
const L = require("./lib/edit-lib.cjs");

const ROOT = __dirname;
const WORK = path.join(ROOT, "work");
const OUT = path.join(ROOT, "output");
const VIDEO = path.join(WORK, "master.mkv");
const AUDIO = path.join(WORK, "audio.wav");

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { events, fps } = JSON.parse(fs.readFileSync(path.join(WORK, "events.json"), "utf8"));
  const T = (e) => e.frame / fps;
  const ev = (type, pred = () => true) => events.find((e) => e.type === type && pred(e));
  const nears = events.filter((e) => e.type === "near");
  const play = ev("play");
  const runStart = ev("runStart");
  const solar = ev("biome", (e) => e.raw === 1);
  const frozen = ev("biome", (e) => e.raw === 2);
  const glitch = ev("biome", (e) => e.raw === 3);
  const calm = ev("calm");
  const blackout = ev("blackout");
  const abyss = ev("abyss");
  const death = ev("death");
  const over = ev("gameover");
  const chars = ev("characters");
  for (const [k, v] of Object.entries({ play, runStart, solar, frozen, glitch, calm, blackout, abyss, death, over, chars }))
    if (!v) throw new Error(`missing event: ${k} — re-record`);

  // ---- tempo map of the recorded soundtrack (menu lounge 112, biomes 124, Abyss 140)
  console.log("[beats] analysing the soundtrack…");
  const on = L.onsetEnvelope(L.readMono(AUDIO));
  const grids = [
    L.beatGrid(on, 0, T(play) + 0.6, 112),
    L.beatGrid(on, T(play) + 0.6, T(calm), 124),
    L.beatGrid(on, T(calm), T(abyss), 124),
    L.beatGrid(on, T(abyss), T(death) + 0.85, 140),
    L.beatGrid(on, T(death) + 0.85, 1e9, 124),
  ];

  // ---- the wildest near-miss: in the Abyss if there was one, else the tightest
  const abyssNear = nears.filter((e) => e.frame > abyss.frame && e.frame < death.frame);
  const hook = abyssNear[0] || nears.slice().sort((a, b) => a.minClear - b.minClear)[0];
  const pick = (from, to) => nears.filter((e) => e.frame > from && e.frame < to && e !== hook).sort((a, b) => a.minClear - b.minClear)[0];
  const n1 = pick(runStart.frame + 120, solar.frame - 90) || nears[1];
  const n2 = pick(solar.frame + 150, frozen.frame - 30) || nears[3];
  const n3 = pick(frozen.frame + 150, glitch.frame + 400) || nears[5];

  // ---- cards
  console.log("[cards] rendering text + end card…");
  const cards = await L.renderCards([
    { id: "pov", text: "POV: you made it<br>to the Abyss", y: 360 },
    { id: "quiet", text: "it gets quiet...", y: 320 },
    { id: "tooquiet", text: "...too quiet", y: 320 },
    { id: "soon", text: "GLYDRIFT · coming soon", y: 1430, size: 60, pill: true },
    { id: "ai", text: "I built this game<br>with AI in one night", y: 360 },
  ], path.join(WORK, "cards"));
  const endCard = await L.renderEndCard(path.join(WORK, "cards", "endcard.png"));

  // ---------------------------------------------------------------- 1) the Abyss cut
  const A = [
    L.beatClip("hook", T(hook), 1.05, 2.1, grids),
    L.beatClip("start", T(play), 0.35, 1.5, grids),
    L.beatClip("near1", T(n1), 0.95, 1.9, grids),
    L.beatClip("solar", T(solar), 0.3, 1.9, grids),
    L.beatClip("near2", T(n2), 0.75, 1.45, grids),
    L.beatClip("frozen", T(frozen), 0.3, 1.9, grids),
    L.beatClip("near3", T(n3), 0.75, 1.45, grids),
    L.beatClip("calm", T(blackout) - 3.2, 0, 2.4, grids),
    // the entrance: last beat of The Calm → blackout → slam (continuous, not beat-snapped)
    { name: "entrance", start: L.q(T(blackout) - 0.8), dur: L.q(2.4) },
    L.beatClip("speed", T(abyss) + 1.6, 0, 1.7, grids),
    L.beatClip("death", T(death), 1.0, 1.7, grids),
    { name: "gameover", start: L.q(T(over) + 0.55), dur: L.q(1.5) },
  ];
  A.push({ name: "logo", start: A[A.length - 1].start + A[A.length - 1].dur, dur: 1.5, image: endCard, fadeIn: 0.15, audioFadeOut: 0.9 });
  const total = A.reduce((s, c) => s + c.dur, 0);
  console.log(`[abyss] ${A.length} clips, ${total.toFixed(2)} s`);
  if (total < 20 || total > 25) console.log("  (outside 20-25 s — check the event timings)");

  const files = A.map((c, i) => {
    const out = path.join(WORK, `a_${String(i).padStart(2, "0")}_${c.name}.mkv`);
    L.renderClip({ video: VIDEO, audio: AUDIO, out, ...c });
    return out;
  });
  const at = (name) => { let t = 0; for (const c of A) { if (c.name === name) return t; t += c.dur; } return 0; };
  const endA = total;
  const abyssOut = L.finalize({
    clips: files,
    workDir: WORK,
    out: path.join(OUT, "glydrift_tiktok_abyss.mp4"),
    overlays: [
      { file: cards.pov, from: 0, to: 2.0 },
      { file: cards.quiet, from: at("calm") - 0.25, to: at("entrance") },
      // through the blackout, gone the instant the ENTERING ABYSS title slams in
      { file: cards.tooquiet, from: at("entrance"), to: at("entrance") + 0.8 + 0.5 },
      { file: cards.soon, from: endA - 3, to: endA },
    ],
  });
  console.log("[abyss] →", abyssOut, L.probeDuration(abyssOut).toFixed(2), "s");

  // ---------------------------------------------------------------- 2) the 15 s AI cut
  const B = [
    { name: "menu", start: L.q(0.05), dur: L.q(2.4) },
    { name: "heroes", start: L.q(T(chars) + 1.4), dur: L.q(3.4) },
    L.beatClip("solar", T(solar), 0.3, 1.9, grids),
    L.beatClip("frozen", T(frozen), 0.3, 1.9, grids),
    L.beatClip("glitch", T(glitch), 0.3, 1.45, grids),
    { name: "entrance", start: L.q(T(blackout) - 0.4), dur: L.q(1.8) },
  ];
  // exactly 15 s: the last action clip takes whatever is left before the 1.5 s logo
  let used = B.reduce((s, c) => s + c.dur, 0);
  if (15 - 1.5 - used < 0.9) B[1].dur = L.q(B[1].dur - (0.9 - (15 - 1.5 - used)));
  used = B.reduce((s, c) => s + c.dur, 0);
  B.push({ name: "near", start: L.q(T(hook) - 0.8), dur: L.q(15 - 1.5 - used) });
  B.push({ name: "logo", start: L.q(T(over) + 2.05), dur: 1.5, image: endCard, fadeIn: 0.15, audioFadeOut: 0.9 });
  const totalB = B.reduce((s, c) => s + c.dur, 0);
  console.log(`[ai] ${B.length} clips, ${totalB.toFixed(2)} s`);
  const filesB = B.map((c, i) => {
    const out = path.join(WORK, `b_${String(i).padStart(2, "0")}_${c.name}.mkv`);
    L.renderClip({ video: VIDEO, audio: AUDIO, out, ...c });
    return out;
  });
  const aiOut = L.finalize({
    clips: filesB,
    workDir: WORK,
    out: path.join(OUT, "glydrift_tiktok_ai.mp4"),
    overlays: [
      { file: cards.ai, from: 0, to: 3.0 },
      { file: cards.soon, from: totalB - 3, to: totalB },
    ],
  });
  console.log("[ai] →", aiOut, L.probeDuration(aiOut).toFixed(2), "s");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

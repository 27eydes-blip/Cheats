#!/usr/bin/env node
// © 2026 Sammy Eyde. All rights reserved. Glydrift — see ../LICENSE.
//
// The 2026-11-05 ad set, all from one recording (node marketing/record.cjs):
//   output/ads/tiktok_abyss.mp4      1080x1920  ~20-25 s  "POV: you made it to the Abyss"
//   output/ads/tiktok_heroes.mp4     1080x1920   15 s     heroes, worlds, one tap
//   output/ads/tiktok_challenge.mp4  1080x1920  ~15 s     "can you reach 2,000 m?"
//   output/ads/x_abyss_16x9.mp4      1920x1080            the Abyss cut for X/Twitter
//   output/ads/x_still_*.png         1600x900             still images for X posts
// Every claim on screen comes from the game itself: the world and hero counts and the distance
// are read from the game code and the recording, not typed in by hand.
// No web address is baked in ("link in bio"): the site is moving, and the link goes in the post.
const path = require("node:path");
const fs = require("node:fs");
const L = require("./lib/edit-lib.cjs");

const ROOT = __dirname;
const WORK = path.join(ROOT, "work");
const OUT = path.join(ROOT, "output", "ads");
const VIDEO = path.join(WORK, "master.mkv");
const AUDIO = path.join(WORK, "audio.wav");
const fmt = (n) => n.toLocaleString("en-US");

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
  const roster = ev("roster");
  for (const [k, v] of Object.entries({ play, runStart, solar, frozen, glitch, calm, blackout, abyss, death, over, chars, roster }))
    if (!v) throw new Error(`missing event: ${k} — re-record`);

  // facts from the game itself
  const { BIOMES, CLASSIC } = await import(path.join(ROOT, "..", "src", "biomes", "biomes.js"));
  const worlds = CLASSIC;
  const dimensions = BIOMES.length - CLASSIC;
  const heroes = roster.size;
  const heroesText = heroes >= 20 ? `${Math.floor(heroes / 10) * 10}+ heroes` : `${heroes} heroes`;
  const abyssAt = Math.round(abyss.meters ?? 2000);
  const reached = death.meters;
  console.log(`[facts] ${worlds} worlds, ${dimensions} secret dimensions, ${heroes} heroes in the carousel, Abyss at ${abyssAt} m, bot reached ${reached} m`);

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

  const abyssNear = nears.filter((e) => e.frame > abyss.frame && e.frame < death.frame);
  const hook = abyssNear[0] || nears.slice().sort((a, b) => a.minClear - b.minClear)[0];
  const pick = (from, to) =>
    nears.filter((e) => e.frame > from && e.frame < to && e !== hook).sort((a, b) => a.minClear - b.minClear)[0];
  const n1 = pick(runStart.frame + 120, solar.frame - 90) || nears[1];
  const n2 = pick(solar.frame + 150, frozen.frame - 30) || nears[3];
  const n3 = pick(frozen.frame + 150, glitch.frame + 400) || nears[5];

  // ---- text (game font, TikTok safe area checked by renderCards)
  console.log("[cards] rendering text + end card…");
  const cards = await L.renderCards(
    [
      { id: "pov", text: "POV: you made it<br>to the Abyss", y: 360 },
      { id: "quiet", text: "it gets quiet...", y: 320 },
      { id: "tooquiet", text: "...too quiet", y: 320 },
      { id: "cta", text: "PLAY FREE · LINK IN BIO", y: 1430, size: 52, pill: true },
      { id: "onetap", text: "one tap.<br>that's the whole game.", y: 520 },
      { id: "heroes", text: heroesText, y: 330 },
      { id: "worlds", text: `${worlds} worlds`, y: 330 },
      { id: "dims", text: `+ ${dimensions} secret<br>dimensions`, y: 360 },
      { id: "challenge", text: `can you reach<br>${fmt(abyssAt)} m?`, y: 380 },
      { id: "most", text: "it only gets<br>faster", y: 330 },
      { id: "beat", text: `I hit ${fmt(reached)} m.<br>beat it.`, y: 520 },
    ],
    path.join(WORK, "cards"),
  );
  const endCard = await L.renderEndCard(path.join(WORK, "cards", "endcard.png"));
  const logo = (start) => ({ name: "logo", start, dur: 1.5, image: endCard, fadeIn: 0.15, audioFadeOut: 0.9 });

  const build = (prefix, clips, overlays, outName) => {
    const total = clips.reduce((s, c) => s + c.dur, 0);
    const files = clips.map((c, i) =>
      L.renderClip({ video: VIDEO, audio: AUDIO, out: path.join(WORK, `${prefix}_${String(i).padStart(2, "0")}_${c.name}.mkv`), ...c }),
    );
    const at = (name) => {
      let t = 0;
      for (const c of clips) {
        if (c.name === name) return t;
        t += c.dur;
      }
      throw new Error(`no clip ${name}`);
    };
    const out = L.finalize({ clips: files, workDir: WORK, out: path.join(OUT, outName), overlays: overlays(at, total) });
    console.log(`[${prefix}] → ${out}  ${L.probeDuration(out).toFixed(2)} s, ${clips.length} clips`);
    return out;
  };

  // ---------------------------------------------------------------- 1) the Abyss cut (TikTok)
  const A = [
    L.beatClip("hook", T(hook), 1.05, 2.1, grids),
    L.beatClip("start", T(play), 0.35, 1.5, grids),
    L.beatClip("near1", T(n1), 0.95, 1.9, grids),
    L.beatClip("solar", T(solar), 0.3, 1.9, grids),
    L.beatClip("near2", T(n2), 0.75, 1.45, grids),
    L.beatClip("frozen", T(frozen), 0.3, 1.9, grids),
    L.beatClip("near3", T(n3), 0.75, 1.45, grids),
    L.beatClip("calm", T(blackout) - 3.2, 0, 2.4, grids),
    { name: "entrance", start: L.q(T(blackout) - 0.8), dur: L.q(2.4) },
    L.beatClip("speed", T(abyss) + 1.6, 0, 1.7, grids),
    L.beatClip("death", T(death), 1.0, 1.7, grids),
    { name: "gameover", start: L.q(T(over) + 0.55), dur: L.q(1.5) },
  ];
  A.push(logo(A[A.length - 1].start + A[A.length - 1].dur));
  const abyssCut = build("abyss", A, (at, total) => [
    { file: cards.pov, from: 0, to: 2.0 },
    { file: cards.quiet, from: at("calm") - 0.25, to: at("entrance") },
    { file: cards.tooquiet, from: at("entrance"), to: at("entrance") + 1.3 },
    { file: cards.cta, from: total - 3, to: total },
  ], "tiktok_abyss.mp4");

  // ---------------------------------------------------------------- 2) heroes + worlds (15 s)
  const B = [
    { name: "menu", start: L.q(0.05), dur: L.q(2.4), cropY: 0 }, // the GLYDRIFT title in frame
    { name: "heroes", start: L.q(T(chars) + 1.2), dur: L.q(3.6) },
    L.beatClip("solar", T(solar), 0.3, 1.9, grids),
    L.beatClip("frozen", T(frozen), 0.3, 1.9, grids),
    L.beatClip("glitch", T(glitch), 0.3, 1.45, grids),
  ];
  let used = B.reduce((s, c) => s + c.dur, 0);
  B.push({ name: "entrance", start: L.q(T(blackout) - 0.4), dur: L.q(Math.max(1.2, 15 - 1.5 - used)) });
  B.push(logo(L.q(T(over) + 2.05)));
  const heroesCut = build("heroes", B, (at, total) => [
    { file: cards.onetap, from: 0, to: at("heroes") },
    { file: cards.heroes, from: at("heroes") + 0.2, to: at("solar") },
    { file: cards.worlds, from: at("solar"), to: at("glitch") + 0.6 },
    { file: cards.dims, from: at("glitch") + 0.6, to: at("logo") },
    { file: cards.cta, from: total - 3, to: total },
  ], "tiktok_heroes.mp4");

  // ---------------------------------------------------------------- 3) the challenge (~15 s)
  const C = [
    L.beatClip("start", T(play), 0.35, 1.9, grids),
    L.beatClip("near1", T(n1), 0.95, 1.45, grids),
    L.beatClip("near2", T(n2), 0.75, 1.45, grids),
    L.beatClip("near3", T(n3), 0.75, 1.45, grids),
    { name: "entrance", start: L.q(T(blackout) - 0.6), dur: L.q(2.2) },
    L.beatClip("hook", T(hook), 1.05, 1.7, grids),
    L.beatClip("death", T(death), 1.0, 1.45, grids),
    { name: "gameover", start: L.q(T(over) + 0.55), dur: L.q(2.0) },
  ];
  C.push(logo(C[C.length - 1].start + C[C.length - 1].dur));
  const challengeCut = build("challenge", C, (at, total) => [
    { file: cards.challenge, from: 0, to: at("near2") },
    { file: cards.most, from: at("near3"), to: at("entrance") },
    { file: cards.beat, from: at("gameover"), to: at("logo") },
    { file: cards.cta, from: total - 3, to: total },
  ], "tiktok_challenge.mp4");

  // ---------------------------------------------------------------- 4) X / Twitter 16:9
  // the vertical cut in the middle, a blurred, darkened copy of itself filling the sides
  console.log("[x] 16:9 version…");
  const x169 = path.join(OUT, "x_abyss_16x9.mp4");
  L.ff(["-i", abyssCut, "-filter_complex",
    "[0:v]split[a][b];[a]scale=1920:-2,crop=1920:1080,gblur=sigma=28,eq=brightness=-0.18:saturation=1.3[bg];" +
    "[b]scale=-2:1080:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:0,format=yuv420p[v]",
    "-map", "[v]", "-map", "0:a", "-c:v", "libx264", "-profile:v", "high", "-crf", "18", "-preset", "slow",
    "-c:a", "copy", "-movflags", "+faststart", x169]);
  console.log(`[x] → ${x169}  ${L.probeDuration(x169).toFixed(2)} s`);

  // ---------------------------------------------------------------- 5) stills for X (1600x900)
  console.log("[stills] frames + layout…");
  const frame = (t, name) => {
    const f = path.join(WORK, `still_${name}.png`);
    L.ff(["-ss", t.toFixed(3), "-i", VIDEO, "-frames:v", "1", f]);
    return f;
  };
  const stills = [
    { id: "abyss", frame: frame(T(abyss) + 0.9, "abyss"), title: "SURVIVE<br>THE ABYSS", sub: `It gets dark at ${fmt(abyssAt)} m.` },
    { id: "nearmiss", frame: frame(T(hook) + 0.05, "near"), title: "ONE TAP.<br>NO MERCY.", sub: "Thread the gap. Chain the close calls." },
    { id: "heroes", frame: frame(T(chars) + 2.6, "heroes"), title: `${heroesText.toUpperCase()}.<br>${worlds} WORLDS.`, sub: `+ ${dimensions} secret dimensions to find.` },
  ];
  await L.renderStills(stills, OUT);
  console.log("[stills] →", stills.map((s) => `x_still_${s.id}.png`).join(", "));
  console.log("done:", [abyssCut, heroesCut, challengeCut, x169].map((f) => path.basename(f)).join(", "));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

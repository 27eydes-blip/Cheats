#!/usr/bin/env node
// Pipeline self-test: records the stand-in fixture game, then renders all four real edit configs
// from it (moments the fixture doesn't have are mapped onto near-miss/realm events).
//   node test/selftest.mjs [outDir]
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, renderEdl } from "../lib/edit.mjs";
import { probe } from "../lib/ffmpeg.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(process.argv[2] || join(ROOT, ".tmp/selftest"));
const clips = join(out, "clips");
if (!existsSync(join(clips, "test-run.mkv")) || process.env.RERECORD) {
  execFileSync(
    "node",
    [
      join(ROOT, "record/record.mjs"),
      "--url",
      `file://${join(ROOT, "test")}/`,
      "--moments",
      join(ROOT, "test/moments.json"),
      "--adapter",
      join(ROOT, "test/fixture.adapter.js"),
      "--out",
      clips,
    ],
    { stdio: "inherit" },
  );
}
const stand = {
  // fixture has no calm/abyss/heroes/menus: map them onto other moments of the test runs
  realm: { clip: "test-run" },
  chain: { clip: "test-run" },
  calm: { clip: "test-run", event: "realm", pick: 2 },
  abyss: { clip: "test-run", event: "realm", pick: 2 },
  eyeBeam: { clip: "test-run", event: "nearMiss", pick: 30 },
  flex: { clip: "test-run", event: "nearMiss", pick: 12 },
  surf: { clip: "test-run", event: "nearMiss", pick: 20 },
  death: { clip: "test-death" },
};
const realmPick = { solar: 0, frozen: 1, glitch: 2 };
const srcs = new Map();
async function source(seg) {
  const clip = seg._clip;
  if (!srcs.has(clip)) {
    const file = join(clips, `${clip}.mkv`);
    const info = await probe(file);
    srcs.set(clip, {
      file,
      meta: readJson(file.replace(".mkv", ".json")),
      hasAudio: !!info.audio,
      duration: info.duration,
      w: info.video.width,
      h: info.video.height,
    });
  }
  return srcs.get(clip);
}
const editsDir = join(ROOT, "config/edits");
for (const f of readdirSync(editsDir).filter((x) => x.endsWith(".json"))) {
  const edl = readJson(join(editsDir, f));
  edl.segments = edl.segments.map((s) => {
    const m = s.event ? stand[s.event] : { clip: "test-run" };
    const seg = { ...s, ...m, _clip: m.clip };
    if (s.event === "realm") seg.pick = realmPick[s.id];
    if (!s.event) Object.assign(seg, { event: "nearMiss", pick: 25 });
    return seg;
  });
  await renderEdl(edl, source, { outDir: out, tmpRoot: join(out, "tmp"), scaleMode: "pixel" });
}

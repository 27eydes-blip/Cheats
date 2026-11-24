// `node scripts/bench-latency.mjs [--runs 2]`: real Claude timings for a few typical voice turns,
// measured inside the server (no browser, no ElevenLabs). Uses a little API credit.
// Prints time to first token and first full sentence per turn, and the averages.
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

process.env.JERICHO_DATA_DIR ||= fs.mkdtempSync(path.join(os.tmpdir(), "jericho-bench-"));
const { Brain } = await import("../server/brain.js");

const runs = Number(process.argv[process.argv.indexOf("--runs") + 1]) || 2;
const route = process.argv.includes("--strong") ? "strong" : "auto";
const TURNS = [
  "hey how's it going",
  "what's 15 percent of 80",
  "what's the weather like right now",
  "tell me one fun fact about ancient Egypt",
  "explain in two sentences how a heat pump works",
];
const brain = new Brain();
const rows = [];
for (let r = 0; r < runs; r++) {
  const sessionId = `bench-${Date.now()}-${r}`;
  for (const text of TURNS) {
    const t0 = performance.now();
    let first = null;
    const out = await brain.handle(sessionId, text, { onSentence: () => (first ??= performance.now() - t0) }, { typed: true, route });
    rows.push({ text, firstTokenMs: out.timings.firstTokenMs, firstSentenceMs: out.timings.firstSentenceMs ?? Math.round(first), totalMs: out.timings.totalMs, models: out.timings.models.join(",") });
    console.log(`${String(out.timings.firstTokenMs).padStart(6)} ms token  ${String(out.timings.firstSentenceMs).padStart(6)} ms sentence  ${String(out.timings.totalMs).padStart(6)} ms total  ${out.timings.models.join(",").padEnd(18)} ${text}`);
  }
}
const avg = (k) => Math.round(rows.reduce((a, x) => a + (x[k] || 0), 0) / rows.length);
console.log(`\naverage over ${rows.length} turns: first token ${avg("firstTokenMs")} ms, first sentence ${avg("firstSentenceMs")} ms, total ${avg("totalMs")} ms`);
process.exit(0);

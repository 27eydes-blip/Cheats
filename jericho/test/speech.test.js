// Streaming sentences, natural-speech cleanup, mishearing fixes, model routing, cache warm-up.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fakeClient, say, use } from "./fake-client.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-speech-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
fs.writeFileSync(path.join(tmp, "settings.json"), JSON.stringify({ ...base, logFile: path.join(tmp, "actions.log") }));
process.env.JERICHO_SETTINGS = path.join(tmp, "settings.json");
process.env.JERICHO_DATA_DIR = path.join(tmp, "data");

const { SentenceSplitter, speakable } = await import("../server/speech.js");
const { Brain, applyMishearings } = await import("../server/brain.js");
const memory = await import("../server/memory.js");

test("sentences come out as soon as they're complete, without breaking 7.30 or Dr. Smith", () => {
  const s = new SentenceSplitter();
  const out = [];
  for (const d of ["Okay. I booked it for 7.", "30 tonight with Dr. ", "Smith. Want a reminder? ", "Sure."]) out.push(...s.push(d));
  assert.deepEqual(out, ["Okay. I booked it for 7.30 tonight with Dr. Smith.", "Want a reminder?"]);
  assert.deepEqual(s.flush(), ["Sure."]);
});

test("spoken text has no markdown, bullets, symbols or links", () => {
  assert.equal(speakable("**Done!** 50% off & free\n- see https://x.com"), "Done! 50 percent off and free\nsee a link");
});

test("replies stream to the speaker a sentence at a time", async () => {
  const client = fakeClient([say("The kitchen lights are on now. Anything else you need tonight?")]);
  const heard = [];
  const r = await new Brain({ client }).handle("a", "kitchen lights", { onSentence: (t) => heard.push(t) });
  assert.deepEqual(heard, ["The kitchen lights are on now.", "Anything else you need tonight?"]);
  assert.equal(r.reply, heard.join(" "));
  assert.ok(r.timings.firstSentenceMs !== null && r.timings.totalMs >= 0);
  const req = client.calls[0];
  assert.ok(req.tools.some((t) => t.type === "web_search_20260209"), "web search available");
  assert.ok(req.tools.filter((t) => t.input_schema).every((t) => t.eager_input_streaming === true));
  assert.match(req.system[0].text, /short sentences, contractions/);
  assert.match(req.system[0].text, /"that one", "do it again"/);
  assert.equal(req.system[1].cache_control.type, "ephemeral");
});

test("learned mishearings are fixed before Claude sees the words", async () => {
  memory.saveStyle({ phrases: [], requestLength: "", replyPreferences: [], mishearings: [{ heard: "lites", meant: "lights" }] });
  assert.deepEqual(applyMishearings("turn off the lites"), { text: "turn off the lights", fixes: ['"lites" to "lights"'] });
  const client = fakeClient([say("Done.")]);
  await new Brain({ client }).handle("b", "turn off the lites");
  assert.match(client.calls[0].messages[0].content.at(-1).text, /turn off the lights \(speech-to-text heard "turn off the lites"/);
});

test("hard questions go to the stronger model from settings, with a spoken heads-up", async () => {
  const client = fakeClient(
    [use("t1", "deep_think", { question: "Which mortgage is cheaper over 30 years?" }), say("The fixed one, by about four thousand dollars.")],
    (req) => (req.model === "claude-fable-5-2" ? say("The fixed-rate one is cheaper by about four thousand dollars.") : null),
  );
  const heard = [];
  const r = await new Brain({ client }).handle("c", "which mortgage is cheaper", { onSentence: (t) => heard.push(t) });
  assert.equal(heard[0], "Let me think that through.");
  assert.match(r.reply, /fixed one/);
  const hard = client.calls.find((c) => c.model === "claude-fable-5-2");
  assert.equal(hard.output_config.effort, "high");
  assert.equal(client.calls[0].model, "claude-opus-5-5");
});

test("a cut-off tool input is caught before anything runs", async () => {
  const client = fakeClient([use("t1", "lights", { room: "kitchen" }), use("t2", "lights", { action: "on", room: "kitchen" }), say("On.")]);
  await new Brain({ client }).handle("d", "lights");
  const result = client.calls[1].messages.at(-1).content[0];
  assert.equal(result.is_error, true);
  assert.match(result.content, /INVALID_INPUT: missing "action"/);
});

test("wake-word warm-up sends a max_tokens 0 request with the same prompt", async () => {
  const client = fakeClient([], (req) => (req.max_tokens === 0 ? { stop_reason: "max_tokens", content: [] } : null));
  const brain = new Brain({ client });
  assert.equal(await brain.prewarm("e"), true);
  assert.equal(await brain.prewarm("e"), false, "not again within the cache lifetime");
  const warm = client.calls[0];
  assert.equal(warm.max_tokens, 0);
  assert.equal(warm.system[1].cache_control.type, "ephemeral");
});

// Responding better: barge-in policy, the echo window, routing, follow-ups, short spoken answers,
// planner context, token stats and npm run voice:check. Offline: pure functions, a fake Claude
// client and a temp data folder. No server, ports, timers or network.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fakeClient, say } from "./fake-client.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-respond-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
fs.writeFileSync(path.join(tmp, "settings.json"), JSON.stringify({ ...base, logFile: path.join(tmp, "actions.log") }));
Object.assign(process.env, { JERICHO_SETTINGS: path.join(tmp, "settings.json"), JERICHO_DATA_DIR: path.join(tmp, "data") });

const { bargePolicy, duringReply, ECHO_MATCH_MS, onLoudLevel, shouldDropAsEcho } = await import("../public/bargein.js");
const { classifyFollowUp } = await import("../public/turnfilter.js");
const { cleanLatency } = await import("../public/latency.js");
const { publicConfig } = await import("../server/config.js");
const { routeFor, isOpenEnded } = await import("../server/router.js");
const { Brain, _resetFastModelForTests } = await import("../server/brain.js");
const planner = await import("../server/planner/index.js");
const { rows, report } = await import("../scripts/voice-check.mjs");

after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const appJs = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const log = () => (fs.existsSync(path.join(tmp, "actions.log")) ? fs.readFileSync(path.join(tmp, "actions.log"), "utf8") : "");

test("settings: barge-in on the wake word by default, minVolume, and an 8 second follow-up", () => {
  const pc = publicConfig();
  assert.equal(pc.bargeIn.mode, "wakeWord");
  assert.equal(pc.bargeIn.minLevel, base.bargeIn.minVolume);
  assert.equal(pc.followUpSeconds, 8);
  assert.equal(bargePolicy({}), "wakeWord");
  assert.equal(bargePolicy({ mode: "loud" }), "loud");
  assert.equal(bargePolicy({ mode: "nonsense" }), "wakeWord");
  assert.match(appJs, /config\.followUpSeconds/);
});

test("mic: echo cancellation, noise suppression and auto gain are on", () => {
  assert.match(appJs, /getUserMedia\(\{ audio: \{ echoCancellation: true, noiseSuppression: true, autoGainControl: true \} \}\)/);
});

test("while he speaks: only the wake word or 'stop' cuts him off (loud talk too, in loud mode)", () => {
  assert.equal(duringReply({ text: "stop", isKill: true }), "kill");
  assert.equal(duringReply({ text: "Jericho what time is it", wakeHeard: true }), "interrupt");
  assert.equal(duringReply({ text: "what time is it", loud: true }), "ignore", "loud alone isn't enough by default");
  assert.equal(duringReply({ text: "what time is it", loud: true, policy: "loud" }), "interrupt");
  assert.equal(duringReply({ text: "Jericho wait", wakeHeard: true, policy: "off" }), "ignore");
  assert.equal(duringReply({ text: "stop", isKill: true, policy: "off" }), "kill", "stop always works");
  assert.equal(duringReply({ text: "sunny and seventy", wakeHeard: true, echo: true }), "ignore", "his own words");
  assert.equal(onLoudLevel("wakeWord"), "listen");
  assert.equal(onLoudLevel("loud"), "cut");
});

test("his own words are dropped while he speaks and for 3 seconds after; your short yes isn't", () => {
  const recent = ["It's sunny and seventy two in Birmingham.", "Want the forecast for tomorrow too?"];
  const t0 = 10_000;
  const window = { recent, now: t0 + 2500, tailUntil: t0 + ECHO_MATCH_MS };
  assert.equal(ECHO_MATCH_MS, 3000);
  assert.equal(shouldDropAsEcho({ ...window, text: "sunny and seventy two in birmingham" }), true);
  assert.equal(shouldDropAsEcho({ ...window, text: "the forecast for tomorrow" }), true);
  assert.equal(shouldDropAsEcho({ ...window, text: "yes" }), false, "a short yes is yours");
  assert.equal(shouldDropAsEcho({ ...window, text: "what about saturday" }), false);
  assert.equal(shouldDropAsEcho({ recent, now: t0 + 3500, tailUntil: t0 + ECHO_MATCH_MS, text: "sunny and seventy two in birmingham" }), false, "after 3 s it's you repeating him");
  assert.match(appJs, /console\.debug\("\[jericho\] echo ignored"\)/, "logged quietly, without the words");
});

test("routing: Haiku only for clearly simple turns; reasoning, advice and personal context go strong", () => {
  for (const t of ["what time is it", "set my alarm for 7", "turn off the blue room", "what's due tomorrow", "what is the capital of France", "how far is the moon", "hey how are you", "what's the weather tomorrow"]) {
    assert.equal(routeFor(t).route, "fast", t);
  }
  for (const t of ["why is the sky blue", "what should I get my mom for her birthday", "what's my sister's name", "how do I fix a flat tire", "tell me about Rome", "I feel tired today", "which laptop is better for school", "write me a short poem", "help me plan my week"]) {
    assert.equal(routeFor(t).route, "strong", t);
  }
  assert.equal(routeFor("what do you think about electric cars").reason, "open-ended");
  assert.equal(routeFor("what's my sister's name").reason, "personal context");
  assert.equal(isOpenEnded("what do you think about this"), true);
});

test("follow-ups: short answers always count while a confirmation waits; the wake word anywhere counts", () => {
  for (const t of ["yes", "no", "do it", "cancel", "okay", "yeah go ahead", "never mind"]) {
    assert.equal(classifyFollowUp(t, { confirmPending: true }).send, true, t);
  }
  assert.equal(classifyFollowUp("okay", {}).send, false, "without a pending yes/no, a bare okay is filler");
  assert.equal(classifyFollowUp("she went to the store", { wakeHeard: true }).send, true);
  assert.equal(classifyFollowUp("that show was weird", { wakeHeard: true }).send, true, "'... Jericho' at the end still counts");
});

test("voice-friendly answers: one to three sentences by default, never 'I didn't catch that'", async () => {
  _resetFastModelForTests();
  const strong = fakeClient([say("Sure.")]);
  await new Brain({ client: strong }).handle("v1", "why is the sky blue");
  const sys = strong.calls[0].system[0].text;
  assert.equal(strong.calls[0].model, "claude-opus-5-5");
  assert.match(sys, /one to three spoken sentences; go longer only when they ask for detail/);
  assert.match(sys, /Never say you didn't catch or didn't hear them/);
  assert.match(sys, /No lists, markdown/);
  const fast = fakeClient([say("Hi.")]);
  await new Brain({ client: fast }).handle("v2", "hey there");
  assert.match(fast.calls[0].system[0].text, /one to three short sentences.*Never say you didn't catch them/s);
});

test("planner context comes along only when the request is about time or school, and never in the cached part", async () => {
  _resetFastModelForTests();
  planner.addHomework({ title: "Chem worksheet", due: "tomorrow", minutes: "45" });
  const line = planner.contextLine("should I start my homework tonight");
  assert.match(line, /^Planner \(context.*due soon: Chem worksheet \(\w{3}, 45m\).*free today about/);
  assert.equal(planner.contextLine("what's the capital of Peru"), "");
  const client = fakeClient([say("Start now."), say("Lima.")]);
  const brain = new Brain({ client });
  await brain.handle("p1", "should I start my homework tonight or tomorrow");
  assert.match(JSON.stringify(client.calls[0].messages.at(-1).content), /Chem worksheet/);
  assert.doesNotMatch(JSON.stringify(client.calls[0].system), /Chem worksheet/);
  await brain.handle("p1", "what's the capital of Peru");
  assert.doesNotMatch(JSON.stringify(client.calls[1].messages.at(-1).content), /Planner \(context/);
});

test("tokens per turn are counted, logged as numbers only, and kept in the latency log", async () => {
  _resetFastModelForTests();
  const client = fakeClient([{ stop_reason: "end_turn", content: [{ type: "text", text: "It's three." }], usage: { input_tokens: 40, output_tokens: 6, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0 } }]);
  const r = await new Brain({ client }).handle("t1", "what's three times one");
  assert.deepEqual(r.timings.tokens, { in: 40, out: 6, cacheRead: 3000, cacheWrite: 0 });
  const line = log().split("\n").find((l) => l.includes('"type":"turn_stats"') && l.includes('"sessionId":"t1"'));
  assert.match(line, /"tokens":\{"in":40,"out":6,"cacheRead":3000,"cacheWrite":0\}/);
  assert.doesNotMatch(line, /three/, "never the words");
  const clean = cleanLatency({ playing: 900, route: "fast", tokens: { in: 40, out: 6, text: "secret" }, echoes: 2, said: "my password" });
  assert.deepEqual(clean, { playing: 900, route: "fast", tokens: { in: 40, out: 6 }, echoes: 2 });
});

test("npm run voice:check: model, tokens, first word and echoes for the last turns, no private text", () => {
  const list = rows({ latency: [{ time: "2026-11-26T10:00:00Z", route: "fast", models: ["claude-haiku-5-5"], playing: 820, tokens: { in: 120, out: 30, cacheRead: 4000 }, echoes: 1, text: "my bank password is hunter2" }] });
  const out = report(list);
  assert.match(out, /fast +haiku-5-5 +4120 +30 +4000 +820 ms +1/);
  assert.match(out, /echo drops: 1/);
  assert.doesNotMatch(out, /hunter2|password/);
  const fromStats = rows({ stats: [{ type: "turn_stats", time: "2026-11-26T10:00:00Z", route: "strong", models: ["claude-opus-5-5"], tokens: { in: 10, out: 5 }, firstSentenceMs: 1200 }] });
  assert.equal(fromStats[0].firstWordMs, 1200);
  assert.match(report([]), /No voice turns logged yet/);
  assert.equal(JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts["voice:check"], "node scripts/voice-check.mjs");
});

test("speed: replies start on the first sentence, later sentences are joined (no gaps), 'On it.' after 3 s", () => {
  assert.match(appJs, /const ACK_AFTER_MS = 3000;/);
  assert.match(appJs, /if \(turn\.spokeOne\) \{\s*while \(turn\.queue\.length && sentence\.length \+ turn\.queue\[0\]\.length < 240\)/);
});

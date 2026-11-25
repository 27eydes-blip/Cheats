// Cost: model routing, hand-off, local commands, token caps, prewarm, background learning and
// call models. Offline only: a fake Claude client, fake tools, a temp data folder.
// No server, no ports, no network, no timers left behind, no process.exit or kill.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fakeClient, json, say, use } from "./fake-client.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-cost-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
fs.writeFileSync(path.join(tmp, "settings.json"), JSON.stringify({ ...base, logFile: path.join(tmp, "actions.log") }));
process.env.JERICHO_SETTINGS = path.join(tmp, "settings.json");
process.env.JERICHO_DATA_DIR = path.join(tmp, "data");

const { Brain, FAST_TOOL_NAMES, _resetFastModelForTests, _resetLearningForTests } = await import("../server/brain.js");
const { routeFor } = await import("../server/router.js");
const { matchQuick, runQuick } = await import("../server/quick.js");
const { isRisky } = await import("../server/tools/index.js");
const { callSettings, screenWithClaude } = await import("../server/calls/policy.js");

after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const log = () => (fs.existsSync(path.join(tmp, "actions.log")) ? fs.readFileSync(path.join(tmp, "actions.log"), "utf8") : "");

test("routing: everyday turns go to the small model; hard, risky or unclear ones to the strong one", () => {
  for (const t of ["hey how's it going", "what's the weather like", "turn the volume up a bit", "set an alarm for seven", "pause the tv", "what's the capital of France", "thanks", "mute"]) {
    assert.equal(routeFor(t).route, "fast", t);
  }
  for (const t of [
    "help me plan a trip to Chicago next month",
    "write a short poem for my mom",
    "delete the old notes file on my desktop",
    "call the pizza place and order a large pepperoni",
    "run the build script",
    "open the terminal and run npm install",
    "do it",
    "hmm so about the thing from before",
  ]) {
    assert.equal(routeFor(t).route, "strong", t);
  }
  assert.equal(routeFor("hi", { mode: "always-strong" }).route, "strong", "the force-strong setting");
  assert.equal(routeFor("yes", { pending: true }).route, "strong", "a waiting confirmation");
});

test("the small model never gets a risky tool, and hand_off sends the turn to the strong model", async () => {
  _resetFastModelForTests();
  for (const name of FAST_TOOL_NAMES) assert.equal(isRisky(name, {}), false, `${name} is safe`);
  const client = fakeClient([
    (req) => (assert.equal(req.model, "claude-haiku-5-5"), use("h1", "hand_off", { reason: "needs web search" })),
    (req) => (assert.equal(req.model, "claude-opus-5-5"), say("It's sunny in Paris.")),
  ]);
  const r = await new Brain({ client }).handle("ho", "how's the weather in Paris");
  assert.equal(r.reply, "It's sunny in Paris.");
  assert.equal(r.timings.escalated, true);
  assert.ok(!JSON.stringify(client.calls[1].messages).includes('"h1"'), "the hand-off never enters the history");
  assert.match(log(), /"reason":"handed off"/);
});

test("spoken replies get sensible token caps", async () => {
  _resetFastModelForTests();
  const fast = fakeClient([say("Hi.")]);
  await new Brain({ client: fast }).handle("cap1", "hey there");
  assert.equal(fast.calls[0].max_tokens, 2000);
  const strong = fakeClient([say("Here's a plan.")]);
  await new Brain({ client: strong }).handle("cap2", "help me plan my week so I can fit in the gym and still finish the report");
  assert.equal(strong.calls[0].max_tokens, 8000);
});

test("prompt caching: stable instructions first and cached, the changing request last", async () => {
  _resetFastModelForTests();
  const client = fakeClient([say("One."), say("Two.")]);
  const brain = new Brain({ client });
  await brain.handle("cache", "hey there");
  await brain.handle("cache", "how are you");
  const [a, b] = client.calls;
  assert.deepEqual(a.system, b.system, "the system prompt doesn't change between turns");
  assert.deepEqual(a.tools, b.tools, "nor does the tool list");
  assert.equal(a.system.at(-1).cache_control.type, "ephemeral");
  assert.doesNotMatch(JSON.stringify(a.system), /\d{1,2}:\d{2}:\d{2}/, "no clock time in the cached part");
  assert.equal(b.messages.at(-1).content.at(-1).cache_control.type, "ephemeral", "the newest turn is a cache breakpoint");
  assert.match(b.messages.at(-1).content.at(-1).text, /how are you/, "the changing part comes last");
});

test("local first: time, filler, simple alarms and TV commands make no Claude call", async () => {
  const client = fakeClient([]); // anything sent to Claude would throw: nothing is scripted
  const brain = new Brain({ client });
  assert.match((await brain.handle("loc", "what time is it")).reply, /^It's /);
  assert.match((await brain.handle("loc", "um")).reply, /^(Yes\?|I'm listening\.|Go ahead\.)$/);
  assert.equal(client.calls.length, 0);

  // alarms and the TV through fake tools, so nothing real rings or talks to the network
  const ran = [];
  const tools = new Map([
    ["set_alarm", { run: async (input) => (ran.push(["set_alarm", input]), { ok: true, say: "Alarm set for tomorrow at 7:00 AM." }) }],
    ["tv", { run: async (input) => (ran.push(["tv", input]), { ok: true, said: "Turning the TV off." }) }],
  ]);
  assert.deepEqual(matchQuick("set an alarm for 7 am"), { kind: "alarm", time: "7 am", repeat: "once" });
  assert.equal((await runQuick(matchQuick("set an alarm for 7 am"), { tools })).say, "Alarm set for tomorrow at 7:00 AM.");
  assert.equal((await runQuick(matchQuick("turn off the TV"), { tools })).say, "Turning the TV off.");
  assert.deepEqual(ran, [["set_alarm", { time: "7 am", repeat: "once" }], ["tv", { action: "power_off" }]]);
  assert.deepEqual(matchQuick("wake me up at 6:30 a.m. every weekday"), { kind: "alarm", time: "6:30 am", repeat: "weekdays" });
  assert.deepEqual(matchQuick("open netflix on the tv").input, { action: "open_app", app: "netflix" });
  // anything vague or bigger still goes to Claude
  for (const t of ["set an alarm for 7", "set an alarm for 7 am tomorrow called gym", "turn on the kitchen lights", "what's on the tv tonight"]) assert.equal(matchQuick(t), null, t);
});

test("no Claude call at startup or on the wake word unless prewarm is turned on", async () => {
  const client = fakeClient([]);
  const brain = new Brain({ client });
  assert.equal(await brain.prewarm("warm"), false);
  assert.equal(client.calls.length, 0);
});

test("background learning: small model, skipped for local-only chats, at most every 30 minutes", async () => {
  _resetLearningForTests();
  _resetFastModelForTests();
  const learned = { phrases: [], requestLength: "", replyPreferences: [], mishearings: [], profile: { add: [], update: [], drop: [] }, lessons: [], summary: "" };
  const client = fakeClient([say("Hi."), say("Sure."), say("Okay.")], (req) => (req.output_config?.format ? json(learned) : null));
  const brain = new Brain({ client });
  const learnCalls = () => client.calls.filter((c) => c.output_config?.format);

  await brain.handle("l0", "what time is it"); // local only
  assert.equal(brain.conversationEnded("l0"), false);
  assert.equal(learnCalls().length, 0);

  const t0 = Date.now();
  await brain.handle("l1", "hey there");
  assert.equal(brain.conversationEnded("l1", t0), true);
  await new Promise((r) => setImmediate(r));
  assert.equal(learnCalls().length, 1);
  assert.equal(learnCalls()[0].model, "claude-haiku-5-5");
  assert.equal(learnCalls()[0].fallbacks, undefined);

  await brain.handle("l2", "how are you doing");
  assert.equal(brain.conversationEnded("l2", t0 + 60_000), true, "queued");
  await new Promise((r) => setImmediate(r));
  assert.equal(learnCalls().length, 1, "not again within 30 minutes");

  await brain.handle("l3", "thanks a lot");
  assert.equal(brain.conversationEnded("l3", t0 + 31 * 60_000), true);
  await new Promise((r) => setImmediate(r));
  assert.equal(learnCalls().length, 2);
  const sent = learnCalls()[1].messages[0].content;
  assert.match(sent, /how are you doing/, "the saved-up conversation is included");
  assert.match(sent, /thanks a lot/);
  _resetLearningForTests();
});

test("phone calls: the call itself runs on the small model, the safety screen on the strong one", async () => {
  assert.equal(callSettings().agentModel, "claude-haiku-5-5");
  const client = fakeClient([], () => json({ allowed: true, reason: "ok" }));
  const verdict = await screenWithClaude(client, { purpose: "reservation", goal: "Book a table for two" });
  assert.equal(verdict.ok, true);
  assert.equal(client.calls[0].model, "claude-opus-5-5");
});

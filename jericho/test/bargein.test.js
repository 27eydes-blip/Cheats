// Barge-in: talking over Jericho. The rules on the page (echo ignored, real speech accepted)
// and on the server (only the reply stops; tools, jobs and confirmations are unaffected).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fakeClient, say, use } from "./fake-client.js";
import { BARGE_DEFAULTS, createBargeDetector, decideBargeIn, echoMatch, isEcho, MIN_ECHO_MARGIN, shouldDropAsEcho, soundsLikeEcho, wordsMatch } from "../public/bargein.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-barge-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
const settingsFile = path.join(tmp, "settings.json");
fs.writeFileSync(settingsFile, JSON.stringify({ ...base, logFile: path.join(tmp, "actions.log"), briefing: { autoTime: "" } }));
process.env.JERICHO_SETTINGS = settingsFile;
process.env.JERICHO_DATA_DIR = path.join(tmp, "data");

const { Brain } = await import("../server/brain.js");
const { tools } = await import("../server/tools/index.js");
const { publicConfig } = await import("../server/config.js");

// ---- the page's rules ---------------------------------------------------------------------
/** Feed a level for `ms` milliseconds at 60 fps. */
function feed(det, level, from, ms) {
  for (let t = from; t <= from + ms; t += 16) det.level(level, t);
  return from + ms;
}

test("settings.json has the barge-in settings and the page gets them", () => {
  assert.deepEqual(base.bargeIn, { enabled: true, minLevel: BARGE_DEFAULTS.minLevel, minMs: BARGE_DEFAULTS.minMs, calibrateMs: 1500, echoTailMs: 700, duckTo: 0.85 });
  assert.ok(base.bargeIn.minMs >= 250 && base.bargeIn.minMs <= 300);
  assert.deepEqual(publicConfig().bargeIn, base.bargeIn);
});

test("echo of his own voice is ignored", () => {
  const spoken = "the weather today is sunny with a high of seventy two";
  for (const heard of ["the weather today is sunny", "sunny with a high", "weather today", "seventy two"]) {
    assert.equal(soundsLikeEcho(heard, spoken, "the weather today is sunny"), true, heard);
    assert.equal(decideBargeIn({ text: heard, spoken, sustained: true }).action, "ignore", heard);
  }
  assert.equal(isEcho("sunny with a high", spoken), true, "the existing check still works");
});

test("real speech over him is accepted", () => {
  const spoken = "the weather today is sunny with a high of seventy two";
  for (const heard of ["wait what about tomorrow", "no turn the lights off", "actually play some music"]) {
    assert.equal(decideBargeIn({ text: heard, spoken, sustained: true }).action, "interrupt", heard);
  }
});

test("quiet, short or brief sounds don't interrupt", () => {
  const spoken = "here is your briefing";
  assert.equal(decideBargeIn({ text: "wait what about tomorrow", spoken, sustained: false }).action, "ignore", "not loud for long enough");
  assert.equal(decideBargeIn({ text: "a", spoken, sustained: true }).action, "ignore");
  assert.equal(decideBargeIn({ text: "wait what", spoken, sustained: true, enabled: false }).action, "ignore", "turned off");
  assert.equal(decideBargeIn({ text: "stop", spoken, sustained: false, isKill: true }).action, "kill", "the kill phrase is unchanged");
});

test("a yes said over a confirmation read-back never counts as yes", () => {
  const spoken = "should i delete report dot txt say yes to confirm";
  assert.equal(decideBargeIn({ text: "yeah go ahead", spoken, sustained: true, confirmPending: true }).action, "reconfirm");
  assert.equal(decideBargeIn({ text: "no wait the other file", spoken, sustained: true, confirmPending: true }).action, "interrupt");
});

test("level must be clearly above the threshold for about 270 ms", () => {
  const det = createBargeDetector({}, "speakers");
  det.startReply(0);
  let t = feed(det, 0.05, 0, 1500); // his echo during the first second and a half
  assert.ok(Math.abs(det.echoLevel() - 0.05) < 1e-9, "echo level measured");
  const th = det.threshold(t + 1);
  assert.ok(th >= BARGE_DEFAULTS.minLevel * 1.4, "speakers are stricter than the base level");
  t = feed(det, th * 1.2, t + 16, 150);
  assert.equal(det.sustained(t), false, "150 ms is too short");
  t = feed(det, 0.02, t + 16, 100);
  t = feed(det, th * 1.2, t + 16, 300);
  assert.equal(det.sustained(t), true, "300 ms of real speech");
  assert.equal(det.sustained(t + 3000), false, "only counts if it was recent");
});

test("calibration raises the threshold above loud echo; headphones are more sensitive", () => {
  const det = createBargeDetector({}, "speakers");
  det.startReply(0);
  let t = feed(det, 0.3, 0, 1500); // loud speakers: lots of echo
  assert.ok(det.threshold(t + 1) >= 0.3 * 2.2 - 1e-9);
  t = feed(det, 0.35, t + 16, 400); // his echo, a bit louder: still not you
  assert.equal(det.sustained(t), false);

  const phones = createBargeDetector({}, "headphones");
  const speakers = createBargeDetector({}, "speakers");
  for (const d of [phones, speakers]) {
    d.startReply(0);
    feed(d, 0.01, 0, 1500);
  }
  assert.ok(phones.threshold(2000) < speakers.threshold(2000));
  const off = createBargeDetector({}, "off");
  assert.equal(off.enabled, false);
  assert.equal(createBargeDetector({ enabled: false }, "speakers").enabled, false);
});

// ---- echo: matching, the tail, calibration --------------------------------------------------
test("echo matching: his last sentences, fuzzy, case and punctuation ignored", () => {
  const recent = ["Good morning, Sammy.", "It's forty one degrees and cloudy.", "Bring a jacket today."];
  for (const heard of [
    "its forty one degrees and cloudy", // punctuation and case
    "IT'S FORTY-ONE DEGREES AND CLOUDY!",
    "forty one degree and cloud", // small recognition slips
    "bring a jacket to day",
    "cloudy bring a jacket", // spanning two sentences
    "good morning sammy",
  ]) assert.equal(echoMatch(heard, recent), true, heard);
  for (const heard of ["what about tomorrow", "turn off the kitchen lights", "no I meant the other jacket please now", "yes", "okay"]) {
    assert.equal(echoMatch(heard, recent), false, heard);
  }
  assert.equal(echoMatch("sure", ["Sure."]), true, "a short echo of a whole short sentence");
  assert.equal(echoMatch("yes", ["Should I send it to Sam? Say yes to confirm."]), false, "your short yes is never thrown away");
  assert.equal(wordsMatch("weather", "whether"), false, "two letters apart");
  assert.equal(wordsMatch("degrees", "degree"), true);
  assert.equal(wordsMatch("the", "she"), false, "short words must match exactly");
});

test("only checked while he talks, in the echo tail, or the first 400 ms of an utterance", () => {
  const recent = ["The Lions won thirty one to twenty four."];
  const echo = "the lions won thirty one";
  const base = { text: echo, recent };
  assert.equal(shouldDropAsEcho({ ...base, now: 5000, speaking: true }), true, "while he talks");
  assert.equal(shouldDropAsEcho({ ...base, now: 5000, tailUntil: 5700 }), true, "inside the 700 ms tail");
  assert.equal(shouldDropAsEcho({ ...base, now: 5800, tailUntil: 5700, utteranceStart: 5500 }), true, "first 400 ms of a new utterance");
  assert.equal(shouldDropAsEcho({ ...base, now: 9000, tailUntil: 5700, utteranceStart: 8000 }), false, "later, you can repeat his words on purpose");
  assert.equal(shouldDropAsEcho({ text: "what about the bears", recent, now: 5000, speaking: true }), false, "your own words aren't echo");
});

test("calibration: 1.5 s window, threshold at least 1.8x the echo, highest value kept per session", () => {
  const det = createBargeDetector({}, "headphones");
  det.startReply(0);
  let t = feed(det, 0.2, 0, 1400);
  assert.equal(det.calibrating(t), true, "still measuring at 1.4 s");
  t = feed(det, 0.2, t + 16, 200);
  assert.equal(det.calibrating(t), false, "done after 1.5 s");
  assert.ok(det.threshold(t) >= 0.2 * MIN_ECHO_MARGIN - 1e-9, "at least 1.8x the echo, even with headphones");

  // a quieter next reply doesn't lower the bar: the session keeps the loudest echo
  det.startReply(10_000);
  t = feed(det, 0.02, 10_000, 1600);
  assert.ok(det.threshold(t) >= 0.2 * MIN_ECHO_MARGIN - 1e-9);
  assert.ok(Math.abs(det.sessionEcho() - 0.2) < 1e-9);

  // echo just under 1.8x never interrupts; your louder voice does
  t = feed(det, 0.2 * 1.75, t + 16, 500);
  assert.equal(det.sustained(t), false);
  t = feed(det, 0.2 * 2.2, t + 16, 300);
  assert.equal(det.sustained(t), true);

  // Re-calibrate forgets it and measures again
  det.recalibrate(null);
  assert.equal(det.sessionEcho(), 0);
  det.startReply(20_000);
  t = feed(det, 0.03, 20_000, 1600);
  assert.ok(det.threshold(t) < 0.2 * MIN_ECHO_MARGIN, "lower again after re-calibrating");
});

test("a confirmed interruption needs about 270 ms, not a click or a word", () => {
  const det = createBargeDetector({ minMs: 270 }, "speakers");
  det.startReply(0);
  let t = feed(det, 0.01, 0, 1600);
  const loud = det.threshold(t) * 1.5;
  t = feed(det, loud, t + 16, 200);
  assert.equal(det.sustained(t, 80), false);
  t = feed(det, loud, t + 16, 100);
  assert.equal(det.sustained(t, 80), true);
});

// ---- the server ------------------------------------------------------------------------------
let slowRuns = 0;
tools.set("slow_tool", {
  risky: false,
  definition: { name: "slow_tool", description: "test", input_schema: { type: "object", properties: {}, additionalProperties: false } },
  async run(_input, ctx) {
    await new Promise((r) => setTimeout(r, 120));
    slowRuns++;
    return { finished: true, cancelled: Boolean(ctx.signal?.aborted) };
  },
});
let sends = 0;
tools.set("send_thing", {
  risky: true,
  definition: { name: "send_thing", description: "test", input_schema: { type: "object", properties: { to: { type: "string" } }, required: ["to"], additionalProperties: false } },
  confirmPrompt: (i) => `Should I send it to ${i.to}?`,
  async run() {
    sends++;
    return { sent: true };
  },
});

/** A client whose first streamed reply says one sentence, then hangs until it's aborted. */
function hangingClient(rest) {
  const client = fakeClient(rest);
  const normal = client.beta.messages.stream;
  let first = true;
  client.beta.messages.stream = (req, opts) => {
    if (!first) return normal(req, opts);
    first = false;
    client.calls.push(structuredClone(req));
    const handlers = {};
    return {
      on(event, cb) {
        (handlers[event] ||= []).push(cb);
        return this;
      },
      finalMessage() {
        for (const cb of handlers.text || []) cb("Here is a long story about the old days. And then");
        return new Promise((_, reject) => opts.signal.addEventListener("abort", () => reject(new Error("Request was aborted."))));
      },
    };
  };
  return client;
}

test("interrupting stops the reply; the next request knows it cut him off", async () => {
  const client = hangingClient([say("Tomorrow looks rainy.")]);
  const brain = new Brain({ client });
  const said = [];
  const first = brain.handle("b1", "tell me a story", { onSentence: (s) => said.push(s) });
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(brain.interrupt("b1"), { interrupted: true });
  const r1 = await first;
  assert.equal(r1.interrupted, true);
  assert.deepEqual(said, ["Here is a long story about the old days."]);
  const r2 = await brain.handle("b1", "what about tomorrow", {}, { interrupted: true });
  assert.equal(r2.reply, "Tomorrow looks rainy.");
  const msgs = client.calls[1].messages;
  assert.ok(msgs.some((m) => m.role === "assistant" && /cut off: the user interrupted/.test(m.content[0].text)), "what he said is kept");
  assert.ok(msgs.some((m) => m.role === "system" && /talked over your last reply/.test(m.content)));
  assert.deepEqual(brain.interrupt("b1"), { interrupted: false }, "nothing left to interrupt");
});

test("a stray interruption doesn't cancel a running tool", async () => {
  slowRuns = 0;
  const client = fakeClient([use("t1", "slow_tool", {}), say("Okay.")]);
  const brain = new Brain({ client });
  const p = brain.handle("b2", "do the slow thing", {}, { route: "always-strong" }); // slow_tool is a test tool the small model doesn't have
  await new Promise((r) => setTimeout(r, 30));
  brain.interrupt("b2");
  // the next request waits for the tool to finish, so the history stays in order
  const next = brain.handle("b2", "never mind that", {}, { interrupted: true });
  const r1 = await p;
  assert.equal(r1.interrupted, true);
  assert.equal(slowRuns, 1);
  assert.equal(client.calls.length, 1, "no new Claude call for the interrupted turn");
  await next;
  const toolResult = client.calls[1].messages.find((m) => m.role === "user" && m.content?.[0]?.type === "tool_result");
  assert.ok(toolResult, "the tool result made it into the history");
  assert.match(toolResult.content[0].content, /"finished":true,"cancelled":false/);
});

test("interrupting never counts as yes; a fresh yes still works; the kill switch still clears it", async () => {
  sends = 0;
  const client = fakeClient([use("c1", "send_thing", { to: "Sam" }), say("Sent.")]);
  const brain = new Brain({ client });
  const r = await brain.handle("b3", "send it to Sam");
  assert.equal(r.awaitingConfirmation, true);
  assert.equal(brain.interrupt("b3").interrupted, false, "interrupting the read-back leaves the confirmation waiting");

  const over = await brain.confirm("b3", "yes", {}, { interrupted: true });
  assert.equal(sends, 0, "a yes said over him did nothing");
  assert.equal(over.awaitingConfirmation, true);
  assert.match(over.reply, /Say yes again/);

  const yes = await brain.confirm("b3", "yes");
  assert.equal(sends, 1, "a fresh yes runs it");
  assert.equal(yes.awaitingConfirmation, false);

  const client2 = fakeClient([use("c2", "send_thing", { to: "Lee" })]);
  const brain2 = new Brain({ client: client2 });
  await brain2.handle("b4", "send it to Lee");
  const killed = await brain2.handle("b4", "Jericho, stop");
  assert.equal(killed.awaitingConfirmation, false);
  const after = await brain2.confirm("b4", "yes");
  assert.equal(sends, 1, "after the kill switch there's nothing to say yes to");
  assert.equal(after.awaitingConfirmation, false);
});

test("interrupting with something else counts as a no", async () => {
  sends = 0;
  const client = fakeClient([use("c5", "send_thing", { to: "Sam" }), say("Okay, the weather is mild.")]);
  const brain = new Brain({ client });
  await brain.handle("b5", "send it to Sam");
  const r = await brain.handle("b5", "actually what's the weather", {}, { interrupted: true });
  assert.equal(sends, 0);
  assert.equal(r.reply, "Okay, the weather is mild.");
  const declined = client.calls[1].messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).find((b) => b.type === "tool_result" && b.tool_use_id === "c5");
  assert.match(declined.content, /Not done/);
});

// Phone calls in test mode: rules, read-back, the yes gate, the simulated call, and the record.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fakeClient, json, say, use } from "./fake-client.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-calls-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
fs.writeFileSync(
  path.join(tmp, "settings.json"),
  JSON.stringify({ ...base, logFile: path.join(tmp, "actions.log"), calls: { ...base.calls, testMode: true, testScenario: "booked", maxCallsPerNumberPerDay: 2 } }),
);
process.env.JERICHO_SETTINGS = path.join(tmp, "settings.json");
process.env.JERICHO_DATA_DIR = path.join(tmp, "data");

const { Brain } = await import("../server/brain.js");
const { jobEvents } = await import("../server/tools/claudeCode.js");
const { listCalls } = await import("../server/calls/manager.js");
const log = () => fs.readFileSync(path.join(tmp, "actions.log"), "utf8");

const luigis = {
  businessName: "Luigi's",
  phoneNumber: "(212) 736-5000",
  purpose: "reservation",
  goal: "Book a table for four this Friday at seven PM",
  details: { date: "this Friday", time: "seven PM", partySize: 4, name: "Sammy" },
  plan: "ask for a table for four this Friday at seven",
};

/** Answers the side requests: the safety screen, the call agent and the pretend restaurant. */
function router({ allowed = true } = {}) {
  let agentTurns = 0;
  return (req) => {
    const sys = JSON.stringify(req.system || "");
    if (sys.includes("You screen outbound phone calls")) return json({ allowed, reason: allowed ? "Ordinary reservation." : "That sounds like harassment." });
    if (sys.includes("You play a busy but friendly staff member")) return say("Sure, Friday at seven for four works. What name?");
    if (sys.includes("live phone call")) {
      agentTurns++;
      if (agentTurns === 1) return json({ say: "I'd like to book a table for four this Friday at seven, please.", end_call: false, outcome: "in_progress", summary: "" });
      return json({ say: "It's under Sammy. Thanks so much, goodbye!", end_call: true, outcome: "booked", summary: "Table for four booked this Friday at seven under Sammy." });
    }
    return null;
  };
}

test("reads back the number, goal and plan, and dials nothing before a yes", async () => {
  const client = fakeClient([use("t1", "make_call", luigis), say("Calling now. I'll let you know how it goes.")], router());
  const brain = new Brain({ client });
  const r = await brain.handle("a", "call Luigi's and book a table for 4 at 7 on Friday");
  assert.equal(r.awaitingConfirmation, true);
  assert.match(r.reply, /Here's the plan\. I'll call Luigi's at 2 1 2, 7 3 6, 5 0 0 0\./);
  assert.match(r.reply, /The goal: Book a table for four this Friday at seven PM\./);
  assert.match(r.reply, /I'm an AI assistant calling for Sammy/);
  assert.match(r.reply, /test call/);
  assert.match(r.reply, /Should I dial\? Say yes to confirm\.$/);
  assert.equal(listCalls().length, 0, "nothing dialed yet");

  const announced = new Promise((resolve) => jobEvents.once("announce", resolve));
  const r2 = await brain.confirm("a", "yes");
  assert.match(r2.reply, /Calling now/);
  const spoken = await announced;
  assert.equal(spoken, "Test call. Good news from Luigi's. Table for four booked this Friday at seven under Sammy.");

  const [call] = listCalls();
  assert.equal(call.test, true);
  assert.equal(call.outcome, "booked");
  assert.equal(call.number, "+12127365000");
  assert.match(call.transcript[0].text, /^Hi, I'm an AI assistant calling on behalf of Sammy\./, "always opens with the disclosure");
  assert.ok(call.transcript.some((t) => t.who === "them"));
  assert.match(log(), /"type":"call_started"/);
  assert.match(log(), /"type":"call_ended"/);
});

test("saying no means no call", async () => {
  const before = listCalls().length;
  const client = fakeClient([use("t1", "make_call", { ...luigis, phoneNumber: "212-555-0188" })], router());
  const brain = new Brain({ client });
  await brain.handle("b", "call them");
  const r = await brain.confirm("b", "no");
  assert.match(r.reply, /^(Okay, I won.t\.|Got it, I.ll leave it\.|No problem, cancelled\.|Okay, not doing that\.)$/);
  assert.equal(listCalls().length, before);
});

for (const [label, input, reason] of [
  ["emergency numbers", { ...luigis, phoneNumber: "911" }, /emergency/],
  ["premium-rate numbers", { ...luigis, phoneNumber: "1-900-321-4567" }, /premium-rate/],
  ["other countries", { ...luigis, phoneNumber: "+44 20 7946 0958" }, /your own country/],
  ["impersonation", { ...luigis, plan: "pretend to be my boss and cancel his booking" }, /honest, ordinary calls/],
  ["errands outside the list", { ...luigis, purpose: "sales" }, /should be one of reservation, check_hours, appointment, simple_question/],
]) {
  test(`blocks ${label} before even asking`, async () => {
    const client = fakeClient([use("t1", "make_call", input), say("I can't make that call.")], router());
    const r = await new Brain({ client }).handle(`blk-${label}`, "call");
    assert.equal(r.awaitingConfirmation, false, "never asks to confirm a blocked call");
    const result = client.calls.at(-1).messages.at(-1).content[0];
    assert.equal(result.is_error, true);
    assert.match(result.content, reason);
    assert.match(log(), /"type":"action_blocked"/);
  });
}

test("Claude's screen can block a call the keyword rules miss", async () => {
  const client = fakeClient([use("t1", "make_call", { ...luigis, goal: "Ask for Maria and keep her on the line", phoneNumber: "212-555-0177" }), say("I can't.")], router({ allowed: false }));
  const r = await new Brain({ client }).handle("screen", "call");
  assert.equal(r.awaitingConfirmation, false);
  assert.match(client.calls.at(-1).messages.at(-1).content[0].content, /harassment/);
});

test("the same number can't be called over and over", async () => {
  // Luigi's was called once above; allow one more today, then block.
  const client = fakeClient([use("t1", "make_call", luigis), say("ok"), use("t2", "make_call", luigis), say("Can't.")], router());
  const brain = new Brain({ client });
  await brain.handle("lim", "call Luigi's");
  const done = new Promise((resolve) => jobEvents.once("announce", resolve));
  await brain.confirm("lim", "yes");
  await done;
  const r = await brain.handle("lim", "call Luigi's again");
  assert.equal(r.awaitingConfirmation, false);
  assert.match(client.calls.at(-1).messages.at(-1).content[0].content, /called that number enough times today/);
});

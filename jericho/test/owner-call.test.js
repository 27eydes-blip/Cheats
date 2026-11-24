// Owner calls: Jericho may phone the owner's own cell (MY_PHONE_NUMBER) and nobody else.
// Live (Twilio) mode with the network faked. The number below is made up for the test.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fakeClient, json, say, use } from "./fake-client.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-owner-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
const PUBLIC = "https://jericho-owner.example.com";
fs.writeFileSync(
  path.join(tmp, "settings.json"),
  JSON.stringify({ ...base, logFile: path.join(tmp, "actions.log"), calls: { ...base.calls, testMode: false, publicUrl: PUBLIC, ownerName: "Sammy", maxCallsPerDay: 5, maxCallsPerNumberPerDay: 2 } }),
);
const FAKE_OWNER = "(312) 736-4512"; // written the way someone might type it in .env
const FAKE_OWNER_E164 = "+13127364512";
Object.assign(process.env, {
  JERICHO_SETTINGS: path.join(tmp, "settings.json"),
  JERICHO_DATA_DIR: path.join(tmp, "data"),
  JERICHO_NO_ENV_FILE: "1",
  TWILIO_ACCOUNT_SID: `AC${"2".repeat(32)}`,
  TWILIO_AUTH_TOKEN: "e".repeat(32),
  TWILIO_PHONE_NUMBER: "+15005550006",
  MY_PHONE_NUMBER: FAKE_OWNER,
  JERICHO_ACCESS_TOKEN: "owner-test-access-token",
  ELEVENLABS_API_KEY: "el-test-key",
  JERICHO_NO_KEEPALIVE: "1",
});

const requests = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  requests.push({ url: u, init });
  if (u.includes("api.twilio.com")) return new Response(JSON.stringify({ sid: `CA${requests.length}` }), { status: 201 });
  if (u.includes("api.elevenlabs.io")) return new Response(Buffer.from("ID3-fake-mp3"), { status: 200 });
  throw new Error(`unexpected fetch ${u}`);
};

const { Brain } = await import("../server/brain.js");
const { jobEvents } = await import("../server/tools/claudeCode.js");
const { handleTwilio, listCalls, publicCalls } = await import("../server/calls/manager.js");
const { checkIntentKeywords, checkOwnerNumber, isOwnerNumber, ownerNumber } = await import("../server/calls/policy.js");
const { tools, isRisky } = await import("../server/tools/index.js");
const dials = () => requests.filter((q) => q.url.endsWith("/Calls.json"));
const waitFor = async (fn) => {
  for (let i = 0; i < 100; i++) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 20));
  }
  return null;
};

// The phone agent: for the owner call it passes on the message, for a business it books.
const agent = (req) => {
  const sys = JSON.stringify(req.system || "");
  if (sys.includes("You screen outbound phone calls")) {
    const asked = JSON.stringify(req.messages);
    return json(/my mom|grandma|private/i.test(asked) ? { allowed: false, reason: "That's a private person." } : { allowed: true, reason: "ok" });
  }
  if (sys.includes("on a live phone call with Sammy themselves")) {
    return /picked up/.test(JSON.stringify(req.messages)) || /said the line above/.test(JSON.stringify(req.messages))
      ? json({ say: "Just calling to say hi and remind you about the dentist at three.", end_call: false, outcome: "in_progress", summary: "" })
      : json({ say: "Okay, talk soon. Bye!", end_call: true, outcome: "delivered", summary: "Said hi and reminded you about the dentist at three." });
  }
  if (sys.includes("live phone call")) return json({ say: "Booked, thanks. Bye!", end_call: true, outcome: "booked", summary: "Table for two at eight." });
  return null;
};

const ownerAsk = { task: "Say hi and remind them about the dentist at three", kind: "reminder" };

test("the owner number is matched exactly after normalizing to +1 and ten digits", () => {
  assert.equal(ownerNumber(), FAKE_OWNER_E164);
  for (const same of [FAKE_OWNER_E164, "13127364512", "312.736.4512", "+1 (312) 736-4512"]) assert.equal(isOwnerNumber(same), true, same);
  for (const other of ["+13127364513", "+12127364512", "312-736-451", "+443127364512", "", "owner"]) assert.equal(isOwnerNumber(other), false, other);
  assert.deepEqual(checkOwnerNumber(), { ok: true, number: FAKE_OWNER_E164 });
  assert.equal(checkOwnerNumber("").ok, false, "MY_PHONE_NUMBER not set");
  assert.match(checkOwnerNumber("+447700900123").reason, /US number/, "US only");
  // the owner call tool has no number at all: Claude can't send it anywhere else
  const def = tools.get("call_owner").definition;
  assert.deepEqual(Object.keys(def.input_schema.properties).sort(), ["kind", "message", "task"]);
  assert.equal(def.input_schema.additionalProperties, false);
  assert.equal(isRisky("call_owner", ownerAsk), true, "it needs a yes");
});

test("'call me': Jericho reads the plan back (never the number), waits for yes, then rings only the owner", async () => {
  const client = fakeClient([use("o1", "call_owner", ownerAsk), say("Calling you now.")], agent);
  const brain = new Brain({ client });
  const r = await brain.handle("own", "give me a call and say hi");
  assert.equal(r.awaitingConfirmation, true, "confirmation is still required");
  assert.match(r.reply, /I'll call your phone and start with "Hey Sammy, it's Jericho\."/);
  assert.match(r.reply, /Should I dial\? Say yes to confirm\./);
  assert.ok(!/\d{3}/.test(r.reply), "the read-back never says the number");
  assert.equal(dials().length, 0, "nothing is dialed before the yes");

  await brain.confirm("own", "yes");
  const dial = await waitFor(() => dials()[0]);
  assert.ok(dial, "Twilio was asked to place the call");
  const form = new URLSearchParams(dial.init.body);
  assert.equal(form.get("To"), FAKE_OWNER_E164, "the number from .env, normalized");
  assert.equal(form.get("TimeLimit"), String(base.calls.maxMinutes * 60), "the minutes cap still applies");
  const call = listCalls().find((c) => c.owner);
  assert.equal(call.number, "owner", "the number isn't stored with the call");

  // They pick up: "Hey Sammy, it's Jericho," then the reminder; then goodbye.
  const voice = await handleTwilio("voice", call.id, {});
  assert.match(voice, /<Gather input="speech"/);
  assert.match(listCalls().find((c) => c.id === call.id).transcript[0].text, /^Hey Sammy, it's Jericho\. Just calling to say hi/);
  const gather = await handleTwilio("gather", call.id, { SpeechResult: "Thanks, I'd forgotten!" });
  assert.match(gather, /<Hangup\/><\/Response>$/);
  const announced = new Promise((resolve) => jobEvents.once("announce", resolve));
  await handleTwilio("status", call.id, { CallStatus: "completed", CallDuration: "21" });
  assert.equal(await announced, "I called your phone. Said hi and reminded you about the dentist at three.");

  // The number never reaches the log or the Calls page, in any form.
  const log = fs.readFileSync(path.join(tmp, "actions.log"), "utf8");
  for (const form of [FAKE_OWNER, FAKE_OWNER_E164, "3127364512", "13127364512"]) {
    assert.ok(!log.includes(form), `log leaks ${form}`);
    assert.ok(!JSON.stringify(publicCalls()).includes(form), `Calls page leaks ${form}`);
  }
  assert.match(log, /"type":"call_started".*"owner":true.*"number":"owner"/);
});

test("saying no means no call", async () => {
  const before = dials().length;
  const client = fakeClient([use("o2", "call_owner", { task: "Say hi", kind: "chat" })], agent);
  const brain = new Brain({ client });
  assert.equal((await brain.handle("no", "call my phone")).awaitingConfirmation, true);
  const r = await brain.confirm("no", "no");
  assert.equal(r.awaitingConfirmation, false);
  await new Promise((res) => setTimeout(res, 100));
  assert.equal(dials().length, before);
});

test("owner calls can't be aimed anywhere else; other people go through the normal call rules", async () => {
  // an owner call with a number slipped in is invalid input: nothing runs
  const sneaky = fakeClient([use("p2", "call_owner", { ...ownerAsk, phoneNumber: "+13127369988" }), say("Okay.")], agent);
  const r2 = await new Brain({ client: sneaky }).handle("sneak", "call me");
  assert.equal(r2.awaitingConfirmation, false);
  assert.match(JSON.stringify(sneaky.calls.at(-1).messages.at(-1)), /INVALID_INPUT/);
  // a different personal number is a normal call: read back digit by digit, AI disclosure, a yes
  const client = fakeClient([use("p1", "make_call", { businessName: "Luke", phoneNumber: "312-736-9988", purpose: "personal", goal: "Ask Luke if he's coming tonight", plan: "ask if he's coming tonight" })], agent);
  const r = await new Brain({ client }).handle("luke", "call 312 736 9988 and ask Luke if he's coming tonight");
  assert.equal(r.awaitingConfirmation, true);
  assert.match(r.reply, /I'll call Luke at 3 1 2, 7 3 6, 9 9 8 8\. .*I'm an AI assistant calling for Sammy/);
  assert.doesNotMatch(r.reply, /Hey Sammy, it's Jericho/, "only your own phone gets the owner greeting");
});

test("the daily limits apply to owner calls too", async () => {
  // two owner calls already today (one above, plus this one): the third is refused
  const client = fakeClient([use("l1", "call_owner", { task: "Say hi again", kind: "chat" }), say("Calling.")], agent);
  const brain = new Brain({ client });
  await brain.handle("lim", "call me again");
  await brain.confirm("lim", "yes");
  await waitFor(() => listCalls().filter((c) => c.owner).length === 2);
  const third = fakeClient([use("l2", "call_owner", { task: "Say hi a third time", kind: "chat" }), say("Can't.")], agent);
  const r = await new Brain({ client: third }).handle("lim2", "call me");
  assert.equal(r.awaitingConfirmation, false);
  assert.match(JSON.stringify(third.calls.at(-1).messages.at(-1)), /called that number enough times today/);
});

test("business calls still work as before", async () => {
  // one call at a time: end the owner calls still "on the line" from the tests above
  for (const c of listCalls().filter((x) => x.status !== "ended")) await handleTwilio("status", c.id, { CallStatus: "completed" });
  const before = dials().length;
  const client = fakeClient(
    [use("b1", "make_call", { businessName: "Luigi's", phoneNumber: "212-736-5000", purpose: "reservation", goal: "Book a table for two at eight tonight", details: { partySize: 2, name: "Sammy", time: "eight PM", date: "tonight" }, plan: "ask for a table for two at eight" }), say("Dialing.")],
    agent,
  );
  const brain = new Brain({ client });
  const r = await brain.handle("biz", "call Luigi's and book a table for two at eight");
  assert.equal(r.awaitingConfirmation, true);
  assert.match(r.reply, /I'll call Luigi's at 2 1 2, 7 3 6, 5 0 0 0\./);
  assert.match(r.reply, /I'm an AI assistant calling for Sammy/);
  await brain.confirm("biz", "yes");
  const dial = await waitFor(() => dials()[before]);
  assert.equal(new URLSearchParams(dial.init.body).get("To"), "+12127365000");
  const call = listCalls().find((c) => c.businessName === "Luigi's");
  assert.equal(call.owner, undefined);
  await handleTwilio("voice", call.id, {});
  assert.match(listCalls().find((c) => c.id === call.id).transcript[0].text, /^Hi, I'm an AI assistant calling on behalf of Sammy\./);
});

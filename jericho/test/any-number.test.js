// Calling any US number or a saved contact: the read-back and yes, the AI disclosure, the
// do-not-call list, the number rules and limits, contacts, recording, trial-account errors, and
// that full numbers never reach the log or the call records. Every number here is made up.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fakeClient, json, say, use } from "./fake-client.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-any-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
const PUBLIC = "https://jericho-any.example.com";
const { maxCallsPerDay: _drop, ...baseCalls } = base.calls;
fs.writeFileSync(
  path.join(tmp, "settings.json"),
  JSON.stringify({ ...base, logFile: path.join(tmp, "actions.log"), calls: { ...baseCalls, testMode: false, publicUrl: PUBLIC, ownerName: "Sammy" } }),
);
Object.assign(process.env, {
  JERICHO_SETTINGS: path.join(tmp, "settings.json"),
  JERICHO_DATA_DIR: path.join(tmp, "data"),
  JERICHO_NO_ENV_FILE: "1",
  TWILIO_ACCOUNT_SID: `AC${"3".repeat(32)}`,
  TWILIO_AUTH_TOKEN: "d".repeat(32),
  TWILIO_PHONE_NUMBER: "+15005550006",
  MY_PHONE_NUMBER: "+13127364512",
  JERICHO_ACCESS_TOKEN: "any-number-test-token",
  ELEVENLABS_API_KEY: "el-test-key",
  JERICHO_NO_KEEPALIVE: "1",
});

// made-up numbers (not real people)
const LUKE = "248-736-0123";
const LUKE_E164 = "+12487360123";
const AUNT = "(313) 736-4477";
const AUNT_E164 = "+13137364477";

const requests = [];
let twilioAnswer = () => new Response(JSON.stringify({ sid: `CA${requests.length}` }), { status: 201 });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  requests.push({ url: u, init });
  if (u.includes("api.twilio.com")) return twilioAnswer(u, init);
  if (u.includes("api.elevenlabs.io")) return new Response(Buffer.from("ID3-fake-mp3"), { status: 200 });
  throw new Error(`unexpected fetch ${u}`);
};

const { Brain } = await import("../server/brain.js");
const { jobEvents } = await import("../server/tools/claudeCode.js");
const { handleTwilio, listCalls, twilioProblem } = await import("../server/calls/manager.js");
const { checkIntentKeywords, checkLimits, checkNumber, numberKey, callSettings, last4 } = await import("../server/calls/policy.js");
const { isDoNotCall, listDnc, wantsNoCalls } = await import("../server/calls/dnc.js");
const { listContacts } = await import("../server/contacts.js");
const { maskPhones } = await import("../server/secrets.js");
const dials = () => requests.filter((q) => q.url.endsWith("/Calls.json"));
const log = () => fs.readFileSync(path.join(tmp, "actions.log"), "utf8");
const waitFor = async (fn) => {
  for (let i = 0; i < 100; i++) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 20));
  }
  return null;
};
/** Moves every saved call back in time (so the hourly limit from earlier tests has passed). */
function backdate(minutes) {
  const file = path.join(tmp, "data", "calls.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const c of data.calls) c.createdAt = new Date(Date.parse(c.createdAt) - minutes * 60_000).toISOString();
  fs.writeFileSync(file, JSON.stringify(data));
}
/** Ends every call still on the line (one call at a time). */
async function hangUpAll() {
  for (const c of listCalls().filter((x) => x.status !== "ended")) await handleTwilio("status", c.id, { CallStatus: "completed" });
}

const agent = (req) => {
  const sys = JSON.stringify(req.system || "");
  if (sys.includes("You screen outbound phone calls")) return json({ allowed: true, reason: "An ordinary personal call." });
  if (sys.includes("live phone call")) {
    const heard = JSON.stringify(req.messages);
    if (/said the line above/.test(heard)) return json({ say: "Sammy wanted to know if you're coming tonight.", end_call: false, outcome: "in_progress", summary: "", do_not_call: false });
    if (/remove my number from your list/.test(heard)) return json({ say: "Sorry about that. I won't call again. Goodbye.", end_call: true, outcome: "do_not_call", summary: "", do_not_call: true });
    return json({ say: "Great, I'll tell Sammy. Bye!", end_call: true, outcome: "info_obtained", summary: "Luke said he's coming around eight.", do_not_call: false });
  }
  return null;
};
const askLuke = { businessName: "Luke", personName: "Luke", phoneNumber: LUKE, purpose: "personal", goal: "Ask Luke if he's coming tonight", plan: "ask if he's coming tonight" };

// ---- confirmation, disclosure, records ------------------------------------------------------------

test("a spoken number: read back digit by digit, who and what, and nothing is dialed without a yes", async () => {
  const client = fakeClient([use("c1", "make_call", askLuke), say("Calling Luke now.")], agent);
  const brain = new Brain({ client });
  const r = await brain.handle("luke", "call 248-736-0123 and ask if they're coming tonight");
  assert.equal(r.awaitingConfirmation, true, "confirmation required");
  assert.match(r.reply, /^Here's the plan\. I'll call Luke at 2 4 8, 7 3 6, 0 1 2 3\./);
  assert.match(r.reply, /The goal: Ask Luke if he's coming tonight\./);
  assert.match(r.reply, /I'll start with "Hey Luke, I'm Jericho, Sammy Eyde's personal assistant\." Then: ask if he's coming tonight\./);
  assert.match(r.reply, /Should I dial\? Say yes to confirm\.$/);
  assert.equal(dials().length, 0, "nothing dialed before the yes");

  await brain.confirm("luke", "yes");
  const dial = await waitFor(() => dials()[0]);
  const form = new URLSearchParams(dial.init.body);
  assert.equal(form.get("To"), LUKE_E164);
  assert.equal(form.get("TimeLimit"), String(callSettings().maxMinutes * 60), "max call length from settings");
  assert.equal(form.get("Record"), null, "not recorded unless asked");

  // the call: the AI disclosure first, then the question
  const call = listCalls().find((c) => c.businessName === "Luke");
  await handleTwilio("voice", call.id, {});
  const opening = listCalls().find((c) => c.id === call.id).transcript[0].text;
  assert.match(opening, /^Hey Luke, I'm Jericho, Sammy Eyde's personal assistant\. Sammy wanted to know/);
  assert.doesNotMatch(opening, /recorded/);
  await handleTwilio("gather", call.id, { SpeechResult: "Yeah, I'll be there around eight." });
  const announced = new Promise((resolve) => jobEvents.once("announce", resolve));
  await handleTwilio("status", call.id, { CallStatus: "completed", CallDuration: "30" });
  assert.equal(await announced, "I called Luke. Luke said he's coming around eight.");

  // only the last 4 digits in the record; the full number nowhere in the log or call file
  const saved = listCalls().find((c) => c.id === call.id);
  assert.equal(saved.number, "...0123");
  const files = fs.readFileSync(path.join(tmp, "data", "calls.json"), "utf8") + log();
  for (const form of [LUKE, LUKE_E164, "2487360123", "248 736 0123", "2 4 8, 7 3 6, 0 1 2 3"]) assert.ok(!files.includes(form), `leaked ${form}`);
});

test("no yes, no call: a no, silence, or a yes said over the read-back never dials", async () => {
  await hangUpAll();
  const before = dials().length;
  const client = fakeClient([use("c2", "make_call", { ...askLuke, businessName: "Aunt May", phoneNumber: AUNT, goal: "Say happy birthday", plan: "wish her a happy birthday" })], agent);
  const brain = new Brain({ client });
  assert.equal((await brain.handle("aunt", "call my aunt")).awaitingConfirmation, true);
  const over = await brain.confirm("aunt", "yes", {}, { interrupted: true });
  assert.equal(over.awaitingConfirmation, true, "a yes said over the read-back doesn't count");
  const no = await brain.confirm("aunt", "no");
  assert.equal(no.awaitingConfirmation, false);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(dials().length, before);
});

test("several numbers in one go: only one call, never in bulk", async () => {
  await hangUpAll();
  const client = fakeClient(
    [
      {
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "b1", name: "make_call", input: { ...askLuke, businessName: "Ann", phoneNumber: "313-736-1001" } },
          { type: "tool_use", id: "b2", name: "make_call", input: { ...askLuke, businessName: "Bob", phoneNumber: "313-736-1002" } },
        ],
      },
    ],
    agent,
  );
  const r = await new Brain({ client }).handle("bulk", "call Ann and Bob");
  assert.equal(r.awaitingConfirmation, true);
  assert.match(r.reply, /I'll call Ann/);
  assert.doesNotMatch(r.reply, /Bob/, "the second call is refused, not read back");
});

// ---- do not call --------------------------------------------------------------------------------------

test("'don't call again': ends politely at once, joins the do-not-call list, and is blocked from then on", async () => {
  await hangUpAll();
  const client = fakeClient([use("d1", "make_call", { ...askLuke, businessName: "Carl", phoneNumber: "313-736-2200" })], agent);
  const brain = new Brain({ client });
  await brain.handle("dnc", "call 313 736 2200 and ask if Carl is coming");
  await brain.confirm("dnc", "yes");
  await waitFor(() => listCalls().find((c) => c.businessName === "Carl" && c.twilioSid));
  const call = listCalls().find((c) => c.businessName === "Carl");
  await handleTwilio("voice", call.id, {});
  const bye = await handleTwilio("gather", call.id, { SpeechResult: "Who is this? Please don't call this number again." });
  assert.match(bye, /<Say voice="Polly\.Matthew-Neural" language="en-US"><prosody rate="95%">Understood\. I won&apos;t call this number again\. Sorry to bother you\. Goodbye\.<\/prosody><\/Say><Hangup\/>/);
  assert.ok(isDoNotCall("+13137362200"));
  const dnc = fs.readFileSync(path.join(tmp, "data", "dnc.json"), "utf8");
  assert.ok(!dnc.includes("3137362200") && !dnc.includes("736-2200"), "only the last 4 digits and a hash are kept");
  assert.equal(listDnc().at(-1).last4, "...2200");
  const announced = new Promise((resolve) => jobEvents.once("announce", resolve));
  await handleTwilio("status", call.id, { CallStatus: "completed" });
  assert.match(await announced, /^Carl asked not to be called again/);

  // every later call to it is refused before you're even asked, however it's written
  for (const written of ["313-736-2200", "+1 (313) 736 2200", "13137362200"]) {
    const again = fakeClient([use("d2", "make_call", { ...askLuke, businessName: "Carl", phoneNumber: written }), say("I can't.")], agent);
    const r = await new Brain({ client: again }).handle("dnc2", "call Carl again");
    assert.equal(r.awaitingConfirmation, false, written);
    assert.match(again.calls.at(-1).messages.at(-1).content[0].content, /do-not-call list/);
  }
});

test("the agent's own do-not-call flag works too, and the stop phrases are caught in code", async () => {
  await hangUpAll();
  const client = fakeClient([use("d3", "make_call", { ...askLuke, businessName: "Dee", phoneNumber: "313-736-3300" })], agent);
  const brain = new Brain({ client });
  await brain.handle("dnc3", "call Dee");
  await brain.confirm("dnc3", "yes");
  await waitFor(() => listCalls().find((c) => c.businessName === "Dee" && c.twilioSid));
  const call = listCalls().find((c) => c.businessName === "Dee");
  await handleTwilio("voice", call.id, {});
  const twiml = await handleTwilio("gather", call.id, { SpeechResult: "You can remove my number from your list." });
  assert.match(twiml, /<Hangup\/>/);
  assert.ok(isDoNotCall("+13137363300"));
  for (const t of ["Stop.", "stop calling me", "Do not call this number", "take me off your list", "put us on your do-not-call list", "unsubscribe"]) assert.equal(wantsNoCalls(t), true, t);
  for (const t of ["Yes, I'll stop by later", "sure, see you tonight", "call me back tomorrow"]) assert.equal(wantsNoCalls(t), false, t);
});

// ---- number rules and limits ----------------------------------------------------------------------------

test("emergency numbers, short codes, premium-rate, toll and non-US numbers are refused", () => {
  for (const [n, why] of [
    ["911", /emergency/],
    ["988", /emergency/],
    ["311", /emergency/],
    ["12345", /too short/],
    ["1-911-555-1234", /isn't a valid US number/],
    ["1-900-321-4567", /premium-rate or toll/],
    ["1-976-321-4567", /premium-rate or toll/],
    ["212-976-4567", /premium-rate or toll/],
    ["1-500-321-4567", /premium-rate or toll/],
    ["+44 20 7946 0958", /only call US numbers/],
    ["+1 876 555 2345", /outside the US/],
    ["+1 416 736 2345", /outside the US/],
    ["+1 809 736 2345", /outside the US/],
    ["248-555-0123", /fictional/],
  ]) {
    const r = checkNumber(n);
    assert.equal(r.ok, false, n);
    assert.match(r.reason, why, n);
  }
  for (const ok of [LUKE, AUNT, "1-800-736-2345", "+1 787 736 2345"]) assert.equal(checkNumber(ok).ok, true, ok);
});

test("limits: 2 a day per number, 10 minutes between calls to it, 4 an hour, and the daily cap (default 10)", () => {
  assert.equal(callSettings().maxCallsPerDay, 10, "the new default");
  assert.equal(base.calls.maxCallsPerDay, 10, "settings.json says 10 too");
  const now = Date.parse("2026-11-24T18:00:00Z");
  const at = (minAgo, key = "k1", extra = {}) => ({ createdAt: new Date(now - minAgo * 60_000).toISOString(), numberKey: key, test: false, ...extra });
  assert.equal(checkLimits([], "k1", false, now).ok, true);
  assert.match(checkLimits([at(5)], "k1", false, now).reason, /less than 10 minutes ago/);
  assert.equal(checkLimits([at(11)], "k1", false, now).ok, true, "after 10 minutes");
  assert.match(checkLimits([at(200), at(100)], "k1", false, now).reason, /enough times today/);
  assert.equal(checkLimits([at(60 * 25), at(60 * 26)], "k1", false, now).ok, true, "a new day");
  assert.match(checkLimits([at(10, "a"), at(20, "b"), at(30, "c"), at(40, "d")], "k1", false, now).reason, /in bulk/, "4 an hour at most");
  assert.equal(checkLimits([at(10, "a"), at(20, "b"), at(30, "c"), at(40, "d")], "owner", false, now).ok, true, "owner calls work as before");
  const ten = Array.from({ length: 10 }, (_, i) => at(90 + i * 60, `x${i}`));
  assert.match(checkLimits(ten, "k1", false, now).reason, /10 calls in the last day/);
  assert.equal(checkLimits(ten.slice(1), "k1", false, now).ok, true);
  // settings can lower the per-number cap but never raise it past 2
  assert.equal(callSettings().maxCallsPerNumberPerDay <= 2, true);
  assert.equal(numberKey(LUKE), numberKey(LUKE_E164), "the same number however it's written");
  assert.notEqual(numberKey(LUKE), numberKey(AUNT));
  assert.equal(last4(LUKE), "...0123");
});

test("threats, harassment, scams, deception and impersonation are refused and explained", () => {
  for (const goal of [
    "Threaten him until he pays",
    "Keep calling her until she answers",
    "Tell them their account is locked and ask for the one-time code",
    "Say you're from their bank and verify their account",
    "Pretend to be Sammy",
    "Say it's Mike calling",
    "Act like you're the landlord",
    "Scare him a little",
    "Mislead her about who's calling",
  ]) {
    const r = checkIntentKeywords({ purpose: "personal", goal, plan: goal, businessName: "Someone" });
    assert.equal(r.ok, false, goal);
    assert.match(r.reason, /no threats, harassment, scams, tricks or pretending to be anyone/);
  }
  assert.equal(checkIntentKeywords({ purpose: "personal", goal: "Ask Luke if he's coming tonight", plan: "ask", businessName: "Luke" }).ok, true);
});

// ---- contacts ------------------------------------------------------------------------------------------------

test("contacts: save, list (last 4 digits only), call by name, and delete with a yes", async () => {
  await hangUpAll();
  const client = fakeClient(
    [use("s1", "save_contact", { name: "Luke", phoneNumber: LUKE }), say("Saved Luke: 2 4 8, 7 3 6, 0 1 2 3."), use("s2", "list_contacts", {}), say("Just Luke.")],
    agent,
  );
  const brain = new Brain({ client });
  await brain.handle("ct", "save Luke's number as 248 736 0123");
  assert.deepEqual(listContacts().map((c) => [c.name, c.number]), [["Luke", LUKE_E164]]);
  assert.match(JSON.stringify(client.calls[1].messages.at(-1)), /2 4 8, 7 3 6, 0 1 2 3/, "read back digit by digit");
  await brain.handle("ct", "who's in my contacts");
  const listed = JSON.parse(client.calls[3].messages.at(-1).content[0].content);
  assert.deepEqual(listed.contacts, [{ name: "Luke", endsIn: "0123" }]);

  // "call Luke": the number comes from contacts and is still read back in full
  const caller = fakeClient([use("s3", "make_call", { businessName: "Luke", contact: "luke", purpose: "personal", goal: "Ask if he's free Saturday", plan: "ask if he's free Saturday" })], agent);
  const r = await new Brain({ client: caller }).handle("ct2", "call Luke and ask if he's free Saturday");
  // Luke was called once today already (the first test), 15+ minutes are needed between calls
  assert.equal(r.awaitingConfirmation, false);
  assert.match(caller.calls.at(-1).messages.at(-1).content[0].content, /less than 10 minutes ago/);
  const unknown = fakeClient([use("s4", "make_call", { businessName: "Zed", contact: "Zed", purpose: "personal", goal: "Say hi", plan: "say hi" }), say("I don't have Zed.")], agent);
  await new Brain({ client: unknown }).handle("ct3", "call Zed");
  assert.match(unknown.calls.at(-1).messages.at(-1).content[0].content, /don't have a contact called Zed/);

  // delete needs a yes
  const del = fakeClient([use("s5", "delete_contact", { name: "Luke" }), say("Deleted.")], agent);
  const b2 = new Brain({ client: del });
  const ask = await b2.handle("ct4", "delete Luke from contacts");
  assert.equal(ask.awaitingConfirmation, true);
  assert.match(ask.reply, /Should I delete Luke from your contacts\?/);
  assert.equal(listContacts().length, 1, "not before the yes");
  await b2.confirm("ct4", "yes");
  assert.equal(listContacts().length, 0);
  assert.ok(!log().includes("2487360123") && !log().includes(LUKE_E164));
});

test("calling a saved contact reads its number back in full", async () => {
  await hangUpAll();
  const save = fakeClient([use("s6", "save_contact", { name: "Aunt May", phoneNumber: AUNT }), say("Saved.")], agent);
  await new Brain({ client: save }).handle("ct5", "save Aunt May's number as 313 736 4477");
  const caller = fakeClient([use("s7", "make_call", { businessName: "Aunt May", contact: "aunt may", purpose: "personal", goal: "Say happy birthday", plan: "wish her a happy birthday" })], agent);
  const r = await new Brain({ client: caller }).handle("ct6", "call Aunt May and say happy birthday");
  assert.equal(r.awaitingConfirmation, true);
  assert.match(r.reply, /I'll call Aunt May at 3 1 3, 7 3 6, 4 4 7 7\./);
});

// ---- recording, trial accounts, privacy -----------------------------------------------------------------------

test("recording only when asked, and announced at the start", async () => {
  await hangUpAll();
  const client = fakeClient([use("r1", "make_call", { ...askLuke, businessName: "Eve", personName: "Eve", phoneNumber: "313-736-5500", record: true }), say("Calling.")], agent);
  const brain = new Brain({ client });
  const r = await brain.handle("rec", "call Eve and record the call");
  assert.match(r.reply, /You asked me to record it, so I'll say at the start that the call is being recorded\./);
  await brain.confirm("rec", "yes");
  const dial = await waitFor(() => dials().find((d) => new URLSearchParams(d.init.body).get("To") === "+13137365500"));
  assert.equal(new URLSearchParams(dial.init.body).get("Record"), "true");
  const call = listCalls().find((c) => c.businessName === "Eve");
  await handleTwilio("voice", call.id, {});
  assert.match(listCalls().find((c) => c.id === call.id).transcript[0].text, /^Hey Eve, I'm Jericho, Sammy Eyde's personal assistant\. This call is being recorded\./);
});

test("a trial account's 'unverified number' refusal is said in plain words", async () => {
  await hangUpAll();
  backdate(61); // the earlier tests made 4 calls this hour, the most allowed
  twilioAnswer = () => new Response(JSON.stringify({ code: 21219, message: "The number +13137366600 is unverified. Trial accounts cannot call unverified numbers." }), { status: 400 });
  try {
    const client = fakeClient([use("t1", "make_call", { ...askLuke, businessName: "Fay", phoneNumber: "313-736-6600" }), say("Calling.")], agent);
    const brain = new Brain({ client });
    await brain.handle("trial", "call Fay");
    const announced = new Promise((resolve) => jobEvents.once("announce", resolve));
    await brain.confirm("trial", "yes");
    assert.equal(await announced, "The call to Fay didn't work out. Twilio won't dial unverified numbers on a trial account. Verify the number in the Twilio console, or upgrade the account.");
    assert.ok(!log().includes("3137366600"), "Twilio's message is logged without the number");
  } finally {
    twilioAnswer = () => new Response(JSON.stringify({ sid: `CA${requests.length}` }), { status: 201 });
  }
  assert.match(twilioProblem(400, { code: 21219 }).friendly, /^Twilio won't dial unverified numbers on a trial account/);
  assert.match(twilioProblem(401, {}).friendly, /account SID and auth token/);
});

test("phone numbers are masked to their last 4 digits wherever they're written", () => {
  for (const [t, want] of [
    ["call 248-736-0123 now", "call [phone ...0123] now"],
    ["(248) 736 0123", "[phone ...0123]"],
    ["+1 248 736 0123", "[phone ...0123]"],
    ["2 4 8, 7 3 6, 0 1 2 3", "[phone ...0123]"],
    ["2026-11-24T02:35:37.961Z", "2026-11-24T02:35:37.961Z"],
    ["table for 4 at 7:30", "table for 4 at 7:30"],
    ["CA0123456789abcdef", "CA0123456789abcdef"],
  ]) assert.equal(maskPhones(t), want, t);
  assert.match(log(), /\[phone \.\.\.0123\]/, "the request was logged, masked");
});

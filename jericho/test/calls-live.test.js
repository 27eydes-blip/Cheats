// Live (Twilio) mode with the network faked: the dial request, signed webhooks, TwiML,
// the hang-up, the announcement, and that keys and your number never leak.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fakeClient, json, say, use } from "./fake-client.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-live-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
const PUBLIC = "https://jericho.example.ts.net";
fs.writeFileSync(
  path.join(tmp, "settings.json"),
  JSON.stringify({ ...base, logFile: path.join(tmp, "actions.log"), calls: { ...base.calls, testMode: false, publicUrl: PUBLIC } }),
);
const SID = `AC${"1".repeat(32)}`;
const TOKEN = "f".repeat(32);
const MINE = "+12127364567";
Object.assign(process.env, {
  JERICHO_SETTINGS: path.join(tmp, "settings.json"),
  JERICHO_DATA_DIR: path.join(tmp, "data"),
  TWILIO_ACCOUNT_SID: SID,
  TWILIO_AUTH_TOKEN: TOKEN,
  TWILIO_PHONE_NUMBER: "+15005550006",
  MY_PHONE_NUMBER: MINE,
  JERICHO_ACCESS_TOKEN: "local-secret",
  ELEVENLABS_API_KEY: "el-test-key",
  JERICHO_NO_KEEPALIVE: "1", // fake network below replaces the built-in fetch
});

const requests = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  requests.push({ url: u, init });
  if (u.includes("api.twilio.com")) return new Response(JSON.stringify({ sid: "CA123" }), { status: 201 });
  if (u.includes("api.elevenlabs.io")) return new Response(Buffer.from("ID3-fake-mp3"), { status: 200 });
  throw new Error(`unexpected fetch ${u}`);
};

const { Brain } = await import("../server/brain.js");
const { jobEvents } = await import("../server/tools/claudeCode.js");
const { callAudio, handleTwilio, listCalls, publicCalls, validTwilioSignature } = await import("../server/calls/manager.js");

const luigis = {
  businessName: "Luigi's",
  phoneNumber: "212-736-5000",
  purpose: "reservation",
  goal: "Book a table for four this Friday at seven PM",
  details: { partySize: 4, name: "Sammy", time: "seven PM", date: "Friday" },
  plan: "ask for a table for four this Friday at seven",
};

let turn = 0;
const router = (req) => {
  const sys = JSON.stringify(req.system || "");
  if (sys.includes("You screen outbound phone calls")) return json({ allowed: true, reason: "ok" });
  if (sys.includes("live phone call")) {
    turn++;
    if (turn === 1) return json({ say: "I'd like a table for four this Friday at seven.", end_call: false, outcome: "in_progress", summary: "" });
    return json({ say: `Booked under Sammy, and the callback number is ${MINE}. Thanks, bye!`, end_call: true, outcome: "booked", summary: "Table for four on Friday at seven under Sammy." });
  }
  return null;
};

test("a real call: dial, speak, listen, hang up, announce, never leak", async () => {
  const client = fakeClient([use("t1", "make_call", luigis), say("Dialing now.")], router);
  const brain = new Brain({ client });
  const r = await brain.handle("live", "call Luigi's");
  assert.equal(r.awaitingConfirmation, true);
  assert.doesNotMatch(r.reply, /test call/);
  assert.equal(requests.filter((q) => q.url.includes("twilio")).length, 0, "no dialing before yes");

  await brain.confirm("live", "yes");
  for (let i = 0; i < 50 && !requests.some((q) => q.url.includes("api.twilio.com")); i++) await new Promise((r) => setTimeout(r, 20));
  const dial = requests.find((q) => q.url.includes("api.twilio.com"));
  assert.ok(dial, "Twilio was asked to place the call");
  assert.equal(dial.url, `https://api.twilio.com/2010-04-01/Accounts/${SID}/Calls.json`);
  const form = new URLSearchParams(dial.init.body);
  assert.equal(form.get("To"), "+12127365000");
  assert.equal(form.get("From"), "+15005550006");
  assert.equal(form.get("TimeLimit"), "300", "five-minute cap enforced by Twilio");
  const [call] = listCalls();
  assert.equal(form.get("Url"), `${PUBLIC}/twilio/voice?call=${call.id}`);
  assert.equal(form.get("StatusCallback"), `${PUBLIC}/twilio/status?call=${call.id}`);

  // They pick up: Jericho speaks with ElevenLabs audio, then listens.
  const voice = await handleTwilio("voice", call.id, {});
  const audioId = voice.match(/twilio\/audio\/([0-9a-f]{32})/)[1];
  assert.match(voice, /<Gather input="speech" action="https:\/\/jericho\.example\.ts\.net\/twilio\/gather\?call=/);
  assert.equal((await callAudio(audioId)).toString(), "ID3-fake-mp3");
  assert.match(listCalls()[0].transcript[0].text, /^Hi, I'm an AI assistant calling on behalf of Sammy\./);

  // They answer; the agent wraps up and hangs up.
  const gather = await handleTwilio("gather", call.id, { SpeechResult: "Sure, four at seven Friday works. What name?" });
  assert.match(gather, /<Hangup\/><\/Response>$/);

  const announced = new Promise((resolve) => jobEvents.once("announce", resolve));
  await handleTwilio("status", call.id, { CallStatus: "completed", CallDuration: "48" });
  assert.equal(await announced, "Good news from Luigi's. Table for four on Friday at seven under Sammy.");
  const saved = listCalls()[0];
  assert.equal(saved.outcome, "booked");
  assert.equal(saved.durationSec, 48);

  // Privacy: your number is hidden on the /calls page; keys never reach the log.
  assert.match(JSON.stringify(saved.transcript), /\+12127364567/, "kept in the private file");
  assert.doesNotMatch(JSON.stringify(publicCalls()), /2127364567/);
  const log = fs.readFileSync(path.join(tmp, "actions.log"), "utf8");
  for (const secret of [TOKEN, SID, MINE, "2127364567", "el-test-key", "local-secret"]) assert.ok(!log.includes(secret), `log leaks ${secret}`);
});

test("calling your own number is allowed as a rehearsal, without the business screen", async () => {
  const strict = (req) => (JSON.stringify(req.system || "").includes("You screen outbound") ? json({ allowed: false, reason: "Private individual." }) : null);
  const client = fakeClient([use("t5", "make_call", { ...luigis, businessName: "my phone", phoneNumber: MINE })], strict);
  const r = await new Brain({ client }).handle("own", "practice a call to my phone");
  assert.equal(r.awaitingConfirmation, true);
  assert.ok(!client.calls.some((c) => JSON.stringify(c.system || "").includes("You screen outbound")));
});

test("webhooks must carry Twilio's signature", () => {
  const url = `${PUBLIC}/twilio/gather?call=c1`;
  const params = { CallSid: "CA123", SpeechResult: "hello" };
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const good = crypto.createHmac("sha1", TOKEN).update(data).digest("base64");
  assert.equal(validTwilioSignature(good, url, params), true);
  assert.equal(validTwilioSignature(good, url, { ...params, SpeechResult: "tampered" }), false);
  assert.equal(validTwilioSignature("", url, params), false);
});

test("no answer is reported out loud, and fictional numbers are refused in live mode", async () => {
  const fake = fakeClient([use("t8", "make_call", { ...luigis, businessName: "Nowhere Diner", phoneNumber: "212-555-0142" }), say("Can't.")], router);
  const r0 = await new Brain({ client: fake }).handle("fict", "call");
  assert.equal(r0.awaitingConfirmation, false);
  assert.match(fake.calls.at(-1).messages.at(-1).content[0].content, /fictional/);

  const client = fakeClient([use("t9", "make_call", { ...luigis, businessName: "Pho 99", phoneNumber: "212-736-5099" }), say("Dialing.")], router);
  const brain = new Brain({ client });
  await brain.handle("na", "call Pho 99");
  await brain.confirm("na", "yes");
  let call;
  for (let i = 0; i < 50 && !(call = listCalls().find((c) => c.businessName === "Pho 99" && c.twilioSid)); i++) await new Promise((r) => setTimeout(r, 20));
  const announced = new Promise((resolve) => jobEvents.once("announce", resolve));
  await handleTwilio("status", call.id, { CallStatus: "no-answer" });
  assert.equal(await announced, "Pho 99 didn't answer.");
  assert.equal(listCalls().find((c) => c.id === call.id).outcome, "no_answer");
});

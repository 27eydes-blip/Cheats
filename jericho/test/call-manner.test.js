// How Jericho sounds on calls: the fixed opening line (with a name, without one, the owner),
// the honest answer to "are you an AI?", calm speech, and the calmer call voice settings.
// Live (Twilio) mode with the network faked. Every number here is made up.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fakeClient, json, say, use } from "./fake-client.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-manner-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
fs.writeFileSync(
  path.join(tmp, "settings.json"),
  JSON.stringify({ ...base, logFile: path.join(tmp, "actions.log"), calls: { ...base.calls, testMode: false, publicUrl: "https://jericho-manner.example.com" } }),
);
Object.assign(process.env, {
  JERICHO_SETTINGS: path.join(tmp, "settings.json"),
  JERICHO_DATA_DIR: path.join(tmp, "data"),
  JERICHO_NO_ENV_FILE: "1",
  TWILIO_ACCOUNT_SID: `AC${"4".repeat(32)}`,
  TWILIO_AUTH_TOKEN: "c".repeat(32),
  TWILIO_PHONE_NUMBER: "+15005550006",
  MY_PHONE_NUMBER: "+13127364512",
  JERICHO_ACCESS_TOKEN: "manner-test-token",
  ELEVENLABS_API_KEY: "el-test-key",
  JERICHO_NO_KEEPALIVE: "1",
});

const ttsBodies = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.includes("api.twilio.com")) return new Response(JSON.stringify({ sid: "CA77" }), { status: 201 });
  if (u.includes("api.elevenlabs.io")) {
    ttsBodies.push(JSON.parse(init.body));
    return new Response(Buffer.from("ID3-fake-mp3"), { status: 200 });
  }
  throw new Error(`unexpected fetch ${u}`);
};

const { Brain } = await import("../server/brain.js");
const { asksIfAi, calmSpeech, disclosure, ensureHonest, greetingName, ownerGreeting } = await import("../server/calls/agent.js");
const { callVoice, describePlan, handleTwilio, listCalls, withGreetingName } = await import("../server/calls/manager.js");
const { callSettings } = await import("../server/calls/policy.js");
const { saveContact } = await import("../server/contacts.js");
const { synthesize } = await import("../server/tts.js");
const waitFor = async (fn) => {
  for (let i = 0; i < 100; i++) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 20));
  }
  return null;
};

// ---- the opening line -----------------------------------------------------------------------------

test("with a name: \"Hey Luke, I'm Jericho, Sammy Eyde's personal assistant.\"", () => {
  assert.equal(disclosure({ purpose: "personal", personName: "Luke" }), "Hey Luke, I'm Jericho, Sammy Eyde's personal assistant.");
  assert.equal(disclosure({ purpose: "personal", personName: "Aunt May" }), "Hey Aunt May, I'm Jericho, Sammy Eyde's personal assistant.");
  assert.equal(disclosure({ purpose: "personal", personName: "Luke", record: true }), "Hey Luke, I'm Jericho, Sammy Eyde's personal assistant. This call is being recorded.");
  // a saved contact fills in the name
  saveContact("Luke", "248-736-0123");
  const input = withGreetingName({ businessName: "Luke", contact: "luke", purpose: "personal", goal: "Ask about tonight", plan: "ask about tonight" });
  assert.equal(input.personName, "Luke");
  assert.match(describePlan(input, "+12487360123"), /I'll start with "Hey Luke, I'm Jericho, Sammy Eyde's personal assistant\." Then: ask about tonight\./);
});

test("without a name: \"Hello, I'm Jericho, Sammy Eyde's personal assistant.\" (never a guessed name)", () => {
  const hello = "Hello, I'm Jericho, Sammy Eyde's personal assistant.";
  assert.equal(disclosure({ purpose: "reservation" }), hello, "a business");
  assert.equal(disclosure({ purpose: "reservation", personName: "Luigi" }), hello, "businesses never get a first name");
  assert.equal(disclosure({ purpose: "personal" }), hello, "an unknown number");
  for (const junk of ["unknown", "them", "248-736-0123", "", "   ", "the person", "x".repeat(41)]) assert.equal(greetingName({ purpose: "personal", personName: junk }), "", JSON.stringify(junk));
  assert.equal(withGreetingName({ phoneNumber: "313-736-9999", purpose: "personal" }).personName, undefined, "a spoken number with no name stays nameless");
});

test("owner calls keep \"Hey Sammy, it's Jericho.\"", () => {
  assert.equal(ownerGreeting(), "Hey Sammy, it's Jericho.");
});

test("the opener and the request go out together on a real call", async () => {
  const agent = (req) => {
    const sys = JSON.stringify(req.system || "");
    if (sys.includes("You screen outbound phone calls")) return json({ allowed: true, reason: "ok" });
    if (sys.includes("live phone call")) {
      const msgs = JSON.stringify(req.messages);
      if (/said the line above/.test(msgs)) return json({ say: "Sammy wants to know if you're coming tonight.", end_call: false, outcome: "in_progress", summary: "", do_not_call: false });
      if (/around eight/.test(msgs)) return json({ say: "So that's eight tonight. Thanks. Goodbye!", end_call: true, outcome: "info_obtained", summary: "Coming at eight.", do_not_call: false });
      return json({ say: "I'm calling for Sammy about tonight.", end_call: false, outcome: "in_progress", summary: "", do_not_call: false });
    }
    return null;
  };
  const client = fakeClient([use("m1", "make_call", { businessName: "Luke", personName: "Luke", phoneNumber: "313-736-8800", purpose: "personal", goal: "Ask Luke if he's coming tonight", plan: "ask if he's coming tonight" }), say("Calling.")], agent);
  const brain = new Brain({ client });
  const r = await brain.handle("m", "call 313 736 8800 and ask Luke if he's coming tonight");
  assert.match(r.reply, /I'll start with "Hey Luke, I'm Jericho, Sammy Eyde's personal assistant\."/);
  await brain.confirm("m", "yes");
  const call = await waitFor(() => listCalls().find((c) => c.businessName === "Luke" && c.twilioSid));
  await handleTwilio("voice", call.id, {});
  const said = () => listCalls().find((c) => c.id === call.id).transcript.filter((t) => t.who === "agent").map((t) => t.text);
  assert.equal(said()[0], "Hey Luke, I'm Jericho, Sammy Eyde's personal assistant. Sammy wants to know if you're coming tonight.");

  // "are you a robot?": the answer says he's an AI, even though the model dodged
  await handleTwilio("gather", call.id, { SpeechResult: "Wait, am I talking to a robot?" });
  assert.equal(said().at(-1), "I'm an AI assistant. I'm calling for Sammy about tonight.");
  // the goodbye is calm: no exclamation marks
  await handleTwilio("gather", call.id, { SpeechResult: "Yes, around eight." });
  assert.equal(said().at(-1), "So that's eight tonight. Thanks. Goodbye.");

  // the calmer voice was used for the call audio
  const callTts = ttsBodies.find((b) => /Hey Luke, I'm Jericho/.test(b.text));
  assert.equal(callTts.voice_settings.stability, 0.8);
  assert.equal(callTts.voice_settings.style, 0);
  assert.equal(callTts.voice_settings.speed, 0.92);
});

// ---- honesty -------------------------------------------------------------------------------------------

test("\"are you an AI?\" always gets an honest answer, and a claim to be human is replaced", () => {
  for (const q of ["Are you an AI?", "are you a real person", "Is this a robot?", "Am I talking to a human?", "Am I speaking with a real person?", "You sound like a computer.", "r u a bot", "Is this a recording?", "Are you a machine?"]) {
    assert.equal(asksIfAi(q), true, q);
    assert.match(ensureHonest(q, "I'm calling for Sammy."), /^I'm an AI assistant\./, q);
  }
  for (const q of ["Is this about the reservation?", "Are you calling about Friday?", "Who is this?", "Can you hold on?"]) assert.equal(asksIfAi(q), false, q);
  assert.equal(ensureHonest("Are you an AI?", "Yes, I'm an AI assistant calling for Sammy."), "Yes, I'm an AI assistant calling for Sammy.", "already honest: unchanged");
  assert.equal(ensureHonest("Who's this?", "I'm a real person, don't worry."), "I'm an AI assistant, not a person.");
  assert.equal(ensureHonest("Are you human?", "No, I'm not a person. I'm Sammy's assistant."), "I'm an AI assistant. No, I'm not a person. I'm Sammy's assistant.");
});

test("the call prompt: calm, reserved, assertive, honest and private", async () => {
  const { agentTurn } = await import("../server/calls/agent.js");
  let system = "";
  const client = { beta: { messages: { create: async (req) => ((system = req.system), { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ say: "Okay.", end_call: false, outcome: "in_progress", summary: "", do_not_call: false }) }] }) } } };
  await agentTurn(client, { purpose: "personal", personName: "Luke", businessName: "Luke", goal: "Ask about tonight", plan: "ask", transcript: [] });
  for (const rule of [
    /Calm, reserved, polite and assertive/,
    /One question or request at a time, then wait for the answer\. If they interrupt, stop, listen, then carry on\./,
    /No filler \("um", "so basically"\), no excitement, no exclamation marks, no over-apologising\. Say thanks once/,
    /restate the request once in different words, and hold your position politely\. If they still say no, or say stop, thank them once and end the call\. Never argue, pressure or threaten\./,
    /ask them to repeat it once, simply/,
    /confirm the key detail back once \("So that's Thursday at seven, for two\."\), a brief thanks/,
    /If anyone asks whether you're a person, a robot, a bot or an AI, answer honestly and calmly: "I'm an AI assistant\." Never claim or imply you're human\. Never pretend to be Sammy/,
    /no address, school, family, workplace or schedule beyond what this task needs/,
    /voicemail: one short, calm message with who you are, what it's about, and that Sammy can be reached back/,
    /set do_not_call and end_call true/,
    /You already said: "Hey Luke, I'm Jericho, Sammy Eyde's personal assistant\."/,
  ]) assert.match(system, rule);
});

// ---- calm speech and the call voice ------------------------------------------------------------------

test("calm speech: no filler, no exclamation marks, one thanks and one sorry", () => {
  assert.equal(calmSpeech("Um, so basically, Sammy wants a table for two!"), "Sammy wants a table for two.");
  assert.equal(calmSpeech("Great!! Thank you so much. Thank you. Thanks again."), "Great. Thank you so much.");
  assert.equal(calmSpeech("Sorry. I'm so sorry. Could you say that again?"), "Sorry. Could you say that again?");
  assert.equal(calmSpeech("So that's Thursday at seven, for two. Thanks."), "So that's Thursday at seven, for two. Thanks.");
});

test("call voice settings: steadier and slower on calls, the normal voice left alone", async () => {
  const cfg = callSettings();
  assert.equal(base.calls.voiceStability, 0.8);
  assert.equal(base.calls.voiceStyle, 0);
  assert.equal(base.calls.speakingRate, 0.92);
  assert.equal(base.calls.ownerFullName, "Sammy Eyde");
  assert.deepEqual([cfg.voiceStability, cfg.voiceStyle, cfg.speakingRate], [0.8, 0, 0.92]);
  assert.deepEqual(callVoice(), { outputFormat: "mp3_22050_32", stability: 0.8, style: 0, speed: 0.92 });
  // and more stable than the everyday voice
  assert.ok(cfg.voiceStability > (base.elevenlabs.stability ?? 0.5));
  assert.ok(cfg.speakingRate < (base.elevenlabs.speed ?? 1));

  ttsBodies.length = 0;
  await synthesize("Normal voice.");
  await synthesize("Call voice.", callVoice());
  assert.equal(ttsBodies[0].voice_settings.stability, base.elevenlabs.stability, "the normal voice is unchanged");
  assert.equal(ttsBodies[0].voice_settings.speed, base.elevenlabs.speed);
  assert.equal(ttsBodies[1].voice_settings.stability, 0.8);
  assert.equal(ttsBodies[1].voice_settings.speed, 0.92);
});

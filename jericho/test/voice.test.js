// The switchable voice: browser (free, the default), OpenAI or ElevenLabs. Provider selection,
// fallbacks, that nothing unselected is ever called, the browser voice picker, character counts,
// and the call voice (OpenAI, or Twilio's own). Network faked; every number is made up.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fakeClient, json, say, use } from "./fake-client.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-voice-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
const settingsFile = path.join(tmp, "settings.json");
const writeSettings = (voice) =>
  fs.writeFileSync(settingsFile, JSON.stringify({ ...base, voice: { ...base.voice, ...voice }, logFile: path.join(tmp, "actions.log"), calls: { ...base.calls, testMode: false, publicUrl: "https://jericho-voice.example.com" } }));
writeSettings({});
Object.assign(process.env, {
  JERICHO_SETTINGS: settingsFile,
  JERICHO_DATA_DIR: path.join(tmp, "data"),
  JERICHO_NO_ENV_FILE: "1",
  ELEVENLABS_API_KEY: "",
  OPENAI_API_KEY: "",
  TWILIO_ACCOUNT_SID: `AC${"5".repeat(32)}`,
  TWILIO_AUTH_TOKEN: "b".repeat(32),
  TWILIO_PHONE_NUMBER: "+15005550006",
  MY_PHONE_NUMBER: "+13127364512",
  JERICHO_ACCESS_TOKEN: "voice-test-token",
  JERICHO_NO_KEEPALIVE: "1",
});

const calls = [];
let openAiAnswer = () => new Response(Buffer.from("ID3-openai-mp3"), { status: 200 });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  calls.push({ url: u, init });
  if (u.includes("api.twilio.com")) return new Response(JSON.stringify({ sid: "CA88" }), { status: 201 });
  if (u.startsWith("https://api.openai.com/v1/audio/speech")) return openAiAnswer();
  if (u.startsWith("https://api.openai.com/v1/models")) return new Response("{}", { status: 200 });
  if (u.includes("api.elevenlabs.io")) return new Response(Buffer.from("ID3-eleven"), { status: 200 });
  throw new Error(`unexpected fetch ${u}`);
};
const hits = (host) => calls.filter((c) => c.url.includes(host));

const { secrets } = await import("../server/config.js");
const { activeVoice, callVoiceProvider, CALM_INSTRUCTIONS, countVoice, publicVoice, voiceSettings, voiceUsage } = await import("../server/voice.js");
const { streamSpeech } = await import("../server/tts.js");
const { warmAll } = await import("../server/net.js");
const { runChecks, formatResults } = await import("../server/selftest.js");
const { pickVoice, sortVoices, tuneSpeech, isMale } = await import("../public/voices.js");
const { Brain } = await import("../server/brain.js");
const { handleTwilio, listCalls } = await import("../server/calls/manager.js");

function fakeRes() {
  const res = { status: 0, headers: {}, chunks: [], ended: false };
  res.writeHead = (status, headers = {}) => Object.assign(res, { status, headers }) && res;
  res.write = (c) => (res.chunks.push(Buffer.from(c)), true);
  res.end = (c) => {
    if (c) res.chunks.push(Buffer.from(c));
    res.ended = true;
    res.emit?.("finish");
    return res;
  };
  res.on = (ev, cb) => ((res[`on_${ev}`] = cb), res);
  res.once = res.on;
  res.emit = (ev) => res[`on_${ev}`]?.();
  res.removeListener = () => res;
  res.prependListener = res.on;
  return res;
}
const until = async (fn) => {
  for (let i = 0; i < 100 && !fn(); i++) await new Promise((r) => setTimeout(r, 10));
};

// ---- provider selection ---------------------------------------------------------------------------

test("the default is the free browser voice, and it needs no key at all", () => {
  assert.equal(base.voice.provider, "browser", "settings.json default");
  assert.deepEqual(activeVoice(), { provider: "browser", configured: "browser" });
  const pub = publicVoice();
  assert.equal(pub.provider, "browser");
  assert.match(pub.cost, /free/);
  assert.equal(pub.calls, "twilio", "calls: Twilio's own voice with no OpenAI key");
  assert.equal(JSON.stringify(pub).includes("key"), false, "no keys go to the page");
  assert.equal(voiceSettings().openaiModel, "gpt-4o-mini-tts");
  assert.equal(voiceSettings().openaiVoice, "onyx");
});

test("a provider is used only when it's selected and its key is set; otherwise the browser voice", () => {
  const v = (provider) => ({ ...voiceSettings(), provider });
  assert.equal(activeVoice(v("openai"), { openai: "k" }).provider, "openai");
  assert.equal(activeVoice(v("elevenlabs"), { elevenlabs: "k" }).provider, "elevenlabs");
  const noKey = activeVoice(v("openai"), {});
  assert.deepEqual([noKey.provider, noKey.configured], ["browser", "openai"]);
  assert.match(noKey.reason, /OPENAI_API_KEY isn't set/);
  assert.match(activeVoice(v("elevenlabs"), { openai: "k" }).reason, /ELEVENLABS_API_KEY/);
  assert.equal(activeVoice(v("browser"), { openai: "k", elevenlabs: "k" }).provider, "browser", "keys alone never switch it");
  assert.equal(voiceSettings({ voice: { provider: "something" } }).provider, "browser");
  // calls: OpenAI when its key is set; ElevenLabs only if selected; else Twilio's own voice
  assert.equal(callVoiceProvider(v("browser"), { openai: "k" }), "openai");
  assert.equal(callVoiceProvider(v("elevenlabs"), { elevenlabs: "k" }), "elevenlabs");
  assert.equal(callVoiceProvider(v("browser"), { elevenlabs: "k" }), "twilio", "ElevenLabs isn't used unless selected");
  assert.equal(callVoiceProvider(v("browser"), {}), "twilio");
});

test("with the browser voice, the server never calls ElevenLabs or OpenAI: not to speak, warm up or self-test", async () => {
  calls.length = 0;
  secrets.elevenLabsKey = "el-would-cost-money";
  secrets.openaiKey = "";
  try {
    const res = fakeRes();
    await streamSpeech("Hello there.", res);
    assert.equal(res.status, 409, "speech is made in the page");
    await warmAll();
    const checks = await runChecks(fakeClient([], () => null));
    assert.equal(checks.voice.status, "PASS");
    assert.match(checks.voice.reason, /browser voice \(free, no key needed\)/);
    assert.match(formatResults(checks), /Voice +✅ PASS {2}browser voice/);
    assert.equal(hits("elevenlabs").length, 0, "never pinged ElevenLabs");
    assert.equal(hits("openai").length, 0);
  } finally {
    secrets.elevenLabsKey = "";
  }
});

test("OpenAI selected: gpt-4o-mini-tts with a calm style, streamed through; the key stays on the server", async () => {
  writeSettings({ provider: "openai" });
  secrets.openaiKey = "sk-openai-test-key";
  calls.length = 0;
  try {
    assert.equal(activeVoice().provider, "openai");
    const res = fakeRes();
    await streamSpeech("Your table is booked.", res);
    await until(() => res.ended);
    assert.equal(res.status, 200);
    assert.equal(res.headers["x-tts-source"], "openai");
    assert.equal(Buffer.concat(res.chunks).toString(), "ID3-openai-mp3");
    const req = hits("api.openai.com/v1/audio/speech")[0];
    const body = JSON.parse(req.init.body);
    assert.deepEqual([body.model, body.voice, body.response_format, body.input], ["gpt-4o-mini-tts", "onyx", "mp3", "Your table is booked."]);
    assert.equal(body.instructions, CALM_INSTRUCTIONS);
    assert.match(body.instructions, /calm, reserved, low and steady/);
    assert.equal(req.init.headers.authorization, "Bearer sk-openai-test-key");
    assert.equal(hits("elevenlabs").length, 0, "ElevenLabs not touched");
    assert.equal((await runChecks(fakeClient([], () => null))).voice.status, "PASS");

    // OpenAI fails: an error the page sees, so it drops to the browser voice and keeps talking
    openAiAnswer = () => new Response("overloaded", { status: 503 });
    const bad = fakeRes();
    await streamSpeech("Still here.", bad);
    assert.equal(bad.status, 502);
  } finally {
    openAiAnswer = () => new Response(Buffer.from("ID3-openai-mp3"), { status: 200 });
    writeSettings({});
  }
});

test("the page's fallback chain: a failing or stalled server voice drops to the browser voice, never silence", () => {
  const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(app, /useBrowser: !serverVoice\(\)/, "the browser voice from the start when it's selected");
  assert.match(app, /turn\.useBrowser = true; \/\/ ElevenLabs failed or stalled: browser voice for the rest of this reply/);
  assert.match(app, /\/\/ the browser voice: the chosen one, or the fallback when a server voice failed \(never silent\)\s*await browserVoice\(sentence, turn\.stats\);/);
  assert.match(app, /if \(!serverVoice\(\) \|\| ackMode\(\) !== "words"\) return;/, "no 'On it' clips fetched for the browser voice");
  assert.match(app, /ttsUrl: \(t\) => \(serverVoice\(\) \? ttsUrl\(t\) : null\)/, "the alarm voice too");
  const alarm = fs.readFileSync(new URL("../public/alarm.js", import.meta.url), "utf8");
  assert.match(alarm, /voice\.onerror = speakLocally;\s*voice\.play\(\)\.catch\(speakLocally\);/);
  // barge-in and the orb work the same with the browser voice
  const bv = app.slice(app.indexOf("function browserVoice("), app.indexOf("/** Latency: the moment"));
  assert.match(bv, /viz\.setSpeechSource\(null, true\)/, "the orb pulses while he speaks");
  assert.match(bv, /replyAudioStarted\(stats\)/, "barge-in calibration starts when he starts");
  assert.match(app, /if \("speechSynthesis" in window\) speechSynthesis\.cancel\(\);/, "cut off and stop cancel the browser voice");
});

// ---- the browser voice picker ---------------------------------------------------------------------------

const edge = [
  { name: "Microsoft Aria Online (Natural) - English (United States)", lang: "en-US", localService: false },
  { name: "Microsoft Andrew Online (Natural) - English (United States)", lang: "en-US", localService: false },
  { name: "Microsoft Guy Online (Natural) - English (United States)", lang: "en-US", localService: false },
  { name: "Microsoft David - English (United States)", lang: "en-US", localService: true },
  { name: "Microsoft Zira - English (United States)", lang: "en-US", localService: true },
  { name: "Microsoft Henri Online (Natural) - French (France)", lang: "fr-FR", localService: false },
];
const chrome = [
  { name: "Google US English", lang: "en-US", localService: false },
  { name: "Google UK English Female", lang: "en-GB", localService: false },
  { name: "Google UK English Male", lang: "en-GB", localService: false },
  { name: "Google Deutsch", lang: "de-DE", localService: false },
];

test("the browser voice: Edge's natural English male voice first, then any English male voice", () => {
  assert.match(pickVoice(edge).name, /^Microsoft (Andrew|Guy) Online \(Natural\)/);
  assert.equal(pickVoice(edge.filter((v) => !/Online/.test(v.name) || /French/.test(v.name))).name, "Microsoft David - English (United States)");
  assert.equal(pickVoice(chrome).name, "Google UK English Male");
  assert.equal(pickVoice(edge, "Microsoft Zira - English (United States)").name, "Microsoft Zira - English (United States)", "your pick wins");
  assert.match(pickVoice(edge, "Not Installed Voice").name, /Online \(Natural\)/, "a missing pick falls back to the best");
  assert.equal(pickVoice([{ name: "Google Deutsch", lang: "de-DE" }]), null, "no English voice: the browser's default");
  assert.equal(isMale({ name: "Microsoft Aria Online (Natural)" }), false);
  assert.equal(sortVoices(edge)[0].lang, "en-US");
  assert.equal(sortVoices(edge).at(-1).lang, "fr-FR", "other languages last in the picker");
  assert.deepEqual(tuneSpeech({}), { rate: 0.92, pitch: 0.85 }, "calm and a little deep by default");
  assert.deepEqual(tuneSpeech({ rate: "3", pitch: "-1" }), { rate: 1.5, pitch: 0 });
  const html = fs.readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  for (const id of ["browser-voice", "voice-rate", "voice-pitch", "voice-preview", "voice-cost"]) assert.match(html, new RegExp(`id="${id}"`), id);
});

// ---- counts and the cost line ---------------------------------------------------------------------------

test("characters spoken are counted per provider and logged as numbers only", () => {
  const before = voiceUsage();
  assert.deepEqual(countVoice({ browser: 120, openai: 30, evil: 5, elevenlabs: -3, twilio: "x" }), { browser: 120, openai: 30 });
  assert.equal(voiceUsage().browser, before.browser + 120);
  assert.equal(countVoice({}), null);
  const log = fs.readFileSync(path.join(tmp, "actions.log"), "utf8");
  assert.match(log, /"type":"voice_usage".*"chars":\{"browser":120,"openai":30\}/);
  const server = fs.readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
  assert.match(server, /countVoice\(body\.voiceChars\)/);
  const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(app, /voiceChars: st\.chars/, "the page sends counts, not text");
  assert.match(app, /el\.textContent = `Voice: \$\{VOICE_NAMES\[p\]\}, \$\{config\.voice\?\.cost/);
});

// ---- phone calls ------------------------------------------------------------------------------------------

const agent = (req) => {
  const sys = JSON.stringify(req.system || "");
  if (sys.includes("You screen outbound phone calls")) return json({ allowed: true, reason: "ok" });
  if (sys.includes("live phone call")) return json({ say: "Sammy wants to know if you're coming tonight.", end_call: false, outcome: "in_progress", summary: "", do_not_call: false });
  return null;
};
async function placeCall(name, number) {
  for (const c of listCalls().filter((x) => x.status !== "ended")) await handleTwilio("status", c.id, { CallStatus: "completed" });
  const client = fakeClient([use("v1", "make_call", { businessName: name, personName: name, phoneNumber: number, purpose: "personal", goal: "Ask about tonight", plan: "ask about tonight" }), say("Calling.")], agent);
  const brain = new Brain({ client });
  await brain.handle(name, `call ${name}`);
  await brain.confirm(name, "yes");
  let call;
  await until(() => (call = listCalls().find((c) => c.businessName === name && c.twilioSid)));
  return call;
}

test("calls with no OpenAI key: Twilio's own neural voice, with the opener and every rule unchanged", async () => {
  secrets.openaiKey = "";
  calls.length = 0;
  const call = await placeCall("Gus", "313-736-7101");
  const voice = await handleTwilio("voice", call.id, {});
  assert.match(voice, /<Say voice="Polly\.Matthew-Neural" language="en-US"><prosody rate="95%">Hey Gus, I&apos;m Jericho, Sammy Eyde&apos;s personal assistant\. Sammy wants to know/);
  assert.doesNotMatch(voice, /<Play>/);
  assert.equal(hits("elevenlabs").length + hits("api.openai.com").length, 0, "no paid voice service touched");
});

test("calls with an OpenAI key: OpenAI's calm voice; if it fails, Twilio's voice says it instead", async () => {
  secrets.openaiKey = "sk-openai-test-key";
  try {
    calls.length = 0;
    const call = await placeCall("Hal", "313-736-7202");
    const voice = await handleTwilio("voice", call.id, {});
    assert.match(voice, /<Play>https:\/\/jericho-voice\.example\.com\/twilio\/audio\/[0-9a-f]{32}<\/Play>/);
    const body = JSON.parse(hits("api.openai.com/v1/audio/speech")[0].init.body);
    assert.equal(body.model, "gpt-4o-mini-tts");
    assert.match(body.instructions, /calm, reserved[\s\S]*phone call/);
    assert.match(body.input, /^Hey Hal, I'm Jericho, Sammy Eyde's personal assistant\./);
    assert.equal(hits("elevenlabs").length, 0);

    openAiAnswer = () => new Response("nope", { status: 500 });
    const reply = await handleTwilio("gather", call.id, { SpeechResult: "Yes, I'll be there." });
    assert.match(reply, /<Say voice="Polly\.Matthew-Neural"/, "never silent: Twilio's voice takes over");
  } finally {
    openAiAnswer = () => new Response(Buffer.from("ID3-openai-mp3"), { status: 200 });
    secrets.openaiKey = "";
  }
});

test(".env.example lists OPENAI_API_KEY, and child processes never get it", async () => {
  const example = fs.readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(example, /^OPENAI_API_KEY=$/m);
  const { cleanEnv } = await import("../server/tools/pc.js");
  process.env.OPENAI_API_KEY = "sk-should-not-leak";
  try {
    assert.equal(cleanEnv().OPENAI_API_KEY, undefined);
  } finally {
    process.env.OPENAI_API_KEY = "";
  }
});

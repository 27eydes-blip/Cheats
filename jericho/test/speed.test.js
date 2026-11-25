// Offline tests for the speed work: sentence splitting and streaming order, model routing (risky
// actions never on the small model), the instant local commands, the latency tracker, sending
// early, static file caching, warm-ups and the fallbacks when something stalls.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fakeClient, say, use } from "./fake-client.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jericho-speed-"));
const base = JSON.parse(fs.readFileSync(new URL("../settings.json", import.meta.url), "utf8"));
fs.writeFileSync(
  path.join(tmp, "settings.json"),
  JSON.stringify({
    ...base,
    logFile: path.join(tmp, "actions.log"),
    // a stalled Claude: sorry after 0.15 s, give up after 0.4 s (normally 12 s and 40 s)
    claude: { ...base.claude, stallApologySeconds: 0.15, stallAbortSeconds: 0.4 },
  }),
);
process.env.JERICHO_SETTINGS = path.join(tmp, "settings.json");
process.env.JERICHO_DATA_DIR = path.join(tmp, "data");

const { Brain, _resetFastModelForTests } = await import("../server/brain.js");
const { SentenceSplitter } = await import("../server/speech.js");
const { routeFor, routingMode } = await import("../server/router.js");
const { matchQuick, runQuick, timeSentence, dateSentence } = await import("../server/quick.js");
const { LatencyTracker, cleanLatency, formatReadout, turnLatency, STAGES } = await import("../public/latency.js");
const { compareEarly, earlyCommitDelay } = await import("../public/endpoint.js");
const { wakeRegex, stripLeadingWake } = await import("../public/wake.js");
const { cached, clearCache } = await import("../server/briefing/cache.js");
const { sendStatic } = await import("../server/static.js");
const { addWarmer, warmAll } = await import("../server/net.js");
const { isRisky, toolDefinitions } = await import("../server/tools/index.js");
const { ACK_PHRASES, voiceModelFor } = await import("../server/tts.js");
const log = () => (fs.existsSync(path.join(tmp, "actions.log")) ? fs.readFileSync(path.join(tmp, "actions.log"), "utf8") : "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- sentence splitting and streaming order ----------------------------------------------------

const split = (text, opts, size = 4) => {
  const sp = new SentenceSplitter(12, opts);
  const out = [];
  for (const piece of text.match(new RegExp(`[\\s\\S]{1,${size}}`, "g"))) out.push(...sp.push(piece));
  return [...out, ...sp.flush()];
};

test("sentences come out one at a time, in order, as soon as each is complete", () => {
  assert.deepEqual(split("It's sunny today. Dr. Smith said 7.30 works. Okay. See you then!"), ["It's sunny today.", "Dr. Smith said 7.30 works.", "Okay. See you then!"]);
  // a long first sentence is spoken from its first clause, the rest keeps its sentences
  assert.deepEqual(split("Sure, so the short version of how this works, without the jargon, is simple. It moves heat.", { firstClauseAt: 60 }), [
    "Sure, so the short version of how this works,",
    "without the jargon, is simple.",
    "It moves heat.",
  ]);
  // only the first sentence is split early, never a number like 1,000, never a tiny clause
  assert.deepEqual(split("Yes, that's right. It costs about 1,000 dollars, which is a lot, more than I thought it would be.", { firstClauseAt: 60 }), ["Yes, that's right.", "It costs about 1,000 dollars, which is a lot, more than I thought it would be."]);
  assert.deepEqual(split("We paid 1,250,000 dollars for that very large house on the hill last year.", { firstClauseAt: 30 }), ["We paid 1,250,000 dollars for that very large house on the hill last year."]);
});

/** A client whose stream delivers text slowly, so we can see what's spoken before it ends. */
function slowClient(text, { gapMs = 15 } = {}) {
  const calls = [];
  return {
    calls,
    models: { list: async () => ({}) },
    beta: {
      messages: {
        stream(req) {
          calls.push(structuredClone(req));
          const handlers = {};
          return {
            on(ev, cb) {
              (handlers[ev] ||= []).push(cb);
              return this;
            },
            async finalMessage() {
              for (const piece of text.match(/[\s\S]{1,5}/g)) {
                await sleep(gapMs);
                for (const cb of handlers.streamEvent || []) cb({ type: "content_block_delta" });
                for (const cb of handlers.text || []) cb(piece);
              }
              this.endedAt = performance.now();
              ended.at = this.endedAt;
              return { model: req.model, stop_reason: "end_turn", content: [{ type: "text", text }] };
            },
          };
        },
      },
    },
  };
}
const ended = { at: 0 };

test("the first sentence reaches the speaker while the rest is still being written", async () => {
  const text = "Here's a fun one. Cleopatra lived closer to the Moon landing than to the pyramids. Wild, right?";
  const client = slowClient(text);
  const heard = [];
  const marks = [];
  const r = await new Brain({ client }).handle("order", "tell me one fun fact about ancient egypt", {
    onSentence: (t) => heard.push({ t, at: performance.now() }),
    onMark: (stage, value) => marks.push({ stage, value, at: performance.now() }),
  });
  assert.deepEqual(heard.map((h) => h.t), ["Here's a fun one.", "Cleopatra lived closer to the Moon landing than to the pyramids.", "Wild, right?"]);
  assert.ok(heard[0].at < ended.at - 50, "first sentence spoken well before the reply finished");
  // the latency marks: which brain answered, then the first token, then the first sentence
  assert.equal(marks[0].stage, "route");
  const token = marks.find((m) => m.stage === "token");
  assert.ok(token && token.at <= heard[0].at);
  assert.ok(r.timings.firstTokenMs <= r.timings.firstSentenceMs);
});

// ---- routing -------------------------------------------------------------------------------------

test("simple requests go to the fast model; complex, long, vague or risky ones to the strong one", () => {
  const fast = ["hey how's it going", "what's the weather tomorrow", "turn the volume up", "set an alarm for 7 am", "switch the tv to netflix", "turn on the kitchen lights", "what's the capital of france", "how many ounces in a pound", "pause the music", "thanks"];
  for (const t of fast) assert.equal(routeFor(t).route, "fast", t);
  const strong = [
    "help me plan a trip to cairo next spring with a budget",
    "explain why the sky is blue",
    "write a poem about the nile",
    "what's the latest news",
    "search for the best pizza near me",
    "do it",
    "what about that one",
    "good morning",
    "remember that my sister is called Mia",
    "tell me everything you know about the history of the roman empire and why it eventually fell apart",
  ];
  for (const t of strong) assert.equal(routeFor(t).route, "strong", t);
  // always strong: nothing goes to the fast model
  for (const t of fast) assert.equal(routeFor(t, { mode: "always-strong" }).route, "strong", t);
  assert.equal(routeFor("thanks", { pending: true }).route, "strong", "a waiting yes/no stays on the strong model");
  assert.equal(routingMode("always-strong", "auto"), "always-strong");
  assert.equal(routingMode("nonsense", "always-strong"), "always-strong");
  assert.equal(routingMode(undefined, undefined), "auto");
});

test("anything that sounds like a risky action is never routed to the fast model", () => {
  const risky = [
    "delete my notes file",
    "move the report to documents",
    "run the build command",
    "start claude code on my website",
    "call the pizza place",
    "send a text to mom",
    "email my boss",
    "post this to twitter",
    "send a calendar invite for friday",
    "forget what I told you about my job",
    "cancel my alarm",
    "write a file called todo",
    "open powershell and run a script",
    "change the registry setting",
    "shut down the computer",
    "copy that to the clipboard",
  ];
  for (const t of risky) assert.equal(routeFor(t).route, "strong", t);
  // ...and every tool with a risky tier shows up in the router's risky words by name
  for (const name of ["delete_file", "move_file", "write_file", "run_command", "claude_code", "make_call", "forget"]) {
    const def = toolDefinitions.find((d) => d.name === name);
    if (!def) continue;
    assert.equal(routeFor(name.replace(/_/g, " ")).route, "strong", name);
  }
});

test("if the fast model asks for a risky tool anyway, the strong model redoes the step and reads it back", async () => {
  _resetFastModelForTests();
  const client = fakeClient([
    // the fast model (wrongly) goes for a risky action: dropped, never run, never read back
    (req) => (assert.equal(req.model, "claude-haiku-5-5"), use("h1", "run_command", { command: "echo lamp" })),
    // the strong model takes over from the same point
    (req) => (assert.equal(req.model, "claude-opus-5-5"), use("o1", "run_command", { command: "echo lamp" })),
  ]);
  const brain = new Brain({ client });
  const r = await brain.handle("esc", "dim the hallway");
  assert.equal(routeFor("dim the hallway").route, "fast");
  assert.equal(r.awaitingConfirmation, true);
  assert.equal(r.timings.route, "strong");
  assert.equal(r.timings.escalated, true);
  assert.equal(client.calls.length, 2);
  // the small model's answer never entered the history: the strong model saw only the request
  assert.ok(!JSON.stringify(client.calls[1].messages).includes('"h1"'));
  assert.match(log(), /"type":"route_escalated".*"reason":"risky action"/);
  // the yes runs on the strong model too
  client.calls.length = 0;
  const done = fakeClient([say("Started.")]);
  brain.client = done;
  await brain.confirm("esc", "no");
});

test("a refusal or an error on the fast model goes to the strong model", async () => {
  _resetFastModelForTests();
  const refused = fakeClient([{ stop_reason: "refusal", stop_details: { category: null }, content: [] }, say("Sure, it's on.")]);
  const r = await new Brain({ client: refused }).handle("ref", "turn on the kitchen lights");
  assert.equal(r.reply, "Sure, it's on.");
  assert.deepEqual(refused.calls.map((c) => c.model), ["claude-haiku-5-5", "claude-opus-5-5"]);

  const broken = fakeClient([
    () => {
      throw Object.assign(new Error("model not found"), { status: 404 });
    },
    say("The lights are on."),
  ]);
  const r2 = await new Brain({ client: broken }).handle("err", "turn on the kitchen lights");
  assert.equal(r2.reply, "The lights are on.");
  assert.deepEqual(broken.calls.map((c) => c.model), ["claude-haiku-5-5", "claude-opus-5-5"]);
  // for a while after, the strong model answers straight away
  const next = fakeClient([say("On.")]);
  await new Brain({ client: next }).handle("err2", "turn on the kitchen lights");
  assert.equal(next.calls[0].model, "claude-opus-5-5");
  _resetFastModelForTests();
});

test("the fast model gets its own short cached instructions, everyday tools plus hand_off, low effort, no web search and no fallback", async () => {
  _resetFastModelForTests();
  const client = fakeClient([say("Hi there.")]);
  await new Brain({ client }).handle("shape", "hey how's it going");
  const req = client.calls[0];
  assert.equal(req.model, "claude-haiku-5-5");
  assert.deepEqual(req.output_config, { effort: "low" });
  assert.equal(req.system[1].cache_control.type, "ephemeral");
  assert.ok(!req.tools.some((t) => String(t.type || "").startsWith("web_search")));
  assert.equal(req.fallbacks, undefined);
  assert.equal(req.betas, undefined);
  // a fixed everyday set plus hand_off (anything else goes to the strong model), never a risky tool
  const names = req.tools.map((t) => t.name);
  assert.ok(names.includes("hand_off") && names.includes("lights") && names.includes("tv"));
  for (const risky of ["delete_file", "run_command", "claude_code", "make_call", "forget", "write_file"]) assert.ok(!names.includes(risky), risky);
  assert.ok(names.length < toolDefinitions.length);
  assert.match(req.system[0].text, /hand_off/);
  assert.equal(req.messages.at(-1).content.at(-1).cache_control.type, "ephemeral");
});

// ---- instant local commands ------------------------------------------------------------------------

test("obvious commands are matched exactly; anything else goes to Claude", () => {
  assert.deepEqual(matchQuick("What time is it?"), { kind: "time" });
  assert.deepEqual(matchQuick("Jericho, what's the time please"), { kind: "time" });
  assert.deepEqual(matchQuick("what day is it"), { kind: "date" });
  assert.deepEqual(matchQuick("Volume up"), { kind: "volume", step: "up" });
  assert.deepEqual(matchQuick("turn it down"), { kind: "volume", step: "down" });
  assert.deepEqual(matchQuick("mute the volume"), { kind: "volume", mute: true });
  assert.deepEqual(matchQuick("snooze"), { kind: "snooze" });
  for (const t of ["what time is it in Tokyo", "actually never mind, what time is it", "turn the volume up to 80 and play music", "what time does the store close", "mute", "stop", "go to sleep", ""]) {
    assert.equal(matchQuick(t), null, t);
  }
  const when = new Date("2026-11-24T19:42:00Z");
  assert.equal(timeSentence(when, { lang: "en-US", timeZone: "America/Detroit" }), "It's 2:42 PM.");
  assert.equal(dateSentence(when, { lang: "en-US", timeZone: "America/Detroit" }), "It's Tuesday, November 24.");
});

test("local commands run the same safe tools, and snooze only when an alarm is ringing", async () => {
  const ran = [];
  const tools = new Map([["set_volume", { run: async (input) => (ran.push(input), { ok: true }) }]]);
  assert.equal((await runQuick({ kind: "volume", step: "up" }, { tools })).say, "Turned it up.");
  assert.equal((await runQuick({ kind: "volume", step: "down" }, { tools })).say, "Turned it down.");
  assert.equal((await runQuick({ kind: "volume", mute: true }, { tools })).say, "Okay, mute toggled.");
  assert.deepEqual(ran, [{ step: "up" }, { step: "down" }, { mute: true }]);
  // set_volume is in the safe tier, exactly as when Claude calls it
  assert.equal(isRisky("set_volume", { step: "up" }), false);

  let snoozed = 0;
  const quiet = { list: () => [{ state: "scheduled" }], snooze: async () => (snoozed++, { ok: true }), snoozeMinutes: 9 };
  assert.equal(await runQuick({ kind: "snooze" }, { alarms: quiet }), null, "nothing ringing: Claude handles it");
  const ringing = { ...quiet, list: () => [{ state: "ringing" }] };
  assert.equal((await runQuick({ kind: "snooze" }, { alarms: ringing })).say, "Snoozed for 9 minutes.");
  assert.equal(snoozed, 1);
});

test("'what time is it' is answered with no Claude call at all, and kept in the history", async () => {
  const client = fakeClient([say("You asked about the time a moment ago.")]); // only the second turn reaches Claude
  const brain = new Brain({ client });
  const heard = [];
  const r = await brain.handle("quick", "Jericho, what time is it?", { onSentence: (t) => heard.push(t) });
  assert.match(r.reply, /^It's \d{1,2}:\d{2}\s?[AP]M\.$/);
  assert.equal(r.timings.route, "local");
  assert.equal(client.calls.length, 0, "no Claude call");
  assert.match(log(), /"type":"quick_command".*"kind":"time"/);
  await brain.handle("quick", "and what did I just ask you");
  const sent = JSON.stringify(client.calls[0].messages);
  assert.match(sent, /what time is it/);
  assert.match(sent, /It's \d/);
  // the kill switch still comes first
  const stop = await brain.handle("quick", "stop");
  assert.match(stop.reply, /stop/i);
});

// ---- latency tracker ---------------------------------------------------------------------------------

test("the latency tracker measures each stage from the end of speech and averages the last 10", () => {
  const marks = { end: 1000, final: 1300, sent: 1310, token: 1900, sentence: 2050, audioByte: 2300, playing: 2420 };
  assert.deepEqual(turnLatency(marks), { final: 300, sent: 310, token: 900, sentence: 1050, audioByte: 1300, playing: 1420 });
  assert.deepEqual(turnLatency({ sent: 500, sentence: 900 }), { sent: 0, sentence: 400 }, "typed: measured from sending");
  assert.deepEqual(STAGES, ["final", "sent", "token", "sentence", "audioByte", "playing"]);

  const t = new LatencyTracker(10);
  for (let i = 1; i <= 12; i++) t.add({ sentence: i * 100, playing: i * 100 + 200, route: i % 2 ? "fast" : "strong" });
  assert.equal(t.entries.length, 10, "only the last 10 turns");
  assert.equal(t.last().playing, 1400);
  assert.equal(t.average().playing, 950); // turns 3..12: 500 to 1400
  const readout = formatReadout(t);
  assert.match(readout.headline, /^Last: voice in 1\.4 s · average of 10: 950 ms$/);
  assert.match(readout.detail, /first full sentence 1\.2 s → audio playing 1\.4 s \(strong route\)/);
  assert.match(formatReadout(new LatencyTracker()).headline, /No turns measured yet/);
});

test("latency entries keep only numbers and labels: nothing you said can reach logs/latency.log", () => {
  const clean = cleanLatency({ sentence: 812.4, playing: "1020", text: "my bank password is x", route: "fast", models: ["claude-haiku-5-5", "<script>"], voice: "elevenlabs", early: true, fallback: "browser-voice", note: "hi", token: -5, audioByte: 999999 });
  assert.deepEqual(clean, { sentence: 812, playing: 1020, route: "fast", voice: "elevenlabs", models: ["claude-haiku-5-5"], early: true, fallback: "browser-voice" });
  assert.deepEqual(cleanLatency({ route: "weird", voice: "x", sentence: null }), {});
  const server = fs.readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
  assert.match(server, /const entry = cleanLatency\(body\);/);
  assert.match(server, /latency\.log/);
});

// ---- listening ----------------------------------------------------------------------------------------

test("sending early waits less for a short command, more for a long or unfinished sentence", () => {
  assert.equal(earlyCommitDelay("stop"), 450);
  assert.equal(earlyCommitDelay("lights off"), 450);
  assert.equal(earlyCommitDelay("turn off the kitchen lights"), 650);
  assert.equal(earlyCommitDelay("can you tell me what the weather is going to be like on saturday"), 850);
  assert.ok(earlyCommitDelay("turn off the") > earlyCommitDelay("turn off the lights"), "ends on 'the': not finished");
  assert.ok(earlyCommitDelay("one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen and") <= 1700);
});

test("the browser's final transcript after an early send is dropped, or replaces it if you kept talking", () => {
  assert.equal(compareEarly("turn off the lights", "Turn off the lights."), "same");
  assert.equal(compareEarly("turn off the lights", "turn off the light"), "same");
  assert.equal(compareEarly("what time is it", "what time is it now"), "same");
  assert.equal(compareEarly("turn off the lights", "turn off the lights in the kitchen please"), "longer");
  assert.equal(compareEarly("what's the weather", "play some music"), "different");
});

test("wake-word matching builds each pattern once and is safe to reuse", () => {
  const words = ["jericho", "jer"];
  const a = wakeRegex(words, "gi");
  a.lastIndex = 5;
  const b = wakeRegex(words, "gi");
  assert.equal(a, b, "the same RegExp object is reused");
  assert.equal(b.lastIndex, 0, "and starts from the beginning each time");
  assert.equal("hey jericho, lights".replace(wakeRegex(words, "gi"), "").trim(), "lights");
  assert.equal(stripLeadingWake("Hey Jericho, what's the weather", words), "what's the weather");
  assert.equal(stripLeadingWake("Hey Jericho, what's the weather", words), "what's the weather");
});

// ---- the page and server -------------------------------------------------------------------------------

function fakeRes() {
  const res = { status: 0, headers: {}, body: null };
  res.writeHead = (status, headers) => Object.assign(res, { status, headers }) && res;
  res.end = (body) => ((res.body = body), res);
  return res;
}

test("static files are gzipped, sent with an ETag, and a reload gets a 304", () => {
  const file = path.join(tmp, "big.js");
  fs.writeFileSync(file, `// ${"lots of code ".repeat(500)}`);
  const first = fakeRes();
  sendStatic({ headers: { "accept-encoding": "gzip, br" } }, first, file, { cacheControl: "no-cache" });
  assert.equal(first.status, 200);
  assert.equal(first.headers["content-encoding"], "gzip");
  assert.ok(first.body.length < 1000, "compressed");
  assert.match(first.headers.etag, /^"[\w-]+"$/);
  const again = fakeRes();
  sendStatic({ headers: { "if-none-match": first.headers.etag } }, again, file, { cacheControl: "no-cache" });
  assert.equal(again.status, 304);
  const plain = fakeRes();
  sendStatic({ headers: {} }, plain, file, { cacheControl: "no-cache" });
  assert.equal(plain.headers["content-encoding"], undefined);
  const server = fs.readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
  assert.match(server, /\.woff2" \? "public, max-age=31536000, immutable"/, "fonts: a year");
  assert.match(server, /max-age=604800/, "the 3D library: a week");
});

test("often-needed data refreshes in the background, so callers never wait on it", async () => {
  clearCache();
  let fetches = 0;
  const fn = async () => (++fetches, `v${fetches}`);
  assert.equal(await cached("w", 100, fn), "v1");
  await sleep(80); // past 70% of its life
  assert.equal(await cached("w", 100, fn), "v1", "still answered at once from memory");
  await sleep(10);
  assert.equal(fetches, 2, "refreshed in the background");
  assert.equal(await cached("w", 100, fn), "v2");
  const server = fs.readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
  assert.match(server, /getWeather\(\), getForecast\(\), getCalendar\(\)/);
  assert.match(server, /startIdleWarm\(\)/);
});

test("warm-ups never throw, even when a service is down", async () => {
  let ok = 0;
  addWarmer("good", async () => ok++);
  addWarmer("bad", async () => {
    throw new Error("down");
  });
  addWarmer("sync-bad", () => {
    throw new Error("boom");
  });
  await warmAll();
  assert.equal(ok, 1);
});

test("voice model choice and the instant acknowledgments", () => {
  assert.equal(voiceModelFor("flash"), "eleven_flash_v2_5");
  assert.equal(voiceModelFor("turbo"), "eleven_turbo_v2_5");
  assert.equal(voiceModelFor("multilingual"), "eleven_multilingual_v2");
  assert.equal(voiceModelFor("../../etc"), undefined, "anything else: settings.json");
  assert.equal(voiceModelFor("constructor"), undefined);
  const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const m = /const ACK_PHRASES = (\[[^\]]+\])/.exec(app);
  assert.deepEqual(JSON.parse(m[1]), ACK_PHRASES, "the page and the server cache agree on the phrases");
  // the acknowledgment never overlaps the answer: the first sentence waits for it
  assert.match(app, /if \(turn\.ack\) \{[\s\S]{0,200}await turn\.ack;/);
  assert.match(app, /clearTimeout\(ackTimer\); \/\/ the answer is here/);
});

// ---- fallbacks ---------------------------------------------------------------------------------------

/** A stream that never says anything until it's aborted. */
function silentClient() {
  const calls = [];
  return {
    calls,
    models: { list: async () => ({}) },
    beta: {
      messages: {
        stream(req, opts) {
          calls.push(req);
          return {
            on() {
              return this;
            },
            finalMessage: () =>
              new Promise((_, reject) => {
                opts.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
              }),
          };
        },
      },
    },
  };
}

test("if Claude stalls: a short apology, then a clean give-up, never a hang", async () => {
  const heard = [];
  const t0 = performance.now();
  const r = await new Brain({ client: silentClient() }).handle("stall", "explain how tides work", { onSentence: (t) => heard.push(t) });
  const took = performance.now() - t0;
  assert.ok(took < 2000, `gave up in ${Math.round(took)} ms`);
  assert.match(heard[0], /^Sorry, (this is taking a moment|still working on it|bear with me a second)\.$/);
  assert.match(heard.slice(1).join(" "), /^Sorry, (Claude isn't answering right now\. Try again in a moment\.|I lost Claude for a second there\. Please ask again\.)$/);
  assert.equal(r.awaitingConfirmation, false);
  assert.match(log(), /"type":"claude_stalled"/);
});

test("the page falls back gracefully: browser voice if ElevenLabs stalls, a line if the server goes quiet", () => {
  const app = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(app, /const TTS_START_TIMEOUT_MS = 3500;/);
  assert.match(app, /reject\(new Error\("TTS stalled"\)\); \} \}, TTS_START_TIMEOUT_MS\)/);
  assert.match(app, /turn\.useBrowser = true; \/\/ ElevenLabs failed or stalled/);
  assert.match(app, /const SERVER_SILENCE_MS = 30_000;/);
  assert.match(app, /serverSilent = true;\s*controller\.abort\(\);/);
  const server = fs.readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
  assert.match(server, /send\(\{ type: "tick" \}\), 10_000/, "the server's heartbeat while tools run");
});

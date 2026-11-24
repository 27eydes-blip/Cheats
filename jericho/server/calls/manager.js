// Runs phone calls: test-mode simulations and real Twilio calls, saves each one to
// data/calls.json and announces the result out loud when it ends.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT, secrets } from "../config.js";
import { logAction, scrubEnvValues } from "../logger.js";
import { errorDetails, keepAliveFetch } from "../net.js";
import { track } from "../cancel.js";
import { jobEvents } from "../tools/claudeCode.js";
import { synthesize, synthesizeOpenAi } from "../tts.js";
import { CALM_INSTRUCTIONS, callVoiceProvider, countVoice } from "../voice.js";
import { agentTurn, disclosure, openingRequest, ownerGreeting, pickScenario, simulatedReply } from "./agent.js";
import { callSettings, checkIntentKeywords, checkLimits, checkNumber, checkOwnerNumber, isOwnerNumber, last4, normalizeNumber, numberKey, screenWithClaude, speakNumber } from "./policy.js";
import { addDoNotCall, isDoNotCall, wantsNoCalls } from "./dnc.js";
import { findContact } from "../contacts.js";
import { isSensitive, maskPhones } from "../secrets.js";

const DATA_DIR = process.env.JERICHO_DATA_DIR || path.join(ROOT, "data");
const CALLS_FILE = path.join(DATA_DIR, "calls.json");
const MAX_TURNS = 16;

const live = new Map(); // callId -> runtime state for calls in progress
const untrackers = new Map(); // callId -> remove it from the kill switch

async function cancelCall(call) {
  const sid = call.twilioSid || live.get(call.id)?.call?.twilioSid;
  if (!call.test && sid && secrets.twilioSid && secrets.twilioToken) {
    const auth = Buffer.from(`${secrets.twilioSid}:${secrets.twilioToken}`).toString("base64");
    await keepAliveFetch(`https://api.twilio.com/2010-04-01/Accounts/${secrets.twilioSid}/Calls/${sid}.json`, {
      method: "POST",
      headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ Status: "completed" }),
    }).catch((err) => logAction("call_error", { id: call.id, error: err.message, cause: errorDetails(err) }));
  }
  finish(call, "failed", "Cancelled by you.");
}
const audio = new Map(); // audioId -> Promise<Buffer | null>

// ---- storage ---------------------------------------------------------------------

/**
 * A call as it's written to data/calls.json: only the last 4 digits of any number, in the
 * record itself and in what was said. Older records with a full number are converted too.
 */
function storable(call) {
  const { client: _c, ...rest } = call;
  const out = JSON.parse(maskPhones(JSON.stringify(rest)));
  if (out.number && out.number !== OWNER && /\d{5,}/.test(String(out.number).replace(/\D/g, "")) ) {
    out.numberKey ||= isOwnerNumber(out.number) ? OWNER : numberKey(out.number);
    out.number = isOwnerNumber(call.number) ? OWNER : last4(out.number);
  }
  return out;
}

export function listCalls() {
  try {
    const data = JSON.parse(fs.readFileSync(CALLS_FILE, "utf8"));
    if (!Array.isArray(data.calls)) return [];
    // records from before only the last 4 digits were kept: convert them once
    if (data.calls.some((c) => c.number && c.number !== OWNER && String(c.number).replace(/\D/g, "").length > 4)) {
      const fixed = data.calls.map(storable);
      fs.writeFileSync(CALLS_FILE, `${JSON.stringify({ calls: fixed }, null, 2)}\n`);
      return fixed;
    }
    return data.calls;
  } catch {
    return [];
  }
}

function saveCall(call) {
  const calls = listCalls().filter((c) => c.id !== call.id);
  calls.push(storable(call));
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${CALLS_FILE}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ calls: calls.slice(-200) }, null, 2)}\n`);
  fs.renameSync(tmp, CALLS_FILE);
}

/** Calls as shown on the /calls page: your own number is hidden. */
export function publicCalls() {
  return listCalls()
    .map((c) => JSON.parse(scrubEnvValues(JSON.stringify(c))))
    .reverse();
}

// ---- checks -----------------------------------------------------------------------

function liveReady() {
  const cfg = callSettings();
  if (!secrets.twilioSid || !secrets.twilioToken || !secrets.twilioNumber) {
    return "Twilio isn't set up yet. Add the Twilio keys to the dot env file, or keep calls in test mode.";
  }
  if (!cfg.publicUrl) return "Real calls need calls.publicUrl in settings, so Twilio can reach Jericho.";
  if (!secrets.accessToken) return "Set JERICHO_ACCESS_TOKEN first. Real calls make Jericho reachable from the internet.";
  return null;
}

const screened = new Map(); // input hash -> time the Claude screen passed

function inputHash(input) {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

/** Every rule except the dial itself. Runs before you're asked to confirm, and again before dialing. */
/** Who to call: the number said, or a saved contact's. { ok, number, via } or { ok: false, reason }. */
export function resolveTarget(input) {
  if (input.contact && !input.phoneNumber) {
    const c = findContact(input.contact);
    if (!c) return { ok: false, reason: `I don't have a contact called ${String(input.contact).slice(0, 40)}. Tell me their number, or say "save ${String(input.contact).slice(0, 40)}'s number as" and the number.` };
    return { ok: true, raw: c.number, via: "contact", name: c.name };
  }
  if (!input.phoneNumber) return { ok: false, reason: "What number should I call? Say it, or the name of a saved contact." };
  return { ok: true, raw: input.phoneNumber, via: "number" };
}

/**
 * The name to greet: the one the user gave (personName), or the saved contact's. Never a guess:
 * without one, the call opens with "Hello".
 */
export function withGreetingName(input) {
  if (input.purpose !== "personal" || input.personName) return input;
  const t = resolveTarget(input);
  return t.ok && t.name ? { ...input, personName: t.name } : input;
}

/** Every rule except the dial itself. Runs before you're asked to confirm, and again before dialing. */
export async function precheck(input, client, { screen = true } = {}) {
  const cfg = callSettings();
  const kw = checkIntentKeywords(input);
  if (!kw.ok) return kw;
  const target = resolveTarget(input);
  if (!target.ok) return target;
  const num = checkNumber(target.raw);
  if (!num.ok) return num;
  const own = isOwnerNumber(num.number);
  // the do-not-call list: checked on every call
  if (!own && isDoNotCall(num.number)) return { ok: false, reason: "That number is on the do-not-call list: they asked not to be called again, so I won't." };
  const key = own ? OWNER : numberKey(num.number);
  const limits = checkLimits(listCalls(), key, cfg.testMode);
  if (!limits.ok) return limits;
  if (!cfg.testMode) {
    const notReady = liveReady();
    if (notReady) return { ok: false, reason: notReady };
    if (realCallInProgress()) return { ok: false, reason: "I'm already on a call. One call at a time." };
  }
  // Calling your own phone (MY_PHONE_NUMBER) is a rehearsal: you play the business.
  if (screen && !own) {
    const keyHash = inputHash(input);
    if (!screened.has(keyHash)) {
      const verdict = await screenWithClaude(client, input);
      if (!verdict.ok) return verdict;
      screened.set(keyHash, Date.now());
    }
  }
  return { ok: true, number: num.number, key, own, testMode: cfg.testMode };
}

const realCallInProgress = () => [...live.values()].some((st) => st.call && !st.call.test && st.call.status !== "ended");

function blocked(input, reason) {
  logAction("call_blocked", { business: input.businessName, number: input.contact && !input.phoneNumber ? "contact" : isOwnerNumber(input.phoneNumber) ? "owner" : last4(input.phoneNumber), purpose: input.purpose, reason });
}

// ---- owner calls ("call me") ------------------------------------------------------------
// The one exception to "businesses only": your own phone, MY_PHONE_NUMBER. The number is never
// stored with the call or logged ("owner" instead) and is looked up again when dialing.
export const OWNER = "owner";
const MAX_OWNER_TEXT = 600;

/** The owner call's rules. Runs before you're asked, and again right before dialing. */
export function precheckOwner(input) {
  const cfg = callSettings();
  const text = [input.task, input.message].filter(Boolean).join(" ");
  if (!String(input.task || "").trim()) return { ok: false, reason: "What should I say or do on the call?" };
  if (text.length > MAX_OWNER_TEXT) return { ok: false, reason: "That's too long for a phone call. Keep it to a short message." };
  if (isSensitive(text)) return { ok: false, reason: "I won't read passwords, card numbers or ID numbers over the phone." };
  const num = checkOwnerNumber();
  if (!num.ok) return num;
  const limits = checkLimits(listCalls(), OWNER, cfg.testMode);
  if (!limits.ok) return limits;
  if (!cfg.testMode) {
    const notReady = liveReady();
    if (notReady) return { ok: false, reason: notReady };
  }
  return { ok: true, testMode: cfg.testMode };
}

/** Read-back for an owner call. It never says the number. */
export function describeOwnerPlan(input) {
  const cfg = callSettings();
  const bits = [`Here's the plan. I'll call your phone and start with "${ownerGreeting()}"`];
  bits.push(`Then: ${String(input.task).replace(/[.!?]+$/, "")}.`);
  if (input.message) bits.push(`The message: ${String(input.message).replace(/[.!?]+$/, "")}.`);
  if (cfg.testMode) bits.push("This is a test call, so your phone won't actually ring.");
  bits.push("Should I dial?");
  return bits.join(" ");
}


export async function startOwnerCall(input, client) {
  const check = precheckOwner(input);
  if (!check.ok) {
    logAction("call_blocked", { business: "owner", number: OWNER, purpose: "owner", reason: check.reason });
    return { ok: false, error: check.reason };
  }
  const cfg = callSettings();
  const call = {
    id: `c${crypto.randomBytes(4).toString("hex")}`,
    createdAt: new Date().toISOString(),
    test: cfg.testMode,
    owner: true,
    businessName: "your phone",
    number: OWNER,
    purpose: "owner",
    goal: String(input.task).slice(0, MAX_OWNER_TEXT),
    details: { kind: input.kind || "message", ...(input.message ? { message: String(input.message).slice(0, MAX_OWNER_TEXT) } : {}) },
    plan: String(input.task).slice(0, MAX_OWNER_TEXT),
    status: "dialing",
    outcome: null,
    summary: "",
    durationSec: 0,
    transcript: [],
  };
  saveCall(call);
  untrackers.set(call.id, track("call", "your phone", () => cancelCall(call)));
  logAction("call_started", { id: call.id, test: call.test, owner: true, number: OWNER, purpose: "owner", kind: call.details.kind });
  if (call.test) {
    simulate(call, client).catch((err) => finish(call, "failed", `The test call hit an error: ${err.message}`));
  } else {
    dialTwilio(call, client).catch((err) => {
      logAction("call_error", { id: call.id, error: err.message, code: err.twilioCode, cause: errorDetails(err) });
      finish(call, "failed", err.friendly || "Twilio couldn't place the call.");
    });
  }
  return { ok: true, started: true, callId: call.id, testMode: call.test };
}

// ---- starting a call -----------------------------------------------------------------

export async function startCall(rawInput, client) {
  const input = withGreetingName(rawInput);
  const check = await precheck(input, client); // checked again right before dialing
  if (!check.ok) {
    blocked(input, check.reason);
    return { ok: false, error: check.reason };
  }
  const cfg = callSettings();
  const call = {
    id: `c${crypto.randomBytes(4).toString("hex")}`,
    createdAt: new Date().toISOString(),
    test: cfg.testMode,
    businessName: input.businessName,
    // only the last 4 digits are stored (plus a keyed hash for the limits); never the full number
    number: check.own ? OWNER : last4(check.number),
    numberKey: check.key,
    purpose: input.purpose,
    ...(input.record ? { record: true } : {}),
    ...(input.personName ? { personName: String(input.personName).slice(0, 40) } : {}),
    goal: input.goal,
    details: input.details || {},
    plan: input.plan,
    status: "dialing",
    outcome: null,
    summary: "",
    durationSec: 0,
    transcript: [],
  };
  saveCall(call);
  // the kill switch ("Jericho, stop") ends the call: a test call stops, a real one is hung up
  untrackers.set(call.id, track("call", call.businessName, () => cancelCall(call)));
  logAction("call_started", { id: call.id, test: call.test, business: call.businessName, number: call.number, purpose: call.purpose, goal: call.goal, record: Boolean(call.record) });

  if (call.test) {
    simulate(call, client, check.number).catch((err) => finish(call, "failed", `The test call hit an error: ${err.message}`));
  } else {
    dialTwilio(call, client, check.number).catch((err) => {
      logAction("call_error", { id: call.id, error: err.message, code: err.twilioCode, cause: errorDetails(err) });
      finish(call, "failed", err.friendly || "Twilio couldn't place the call.");
    });
  }
  return { ok: true, started: true, callId: call.id, testMode: call.test };
}

// ---- finishing -------------------------------------------------------------------------

const SPOKEN = {
  delivered: (c) => `I called ${c.businessName}. ${c.summary}`,
  do_not_call: (c) => `${c.businessName} asked not to be called again, so I ended the call and put the number on the do-not-call list.`,
  booked: (c) => `Good news from ${c.businessName}. ${c.summary}`,
  info_obtained: (c) => `I called ${c.businessName}. ${c.summary}`,
  not_available: (c) => `${c.businessName} couldn't do it. ${c.summary}`,
  needs_callback: (c) => `${c.businessName} needs you to call them back. ${c.summary}`,
  voicemail: (c) => `I got ${c.businessName}'s voicemail and left a short message.`,
  no_answer: (c) => `${c.businessName} didn't answer.`,
  busy: (c) => `${c.businessName}'s line was busy.`,
  failed: (c) => `The call to ${c.businessName} didn't work out. ${c.summary}`,
};

const OWNER_SPOKEN = {
  delivered: (c) => `I called your phone. ${c.summary}`,
  voicemail: () => "I called your phone and left a voicemail.",
  no_answer: () => "I called your phone, but you didn't pick up.",
  busy: () => "I called your phone, but it was busy.",
  failed: (c) => `The call to your phone didn't work out. ${c.summary}`,
};

function finish(call, outcome, summary) {
  untrackers.get(call.id)?.();
  untrackers.delete(call.id);
  const state = live.get(call.id);
  if (call.status === "ended") return;
  live.delete(call.id);
  call.status = "ended";
  call.outcome = outcome;
  if (summary !== undefined) call.summary = summary;
  if (!call.summary) call.summary = { no_answer: "No one picked up.", busy: "The line was busy." }[outcome] || "";
  if (state?.answeredAt && !call.durationSec) call.durationSec = Math.round((Date.now() - state.answeredAt) / 1000);
  call.endedAt = new Date().toISOString();
  saveCall(call);
  logAction("call_ended", { id: call.id, test: call.test, business: call.businessName, outcome, summary: call.summary, durationSec: call.durationSec });
  const said = call.owner ? (OWNER_SPOKEN[outcome] || OWNER_SPOKEN.failed)(call) : (SPOKEN[outcome] || SPOKEN.failed)(call);
  const spoken = (call.test ? "Test call. " : "") + said;
  jobEvents.emit("announce", spoken.trim());
}

// ---- test mode -------------------------------------------------------------------------

async function simulate(call, client, to = null) {
  const cfg = callSettings();
  const scenario = pickScenario(call.purpose);
  call.scenario = scenario;
  live.set(call.id, { answeredAt: null, to });
  if (scenario === "no_answer") {
    await new Promise((r) => setTimeout(r, 2500));
    if (call.status === "ended") return;
    return finish(call, "no_answer");
  }
  live.get(call.id).answeredAt = Date.now();
  call.status = "in-progress";
  const opening = await openingRequest(client, call);
  call.transcript.push({ who: "agent", text: `${call.owner ? ownerGreeting() : disclosure(call)} ${opening}` });
  saveCall(call);
  let simulatedSeconds = 8;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (call.status === "ended") return; // cancelled
    const reply = await simulatedReply(client, call, scenario);
    if (call.status === "ended") return;
    call.transcript.push({ who: "them", text: reply });
    simulatedSeconds += 8 + reply.split(/\s+/).length / 2.5;
    if (wantsNoCalls(reply)) {
      call.transcript.push({ who: "agent", text: stopLine(call) });
      call.durationSec = Math.round(simulatedSeconds);
      return finish(call, ...noMoreCalls(call, to));
    }
    const wrapUp = simulatedSeconds > cfg.maxMinutes * 60 - 20;
    const next = await agentTurn(client, call, { wrapUp });
    if (next.do_not_call && !call.owner) {
      call.transcript.push({ who: "agent", text: next.say || stopLine(call) });
      call.durationSec = Math.round(simulatedSeconds);
      return finish(call, ...noMoreCalls(call, to));
    }
    if (next.say) call.transcript.push({ who: "agent", text: next.say });
    simulatedSeconds += 3 + next.say.split(/\s+/).length / 2.5;
    saveCall(call);
    if (next.end_call || wrapUp) {
      call.durationSec = Math.round(simulatedSeconds);
      return finish(call, next.outcome === "in_progress" ? "failed" : next.outcome, next.summary);
    }
  }
  call.durationSec = Math.round(simulatedSeconds);
  finish(call, "failed", "The call went on too long without finishing.");
}

// ---- real calls (Twilio) ------------------------------------------------------------------

/** The calmer call voice (calls.voiceStability / voiceStyle / speakingRate); the normal voice is untouched. */
export function callVoice() {
  const cfg = callSettings();
  return { outputFormat: "mp3_22050_32", stability: cfg.voiceStability, style: cfg.voiceStyle, speed: cfg.speakingRate };
}

// The call voice: OpenAI if OPENAI_API_KEY is set (calm, reserved style), ElevenLabs if that's
// the selected provider and set up, otherwise Twilio's own neural voice (no extra key).
const CALL_INSTRUCTIONS = `${CALM_INSTRUCTIONS} This is a phone call: clear and easy to follow.`;

/** Starts making the audio for one line; returns its id, or null when Twilio's own voice speaks it. */
function newAudio(text) {
  const provider = callVoiceProvider();
  countVoice({ [provider]: String(text).length }, "call"); // counts only
  if (provider === "twilio") return null;
  const id = crypto.randomBytes(16).toString("hex"); // unguessable: Twilio fetches it without a signature
  const make = provider === "openai" ? synthesizeOpenAi(text, { instructions: CALL_INSTRUCTIONS }) : synthesize(text, callVoice());
  audio.set(
    id,
    make.catch((err) => {
      logAction("call_tts_error", { provider, error: err.message, cause: errorDetails(err) });
      return null; // Twilio's own voice says it instead: never silent
    }),
  );
  setTimeout(() => audio.delete(id), 15 * 60_000).unref();
  return id;
}

/** Twilio's built-in neural voice (calls.twilioVoice), a touch slower for a calm delivery. */
function twilioSay(text) {
  const voice = String(callSettings().twilioVoice || "Polly.Matthew-Neural").replace(/[^\w.-]/g, "");
  const polly = /^Polly\./.test(voice);
  return `<Say voice="${voice}" language="${xml(callSettings().language)}">${polly ? `<prosody rate="95%">${xml(text)}</prosody>` : xml(text)}</Say>`;
}

/** Twilio's errors, in plain words. 21219: an unverified number on a trial account. */
export function twilioProblem(status, body = {}) {
  const code = Number(body.code) || null;
  const msg = String(body.message || "");
  let friendly = "Twilio couldn't place the call.";
  if (code === 21219 || /unverified|trial account/i.test(msg)) friendly = "Twilio won't dial unverified numbers on a trial account. Verify the number in the Twilio console, or upgrade the account.";
  else if (code === 21215 || code === 13227 || /geo.?permission|international permission/i.test(msg)) friendly = "Twilio's calling permissions for that area are turned off in your account.";
  else if (code === 21210 || code === 21212) friendly = "Twilio says the calling number in TWILIO_PHONE_NUMBER isn't one of your Twilio numbers.";
  else if (status === 401 || code === 20003) friendly = "Twilio didn't accept the account SID and auth token in the dot env file.";
  else if (code === 21211 || code === 21214) friendly = "Twilio says that number isn't a valid phone number.";
  const err = new Error(`Twilio ${status}${code ? ` (${code})` : ""}: ${msg.replace(/\+?\d[\d\s().-]{6,}\d/g, "[number]") || "error"}`);
  err.friendly = friendly;
  err.twilioCode = code;
  return err;
}

async function dialTwilio(call, client, dialTo = null) {
  const cfg = callSettings();
  // An owner call is checked again and its number looked up only now, from .env.
  let to = dialTo;
  if (call.owner || call.number === OWNER) {
    const own = checkOwnerNumber();
    if (!own.ok) throw new Error("the owner number isn't set up");
    to = own.number;
  }
  const opening = await openingRequest(client, call);
  if (!to) throw new Error("no number to dial");
  const text = `${call.owner ? ownerGreeting() : disclosure(call)} ${opening}`;
  // One shared copy of the call for every webhook, so their saves can't overwrite each other.
  // The full number lives only here, in memory, for the length of the call.
  live.set(call.id, { call, client, to, opening: text, audioId: newAudio(text), silences: 0, turns: 0, answeredAt: null });

  const base = cfg.publicUrl;
  const form = new URLSearchParams({
    To: to,
    From: secrets.twilioNumber,
    Url: `${base}/twilio/voice?call=${call.id}`,
    Method: "POST",
    StatusCallback: `${base}/twilio/status?call=${call.id}`,
    StatusCallbackMethod: "POST",
    TimeLimit: String(cfg.maxMinutes * 60), // hard cap enforced by Twilio itself
    Timeout: "30", // seconds to let it ring
  });
  for (const ev of ["initiated", "ringing", "answered", "completed"]) form.append("StatusCallbackEvent", ev);
  if (call.record) form.set("Record", "true"); // only when you asked, and the opening line says so
  const auth = Buffer.from(`${secrets.twilioSid}:${secrets.twilioToken}`).toString("base64");
  const res = await keepAliveFetch(`https://api.twilio.com/2010-04-01/Accounts/${secrets.twilioSid}/Calls.json`, {
    method: "POST",
    headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw twilioProblem(res.status, body);
  call.twilioSid = body.sid;
  if (call.status === "dialing") call.status = "ringing";
  saveCall(call);
}

const xml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);

/**
 * The audio when it's ready (OpenAI or ElevenLabs); Twilio's own voice if there's none, it
 * failed, or it takes too long. Waits for it first, so a failed clip is never silence.
 */
async function speakTwiml(state, audioId, text, waitMs = 6000) {
  if (!audioId) return twilioSay(text);
  let timer;
  const ready = await Promise.race([audio.get(audioId) || null, new Promise((r) => (timer = setTimeout(() => r(null), waitMs)))]).finally(() => clearTimeout(timer));
  return ready ? `<Play>${callSettings().publicUrl}/twilio/audio/${audioId}</Play>` : twilioSay(text);
}

function gatherTwiml(call, inner) {
  const cfg = callSettings();
  return `<Gather input="speech" action="${cfg.publicUrl}/twilio/gather?call=${call.id}" method="POST" speechTimeout="auto" timeout="7" language="${xml(cfg.language)}" actionOnEmptyResult="true">${inner}</Gather>`;
}

const twiml = (body) => `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;

/** Twilio signs every webhook with your auth token; anything else is rejected. */
export function validTwilioSignature(signature, fullUrl, params) {
  if (!secrets.twilioToken || !signature) return false;
  const data = fullUrl + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = crypto.createHmac("sha1", secrets.twilioToken).update(Buffer.from(data, "utf8")).digest("base64");
  const a = Buffer.from(String(signature));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function findCall(id) {
  return listCalls().find((c) => c.id === id) || null;
}

/** Handles /twilio/voice, /twilio/gather, /twilio/status. Returns TwiML (or "" for status). */
export async function handleTwilio(kind, callId, params) {
  const state = live.get(callId);
  const call = state?.call || findCall(callId);
  if (!call) return twiml("<Hangup/>");
  const cfg = callSettings();

  if (kind === "status") {
    const status = params.CallStatus;
    if (params.CallDuration) call.durationSec = Number(params.CallDuration);
    if (status === "in-progress" && state && !state.answeredAt) state.answeredAt = Date.now();
    if (["completed", "busy", "no-answer", "failed", "canceled"].includes(status)) {
      const outcome = call.outcome || { busy: "busy", "no-answer": "no_answer", failed: "failed", canceled: "failed" }[status] || state?.outcome || "failed";
      const summary = state?.summary ?? (status === "completed" && !call.outcome ? "The call ended before anything was agreed." : undefined);
      finish(call, outcome, summary);
    } else if (call.status !== "ended") {
      call.status = status;
      saveCall(call);
    }
    return "";
  }

  if (!state) return twiml("<Hangup/>"); // server restarted mid-call

  if (kind === "voice") {
    state.answeredAt = Date.now();
    call.status = "in-progress";
    call.transcript.push({ who: "agent", text: state.opening });
    saveCall(call);
    return twiml(gatherTwiml(call, await speakTwiml(state, state.audioId, state.opening)));
  }

  if (kind === "gather") {
    const heard = String(params.SpeechResult || "").trim();
    if (!heard) {
      state.silences++;
      if (state.silences >= 2) {
        state.outcome = "failed";
        state.summary = "No one responded on the line.";
        return twiml(`${twilioSay("Sorry, I can't hear anyone. Goodbye.")}<Hangup/>`);
      }
      return twiml(gatherTwiml(call, twilioSay("Hello? Are you still there?")));
    }
    state.silences = 0;
    state.turns++;
    call.transcript.push({ who: "them", text: heard });
    // "Stop", "don't call again", "take me off your list": end politely at once, never call again.
    if (wantsNoCalls(heard)) return endNoMoreCalls(state, call);
    const elapsed = (Date.now() - state.answeredAt) / 1000;
    const wrapUp = elapsed > cfg.maxMinutes * 60 - 30 || state.turns >= MAX_TURNS;
    let next;
    try {
      next = await agentTurn(state.client, call, { wrapUp });
    } catch (err) {
      logAction("call_error", { id: call.id, error: err.message, cause: errorDetails(err) });
      next = { say: `Sorry, I'm having trouble on my end. ${cfg.ownerName} will call you back. Goodbye.`, end_call: true, outcome: "needs_callback", summary: "The assistant had a technical problem mid-call." };
    }
    if (next.do_not_call && !call.owner) return endNoMoreCalls(state, call, next.say);
    if (next.say) call.transcript.push({ who: "agent", text: next.say });
    saveCall(call);
    const speak = next.say ? await speakTwiml(state, newAudio(next.say), next.say) : "";
    if (next.end_call || wrapUp) {
      state.outcome = next.outcome === "in_progress" ? "failed" : next.outcome;
      state.summary = next.summary;
      call.outcome = state.outcome;
      call.summary = state.summary;
      saveCall(call);
      return twiml(`${speak}<Hangup/>`);
    }
    return twiml(gatherTwiml(call, speak));
  }
  return twiml("<Hangup/>");
}

// ---- do not call ----------------------------------------------------------------------------
const stopLine = (call) => (call.owner ? "Okay, I'll stop. Bye!" : "Understood. I won't call this number again. Sorry to bother you. Goodbye.");

/** They asked not to be called: the number goes on the do-not-call list (except your own). */
function noMoreCalls(call, to) {
  if (call.owner) return ["delivered", "You asked me to stop, so I hung up."];
  if (to) addDoNotCall(to, "asked during a call");
  return ["do_not_call", "They asked not to be called again, so the number is on the do-not-call list."];
}

function endNoMoreCalls(state, call, said) {
  const line = said || stopLine(call);
  call.transcript.push({ who: "agent", text: line });
  const [outcome, summary] = noMoreCalls(call, state.to);
  Object.assign(state, { outcome, summary });
  Object.assign(call, { outcome, summary });
  saveCall(call);
  return twiml(`${twilioSay(line)}<Hangup/>`);
}

/** The audio Twilio plays. Waits for ElevenLabs if it's still generating. */
export async function callAudio(id) {
  const p = audio.get(id);
  return p ? await p : null;
}

/** Read-back used for the spoken confirmation. */
export function describePlan(input, number) {
  const d = input.details || {};
  const cfg = callSettings();
  const bits = [];
  bits.push(isOwnerNumber(number) ? `Here's the plan. I'll call your own phone as practice, and you play ${input.businessName}.` : `Here's the plan. I'll call ${input.businessName} at ${speakNumber(number)}.`);
  bits.push(`The goal: ${String(input.goal).replace(/[.!?]+$/, "")}.`);
  if (d.name && !String(input.goal).includes(d.name)) bits.push(`The booking name is ${d.name}.`);
  bits.push(`I'll start with "${disclosure({ purpose: input.purpose, personName: input.personName, record: input.record })}" Then: ${String(input.plan).replace(/[.!?]+$/, "")}.`);
  if (input.record) bits.push("You asked me to record it, so I'll say at the start that the call is being recorded.");
  if (cfg.testMode) bits.push("This is a test call, so nobody will actually be dialed.");
  bits.push("Should I dial?");
  return bits.join(" ");
}

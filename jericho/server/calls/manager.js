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
import { synthesize } from "../tts.js";
import { agentTurn, disclosure, openingRequest, pickScenario, simulatedReply } from "./agent.js";
import { callSettings, checkIntentKeywords, checkLimits, checkNumber, normalizeNumber, screenWithClaude, speakNumber } from "./policy.js";

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

export function listCalls() {
  try {
    const data = JSON.parse(fs.readFileSync(CALLS_FILE, "utf8"));
    return Array.isArray(data.calls) ? data.calls : [];
  } catch {
    return [];
  }
}

function saveCall(call) {
  const calls = listCalls().filter((c) => c.id !== call.id);
  const { client: _c, ...stored } = call;
  calls.push(stored);
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
export async function precheck(input, client, { screen = true } = {}) {
  const cfg = callSettings();
  const kw = checkIntentKeywords(input);
  if (!kw.ok) return kw;
  const num = checkNumber(input.phoneNumber);
  if (!num.ok) return num;
  const limits = checkLimits(listCalls(), num.number, cfg.testMode);
  if (!limits.ok) return limits;
  if (!cfg.testMode) {
    const notReady = liveReady();
    if (notReady) return { ok: false, reason: notReady };
  }
  // Calling your own phone (MY_PHONE_NUMBER) is a rehearsal: you play the business.
  const own = secrets.myPhoneNumber && normalizeNumber(secrets.myPhoneNumber, cfg.defaultCountryCode) === num.number;
  if (screen && !own) {
    const key = inputHash(input);
    if (!screened.has(key)) {
      const verdict = await screenWithClaude(client, input);
      if (!verdict.ok) return verdict;
      screened.set(key, Date.now());
    }
  }
  return { ok: true, number: num.number, testMode: cfg.testMode };
}

function blocked(input, reason) {
  logAction("call_blocked", { business: input.businessName, number: input.phoneNumber, purpose: input.purpose, reason });
}

// ---- starting a call -----------------------------------------------------------------

export async function startCall(input, client) {
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
    number: check.number,
    purpose: input.purpose,
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
  logAction("call_started", { id: call.id, test: call.test, business: call.businessName, number: call.number, purpose: call.purpose, goal: call.goal });

  if (call.test) {
    simulate(call, client).catch((err) => finish(call, "failed", `The test call hit an error: ${err.message}`));
  } else {
    dialTwilio(call, client).catch((err) => {
      logAction("call_error", { id: call.id, error: err.message, cause: errorDetails(err) });
      finish(call, "failed", "Twilio couldn't place the call.");
    });
  }
  return { ok: true, started: true, callId: call.id, testMode: call.test };
}

// ---- finishing -------------------------------------------------------------------------

const SPOKEN = {
  booked: (c) => `Good news from ${c.businessName}. ${c.summary}`,
  info_obtained: (c) => `I called ${c.businessName}. ${c.summary}`,
  not_available: (c) => `${c.businessName} couldn't do it. ${c.summary}`,
  needs_callback: (c) => `${c.businessName} needs you to call them back. ${c.summary}`,
  voicemail: (c) => `I got ${c.businessName}'s voicemail and left a short message.`,
  no_answer: (c) => `${c.businessName} didn't answer.`,
  busy: (c) => `${c.businessName}'s line was busy.`,
  failed: (c) => `The call to ${c.businessName} didn't work out. ${c.summary}`,
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
  const spoken = (call.test ? "Test call. " : "") + (SPOKEN[outcome] || SPOKEN.failed)(call);
  jobEvents.emit("announce", spoken.trim());
}

// ---- test mode -------------------------------------------------------------------------

async function simulate(call, client) {
  const cfg = callSettings();
  const scenario = pickScenario(call.purpose);
  call.scenario = scenario;
  live.set(call.id, { answeredAt: null });
  if (scenario === "no_answer") {
    await new Promise((r) => setTimeout(r, 2500));
    if (call.status === "ended") return;
    return finish(call, "no_answer");
  }
  live.get(call.id).answeredAt = Date.now();
  call.status = "in-progress";
  const opening = await openingRequest(client, call);
  call.transcript.push({ who: "agent", text: `${disclosure()} ${opening}` });
  saveCall(call);
  let simulatedSeconds = 8;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (call.status === "ended") return; // cancelled
    const reply = await simulatedReply(client, call, scenario);
    if (call.status === "ended") return;
    call.transcript.push({ who: "them", text: reply });
    simulatedSeconds += 8 + reply.split(/\s+/).length / 2.5;
    const wrapUp = simulatedSeconds > cfg.maxMinutes * 60 - 20;
    const next = await agentTurn(client, call, { wrapUp });
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

function newAudio(text) {
  const id = crypto.randomBytes(16).toString("hex"); // unguessable: Twilio fetches it without a signature
  audio.set(
    id,
    synthesize(text, { outputFormat: "mp3_22050_32" }).catch((err) => {
      logAction("call_tts_error", { error: err.message, cause: errorDetails(err) });
      return null;
    }),
  );
  setTimeout(() => audio.delete(id), 15 * 60_000).unref();
  return id;
}

async function dialTwilio(call, client) {
  const cfg = callSettings();
  const opening = await openingRequest(client, call);
  const text = `${disclosure()} ${opening}`;
  // One shared copy of the call for every webhook, so their saves can't overwrite each other.
  live.set(call.id, { call, client, opening: text, audioId: newAudio(text), silences: 0, turns: 0, answeredAt: null });

  const base = cfg.publicUrl;
  const form = new URLSearchParams({
    To: call.number,
    From: secrets.twilioNumber,
    Url: `${base}/twilio/voice?call=${call.id}`,
    Method: "POST",
    StatusCallback: `${base}/twilio/status?call=${call.id}`,
    StatusCallbackMethod: "POST",
    TimeLimit: String(cfg.maxMinutes * 60), // hard cap enforced by Twilio itself
    Timeout: "30", // seconds to let it ring
  });
  for (const ev of ["initiated", "ringing", "answered", "completed"]) form.append("StatusCallbackEvent", ev);
  const auth = Buffer.from(`${secrets.twilioSid}:${secrets.twilioToken}`).toString("base64");
  const res = await keepAliveFetch(`https://api.twilio.com/2010-04-01/Accounts/${secrets.twilioSid}/Calls.json`, {
    method: "POST",
    headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${body.message || "error"}`);
  call.twilioSid = body.sid;
  if (call.status === "dialing") call.status = "ringing";
  saveCall(call);
}

const xml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);

function speakTwiml(state, audioId, text) {
  // ElevenLabs audio when it's ready; Twilio's own voice if ElevenLabs failed.
  return audioId ? `<Play>${callSettings().publicUrl}/twilio/audio/${audioId}</Play>` : `<Say>${xml(text)}</Say>`;
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
    return twiml(gatherTwiml(call, speakTwiml(state, state.audioId, state.opening)));
  }

  if (kind === "gather") {
    const heard = String(params.SpeechResult || "").trim();
    if (!heard) {
      state.silences++;
      if (state.silences >= 2) {
        state.outcome = "failed";
        state.summary = "No one responded on the line.";
        return twiml(`<Say>Sorry, I can't hear anyone. Goodbye.</Say><Hangup/>`);
      }
      return twiml(gatherTwiml(call, `<Say>Hello? Are you still there?</Say>`));
    }
    state.silences = 0;
    state.turns++;
    call.transcript.push({ who: "them", text: heard });
    const elapsed = (Date.now() - state.answeredAt) / 1000;
    const wrapUp = elapsed > cfg.maxMinutes * 60 - 30 || state.turns >= MAX_TURNS;
    let next;
    try {
      next = await agentTurn(state.client, call, { wrapUp });
    } catch (err) {
      logAction("call_error", { id: call.id, error: err.message, cause: errorDetails(err) });
      next = { say: `Sorry, I'm having trouble on my end. ${cfg.ownerName} will call you back. Goodbye.`, end_call: true, outcome: "needs_callback", summary: "The assistant had a technical problem mid-call." };
    }
    if (next.say) call.transcript.push({ who: "agent", text: next.say });
    saveCall(call);
    const speak = next.say ? speakTwiml(state, newAudio(next.say), next.say) : "";
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
  bits.push(`Here's the plan. I'll call ${input.businessName} at ${speakNumber(number)}.`);
  bits.push(`The goal: ${String(input.goal).replace(/[.!?]+$/, "")}.`);
  if (d.name && !String(input.goal).includes(d.name)) bits.push(`The booking name is ${d.name}.`);
  bits.push(`I'll start by saying I'm an AI assistant calling for ${cfg.ownerName}, then: ${String(input.plan).replace(/[.!?]+$/, "")}.`);
  if (cfg.testMode) bits.push("This is a test call, so nobody will actually be dialed.");
  bits.push("Should I dial?");
  return bits.join(" ");
}

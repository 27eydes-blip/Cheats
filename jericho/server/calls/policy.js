// What Jericho is allowed to call, checked in code before you're even asked to confirm,
// and again right before dialing.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT, secrets, settings } from "../config.js";
import { isSensitive } from "../secrets.js";

const clamp = (v, lo, hi, dflt) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? dflt : Math.min(hi, Math.max(lo, Number(v))));

export function callSettings() {
  const c = settings.calls || {};
  return {
    testMode: c.testMode !== false,
    testScenario: c.testScenario || "random",
    ownerName: c.ownerName || "the owner",
    // the opener: "Hey Luke, I'm Jericho, Sammy Eyde's personal assistant."
    ownerFullName: String(c.ownerFullName || c.ownerName || "the owner").trim(),
    discloseAiUpfront: c.discloseAiUpfront === true,
    // a calmer, steadier ElevenLabs voice on calls (the normal voice is unchanged)
    voiceStability: clamp(c.voiceStability, 0, 1, 0.8),
    voiceStyle: clamp(c.voiceStyle, 0, 1, 0),
    speakingRate: clamp(c.speakingRate, 0.7, 1.2, 0.92),
    publicUrl: (c.publicUrl || "").replace(/\/+$/, ""),
    maxCallsPerDay: Number(c.maxCallsPerDay) > 0 ? Number(c.maxCallsPerDay) : 10,
    // at most 2 calls a day to any one number, whatever the settings say
    maxCallsPerNumberPerDay: Math.min(MAX_PER_NUMBER, Number(c.maxCallsPerNumberPerDay) > 0 ? Number(c.maxCallsPerNumberPerDay) : MAX_PER_NUMBER),
    maxMinutes: c.maxMinutes ?? 5,
    // US numbers only (+1), whatever the settings say
    allowedCountryCodes: ["1"],
    defaultCountryCode: "1",
    agentModel: c.agentModel || settings.claude?.model || "claude-opus-5-5",
    agentEffort: c.agentEffort || "low",
    language: c.language || settings.speechLang || "en-US",
  };
}

export const PURPOSES = ["reservation", "check_hours", "appointment", "simple_question", "personal"];
export const MAX_PER_NUMBER = 2;
export const COOLDOWN_MS = 10 * 60_000; // before the same number can be called again
export const MAX_PER_HOUR = 4; // no blasting: a handful of calls an hour at most

// ---- phone numbers in records and logs -----------------------------------------------------
// Call records and the do-not-call list keep only the last 4 digits, plus a keyed hash so the
// limits and the do-not-call list can still recognise a number. The key lives in data/.

/** "...0123" */
export function last4(number) {
  const d = String(number || "").replace(/\D/g, "");
  return d.length >= 4 ? `...${d.slice(-4)}` : "...";
}

let hashKey = null;
function numberHashKey() {
  if (hashKey) return hashKey;
  const file = path.join(process.env.JERICHO_DATA_DIR || path.join(ROOT, "data"), "call-key");
  try {
    hashKey = fs.readFileSync(file);
  } catch {
    hashKey = crypto.randomBytes(32);
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, hashKey, { mode: 0o600 });
    } catch {
      /* in memory only for this run */
    }
  }
  return hashKey;
}

/** A keyed hash of the +1 number: matches the same number later without storing it. */
export function numberKey(number) {
  const n = normalizeNumber(number, "1");
  if (!n || n.startsWith("short:")) return null;
  return crypto.createHmac("sha256", numberHashKey()).update(n).digest("base64url").slice(0, 22);
}

// Country code 1 outside the US: Canada, and the Caribbean and Atlantic islands (charged as
// international calls, and the usual "one ring" scam numbers).
const NON_US_AREA_CODES = new Set(
  (
    "204 226 236 249 250 257 263 289 306 343 354 365 367 368 382 387 403 416 418 428 431 437 438 450 460 468 474 506 514 519 548 579 581 584 587 604 613 639 647 672 683 705 709 742 753 778 780 782 807 819 825 867 873 879 902 905 942 " +
    "242 246 264 268 284 345 441 473 649 658 664 721 758 767 784 809 829 849 868 869 876"
  ).split(" "),
);
// Pay-per-call, carrier and personal-service codes: can cost money to call.
const PREMIUM_AREA_CODES = new Set(["900", "976", "500", "521", "522", "523", "524", "525", "526", "527", "528", "529", "533", "544", "566", "577", "588", "700"]);

/** "+1 (555) 123-4567", "555.123.4567", "15551234567" -> "+15551234567" (or null). */
export function normalizeNumber(raw, defaultCountryCode = "1") {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (/[a-z]/i.test(s.replace(/^tel:/i, "").replace(/\s*(ext\.?|x)\s*\d+$/i, ""))) return null; // vanity letters etc.
  let digits = s.replace(/\D/g, "");
  if (s.startsWith("+")) return `+${digits}`;
  if (s.startsWith("00")) return `+${digits.slice(2)}`;
  if (defaultCountryCode === "1") {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    return digits.length > 0 && digits.length < 7 ? `short:${digits}` : null;
  }
  if (digits.startsWith("0")) digits = digits.slice(1);
  return `+${defaultCountryCode}${digits}`;
}

/** Digits read in groups so they're easy to check by ear: "5 5 5, 1 2 3, 4 5 6 7". */
export function speakNumber(e164) {
  const d = String(e164).replace(/\D/g, "");
  const national = d.startsWith("1") && d.length === 11 ? d.slice(1) : d;
  const groups = national.length === 10 ? [national.slice(0, 3), national.slice(3, 6), national.slice(6)] : national.match(/.{1,3}/g) || [];
  return groups.map((g) => g.split("").join(" ")).join(", ");
}

const EMERGENCY_AND_SPECIAL = new Set([
  "911", "112", "999", "000", "110", "119", "118", "100", "101", "102", "108", "988", "933", "08", "15", "17", "18",
]);

/** Number rules: no emergency/short codes, no premium rate, only allowed countries. */
export function checkNumber(raw) {
  const cfg = callSettings();
  const n = normalizeNumber(raw, cfg.defaultCountryCode);
  if (!n) return { ok: false, reason: "That doesn't look like a valid phone number." };
  if (n.startsWith("short:")) {
    const code = n.slice(6);
    if (EMERGENCY_AND_SPECIAL.has(code) || /^[2-9]11$/.test(code)) {
      return { ok: false, reason: "I can't call emergency or special service numbers. For an emergency, dial it yourself." };
    }
    return { ok: false, reason: "That number is too short to be a normal business line." };
  }
  const digits = n.slice(1);
  if (EMERGENCY_AND_SPECIAL.has(digits) || /^1?[2-9]11$/.test(digits)) {
    return { ok: false, reason: "I can't call emergency or special service numbers." };
  }
  if (!digits.startsWith("1")) return { ok: false, reason: "I can only call US numbers, starting with plus one." };
  if (digits.length !== 11) return { ok: false, reason: "That US number has the wrong number of digits." };
  const area = digits.slice(1, 4);
  const exchange = digits.slice(4, 7);
  if (PREMIUM_AREA_CODES.has(area) || exchange === "976") return { ok: false, reason: "I won't call premium-rate or toll numbers." };
  if (/^[01]/.test(area) || /^[01]/.test(exchange) || /^\d11$/.test(area)) return { ok: false, reason: "That isn't a valid US number." };
  if (NON_US_AREA_CODES.has(area)) return { ok: false, reason: "I can only call US numbers. That one is outside the US, even though it starts with plus one." };
  const fictional = exchange === "555" && /^01/.test(digits.slice(7));
  if (fictional && !cfg.testMode) return { ok: false, reason: "That's a fictional 555 number." };
  return { ok: true, number: n };
}

// ---- owner calls: the one person Jericho may call is you, at MY_PHONE_NUMBER ----------------
// The number lives only in .env. It's never taken from what Claude or anyone says: the owner
// call tool has no number field, and the server dials this one.

/** MY_PHONE_NUMBER as +1XXXXXXXXXX, or null if it isn't set or isn't a US number. */
export function ownerNumber(raw = secrets.myPhoneNumber) {
  const n = normalizeNumber(raw, "1");
  return n && /^\+1\d{10}$/.test(n) ? n : null;
}

/** Is `raw` exactly the owner's number (after normalizing)? Every other number is someone else. */
export function isOwnerNumber(raw) {
  const owner = ownerNumber();
  const n = normalizeNumber(raw, "1");
  return Boolean(owner && n && n === owner);
}

/** The owner call's number rules: MY_PHONE_NUMBER set, US (+1), and a normal dialable number. */
export function checkOwnerNumber(raw = secrets.myPhoneNumber) {
  if (!String(raw || "").trim()) return { ok: false, reason: "I don't have your number. Add MY_PHONE_NUMBER to the dot env file." };
  const owner = ownerNumber(raw);
  if (!owner || !isOwnerNumber(raw)) return { ok: false, reason: "Owner calls only go to your own US number, MY_PHONE_NUMBER in the dot env file, written as plus one and ten digits." };
  const num = checkNumber(owner);
  if (!num.ok) return num;
  return { ok: true, number: owner };
}


// Threats, harassment, scams, deception, and impersonating anyone (Sammy, another person or a business).
const BAD_INTENT =
  /\b(pretend|impersonat|pose as|posing as|as if (?:you were|you're|it's) (?!an? (?:ai|assistant))|say (?:you are|you're|i am|i'm|it's|this is) (?!an? (?:ai|assistant))|say (?:you're|you are) (?:calling )?from|act like|threat|threaten|intimidat|blackmail|extort|harass|scare|insult|prank|revenge|stalk|keep calling|call (?:them|him|her) (?:again and again|over and over|every)|spam|scam|deceiv|decept|mislead|gift ?cards?|wire (?:money|transfer)|bitcoin|crypto|irs|social security|warrant|arrest|lawsuit|fake|lie to|trick|refund (?:scam|fraud)|verify (?:their|your) account|bank details|one[- ]time code|otp|two[- ]factor)\b/i;

/** Fast keyword screen on the goal and script. A Claude screen runs after this. */
export function checkIntentKeywords(input) {
  const text = [input.goal, input.plan, input.details?.notes, input.businessName].filter(Boolean).join(" ");
  if (!PURPOSES.includes(input.purpose)) {
    return { ok: false, reason: "I make calls for reservations, checking hours, appointments, a simple question, or a personal message." };
  }
  if (BAD_INTENT.test(text)) {
    return { ok: false, reason: "I can't make that call. I only make honest, ordinary calls as your assistant: no threats, harassment, scams, tricks or pretending to be anyone." };
  }
  if (isSensitive(text)) {
    return { ok: false, reason: "I won't share passwords, card numbers or ID numbers on a call." };
  }

  return { ok: true };
}

/**
 * Limits, so Jericho can't be used to pester anyone or blast numbers:
 *   - calls.maxCallsPerDay in total (default 10; real calls)
 *   - at most 2 calls a day to the same number
 *   - 10 minutes before the same number again
 *   - at most 4 real calls in any hour
 * `key` is the number's keyed hash (numberKey) or "owner".
 */
export function checkLimits(calls, key, testMode, now = Date.now()) {
  const cfg = callSettings();
  const mine = calls.filter((c) => !c.blocked && Boolean(c.test) === Boolean(testMode));
  const recent = mine.filter((c) => Date.parse(c.createdAt) > now - 24 * 3600_000);
  if (!testMode && recent.length >= cfg.maxCallsPerDay) {
    return { ok: false, reason: `I've already made ${recent.length} calls in the last day, which is the limit. Change calls.maxCallsPerDay in settings to allow more.` };
  }
  if (!testMode && key !== "owner" && recent.filter((c) => Date.parse(c.createdAt) > now - 3600_000).length >= MAX_PER_HOUR) {
    return { ok: false, reason: "I've made several calls in the last hour already. I don't make calls in bulk; try again later." };
  }
  const same = recent.filter((c) => (c.numberKey || c.number) === key);
  if (same.length >= cfg.maxCallsPerNumberPerDay) {
    return { ok: false, reason: "I've already called that number enough times today." };
  }
  const last = Math.max(0, ...same.map((c) => Date.parse(c.createdAt)));
  // owner calls ("call me") keep working as before: no cooldown on your own phone
  if (key !== "owner" && last && now - last < COOLDOWN_MS) {
    const mins = Math.ceil((COOLDOWN_MS - (now - last)) / 60_000);
    return { ok: false, reason: `I called that number less than 10 minutes ago. Wait about ${mins} more minute${mins === 1 ? "" : "s"}.` };
  }
  return { ok: true };
}

const SCREEN_SCHEMA = {
  type: "object",
  properties: { allowed: { type: "boolean" }, reason: { type: "string" } },
  required: ["allowed", "reason"],
  additionalProperties: false,
};

/** A small Claude call that judges whether the call's goal is an ordinary, honest errand. */
export async function screenWithClaude(client, input) {
  const cfg = callSettings();
  try {
    const response = await client.beta.messages.create({
      model: cfg.agentModel,
      max_tokens: 2000,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCREEN_SCHEMA } },
      system:
        "You screen outbound phone calls an AI assistant will place on its owner's behalf. It introduces itself by name as the owner's personal assistant, and always says it's an AI when asked. " +
        "Allow ordinary, honest calls: errands with a business (reservations, opening hours, appointments, a simple question), and calls to a person the owner knows " +
        "to pass on a message, ask a question, invite them, remind them or check in. " +
        "Block anything involving harassment, threats, intimidation, pranks, impersonating anyone (the owner, another person or a business), " +
        "deception or lying about who is calling, scams, debt collection, sales or marketing, political calls, calling many people (bulk), " +
        "collecting personal data, payments or money transfers, someone who asked not to be called, or emergencies. Reason is one short sentence the assistant can say aloud.",
      messages: [{ role: "user", content: JSON.stringify(input) }],
    });
    if (response.stop_reason === "refusal") return { ok: false, reason: "I can't make that call." };
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const verdict = JSON.parse(text);
    return verdict.allowed ? { ok: true } : { ok: false, reason: verdict.reason || "I can't make that call." };
  } catch (err) {
    // Fail closed: if the screen can't run, don't call.
    return { ok: false, reason: "I couldn't check that call is okay, so I won't make it right now.", error: err.message };
  }
}

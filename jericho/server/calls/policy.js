// What Jericho is allowed to call, checked in code before you're even asked to confirm,
// and again right before dialing.
import { secrets, settings } from "../config.js";
import { isSensitive } from "../secrets.js";

export function callSettings() {
  const c = settings.calls || {};
  return {
    testMode: c.testMode !== false,
    testScenario: c.testScenario || "random",
    ownerName: c.ownerName || "the owner",
    publicUrl: (c.publicUrl || "").replace(/\/+$/, ""),
    maxCallsPerDay: c.maxCallsPerDay ?? 3,
    maxCallsPerNumberPerDay: c.maxCallsPerNumberPerDay ?? 2,
    maxMinutes: c.maxMinutes ?? 5,
    allowedCountryCodes: (c.allowedCountryCodes || ["1"]).map(String),
    defaultCountryCode: String(c.defaultCountryCode || "1"),
    agentModel: c.agentModel || settings.claude?.model || "claude-opus-5-5",
    agentEffort: c.agentEffort || "low",
    language: c.language || settings.speechLang || "en-US",
  };
}

export const PURPOSES = ["reservation", "check_hours", "appointment", "simple_question"];

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
  const country = cfg.allowedCountryCodes.find((cc) => digits.startsWith(cc));
  if (!country) return { ok: false, reason: "I can only call numbers in your own country." };
  if (country === "1") {
    if (digits.length !== 11) return { ok: false, reason: "That US or Canadian number has the wrong number of digits." };
    const area = digits.slice(1, 4);
    const exchange = digits.slice(4, 7);
    if (["900", "976"].includes(area) || exchange === "976") return { ok: false, reason: "I won't call premium-rate numbers." };
    if (/^[01]/.test(area) || /^[01]/.test(exchange)) return { ok: false, reason: "That isn't a valid North American number." };
    const fictional = exchange === "555" && /^01/.test(digits.slice(7));
    if (fictional && !cfg.testMode) return { ok: false, reason: "That's a fictional 555 number." };
  } else if (country === "44" && /^44(9|87|70)/.test(digits)) {
    return { ok: false, reason: "I won't call premium-rate numbers." };
  }
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

// Business calls never go to people. Code-level, before the Claude screen.
const PERSONAL =
  /\b(my (?:mom|mum|mother|dad|father|parents?|wife|husband|partner|girlfriend|boyfriend|son|daughter|kids?|brother|sister|sibling|cousin|aunt|uncle|grandma|grandpa|grandmother|grandfather|friend|buddy|ex|neighbou?r|boss|coworker|colleague)|say hi to|say hello to|catch up with|check (?:in|up) on (?:him|her|them)|chat with (?:him|her|them))\b/i;

const BAD_INTENT =
  /\b(pretend|impersonat|pose as|posing as|say (?:you are|you're|i am|i'm) (?!an? (?:ai|assistant))|threat|threaten|harass|scare|insult|prank|revenge|stalk|keep calling|spam|scam|gift ?cards?|wire (?:money|transfer)|bitcoin|crypto|irs|social security|warrant|arrest|lawsuit|fake|lie to|trick|refund (?:scam|fraud)|verify (?:their|your) account|bank details|one[- ]time code|otp|two[- ]factor)\b/i;

/** Fast keyword screen on the goal and script. A Claude screen runs after this. */
export function checkIntentKeywords(input) {
  const text = [input.goal, input.plan, input.details?.notes, input.businessName].filter(Boolean).join(" ");
  if (!PURPOSES.includes(input.purpose)) {
    return { ok: false, reason: "I only make calls for reservations, checking hours, appointments or a simple question." };
  }
  if (BAD_INTENT.test(text)) {
    return { ok: false, reason: "I can't make that call. I only make honest, ordinary calls like bookings, hours and appointments." };
  }
  if (isSensitive(text)) {
    return { ok: false, reason: "I won't share passwords, card numbers or ID numbers on a call." };
  }
  if (PERSONAL.test(text)) {
    return { ok: false, reason: "I only call businesses, or your own phone. I can't call other people." };
  }
  return { ok: true };
}

/** Daily limits: total calls, and calls to the same number (so it can't be used to pester anyone). */
export function checkLimits(calls, number, testMode) {
  const cfg = callSettings();
  const dayAgo = Date.now() - 24 * 3600_000;
  const recent = calls.filter((c) => !c.blocked && Boolean(c.test) === Boolean(testMode) && Date.parse(c.createdAt) > dayAgo);
  if (!testMode && recent.length >= cfg.maxCallsPerDay) {
    return { ok: false, reason: `I've already made ${recent.length} calls in the last day, which is the limit. Change calls.maxCallsPerDay in settings to allow more.` };
  }
  if (recent.filter((c) => c.number === number).length >= cfg.maxCallsPerNumberPerDay) {
    return { ok: false, reason: "I've already called that number enough times today." };
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
        "You screen outbound phone calls an AI assistant will place on its owner's behalf. Allow only ordinary, honest errands with a business: " +
        "restaurant reservations, checking opening hours, booking or moving an appointment, or one simple factual question. " +
        "Block anything involving harassment, threats, pranks, impersonating someone (the assistant must say it is an AI calling for its owner), " +
        "deception, scams, debt collection, sales or marketing, political calls, collecting personal data, payments or money transfers, " +
        "calling private individuals, or emergencies. Reason is one short sentence the assistant can say aloud.",
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

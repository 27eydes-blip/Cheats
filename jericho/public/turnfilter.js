// Stray-turn filter, shared by the page (app.js), the server (brain.js) and the tests.
// After Jericho answers, the mic stays open for a follow-up without the wake word. That window is
// where wasted Claude calls come from: "um", "okay", the TV in the background, a song, or
// Jericho's own voice coming back. Only a clear follow-up (a question, a command, an answer to
// something Jericho just asked) gets through; everything else is dropped with no request at all.
// Saying the wake word always gets through.

const PURE_FILLER = new Set(["um", "umm", "uhm", "uh", "uhh", "er", "erm", "ah", "ahh", "oh", "ooh", "hmm", "hm", "hmmm", "mm", "mmm", "mhm", "huh", "eh", "ha", "hah", "haha", "hahaha", "lol", "like", "so", "well", "anyway", "whatever", "the", "a", "and", "but"]);
const ACK = new Set(["yeah", "yea", "yep", "yup", "ok", "okay", "right", "sure", "cool", "alright", "nice", "wow", "great", "fine", "gotcha", "uh-huh", "mm-hmm", "true", "totally", "exactly", "interesting", "really"]);

// How a real follow-up to Jericho usually starts: a question, a command, or a correction.
const DIRECT = new RegExp(
  "^(?:what|what's|whats|which|who|who's|whose|where|where's|when|why|how|is|are|was|were|can|could|would|will|should|do|does|did|have|has|" +
    "tell|give|show|set|turn|switch|put|play|pause|resume|stop|start|open|close|call|text|send|read|write|make|add|remove|delete|cancel|remind|" +
    "remember|forget|check|find|search|look|get|change|move|go|take|book|order|schedule|plan|help|explain|list|repeat|say|translate|spell|" +
    "define|convert|keep|skip|next|previous|back|mute|unmute|volume|louder|quieter|snooze|dim|brighten|lights?|and|also|then|now|actually|" +
    "no|nope|nah|not|never|wait|instead|more|less|again|same|try|yes|let's|lets|please|sorry|thanks|thank|that's not|that is not|thats not|" +
    "wrong|i want|i need|i'd like|i would like|i meant|i mean|i said|my|use|run|build|fix|save|copy|rename|email|message|invite|wake)\\b",
  "i",
);
const ADDRESS = /\b(you|your|jericho|jer|please)\b/i;
const CONFIRM_WORDS = /\b(yes|yeah|yep|yup|sure|ok|okay|confirm|confirmed|do it|go ahead|go for it|no|nope|nah|don't|do not|cancel|stop|never mind|wait)\b/;

export const MAX_UNADDRESSED_WORDS = 25;

function tokens(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9' -]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Only noise words: "um", "uh huh", "hmm", "oh". Never worth a Claude call. */
export function isNoise(text) {
  const t = tokens(text);
  return t.length === 0 || t.every((w) => PURE_FILLER.has(w) || w === "huh" || /^(u+h+|u+m+|h+m+|m+h*m+|a+h+|o+h+)$/.test(w));
}

/** Only acknowledgements: "okay", "yeah cool", "right". A real answer only after a question. */
export function isAck(text) {
  const t = tokens(text);
  return t.length > 0 && t.every((w) => ACK.has(w) || PURE_FILLER.has(w));
}

/** Share of the heard words that Jericho just said himself (speakerphone echo). */
export function echoOverlap(text, lastSpoken) {
  const heard = tokens(text);
  if (!heard.length || !lastSpoken) return 0;
  const said = new Set(tokens(lastSpoken));
  return heard.filter((w) => said.has(w)).length / heard.length;
}

/**
 * Should a follow-up heard without the wake word be sent?
 * opts: { wakeHeard, askedQuestion (Jericho's last reply ended with a question), interrupted
 * (barge-in), lastSpoken (what Jericho just said), confidence (0-1 from the recognizer, 0 =
 * unknown), enabled (false turns the filter off) }.
 * Returns { send, reason }.
 */
export function classifyFollowUp(text, opts = {}) {
  const { wakeHeard = false, askedQuestion = false, interrupted = false, lastSpoken = "", confidence = 0, enabled = true, confirmPending = false } = opts;
  const t = tokens(text);
  // a yes/no is waiting: short answers always count ("yes", "no", "do it", "cancel", "okay")
  if (confirmPending && t.length && t.length <= 6 && CONFIRM_WORDS.test(t.join(" "))) return { send: true, reason: "answer to a confirmation" };
  if (!t.length || isNoise(text)) return { send: false, reason: "filler" };
  if (!enabled || wakeHeard || interrupted) return { send: true, reason: wakeHeard ? "wake word" : interrupted ? "barge-in" : "filter off" };
  if (t.length >= 3 && echoOverlap(text, lastSpoken) >= 0.7) return { send: false, reason: "echo" };
  if (confidence > 0 && confidence < 0.3) return { send: false, reason: "unclear" };
  if (askedQuestion) return { send: true, reason: "answer to a question" };
  if (isAck(text)) return { send: false, reason: "acknowledgement" };
  const joined = t.join(" ");
  const direct = DIRECT.test(joined) || ADDRESS.test(joined);
  if (t.length > MAX_UNADDRESSED_WORDS && !ADDRESS.test(joined)) return { send: false, reason: "long, not addressed" };
  if (direct) return { send: true, reason: "direct" };
  return { send: false, reason: "not addressed" };
}

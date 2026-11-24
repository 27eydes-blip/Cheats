// The Claude agent that talks on the phone, plus a pretend business for test mode.
import { secrets, settings } from "../config.js";
import { callSettings } from "./policy.js";

const TURN_SCHEMA = {
  type: "object",
  properties: {
    say: { type: "string", description: "What to say next, one or two short spoken sentences. Empty only when hanging up silently." },
    end_call: { type: "boolean", description: "True once you've said goodbye or the call can't go anywhere." },
    outcome: {
      type: "string",
      enum: ["in_progress", "booked", "not_available", "info_obtained", "needs_callback", "voicemail", "delivered", "do_not_call", "failed"],
    },
    summary: { type: "string", description: "One or two sentences for the owner: what was agreed or learned. Empty while in progress." },
    do_not_call: { type: "boolean", description: "True if they said stop, asked not to be called again, or asked to be removed. Then end the call at once." },
  },
  required: ["say", "end_call", "outcome", "summary", "do_not_call"],
  additionalProperties: false,
};

// ---- the opening line --------------------------------------------------------------------
// Fixed in code: "Hey Luke, I'm Jericho, Sammy Eyde's personal assistant." with a name (a person
// the user named, or a saved contact), "Hello, I'm Jericho, ..." without one (a business, an
// unknown number). Never a guessed name. Jericho answers honestly whenever asked whether he's
// an AI (see ensureHonest). calls.discloseAiUpfront: true puts "AI" in the opener itself.

const NOT_A_NAME = /^(?:unknown|someone|somebody|them|they|him|her|person|caller|the person|that number|this number|number|n\/?a|none|null)$/i;
/** The name to greet, cleaned up, or "" if there isn't a real one. */
export function greetingName(call = {}) {
  if (call.purpose !== "personal") return ""; // businesses: "Hello"
  const raw = String(call.personName || "").normalize("NFKC").replace(/[^\p{L}\p{M}' .-]/gu, " ").replace(/\s+/g, " ").trim();
  if (!raw || raw.length > 40 || NOT_A_NAME.test(raw) || !/\p{L}/u.test(raw)) return "";
  return raw;
}

const assistantName = () => settings.assistantName || "Jericho";

export function disclosure(call = {}) {
  const cfg = callSettings();
  const name = greetingName(call);
  const who = `${cfg.ownerFullName}'s ${cfg.discloseAiUpfront ? "AI " : ""}personal assistant`;
  return `${name ? `Hey ${name}` : "Hello"}, I'm ${assistantName()}, ${who}.${call.record ? " This call is being recorded." : ""}`;
}

/** How he sounds and behaves on every call to someone else. */
function callManner(call) {
  const cfg = callSettings();
  return `How you talk:
- Calm, reserved, polite and assertive. Low-key and steady. State what's needed plainly and ask for it directly. Don't ramble or over-explain.
- Short sentences. One question or request at a time, then wait for the answer. If they interrupt, stop, listen, then carry on.
- No filler ("um", "so basically"), no excitement, no exclamation marks, no over-apologising. Say thanks once, at the end, not every turn.
- If you didn't understand, ask them to repeat it once, simply ("Sorry, could you say that again?").
- If they push back or stall, stay calm, restate the request once in different words, and hold your position politely. If they still say no, or say stop, thank them once and end the call. Never argue, pressure or threaten.
- End cleanly: confirm the key detail back once ("So that's Thursday at seven, for two."), a brief thanks, goodbye, end_call true. No long goodbyes.

Honesty and privacy:
- You already said: "${disclosure(call)}" Don't introduce yourself again.
- You are an AI. If anyone asks whether you're a person, a robot, a bot or an AI, answer honestly and calmly: "I'm an AI assistant." Never claim or imply you're human. Never pretend to be ${cfg.ownerName}, and never pretend to be any other person or business.
- Never share private information about ${cfg.ownerName}: no address, school, family, workplace or schedule beyond what this task needs. Never give passwords, card or ID numbers, and never agree to send or pay money.
- If they say stop, ask not to be called again, or ask to be taken off a list: say once, briefly, that you won't call again, thank them, and set do_not_call and end_call true.
- ${call.record ? "This call is being recorded; you said so at the start." : "The call is not recorded. Never say it is."}`;
}

/** A call to a person (not a business): pass on a message, ask a question, invite or remind them. */
function personSystem(call) {
  const cfg = callSettings();
  const d = call.details || {};
  return `You are ${assistantName()}, ${cfg.ownerFullName}'s personal assistant (an AI), on a live phone call with ${greetingName(call) || "someone"}, calling for ${cfg.ownerName}. You are speaking, not writing.

What ${cfg.ownerName} wants: ${call.goal}
Planned request: ${call.plan}
${d.notes ? `Notes: ${d.notes}\n` : ""}
${callManner(call)}

The task:
- Do only what was asked: pass on the message, ask the question and get the answer, or give the reminder. Don't add requests of your own.
- If it's voicemail: one short, calm message with who you are, what it's about, and that ${cfg.ownerName} can be reached back. Then end (outcome voicemail).
- outcome: info_obtained (you got an answer), delivered (you passed on the message), voicemail, failed, do_not_call, or in_progress while the call continues. summary: one or two sentences for ${cfg.ownerName}, e.g. "Luke said he's coming tonight around eight."`;
}

/** How an owner call opens: "Hey Sammy, it's Jericho." (calls.ownerName). */
export function ownerGreeting() {
  return `Hey ${callSettings().ownerName}, it's ${assistantName()}.`;
}

/** An owner call: Jericho phoning its own owner to pass on a message, a reminder, or to chat briefly. */
function ownerSystem(call) {
  const cfg = callSettings();
  const d = call.details || {};
  return `You are ${assistantName()}, ${cfg.ownerName}'s personal voice assistant, on a live phone call with ${cfg.ownerName} themselves. They asked you to call them. You are speaking, not writing.

What they asked for (${d.kind || "message"}): ${call.goal}
${d.message ? `The message to pass on, word for word: ${d.message}\n` : ""}
Rules:
- You already said: "${ownerGreeting()}" Don't greet again.
- Do what they asked: read the message, give the reminder, or have a short, friendly back-and-forth. Keep it brief: they're on the phone.
- One or two short spoken sentences per turn, contractions, numbers as they're spoken. No lists or symbols.
- Never read out passwords, card numbers, ID numbers or other secrets, even if asked.
- If it's voicemail, leave the message or reminder in one or two sentences, then end (outcome voicemail).
- When it's done or they say goodbye, say a short goodbye in "say" and set end_call true.
- outcome: delivered (you passed it on or had the chat), voicemail, failed, or in_progress while the call continues. summary: one sentence for later, e.g. "Reminded you about the dentist at three; you said thanks."`;
}

function agentSystem(call) {
  if (call.owner) return ownerSystem(call);
  if (call.purpose === "personal") return personSystem(call);
  const cfg = callSettings();
  const d = call.details || {};
  const callback = secrets.myPhoneNumber ? `Only if they ask for a callback number, give ${secrets.myPhoneNumber}, read digit by digit.` : "You have no callback number to give; say the owner will call back.";
  return `You are ${assistantName()}, ${cfg.ownerFullName}'s personal assistant (an AI), on a live phone call with ${call.businessName}, calling for ${cfg.ownerName}. You are speaking, not writing.

Goal (${call.purpose}): ${call.goal}
Details: ${JSON.stringify({ date: d.date, time: d.time, partySize: d.partySize, name: d.name || cfg.ownerName, flexibility: d.flexibility, notes: d.notes })}
Planned request: ${call.plan}

${callManner(call)}

The task:
- Stick to the goal. Share only what it needs: the name for the booking, party size, date and time. ${callback}
- Never give or agree to payment details, deposits, cancellation fees or anything that costs money. If they require that, say ${cfg.ownerName} will call back to finish, and end politely (outcome needs_callback).
- Only accept an alternative if it fits the flexibility given. Otherwise say ${cfg.ownerName} will decide, thank them, and end (outcome not_available or needs_callback).
- If you reach voicemail or an automated menu you can't get through: one short, calm message with who you are, what it's about, and that ${cfg.ownerName} will call back. Then end (outcome voicemail).
- outcome: booked (reservation or appointment confirmed), info_obtained (hours or question answered), not_available, needs_callback, voicemail, failed, do_not_call, or in_progress while the call continues.`;
}

// ---- code-level guards on what he says --------------------------------------------------------

const ASKS_IF_AI = /\b(are|r) (you|u) (an? )?(real|actual|live)?\s*(person|human|people|man|woman|robot|bot|ai|a\.i\.|machine|computer|recording|artificial)\b|\b(is this|am i talking to|am i speaking (to|with)|talking to) (an? )?(real|actual|live)?\s*(person|human|robot|bot|ai|a\.i\.|machine|computer|recording)\b|\b(you|u) (sound|sounds) like (a |an )?(robot|bot|ai|computer|machine)\b|\bare you (an? )?(ai|bot|robot)\b/i;
/** Did they ask whether they're talking to a person, a bot or an AI? */
export function asksIfAi(heard) {
  return ASKS_IF_AI.test(String(heard || ""));
}

/**
 * Asked if he's an AI: the reply always says so. A reply that claims to be human is replaced.
 * (The prompt says the same; this makes sure, whatever the model writes.)
 */
export function ensureHonest(heard, say) {
  let out = String(say || "");
  if (/\bI(?:'m| am)\s+(?:a\s+)?(?:real\s+|actual\s+)?(?:person|human)\b/i.test(out) && !/\bnot\s+(?:a\s+)?(?:real\s+)?(?:person|human)\b/i.test(out)) {
    out = "I'm an AI assistant, not a person.";
  }
  if (asksIfAi(heard) && !/\b(AI|A\.I\.|artificial intelligence)\b/.test(out)) out = `I'm an AI assistant. ${out}`.trim();
  return out;
}

/** Calm and low-key: no filler, no exclamation marks, one "thanks" and one "sorry" at most. */
export function calmSpeech(text) {
  let out = String(text || "")
    .replace(/\b(?:um+|uh+|erm+|uhm+|hmm+)\b[,.]?\s*/gi, "")
    .replace(/\bso,? basically,?\s*/gi, "")
    .replace(/\bbasically,\s*/gi, "")
    .replace(/!+/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+([,.?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  for (const word of [/\b(?:thank you(?: so much| very much)?|thanks(?: so much| a lot)?)\b/gi, /\b(?:i'm )?(?:so |really )?sorry\b/gi]) {
    let seen = 0;
    out = out
      .split(/(?<=[.?])\s+/)
      .filter((sentence) => {
        const has = word.test(sentence);
        word.lastIndex = 0;
        if (!has) return true;
        seen++;
        // a sentence that's only another "thank you" or "sorry" is dropped; others keep it
        return seen === 1 || sentence.replace(word, "").replace(/\b(?:again|very|so|much|a lot|once more|for that)\b/gi, "").replace(/[\s,.]/g, "").length > 0;
      })
      .join(" ");
  }
  return out.replace(/^[a-z]/, (c) => c.toUpperCase());
}

/** One agent turn: given the transcript so far, what to say next. */
export async function agentTurn(client, call, { wrapUp = false, opening = false } = {}) {
  const cfg = callSettings();
  const lines = call.transcript.map((t) => `${t.who === "agent" ? "You" : "Them"}: ${t.text || "(silence)"}`).join("\n");
  const note = wrapUp
    ? "\n\nThe call has reached its time limit. Wrap up now: a brief thank-you and goodbye, end_call true."
    : opening
      ? "\n\nThey just picked up and you've said the line above. In the same breath, say clearly what's wanted, in one or two short sentences. Don't greet again."
      : "";
  const response = await client.beta.messages.create({
    model: cfg.agentModel,
    max_tokens: 3000,
    output_config: { effort: cfg.agentEffort, format: { type: "json_schema", schema: TURN_SCHEMA } },
    system: agentSystem(call),
    messages: [{ role: "user", content: `Transcript so far:\n${lines || "(they just picked up)"}${note}\n\nYour next turn:` }],
  });
  if (response.stop_reason === "refusal") {
    return { say: "Sorry, I have to go. Goodbye.", end_call: true, outcome: "failed", summary: "The call agent stopped the call." };
  }
  const turn = JSON.parse(response.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
  if (!call.owner) {
    // calls to anyone else: honest about being an AI when asked, and calm, whatever the model wrote
    const lastThem = [...call.transcript].reverse().find((t) => t.who === "them")?.text || "";
    turn.say = calmSpeech(ensureHonest(lastThem, turn.say));
  }
  return turn;
}

/** The first thing to say after the disclosure, worked out before dialing so there's no pause. */
export async function openingRequest(client, call) {
  const turn = await agentTurn(client, { ...call, transcript: [{ who: "agent", text: call.owner ? ownerGreeting() : disclosure(call) }] }, { opening: true });
  // It follows straight on from "Hi, I'm an AI assistant...", so no second greeting.
  return turn.say.replace(/^(?:hi|hello|hey|good (?:morning|afternoon|evening))(?: there)?[,!.]?\s*/i, "");
}

// ---- test mode: a pretend business ------------------------------------------------

const SCENARIOS = {
  booked: "You have the requested slot free. Ask one natural follow-up (e.g. a name, or indoor or outdoor seating), then confirm the booking.",
  alternative: "The exact time is taken, but you can offer something 30 to 45 minutes later. Go along with whatever the caller decides.",
  callback: "You can't confirm anything right now and ask that the person call back themselves later, or you need a card to hold it.",
  hours: "Answer questions about opening hours plainly: open 11 AM to 10 PM, closed Mondays.",
  person: "You know the owner well and are happy to hear from them, even through their assistant. Answer naturally and briefly, then say goodbye.",
  stop: "You don't want calls like this. Say clearly: please don't call this number again.",
  owner: "You are the owner of this assistant, answering your own phone. React briefly and naturally to what it tells you, maybe ask one small question, then say thanks and goodbye.",
};

export function pickScenario(purpose) {
  const want = callSettings().testScenario;
  if (purpose === "owner") return want === "no_answer" ? "no_answer" : "owner";
  if (want === "stop") return "stop";
  if (purpose === "personal") return want === "no_answer" ? "no_answer" : "person";
  if (want !== "random") return want;
  const options = purpose === "check_hours" || purpose === "simple_question" ? ["hours", "hours", "no_answer"] : ["booked", "booked", "alternative", "callback", "no_answer"];
  return options[Math.floor(Math.random() * options.length)];
}

export async function simulatedReply(client, call, scenario) {
  const lines = call.transcript.map((t) => `${t.who === "agent" ? "Caller" : "You"}: ${t.text}`).join("\n");
  const response = await client.beta.messages.create({
    model: callSettings().agentModel,
    max_tokens: 1500,
    output_config: { effort: "low" },
    system: `${scenario === "owner" ? `You play ${callSettings().ownerName}, picking up a call from your AI assistant, for a test.` : scenario === "person" || call.purpose === "personal" ? `You play ${call.businessName}, a person picking up a call from someone's AI assistant, for a test.` : `You play a busy but friendly staff member answering the phone at ${call.businessName}, for a test of an AI calling assistant.`} ${SCENARIOS[scenario] || SCENARIOS.booked}
Reply with only what you say out loud: one or two short sentences, like real phone speech. If the caller says goodbye, say a quick goodbye.`,
    messages: [{ role: "user", content: `Call so far:\n${lines}\n\nYour reply:` }],
  });
  return response.content.filter((b) => b.type === "text").map((b) => b.text).join(" ").trim() || "Sorry, could you say that again?";
}

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
      enum: ["in_progress", "booked", "not_available", "info_obtained", "needs_callback", "voicemail", "delivered", "failed"],
    },
    summary: { type: "string", description: "One or two sentences for the owner: what was agreed or learned. Empty while in progress." },
  },
  required: ["say", "end_call", "outcome", "summary"],
  additionalProperties: false,
};

/** The opening line is fixed in code, so the call always starts by saying it's an AI. */
export function disclosure() {
  return `Hi, I'm an AI assistant calling on behalf of ${callSettings().ownerName}.`;
}

/** How an owner call opens: "Hey Sammy, it's Jericho." (calls.ownerName). */
export function ownerGreeting() {
  return `Hey ${callSettings().ownerName}, it's ${settings.assistantName || "Jericho"}.`;
}

/** An owner call: Jericho phoning its own owner to pass on a message, a reminder, or to chat briefly. */
function ownerSystem(call) {
  const cfg = callSettings();
  const d = call.details || {};
  return `You are ${settings.assistantName || "Jericho"}, ${cfg.ownerName}'s personal voice assistant, on a live phone call with ${cfg.ownerName} themselves. They asked you to call them. You are speaking, not writing.

What they asked for (${d.kind || "message"}): ${call.goal}
${d.message ? `The message to pass on, word for word: ${d.message}
` : ""}
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
  const cfg = callSettings();
  const d = call.details || {};
  const callback = secrets.myPhoneNumber ? `If they need a callback number, give ${secrets.myPhoneNumber}, read digit by digit.` : "You have no callback number to give; say the owner will call back.";
  return `You are an AI assistant on a live phone call with ${call.businessName}, calling on behalf of ${cfg.ownerName}. You are speaking, not writing.

Goal (${call.purpose}): ${call.goal}
Details: ${JSON.stringify({ date: d.date, time: d.time, partySize: d.partySize, name: d.name || cfg.ownerName, flexibility: d.flexibility, notes: d.notes })}
Planned opening request: ${call.plan}

Rules:
- You already said: "${disclosure()}" Never claim or imply you are human. If asked, say plainly you're an AI assistant calling for ${cfg.ownerName}.
- Stick to the goal. Share only what it needs: the name for the booking, party size, date and time. ${callback}
- Never give or agree to payment details, deposits, cancellation fees or anything that costs money. If they require that, say ${cfg.ownerName} will call back to finish, and end politely (outcome needs_callback).
- Only accept an alternative if it fits the flexibility given. Otherwise thank them, say ${cfg.ownerName} will decide, and end (outcome not_available or needs_callback).
- Before ending a booking, repeat the key details back once to confirm.
- Speak naturally: one or two short sentences per turn, contractions, numbers as they're spoken ("seven thirty", "four people"). No lists or symbols.
- If you reach voicemail or an automated menu you can't get through, leave at most one short message saying an AI assistant called for ${cfg.ownerName} about ${call.purpose === "reservation" ? "a reservation" : "a quick question"} and ${cfg.ownerName} will call back, then end (outcome voicemail).
- If they're rude, confused or ask you to stop calling, apologise briefly and end.
- When the goal is done or impossible, say a short thank-you and goodbye in "say" and set end_call true.
- outcome: booked (reservation or appointment confirmed), info_obtained (hours or question answered), not_available, needs_callback, voicemail, failed, or in_progress while the call continues.`;
}

/** One agent turn: given the transcript so far, what to say next. */
export async function agentTurn(client, call, { wrapUp = false, opening = false } = {}) {
  const cfg = callSettings();
  const lines = call.transcript.map((t) => `${t.who === "agent" ? "You" : "Them"}: ${t.text || "(silence)"}`).join("\n");
  const note = wrapUp
    ? "\n\nThe call has reached its time limit. Wrap up now: a brief thank-you and goodbye, end_call true."
    : opening
      ? "\n\nThey just picked up and you've said the line above. Continue straight on with your request in one sentence. Don't greet again."
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
  return JSON.parse(response.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
}

/** The first thing to say after the disclosure, worked out before dialing so there's no pause. */
export async function openingRequest(client, call) {
  const turn = await agentTurn(client, { ...call, transcript: [{ who: "agent", text: call.owner ? ownerGreeting() : disclosure() }] }, { opening: true });
  // It follows straight on from "Hi, I'm an AI assistant...", so no second greeting.
  return turn.say.replace(/^(?:hi|hello|hey|good (?:morning|afternoon|evening))(?: there)?[,!.]?\s*/i, "");
}

// ---- test mode: a pretend business ------------------------------------------------

const SCENARIOS = {
  booked: "You have the requested slot free. Ask one natural follow-up (e.g. a name, or indoor or outdoor seating), then confirm the booking.",
  alternative: "The exact time is taken, but you can offer something 30 to 45 minutes later. Go along with whatever the caller decides.",
  callback: "You can't confirm anything right now and ask that the person call back themselves later, or you need a card to hold it.",
  hours: "Answer questions about opening hours plainly: open 11 AM to 10 PM, closed Mondays.",
  owner: "You are the owner of this assistant, answering your own phone. React briefly and naturally to what it tells you, maybe ask one small question, then say thanks and goodbye.",
};

export function pickScenario(purpose) {
  const want = callSettings().testScenario;
  if (purpose === "owner") return want === "no_answer" ? "no_answer" : "owner";
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
    system: `${scenario === "owner" ? `You play ${callSettings().ownerName}, picking up a call from your AI assistant, for a test.` : `You play a busy but friendly staff member answering the phone at ${call.businessName}, for a test of an AI calling assistant.`} ${SCENARIOS[scenario] || SCENARIOS.booked}
Reply with only what you say out loud: one or two short sentences, like real phone speech. If the caller says goodbye, say a quick goodbye.`,
    messages: [{ role: "user", content: `Call so far:\n${lines}\n\nYour reply:` }],
  });
  return response.content.filter((b) => b.type === "text").map((b) => b.text).join(" ").trim() || "Sorry, could you say that again?";
}

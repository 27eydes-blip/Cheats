// Which Claude model answers? Clearly simple turns (greetings, the time, volume, the TV, alarms,
// the weather, the planner, quick facts) go to the fastest small model. Reasoning, advice,
// open-ended questions, planning, writing, code, several steps, anything about them personally,
// anything long, and anything that might need a risky action go to the strong model. If unsure:
// the strong model. settings.json claude.routing:
// "auto" (default) or "always-strong". The page can pick per request too (sun panel).
//
// This is the first of two locks. The brain is the second: if the small model ever asks for a
// risky tool anyway, its answer is thrown away and the strong model redoes that step, so the
// small model never starts (or reads back) a risky action.

/** Tests and the brain: is this an open-ended question (never answered by the small model)? */
export const isOpenEnded = (text) => OPEN_ENDED.test(String(text || ""));

export const ROUTING_MODES = ["auto", "always-strong"];

// Words that hint at a risky action (files, commands, Claude Code, calls, messages, invites,
// forgetting, system changes): always the strong model.
const RISKY =
  /\b(delete|deleting|remove|erase|trash|recycle|move|moving|rename|copy|write|writing|save|create|edit|overwrite|run|execute|command|terminal|powershell|cmd|script|install|uninstall|claude code|code|coding|program|build|deploy|commit|push|call|calling|phone|dial|text|sms|email|e-?mail|send|post|tweet|message|invite|meeting|forget|wipe|clear|cancel|password|key|registry|settings|setting|admin|shut ?down|restart|reboot|format|file|files|folder|folders|desktop|documents|downloads|pc|computer|laptop|clipboard|buy|order|pay|book|reservation|appointment)\b/i;

// Complex work: plans, reasoning, writing, research, current events.
const COMPLEX =
  /\b(plan|planning|decide|decision|should i|compare|comparison|pros and cons|trade-?offs?|strategy|figure out|work out|think|step by step|prioriti[sz]e|budget|schedule|explain|why|analy[sz]e|summari[sz]e|review|debug|fix|essay|story|poem|letter|draft|research|search|look up|google|news|latest|today's|price|stock|stocks|market|score|who won|briefing|brief me|good morning|translate|recipe|learn|lesson|remember|recall|memory|what have you learned|notes?|what do you know)\b/i;

// Several steps in one request ("look it up, then save it", "and then open it"): the strong model.
const CHAINED = /\b(and then|then (?:open|save|write|send|put|make|email|text|play|start|run|read|tell)|after that|once (?:that's|it's|you're) done|and (?:save|write|open|put) (?:it|that|them|the))\b/i;

// Open-ended questions: reasoning, advice, opinions, ideas. A short answer from the small model
// would sound thin, so these go straight to the strong model.
const OPEN_ENDED = /\b(why|how (?:do|does|did|can|could|should|would|come)|what if|what (?:should|would|could)|which (?:is|one|would|should)|advice|advise|recommend|recommendation|suggest|suggestion|ideas?|opinion|what do you think|thoughts on|tell me about|help me|teach me|how to|pros|cons|better|worth it|meaning of|difference between)\b/i;
// About them (their life, people, plans, preferences): needs memory and context.
const PERSONAL = /\b(my|mine|me|i'm|i am|i've|i'd|i was|i have|i had|i need|i want|i feel|i think|we|our|us)\b/i;

// The everyday commands the small model handles well (checked before PERSONAL: "set my alarm").
const DEVICE = [
  /\b(what time|the time|what's the time|what day|what's the date|today's date|what date)\b/i,
  /\b(volume|louder|quieter|softer|turn it (up|down)|mute|unmute)\b/i,
  /\b(pause|resume|play|next (song|track)|previous (song|track)|skip)\b/i,
  /\b(tvs?|televisions?|roku|netflix|youtube|hulu|disney|channel|hdmi|input|living room|blue room)\b/i,
  /\b(alarm|alarms|timer|timers|wake me|snooze)\b/i,
  /\b(weather|temperature|rain|raining|forecast|umbrella|snow|windy|cold outside|hot outside|jacket)\b/i,
  /\b(lights?|lamp|brightness|dim|fan|plugs?|outlet|everything off)\b/i,
  /\b(homework|assignments?|due|quiz|quizzes|exams?|tests?|my planner|the planner|my week|this week|am i free|free time|finished|check off)\b/i,
];

// Greetings and small talk.
const SIMPLE = [
  /^(hi|hello|hey|yo|hiya|howdy|sup|good (morning|afternoon|evening|night)|morning|evening|how are you|how's it going|how are things|what's up|whats up|thanks|thank you|cheers|cool|nice|great|awesome|perfect|ok|okay|got it|never mind)\b/i,
];
const VAGUE = /\b(it|that|this|those|them|again|same|one)\b/i;
const SHORT_QUESTION = /^(what|what's|whats|who|who's|where|when|how (many|much|far|long|old|tall|big)|is|are|does|do|can|define|spell|convert)\b/i;

const words = (t) => String(t || "").trim().split(/\s+/).filter(Boolean).length;

/**
 * { route: "fast" | "strong", reason }.
 * opts.mode: "auto" | "always-strong"; opts.pending: a yes/no is waiting; opts.hard: the brain
 * already thinks it's a plan or decision.
 */
export function routeFor(text, { mode = "auto", pending = false, hard = false } = {}) {
  const t = String(text || "").trim();
  const n = words(t);
  if (mode === "always-strong") return { route: "strong", reason: "always strong (setting)" };
  if (pending) return { route: "strong", reason: "a confirmation is waiting" };
  if (n === 0) return { route: "strong", reason: "empty" };
  if (RISKY.test(t)) return { route: "strong", reason: "might need a risky action" };
  if (CHAINED.test(t)) return { route: "strong", reason: "several steps" };
  if (hard || COMPLEX.test(t)) return { route: "strong", reason: "complex" };
  if (OPEN_ENDED.test(t)) return { route: "strong", reason: "open-ended" };
  if (n > 14) return { route: "strong", reason: "long request" };
  if (DEVICE.some((re) => re.test(t))) return { route: "fast", reason: "simple request" };
  if (PERSONAL.test(t)) return { route: "strong", reason: "personal context" };
  if (SIMPLE.some((re) => re.test(t))) return { route: "fast", reason: "simple request" };
  // "do it", "what about that one": the meaning is in the earlier turns, so the strong model
  if (VAGUE.test(t) && n <= 6) return { route: "strong", reason: "refers back to the conversation" };
  if (n >= 3 && n <= 10 && SHORT_QUESTION.test(t)) return { route: "fast", reason: "short question" };
  return { route: "strong", reason: "not clearly simple" };
}

/** The routing mode to use: the page's choice if valid, else settings.json, else "auto". */
export function routingMode(requested, configured) {
  if (ROUTING_MODES.includes(requested)) return requested;
  if (ROUTING_MODES.includes(configured)) return configured;
  return "auto";
}

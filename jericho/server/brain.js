// The brain: sends your words to Claude, streams the reply back a sentence at a time,
// runs the tools it picks, and holds risky tool calls until you say "yes".
// One conversation per browser session.
import Anthropic from "@anthropic-ai/sdk";
import { ROOT, settings } from "./config.js";
import { logAction } from "./logger.js";
import * as memory from "./memory.js";
import { addWarmer, errorDetails, keepAliveFetch } from "./net.js";
import { cancelAll, isKillPhrase, track } from "./cancel.js";
import { DISCLAIMER } from "./briefing/markets.js";
import { stripLeadingWake } from "../public/wake.js";
import fs from "node:fs";
import path from "node:path";
import { CONFIRM_TIMEOUT_MS, isYes } from "./safety.js";
import { SentenceSplitter, speakable } from "./speech.js";
import { updateStyle } from "./style.js";
import { describeAction, isRisky, toolDefinitions, tools, validateInput } from "./tools/index.js";

const claudeCfg = settings.claude || {};
const MODEL = claudeCfg.model || "claude-opus-5-5";
const MAX_ROUNDS = claudeCfg.maxToolRounds ?? 8;
const IDLE_MS = (claudeCfg.conversationIdleMinutes ?? 10) * 60_000;
const MAX_MESSAGES = 60;
const WARM_TTL_MS = 4 * 60_000; // the prompt cache lasts 5 minutes

const name = settings.assistantName || "Jericho";
const owner = settings.calls?.ownerName || "the user";

const SYSTEM = `You are ${name}, a personal voice assistant running on ${owner}'s laptop. You talk with them out loud, usually through their phone.

# Understanding them
- Requests come from speech recognition, so they can be vague, half-finished, rambling or misheard. Work out the most likely intent from the words, the last few turns, your memories and your notes on how they talk, then act on it.
- Resolve references from the conversation: "that one", "do it again", "the other room", "turn it back on", "what about tomorrow" all point at what you just discussed.
- If a word makes no sense, think about what it sounds like ("lites" is "lights"). Your notes list words the mic often gets wrong; when a request shows it was auto-corrected, trust the correction unless it clearly doesn't fit.
- Ask one short clarifying question only when you genuinely can't tell what they want, or when a wrong guess would matter (a phone call, deleting something). Otherwise make the sensible choice and say what you did.
- Use your profile of them, lessons, recent conversations and this conversation to work out what vague requests mean ("start it", "the usual", "do that for Maya").
- Use web_search for current facts you don't know or that change: news, scores, prices, opening hours, a business's phone number. At most three searches per question.
- When you answer from a search, say where it came from by name, naturally ("according to ESPN", "the Weather Service says"). Never read a web address aloud: the links are shown on screen.

# How you talk
- Everything you write is spoken aloud. Write the way people talk: short sentences, contractions, plain words.
- No lists, markdown, headings, emoji, symbols, URLs or code. Say "and", "percent", "dollars" instead of symbols.
- Write numbers the way they're said: "seven thirty", "four people", "about twenty minutes", "twelve fifty". Phone numbers digit by digit in groups.
- Lead with the answer. No filler like "Great question" or "Certainly".
- Never reuse wording you've already used in this conversation. Vary how you confirm things ("done", "all set", "lights are on", "that's sorted") so it never sounds canned.

# Matching their mood and pace
- Each request ends with a delivery note: how many words, and how fast they spoke (or that they typed). Read their mood and pace from that and their words: rushed, relaxed, joking, frustrated or curious. Then match it:
  * rushed or fast: the shortest useful answer, a few words if that's enough, nothing extra.
  * relaxed or chatty: casual and warm, a sentence or two.
  * joking: play along briefly, then answer.
  * frustrated: calm and direct, fix it, no cheerfulness, no suggestions.
  * curious, or "explain", "go deep", "tell me more": more detail, up to about a minute of speech (around 150 words), then offer to go further.
- Also follow the reply preferences in your notes, and their lessons always win.

# Anticipating
- When there's an obvious next step, offer it in a few words at the end ("Want me to start the build too?"). At most one suggestion per reply, only when it's genuinely useful, never when they're rushed or frustrated, and drop it if they decline or ignore it.

# Thinking
- For hard questions, plans, decisions, comparisons, trade-offs or anything with several steps, call deep_think (a stronger model that reasons step by step) with the context and how much detail they want, then give its answer in your own words. Quick facts and commands: answer straight away.

# Learning from corrections
- When they correct you ("no, I meant...", "that's wrong", "stop doing that", "I told you..."), fix it now and call save_lesson with a short lasting rule and their exact words. Follow every saved lesson from then on.
- "What have you learned about me?" and similar: call what_ive_learned, then give a short spoken summary of the highlights, not a list, and mention they can see or delete it all on the Memory page.

# Acting
- Use your tools to act. Only say something happened if a tool result says it succeeded. If a tool isn't connected yet, say so in a few words.
- Some tools are risky (Claude Code, calendar invites, forgetting memories, phone calls). Just call them when asked: the system itself reads the action back and waits for a spoken yes, so never ask "are you sure" yourself.
- Memory: when they ask you to remember something, call remember with a short fact. Use recall for "what do you remember about...". To delete one, call forget with its id.
- Never store passwords, API keys, card numbers, ID numbers or similar secrets, even if they insist: say briefly that you can't store those.

# Phone calls
- You can phone businesses for ordinary errands: reservations, checking hours, appointments, or one simple question. Nothing else: no calling people, no emergencies, nothing deceptive.
- Before calling, you need the business name and its number (search for it or ask, never guess), and for bookings the date, time, party size and the name to book under (default ${owner} unless told otherwise). Ask for what's missing in one short question, then call make_call. The system reads the plan back and waits for a yes. The call runs in the background and they hear the result when it ends.

# The PC
- You can control this PC: open apps and web pages, volume, media keys, timers, the clipboard, and list, read and search files in the allowed folders (Desktop, Documents, Downloads and the Cheats folder unless set otherwise). Paths start with the folder name, e.g. "Documents/notes.txt".
- Writing, moving or deleting files (deletes go to the Recycle Bin), running a command, and starting Claude Code need a yes: just call the tool and the system reads back exactly what will happen.
- Anything outside the allowed folders, system or registry changes, security settings, and files with secrets like .env are blocked. If a tool refuses, say so plainly; don't look for a way around it.
- When a Claude Code job finishes they hear about it; for the details, call claude_code_result and give a short spoken summary.
- "Stop" or "cancel everything" is handled before it reaches you.

Your memories, lessons, profile of them and notes on how they talk are below. They come only from things they said. Use them quietly; don't recite them unless asked.`;

// Fixed replies, in a few wordings so they don't sound canned.
const SAYINGS = {
  declined: ["Okay, I won't.", "Got it, I'll leave it.", "No problem, cancelled.", "Okay, not doing that."],
  timedOut: ["That timed out, so I didn't do it.", "I didn't hear a yes in time, so I left it.", "No answer, so I didn't go ahead."],
  nothingPending: ["There's nothing waiting for a yes right now.", "Nothing's waiting on a yes at the moment.", "There's nothing to confirm right now."],
  done: ["Done.", "All set.", "That's done.", "Sorted."],
  stopped: ["Stopped.", "Okay, stopping everything.", "All stopped.", "Stopped. Nothing's running now."],
};

/** A wording from the list, never the same one as last time in this conversation. */
function pick(s, key, list = SAYINGS[key]) {
  s.lastSaid ||= {};
  const options = list.length > 1 ? list.filter((x) => x !== s.lastSaid[key]) : list;
  const choice = options[Math.floor(Math.random() * options.length)];
  s.lastSaid[key] = choice;
  return choice;
}

/** Plans, decisions and comparisons go to the stronger model; short everyday questions stay fast. */
const HARD = /\b(plan|planning|decide|decision|should i|which (?:is|one|would|should)|compare|comparison|pros and cons|trade-?offs?|strategy|help me (?:think|figure|work out|choose|decide)|figure out|work out|think (?:it |this )?through|best way to|step by step|prioriti[sz]e|budget|schedule)\b/i;
export function looksHard(text) {
  const n = String(text).trim().split(/\s+/).filter(Boolean).length;
  return n >= 9 && HARD.test(text);
}

/** How the request was said: length, speed, typed or spoken. Helps Claude read mood and pace. */
export function deliveryNote(text, meta = {}) {
  const n = String(text).trim().split(/\s+/).filter(Boolean).length;
  const bits = [`${n} word${n === 1 ? "" : "s"}`];
  if (meta.typed) bits.push("typed");
  else if (meta.speechMs > 300 && n >= 3) {
    const wpm = Math.round(n / (meta.speechMs / 60000));
    bits.push(`spoken at about ${wpm} words a minute (${wpm >= 190 ? "fast" : wpm <= 110 ? "slow and unhurried" : "normal pace"})`);
  }
  return bits.join(", ");
}

const WEB_SEARCH = { type: "web_search_20260209", name: "web_search", max_uses: 3 };
// Set when the API says web search isn't available for this key; from then on it isn't offered.
let webSearchUnavailable = false;
function isWebSearchUnavailable(err) {
  return err instanceof Anthropic.APIError && [400, 403].includes(err.status) && /web[_ ]?search/i.test(String(err.message));
}

/** The links behind a searched answer: the cited ones first, then the top results. */
function sourcesFrom(content) {
  const cited = [];
  const found = [];
  for (const b of content || []) {
    for (const c of b.citations || []) if (c.url) cited.push({ title: c.title || c.url, url: c.url });
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const r of b.content) if (r.type === "web_search_result" && r.url) found.push({ title: r.title || r.url, url: r.url });
    }
  }
  const out = [];
  for (const x of [...cited, ...found.slice(0, 3)]) {
    if (/^https?:\/\//i.test(x.url) && !out.some((o) => o.url === x.url)) out.push({ title: String(x.title).slice(0, 120), url: x.url });
  }
  return out.slice(0, 5);
}

// ---- morning briefing triggers -----------------------------------------------------------
const BRIEFING = /\b(good morning|morning briefing|brief me|my briefing|daily briefing|morning rundown)\b/i;
export function isBriefingRequest(text) {
  return BRIEFING.test(String(text));
}
const BRIEFING_STATE = () => path.join(process.env.JERICHO_DATA_DIR || path.join(ROOT, "data"), "briefing-state.json");
/** briefing.autoTime ("07:00"): on the first wake each day after that time, offer the briefing once. */
export function shouldOfferBriefing(now = new Date()) {
  const at = String(settings.briefing?.autoTime || "").trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(at);
  if (!m) return false;
  if (now.getHours() * 60 + now.getMinutes() < +m[1] * 60 + +m[2]) return false;
  const today = now.toLocaleDateString("en-CA");
  let state = {};
  try {
    state = JSON.parse(fs.readFileSync(BRIEFING_STATE(), "utf8"));
  } catch {
    /* first time */
  }
  if (state.lastOffered === today) return false;
  try {
    fs.mkdirSync(path.dirname(BRIEFING_STATE()), { recursive: true });
    fs.writeFileSync(BRIEFING_STATE(), JSON.stringify({ lastOffered: today }));
  } catch {
    /* best effort */
  }
  return true;
}

/** Tool list sent to Claude: the same every request, so the prompt cache stays warm. */
function requestTools() {
  // Streaming requests: tool inputs stream as they're generated; we validate them ourselves.
  const list = toolDefinitions.map((d) => ({ ...d, eager_input_streaming: true }));
  if (claudeCfg.webSearch !== false && !webSearchUnavailable) list.push(WEB_SEARCH);
  return list;
}

/** Applies the learned "mic hears X, user meant Y" list from style.json. */
export function applyMishearings(text) {
  const fixes = [];
  let out = text;
  for (const { heard, meant } of memory.getStyle().mishearings || []) {
    if (!heard || !meant || heard.trim().length < 3) continue;
    const re = new RegExp(`\\b${heard.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "gi");
    if (re.test(out)) {
      out = out.replace(re, meant);
      fixes.push(`"${heard}" to "${meant}"`);
    }
  }
  return { text: out, fixes };
}

export class Brain {
  /** @param {{ client?: Anthropic }} [opts] — inject a fake client in tests. */
  constructor(opts = {}) {
    this.client = opts.client || new Anthropic({ fetch: (url, init) => keepAliveFetch(url, init) });
    this.sessions = new Map();
    if (!opts.client) {
      // Keeps the connection to Claude open while a page is connected (a free request).
      addWarmer("anthropic", () => this.client.models.list({ limit: 1 }).then(() => {}));
    }
  }

  session(id) {
    let s = this.sessions.get(id);
    const now = Date.now();
    const stale = s && !s.pending && (now - s.lastActive > IDLE_MS || s.messages.length > MAX_MESSAGES);
    if (!s || stale) {
      // The instructions are frozen for the whole conversation (changing them mid-way
      // would invalidate Claude's earlier reasoning). Later memory changes are added
      // as appended system messages instead, see handle().
      s = {
        messages: [],
        pending: null,
        lastActive: now,
        context: memory.renderForPrompt(),
        seenVersion: memory.version,
        transcript: [],
        warmAt: 0,
      };
      this.sessions.set(id, s);
    }
    s.lastActive = now;
    return s;
  }

  /**
   * A normal spoken request (after the wake word).
   * hooks.onSentence(text) is called for each sentence as soon as it's ready to speak.
   */
  async handle(sessionId, text, hooks = {}, meta = {}) {
    if (isKillPhrase(text)) return this.#handleNow(sessionId, text, hooks, meta); // the kill switch never waits
    // One turn at a time per conversation: a request made by interrupting waits for the
    // interrupted turn to wrap up (its tools finish), so the history stays in order.
    const release = await this.#acquire(sessionId);
    try {
      return await this.#handleNow(sessionId, text, hooks, meta);
    } finally {
      release();
    }
  }

  #locks = new Map();
  #liveTurns = new Map();
  async #acquire(sessionId) {
    const prev = this.#locks.get(sessionId) || Promise.resolve();
    let release;
    const mine = new Promise((r) => (release = r));
    const chained = prev.then(() => mine);
    this.#locks.set(sessionId, chained);
    await prev;
    return () => {
      release();
      if (this.#locks.get(sessionId) === chained) this.#locks.delete(sessionId);
    };
  }

  /**
   * Barge-in: you talked over Jericho. Stops only the reply being written and spoken for this
   * conversation. Running tools, Claude Code jobs and calls carry on, and a waiting
   * confirmation stays waiting (only the kill switch clears those).
   */
  interrupt(sessionId) {
    const turn = this.#liveTurns.get(sessionId);
    if (!turn) return { interrupted: false };
    turn.interrupt();
    logAction("barge_in", { sessionId });
    return { interrupted: true };
  }

  async #handleNow(sessionId, text, hooks = {}, meta = {}) {
    if (isKillPhrase(text)) {
      // "Jericho, stop" also works when typed or when it reaches the server
      this.stopAll(sessionId);
      const turn = this.#newTurn(hooks, sessionId);
      return this.#finishTurn(turn, this.#say(turn, pick(this.session(sessionId), "stopped")));
    }
    // "Hey Jericho, what's the weather" typed or sent as is: drop the wake word first
    text = stripLeadingWake(text, settings.wakeWords);
    const turn = this.#newTurn(hooks, sessionId);
    const s = this.session(sessionId);
    const { text: corrected, fixes } = applyMishearings(text);
    logAction("request", { sessionId, text, ...(fixes.length ? { corrected, fixes } : {}) });
    const content = [];
    if (s.pending) {
      // You moved on instead of answering yes/no: treat it as a no.
      content.push(...this.#declineAll(s, "The user moved on without confirming. Not done."));
    }
    const note = fixes.length ? ` (speech-to-text heard "${text}"; auto-corrected ${fixes.join(", ")})` : "";
    content.push({ type: "text", text: `[${new Date().toString()}] ${corrected}${note} (delivery: ${deliveryNote(text, meta)})` });
    s.messages.push({ role: "user", content });
    s.transcript.push({ who: "user", text });
    // Notes for this turn, in one appended system message (the instructions themselves stay frozen).
    const notes = [];
    if (s.seenVersion !== memory.version) {
      // Memories, lessons, profile or style notes changed since this conversation started.
      notes.push(`Your memory and notes were updated. Current version:\n${memory.renderForPrompt()}`);
      s.seenVersion = memory.version;
    }
    if (isBriefingRequest(corrected)) notes.push("They want the morning briefing: call morning_briefing now and follow its howToSpeak.");
    else if (looksHard(corrected)) notes.push("This is a plan, decision or comparison: call deep_think with the context before answering.");
    else if (shouldOfferBriefing()) notes.push("First wake today: after answering, offer the morning briefing in one short question.");
    if (meta.interrupted) notes.push("They just talked over your last reply to say this. Drop the rest of what you were saying and answer this instead.");
    if (notes.length) s.messages.push({ role: "system", content: notes.join("\n\n") });
    return this.#finishTurn(turn, await this.#loop(sessionId, s, turn));
  }

  /** Your answer while a risky action is waiting. */
  async confirm(sessionId, utterance, hooks = {}, meta = {}) {
    if (isKillPhrase(utterance)) return this.handle(sessionId, utterance, hooks);
    const release = await this.#acquire(sessionId);
    try {
      return await this.#confirmNow(sessionId, utterance, hooks, meta);
    } finally {
      release();
    }
  }

  async #confirmNow(sessionId, utterance, hooks, meta) {
    const turn = this.#newTurn(hooks, sessionId);
    const s = this.session(sessionId);
    if (!s.pending) return this.#finishTurn(turn, this.#say(turn, pick(s, "nothingPending")));
    const expired = Date.now() > s.pending.expiresAt;
    if (meta.interrupted && !expired && isYes(utterance)) {
      // A "yes" said over the read-back never counts: it may not have been heard in full.
      logAction("barge_in_yes_ignored", { sessionId });
      return this.#finishTurn(turn, this.#say(turn, "I stopped. Say yes again to confirm, or no to cancel.", { awaitingConfirmation: true }));
    }
    const yes = !expired && isYes(utterance);
    logAction(yes ? "confirmed" : "declined", {
      sessionId,
      utterance,
      expired,
      actions: s.pending.toolUses.filter((t) => isRisky(t.name, t.input)).map((t) => t.name),
    });
    if (!yes) {
      const results = this.#declineAll(s, expired ? "Confirmation timed out. Not done." : "The user said no. Not done.");
      s.messages.push({ role: "user", content: results });
      return this.#finishTurn(turn, this.#say(turn, expired ? pick(s, "timedOut") : pick(s, "declined")));
    }
    const { toolUses, prefailed } = s.pending;
    s.pending = null;
    s.messages.push({ role: "user", content: await this.#runTools(sessionId, toolUses, true, turn, prefailed) });
    return this.#finishTurn(turn, await this.#loop(sessionId, s, turn));
  }

  /** Warm the prompt cache when the wake word is heard, so the first reply starts sooner. */
  async prewarm(sessionId) {
    const s = this.session(sessionId);
    if (s.messages.length > 0 || Date.now() - s.warmAt < WARM_TTL_MS) return false;
    s.warmAt = Date.now();
    try {
      // max_tokens 0: the API only reads the prompt into its cache and answers nothing.
      await this.client.beta.messages.create({ ...this.#params(s, [{ role: "user", content: "warmup" }]), max_tokens: 0 });
      return true;
    } catch (err) {
      logAction("prewarm_error", { sessionId, error: err.message, cause: errorDetails(err) });
      return false;
    }
  }

  /** The page says the conversation ended: learn from it with one small Claude call. */
  conversationEnded(sessionId) {
    const s = this.sessions.get(sessionId);
    if (!s || !s.transcript.some((t) => t.who === "user")) return false;
    const transcript = s.transcript.splice(0);
    updateStyle(this.client, transcript, sessionId); // in the background
    return true;
  }

  // ---- internals -------------------------------------------------------------------

  #newTurn(hooks, sessionId) {
    const controller = new AbortController();
    const untrack = track("reply", sessionId, () => controller.abort());
    // Barge-in stops only the reply stream (replySignal); tools get `signal`, which only the kill switch trips.
    const reply = new AbortController();
    const turn = {
      hooks, spoken: [], sources: [], t0: Date.now(), firstToken: null, firstSentence: null, rounds: 0, models: new Set(),
      signal: controller.signal,
      replySignal: AbortSignal.any([controller.signal, reply.signal]),
      interrupted: false,
      interrupt: () => {
        turn.interrupted = true;
        reply.abort();
      },
      sessionId,
      untrack,
    };
    this.#liveTurns.set(sessionId, turn);
    return turn;
  }

  /**
   * The kill switch: stop the Claude reply in progress, running commands, timers, Claude Code
   * jobs and calls, and clear every waiting confirmation (answering each with "cancelled", so
   * the conversation stays valid).
   */
  stopAll(sessionId = "") {
    const stopped = cancelAll("the user said stop");
    let cleared = 0;
    for (const s of this.sessions.values()) {
      if (!s.pending) continue;
      s.messages.push({ role: "user", content: this.#declineAll(s, "Cancelled: the user said stop. Not done.") });
      cleared++;
    }
    logAction("kill_switch", { sessionId, stopped: stopped.map((x) => x.kind), confirmationsCleared: cleared });
    return { stopped, confirmationsCleared: cleared };
  }

  #emit(turn, sentence, exact = false) {
    // Confirmation read-backs are left exactly as written (paths, commands); everything else is tidied for speech.
    const clean = exact ? String(sentence).trim() : speakable(sentence);
    if (!clean) return;
    if (turn.firstSentence === null) turn.firstSentence = Date.now() - turn.t0;
    turn.spoken.push(clean);
    turn.hooks.onSentence?.(clean);
  }

  /** Speak fixed text (confirmations, errors) through the same sentence pipeline. */
  #say(turn, text, extra = {}) {
    const splitter = new SentenceSplitter(1);
    const exact = Boolean(extra.awaitingConfirmation);
    for (const sentence of [...splitter.push(`${text} `), ...splitter.flush()]) this.#emit(turn, sentence, exact);
    return { awaitingConfirmation: false, ...extra };
  }

  #finishTurn(turn, result) {
    turn.untrack?.();
    if (this.#liveTurns.get(turn.sessionId) === turn) this.#liveTurns.delete(turn.sessionId);
    const reply = turn.spoken.join(" ") || "Done.";
    const timings = {
      firstTokenMs: turn.firstToken,
      firstSentenceMs: turn.firstSentence,
      totalMs: Date.now() - turn.t0,
      rounds: turn.rounds,
      models: [...turn.models],
    };
    return { reply, awaitingConfirmation: Boolean(result.awaitingConfirmation), ...(result.interrupted ? { interrupted: true } : {}), timings, ...(turn.sources.length ? { sources: turn.sources } : {}) };
  }

  /** Barge-in: keep what was actually said in the history, so the next answer has context. */
  #wasInterrupted(s, turn) {
    const said = turn.spoken.join(" ").trim();
    if (said && s.messages.at(-1)?.role === "user") {
      s.messages.push({ role: "assistant", content: [{ type: "text", text: `${said} [cut off: the user interrupted]` }] });
    }
    if (said) s.transcript.push({ who: "assistant", text: said });
    return { awaitingConfirmation: false, interrupted: true };
  }

  #declineAll(s, reason) {
    const { toolUses } = s.pending;
    s.pending = null;
    return toolUses.map((t) => ({ type: "tool_result", tool_use_id: t.id, content: reason, is_error: true }));
  }

  async #runTools(sessionId, toolUses, approved, turn, prefailed = {}) {
    const s = this.sessions.get(sessionId);
    // the last few things the user said: lessons must quote one of them
    const userText = s ? s.transcript.filter((x) => x.who === "user").slice(-4).map((x) => x.text).join("\n") : "";
    const ctx = { client: this.client, sessionId, userText, signal: turn.signal };
    for (const t of toolUses) {
      const tool = tools.get(t.name);
      if (tool?.announce && !prefailed[t.id]) {
        this.#emit(turn, Array.isArray(tool.announce) && s ? pick(s, `announce:${t.name}`, tool.announce) : [].concat(tool.announce)[0]);
      }
    }
    return Promise.all(
      toolUses.map(async (t) => {
        const tool = tools.get(t.name);
        if (!tool) return { type: "tool_result", tool_use_id: t.id, content: `Unknown tool ${t.name}`, is_error: true };
        if (prefailed[t.id]) return { type: "tool_result", tool_use_id: t.id, content: `Not allowed: ${prefailed[t.id]}`, is_error: true };
        if (turn.signal?.aborted) return { type: "tool_result", tool_use_id: t.id, content: "Cancelled: the user said stop.", is_error: true };
        if (isRisky(t.name, t.input) && !approved) {
          return { type: "tool_result", tool_use_id: t.id, content: "Not confirmed. Not done.", is_error: true };
        }
        try {
          const result = await tool.run(t.input || {}, ctx);
          if (tool.card) turn.hooks.onCard?.(tool.card(result)); // e.g. the Briefing card in the chat panel
          if (t.name === "morning_briefing" && result.markets?.ok) turn.briefingMarkets = true;
          logAction("tool_result", { sessionId, tool: t.name, input: shortForLog(t.input), result: shortForLog(result) });
          return { type: "tool_result", tool_use_id: t.id, content: JSON.stringify(result) };
        } catch (err) {
          logAction("tool_error", { sessionId, tool: t.name, input: shortForLog(t.input), error: err.message, cause: errorDetails(err) });
          return { type: "tool_result", tool_use_id: t.id, content: `Error: ${err.message}`, is_error: true };
        }
      }),
    );
  }

  async #loop(sessionId, s, turn) {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      turn.rounds++;
      let response;
      if (turn.signal?.aborted) return { awaitingConfirmation: false, stopped: true };
      if (turn.interrupted) return this.#wasInterrupted(s, turn);
      try {
        response = await this.#streamClaude(s, turn);
      } catch (err) {
        if (turn.signal?.aborted) return { awaitingConfirmation: false, stopped: true }; // the kill switch: stop quietly
        if (turn.interrupted) return this.#wasInterrupted(s, turn);
        if (isWebSearchUnavailable(err) && !webSearchUnavailable) {
          webSearchUnavailable = true;
          logAction("web_search_unavailable", { sessionId, error: err.message });
          this.sessions.delete(sessionId); // next conversation starts without the search tool
          return this.#say(turn, "Web search isn't turned on for this API key, so I can't look that up right now. You can enable it in the Anthropic Console, under privacy settings.");
        }
        logAction("error", { sessionId, where: "claude", error: err.message, cause: errorDetails(err) });
        // Drop the half-finished conversation so the next request starts clean.
        this.sessions.delete(sessionId);
        return this.#say(turn, friendlyApiError(err));
      }

      if (response.stop_reason === "refusal") {
        logAction("refusal", { sessionId, details: response.stop_details });
        this.sessions.delete(sessionId);
        return this.#say(turn, "Sorry, I can't help with that one.");
      }

      // Keep the whole content (thinking, searches, tool calls), not just the text.
      s.messages.push({ role: "assistant", content: response.content });
      if (response.stop_reason === "pause_turn") continue; // a long web search: let it carry on

      const toolUses = response.content.filter((b) => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
        if (turn.spoken.length === 0) this.#say(turn, pick(s, "done"));
        // the briefing always says the market numbers are information, not advice
        if (turn.briefingMarkets && !/not (financial |investment )?advice/i.test(turn.spoken.join(" "))) this.#say(turn, DISCLAIMER);
        s.transcript.push({ who: "assistant", text: turn.spoken.join(" ") });
        logAction("reply", { sessionId, reply: turn.spoken.join(" ") });
        return { awaitingConfirmation: false };
      }

      // Streamed tool inputs can arrive incomplete: check them before anything runs.
      const invalid = {};
      for (const t of toolUses) {
        const tool = tools.get(t.name);
        const problem = tool ? validateInput(tool.definition.input_schema, t.input) : null;
        if (problem) invalid[t.id] = problem;
        logAction("tool_call", { sessionId, tool: t.name, input: shortForLog(t.input), risky: isRisky(t.name, t.input), ...(problem ? { invalid: problem } : {}) });
      }
      if (Object.keys(invalid).length) {
        s.messages.push({
          role: "user",
          content: toolUses.map((t) => ({
            type: "tool_result",
            tool_use_id: t.id,
            content: invalid[t.id] ? `INVALID_INPUT: ${invalid[t.id]}. Call the tool again with complete input.` : "Not run: another tool call in this step had invalid input. Call it again.",
            is_error: true,
          })),
        });
        continue;
      }

      // Risky tools: check the rules first, then read the plan back and wait for a yes.
      const ctx = { client: this.client, sessionId };
      const prefailed = {};
      const risky = toolUses.filter((t) => isRisky(t.name, t.input));
      for (const t of risky) {
        const tool = tools.get(t.name);
        if (!tool.precheck) continue;
        const check = await tool.precheck(t.input, ctx);
        if (!check.ok) {
          prefailed[t.id] = check.reason;
          logAction("action_blocked", { sessionId, tool: t.name, reason: check.reason });
        }
      }
      const needYes = risky.filter((t) => !prefailed[t.id]);
      if (needYes.length > 0) {
        s.pending = { toolUses, prefailed, expiresAt: Date.now() + CONFIRM_TIMEOUT_MS };
        const parts = needYes.map((t) => {
          const tool = tools.get(t.name);
          if (tool.confirmPrompt) return tool.confirmPrompt(t.input);
          return `Should I ${describeAction(t.name, t.input).trim().replace(/[.!?]+$/, "")}?`;
        });
        logAction("confirmation_requested", { sessionId, actions: needYes.map((t) => ({ tool: t.name, input: shortForLog(t.input) })) });
        return this.#say(turn, `${parts.join(" ")} Say yes to confirm.`, { awaitingConfirmation: true });
      }

      s.messages.push({ role: "user", content: await this.#runTools(sessionId, toolUses, false, turn, prefailed) });
    }
    return this.#say(turn, "Sorry, that took too many steps. Try asking a simpler way.");
  }

  #params(s, messages) {
    const useFallbacks = claudeCfg.fallbacks !== false;
    return {
      model: MODEL,
      max_tokens: 16000,
      // Short spoken replies: low effort keeps latency down. Hard questions go to deep_think.
      output_config: { effort: claudeCfg.effort || "low" },
      system: [
        { type: "text", text: SYSTEM },
        // Cache everything up to and including this conversation's memory snapshot.
        { type: "text", text: s.context, cache_control: { type: "ephemeral" } },
      ],
      tools: requestTools(),
      messages,
      // If the main model declines a request on safety grounds, the API retries it on
      // a fallback model inside the same call.
      ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
    };
  }

  /** Streams one Claude response, handing each finished sentence to the speaker. */
  async #streamClaude(s, turn) {
    // A second cache breakpoint on the newest message, so each turn reuses the last.
    const messages = s.messages.slice();
    const last = messages.at(-1);
    if (last?.role === "user" && Array.isArray(last.content) && last.content.length) {
      const blocks = last.content.slice();
      blocks[blocks.length - 1] = { ...blocks.at(-1), cache_control: { type: "ephemeral" } };
      messages[messages.length - 1] = { ...last, content: blocks };
    }
    s.warmAt = Date.now();

    const splitter = new SentenceSplitter();
    let announcedSearch = false;
    const stream = this.client.beta.messages.stream(this.#params(s, messages), { signal: turn.replySignal });
    stream.on("text", (delta) => {
      if (turn.firstToken === null) turn.firstToken = Date.now() - turn.t0;
      for (const sentence of splitter.push(delta)) this.#emit(turn, sentence);
    });
    stream.on("streamEvent", (event) => {
      const block = event.type === "content_block_start" ? event.content_block : null;
      if (block?.type === "server_tool_use" && block.name === "web_search" && !announcedSearch) {
        announcedSearch = true;
        this.#emit(turn, "Let me look that up.");
      }
      if (event.type === "content_block_stop") for (const sentence of splitter.flush()) this.#emit(turn, sentence);
    });
    const response = await stream.finalMessage();
    for (const sentence of splitter.flush()) this.#emit(turn, sentence);
    turn.models.add(response.model);
    for (const src of sourcesFrom(response.content)) if (!turn.sources.some((x) => x.url === src.url)) turn.sources.push(src);
    return response;
  }
}

/**
 * What goes in the log for a tool's input and result: file contents, clipboard text, text to
 * write and command output are recorded only as their size; other long strings are shortened.
 */
const PRIVATE_FIELDS = new Set(["text", "content", "output", "errors", "result"]);
function shortForLog(value, key = "") {
  if (typeof value === "string") {
    if (PRIVATE_FIELDS.has(key) && value.length > 0) return `[${value.length} characters]`;
    return value.length > 300 ? `${value.slice(0, 300)}… [${value.length} characters]` : value;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => shortForLog(v));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shortForLog(v, k)]));
  return value;
}

function friendlyApiError(err) {
  if (err instanceof Anthropic.AuthenticationError) return "My Claude API key isn't working. Check the dot env file.";
  if (err instanceof Anthropic.RateLimitError) return "Claude is rate limiting me. Try again in a moment.";
  if (err instanceof Anthropic.APIConnectionError) return "I can't reach Claude right now. Check the internet connection.";
  if (err instanceof Anthropic.APIError) return `Claude returned an error, status ${err.status}.`;
  if (!process.env.ANTHROPIC_API_KEY) return "My Claude API key isn't set. Add it to the dot env file.";
  return "Something went wrong talking to Claude.";
}

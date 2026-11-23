// The brain: sends your words to Claude, streams the reply back a sentence at a time,
// runs the tools it picks, and holds risky tool calls until you say "yes".
// One conversation per browser session.
import Anthropic from "@anthropic-ai/sdk";
import { settings } from "./config.js";
import { logAction } from "./logger.js";
import * as memory from "./memory.js";
import { addWarmer, errorDetails, keepAliveFetch } from "./net.js";
import { cancelAll, isKillPhrase, track } from "./cancel.js";
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
- Use web_search for current facts you don't know, like a business's phone number or opening hours.

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

/** Tool list sent to Claude: the same every request, so the prompt cache stays warm. */
function requestTools() {
  // Streaming requests: tool inputs stream as they're generated; we validate them ourselves.
  const list = toolDefinitions.map((d) => ({ ...d, eager_input_streaming: true }));
  if (claudeCfg.webSearch !== false) list.push(WEB_SEARCH);
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
    if (isKillPhrase(text)) {
      // "Jericho, stop" also works when typed or when it reaches the server
      this.stopAll(sessionId);
      const turn = this.#newTurn(hooks, sessionId);
      return this.#finishTurn(turn, this.#say(turn, pick(this.session(sessionId), "stopped")));
    }
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
    if (looksHard(corrected)) notes.push("This is a plan, decision or comparison: call deep_think with the context before answering.");
    if (notes.length) s.messages.push({ role: "system", content: notes.join("\n\n") });
    return this.#finishTurn(turn, await this.#loop(sessionId, s, turn));
  }

  /** Your answer while a risky action is waiting. */
  async confirm(sessionId, utterance, hooks = {}) {
    if (isKillPhrase(utterance)) return this.handle(sessionId, utterance, hooks);
    const turn = this.#newTurn(hooks, sessionId);
    const s = this.session(sessionId);
    if (!s.pending) return this.#finishTurn(turn, this.#say(turn, pick(s, "nothingPending")));
    const expired = Date.now() > s.pending.expiresAt;
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
    return { hooks, spoken: [], t0: Date.now(), firstToken: null, firstSentence: null, rounds: 0, models: new Set(), signal: controller.signal, untrack };
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
    const reply = turn.spoken.join(" ") || "Done.";
    const timings = {
      firstTokenMs: turn.firstToken,
      firstSentenceMs: turn.firstSentence,
      totalMs: Date.now() - turn.t0,
      rounds: turn.rounds,
      models: [...turn.models],
    };
    return { reply, awaitingConfirmation: Boolean(result.awaitingConfirmation), timings };
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
      try {
        response = await this.#streamClaude(s, turn);
      } catch (err) {
        if (turn.signal?.aborted) return { awaitingConfirmation: false, stopped: true }; // the kill switch: stop quietly
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
    const stream = this.client.beta.messages.stream(this.#params(s, messages), { signal: turn.signal });
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

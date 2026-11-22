// The brain: sends your words to Claude, streams the reply back a sentence at a time,
// runs the tools it picks, and holds risky tool calls until you say "yes".
// One conversation per browser session.
import Anthropic from "@anthropic-ai/sdk";
import { settings } from "./config.js";
import { logAction } from "./logger.js";
import * as memory from "./memory.js";
import { addWarmer, dispatcher } from "./net.js";
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
- For hard questions that need careful reasoning (multi-step maths, tricky facts, planning, comparisons), call deep_think, then give its answer briefly in your own words. Don't use it for everyday chat or simple commands.
- Use web_search for current facts you don't know, like a business's phone number or opening hours.

# How you talk
- Everything you write is spoken aloud. Write the way people talk: short sentences, contractions, plain words.
- No lists, markdown, headings, emoji, symbols, URLs or code. Say "and", "percent", "dollars" instead of symbols.
- Write numbers the way they're said: "seven thirty", "four people", "about twenty minutes", "twelve fifty". Phone numbers digit by digit in groups.
- Usually one or two sentences. Lead with the answer. No filler like "Great question" or "Certainly".
- Match their tone and the reply preferences in your notes.

# Acting
- Use your tools to act. Only say something happened if a tool result says it succeeded. If a tool isn't connected yet, say so in a few words.
- Some tools are risky (Claude Code, calendar invites, forgetting memories, phone calls). Just call them when asked: the system itself reads the action back and waits for a spoken yes, so never ask "are you sure" yourself.
- Memory: when they ask you to remember something, call remember with a short fact. Use recall for "what do you remember about...". To delete one, call forget with its id.
- Never store passwords, API keys, card numbers, ID numbers or similar secrets, even if they insist: say briefly that you can't store those.

# Phone calls
- You can phone businesses for ordinary errands: reservations, checking hours, appointments, or one simple question. Nothing else: no calling people, no emergencies, nothing deceptive.
- Before calling, you need the business name and its number (search for it or ask, never guess), and for bookings the date, time, party size and the name to book under (default ${owner} unless told otherwise). Ask for what's missing in one short question, then call make_call. The system reads the plan back and waits for a yes. The call runs in the background and they hear the result when it ends.

Your memories and notes on how they talk are below. Use them quietly; don't recite them unless asked.`;

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
    this.client = opts.client || new Anthropic({ fetchOptions: { dispatcher } });
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
  async handle(sessionId, text, hooks = {}) {
    const turn = this.#newTurn(hooks);
    const s = this.session(sessionId);
    const { text: corrected, fixes } = applyMishearings(text);
    logAction("request", { sessionId, text, ...(fixes.length ? { corrected, fixes } : {}) });
    const content = [];
    if (s.pending) {
      // You moved on instead of answering yes/no: treat it as a no.
      content.push(...this.#declineAll(s, "The user moved on without confirming. Not done."));
    }
    const note = fixes.length ? ` (speech-to-text heard "${text}"; auto-corrected ${fixes.join(", ")})` : "";
    content.push({ type: "text", text: `[${new Date().toString()}] ${corrected}${note}` });
    s.messages.push({ role: "user", content });
    s.transcript.push({ who: "user", text });
    if (s.seenVersion !== memory.version) {
      // Memories or style notes changed since this conversation started.
      s.messages.push({ role: "system", content: `Your memory and notes were updated. Current version:\n${memory.renderForPrompt()}` });
      s.seenVersion = memory.version;
    }
    return this.#finishTurn(turn, await this.#loop(sessionId, s, turn));
  }

  /** Your answer while a risky action is waiting. */
  async confirm(sessionId, utterance, hooks = {}) {
    const turn = this.#newTurn(hooks);
    const s = this.session(sessionId);
    if (!s.pending) return this.#finishTurn(turn, this.#say(turn, "There's nothing waiting for a yes right now."));
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
      return this.#finishTurn(turn, this.#say(turn, expired ? "That timed out, so I didn't do it." : "Okay, I won't."));
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
      logAction("prewarm_error", { sessionId, error: err.message });
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

  #newTurn(hooks) {
    return { hooks, spoken: [], t0: Date.now(), firstToken: null, firstSentence: null, rounds: 0, models: new Set() };
  }

  #emit(turn, sentence) {
    const clean = speakable(sentence);
    if (!clean) return;
    if (turn.firstSentence === null) turn.firstSentence = Date.now() - turn.t0;
    turn.spoken.push(clean);
    turn.hooks.onSentence?.(clean);
  }

  /** Speak fixed text (confirmations, errors) through the same sentence pipeline. */
  #say(turn, text, extra = {}) {
    const splitter = new SentenceSplitter(1);
    for (const sentence of [...splitter.push(`${text} `), ...splitter.flush()]) this.#emit(turn, sentence);
    return { awaitingConfirmation: false, ...extra };
  }

  #finishTurn(turn, result) {
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
    const ctx = { client: this.client, sessionId };
    for (const t of toolUses) {
      const tool = tools.get(t.name);
      if (tool?.announce && !prefailed[t.id]) this.#emit(turn, tool.announce);
    }
    return Promise.all(
      toolUses.map(async (t) => {
        const tool = tools.get(t.name);
        if (!tool) return { type: "tool_result", tool_use_id: t.id, content: `Unknown tool ${t.name}`, is_error: true };
        if (prefailed[t.id]) return { type: "tool_result", tool_use_id: t.id, content: `Not allowed: ${prefailed[t.id]}`, is_error: true };
        if (isRisky(t.name, t.input) && !approved) {
          return { type: "tool_result", tool_use_id: t.id, content: "Not confirmed. Not done.", is_error: true };
        }
        try {
          const result = await tool.run(t.input || {}, ctx);
          logAction("tool_result", { sessionId, tool: t.name, input: t.input, result });
          return { type: "tool_result", tool_use_id: t.id, content: JSON.stringify(result) };
        } catch (err) {
          logAction("tool_error", { sessionId, tool: t.name, input: t.input, error: err.message });
          return { type: "tool_result", tool_use_id: t.id, content: `Error: ${err.message}`, is_error: true };
        }
      }),
    );
  }

  async #loop(sessionId, s, turn) {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      turn.rounds++;
      let response;
      try {
        response = await this.#streamClaude(s, turn);
      } catch (err) {
        logAction("error", { sessionId, where: "claude", error: err.message });
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
        if (turn.spoken.length === 0) this.#say(turn, "Done.");
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
        logAction("tool_call", { sessionId, tool: t.name, input: t.input, risky: isRisky(t.name, t.input), ...(problem ? { invalid: problem } : {}) });
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
        logAction("confirmation_requested", { sessionId, actions: needYes.map((t) => ({ tool: t.name, input: t.input })) });
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
    const stream = this.client.beta.messages.stream(this.#params(s, messages));
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

function friendlyApiError(err) {
  if (err instanceof Anthropic.AuthenticationError) return "My Claude API key isn't working. Check the dot env file.";
  if (err instanceof Anthropic.RateLimitError) return "Claude is rate limiting me. Try again in a moment.";
  if (err instanceof Anthropic.APIConnectionError) return "I can't reach Claude right now. Check the internet connection.";
  if (err instanceof Anthropic.APIError) return `Claude returned an error, status ${err.status}.`;
  if (!process.env.ANTHROPIC_API_KEY) return "My Claude API key isn't set. Add it to the dot env file.";
  return "Something went wrong talking to Claude.";
}

// The brain: sends your words to Claude, runs the tools it picks, and holds risky
// tool calls until you say "yes". One conversation per browser session.
import Anthropic from "@anthropic-ai/sdk";
import { settings } from "./config.js";
import { logAction } from "./logger.js";
import * as memory from "./memory.js";
import { updateStyle } from "./style.js";
import { CONFIRM_TIMEOUT_MS, isYes } from "./safety.js";
import { describeAction, isRisky, toolDefinitions, tools } from "./tools/index.js";

const claudeCfg = settings.claude || {};
const MODEL = claudeCfg.model || "claude-opus-5-5";
const MAX_ROUNDS = claudeCfg.maxToolRounds ?? 6;
const IDLE_MS = (claudeCfg.conversationIdleMinutes ?? 10) * 60_000;
const MAX_MESSAGES = 60;

const SYSTEM = `You are ${settings.assistantName || "Jericho"}, a personal voice assistant running on the user's laptop.
Everything you write is read aloud, usually on a phone. Reply in one or two short sentences of plain speech: no markdown, lists, code, URLs or emoji.
Use your tools to act. Only say something happened if a tool result says it succeeded. If a tool says it isn't connected yet, say so in a few words.
Some tools are risky (running Claude Code, creating calendar events). Just call them when asked: the system itself asks the user out loud for confirmation, so never ask "are you sure" yourself.
If a request is unclear, ask one short question.

Memory: when the user asks you to remember something, call remember with a short fact. Use recall for "what do you remember about...". To delete a memory, call forget with its id; the system reads it back and asks for a yes.
Never store passwords, API keys, card numbers, ID numbers or similar secrets, even if the user insists: say briefly that you can't store those.
Your memories and notes on how the user talks are below. Use them quietly to understand the user and shape your replies; don't recite them unless asked.`;

export class Brain {
  /** @param {{ client?: Anthropic }} [opts] — inject a fake client in tests. */
  constructor(opts = {}) {
    this.client = opts.client || new Anthropic();
    this.sessions = new Map();
  }

  session(id) {
    let s = this.sessions.get(id);
    const now = Date.now();
    const stale = s && !s.pending && (now - s.lastActive > IDLE_MS || s.messages.length > MAX_MESSAGES);
    if (!s || stale) {
      // The instructions are frozen for the whole conversation (changing them mid-way
      // would invalidate Claude's earlier reasoning). Later memory changes are added
      // as appended system messages instead, see handle().
      s = { messages: [], pending: null, lastActive: now, context: memory.renderForPrompt(), seenVersion: memory.version, transcript: [] };
      this.sessions.set(id, s);
    }
    s.lastActive = now;
    return s;
  }

  /** A normal spoken request (after the wake word). */
  async handle(sessionId, text) {
    const s = this.session(sessionId);
    logAction("request", { sessionId, text });
    const content = [];
    if (s.pending) {
      // You moved on instead of answering yes/no: treat it as a no.
      content.push(...this.#declineAll(s, "The user moved on without confirming. Not done."));
    }
    content.push({ type: "text", text: `[${new Date().toString()}] ${text}` });
    s.messages.push({ role: "user", content });
    s.transcript.push({ who: "user", text });
    if (s.seenVersion !== memory.version) {
      // Memories or style notes changed since this conversation started.
      s.messages.push({ role: "system", content: `Your memory and notes were updated. Current version:\n${memory.renderForPrompt()}` });
      s.seenVersion = memory.version;
    }
    return this.#loop(sessionId, s);
  }

  /** Your answer while a risky action is waiting. */
  async confirm(sessionId, utterance) {
    const s = this.session(sessionId);
    if (!s.pending) return { reply: "There's nothing waiting for a yes right now.", awaitingConfirmation: false };
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
      return { reply: expired ? "That timed out, so I didn't do it." : "Okay, I won't.", awaitingConfirmation: false };
    }
    const { toolUses } = s.pending;
    s.pending = null;
    s.messages.push({ role: "user", content: await this.#runTools(sessionId, toolUses, true) });
    return this.#loop(sessionId, s);
  }

  #declineAll(s, reason) {
    const { toolUses } = s.pending;
    s.pending = null;
    return toolUses.map((t) => ({ type: "tool_result", tool_use_id: t.id, content: reason, is_error: true }));
  }

  async #runTools(sessionId, toolUses, approved) {
    return Promise.all(
      toolUses.map(async (t) => {
        const tool = tools.get(t.name);
        if (!tool) return { type: "tool_result", tool_use_id: t.id, content: `Unknown tool ${t.name}`, is_error: true };
        if (isRisky(t.name, t.input) && !approved) {
          return { type: "tool_result", tool_use_id: t.id, content: "Not confirmed. Not done.", is_error: true };
        }
        try {
          const result = await tool.run(t.input || {});
          logAction("tool_result", { sessionId, tool: t.name, input: t.input, result });
          return { type: "tool_result", tool_use_id: t.id, content: JSON.stringify(result) };
        } catch (err) {
          logAction("tool_error", { sessionId, tool: t.name, input: t.input, error: err.message });
          return { type: "tool_result", tool_use_id: t.id, content: `Error: ${err.message}`, is_error: true };
        }
      }),
    );
  }

  async #loop(sessionId, s) {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      let response;
      try {
        response = await this.#callClaude(s);
      } catch (err) {
        logAction("error", { sessionId, where: "claude", error: err.message });
        // Drop the half-finished conversation so the next request starts clean.
        this.sessions.delete(sessionId);
        return { reply: friendlyApiError(err), awaitingConfirmation: false };
      }

      if (response.stop_reason === "refusal") {
        logAction("refusal", { sessionId, details: response.stop_details });
        this.sessions.delete(sessionId);
        return { reply: "Sorry, I can't help with that one.", awaitingConfirmation: false };
      }

      // Keep the whole content (thinking + tool calls), not just the text.
      s.messages.push({ role: "assistant", content: response.content });
      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join(" ")
        .trim();
      const toolUses = response.content.filter((b) => b.type === "tool_use");

      if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
        const reply = text || "Done.";
        s.transcript.push({ who: "assistant", text: reply });
        logAction("reply", { sessionId, reply });
        return { reply, awaitingConfirmation: false };
      }

      for (const t of toolUses) logAction("tool_call", { sessionId, tool: t.name, input: t.input, risky: isRisky(t.name, t.input) });

      const risky = toolUses.filter((t) => isRisky(t.name, t.input));
      if (risky.length > 0) {
        s.pending = { toolUses, expiresAt: Date.now() + CONFIRM_TIMEOUT_MS };
        const what = risky.map((t) => describeAction(t.name, t.input).trim().replace(/[.!?]+$/, "")).join(", and ");
        const reply = `Should I ${what}? Say yes to confirm.`;
        logAction("confirmation_requested", { sessionId, actions: risky.map((t) => ({ tool: t.name, input: t.input })) });
        return { reply, awaitingConfirmation: true };
      }

      s.messages.push({ role: "user", content: await this.#runTools(sessionId, toolUses, false) });
    }
    return { reply: "Sorry, that took too many steps. Try asking a simpler way.", awaitingConfirmation: false };
  }

  /** The page says the conversation ended: learn from it with one small Claude call. */
  conversationEnded(sessionId) {
    const s = this.sessions.get(sessionId);
    if (!s || !s.transcript.some((t) => t.who === "user")) return false;
    const transcript = s.transcript.splice(0);
    updateStyle(this.client, transcript, sessionId); // in the background
    return true;
  }

  #callClaude(s) {
    const { messages } = s;
    const useFallbacks = claudeCfg.fallbacks !== false;
    return this.client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Short spoken replies: low effort keeps latency down. Raise in settings.json if needed.
      output_config: { effort: claudeCfg.effort || "low" },
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: s.context },
      ],
      tools: toolDefinitions,
      messages,
      // If the main model declines a request on safety grounds, the API retries it on
      // a fallback model inside the same call.
      ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
    });
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

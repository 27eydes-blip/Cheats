/* Asks Claude for the assistant's next reply. No logging here: see log.js. */
import Anthropic from "@anthropic-ai/sdk";
import { CHAT_MODEL, SECRET_REMINDER, SYSTEM_PROMPT } from "./prompt.js";
import { tidyReply } from "./validate.js";

export const REFUSAL_REPLY =
  "That's not something I can help with. Happy to answer questions about keeping your own website and email safe, though.";

/* history: [{role, text}] already cleaned and redacted. Returns { reply } or { error, status }. */
export async function generateReply(env, { history, message, redacted }, { fetchImpl } = {}) {
  if (!env.ANTHROPIC_API_KEY) return { status: 503, error: "The chat isn't available right now. You can reach us on the contact page." };

  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    timeout: 25_000,
    maxRetries: 1,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });

  const messages = history.map((m) => ({ role: m.role, content: m.text }));
  messages.push({ role: "user", content: message });
  if (redacted) messages.push({ role: "system", content: SECRET_REMINDER });

  try {
    const res = await client.messages.create({
      model: CHAT_MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      output_config: { effort: "low" },
      messages,
    });
    if (res.stop_reason === "refusal") return { reply: REFUSAL_REPLY };
    const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    if (!text) return { status: 502, error: "I couldn't come up with a reply just now. Please try again." };
    return { reply: tidyReply(text) };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError || (err instanceof Anthropic.APIError && err.status === 529)) {
      return { status: 503, error: "The assistant is busy right now. Please try again in a minute." };
    }
    if (err instanceof Anthropic.APIConnectionTimeoutError) {
      return { status: 504, error: "That took too long. Please try again." };
    }
    console.error("chat model error", err?.status || "", err?.name || err);
    return { status: 502, error: "Something went wrong on our side. Please try again shortly." };
  }
}

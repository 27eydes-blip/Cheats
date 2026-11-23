// After each conversation, one small Claude call updates data/style.json: how you talk,
// how long your requests are, how you like replies, and words the mic gets wrong.
import { getStyle, saveStyle } from "./memory.js";
import { settings } from "./config.js";
import { logAction } from "./logger.js";
import { errorDetails } from "./net.js";

const SCHEMA = {
  type: "object",
  properties: {
    phrases: { type: "array", items: { type: "string" }, description: "Phrases, slang and habits of speech the user actually uses" },
    requestLength: { type: "string", description: "One sentence on how long/short and how phrased their requests usually are" },
    replyPreferences: { type: "array", items: { type: "string" }, description: "How they like replies (length, tone, detail), from evidence" },
    mishearings: {
      type: "array",
      items: {
        type: "object",
        properties: { heard: { type: "string" }, meant: { type: "string" } },
        required: ["heard", "meant"],
        additionalProperties: false,
      },
      description: "Words the speech recognizer got wrong and what the user meant",
    },
  },
  required: ["phrases", "requestLength", "replyPreferences", "mishearings"],
  additionalProperties: false,
};

const INSTRUCTIONS = `You maintain short notes on how one person talks to their voice assistant, so future replies fit them.
You get the current notes and the transcript of the conversation that just ended. The user's lines are speech-to-text output, so they may contain recognition mistakes.
Return the updated notes:
- Keep what is still true, add what this conversation shows, drop what it contradicts. Change little if the conversation was short.
- Only note things the transcript supports. No guesses about personality.
- mishearings: only when it's clear, e.g. the user corrected themselves or a word makes no sense where an obvious word fits.
- Never include passwords, keys, card numbers, ID numbers or other secrets.
- Keep the whole thing under 250 words. Short items.`;

export async function updateStyle(client, transcript, sessionId) {
  const lines = transcript.map((t) => `${t.who === "user" ? "User" : "Assistant"}: ${t.text}`).join("\n");
  const current = getStyle();
  delete current.updatedAt;
  try {
    const useFallbacks = settings.claude?.fallbacks !== false;
    const response = await client.beta.messages.create({
      model: settings.claude?.model || "claude-opus-5-5",
      max_tokens: 4000,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: INSTRUCTIONS,
      messages: [
        {
          role: "user",
          content: `Current notes:\n${JSON.stringify(current, null, 2)}\n\nConversation:\n${lines}`,
        },
      ],
      ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
    });
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      logAction("style_update_skipped", { sessionId, reason: response.stop_reason });
      return null;
    }
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return saveStyle(JSON.parse(text), "style-update");
  } catch (err) {
    logAction("style_update_error", { sessionId, error: err.message, cause: errorDetails(err) });
    return null;
  }
}

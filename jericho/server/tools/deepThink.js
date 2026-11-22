// Hands a hard question to the stronger model (claude.hardModel in settings.json).
import { settings } from "../config.js";

export const deepThinkTool = {
  risky: false,
  announce: "Let me think that through.",
  definition: {
    name: "deep_think",
    description:
      "Ask a stronger model to work out a hard question: careful reasoning, multi-step maths, tricky comparisons, " +
      "planning, or anything you're unsure about. Slower, so not for everyday chat or simple commands. " +
      "Include the relevant context from the conversation. Then say the answer briefly in your own words.",
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string" },
        context: { type: "string", description: "What the user said earlier that matters, if anything" },
      },
      required: ["question"],
      additionalProperties: false,
    },
  },
  async run({ question, context }, ctx) {
    const c = settings.claude || {};
    const model = c.hardModel || "claude-fable-5-2";
    const stream = ctx.client.beta.messages.stream({
      model,
      max_tokens: 32000,
      output_config: { effort: c.hardEffort || "high" },
      system:
        "You're helping a voice assistant answer a hard question for its user. Work it out carefully, then reply with " +
        "only the answer in at most 120 words of plain spoken English: no lists, markdown or symbols, numbers written as spoken.",
      messages: [{ role: "user", content: context ? `${question}\n\nContext: ${context}` : question }],
      ...(c.fallbacks !== false ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
    });
    const response = await stream.finalMessage();
    if (response.stop_reason === "refusal") return { ok: false, error: "The stronger model declined this one." };
    const answer = response.content.filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
    return { ok: true, model, answer };
  },
};

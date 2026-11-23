// Hands a hard question to the stronger model (claude.hardModel in settings.json).
import { settings } from "../config.js";
import { getProfile, listLessons } from "../memory.js";

function deepSystem(detail) {
  const limit = detail === "deep" ? 220 : detail === "brief" ? 60 : 120;
  const profile = getProfile();
  const about = profile.items.map((i) => `${i.category}: ${i.text}`).join("; ");
  const lessons = listLessons().map((l) => l.text).join("; ");
  return (
    "You're helping a voice assistant answer a hard question, plan or decision for its user. Think it through step by step: " +
    "what's being asked, the options, what matters for this person, then a clear recommendation or answer. " +
    `Reply with only the answer in at most ${limit} words of plain spoken English: lead with the conclusion, then the key reasons. ` +
    "No lists, markdown or symbols, numbers written as spoken." +
    (about ? ` What you know about the user (from things they said): ${about}.` : "") +
    (lessons ? ` Their standing corrections: ${lessons}.` : "")
  );
}

export const deepThinkTool = {
  risky: false,
  // said before it runs (it takes a few seconds); varied so it doesn't sound canned
  announce: ["Let me think that through.", "Give me a second to work that out.", "Hmm, let me think about that properly.", "Let me think this one through.", "One moment, I'll work through it."],
  definition: {
    name: "deep_think",
    description:
      "Ask a stronger model to think a hard question through step by step: plans, decisions, comparisons, trade-offs, " +
      "multi-step maths, tricky facts, or anything you're unsure about. Slower, so not for quick facts, chat or simple commands. " +
      "Include the relevant context from the conversation and how much detail the user wants. Then say the answer in your own words.",
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string" },
        context: { type: "string", description: "What the user said earlier that matters, if anything" },
        detail: { type: "string", enum: ["brief", "normal", "deep"], description: "How much detail the user wants" },
      },
      required: ["question"],
      additionalProperties: false,
    },
  },
  async run({ question, context, detail = "normal" }, ctx) {
    const c = settings.claude || {};
    const model = c.hardModel || "claude-fable-5-2";
    const stream = ctx.client.beta.messages.stream({
      model,
      max_tokens: 32000,
      output_config: { effort: c.hardEffort || "high" },
      system: deepSystem(detail),
      messages: [{ role: "user", content: context ? `${question}\n\nContext: ${context}` : question }],
      ...(c.fallbacks !== false ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
    });
    const response = await stream.finalMessage();
    if (response.stop_reason === "refusal") return { ok: false, error: "The stronger model declined this one." };
    const answer = response.content.filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
    return { ok: true, model, answer };
  },
};

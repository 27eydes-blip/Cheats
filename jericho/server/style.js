// After each conversation, one small Claude call learns from it:
//  - style notes (data/style.json): how you talk, request length, reply preferences, misheard words
//  - your profile (data/profile.json): projects, goals, people, preferences, routines, recurring topics
//  - lessons (data/lessons.json): corrections you made that should always be followed
//  - a one-line summary of the conversation, so later ones have context
// Only things you actually said are kept: every new profile item must quote your own words.
import { settings } from "./config.js";
import { logAction } from "./logger.js";
import { addLesson, applyProfileUpdate, getProfile, getStyle, listLessons, PROFILE_CATEGORIES, saveStyle } from "./memory.js";
import { errorDetails } from "./net.js";

const SCHEMA = {
  type: "object",
  properties: {
    style: {
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
        },
      },
      required: ["phrases", "requestLength", "replyPreferences", "mishearings"],
      additionalProperties: false,
    },
    profile: {
      type: "object",
      properties: {
        keep: { type: "array", items: { type: "string" }, description: "ids of existing items to keep; leave out duplicates you merged and stale or contradicted items" },
        edit: {
          type: "array",
          items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" } }, required: ["id", "text"], additionalProperties: false },
          description: "rewordings of kept items, e.g. to merge two duplicates into one",
        },
        add: {
          type: "array",
          items: {
            type: "object",
            properties: {
              category: { type: "string", enum: PROFILE_CATEGORIES },
              text: { type: "string", description: "short third-person fact, e.g. 'Building a tic tac toe game for their nephew'" },
              quote: { type: "string", description: "the user's exact words from this conversation that show it" },
            },
            required: ["category", "text", "quote"],
            additionalProperties: false,
          },
        },
        mentioned: { type: "array", items: { type: "string" }, description: "ids of existing items the user brought up again" },
      },
      required: ["keep", "edit", "add", "mentioned"],
      additionalProperties: false,
    },
    lessons: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string", description: "an instruction to the assistant, e.g. 'When the user says the lights without a room, they mean the office'" },
          quote: { type: "string", description: "the user's exact correction" },
        },
        required: ["text", "quote"],
        additionalProperties: false,
      },
      description: "only clear corrections of the assistant that weren't already saved as lessons",
    },
    summary: { type: "string", description: "one short sentence: what this conversation was about. Empty if trivial." },
  },
  required: ["style", "profile", "lessons", "summary"],
  additionalProperties: false,
};

const INSTRUCTIONS = `You keep the notes a personal voice assistant uses to understand one person better over time.
You get the current notes and the transcript of the conversation that just ended. The user's lines are speech-to-text, so they may contain recognition mistakes.

Return updates:
- style: how they talk. Keep what's still true, add what this conversation shows, drop what it contradicts. Under 250 words. mishearings only when it's clear.
- profile: projects, goals, people, preferences, routines, and topics they keep coming back to.
  * Only add things the user actually said in this conversation, each with their exact words in "quote". If you can't quote it, don't add it.
  * Never add guesses or judgments, and nothing about health, mental state, personality, relationships' private details, sexuality, religion, finances or anything secret.
  * Merge duplicates (keep one id, reword it with "edit", leave the others out of "keep"). Drop items that are clearly finished or contradicted.
  * List in "mentioned" the existing items they brought up again.
- lessons: when the user corrected the assistant ("no, I meant...", "that's wrong", "stop doing that"), turn it into a short lasting instruction, with their words as the quote. Skip any already listed.
- summary: one plain sentence about what the conversation covered, without personal details. Empty if trivial.
- Refer to the user as "the user" or "they". Never guess anyone's gender from a name.
- Never include passwords, keys, card numbers, ID numbers or other secrets anywhere.`;

export async function updateLearning(client, transcript, sessionId) {
  const lines = transcript.map((t) => `${t.who === "user" ? "User" : "Assistant"}: ${t.text}`).join("\n");
  const userText = transcript.filter((t) => t.who === "user").map((t) => t.text).join("\n");
  const style = getStyle();
  delete style.updatedAt;
  const profile = getProfile();
  const current = {
    style,
    profile: profile.items.map((i) => ({ id: i.id, category: i.category, text: i.text, lastSeen: i.lastSeen, mentions: i.mentions })),
    lessons: listLessons().map((l) => l.text),
  };
  try {
    const useFallbacks = settings.claude?.fallbacks !== false;
    const response = await client.beta.messages.create({
      model: settings.claude?.model || "claude-opus-5-5",
      max_tokens: 6000,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: INSTRUCTIONS,
      messages: [{ role: "user", content: `Current notes:\n${JSON.stringify(current, null, 2)}\n\nConversation:\n${lines}` }],
      ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
    });
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      logAction("learning_skipped", { sessionId, reason: response.stop_reason });
      return null;
    }
    const out = JSON.parse(response.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
    // Older shape (style only) is still accepted.
    const styleOut = out.style || (out.phrases ? out : null);
    if (styleOut) saveStyle(styleOut, "learning");
    if (out.profile) applyProfileUpdate({ ...out.profile, summary: out.summary }, userText, "learning");
    for (const l of out.lessons || []) addLesson(l.text, l.quote, userText, "learning");
    return out;
  } catch (err) {
    logAction("learning_error", { sessionId, error: err.message, cause: errorDetails(err) });
    return null;
  }
}

/** Kept for older callers. */
export const updateStyle = updateLearning;

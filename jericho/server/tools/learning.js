// Learning tools: save a lesson when you correct Jericho, and say what it has learned about you.
import { addLesson, getProfile, getStyle, listLessons, listMemories, PROFILE_CATEGORIES } from "../memory.js";

export const saveLessonTool = {
  risky: false,
  definition: {
    name: "save_lesson",
    description:
      "When the user corrects you (\"no, I meant...\", \"that's wrong\", \"stop doing that\", \"I told you...\"), " +
      "save a short lasting rule so you get it right from now on, e.g. \"When the user says 'the lights' with no room, they mean the office\". Refer to the user as \"the user\" or \"they\", never guess gender. " +
      "Quote the user's exact correction. Never for passwords, keys, card or ID numbers.",
    input_schema: {
      type: "object",
      properties: {
        lesson: { type: "string", description: "The rule to follow from now on, one sentence" },
        quote: { type: "string", description: "The user's exact words that corrected you" },
      },
      required: ["lesson", "quote"],
      additionalProperties: false,
    },
  },
  async run({ lesson, quote }, ctx) {
    return addLesson(lesson, quote, ctx.userText ?? "", "voice");
  },
};

export const whatIveLearnedTool = {
  risky: false,
  definition: {
    name: "what_ive_learned",
    description:
      "Everything you've learned about the user: profile (projects, goals, people, preferences, routines, recurring topics), " +
      "lessons from their corrections, how they talk, and saved memories. Use it when they ask what you know or have learned about them, " +
      "then give a short spoken summary of the highlights.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  async run() {
    const profile = getProfile();
    const byCategory = Object.fromEntries(
      PROFILE_CATEGORIES.map((c) => [c, profile.items.filter((i) => i.category === c).map((i) => ({ text: i.text, mentions: i.mentions }))]),
    );
    const style = getStyle();
    return {
      profile: byCategory,
      recentConversations: profile.recent,
      lessons: listLessons().map((l) => l.text),
      howTheyTalk: { phrases: style.phrases, requests: style.requestLength, replyPreferences: style.replyPreferences },
      memories: { count: listMemories().length, latest: listMemories().slice(-8).map((m) => m.text) },
      note: "Everything is stored only on this PC and can be viewed or deleted on the Memory page.",
    };
  },
};

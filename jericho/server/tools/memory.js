// Memory tools: remember, recall, forget. Forget is risky, so the safety layer reads
// the memory back out loud and waits for a spoken yes before deleting it.
import { addMemory, deleteMemory, findMemory, searchMemories, SENSITIVE_REFUSAL, isSensitive } from "../memory.js";

export const rememberTool = {
  risky: false,
  definition: {
    name: "remember",
    description:
      "Save a fact about the user for the future, when they ask you to remember something " +
      "(\"remember that...\", \"don't forget...\"). Write it as a short third-person fact, e.g. " +
      "\"Prefers oat milk\". Never use this for passwords, keys, card numbers or ID numbers: " +
      "the tool refuses them.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The fact, short and self-contained" },
        topic: { type: "string", description: "One or two words, e.g. food, family, work, home" },
      },
      required: ["text", "topic"],
      additionalProperties: false,
    },
  },
  async run({ text, topic }) {
    if (isSensitive(text) || isSensitive(topic)) return { ok: false, refused: true, error: SENSITIVE_REFUSAL };
    return addMemory(text, topic, "voice");
  },
};

export const recallTool = {
  risky: false,
  definition: {
    name: "recall",
    description:
      "Search saved memories (\"what do you remember about...\"). Empty query lists recent ones. " +
      "Returns ids, needed for forget.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Keywords, or empty for everything" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  async run({ query }) {
    const found = searchMemories(query);
    return { ok: true, count: found.length, memories: found.slice(-30) };
  },
};

export const forgetTool = {
  // Deleting is risky: the user hears exactly which memory before anything is removed.
  risky: true,
  describe: ({ id }) => {
    const m = findMemory(id);
    return m ? `forget the memory "${m.text.replace(/[.!?]+$/, "")}"` : `forget memory ${id}, which I can't find`;
  },
  definition: {
    name: "forget",
    description:
      "Delete one saved memory by id (ids are shown in your memory list, or use recall first). " +
      "Call once per memory. The system reads it back to the user and asks for a yes before deleting.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string", description: "Memory id, like m1a2b3c" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  async run({ id }) {
    return deleteMemory(id, "voice");
  },
};

// Long-term memory (data/memory.json) and notes on how you talk (data/style.json).
// Both files live in data/, which is git-ignored, so they never get committed.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./config.js";
import { logAction } from "./logger.js";
import { isSensitive } from "./secrets.js";

export { isSensitive };

const DATA_DIR = process.env.JERICHO_DATA_DIR || path.join(ROOT, "data");
const MEMORY_FILE = path.join(DATA_DIR, "memory.json");
const STYLE_FILE = path.join(DATA_DIR, "style.json");
export const MAX_MEMORIES_IN_PROMPT = 100;

/** Bumped on every change, so open conversations know to pick up the new contents. */
export let version = 0;

export const SENSITIVE_REFUSAL =
  "I can't store passwords, keys, card numbers or ID numbers, even if you ask. Keep those in a password manager.";

// ---- file helpers ------------------------------------------------------------------

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tmp, file); // atomic: never leaves a half-written file
  version++;
}

// ---- memories ----------------------------------------------------------------------

export function listMemories() {
  const data = readJson(MEMORY_FILE, { memories: [] });
  return Array.isArray(data.memories) ? data.memories : [];
}

export function addMemory(text, topic, source = "voice") {
  const clean = String(text || "").trim().replace(/\s+/g, " ");
  const cleanTopic = String(topic || "general").trim().toLowerCase().slice(0, 40) || "general";
  if (!clean) return { ok: false, error: "Nothing to remember." };
  if (isSensitive(clean) || isSensitive(cleanTopic)) {
    logAction("memory_refused", { source, reason: "sensitive" }); // the text itself is not logged
    return { ok: false, refused: true, error: SENSITIVE_REFUSAL };
  }
  const memories = listMemories();
  const memory = {
    id: `m${crypto.randomBytes(3).toString("hex")}`,
    text: clean.slice(0, 500),
    topic: cleanTopic,
    date: new Date().toISOString().slice(0, 10),
  };
  memories.push(memory);
  writeJson(MEMORY_FILE, { memories });
  logAction("memory_saved", { source, memory });
  return { ok: true, memory };
}

export function findMemory(id) {
  return listMemories().find((m) => m.id === id) || null;
}

export function deleteMemory(id, source = "voice") {
  const memories = listMemories();
  const memory = memories.find((m) => m.id === id);
  if (!memory) return { ok: false, error: `No memory with id ${id}.` };
  writeJson(MEMORY_FILE, { memories: memories.filter((m) => m.id !== id) });
  logAction("memory_deleted", { source, memory });
  return { ok: true, deleted: memory };
}

export function searchMemories(query) {
  const words = String(query || "")
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2);
  const all = listMemories();
  if (words.length === 0) return all.slice(-MAX_MEMORIES_IN_PROMPT);
  return all.filter((m) => {
    const hay = `${m.text} ${m.topic}`.toLowerCase();
    return words.some((w) => hay.includes(w));
  });
}

// ---- style notes ---------------------------------------------------------------------

export const EMPTY_STYLE = { phrases: [], requestLength: "", replyPreferences: [], mishearings: [] };

export function getStyle() {
  return { ...EMPTY_STYLE, ...readJson(STYLE_FILE, {}) };
}

export function styleWordCount(style) {
  const parts = [
    ...style.phrases,
    style.requestLength,
    ...style.replyPreferences,
    ...style.mishearings.map((m) => `${m.heard} ${m.meant}`),
  ];
  return parts.join(" ").split(/\s+/).filter(Boolean).length;
}

/** Saves new style notes: drops anything sensitive and trims to about 300 words. */
export function saveStyle(next, source = "style-update") {
  const s = {
    phrases: (next.phrases || []).map(String),
    requestLength: String(next.requestLength || ""),
    replyPreferences: (next.replyPreferences || []).map(String),
    mishearings: (next.mishearings || [])
      .filter((m) => m && m.heard && m.meant)
      .map((m) => ({ heard: String(m.heard), meant: String(m.meant) })),
  };
  s.phrases = s.phrases.filter((x) => !isSensitive(x));
  s.replyPreferences = s.replyPreferences.filter((x) => !isSensitive(x));
  s.mishearings = s.mishearings.filter((m) => !isSensitive(m.heard) && !isSensitive(m.meant));
  if (isSensitive(s.requestLength)) s.requestLength = "";
  // Trim the longest list until it fits.
  while (styleWordCount(s) > 300) {
    const lists = [s.phrases, s.replyPreferences, s.mishearings].sort((a, b) => b.length - a.length);
    if (lists[0].length === 0) {
      s.requestLength = s.requestLength.split(/\s+/).slice(0, 40).join(" ");
      break;
    }
    lists[0].shift(); // oldest first
  }
  const saved = { ...s, updatedAt: new Date().toISOString() };
  writeJson(STYLE_FILE, saved);
  logAction("style_saved", { source, words: styleWordCount(s) });
  return saved;
}

const STYLE_SECTIONS = ["phrases", "replyPreferences", "mishearings", "requestLength"];

export function deleteStyleItem(section, index, source = "memory-page") {
  if (!STYLE_SECTIONS.includes(section)) return { ok: false, error: "Unknown section." };
  const style = getStyle();
  let removed;
  if (section === "requestLength") {
    removed = style.requestLength;
    style.requestLength = "";
  } else {
    if (!(index >= 0 && index < style[section].length)) return { ok: false, error: "No such item." };
    [removed] = style[section].splice(index, 1);
  }
  writeJson(STYLE_FILE, { ...style, updatedAt: new Date().toISOString() });
  logAction("style_item_deleted", { source, section, removed });
  return { ok: true };
}

export function wipeAll(source = "memory-page") {
  const count = listMemories().length;
  writeJson(MEMORY_FILE, { memories: [] });
  writeJson(STYLE_FILE, { ...EMPTY_STYLE, updatedAt: new Date().toISOString() });
  logAction("memory_wiped", { source, memoriesDeleted: count, styleCleared: true });
  return { ok: true };
}

// ---- what goes into Jericho's instructions -------------------------------------------

export function renderForPrompt() {
  const memories = listMemories().slice(-MAX_MEMORIES_IN_PROMPT);
  const style = getStyle();
  const lines = [];
  lines.push("## What you remember about the user");
  if (memories.length === 0) lines.push("(nothing yet)");
  for (const m of memories) lines.push(`- [${m.id}] ${m.date} (${m.topic}) ${m.text}`);
  lines.push("", "## How the user talks (use this to understand them and shape replies)");
  if (style.phrases.length) lines.push(`Phrases and slang they use: ${style.phrases.join("; ")}`);
  if (style.requestLength) lines.push(`Their requests: ${style.requestLength}`);
  if (style.replyPreferences.length) lines.push(`Reply preferences: ${style.replyPreferences.join("; ")}`);
  if (style.mishearings.length) {
    lines.push(
      `The microphone often mishears them. When you see the left word, they probably meant the right: ${style.mishearings
        .map((m) => `"${m.heard}" → "${m.meant}"`)
        .join(", ")}`,
    );
  }
  if (!style.phrases.length && !style.requestLength && !style.replyPreferences.length && !style.mishearings.length) {
    lines.push("(no notes yet)");
  }
  return lines.join("\n");
}

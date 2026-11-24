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
const PROFILE_FILE = path.join(DATA_DIR, "profile.json");
const LESSONS_FILE = path.join(DATA_DIR, "lessons.json");
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
  logAction("memory_saved", { source, id: memory.id, chars: memory.text.length }); // no personal text in the log
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
  logAction("memory_deleted", { source, id: memory.id });
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
  logAction("style_item_deleted", { source, section, index, hadText: Boolean(removed) });
  return { ok: true };
}

export function wipeAll(source = "memory-page") {
  const count = listMemories().length;
  const profileItems = getProfile().items.length;
  const lessons = listLessons().length;
  writeJson(MEMORY_FILE, { memories: [] });
  writeJson(STYLE_FILE, { ...EMPTY_STYLE, updatedAt: new Date().toISOString() });
  writeJson(PROFILE_FILE, { ...EMPTY_PROFILE, updatedAt: new Date().toISOString() });
  writeJson(LESSONS_FILE, { lessons: [] });
  logAction("memory_wiped", { source, memoriesDeleted: count, profileItemsDeleted: profileItems, lessonsDeleted: lessons, styleCleared: true });
  return { ok: true };
}

// ---- profile: what Jericho has learned about you (data/profile.json) ----------------------

export const PROFILE_CATEGORIES = ["projects", "goals", "people", "preferences", "routines", "topics"];
export const EMPTY_PROFILE = { items: [], recent: [] };
export const PROFILE_MAX_WORDS = 500;
const words = (t) => String(t || "").split(/\s+/).filter(Boolean).length;
const norm = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const today = () => new Date().toISOString().slice(0, 10);
const newId = (prefix) => `${prefix}${crypto.randomBytes(3).toString("hex")}`;

// Guesses about health, personality or private life never go into the profile.
const SPECULATIVE = /\b(seems?|appears?|probably|likely|might be|maybe|perhaps|i think|guess|personality|introvert|extrovert|temperament|insecure|lonely)\b/i;
const PRIVATE = /\b(diagnos\w*|depress\w*|anxiety|anxious|medicat\w*|therapy|therapist|illness|disease|disorder|pregnan\w*|mental health|sexual\w*|sexuality|religio\w*|dating|divorce|affair|addict\w*)\b/i;
export function profileTextAllowed(text) {
  return Boolean(text) && !isSensitive(text) && !SPECULATIVE.test(text) && !PRIVATE.test(text);
}

export function getProfile() {
  const p = { ...EMPTY_PROFILE, ...readJson(PROFILE_FILE, {}) };
  p.items = Array.isArray(p.items) ? p.items : [];
  p.recent = Array.isArray(p.recent) ? p.recent : [];
  return p;
}

export function profileWordCount(p) {
  return p.items.reduce((n, i) => n + words(i.text), 0) + p.recent.reduce((n, r) => n + words(r.text), 0);
}

/**
 * Applies one conversation's update.
 * update: { keep: [ids], edit: [{id, text}], add: [{category, text, quote}], mentioned: [ids], summary }
 * userText: everything the user said in that conversation. New items must quote it.
 */
export function applyProfileUpdate(update, userText, source = "learning") {
  const p = getProfile();
  const said = norm(userText);
  const byId = new Map(p.items.map((i) => [i.id, i]));
  const stats = { added: 0, edited: 0, dropped: 0, rejected: 0, merged: 0, trimmed: 0 };

  // keep / drop (the model merges duplicates and drops stale items by leaving them out)
  const keep = new Set(Array.isArray(update.keep) ? update.keep : p.items.map((i) => i.id));
  let items = p.items.filter((i) => {
    if (keep.has(i.id)) return true;
    stats.dropped++;
    return false;
  });
  for (const e of update.edit || []) {
    const item = items.find((i) => i.id === e.id);
    if (!item || !profileTextAllowed(e.text)) continue;
    item.text = String(e.text).slice(0, 200);
    stats.edited++;
  }
  for (const id of update.mentioned || []) {
    const item = items.find((i) => i.id === id);
    if (item) {
      item.mentions = (item.mentions || 1) + 1;
      item.lastSeen = today();
    }
  }
  for (const a of update.add || []) {
    const quote = norm(a.quote);
    // only what you actually said: the quote has to be in your own words from this conversation
    if (!PROFILE_CATEGORIES.includes(a.category) || !quote || quote.length < 3 || !said.includes(quote) || !profileTextAllowed(a.text) || isSensitive(a.quote)) {
      stats.rejected++;
      continue;
    }
    const dup = items.find((i) => norm(i.text) === norm(a.text));
    if (dup) {
      dup.mentions = (dup.mentions || 1) + 1;
      dup.lastSeen = today();
      stats.merged++;
      continue;
    }
    items.push({ id: newId("p"), category: a.category, text: String(a.text).slice(0, 200), firstSeen: today(), lastSeen: today(), mentions: 1 });
    stats.added++;
  }
  void byId;

  let recent = p.recent;
  if (update.summary && profileTextAllowed(update.summary)) {
    recent = [...recent, { date: today(), text: String(update.summary).slice(0, 220) }].slice(-5);
  }
  // stay under ~500 words: the oldest summaries go first, then the stalest, least-mentioned items
  const next = { items, recent };
  while (profileWordCount(next) > PROFILE_MAX_WORDS) {
    if (next.recent.length > 2) {
      next.recent.shift();
    } else if (next.items.length) {
      next.items.sort((a, b) => (a.lastSeen === b.lastSeen ? (a.mentions || 1) - (b.mentions || 1) : a.lastSeen < b.lastSeen ? -1 : 1));
      next.items.shift();
    } else if (next.recent.length) {
      next.recent.shift();
    } else break;
    stats.trimmed++;
  }
  writeJson(PROFILE_FILE, { ...next, updatedAt: new Date().toISOString() });
  logAction("profile_updated", { source, ...stats, items: next.items.length, words: profileWordCount(next) });
  return next;
}

export function deleteProfileItem(id, source = "memory-page") {
  const p = getProfile();
  const items = p.items.filter((i) => i.id !== id);
  if (items.length === p.items.length) return { ok: false, error: "No such item." };
  writeJson(PROFILE_FILE, { ...p, items, updatedAt: new Date().toISOString() });
  logAction("profile_item_deleted", { source, id });
  return { ok: true };
}

export function deleteRecentSummary(index, source = "memory-page") {
  const p = getProfile();
  if (!(index >= 0 && index < p.recent.length)) return { ok: false, error: "No such item." };
  p.recent.splice(index, 1);
  writeJson(PROFILE_FILE, { ...p, updatedAt: new Date().toISOString() });
  logAction("profile_summary_deleted", { source, index });
  return { ok: true };
}

// ---- lessons: corrections Jericho should always follow (data/lessons.json) ------------------

export const MAX_LESSONS = 40;

export function listLessons() {
  const data = readJson(LESSONS_FILE, { lessons: [] });
  return Array.isArray(data.lessons) ? data.lessons : [];
}

/** Saves a lesson from one of your corrections. `quote` must be something you just said. */
export function addLesson(text, quote, userText, source = "correction") {
  const clean = String(text || "").trim().replace(/\s+/g, " ").slice(0, 240);
  if (!clean) return { ok: false, error: "Nothing to learn." };
  if (isSensitive(clean) || isSensitive(quote)) {
    logAction("lesson_refused", { source, reason: "sensitive" });
    return { ok: false, refused: true, error: SENSITIVE_REFUSAL };
  }
  if (userText !== undefined && (!norm(quote) || !norm(userText).includes(norm(quote)))) {
    logAction("lesson_refused", { source, reason: "not something the user said" });
    return { ok: false, error: "A lesson has to come from something the user actually said. Quote their correction." };
  }
  const lessons = listLessons();
  const dup = lessons.find((l) => norm(l.text) === norm(clean));
  if (dup) {
    dup.times = (dup.times || 1) + 1;
    dup.date = today();
    writeJson(LESSONS_FILE, { lessons });
    logAction("lesson_reinforced", { source, id: dup.id });
    return { ok: true, lesson: dup, reinforced: true };
  }
  const lesson = { id: newId("l"), text: clean, date: today(), times: 1 };
  writeJson(LESSONS_FILE, { lessons: [...lessons, lesson].slice(-MAX_LESSONS) });
  logAction("lesson_saved", { source, id: lesson.id, chars: clean.length });
  return { ok: true, lesson };
}

export function deleteLesson(id, source = "memory-page") {
  const lessons = listLessons();
  const next = lessons.filter((l) => l.id !== id);
  if (next.length === lessons.length) return { ok: false, error: "No such lesson." };
  writeJson(LESSONS_FILE, { lessons: next });
  logAction("lesson_deleted", { source, id });
  return { ok: true };
}

// ---- what goes into Jericho's instructions -------------------------------------------

// ---- what goes to Claude each turn -------------------------------------------------------
// The stable part (style notes, lessons, profile) sits in the cached instructions. Saved
// memories are not all sent every time: each request carries only the few that match it
// (relevantMemories), and Claude can call recall for anything else.
const STOP = new Set("the a an and or but to of in on at for with my me i you your is are was were be it its this that what whats when where who how do does did can could would should will about from have has had just like please jericho tell".split(" "));
const stem = (w) => w.replace(/'s$/, "").replace(/(ing|ed|es|s)$/, "");
function keywords(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .split(/[^a-z0-9']+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map(stem)
      .filter((w) => w.length > 1),
  );
}

/** The saved memories that match this request best (most matching words first, newest on ties). */
export function relevantMemories(text, limit = 6) {
  const want = keywords(text);
  if (want.size === 0) return [];
  const scored = [];
  listMemories().forEach((m, i) => {
    const have = keywords(`${m.text} ${m.topic}`);
    let score = 0;
    for (const w of want) if (have.has(w)) score++;
    if (score > 0) scored.push({ m, score, i });
  });
  return scored
    .sort((a, b) => b.score - a.score || b.i - a.i)
    .slice(0, limit)
    .map((x) => x.m);
}

/** The per-turn line: "Memories that may help: ...", or "" when none match. */
export function renderRelevantMemories(text, limit = 6) {
  const hits = relevantMemories(text, limit);
  if (!hits.length) return "";
  return `Saved memories that may help with this request:\n${hits.map((m) => `- [${m.id}] ${m.date} (${m.topic}) ${m.text}`).join("\n")}`;
}

/** Everything as before, minus the list of memories (they come per turn, see above). */
export function renderStableForPrompt() {
  return renderForPrompt({ memories: false });
}

export function renderForPrompt({ memories: withMemories = true } = {}) {
  const memories = listMemories().slice(-MAX_MEMORIES_IN_PROMPT);
  const style = getStyle();
  const lines = [];
  lines.push("## What you remember about the user");
  if (!withMemories) {
    lines.push(
      memories.length === 0
        ? "(nothing saved yet)"
        : `${memories.length} saved ${memories.length === 1 ? "memory" : "memories"}. The ones that match a request are attached to it; call recall to look up any others.`,
    );
  } else {
    if (memories.length === 0) lines.push("(nothing yet)");
    for (const m of memories) lines.push(`- [${m.id}] ${m.date} (${m.topic}) ${m.text}`);
  }
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

  const lessons = listLessons();
  lines.push("", "## Lessons from the user's corrections (always follow these)");
  if (lessons.length === 0) lines.push("(none yet)");
  for (const l of lessons) lines.push(`- ${l.text}`);

  const profile = getProfile();
  lines.push("", "## What you've learned about the user over time (from things they said)");
  if (profile.items.length === 0) lines.push("(nothing yet)");
  for (const cat of PROFILE_CATEGORIES) {
    const items = profile.items.filter((i) => i.category === cat);
    if (items.length) lines.push(`${cat[0].toUpperCase() + cat.slice(1)}: ${items.map((i) => (i.mentions > 2 ? `${i.text} (comes up often)` : i.text)).join("; ")}`);
  }
  if (profile.recent.length) {
    lines.push("Recent conversations:");
    for (const r of profile.recent) lines.push(`- ${r.date}: ${r.text}`);
  }
  return lines.join("\n");
}

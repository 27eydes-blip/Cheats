/* Input checks shared by the chat endpoints. */

export const MAX_MESSAGE_CHARS = 500;
export const MAX_REPLY_CHARS = 1200;
export const MAX_HISTORY = 20; // earlier messages the browser may send back (10 turns)
const MAX_HISTORY_ASSISTANT_CHARS = MAX_REPLY_CHARS + 50;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/* Control chars (keeps \n and \t), zero-width and bidi-override characters, BOM. */
const STRIP = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF]/g;

export const cleanText = (v) =>
  (typeof v === "string" ? v : "").normalize("NFC").replace(/\r\n?/g, "\n").replace(STRIP, "").trim();

export const validSessionId = (v) => typeof v === "string" && UUID_V4.test(v);

/* A same-site path only ("/security-check"), never a full URL; anything else is dropped. */
export function cleanStartPage(v) {
  const s = cleanText(v).slice(0, 120);
  return /^\/[A-Za-z0-9/_.-]*$/.test(s) && !s.startsWith("//") ? s : null;
}

/* History must alternate user/assistant starting with the visitor, within size limits. */
export function cleanHistory(raw) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_HISTORY || raw.length % 2 !== 0) return null;
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    const role = i % 2 === 0 ? "user" : "assistant";
    if (!item || typeof item !== "object" || item.role !== role) return null;
    const text = cleanText(item.text);
    const max = role === "user" ? MAX_MESSAGE_CHARS : MAX_HISTORY_ASSISTANT_CHARS;
    if (!text || text.length > max) return null;
    out.push({ role, text });
  }
  return out;
}

/* Cuts a reply to the length limit on a sentence or word boundary, and strips the
   Markdown markers the model is told not to use (the page shows plain text). */
export function tidyReply(text) {
  let t = String(text || "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(STRIP, "")
    .trim();
  if (t.length <= MAX_REPLY_CHARS) return t;
  const cut = t.slice(0, MAX_REPLY_CHARS);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return (stop > MAX_REPLY_CHARS * 0.6 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, "") + " …").trim();
}

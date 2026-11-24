// Wake word matching, shared by the page (app.js), the server and the tests.
// "Jericho", "Jer" and the misheard variants from settings.json, with an optional
// "hey" / "hi" / "ok" / "okay" in front: "Hey Jericho, lights on", "okay jer what's up".

export const DEFAULT_WAKE_WORDS = ["jericho", "jer", "jerico", "jeriko", "jerrico", "jerry co", "jerryco", "jerr"];
const GREETING = "(?:(?:hey|hi|hay|ok|okay|o\\.k\\.)[\\s,]+)?";

function escapeWords(list) {
  // Longest first, so "jerry co" wins over "jer". A space in a phrase also
  // matches a hyphen or no gap at all ("jerry co" = "jerry-co" = "jerryco").
  return [...list]
    .sort((a, b) => b.length - a.length)
    .map((w) => w.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "[\\s-]*"))
    .join("|");
}

// Built once per word list (they're checked on every transcript update, many times a second).
const built = new Map();
function cachedRegex(kind, words, flags, make) {
  const key = `${kind}|${flags}|${words.join("\u0001")}`;
  let re = built.get(key);
  if (!re) {
    if (built.size > 50) built.clear();
    re = make();
    built.set(key, re);
  }
  re.lastIndex = 0; // a shared /g regex must start from the beginning every time
  return re;
}

/** Matches the wake word (with "hey" etc. in front, if said) and the punctuation after it. */
export function wakeRegex(words = DEFAULT_WAKE_WORDS, flags = "i") {
  return cachedRegex("any", words, flags, () => new RegExp(`\\b${GREETING}(?:${escapeWords(words)})\\b[\\s,.!?]*`, flags));
}

/** { found, rest }: rest is what was said after the wake word, with the "hey" removed. */
export function findWake(text, words = DEFAULT_WAKE_WORDS) {
  const m = wakeRegex(words).exec(String(text || ""));
  if (!m) return { found: false, rest: String(text || "").trim() };
  return { found: true, rest: String(text).slice(m.index + m[0].length).trim() };
}

/** Removes a wake word said at the start ("Hey Jericho, what's the weather" -> "what's the weather"). */
export function stripLeadingWake(text, words = DEFAULT_WAKE_WORDS) {
  const t = String(text || "").trim();
  const m = cachedRegex("lead", words, "i", () => new RegExp(`^${GREETING}(?:${escapeWords(words)})\\b[\\s,.!?]*`, "i")).exec(t);
  return m ? t.slice(m[0].length).trim() || t : t;
}

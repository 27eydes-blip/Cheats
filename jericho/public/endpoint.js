// When have you finished talking? The browser's own "final" transcript can arrive a second or
// more after you stop. If the words on screen stop changing for long enough, the page sends the
// request early. How long is "long enough" depends on what was said: a short command needs less
// (450 ms), a long sentence more (up to a second), and a sentence that ends on "and" or "the"
// is clearly not finished, so it waits longer. Shared by the page and the tests.

const DANGLING = new Set(["and", "but", "or", "so", "the", "a", "an", "to", "of", "for", "with", "my", "your", "in", "on", "at", "is", "are", "if", "that", "because", "then", "um", "uh", "like", "about", "from", "into", "what", "which", "please"]);

const norm = (t) =>
  String(t || "")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** How long (ms) the transcript must stay unchanged before it's sent without the browser's final. */
export function earlyCommitDelay(text) {
  const words = norm(text).split(" ").filter(Boolean);
  const n = words.length;
  let ms = n <= 3 ? 450 : n <= 8 ? 650 : n <= 15 ? 850 : 1000;
  if (n && DANGLING.has(words.at(-1))) ms += 700; // "turn off the..." isn't finished
  return Math.min(1700, ms);
}

/**
 * The browser's final transcript arrived after we already sent the early one. Is it:
 *   "same"      the same words (or one or two more): already handled, drop it
 *   "longer"    you kept talking: three or more extra words after what we sent
 *   "different" something else entirely: treat it as a new thing you said
 */
export function compareEarly(early, final) {
  const a = norm(early).split(" ").filter(Boolean);
  const b = norm(final).split(" ").filter(Boolean);
  if (!a.length) return "different";
  if (!b.length) return "same";
  // how many of the early words appear, in order, at the start of the final transcript
  let i = 0;
  let j = 0;
  let matched = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      matched++;
      i++;
      j++;
    } else if (a[i + 1] === b[j]) i++; // a word the final dropped
    else if (a[i] === b[j + 1]) j++; // a word the final added
    else {
      i++;
      j++;
    }
  }
  if (matched / a.length < 0.6) return "different";
  const extra = b.length - j;
  return extra >= 3 ? "longer" : "same";
}

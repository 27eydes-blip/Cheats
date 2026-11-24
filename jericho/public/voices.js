// Choosing the browser's own voice (Web Speech synthesis, free, no key). Shared by the page and
// the tests. Default: the best Microsoft "Online (Natural)" English male voice (Edge has these),
// then any English male voice, then any English voice.

// First names of the male voices browsers ship (Edge's natural voices, Windows, macOS, Chrome, Android).
const MALE =
  /\b(guy|andrew|brian|christopher|eric|roger|steffan|davis|ryan|thomas|liam|william|connor|mitchell|tony|jason|ethan|noah|david|mark|george|james|daniel|alex|fred|aaron|arthur|oliver|rishi|gordon|lee|reed|ralph|tom|evan|nathan|jacob|kenneth|prabhat|ravi|duncan|male|man)\b/i;
const FEMALE = /\b(female|woman|aria|jenny|michelle|emma|ava|sonia|libby|natasha|clara|zira|hazel|susan|samantha|victoria|karen|moira|tessa|fiona|serena|allison|kate|heera|neerja)\b/i;

export const isEnglish = (v) => /^en(?:[-_]|$)/i.test(String(v?.lang || ""));
export const isNatural = (v) => /online\s*\(natural\)|natural/i.test(String(v?.name || ""));
export const isMale = (v) => MALE.test(String(v?.name || "")) && !FEMALE.test(String(v?.name || ""));

function score(v, lang) {
  let s = 0;
  if (isEnglish(v)) s += 100;
  if (isMale(v)) s += 40;
  if (isNatural(v)) s += 30; // "Microsoft Andrew Online (Natural)"
  if (/microsoft/i.test(v.name)) s += 5;
  if (String(v.lang).toLowerCase().replace("_", "-") === String(lang).toLowerCase()) s += 10; // your language exactly
  if (v.localService === false) s += 2;
  return s;
}

/** English voices first (best first), then the rest, for the picker. */
export function sortVoices(voices, lang = "en-US") {
  return [...(voices || [])].sort((a, b) => score(b, lang) - score(a, lang) || String(a.name).localeCompare(String(b.name)));
}

/**
 * The voice to use: the one named `preferred` if it's installed; otherwise the best English male
 * voice (natural ones first); otherwise any English voice; otherwise the browser's default (null).
 */
export function pickVoice(voices, preferred = "", lang = "en-US") {
  const list = [...(voices || [])];
  if (preferred) {
    const exact = list.find((v) => v.name === preferred) || list.find((v) => String(v.name).toLowerCase() === String(preferred).toLowerCase());
    if (exact) return exact;
  }
  const english = list.filter(isEnglish);
  if (!english.length) return null;
  return sortVoices(english, lang)[0];
}

/** Rate and pitch for a calm, deep, steady delivery, kept in a safe range. */
export function tuneSpeech({ rate, pitch } = {}) {
  const clamp = (x, lo, hi, d) => (Number.isFinite(Number(x)) && x !== "" && x !== null ? Math.min(hi, Math.max(lo, Number(x))) : d);
  return { rate: clamp(rate, 0.5, 1.5, 0.92), pitch: clamp(pitch, 0, 2, 0.85) };
}

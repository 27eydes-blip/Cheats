// © 2026 Sammy Eyde. All rights reserved. Glydrift — see LICENSE. Not open source.
// Username rules: 3–12 letters/numbers, plus a light profanity filter that also catches
// common leetspeak substitutions (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, 8→b, 9→g, $→s, @→a).

// Matched anywhere in the (normalized) name.
const BLOCKED_ANYWHERE = [
  "fuck",
  "fuk",
  "fck",
  "shit",
  "bitch",
  "cunt",
  "nigg",
  "faggot",
  "retard",
  "whore",
  "slut",
  "pussy",
  "dildo",
  "jizz",
  "nazi",
  "hitler",
  "porn",
  "penis",
  "vagina",
  "wank",
  "twat",
  "tranny",
  "kike",
  "chink",
  "asshole",
  "bastard",
  "horny",
  "nude",
  "milf",
];
// Short words: only as a whole word part ("Dick99", "SexKing"), so "Grape", "Shoe",
// "Essex" and "Analyst" stay allowed.
const BLOCKED_EDGE = [
  "fag",
  "rape",
  "cum",
  "anal",
  "sex",
  "hoe",
  "tits",
  "boob",
  "cock",
  "dick",
  "piss",
  "spic",
  "kkk",
  "arse",
];

const LEET = {
  0: "o",
  1: "i",
  3: "e",
  4: "a",
  5: "s",
  7: "t",
  8: "b",
  9: "g",
  $: "s",
  "@": "a",
  "!": "i",
};

function leet(name) {
  return [...String(name).toLowerCase()].map((c) => LEET[c] ?? c).join("");
}

/** Leetspeak-mapped forms: as typed, and with repeated letters collapsed ("fuuuck"). */
function normalize(name) {
  const mapped = leet(name);
  return [mapped, mapped.replace(/(.)\1+/g, "$1")];
}

/** @returns {string|null} error message, or null when the name is OK */
export function validateUsername(name) {
  const n = String(name ?? "").trim();
  if (n.length < 3) return "At least 3 characters";
  if (n.length > 12) return "12 characters max";
  if (!/^[A-Za-z0-9]+$/.test(n)) return "Letters and numbers only";
  const forms = [n.toLowerCase(), ...normalize(n)];
  // word parts split on camelCase and letter/digit boundaries
  const parts = n
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([A-Za-z])/g, "$1 $2")
    .toLowerCase()
    .split(" ")
    .flatMap(normalize);
  const bad =
    forms.some((f) => BLOCKED_ANYWHERE.some((w) => f.includes(w))) ||
    parts.some((p) => BLOCKED_EDGE.includes(p)) ||
    forms.some((f) => BLOCKED_EDGE.includes(f));
  if (bad) return "Please pick a different name";
  return null;
}

export function suggestUsername() {
  const a = ["Neon", "Drift", "Nova", "Volt", "Pixel", "Comet", "Glow", "Flux", "Zero", "Echo"];
  const b = ["Fox", "Wing", "Byte", "Star", "Ray", "Pilot", "Ace", "Jet", "Orb", "Kid"];
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  return `${pick(a)}${pick(b)}${Math.floor(Math.random() * 90 + 10)}`.slice(0, 12);
}

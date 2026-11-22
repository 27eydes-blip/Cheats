/* Removes things that look like secrets before chat text is saved or sent to the model:
   passwords, API keys and tokens, private keys, and payment card numbers.
   Errs on the side of redacting: a false positive costs a word, a miss stores a secret. */

const R = "[redacted]";

const luhn = (digits) => {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
};

const RULES = [
  { kind: "private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g },
  { kind: "token", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g }, // JWT
  { kind: "token", re: /\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*/gi },
  {
    kind: "API key",
    re: /\b(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}|[sr]k_(?:live|test)_[A-Za-z0-9]{12,}|re_[A-Za-z0-9_]{16,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|(?:AKIA|ASIA)[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|0x4AAAAAA[A-Za-z0-9_-]{16,})/g,
  },
  // "password: hunter2", "my pw is hunter2", "api key = abc..." -> keep the label, hide the value
  {
    kind: "password",
    re: /\b(pass(?:word|wd|code|phrase)?|pwd|pw|pin|secret|api[ _-]?key|access[ _-]?key|token|login code)\b(\s*(?:is|was|=|:)\s*|\s+)("[^"]+"|'[^']+'|\S+)/gi,
    replace: (m, label, sep, value) => {
      if (value === R || value.length < 3) return m;
      // "password: x" / "pw is x" -> always hide x. "password reset" (no is/=/:) -> only hide
      // values that look like a secret: has a digit or symbol, 4+ characters.
      if (/^\s+$/.test(sep) && !(value.length >= 4 && /[\d\W_]/.test(value))) return m;
      return `${label}${sep}${R}`;
    },
  },
  // long random-looking strings (32+ characters mixing letters and digits)
  { kind: "token", re: /\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b/g },
  // payment card numbers: 13-19 digits (spaces or dashes allowed) that pass the Luhn check
  {
    kind: "card number",
    re: /\b\d(?:[ -]?\d){12,18}\b/g,
    replace: (m) => {
      const digits = m.replace(/\D/g, "");
      return digits.length >= 13 && digits.length <= 19 && luhn(digits) ? R : m;
    },
  },
];

/* Returns { text, redacted, kinds } — kinds lists what was found (for the reminder). */
export function redactSecrets(input) {
  let text = String(input ?? "");
  const kinds = new Set();
  for (const rule of RULES) {
    text = text.replace(rule.re, (...args) => {
      const out = rule.replace ? rule.replace(...args) : R;
      if (out !== args[0]) kinds.add(rule.kind);
      return out;
    });
  }
  return { text, redacted: kinds.size > 0, kinds: [...kinds] };
}

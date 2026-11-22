// Detects passwords, keys, card numbers and ID numbers. Used by memory (refuse to
// store them), style notes (drop them) and the action log (redact them).
const SENSITIVE_WORDS =
  /\b(pass ?words?|passcodes?|pin (?:codes?|numbers?|is)|my pin|(?:door|alarm|gate|safe|locker|garage|lock) codes?|lock combination|api ?keys?|secret keys?|access tokens?|auth tokens?|private keys?|credit cards?|debit cards?|card numbers?|cvv|cvc|security codes?|social security|ssn|passport (?:number|no)|driver'?s? licen[cs]e|licen[cs]e number|national id|id number|tax id|bank account number|routing number|iban|seed phrase|recovery phrase)\b/i;
const KEY_LIKE = /\b(AC[0-9a-f]{32}|SK[0-9a-f]{32}|[0-9a-f]{32}|sk[-_][a-z0-9_-]{12,}|sk-ant-[a-z0-9_-]+|ghp_[a-z0-9]{20,}|xox[abp]-[a-z0-9-]+|AKIA[A-Z0-9]{16}|eyJ[a-z0-9_-]{10,}\.[a-z0-9_-]{10,})/i;
const SSN = /\b\d{3}[- ]\d{2}[- ]\d{4}\b/;

function luhn(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
}

/** True if the text looks like a password, key, card number or ID number. Checked in code, not by Claude. */
export function isSensitive(text) {
  const t = String(text || "");
  if (SENSITIVE_WORDS.test(t) || KEY_LIKE.test(t) || SSN.test(t)) return true;
  for (const m of t.matchAll(/(?:\d[ -]?){12,19}/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return true; // card number
  }
  if (/\b\d{9,}\b/.test(t.replace(/[ -]/g, ""))) {
    // Long bare number next to an ID-ish word
    if (/\b(id|account|license|licence|passport|policy|member(?:ship)?)\b/i.test(t)) return true;
  }
  return false;
}


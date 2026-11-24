// The do-not-call list (data/dnc.json, local only). When someone on a call says stop, don't
// call again, or asks to be removed, their number goes here and is never dialed again. Only the
// last 4 digits and a keyed hash are kept, never the full number. Checked on every call.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../config.js";
import { logAction } from "../logger.js";
import { last4, numberKey } from "./policy.js";

const file = () => path.join(process.env.JERICHO_DATA_DIR || path.join(ROOT, "data"), "dnc.json");

export function listDnc() {
  try {
    const data = JSON.parse(fs.readFileSync(file(), "utf8"));
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

/** Is this number on the do-not-call list? (Matched by its keyed hash.) */
export function isDoNotCall(number) {
  const key = numberKey(number);
  return Boolean(key) && listDnc().some((e) => e.key === key);
}

export function addDoNotCall(number, reason = "asked not to be called") {
  const key = numberKey(number);
  if (!key) return false;
  const entries = listDnc();
  if (entries.some((e) => e.key === key)) return false;
  entries.push({ key, last4: last4(number), addedAt: new Date().toISOString(), reason: String(reason).slice(0, 120) });
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  const tmp = `${file()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ entries }, null, 2)}\n`);
  fs.renameSync(tmp, file());
  logAction("dnc_added", { number: last4(number), reason });
  return true;
}

// What people say when they don't want calls: checked in code on every reply, as well as by the agent.
const STOP_WORDS =
  /\b(stop calling|don'?t call|do not call|never call|quit calling|no more calls|remove (?:me|my number|this number|us)|take (?:me|my number|us|this number) off|put (?:me|us) on (?:your|the|a) do[- ]not[- ]call|unsubscribe|lose my number|leave me alone)\b/i;
/** Did they ask to stop or not be called again? */
export function wantsNoCalls(heard) {
  const t = String(heard || "").trim();
  return STOP_WORDS.test(t) || /^(?:please\s+)?stop\b[.!]?/i.test(t);
}

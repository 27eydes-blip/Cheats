// Append-only action log: one JSON object per line.
import fs from "node:fs";
import path from "node:path";
import { ROOT, secrets, settings } from "./config.js";
import { isSensitive } from "./secrets.js";

const logPath = path.resolve(ROOT, settings.logFile || "logs/actions.log");
fs.mkdirSync(path.dirname(logPath), { recursive: true });

// Exact values from .env (keys, your own phone number) are blanked wherever they appear.
const envValues = Object.values(secrets)
  .filter((v) => typeof v === "string" && v.length >= 6)
  .flatMap((v) => (/^\+?[\d\s()-]+$/.test(v) ? [v, v.replace(/\D/g, "")] : [v]));

export function scrubEnvValues(text) {
  let out = String(text);
  for (const v of envValues) if (v && out.includes(v)) out = out.split(v).join("[private]");
  return out;
}

/** Replace any string that looks like a password, key, card or ID number. */
function redact(value) {
  if (typeof value === "string") return isSensitive(value) ? "[redacted: looked like a secret]" : scrubEnvValues(value);
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v)]));
  return value;
}

export function logAction(type, details = {}) {
  const entry = { time: new Date().toISOString(), type, ...redact(details) };
  try {
    fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
  } catch (err) {
    console.error("Could not write action log:", err.message);
  }
  const { time: _t, type: _y, ...shown } = entry;
  console.log(`[log] ${type}`, JSON.stringify(shown));
}

export { logPath };

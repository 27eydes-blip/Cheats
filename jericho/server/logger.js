// Append-only action log: one JSON object per line.
import fs from "node:fs";
import path from "node:path";
import { ROOT, settings } from "./config.js";

const logPath = path.resolve(ROOT, settings.logFile || "logs/actions.log");
fs.mkdirSync(path.dirname(logPath), { recursive: true });

export function logAction(type, details = {}) {
  const entry = { time: new Date().toISOString(), type, ...details };
  try {
    fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
  } catch (err) {
    console.error("Could not write action log:", err.message);
  }
  console.log(`[log] ${type}`, JSON.stringify(details));
}

export { logPath };

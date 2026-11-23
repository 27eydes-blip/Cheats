// Loads settings.json (non-secret, safe to edit) and .env (secrets).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Load .env without a dependency (Node >= 20.12). Real env vars win.
try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch {
  /* no .env file: rely on the real environment */
}

export function expandHome(p) {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

export function loadSettings() {
  const file = process.env.JERICHO_SETTINGS || path.join(ROOT, "settings.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export const settings = loadSettings();

export const secrets = {
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  elevenLabsKey: process.env.ELEVENLABS_API_KEY || "",
  // The pre-rename variable is still honoured so an existing .env doesn't silently
  // turn the access token off.
  accessToken: process.env.JERICHO_ACCESS_TOKEN || process.env.JARVIS_ACCESS_TOKEN || "",
  // Phone calls (Twilio). Read here only; never sent to the browser or written to logs.
  twilioSid: process.env.TWILIO_ACCOUNT_SID || "",
  twilioToken: process.env.TWILIO_AUTH_TOKEN || "",
  twilioNumber: process.env.TWILIO_PHONE_NUMBER || "",
  myPhoneNumber: process.env.MY_PHONE_NUMBER || "",
  // Morning briefing calendar (a private iCal link). Listed here so it's scrubbed from logs.
  calendarIcsUrl: process.env.CALENDAR_ICS_URL || "",
  calendarIcsUrlFromSettings: settings.briefing?.calendarIcsUrl || "",
};
if (!process.env.JERICHO_ACCESS_TOKEN && process.env.JARVIS_ACCESS_TOKEN) {
  console.warn("⚠️  Rename JARVIS_ACCESS_TOKEN to JERICHO_ACCESS_TOKEN in .env (the old name still works for now).");
}

// The only settings the browser ever sees. No keys in here.
export function publicConfig() {
  return {
    assistantName: settings.assistantName,
    wakeWords: settings.wakeWords,
    endPhrases: settings.endPhrases || [],
    conversationTimeoutSeconds: settings.conversationTimeoutSeconds ?? 30,
    speechLang: settings.speechLang,
    elevenLabsEnabled: Boolean(secrets.elevenLabsKey),
    bargeIn: {
      enabled: settings.bargeIn?.enabled !== false,
      minLevel: Number(settings.bargeIn?.minLevel) > 0 ? Number(settings.bargeIn.minLevel) : 0.15,
      minMs: Number(settings.bargeIn?.minMs) > 0 ? Number(settings.bargeIn.minMs) : 270,
      calibrateMs: Number(settings.bargeIn?.calibrateMs) >= 0 ? Number(settings.bargeIn?.calibrateMs ?? 1000) : 1000,
    },
  };
}
